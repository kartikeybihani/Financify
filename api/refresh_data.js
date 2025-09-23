// /api/refresh_data.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { item_id, user_id, refresh_type = "both" } = req.body;
  if (!item_id) return res.status(400).json({ error: "Missing item_id" });

  // Validate refresh_type
  const validRefreshTypes = ["balances", "transactions", "both"];
  if (!validRefreshTypes.includes(refresh_type)) {
    return res.status(400).json({
      error:
        "Invalid refresh_type. Must be 'balances', 'transactions', or 'both'",
    });
  }

  try {
    console.log(`🔄 Starting ${refresh_type} refresh for item_id: ${item_id}`);

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

    const results = {
      balances: null,
      transactions: null,
      errors: [],
    };

    // 3) Handle balance refresh
    if (refresh_type === "balances" || refresh_type === "both") {
      try {
        console.log("🏦 Refreshing account balances...");

        const balanceResponse = await client.accountsBalanceGet({
          access_token: access_token,
        });

        const accounts = balanceResponse.data.accounts;
        console.log(`✅ Retrieved balances for ${accounts.length} accounts`);

        if (accounts && accounts.length > 0) {
          console.log("💾 Updating account balances in database...");

          const balanceUpdates = accounts.map((account) => ({
            account_id: account.account_id,
            current_balance: account.balances.current,
            available_balance: account.balances.available,
          }));

          const { data: updateResults, error: batchError } = await supabase
            .from("accounts")
            .upsert(
              balanceUpdates.map(update => ({
                account_id: update.account_id,
                current_balance: update.current_balance,
                available_balance: update.available_balance,
              })),
              { 
                onConflict: 'account_id',
                ignoreDuplicates: true  // This prevents creating new records
              }
            )
            .select('account_id');

          let successful, failed;
          
          if (batchError) {
            console.error('Failed to batch update balances:', batchError);
            successful = 0;
            failed = accounts.length;
          } else {
            successful = updateResults?.length || 0;
            failed = accounts.length - successful;
          }

          console.log(
            `✅ Balance update complete: ${successful} successful, ${failed} failed`
          );

          results.balances = {
            message: failed > 0 ? "Balance update completed with some failures" : "Account balances refreshed successfully",
            updated: successful,
            failed: failed,
            total: accounts.length,
            balances: balanceUpdates.map((update) => ({
              account_id: update.account_id,
              current_balance: update.current_balance,
              available_balance: update.available_balance,
            })),
          };
        } else {
          results.balances = {
            message: "No accounts found to update",
            updated: 0,
            failed: 0,
            total: 0,
            balances: [],
          };
        }
      } catch (error) {
        console.error("❌ Balance refresh failed:", error);
        results.errors.push(`Balance refresh failed: ${error.message}`);
        results.balances = {
          message: "Balance refresh failed",
          updated: 0,
          failed: 0,
          total: 0,
          balances: [],
          error: error.message,
        };
      }
    }

    // 4) Handle transaction refresh
    if (refresh_type === "transactions" || refresh_type === "both") {
      try {
        console.log("📡 Calling Plaid transactions/refresh...");

        const refreshResponse = await client.transactionsRefresh({
          access_token: access_token,
        });

        console.log("✅ Refresh request sent to Plaid:", refreshResponse.data);

        // Update the refresh timestamp in our database
        await supabase
          .from("user_items")
          .update({
            last_refresh_requested_at: new Date().toISOString(),
          })
          .eq("item_id", item_id);

        results.transactions = {
          message: "Refresh initiated successfully",
          request_id: refreshResponse.data.request_id,
          note: "New transactions will be available via webhook soon",
        };
      } catch (error) {
        console.error("❌ Transaction refresh failed:", error);
        results.errors.push(`Transaction refresh failed: ${error.message}`);
        results.transactions = {
          message: "Transaction refresh failed",
          error: error.message,
        };
      }
    }

    // 5) Return combined results
    const hasErrors = results.errors.length > 0;
    const statusCode = hasErrors ? 207 : 200; // 207 = Multi-Status (partial success)

    return res.status(statusCode).json({
      message: `Refresh completed for ${refresh_type}`,
      refresh_type,
      results,
      errors: results.errors,
      success: !hasErrors,
    });
  } catch (error) {
    console.error(`❌ ${refresh_type} refresh failed:`, error);

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
