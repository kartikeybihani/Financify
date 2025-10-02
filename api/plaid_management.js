// /api/plaid_management.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";
import { Snaptrade } from "snaptrade-typescript-sdk";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Using service role key for backend operations
);

// Pick credentials based on environment
const isSandbox = process.env.SNAPTRADE_ENVIRONMENT === "sandbox";

const snaptrade = new Snaptrade({
  clientId: isSandbox
    ? process.env.SNAPTRADE_CLIENT_ID_DEV
    : process.env.SNAPTRADE_CLIENT_ID,
  consumerKey: isSandbox
    ? process.env.SNAPTRADE_CONSUMER_KEY_DEV
    : process.env.SNAPTRADE_CONSUMER_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, item_id, user_id, userId, userSecret } = req.body;
  const redirect_uri = "https://financify-redirect.com/oauth-complete";

  try {
    // ------------------------------
    // REMOVE ITEM MODE
    // ------------------------------
    if (mode === "remove_item") {
      console.log("🔄 Removing item:", { item_id });

      if (!item_id) {
        console.error("❌ Missing item_id in request");
        return res.status(400).json({ error: "Missing item_id" });
      }

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
        console.error(
          "❌ Error retrieving Plaid token from Vault:",
          tokenError
        );
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
    }

    // ------------------------------
    // SNAPTRADE MODE (handles both register and login)
    // ------------------------------
    if (mode === "snaptrade") {
      // If userId and userSecret are provided, this is a login request
      if (userId && userSecret) {
        try {
          // Login the user to get redirect URI
          const loginResponse =
            await snaptrade.authentication.loginSnapTradeUser({
              userId: userId,
              userSecret: userSecret,
              broker: "FIDELITY",
            });
          console.log("✅ Snaptrade Login Response: ", loginResponse);

          return res.status(200).json({
            redirectURI: loginResponse.data.redirectURI,
            sessionId: loginResponse.data.sessionId,
            environment: isSandbox ? "sandbox" : "production",
          });
        } catch (e) {
          console.error("Snaptrade login error:", e);
          return res
            .status(500)
            .json({ error: e.message || "Snaptrade login failed" });
        }
      }

      // If only user_id is provided, this is a registration request
      if (user_id) {
        try {
          // Register the user
          const registerResponse =
            await snaptrade.authentication.registerSnapTradeUser({
              userId: user_id,
            });
          console.log(
            "✅ Snaptrade Registration Response --->: ",
            registerResponse
          );

          return res.status(200).json({
            userId: registerResponse.data.userId,
            userSecret: registerResponse.data.userSecret,
            environment: isSandbox ? "sandbox" : "production",
          });
        } catch (e) {
          console.error("Snaptrade registration error:", e);
          return res
            .status(500)
            .json({ error: e.message || "Snaptrade registration failed" });
        }
      }

      // If neither condition is met, return error
      return res.status(400).json({
        error:
          "Missing required parameters. Provide either user_id for registration or userId+userSecret for login",
      });
    }

    // ------------------------------
    // SNAPTRADE ACCOUNTS MODE
    // ------------------------------
    if (mode === "snaptrade_accounts") {
      if (!userId || !userSecret) {
        return res.status(400).json({ error: "Missing userId or userSecret" });
      }

      try {
        console.log("🔄 Fetching SnapTrade accounts for user:", userId);
        const response = await snaptrade.accountInformation.listUserAccounts({
          userId: userId,
          userSecret: userSecret,
        });
        console.log("✅ Snaptrade Accounts Response: ", response);
        return res.status(200).json({
          accounts: response.data,
          environment: isSandbox ? "sandbox" : "production",
        });
      } catch (e) {
        console.error("Snaptrade accounts error:", e);
        return res
          .status(500)
          .json({ error: e.message || "Failed to fetch Snaptrade accounts" });
      }
    }

    // ------------------------------
    // SNAPTRADE HOLDINGS MODE
    // ------------------------------
    if (mode === "snaptrade_holdings") {
      const { accountId } = req.body;

      if (!userId || !userSecret || !accountId) {
        return res.status(400).json({
          error: "Missing userId, userSecret, or accountId",
        });
      }

      try {
        console.log("🔄 Fetching Snaptrade holdings for account:", accountId);

        const response = await snaptrade.accountInformation.getUserHoldings({
          accountId: accountId,
          userId: userId,
          userSecret: userSecret,
        });

        console.log("✅ Snaptrade Holdings Response:", response.data);

        return res.status(200).json({
          holdings: response.data,
          environment: isSandbox ? "sandbox" : "production",
        });
      } catch (e) {
        console.error("Snaptrade holdings error:", e);
        return res
          .status(500)
          .json({ error: e.message || "Failed to fetch Snaptrade holdings" });
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
        webhook: `${process.env.APP_BASE_URL}/api/webhook`,
        redirect_uri,
        access_token: access_token,
        update: { account_selection_enabled: true },
      });

      return res.status(200).json({ link_token: tokenData.link_token });
    }

    // ------------------------------
    // PLAID CREATE MODE (default)
    // ------------------------------
    const { data: tokenData } = await client.linkTokenCreate({
      user: { client_user_id: user_id },
      client_name: "Financify",
      products: ["auth"],
      required_if_supported_products: [
        "transactions",
        "liabilities",
        "investments",
      ],
      optional_products: [],
      additional_consented_products: [],
      country_codes: ["US"],
      language: "en",
      webhook: `${process.env.APP_BASE_URL}/api/webhook`,
      redirect_uri,
    });

    return res.status(200).json({ link_token: tokenData.link_token });
  } catch (err) {
    console.error(
      "❌ Error in plaid_management API:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      error:
        err.response?.data?.error_message ||
        err.message ||
        "Internal server error",
      details: err.response?.data || {},
    });
  }
}
