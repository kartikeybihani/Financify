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
    // 1) fetch token + cursor for this Item
    const { data: item, error: fetchErr } = await supabase
      .from("user_items")
      .select("access_token, transactions_cursor")
      .eq("item_id", item_id)
      .single();
    if (fetchErr || !item)
      return res.status(404).json({ error: "Item not found" });

    let cursor = item.transactions_cursor || null;
    let added = [],
      modified = [],
      removed = [];
    let hasMore = true;

    // 2) pull all pages
    while (hasMore) {
      const { data } = await client.transactionsSync({
        access_token: item.access_token,
        cursor, // null for first call, then the next_cursor returned by Plaid
        count: 500, // optional; max 500
        // options: { include_original_description: true } // optional
      });

      added.push(...data.added);
      modified.push(...data.modified);
      removed.push(...data.removed);

      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    // 3) save the new cursor only (no transaction storage)
    await supabase
      .from("user_items")
      .update({ transactions_cursor: cursor })
      .eq("item_id", item_id);

    // 4) return just what you need to the client
    return res.status(200).json({ added, modified, removed });
  } catch (e) {
    console.error("transactions_sync error", e.response?.data || e);
    return res
      .status(500)
      .json({ error: e.response?.data?.error_message || e.message });
  }
}
