// /api/remove_item.js
const { client } = require("../app/plaidClient.js");
const { supabase } = require("../app/lib/supabase/supabase.js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { user_id } = req.body;

  const { data, error: fetchError } = await supabase
    .from("user_tokens")
    .select("access_token")
    .eq("id", user_id)
    .single();

  if (fetchError || !data) {
    return res.status(404).json({ error: "User token not found" });
  }

  try {
    await client.itemRemove({ access_token: data.access_token });

    // Clear access token + item_id + flags
    const { error: deleteError } = await supabase
      .from("user_tokens")
      .delete()
      .eq("id", user_id);

    if (deleteError) throw deleteError;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(
      "Error removing Plaid item:",
      err.response?.data || err.message
    );
    return res.status(500).json({ error: err.message });
  }
};
