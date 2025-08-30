// /api/remove_item.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Using service role key for backend operations
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { item_id } = req.body;
  if (!item_id) {
    return res.status(400).json({ error: "Missing item_id" });
  }

  const { data, error: fetchError } = await supabase
    .from("user_items")
    .select("access_token")
    .eq("item_id", item_id)
    .single();

  console.log("data", data);

  if (fetchError || !data) {
    return res.status(404).json({ error: "Item not found" });
  }

  try {
    await client.itemRemove({ access_token: data.access_token });

    // Clear access token + item_id + flags for this specific item
    const { error: deleteError } = await supabase
      .from("user_items")
      .delete()
      .eq("item_id", item_id);

    console.log("deleteError", deleteError);
    if (deleteError) throw deleteError;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(
      "Error removing Plaid item:",
      err.response?.data || err.message
    );
    return res.status(500).json({ error: err.message });
  }
}
