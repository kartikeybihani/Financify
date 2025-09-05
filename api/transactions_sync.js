// /api/transactions_sync.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // 4) Store transactions in database
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
        else if (txn.category && txn.category.length > 0) {
          category = txn.category[0];
        }

        // Enhanced merchant-based category detection
        const merchantName = (
          txn.merchant_name ||
          txn.name ||
          ""
        ).toLowerCase();
        if (!category || category === "GENERAL_MERCHANDISE") {
          if (merchantName.includes("amazon")) category = "ONLINE_SHOPPING";
          else if (
            merchantName.includes("uber") ||
            merchantName.includes("lyft")
          )
            category = "TRANSPORTATION";
          else if (
            merchantName.includes("starbucks") ||
            merchantName.includes("coffee")
          )
            category = "COFFEE_SHOPS";
          else if (
            merchantName.includes("mcdonalds") ||
            merchantName.includes("burger")
          )
            category = "FAST_FOOD";
          else if (
            merchantName.includes("target") ||
            merchantName.includes("walmart")
          )
            category = "DISCOUNT_STORES";
          else if (
            merchantName.includes("shell") ||
            merchantName.includes("exxon") ||
            merchantName.includes("chevron")
          )
            category = "GAS_STATIONS";
        }

        // Debug log for first few transactions with enhanced info
        if (added.length <= 3 || modified.length <= 3) {
          console.log(
            `🏷️ Enhanced: "${txn.name}" → Category: "${category}" (Merchant: "${
              txn.merchant_name || "N/A"
            }")`
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
          category: category,
          transaction_type: txn.payment_channel || null,
          pending: txn.pending ?? false,
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

    // 5) Delete removed transactions
    if (removed.length) {
      await supabase
        .from("transactions")
        .delete()
        .in(
          "plaid_transaction_id",
          removed.map((r) => r.transaction_id)
        );
    }

    // 6) Save the new cursor and timestamp
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

    // 7) Return transaction sync summary
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
