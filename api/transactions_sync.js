// /api/transactions_sync.js
import { client } from "../app/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import {
  mapPlaidToAppCategory,
  isInternalTransfer,
} from "../lib/plaidCategoryMapper.js";
import { verifyItemOwnership } from "../lib/api/auth.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { item_id, user_id } = req.body;
  if (!item_id) return res.status(400).json({ error: "Missing item_id" });

  try {
    // 1) Verify user owns this item and get user_id + cursor in one query
    const {
      authorized,
      userId,
      error: authError,
    } = await verifyItemOwnership(req, item_id);

    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }

    const syncRateLimit = await checkRateLimit(req, {
      scope: "transactions_sync",
      userId,
      limit: 4,
      windowMs: 60 * 1000,
    });

    if (!syncRateLimit.allowed) {
      const retryAfter = formatRetryAfterSeconds(syncRateLimit.retryAfterMs);
      if (retryAfter > 0) {
        res.setHeader("Retry-After", retryAfter);
      }
      return res.status(429).json({
        error: "Too many manual sync attempts. Please wait a minute.",
        retry_after: retryAfter,
      });
    }

    // Fetch user_id and transactions_cursor together in one query for efficiency
    const { data: itemData, error: fetchErr } = await supabase
      .from("user_items")
      .select("user_id, transactions_cursor")
      .eq("item_id", item_id)
      .eq("user_id", userId) // Additional security: ensure user_id matches
      .single();

    if (fetchErr || !itemData) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 2) Get access token from Vault
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: userId,
      }
    );

    if (tokenErr || !access_token) {
      console.error("Vault token fetch failed:", tokenErr);
      return res.status(404).json({ error: "Access token not found" });
    }

    let cursor = itemData.transactions_cursor || null;
    let added = [],
      modified = [],
      removed = [];
    let hasMore = true;

    // 3) pull all pages
    while (hasMore) {
      const { data } = await client.transactionsSync({
        access_token: access_token,
        cursor, // null for first call, then the next_cursor returned by Plaid
        count: 500, // optional; max 500
        options: {
          include_original_description: true,
          include_personal_finance_category: true, // Ensure we get enhanced categories
        },
      });

      added.push(...data.added);
      modified.push(...data.modified);
      removed.push(...data.removed);

      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    // 4) Fetch user's categories to build name -> category_id map for ID-based linking
    const { data: userCategories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
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

    // 5) Get existing recurring streams for this account to check if transactions are recurring
    const { data: recurringStreams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select("stream_id, stream_type, transaction_ids, account_id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (streamsError) {
      console.error("Error fetching recurring streams:", streamsError);
    }

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

    // 6) Store transactions in database
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
        const recurringStreamId = streamData ? streamData.streamId : null;

        // Determine category and recurring status based on stream
        let newCategory = null;
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
        // Priority: newCategory (if set and not INTERNAL_TRANSFER) > top_category
        let categoryId = null;
        if (newCategory && newCategory !== "INTERNAL_TRANSFER") {
          // Look up category_id for user-set category (from stream or override)
          categoryId = categoryIdMap.get(newCategory) || categoryIdMap.get(newCategory.toLowerCase()) || null;
        } else if (!newCategory && mappedCategory.top && mappedCategory.top !== "INTERNAL_TRANSFER") {
          // Look up category_id for top_category (Plaid mapped category)
          categoryId = categoryIdMap.get(mappedCategory.top) || categoryIdMap.get(mappedCategory.top.toLowerCase()) || null;
        }
        // For INTERNAL_TRANSFER, categoryId stays null (not a real category)

        // Debug log for first few transactions with enhanced info
        if (added.length <= 3 || modified.length <= 3) {
          const logPrefix = detectedAsInternalTransfer
            ? "🔄 INTERNAL TRANSFER"
            : "🏷️ Category Mapping";
          console.log(
            `${logPrefix}: "${txn.name}" → Plaid Primary: "${
              primary || "N/A"
            }" → Detailed: "${detailed || "N/A"}" → Mapped: "${
              mappedCategory.top
            } > ${mappedCategory.sub}" → Final: "${
              newCategory || mappedCategory.top
            }" → category_id: ${categoryId || "null"} ${
              recurringStreamId ? `🔄 RECURRING (${streamData.streamType})` : ""
            }`
          );
        }

        return {
          user_id: userId,
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
          authorized_date: txn.authorized_date || null, // When transaction was authorized (when user actually made it)
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId, // Link to recurring stream if applicable
          if_recurring: ifRecurring, // Set recurring flag based on stream membership
          new_category: newCategory, // Only set for INTERNAL_TRANSFER or stream categories (legacy support)
          category_id: categoryId, // Set category_id for ID-based linking (preferred method)
        };
      });

      // IMPORTANT: We use a custom upsert strategy to protect user overrides
      // Strategy: For new transactions, set new_category from stream
      //           For existing transactions, only update if new_category is NULL
      // CRITICAL: If we can't fetch existing transactions, we MUST NOT set new_category
      //           from streams to avoid overwriting user overrides

      // First, get existing transactions to check which ones already have new_category, category_id, and if_recurring
      const plaidTxIds = rows.map((r) => r.plaid_transaction_id);
      const { data: existingTxs, error: fetchErr } = await supabase
        .from("transactions")
        .select(
          "plaid_transaction_id, new_category, category_id, if_recurring, recurring_stream_id"
        )
        .eq("user_id", userId)
        .in("plaid_transaction_id", plaidTxIds);

      // CRITICAL FIX: If fetch fails, we cannot safely set new_category or if_recurring from streams
      // because we don't know which transactions have user overrides or manual recurring flags.
      // We'll still set recurring_stream_id (safe - this is a fact), but skip new_category and if_recurring.
      const canSafelySetCategories =
        !fetchErr && existingTxs !== null && existingTxs !== undefined;

      if (fetchErr) {
        console.error(
          "⚠️ CRITICAL: Error fetching existing transactions to preserve user overrides:",
          fetchErr
        );
        console.error(
          "⚠️ Skipping new_category and if_recurring updates from streams to protect user data integrity"
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
          // If we can't verify existing overrides, we need to distinguish between:
          // 1. New transactions (not in database) - should include new_category and if_recurring
          // 2. Existing transactions (in database) - should omit to preserve existing values

          // Check if this transaction exists in the database by checking if it's in existingTxs
          // Note: existingTxs might be null/undefined if fetch failed, so we can't check membership
          // In this case, we must be conservative and omit fields for ALL transactions
          // to avoid overwriting existing user choices. New transactions will get their
          // categories set on the next successful sync.
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
          // New transaction - keep all fields including new_category and if_recurring from stream
          // No existing user choices to protect
          return updatedRow;
        }

        // Existing transaction - preserve user overrides
        const existingCategoryId = existingCategoryIdMap.get(row.plaid_transaction_id);
        
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
            updatedRow.category_id = categoryIdMap.get(existingCategory) || categoryIdMap.get(existingCategory.toLowerCase()) || null;
          } else {
            updatedRow.category_id = null; // INTERNAL_TRANSFER doesn't have a category_id
          }
        } else {
          // No user override - check if top_category indicates internal transfer
          // (mapper already detected it from Plaid categories)
          if (row.top_category === "INTERNAL_TRANSFER") {
            updatedRow.new_category = "INTERNAL_TRANSFER";
            updatedRow.category_id = null;
            updatedRow.if_recurring = "no";
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
        console.error("Transaction upsert error:", upsertErr);
        return res.status(500).json({ error: "Failed to save transactions" });
      }
    }

    // 6) Delete removed transactions
    if (removed.length) {
      await supabase
        .from("transactions")
        .delete()
        .in(
          "plaid_transaction_id",
          removed.map((r) => r.transaction_id)
        );
    }

    // 7) Save the new cursor and timestamp
    await supabase
      .from("user_items")
      .update({
        transactions_cursor: cursor,
        last_synced_at: new Date().toISOString(),
      })
      .eq("item_id", item_id);

    console.log(
      `✅ Sync complete: ${added.length} added, ${modified.length} modified, ${removed.length} removed`
    );

    // 8) Detect notification patterns (fire and forget - don't block response)
    // Always run pattern detection, even if no new transactions - analyzes last 60 days
    (async () => {
      try {
        const { detectNotificationPatterns } = await import(
          "../lib/notificationPatternDetection.js"
        );
        await detectNotificationPatterns(userId, added);
      } catch (error) {
        console.error("[TRANSACTIONS_SYNC] Pattern detection error:", error);
        // Non-critical, don't throw
      }
    })();

    // 9) Return transaction sync summary
    return res.status(200).json({
      message: "Sync complete",
      added: added.length,
      modified: modified.length,
      removed: removed.length,
    });
  } catch (e) {
    console.error("transactions_sync error", e.response?.data || e);
    return res
      .status(500)
      .json({ error: e.response?.data?.error_message || e.message });
  }
}
