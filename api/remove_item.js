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

  const { user_id } = req.body;

  const { data, error: fetchError } = await supabase
    .from("user_items")
    .select("item_id")
    .eq("user_id", user_id)
    .single();

  console.log("data", data);

  if (fetchError || !data) {
    return res.status(404).json({ error: "User token not found" });
  }

  try {
    await client.itemRemove({ access_token: data.access_token });

    // Clear access token + item_id + flags
    const { error: deleteError } = await supabase
      .from("user_items")
      .delete()
      .eq("user_id", user_id);

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
