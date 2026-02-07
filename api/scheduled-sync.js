// /api/scheduled-sync.js
import { supabase } from "../lib/api/supabase.js";
import {
  mapPlaidToAppCategory,
  isInternalTransfer,
} from "../lib/plaidCategoryMapper.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";
import { syncSnaptradeInvestments } from "../lib/snaptradeSync.js";

const SCHEDULED_SYNC_CRON_SECRET =
  process.env.SCHEDULED_SYNC_CRON_SECRET || process.env.BIGGEST_MOVER_CRON_SECRET;

/** Infer trigger_source from mode for sync_logs */
function getTriggerSource(mode) {
  return mode === "plaid_transactions" ? "supabase_cron" : "vercel_cron";
}

/** Insert sync run into sync_logs (success, partial, or failure) */
async function insertSyncLog(payload) {
  try {
    await supabase.from("sync_logs").insert(payload);
  } catch (e) {
    console.error("[scheduled-sync] Failed to insert sync_log:", e?.message);
  }
}

export default async function handler(req, res) {
  // Only allow GET requests (for cron triggers)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = new URL(
    req.url || "/",
    `http://${req.headers?.host || "localhost"}`
  );
  const mode = url.searchParams.get("mode") || "scheduled";

  // plaid_transactions is called by Supabase pg_cron; require cron secret
  if (mode === "plaid_transactions") {
    const secret =
      req.headers["x-cron-secret"] ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!SCHEDULED_SYNC_CRON_SECRET || secret !== SCHEDULED_SYNC_CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const cronRateLimit = await checkRateLimit(req, {
    scope: `scheduled_sync:${mode}`,
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
    // 1) Get all user items
    // Note: user_items table doesn't have is_active column, so we consider all items
    const { data: userItems, error: fetchError } = await supabase
      .from("user_items")
      .select("item_id, user_id, last_synced_at, last_automated_sync");

    if (fetchError) {
      console.error("❌ Error fetching user items:", fetchError);
      const completedAt = new Date().toISOString();
      await insertSyncLog({
        sync_type: mode,
        total_items: 0,
        successful_syncs: 0,
        failed_syncs: 0,
        error_details: { error: fetchError.message },
        error_summary: `Failed to fetch user items: ${fetchError.message}`,
        status: "failure",
        trigger_source: getTriggerSource(mode),
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: Math.round(
          (new Date(completedAt) - new Date(startedAt))
        ),
      });
      return res.status(500).json({ error: "Failed to fetch user items" });
    }

    if (!userItems || userItems.length === 0) {
      console.log("ℹ️ No user items found for syncing");
      const completedAt = new Date().toISOString();
      await insertSyncLog({
        sync_type: mode,
        total_items: 0,
        successful_syncs: 0,
        failed_syncs: 0,
        status: "success",
        trigger_source: getTriggerSource(mode),
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: Math.round(
          (new Date(completedAt) - new Date(startedAt))
        ),
      });
      return res.status(200).json({
        message: "No items to sync",
        synced: 0,
        errors: 0,
      });
    }

    const plaidItems = userItems.filter(
      (item) => !item.item_id.startsWith("snaptrade-")
    );
    const snaptradeItems = userItems.filter((item) =>
      item.item_id.startsWith("snaptrade-")
    );

    console.log(
      `📊 Found ${userItems.length} items (Plaid: ${plaidItems.length}, SnapTrade: ${snaptradeItems.length}) | mode=${mode}`
    );

    let results;
    if (mode === "weekly_balances") {
      results = await runWeeklyBalanceSync(plaidItems);
    } else if (mode === "plaid_transactions") {
      results = await runScheduledSync(plaidItems, []);
    } else if (mode === "snaptrade") {
      results = await runScheduledSync([], snaptradeItems);
    } else {
      results = await runScheduledSync(plaidItems, snaptradeItems);
    }

    // 3) Update global sync status in sync_logs table
    const completedAt = new Date().toISOString();
    const totalItemsForLog =
      mode === "weekly_balances"
        ? plaidItems.length
        : mode === "plaid_transactions"
          ? plaidItems.length
          : mode === "snaptrade"
            ? snaptradeItems.length
            : userItems.length;
    const status =
      results.errors > 0 && results.synced > 0
        ? "partial"
        : results.errors > 0
          ? "failure"
          : "success";
    await insertSyncLog({
      sync_type: mode,
      total_items: totalItemsForLog,
      successful_syncs: results.synced,
      failed_syncs: results.errors,
      error_details:
        results.errorDetails.length > 0 ? results.errorDetails : null,
      error_summary:
        results.errorDetails.length > 0
          ? results.errorDetails.map((e) => e.error || e).join("; ")
          : null,
      status,
      trigger_source: getTriggerSource(mode),
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: Math.round(
        (new Date(completedAt) - new Date(startedAt))
      ),
    });

    console.log(
      `✅ Scheduled sync complete: ${results.synced} successful, ${results.errors} failed`
    );

    return res.status(200).json({
      message:
        mode === "weekly_balances"
          ? "Weekly balance sync completed"
          : mode === "plaid_transactions"
            ? "Plaid transaction sync completed"
            : mode === "snaptrade"
              ? "SnapTrade sync completed"
              : "Scheduled sync completed",
      mode,
      total_items: totalItemsForLog,
      synced: results.synced,
      errors: results.errors,
      errorDetails: results.errorDetails,
    });
  } catch (error) {
    console.error("❌ Scheduled sync error:", error);
    const completedAt = new Date().toISOString();
    const mode =
      new URL(req.url || "/", `http://${req.headers?.host || "localhost"}`)
        .searchParams.get("mode") || "scheduled";
    await insertSyncLog({
      sync_type: mode,
      total_items: 0,
      successful_syncs: 0,
      failed_syncs: 0,
      error_details: { error: error.message, stack: error.stack },
      error_summary: error.message,
      status: "failure",
      trigger_source: getTriggerSource(mode),
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: Math.round(
        (new Date(completedAt) - new Date(startedAt))
      ),
    });
    return res.status(500).json({
      error: "Scheduled sync failed",
      details: error.message,
    });
  }
}

async function runScheduledSync(plaidItems, snaptradeItems) {
  const results = {
    synced: 0,
    errors: 0,
    errorDetails: [],
  };

  for (const item of plaidItems) {
    try {
      console.log(`🔄 Syncing item ${item.item_id} for user ${item.user_id}`);

      const syncResult = await syncItemTransactions(item.item_id, item.user_id);

      if (syncResult.success) {
        results.synced++;
        console.log(
          `✅ Successfully synced item ${item.item_id}: ${
            syncResult.added
          } added, ${syncResult.modified} modified, ${
            syncResult.removed
          } removed transactions, ${
            syncResult.derivedBalancesUpdated || 0
          } derived balances updated`
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

  for (const item of snaptradeItems) {
    try {
      console.log(
        `🔄 Syncing SnapTrade item ${item.item_id} for user ${item.user_id}`
      );

      const accountId = item.item_id.replace("snaptrade-", "");
      const { data: connection, error: connectionErr } = await supabase
        .from("snaptrade_connections")
        .select("snaptrade_user_id, account_id, is_active")
        .eq("user_id", item.user_id)
        .eq("account_id", accountId)
        .single();

      if (connectionErr || !connection) {
        throw new Error(
          `SnapTrade connection not found for account ${accountId}`
        );
      }

      if (!connection.is_active) {
        throw new Error(
          `SnapTrade connection inactive for account ${accountId}`
        );
      }

      // SnapTrade sync runs in-process on Vercel (Node.js has crypto.createHmac)
      // Retry logic for transient SnapTrade API errors
      let lastResult = null;
      const maxRetries = 3;
      let syncSuccessful = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        lastResult = await syncSnaptradeInvestments(
          item.user_id,
          connection.snaptrade_user_id,
          connection.account_id
        );

        if (lastResult.success) {
          syncSuccessful = true;
          break;
        }

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000;
          console.log(
            `⚠️ SnapTrade sync failed, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }

      if (!syncSuccessful) {
        throw new Error(
          lastResult?.error || "SnapTrade sync failed after retries"
        );
      }

      results.synced++;
      console.log(`✅ SnapTrade sync successful for ${item.item_id}`);
    } catch (error) {
      results.errors++;
      results.errorDetails.push({
        item_id: item.item_id,
        user_id: item.user_id,
        error: error.message,
      });
      console.error(
        `❌ SnapTrade sync failed for item ${item.item_id}:`,
        error
      );
    }
  }

  return results;
}

async function runWeeklyBalanceSync(plaidItems) {
  const results = {
    synced: 0,
    errors: 0,
    errorDetails: [],
  };

  const { client } = await import("../lib/api/plaidClient.js");

  for (const item of plaidItems) {
    try {
      const { data: access_token, error: tokenErr } = await supabase.rpc(
        "secure_get_plaid_token",
        {
          p_item_id: item.item_id,
          p_user_id: item.user_id,
        }
      );

      if (tokenErr || !access_token) {
        throw new Error(
          `Access token not found: ${
            tokenErr?.message || "Token is null/undefined"
          }`
        );
      }

      const balanceResponse = await client.accountsBalanceGet({
        access_token: access_token,
      });

      const accounts = balanceResponse.data.accounts || [];
      if (accounts.length > 0) {
        const balanceUpdates = accounts.map((account) => ({
          account_id: account.account_id,
          item_id: item.item_id,
          current_balance: account.balances.current,
          available_balance: account.balances.available,
          last_balance_sync_at: new Date().toISOString(),
          balance_source: "plaid",
        }));

        const { error: balanceErr } = await supabase
          .from("accounts")
          .upsert(balanceUpdates, { onConflict: "account_id" });

        if (balanceErr) {
          throw new Error(`Balance update failed: ${balanceErr.message}`);
        }
      }

      results.synced++;
    } catch (error) {
      results.errors++;
      results.errorDetails.push({
        item_id: item.item_id,
        user_id: item.user_id,
        error: error.message,
      });
      console.error(
        `❌ Weekly balance sync failed for ${item.item_id}:`,
        error
      );
    }
  }

  return results;
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
    const { client } = await import("../lib/api/plaidClient.js");

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

    // Fetch user's categories to build name -> category_id map for ID-based linking
    const { data: userCategories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (categoriesError) {
      console.error("Error fetching user categories:", categoriesError);
    }

    // Build category name -> category_id map (case-insensitive for matching)
    const categoryIdMap = new Map();
    if (userCategories) {
      userCategories.forEach((cat) => {
        // Store both exact name and lowercase for flexible matching
        categoryIdMap.set(cat.name, cat.id);
        categoryIdMap.set(cat.name.toLowerCase(), cat.id);
      });
    }

    // Fetch active merchant rules (category_rules) for priority matching
    const { data: merchantRules, error: rulesError } = await supabase
      .from("category_rules")
      .select("merchant_name, transaction_name, top_category_id, match_field")
      .eq("user_id", user_id)
      .eq("active", true);

    if (rulesError) {
      console.error("Error fetching merchant rules:", rulesError);
    }

    // Build merchant rules lookup map
    const merchantRulesMap = new Map();
    const transactionNameRulesMap = new Map();
    if (merchantRules) {
      merchantRules.forEach((rule) => {
        // top_category_id is actually the category_id (despite the confusing name)
        const categoryId = rule.top_category_id;
        const matchField = rule.match_field || "merchant_name";

        if (matchField === "merchant_name" && rule.merchant_name) {
          // Normalize merchant name for matching (case-insensitive)
          const key = rule.merchant_name.toLowerCase().trim();
          merchantRulesMap.set(key, categoryId);
        } else if (
          (matchField === "transaction_name" || !rule.merchant_name) &&
          rule.transaction_name
        ) {
          // Normalize transaction name for matching (case-insensitive)
          const key = rule.transaction_name.toLowerCase().trim();
          transactionNameRulesMap.set(key, categoryId);
        }
      });
    }

    // Get "Other" category ID for fallback
    const { data: otherCategory } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", user_id)
      .eq("name", "Other")
      .maybeSingle();

    const otherCategoryId = otherCategory?.id || null;

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

    // --- Pending → Posted metadata merge (Plaid uses delete + add, matched via pending_transaction_id) ---
    // Fetch metadata from removed (pending) transactions BEFORE delete, so we can copy user state
    // (is_reviewed, category_id, etc.) to the new posted transaction when it arrives in added.
    let removedExisting = [];
    const removedMetadata = new Map(); // plaid_transaction_id -> { is_reviewed, category_id, new_category, linked_goal_id, if_recurring }
    if (removed.length > 0) {
      const removedIds = removed.map((r) => r.transaction_id);
      const { data: removedTxs, error: removedFetchErr } = await supabase
        .from("transactions")
        .select(
          "plaid_transaction_id, is_reviewed, category_id, new_category, linked_goal_id, if_recurring, recurring_stream_id, amount, account_id, pending"
        )
        .eq("user_id", user_id)
        .in("plaid_transaction_id", removedIds);

      if (removedFetchErr) {
        console.error(
          "⚠️ Failed to fetch removed transactions for pending→posted merge:",
          removedFetchErr
        );
      } else if (removedTxs) {
        removedExisting = removedTxs;
        removedTxs.forEach((tx) => {
          removedMetadata.set(tx.plaid_transaction_id, {
            is_reviewed: tx.is_reviewed ?? false,
            category_id: tx.category_id ?? null,
            new_category: tx.new_category ?? null,
            linked_goal_id: tx.linked_goal_id ?? null,
            // Only copy if_recurring when user manually set it (not from stream)
            if_recurring:
              !tx.recurring_stream_id && tx.if_recurring === "yes"
                ? "yes"
                : null,
          });
        });
      }
    }

    // Initialize existingTxs outside the if block to prevent scope issues
    let existingTxs = [];

    // Process and store transactions
    if (added.length || modified.length) {
      const rows = [...added, ...modified].map((txn) => {
        // Extract Plaid categories with proper fallback hierarchy
        const primary = txn.personal_finance_category?.primary || null;
        const detailed = txn.personal_finance_category?.detailed || null;

        // Keep original category for reference (prefer detailed, fallback to primary)
        const category = detailed || primary || null;

        // Check if this is an internal transfer using both Plaid categories and transaction names/descriptions
        const detectedAsInternalTransfer = isInternalTransfer(
          primary,
          detailed,
          txn.name || null,
          txn.merchant_name || null,
          txn.original_description || null
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

        // Look up category_id from categories table
        // Priority: Merchant Rules > Internal Transfer > Stream Category > Plaid Category > Fallback to "Other"
        let categoryId = null;

        // Priority 1: Check merchant rules (highest priority for new transactions)
        if (!detectedAsInternalTransfer) {
          const merchantName = txn.merchant_name || null;
          const transactionName = txn.name || null;

          // Check merchant_name rules first
          if (merchantName) {
            const merchantKey = merchantName.toLowerCase().trim();
            const ruleCategoryId = merchantRulesMap.get(merchantKey);
            if (ruleCategoryId) {
              categoryId = ruleCategoryId;
            }
          }

          // If no merchant rule match, check transaction_name rules
          if (!categoryId && transactionName) {
            const transactionKey = transactionName.toLowerCase().trim();
            const ruleCategoryId = transactionNameRulesMap.get(transactionKey);
            if (ruleCategoryId) {
              categoryId = ruleCategoryId;
            }
          }
        }

        // Priority 2: Internal transfers don't get category_id (skip all other checks)
        if (detectedAsInternalTransfer) {
          categoryId = null; // Explicitly null for internal transfers
        }
        // Priority 3: Stream-based category (if no merchant rule matched)
        else if (
          !categoryId &&
          newCategory &&
          newCategory !== "INTERNAL_TRANSFER"
        ) {
          // Look up category_id for user-set category (from stream or override)
          categoryId =
            categoryIdMap.get(newCategory) ||
            categoryIdMap.get(newCategory.toLowerCase()) ||
            null;
        }
        // Priority 4: Plaid mapped category (if no merchant rule or stream match)
        else if (
          !categoryId &&
          !newCategory &&
          mappedCategory.top &&
          mappedCategory.top !== "INTERNAL_TRANSFER"
        ) {
          // Look up category_id for top_category (Plaid mapped category)
          categoryId =
            categoryIdMap.get(mappedCategory.top) ||
            categoryIdMap.get(mappedCategory.top.toLowerCase()) ||
            null;
        }

        // Priority 5: Fallback to "Other" if no match found (and not internal transfer)
        if (!categoryId && !detectedAsInternalTransfer && otherCategoryId) {
          categoryId = otherCategoryId;
        }

        const row = {
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
          new_category: newCategory, // Only set for INTERNAL_TRANSFER or stream categories (legacy support)
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId,
          if_recurring: ifRecurring, // Set recurring flag based on stream membership and internal transfer detection
          category_id: categoryId, // Set category_id for ID-based linking (preferred method)
          is_reviewed: false, // Default; overwritten below when pending→posted merge applies
          linked_goal_id: null, // Default; overwritten below when pending→posted merge applies
        };

        // Pending → Posted merge: copy user metadata from removed (pending) to new posted transaction
        const pendingId = txn.pending_transaction_id ?? null;
        if (pendingId && removedMetadata.has(pendingId)) {
          const meta = removedMetadata.get(pendingId);
          row.is_reviewed = meta.is_reviewed;
          if (meta.category_id != null) row.category_id = meta.category_id;
          if (meta.new_category != null) row.new_category = meta.new_category;
          if (meta.linked_goal_id != null) row.linked_goal_id = meta.linked_goal_id;
          if (meta.if_recurring === "yes") row.if_recurring = "yes";
        }

        return row;
      });

      // IMPORTANT: We use a custom upsert strategy to protect user overrides
      // Strategy: For new transactions, set new_category from internal transfer detection
      //           For existing transactions, only update if new_category is NULL
      // CRITICAL: If we can't fetch existing transactions, we MUST NOT set new_category
      //           to avoid overwriting user overrides

      // First, get existing transactions to check which ones already have new_category, category_id, and if_recurring
      const plaidTxIds = rows.map((r) => r.plaid_transaction_id);

      // CRITICAL: Validate account_ids exist before processing transactions
      const accountIds = [
        ...new Set(rows.map((r) => r.account_id).filter(Boolean)),
      ];
      if (accountIds.length > 0) {
        const { data: existingAccounts, error: accountsErr } = await supabase
          .from("accounts")
          .select("account_id")
          .in("account_id", accountIds)
          .eq("item_id", item_id);

        if (accountsErr) {
          throw new Error(
            `Failed to validate accounts: ${accountsErr.message}`
          );
        }

        const validAccountIds = new Set(
          existingAccounts?.map((a) => a.account_id) || []
        );
        const invalidRows = rows.filter(
          (r) => !validAccountIds.has(r.account_id)
        );

        if (invalidRows.length > 0) {
          const invalidAccountIds = [
            ...new Set(invalidRows.map((r) => r.account_id)),
          ];
          console.warn(
            `⚠️ Skipping ${
              invalidRows.length
            } transactions for deleted accounts (account_ids: ${invalidAccountIds.join(
              ", "
            )})`
          );
          // Filter out transactions with invalid account_ids instead of throwing error
          rows = rows.filter((r) => validAccountIds.has(r.account_id));
        }
      }

      const { data: fetchedExistingTxs, error: fetchErr } = await supabase
        .from("transactions")
        .select(
          "plaid_transaction_id, new_category, category_id, if_recurring, recurring_stream_id, amount, account_id, pending"
        )
        .eq("user_id", user_id)
        .in("plaid_transaction_id", plaidTxIds);

      existingTxs = fetchedExistingTxs || [];

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

      // Create maps of existing transactions with new_category, category_id, and if_recurring
      const existingCategoryMap = new Map();
      const existingCategoryIdMap = new Map();
      const existingRecurringMap = new Map();
      if (canSafelySetCategories) {
        existingTxs.forEach((tx) => {
          if (tx.new_category) {
            existingCategoryMap.set(tx.plaid_transaction_id, tx.new_category);
          }
          // Preserve existing category_id if set (user may have manually assigned)
          if (tx.category_id) {
            existingCategoryIdMap.set(tx.plaid_transaction_id, tx.category_id);
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
        const existingCategoryId = existingCategoryIdMap.get(
          row.plaid_transaction_id
        );

        if (existingCategoryId) {
          // User has set category_id - preserve it (highest priority)
          updatedRow.category_id = existingCategoryId;
          // If category_id exists, we don't need to set new_category (except for INTERNAL_TRANSFER)
          if (existingCategory === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.category_id = null; // INTERNAL_TRANSFER doesn't have a category_id
          } else {
            // Clear new_category since we're using category_id
            updatedRow.new_category = null;
          }
        } else if (existingCategory) {
          // User has overridden category via new_category - preserve it and look up category_id
          updatedRow.new_category = existingCategory;
          if (existingCategory !== "INTERNAL_TRANSFER") {
            // Try to look up category_id for the existing category name
            updatedRow.category_id =
              categoryIdMap.get(existingCategory) ||
              categoryIdMap.get(existingCategory.toLowerCase()) ||
              null;
          } else {
            updatedRow.category_id = null; // INTERNAL_TRANSFER doesn't have a category_id
          }
        } else {
          // No user override - check if top_category indicates internal transfer
          // (mapper already detected it from Plaid categories)
          if (row.top_category === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.category_id = null;
            updatedRow.if_recurring = "no"; // Internal transfers are not recurring
          } else {
            // No override - use the category_id we looked up in the row mapping
            // (already set in the row, just keep it)
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

    // removedExisting and removedMetadata built earlier (before processing added/modified)
    // Delete removed transactions
    if (removed.length) {
      const { error: deleteErr } = await supabase
        .from("transactions")
        .delete()
        .in(
          "plaid_transaction_id",
          removed.map((r) => r.transaction_id)
        );

      if (deleteErr) {
        throw new Error(`Transaction delete failed: ${deleteErr.message}`);
      }
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

    // Update derived balances based on transaction deltas (no paid balance call)
    const derivedBalancesUpdated = await updateDerivedBalances(
      user_id,
      added,
      modified,
      removed,
      existingTxs, // Now always defined (initialized as empty array if no added/modified)
      removedExisting
    );

    return {
      success: true,
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      derivedBalancesUpdated: derivedBalancesUpdated,
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

async function updateDerivedBalances(
  user_id,
  added,
  modified,
  removed,
  existingTxs,
  removedExisting
) {
  const existingMap = new Map();
  existingTxs.forEach((tx) => {
    existingMap.set(tx.plaid_transaction_id, tx);
  });

  removedExisting.forEach((tx) => {
    existingMap.set(tx.plaid_transaction_id, tx);
  });

  const deltas = new Map();
  const addDelta = (accountId, delta) => {
    if (!accountId || !Number.isFinite(delta)) return;
    deltas.set(accountId, (deltas.get(accountId) || 0) + delta);
  };

  added.forEach((txn) => {
    if (txn.pending === true) return;
    addDelta(txn.account_id, -Number(txn.amount || 0));
  });

  modified.forEach((txn) => {
    const prev = existingMap.get(txn.transaction_id);
    if (!prev) return;

    const prevPending = prev.pending === true;
    const nextPending = txn.pending === true;
    const prevAccount = prev.account_id;
    const prevAmount = Number(prev.amount || 0);
    const nextAccount = txn.account_id;
    const nextAmount = Number(txn.amount || 0);

    if (prevPending && nextPending) return;

    if (prevPending && !nextPending) {
      addDelta(nextAccount || prevAccount, -nextAmount);
      return;
    }

    if (!prevPending && nextPending) {
      addDelta(prevAccount || nextAccount, prevAmount);
      return;
    }

    if (prevAccount && nextAccount && prevAccount !== nextAccount) {
      addDelta(prevAccount, prevAmount);
      addDelta(nextAccount, -nextAmount);
      return;
    }

    addDelta(prevAccount || nextAccount, prevAmount - nextAmount);
  });

  removed.forEach((txn) => {
    const prev = existingMap.get(txn.transaction_id);
    if (!prev) return;
    if (prev.pending === true) return;
    addDelta(prev.account_id, Number(prev.amount || 0));
  });

  if (deltas.size === 0) return 0;

  let updated = 0;
  for (const [accountId, delta] of deltas.entries()) {
    const { data: accountRow, error: accountErr } = await supabase
      .from("accounts")
      .select("current_balance, available_balance")
      .eq("account_id", accountId)
      .single();

    if (accountErr || !accountRow) {
      console.error(
        "⚠️ Account not found for derived balance update:",
        accountId
      );
      continue;
    }

    const current = Number(accountRow.current_balance || 0) + delta;
    const updatePayload = {
      current_balance: current,
      balance_source: "derived",
    };

    if (
      accountRow.available_balance !== null &&
      accountRow.available_balance !== undefined
    ) {
      updatePayload.available_balance =
        Number(accountRow.available_balance) + delta;
    }

    const { error: updateErr } = await supabase
      .from("accounts")
      .update(updatePayload)
      .eq("account_id", accountId);

    if (updateErr) {
      console.error("⚠️ Failed derived balance update:", updateErr);
      continue;
    }

    updated++;
  }

  return updated;
}

// Category mapping is now handled by plaidCategoryMapper.js
