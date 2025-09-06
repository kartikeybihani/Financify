// /api/refresh_balances.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { item_id, user_id } = req.body;
  if (!item_id) return res.status(400).json({ error: "Missing item_id" });

  try {
    console.log(`🏦 Refreshing account balances for item_id: ${item_id}`);

    // 1) Look up user_id if not provided
    let actualUserId = user_id;
    if (!actualUserId) {
      const { data: item, error: userErr } = await supabase
        .from("user_items")
        .select("user_id")
        .eq("item_id", item_id)
        .single();

      if (userErr || !item) {
        return res.status(404).json({ error: "Item not found" });
      }
      actualUserId = item.user_id;
    }

    // 2) Get access token from Vault
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: actualUserId,
      }
    );

    if (tokenErr || !access_token) {
      console.error("Vault token fetch failed:", tokenErr);
      return res.status(404).json({ error: "Access token not found" });
    }

    // 3) Get fresh account balances from Plaid
    console.log("📡 Calling Plaid accounts/balance/get...");
    const balanceResponse = await client.accountsBalanceGet({
      access_token: access_token,
    });

    const accounts = balanceResponse.data.accounts;
    console.log(`✅ Retrieved balances for ${accounts.length} accounts`);

    // 4) Update account balances in Supabase
    if (accounts && accounts.length > 0) {
      console.log("💾 Updating account balances in database...");

      const balanceUpdates = accounts.map((account) => ({
        account_id: account.account_id,
        current_balance: account.balances.current,
        available_balance: account.balances.available,
        balance_as_of: new Date().toISOString(),
      }));

      // Update each account's balance
      const updatePromises = balanceUpdates.map(async (update) => {
        const { error } = await supabase
          .from("accounts")
          .update({
            current_balance: update.current_balance,
            available_balance: update.available_balance,
            balance_as_of: update.balance_as_of,
          })
          .eq("account_id", update.account_id);

        if (error) {
          console.error(
            `Failed to update balance for account ${update.account_id}:`,
            error
          );
          return {
            account_id: update.account_id,
            success: false,
            error: error.message,
          };
        }

        return { account_id: update.account_id, success: true };
      });

      const results = await Promise.all(updatePromises);
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      console.log(
        `✅ Balance update complete: ${successful} successful, ${failed} failed`
      );

      // 5) Return summary
      return res.status(200).json({
        message: "Account balances refreshed successfully",
        updated: successful,
        failed: failed,
        total: accounts.length,
        balances: balanceUpdates.map((update) => ({
          account_id: update.account_id,
          current_balance: update.current_balance,
          available_balance: update.available_balance,
        })),
      });
    } else {
      return res.status(200).json({
        message: "No accounts found to update",
        updated: 0,
        failed: 0,
        total: 0,
        balances: [],
      });
    }
  } catch (error) {
    console.error("❌ Balance refresh failed:", error);

    // Handle specific Plaid errors
    const plaidError = error.response?.data;
    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({
        error: "Item requires re-authentication",
        requires_update_mode: true,
      });
    }

    if (plaidError?.error_code === "RATE_LIMIT_EXCEEDED") {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again later.",
      });
    }

    return res.status(500).json({
      error: plaidError?.error_message || error.message,
    });
  }
}
