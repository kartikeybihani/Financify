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
  console.log("🔄 Removing item:", { item_id });

  if (!item_id) {
    console.error("❌ Missing item_id in request");
    return res.status(400).json({ error: "Missing item_id" });
  }

  try {
    // 1. Get user_id and verify item exists
    const { data: userItem, error: fetchError } = await supabase
      .from("user_items")
      .select("user_id, institution_name")
      .eq("item_id", item_id)
      .single();

    console.log("📋 User item lookup:", { userItem, fetchError });

    if (fetchError || !userItem) {
      console.error("❌ Item not found in database:", fetchError?.message);
      return res.status(404).json({ error: "Item not found" });
    }

    // 2. Get access_token from Vault
    console.log("🔑 Retrieving access token from Vault...");
    const { data: access_token, error: tokenError } = await supabase.rpc(
      "secure_get_plaid_token",
      { p_item_id: item_id, p_user_id: userItem.user_id }
    );

    if (tokenError || !access_token) {
      console.error("❌ Error retrieving Plaid token from Vault:", tokenError);
      return res.status(404).json({ error: "Access token not found" });
    }

    // 3. Remove item from Plaid
    console.log("🏦 Removing item from Plaid...");
    await client.itemRemove({ access_token });
    console.log("✅ Successfully removed item from Plaid");

    // 4. Remove access token from Vault
    console.log("🔐 Removing access token from Vault...");
    const { error: vaultDeleteError } = await supabase.rpc(
      "secure_delete_plaid_token",
      { p_item_id: item_id, p_user_id: userItem.user_id }
    );

    if (vaultDeleteError) {
      console.warn(
        "⚠️ Could not remove token from Vault:",
        vaultDeleteError.message
      );
      // Don't fail the whole operation if vault deletion fails
    } else {
      console.log("✅ Removed access token from Vault");
    }

    // 5. Delete from user_items (this will cascade delete accounts and transactions)
    console.log("🗑️ Removing item from database...");
    const { error: deleteError } = await supabase
      .from("user_items")
      .delete()
      .eq("item_id", item_id);

    if (deleteError) {
      console.error("❌ Database deletion failed:", deleteError);
      throw deleteError;
    }

    console.log("✅ Successfully removed item from database");
    console.log(
      `🎉 Item ${item_id} (${userItem.institution_name}) removed successfully`
    );

    return res.status(200).json({
      success: true,
      message: "Item removed successfully",
      removed_institution: userItem.institution_name,
    });
  } catch (err) {
    console.error(
      "❌ Error removing Plaid item:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      error:
        err.response?.data?.error_message ||
        err.message ||
        "Failed to remove item",
      details: err.response?.data || {},
    });
  }
}
