// /api/transactions_sync.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";
// Removed categoryMapping import - using database categories instead

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simple category mapping function
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

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { item_id } = req.body;
  if (!item_id) return res.status(400).json({ error: "Missing item_id" });

  try {
    // 1) Get user_id and cursor for this Item
    const { data: item, error: fetchErr } = await supabase
      .from("user_items")
      .select("user_id, transactions_cursor")
      .eq("item_id", item_id)
      .single();
    if (fetchErr || !item)
      return res.status(404).json({ error: "Item not found" });

    // 2) Get access token from Vault
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: item.user_id,
      }
    );

    if (tokenErr || !access_token) {
      console.error("Vault token fetch failed:", tokenErr);
      return res.status(404).json({ error: "Access token not found" });
    }

    let cursor = item.transactions_cursor || null;
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

    // 4) Get existing recurring streams for this account to check if transactions are recurring
    const { data: recurringStreams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select("stream_id, transaction_ids, account_id")
      .eq("user_id", item.user_id)
      .eq("is_active", true);

    if (streamsError) {
      console.error("Error fetching recurring streams:", streamsError);
    }

    // Create a map for quick lookup of transaction_id -> stream_id
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

    // 5) Store transactions in database
    if (added.length || modified.length) {
      const rows = [...added, ...modified].map((txn) => {
        // Enhanced category extraction with fallbacks
        let category = null;

        // Try detailed category first (if available)
        if (txn.personal_finance_category?.detailed) {
          category = txn.personal_finance_category.detailed;
        }
        // Then try primary category
        else if (txn.personal_finance_category?.primary) {
          category = txn.personal_finance_category.primary;
        }
        // Fallback to legacy category array (first item)
        else if (
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

        // Apply simple category mapping
        const simplifiedCategory = getSimplifiedCategory(category);

        // Check if this transaction is part of a recurring stream
        const recurringStreamId =
          transactionToStreamMap.get(txn.transaction_id) || null;

        // Debug log for first few transactions with enhanced info
        if (added.length <= 3 || modified.length <= 3) {
          console.log(
            `🏷️ Enhanced: "${
              txn.name
            }" → Original: "${category}" → Simplified: "${
              simplifiedCategory.top
            } > ${simplifiedCategory.sub}" (Merchant: "${
              txn.merchant_name || "N/A"
            }") ${recurringStreamId ? "🔄 RECURRING" : ""}`
          );
        }

        return {
          user_id: item.user_id,
          account_id: txn.account_id,
          plaid_transaction_id: txn.transaction_id,
          date: txn.date,
          amount: txn.amount,
          iso_currency_code: txn.iso_currency_code || null,
          name: txn.name || null,
          merchant_name: txn.merchant_name || null,
          category: category, // Keep original Plaid category
          top_category: simplifiedCategory.top, // New simplified top category
          sub_category: simplifiedCategory.sub, // New simplified sub category
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
          recurring_stream_id: recurringStreamId, // NEW: Link to recurring stream if applicable
        };
      });

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "plaid_transaction_id" });

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

    // 8) Return transaction sync summary
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
