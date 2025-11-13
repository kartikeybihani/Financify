// /api/scheduled-sync.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Only allow GET requests (for cron triggers)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
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
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: user_id,
      }
    );

    if (tokenErr || !access_token) {
      throw new Error(`Access token not found: ${tokenErr?.message}`);
    }

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
    }

    // Get existing recurring streams (is_active column exists in recurring_streams table)
    const { data: recurringStreams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select("stream_id, transaction_ids, account_id")
      .eq("user_id", user_id)
      .eq("is_active", true);

    const transactionToStreamMap = new Map();
    if (recurringStreams) {
      recurringStreams.forEach((stream) => {
        if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
          stream.transaction_ids.forEach((transactionId) => {
            transactionToStreamMap.set(transactionId, stream.stream_id);
          });
        }
      });
    }

    // Process and store transactions
    if (added.length || modified.length) {
      const rows = [...added, ...modified].map((txn) => {
        // Enhanced category extraction (same logic as original)
        let category = null;
        if (txn.personal_finance_category?.detailed) {
          category = txn.personal_finance_category.detailed;
        } else if (txn.personal_finance_category?.primary) {
          category = txn.personal_finance_category.primary;
        } else if (
          txn.personal_finance_category &&
          txn.personal_finance_category.length > 0
        ) {
          category = txn.personal_finance_category[0];
        }

        // Enhanced merchant-based category detection
        const merchantName = (
          txn.merchant_name ||
          txn.name ||
          ""
        ).toLowerCase();
        if (!category || category === "GENERAL_MERCHANDISE") {
          if (merchantName.includes("amazon"))
            category = "GENERAL_MERCHANDISE_ONLINE_SHOPPING";
          else if (
            merchantName.includes("uber") ||
            merchantName.includes("lyft")
          )
            category = "TRANSPORTATION_TAXIS_AND_RIDE_SHARES";
          else if (
            merchantName.includes("starbucks") ||
            merchantName.includes("coffee")
          )
            category = "FOOD_AND_DRINK_COFFEE";
          else if (
            merchantName.includes("mcdonalds") ||
            merchantName.includes("burger")
          )
            category = "FOOD_AND_DRINK_FAST_FOOD";
          else if (
            merchantName.includes("target") ||
            merchantName.includes("walmart")
          )
            category = "GENERAL_MERCHANDISE_SUPERSTORES";
          else if (
            merchantName.includes("shell") ||
            merchantName.includes("exxon") ||
            merchantName.includes("chevron")
          )
            category = "TRANSPORTATION_GAS";
        }

        // Apply simplified category mapping
        const simplifiedCategory = getSimplifiedCategory(category);
        const recurringStreamId =
          transactionToStreamMap.get(txn.transaction_id) || null;

        return {
          user_id: user_id,
          account_id: txn.account_id,
          plaid_transaction_id: txn.transaction_id,
          date: txn.date,
          amount: txn.amount,
          iso_currency_code: txn.iso_currency_code || null,
          name: txn.name || null,
          merchant_name: txn.merchant_name || null,
          category: category,
          top_category: simplifiedCategory.top,
          sub_category: simplifiedCategory.sub,
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId,
        };
      });

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "plaid_transaction_id" });

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

// Simplified category mapping function (copied from original)
function getSimplifiedCategory(plaidCategory) {
  if (!plaidCategory) {
    return { top: "Other", sub: "Other" };
  }

  const upperCategory = plaidCategory.toUpperCase();

  // Food-related mappings
  if (
    upperCategory.includes("FOOD") ||
    upperCategory.includes("RESTAURANT") ||
    upperCategory.includes("COFFEE")
  ) {
    if (
      upperCategory.includes("GROCERY") ||
      upperCategory.includes("SUPERMARKET")
    ) {
      return { top: "Groceries", sub: "Groceries" };
    }
    return { top: "Food", sub: "Dining Out" };
  }

  // Grocery specific
  if (
    upperCategory.includes("GROCERY") ||
    upperCategory.includes("SUPERMARKET")
  ) {
    return { top: "Groceries", sub: "Groceries" };
  }

  // Transportation
  if (
    upperCategory.includes("TRANSPORT") ||
    upperCategory.includes("GAS") ||
    upperCategory.includes("UBER") ||
    upperCategory.includes("LYFT")
  ) {
    return { top: "Transportation", sub: "Transportation" };
  }

  // Shopping
  if (
    upperCategory.includes("SHOPPING") ||
    upperCategory.includes("MERCHANDISE") ||
    upperCategory.includes("AMAZON")
  ) {
    return { top: "Shopping", sub: "Shopping" };
  }

  // Entertainment
  if (
    upperCategory.includes("ENTERTAINMENT") ||
    upperCategory.includes("MOVIE") ||
    upperCategory.includes("GAME")
  ) {
    return { top: "Entertainment", sub: "Entertainment" };
  }

  // Travel
  if (
    upperCategory.includes("TRAVEL") ||
    upperCategory.includes("FLIGHT") ||
    upperCategory.includes("HOTEL")
  ) {
    return { top: "Travel", sub: "Travel" };
  }

  // Income
  if (
    upperCategory.includes("INCOME") ||
    upperCategory.includes("WAGE") ||
    upperCategory.includes("SALARY")
  ) {
    return { top: "Income", sub: "Income" };
  }

  // Housing
  if (
    upperCategory.includes("RENT") ||
    upperCategory.includes("MORTGAGE") ||
    upperCategory.includes("UTILITIES")
  ) {
    return { top: "Housing", sub: "Housing" };
  }

  // Health & Fitness
  if (
    upperCategory.includes("HEALTH") ||
    upperCategory.includes("MEDICAL") ||
    upperCategory.includes("PHARMACY") ||
    upperCategory.includes("FITNESS")
  ) {
    return { top: "Health", sub: "Health" };
  }

  // Personal Care
  if (
    upperCategory.includes("PERSONAL_CARE") ||
    upperCategory.includes("BEAUTY") ||
    upperCategory.includes("HAIR")
  ) {
    return { top: "Personal Care", sub: "Personal Care" };
  }

  // Bills & Utilities
  if (
    upperCategory.includes("UTILITIES") ||
    upperCategory.includes("PHONE") ||
    upperCategory.includes("INTERNET")
  ) {
    return { top: "Bills & Utilities", sub: "Bills & Utilities" };
  }

  // Subscriptions
  if (
    upperCategory.includes("SUBSCRIPTION") ||
    upperCategory.includes("STREAMING")
  ) {
    return { top: "Subscriptions", sub: "Subscriptions" };
  }

  // Education
  if (
    upperCategory.includes("EDUCATION") ||
    upperCategory.includes("STUDENT") ||
    upperCategory.includes("SCHOOL")
  ) {
    return { top: "Education", sub: "Education" };
  }

  // Savings & Investments
  if (
    upperCategory.includes("INVESTMENT") ||
    upperCategory.includes("SAVINGS") ||
    upperCategory.includes("TRANSFER")
  ) {
    return { top: "Savings", sub: "Savings" };
  }

  // Default fallback
  return { top: "Other", sub: "Other" };
}
