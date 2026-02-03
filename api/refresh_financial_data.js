// /api/refresh_financial_data.js
import { client } from "../lib/api/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import { verifyItemOwnership } from "../lib/api/auth.js";
import { refreshAndStoreRecurringForItem } from "../lib/plaid/recurringRefresh.js";
import { fetchStockSnapshot } from "../lib/stocks.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const {
    item_id,
    user_id,
    refresh_type = "both",
    include_recurring = false,
  } = req.body;

  // Validate refresh_type
  const validRefreshTypes = [
    "balances",
    "transactions",
    "both",
    "recurring",
    "stock_prices",
  ];
  if (!validRefreshTypes.includes(refresh_type)) {
    return res.status(400).json({
      error:
        "Invalid refresh_type. Must be 'balances', 'transactions', 'both', 'recurring', or 'stock_prices'",
    });
  }

  // stock_prices doesn't need item_id - it works for all user's holdings
  if (refresh_type !== "stock_prices" && !item_id) {
    return res.status(400).json({ error: "Missing item_id" });
  }

  try {
    console.log(
      `🔄 Starting ${refresh_type} refresh${
        item_id ? ` for item_id: ${item_id}` : ""
      }`
    );

    // For stock_prices, get user_id from auth token instead of item_id
    let actualUserId = user_id;
    if (refresh_type === "stock_prices") {
      // Get user from auth token
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      actualUserId = user.id;
    } else {
      // 1) Verify user owns this item (authorization check)
      const {
        authorized,
        userId: verifiedUserId,
        error: authError,
      } = await verifyItemOwnership(req, item_id);

      if (!authorized) {
        return res
          .status(authError?.includes("Unauthorized") ? 401 : 403)
          .json({
            error: authError || "Access denied",
          });
      }
      actualUserId = verifiedUserId;
    }

    const refreshRateConfigs = {
      balances: { limit: 8, windowMs: 60 * 1000 },
      transactions: { limit: 4, windowMs: 2 * 60 * 1000 },
      recurring: { limit: 3, windowMs: 5 * 60 * 1000 },
      both: { limit: 3, windowMs: 5 * 60 * 1000 },
      stock_prices: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5 times per 10 minutes
    };

    const refreshRateLimit = await checkRateLimit(req, {
      scope: `refresh_financial_data:${refresh_type}`,
      userId: actualUserId,
      ...(refreshRateConfigs[refresh_type] || {
        limit: 4,
        windowMs: 2 * 60 * 1000,
      }),
    });

    if (!refreshRateLimit.allowed) {
      const retryAfter = formatRetryAfterSeconds(refreshRateLimit.retryAfterMs);
      if (retryAfter > 0) {
        res.setHeader("Retry-After", retryAfter);
      }
      return res.status(429).json({
        error: "Too many refresh attempts. Please wait before retrying.",
        retry_after: retryAfter,
      });
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
      recurring: null,
      stock_prices: null,
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

          const now = new Date().toISOString();
          const balanceUpdates = accounts.map((account) => ({
            account_id: account.account_id,
            item_id: item_id,
            current_balance: account.balances.current,
            available_balance: account.balances.available,
            last_balance_sync_at: now,
            balance_source: "plaid",
          }));

          // Batch upsert balances to minimize DB round-trips
          const { error: upsertError } = await supabase
            .from("accounts")
            .upsert(balanceUpdates, { onConflict: "account_id" });

          const successful = upsertError ? 0 : balanceUpdates.length;
          const failed = upsertError ? balanceUpdates.length : 0;

          if (upsertError) {
            console.error("Failed to batch update balances:", upsertError);
          }

          console.log(
            `✅ Balance update complete: ${successful} successful, ${failed} failed`
          );

          results.balances = {
            message: "Account balances refreshed successfully",
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

    // 5) Handle recurring transactions refresh
    if (refresh_type === "recurring" || include_recurring) {
      try {
        console.log("🔄 Refreshing recurring transactions...");

        const recurringResult = await refreshAndStoreRecurringForItem({
          supabase,
          plaidClient: client,
          accessToken: access_token,
          itemId: item_id,
          userId: actualUserId,
        });

        results.recurring = {
          message: "Recurring transactions refreshed and stored successfully",
          summary: recurringResult.summary,
          stored: recurringResult.stored,
          updated_transactions: recurringResult.updated_transactions,
        };
      } catch (error) {
        console.error("❌ Recurring transactions refresh failed:", error);
        results.errors.push(
          `Recurring transactions refresh failed: ${error.message}`
        );
        results.recurring = {
          message: "Recurring transactions refresh failed",
          error: error.message,
        };
      }
    }

    // 6) Handle stock prices refresh (updates prices from Finnhub API)
    if (refresh_type === "stock_prices") {
      try {
        console.log("📈 Refreshing stock prices from Finnhub...");

        // Get all unique active holdings with symbols for this user
        const { data: holdings, error: holdingsError } = await supabase
          .from("investment_holdings")
          .select(
            "id, user_id, snaptrade_user_id, account_id, symbol, symbol_id, units, price, market_value, previous_market_value, day_change, day_change_percent, last_updated"
          )
          .eq("user_id", actualUserId)
          .eq("is_active", true)
          .not("symbol", "is", null)
          .neq("symbol", "");

        if (holdingsError) {
          throw new Error(`Failed to fetch holdings: ${holdingsError.message}`);
        }

        if (!holdings || holdings.length === 0) {
          results.stock_prices = {
            message: "No holdings to update",
            updated: 0,
            symbolsFetched: 0,
          };
        } else {
          // Get unique symbols (deduplicate)
          const uniqueSymbols = [
            ...new Set(holdings.map((h) => h.symbol).filter(Boolean)),
          ];
          console.log(
            `📊 Found ${holdings.length} holdings with ${uniqueSymbols.length} unique symbols`
          );

          // Batch fetch prices from Finnhub (rate limit: 60 calls/min on free tier)
          const priceMap = new Map();
          const BATCH_DELAY = 1100; // 1.1s between calls to stay under rate limit

          for (let i = 0; i < uniqueSymbols.length; i++) {
            const symbol = uniqueSymbols[i];
            try {
              const snapshot = await fetchStockSnapshot(symbol);
              if (snapshot?.current != null) {
                priceMap.set(symbol, snapshot.current);
                console.log(`✅ ${symbol}: $${snapshot.current.toFixed(2)}`);
              } else {
                console.warn(`⚠️ No price data for ${symbol}`);
              }

              // Rate limit: wait between calls (except last one)
              if (i < uniqueSymbols.length - 1) {
                await new Promise((resolve) =>
                  setTimeout(resolve, BATCH_DELAY)
                );
              }
            } catch (error) {
              console.error(
                `❌ Error fetching price for ${symbol}:`,
                error.message
              );
            }
          }

          console.log(
            `📈 Fetched prices for ${priceMap.size}/${uniqueSymbols.length} symbols`
          );

          // Update holdings with new prices
          const now = new Date();
          const todayUTC = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate()
          );
          const isSameCalendarDayUTC = (dateStr) => {
            if (!dateStr) return false;
            const d = new Date(dateStr);
            const dayUTC = Date.UTC(
              d.getUTCFullYear(),
              d.getUTCMonth(),
              d.getUTCDate()
            );
            return dayUTC === todayUTC;
          };

          const EPSILON = 0.01;
          let updatedCount = 0;
          const updatesByAccount = new Map(); // Track which accounts need balance recalculation

          for (const holding of holdings) {
            const newPrice = priceMap.get(holding.symbol);
            if (newPrice == null) continue;

            const currentMarketValue =
              holding.units && newPrice ? holding.units * newPrice : null;
            if (currentMarketValue == null) continue;

            const existingMarketValue = holding.market_value;
            const isMarketValueUnchanged =
              existingMarketValue != null &&
              Number.isFinite(existingMarketValue) &&
              Number.isFinite(currentMarketValue) &&
              Math.abs(currentMarketValue - existingMarketValue) < EPSILON;

            // Calculate day_change (preserve if unchanged)
            const sameDay = isSameCalendarDayUTC(holding.last_updated);
            let dayChange = holding.day_change;
            let dayChangePercent = holding.day_change_percent;
            let previousMarketValueForStorage = holding.previous_market_value;

            if (!isMarketValueUnchanged) {
              const dayBaseline =
                holding.previous_market_value ?? holding.market_value ?? null;

              if (dayBaseline != null && Number.isFinite(dayBaseline)) {
                dayChange = currentMarketValue - dayBaseline;
                dayChangePercent =
                  dayBaseline !== 0 ? (dayChange / dayBaseline) * 100 : 0;
              }

              // Update previous_market_value on new day
              if (!sameDay) {
                previousMarketValueForStorage =
                  holding.market_value ?? currentMarketValue;
              }
            }

            // Update holding
            const { error: updateError } = await supabase
              .from("investment_holdings")
              .update({
                price: newPrice,
                market_value: currentMarketValue,
                day_change: dayChange,
                day_change_percent: dayChangePercent,
                previous_market_value: previousMarketValueForStorage,
                last_updated: now.toISOString(),
              })
              .eq("id", holding.id);

            if (updateError) {
              console.error(
                `❌ Failed to update holding ${holding.symbol}:`,
                updateError
              );
            } else {
              updatedCount++;
              // Track account for balance recalculation
              const key = `${holding.user_id}:${holding.snaptrade_user_id}:${holding.account_id}`;
              if (!updatesByAccount.has(key)) {
                updatesByAccount.set(key, {
                  user_id: holding.user_id,
                  snaptrade_user_id: holding.snaptrade_user_id,
                  account_id: holding.account_id,
                });
              }
            }
          }

          console.log(`✅ Updated ${updatedCount} holdings`);

          // Recalculate balances for affected accounts
          const recalculateBalances = async (
            userId,
            snaptradeUserId,
            accountId
          ) => {
            const { data: holdings } = await supabase
              .from("investment_holdings")
              .select("unrealized_pl")
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_active", true);

            const { data: options } = await supabase
              .from("investment_options")
              .select("unrealized_pl")
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_active", true);

            let totalUnrealizedPL = 0;
            holdings?.forEach(
              (h) => (totalUnrealizedPL += h.unrealized_pl || 0)
            );
            options?.forEach(
              (o) => (totalUnrealizedPL += o.unrealized_pl || 0)
            );

            const { data: balance } = await supabase
              .from("investment_balances")
              .select("total_value")
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_current", true)
              .single();

            const totalValue = balance?.total_value || 0;
            const totalChangePercent =
              totalValue > 0 ? (totalUnrealizedPL / totalValue) * 100 : 0;

            await supabase
              .from("investment_balances")
              .update({
                total_change: totalUnrealizedPL,
                total_change_percent: totalChangePercent,
                // NOTE: day_change/day_change_percent preserved (from balance sync)
                // NOTE: total_value preserved (includes cash from balance sync)
                last_updated: new Date().toISOString(),
              })
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_current", true);
          };

          let recalculatedCount = 0;
          for (const account of updatesByAccount.values()) {
            try {
              await recalculateBalances(
                account.user_id,
                account.snaptrade_user_id,
                account.account_id
              );
              recalculatedCount++;
            } catch (error) {
              console.error(
                `❌ Failed to recalculate balances for account ${account.account_id}:`,
                error
              );
            }
          }

          console.log(
            `✅ Recalculated balances for ${recalculatedCount} accounts`
          );

          results.stock_prices = {
            message: "Stock prices updated successfully",
            holdingsUpdated: updatedCount,
            accountsRecalculated: recalculatedCount,
            symbolsFetched: priceMap.size,
            totalSymbols: uniqueSymbols.length,
          };
        }
      } catch (error) {
        console.error("❌ Stock prices refresh failed:", error);
        results.errors.push(`Stock prices refresh failed: ${error.message}`);
        results.stock_prices = {
          message: "Stock prices refresh failed",
          error: error.message,
        };
      }
    }

    // 6) Return combined results
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

    if (plaidError?.error_code === "INSUFFICIENT_TRANSACTION_HISTORY") {
      return res.status(400).json({
        error:
          "Insufficient transaction history for recurring analysis. Need at least 180 days of data.",
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
