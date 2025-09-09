// /api/link_tokens.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";
import { Snaptrade } from "snaptrade-typescript-sdk";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pick credentials based on environment
const isSandbox = process.env.SNAPTRADE_ENVIRONMENT === "sandbox";

const snaptrade = new Snaptrade({
  clientId: isSandbox
    ? process.env.SNAPTRADE_CLIENT_ID
    : process.env.SNAPTRADE_CLIENT_ID_PROD,
  consumerKey: isSandbox
    ? process.env.SNAPTRADE_CONSUMER_KEY
    : process.env.SNAPTRADE_CONSUMER_KEY_PROD,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, item_id, user_id } = req.body;
  const redirect_uri = "https://financify-redirect.com/oauth-complete";

  try {
    // ------------------------------
    // SNAPTRADE MODE
    // ------------------------------
    if (mode === "snaptrade") {
      if (!user_id) {
        return res.status(400).json({ error: "Missing user_id" });
      }

      try {
        const response = await snaptrade.authentication.registerSnapTradeUser({
          userId: user_id,
        });
        console.log("✅ Snaptrade Response: ", response);
        return res.status(200).json({
          snaptrade: response.data,
          environment: isSandbox ? "sandbox" : "production",
        });
      } catch (e) {
        console.error("Snaptrade error:", e);
        return res
          .status(500)
          .json({ error: e.message || "Snaptrade registration failed" });
      }
    }

    // ------------------------------
    // PLAID UPDATE MODE
    // ------------------------------
    if (mode === "update" && item_id) {
      const { data: item, error } = await supabase
        .from("user_items")
        .select("item_id")
        .eq("item_id", item_id)
        .single();

      if (error || !item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const { data: access_token, error: tokenError } = await supabase.rpc(
        "secure_get_plaid_token",
        { p_item_id: item_id, p_user_id: user_id }
      );

      if (tokenError || !access_token) {
        console.error("Error retrieving Plaid token from Vault:", tokenError);
        return res.status(404).json({ error: "Access token not found" });
      }

      const { data: tokenData } = await client.linkTokenCreate({
        user: { client_user_id: user_id },
        client_name: "Financify",
        country_codes: ["US"],
        language: "en",
        webhook: "https://financify-rose.vercel.app/api/webhook",
        redirect_uri,
        access_token: access_token,
        update: { account_selection_enabled: true },
      });

      return res.status(200).json({ link_token: tokenData.link_token });
    }

    // ------------------------------
    // PLAID CREATE MODE
    // ------------------------------
    const { data: tokenData } = await client.linkTokenCreate({
      user: { client_user_id: user_id },
      client_name: "Financify",
      products: ["auth"],
      required_if_supported_products: ["transactions", "liabilities"],
      optional_products: [],
      additional_consented_products: [],
      country_codes: ["US"],
      language: "en",
      webhook: "https://financify-rose.vercel.app/api/webhook",
      redirect_uri,
    });

    return res.status(200).json({ link_token: tokenData.link_token });
  } catch (e) {
    const plaidError = e.response?.data;
    console.error("Link Token Creation Error:", plaidError || e.message);
    return res.status(500).json({
      error: plaidError?.error_message || e.message,
    });
  }
}
