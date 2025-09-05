// /api/link_tokens.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, item_id, user_id } = req.body;
  const redirect_uri = "https://financify-redirect.com/oauth-complete";

  try {
    if (mode === "update" && item_id) {
      // 1. Check if the item exists
      const { data: item, error } = await supabase
        .from("user_items")
        .select("item_id")
        .eq("item_id", item_id)
        .single();

      if (error || !item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // 2. Get access_token from Vault
      const { data: access_token, error: tokenError } = await supabase.rpc(
        "secure_get_plaid_token",
        { p_item_id: item_id, p_user_id: user_id }
      );

      if (tokenError || !access_token) {
        console.error("Error retrieving Plaid token from Vault:", tokenError);
        return res.status(404).json({ error: "Access token not found" });
      }

      // 3. Create link_token in update mode, with account selection enabled
      const { data: tokenData } = await client.linkTokenCreate({
        user: { client_user_id: user_id },
        client_name: "Financify",
        country_codes: ["US"],
        language: "en",
        webhook: "https://financify-rose.vercel.app/api/webhook",
        redirect_uri,
        access_token: access_token,
        update: { account_selection_enabled: true },
        // Do NOT add `products` here unless you're explicitly adding restricted products like Assets, etc.
      });

      return res.status(200).json({ link_token: tokenData.link_token });
    } else {
      // CREATE MODE for adding a new bank (Item)
      const { data: tokenData } = await client.linkTokenCreate({
        user: { client_user_id: user_id },
        client_name: "Financify",
        products: ["auth"], // minimum default
        required_if_supported_products: ["transactions", "liabilities"],
        optional_products: [],
        additional_consented_products: [],
        country_codes: ["US"],
        language: "en",
        webhook: "https://financify-rose.vercel.app/api/webhook",
        redirect_uri,
      });

      return res.status(200).json({ link_token: tokenData.link_token });
    }
  } catch (e) {
    const plaidError = e.response?.data;
    console.error("Link Token Creation Error:", plaidError || e.message);
    return res.status(500).json({
      error: plaidError?.error_message || e.message,
    });
  }
}
