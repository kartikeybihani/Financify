// /api/scheduled-sync.js
import { supabase } from "../lib/api/supabase.js";
import {
  mapPlaidToAppCategory,
  isInternalTransferCategory,
} from "./utils/plaidCategoryMapper.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

export default async function handler(req, res) {
  // Only allow GET requests (for cron triggers)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Protect this endpoint with a shared secret so only your cron job can call it
  const cronSecretHeader =
    req.headers["x-cron-secret"] || req.headers["X-Cron-Secret"];
  const expectedCronSecret = process.env.CRON_SECRET;

  if (expectedCronSecret) {
    if (!cronSecretHeader || cronSecretHeader !== expectedCronSecret) {
      console.error("❌ Unauthorized scheduled-sync attempt");
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else {
    console.warn(
      "⚠️ CRON_SECRET not set - scheduled-sync endpoint is not protected (set this in Vercel env vars)"
    );
  }

  const cronRateLimit = await checkRateLimit(req, {
    scope: "scheduled_sync",
    userId: null,
    limit: 1,
    windowMs: 60 * 1000,
  });

  if (!cronRateLimit.allowed) {
    const retryAfter = formatRetryAfterSeconds(cronRateLimit.retryAfterMs);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", retryAfter);
    }
    return res.status(429).json({
      error: "Sync already running. Please wait before triggering again.",
      retry_after: retryAfter,
    });
  }

  console.log(
    "🔄 Starting scheduled transaction sync at",
    new Date().toISOString()
  );

  const startedAt = new Date().toISOString();

  try {
    // 1) Get all user items that need syncing
    // Note: user_items table doesn't have is_active column, so we sync all items
    const { data: userItems, error: fetchError } = await supabase
      .from("user_items")
      .select("item_id, user_id, last_synced_at, last_automated_sync");

    if (fetchError) {
      console.error("❌ Error fetching user items:", fetchError);
      return res.status(500).json({ error: "Failed to fetch user items" });
    }

    if (!userItems || userItems.length === 0) {
      console.log("ℹ️ No user items found for syncing");
      return res.status(200).json({
        message: "No items to sync",
        synced: 0,
        errors: 0,
      });
    }

    console.log(`📊 Found ${userItems.length} items to sync`);

    // 2) Sync each item
    const results = {
      synced: 0,
      errors: 0,
      errorDetails: [],
    };

    for (const item of userItems) {
      try {
        console.log(`🔄 Syncing item ${item.item_id} for user ${item.user_id}`);

        // Call the existing sync function logic (transactions + balances)
        const syncResult = await syncItemTransactions(
          item.item_id,
          item.user_id
        );

        if (syncResult.success) {
          results.synced++;
          console.log(
            `✅ Successfully synced item ${item.item_id}: ${
              syncResult.added
            } added, ${syncResult.modified} modified, ${
              syncResult.removed
            } removed transactions, ${
              syncResult.balancesUpdated || 0
            } balances updated`
          );
        } else {
          results.errors++;
          results.errorDetails.push({
            item_id: item.item_id,
            user_id: item.user_id,
            error: syncResult.error,
          });
          console.error(
            `❌ Failed to sync item ${item.item_id}:`,
            syncResult.error
          );
        }
      } catch (error) {
        results.errors++;
        results.errorDetails.push({
          item_id: item.item_id,
          user_id: item.user_id,
          error: error.message,
        });
        console.error(`❌ Error syncing item ${item.item_id}:`, error);
      }
    }

    // 3) Update global sync status in sync_logs table
    const completedAt = new Date().toISOString();
    await supabase.from("sync_logs").insert({
      sync_type: "scheduled",
      total_items: userItems.length,
      successful_syncs: results.synced,
      failed_syncs: results.errors,
      error_details:
        results.errorDetails.length > 0 ? results.errorDetails : null,
      started_at: startedAt,
      completed_at: completedAt,
    });

    console.log(
      `✅ Scheduled sync complete: ${results.synced} successful, ${results.errors} failed`
    );

    return res.status(200).json({
      message: "Scheduled sync completed",
      total_items: userItems.length,
      synced: results.synced,
      errors: results.errors,
      errorDetails: results.errorDetails,
    });
  } catch (error) {
    console.error("❌ Scheduled sync error:", error);
    return res.status(500).json({
      error: "Scheduled sync failed",
      details: error.message,
    });
  }
}

// Helper function to sync individual item transactions
async function syncItemTransactions(item_id, user_id) {
  try {
    // Update sync status to in_progress before starting
    const { error: statusError } = await supabase
      .from("user_items")
      .update({ sync_status: "in_progress" })
      .eq("item_id", item_id);

    if (statusError) {
      console.error(
        `⚠️ Failed to set sync_status to in_progress for ${item_id}:`,
        statusError
      );
      // Continue anyway - this is not critical
    }

    // Import the existing sync logic
    const { client } = await import("../app/plaidClient.js");

    // Get access token from Vault
    console.log(`🔑 Fetching access token from Vault for item ${item_id}...`);
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: user_id,
      }
    );

    if (tokenErr || !access_token) {
      console.error(`❌ Vault token fetch failed for item ${item_id}:`, {
        error: tokenErr,
        hasToken: !!access_token,
        item_id,
        user_id: user_id.substring(0, 8) + "...",
      });
      throw new Error(
        `Access token not found: ${
          tokenErr?.message || "Token is null/undefined"
        }`
      );
    }

    console.log(
      `✅ Access token retrieved successfully for item ${item_id} (token length: ${
        access_token?.length || 0
      })`
    );

    // Get current cursor
    const { data: item, error: fetchErr } = await supabase
      .from("user_items")
      .select("transactions_cursor")
      .eq("item_id", item_id)
      .single();

    if (fetchErr || !item) {
      throw new Error(`Item not found: ${fetchErr?.message}`);
    }

    let cursor = item.transactions_cursor || null;
    let added = [],
      modified = [],
      removed = [];
    let hasMore = true;

    // Pull all pages of transactions
    while (hasMore) {
      try {
        const { data } = await client.transactionsSync({
          access_token: access_token,
          cursor,
          count: 500,
          options: {
            include_original_description: true,
            include_personal_finance_category: true,
          },
        });

        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);

        hasMore = data.has_more;
        cursor = data.next_cursor;
      } catch (plaidError) {
        // Extract detailed error information from Plaid API response
        const plaidResponse = plaidError?.response?.data || {};
        const errorMessage =
          plaidResponse.error_message ||
          plaidResponse.error_code ||
          plaidError?.message ||
          "Unknown Plaid API error";
        const errorCode = plaidResponse.error_code || "UNKNOWN_ERROR";
        const errorType = plaidResponse.error_type || "API_ERROR";
        const requestId = plaidResponse.request_id || "N/A";

        console.error(`❌ Plaid API error for item ${item_id}:`, {
          errorCode,
          errorType,
          errorMessage,
          requestId,
          statusCode: plaidError?.response?.status,
          cursor: cursor?.substring(0, 50) + "...",
          fullError: JSON.stringify(plaidResponse),
        });

        throw new Error(
          `Plaid API error (${errorCode}): ${errorMessage} | Type: ${errorType} | Request ID: ${requestId}`
        );
      }
    }

    // Get existing recurring streams (is_active column exists in recurring_streams table)
    const { data: recurringStreams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select("stream_id, stream_type, transaction_ids, account_id")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (streamsError) {
      console.error("Error fetching recurring streams:", streamsError);
    }

    // Helper function to get category from stream type
    const getCategoryFromStreamType = (streamType) => {
      const mapping = {
        subscription: "Subscriptions",
        income: "Income",
        bill: "Housing", // TODO: Update if user wants different category
        other: "Other",
      };
      return mapping[streamType] || null;
    };

    // Create a map for quick lookup of transaction_id -> stream data
    const transactionToStreamMap = new Map();
    if (recurringStreams) {
      recurringStreams.forEach((stream) => {
        if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
          stream.transaction_ids.forEach((transactionId) => {
            transactionToStreamMap.set(transactionId, {
              streamId: stream.stream_id,
              streamType: stream.stream_type,
            });
          });
        }
      });
    }

    // Process and store transactions
    if (added.length || modified.length) {
      const rows = [...added, ...modified].map((txn) => {
        // Extract Plaid categories with proper fallback hierarchy
        const primary = txn.personal_finance_category?.primary || null;
        const detailed = txn.personal_finance_category?.detailed || null;

        // Keep original category for reference (prefer detailed, fallback to primary)
        const category = detailed || primary || null;

        // Check if this is an internal transfer based on Plaid categories
        const detectedAsInternalTransfer = isInternalTransferCategory(
          primary,
          detailed
        );

        // Apply comprehensive category mapping using both primary and detailed
        // (internal transfers will be detected and mapped to INTERNAL_TRANSFER)
        const mappedCategory = mapPlaidToAppCategory(primary, detailed);

        // Check if this transaction is part of a recurring stream
        const streamData = transactionToStreamMap.get(txn.transaction_id);
        const recurringStreamId = streamData?.streamId || null;

        // Set new_category if internal transfer detected (mapper returns INTERNAL_TRANSFER)
        let newCategory =
          detectedAsInternalTransfer ||
          mappedCategory.top === "INTERNAL_TRANSFER"
            ? "INTERNAL_TRANSFER"
            : null;

        // Determine recurring status
        let ifRecurring = "no"; // Default to 'no' instead of 'unknown'

        // Priority 1: Internal transfer detection (highest priority)
        if (detectedAsInternalTransfer) {
          newCategory = "INTERNAL_TRANSFER";
          // Internal transfers are not recurring (they're account movements)
          ifRecurring = "no";
        } else if (streamData) {
          // Priority 2: Transaction is part of a recurring stream
          ifRecurring = "yes";

          // Set category based on stream type (will be used as new_category)
          // Note: This will only be set if the transaction doesn't already have new_category
          const categoryFromStream = getCategoryFromStreamType(
            streamData.streamType
          );
          if (categoryFromStream && streamData.streamType !== "other") {
            newCategory = categoryFromStream;
          }
        }

        // If category is "Subscriptions", automatically mark as recurring
        // (Subscriptions are inherently recurring, even if not in a Plaid stream)
        // But skip if it's an internal transfer
        if (!detectedAsInternalTransfer) {
          const finalCategory = newCategory || mappedCategory.top;
          if (finalCategory === "Subscriptions") {
            ifRecurring = "yes";
          }
        }

        return {
          user_id: user_id,
          account_id: txn.account_id,
          plaid_transaction_id: txn.transaction_id,
          date: txn.date,
          amount: txn.amount,
          iso_currency_code: txn.iso_currency_code || null,
          name: txn.name || null,
          merchant_name: txn.merchant_name || null,
          category: category, // Keep original Plaid category (detailed or primary)
          top_category: mappedCategory.top, // Mapped top category
          sub_category: mappedCategory.sub, // Mapped sub category
          new_category: newCategory, // Set to INTERNAL_TRANSFER if detected
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId,
          if_recurring: ifRecurring, // Set recurring flag based on stream membership and internal transfer detection
        };
      });

      // IMPORTANT: We use a custom upsert strategy to protect user overrides
      // Strategy: For new transactions, set new_category from internal transfer detection
      //           For existing transactions, only update if new_category is NULL
      // CRITICAL: If we can't fetch existing transactions, we MUST NOT set new_category
      //           to avoid overwriting user overrides

      // First, get existing transactions to check which ones already have new_category and if_recurring
      const plaidTxIds = rows.map((r) => r.plaid_transaction_id);
      const { data: existingTxs, error: fetchErr } = await supabase
        .from("transactions")
        .select(
          "plaid_transaction_id, new_category, if_recurring, recurring_stream_id"
        )
        .eq("user_id", user_id)
        .in("plaid_transaction_id", plaidTxIds);

      // CRITICAL FIX: If fetch fails, we cannot safely set new_category or if_recurring
      // because we don't know which transactions have user overrides or manual recurring flags.
      const canSafelySetCategories =
        !fetchErr && existingTxs !== null && existingTxs !== undefined;

      if (fetchErr) {
        console.error(
          "⚠️ CRITICAL: Error fetching existing transactions to preserve user overrides:",
          fetchErr
        );
        console.error(
          "⚠️ Skipping new_category and if_recurring updates to protect user data integrity"
        );
      }

      // Create maps of existing transactions with new_category and if_recurring
      const existingCategoryMap = new Map();
      const existingRecurringMap = new Map();
      if (canSafelySetCategories) {
        existingTxs.forEach((tx) => {
          if (tx.new_category) {
            existingCategoryMap.set(tx.plaid_transaction_id, tx.new_category);
          }
          // Track if_recurring for transactions NOT in streams (user might have manually set it)
          if (!tx.recurring_stream_id && tx.if_recurring === "yes") {
            existingRecurringMap.set(tx.plaid_transaction_id, tx.if_recurring);
          }
        });
      }

      // Update rows to preserve existing new_category and if_recurring values
      const finalRows = rows.map((row) => {
        if (!canSafelySetCategories) {
          // If we can't verify existing overrides, omit user-modifiable fields
          // to avoid overwriting existing user choices
          const { new_category, if_recurring, ...rowWithoutUserFields } = row;
          return rowWithoutUserFields;
        }

        // We can safely verify - check if this is an existing transaction
        const existingTx = existingTxs.find(
          (tx) => tx.plaid_transaction_id === row.plaid_transaction_id
        );
        const isNewTransaction = !existingTx;

        // Preserve user overrides for existing transactions
        const existingCategory = existingCategoryMap.get(
          row.plaid_transaction_id
        );
        const existingRecurring = existingRecurringMap.get(
          row.plaid_transaction_id
        );

        const updatedRow = { ...row };

        if (isNewTransaction) {
          // New transaction - keep all fields including new_category from internal transfer detection
          // No existing user choices to protect
          return updatedRow;
        }

        // Existing transaction - preserve user overrides
        if (existingCategory) {
          // User has overridden this category - preserve it
          // This includes if user manually set INTERNAL_TRANSFER
          updatedRow.new_category = existingCategory;
        } else {
          // No user override - check if top_category indicates internal transfer
          // (mapper already detected it from Plaid categories)
          if (row.top_category === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.if_recurring = "no"; // Internal transfers are not recurring
          }
        }

        // Determine final category for recurring check
        const finalCategory =
          updatedRow.new_category || row.new_category || row.top_category;

        // If transaction is NOT in a stream but user manually set if_recurring = 'yes', preserve it
        if (!row.recurring_stream_id && existingRecurring === "yes") {
          updatedRow.if_recurring = existingRecurring;
        }
        // If transaction IS in a stream, if_recurring should be 'yes' (already set in row, safe to keep)
        // OR if category is "Subscriptions", automatically mark as recurring
        // BUT skip if it's an internal transfer
        else if (
          finalCategory === "Subscriptions" &&
          updatedRow.if_recurring !== "yes" &&
          updatedRow.new_category !== "INTERNAL_TRANSFER"
        ) {
          updatedRow.if_recurring = "yes";
        }

        return updatedRow;
      });

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(finalRows, { onConflict: "plaid_transaction_id" });

      if (upsertErr) {
        throw new Error(`Transaction upsert failed: ${upsertErr.message}`);
      }
    }

    // Delete removed transactions
    if (removed.length) {
      await supabase
        .from("transactions")
        .delete()
        .in(
          "plaid_transaction_id",
          removed.map((r) => r.transaction_id)
        );
    }

    // Update cursor, timestamps, and sync status
    const syncTimestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("user_items")
      .update({
        transactions_cursor: cursor,
        last_synced_at: syncTimestamp,
        last_automated_sync: syncTimestamp, // Track when automated sync last ran
        sync_status: "completed", // Update sync status
      })
      .eq("item_id", item_id);

    if (updateError) {
      throw new Error(
        `Failed to update sync status to completed: ${updateError.message}`
      );
    }

    // Sync account balances after transactions (balances change with transactions)
    let balancesUpdated = 0;
    try {
      console.log(`💰 Syncing account balances for item ${item_id}...`);
      const balanceResponse = await client.accountsBalanceGet({
        access_token: access_token,
      });

      const accounts = balanceResponse.data.accounts;
      if (accounts && accounts.length > 0) {
        const balanceUpdates = accounts.map((account) => ({
          account_id: account.account_id,
          item_id: item_id,
          current_balance: account.balances.current,
          available_balance: account.balances.available,
        }));

        const { error: balanceErr } = await supabase
          .from("accounts")
          .upsert(balanceUpdates, { onConflict: "account_id" });

        if (balanceErr) {
          console.error(
            `⚠️ Balance update failed for item ${item_id}:`,
            balanceErr
          );
        } else {
          balancesUpdated = balanceUpdates.length;
          console.log(
            `✅ Updated ${balancesUpdated} account balances for item ${item_id}`
          );
        }
      }
    } catch (balanceError) {
      // Don't fail the whole sync if balance update fails
      console.error(
        `⚠️ Balance sync failed for item ${item_id} (non-critical):`,
        balanceError.message
      );
    }

    return {
      success: true,
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      balancesUpdated: balancesUpdated,
    };
  } catch (error) {
    // Update sync status to error on failure
    // Use try-catch instead of .catch() since Supabase query builder doesn't support .catch()
    try {
      const { error: updateError } = await supabase
        .from("user_items")
        .update({ sync_status: "error" })
        .eq("item_id", item_id);

      if (updateError) {
        console.error("Failed to update sync status:", updateError);
      }
    } catch (updateError) {
      console.error("Failed to update sync status:", updateError);
    }

    return {
      success: false,
      error: error.message,
    };
  }
}

// Category mapping is now handled by plaidCategoryMapper.js
