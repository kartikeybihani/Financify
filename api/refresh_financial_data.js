// /api/refresh_financial_data.js
import { client } from "../lib/api/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import { verifyItemOwnership, verifyAuth } from "../lib/api/auth.js";
import { refreshAndStoreRecurringForItem } from "../lib/plaid/recurringRefresh.js";
import { fetchStockSnapshot } from "../lib/stocks.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";
import { getTriggersForUser } from "../lib/notificationDecisionEngine.js";
import { sendNotificationsForUser } from "../lib/notificationSender.js";

const BIGGEST_MOVER_CRON_SECRET = process.env.BIGGEST_MOVER_CRON_SECRET;

export default async function handler(req, res) {
  // GET ?mode=biggest_mover — cron-only (Finnhub refresh + create triggers + send). Weekdays 4PM ET via Supabase pg_cron.
  // Optional: ?user_id=UUID to run for a single user (for testing).
  if (req.method === "GET" && req.query?.mode === "biggest_mover") {
    const secret =
      req.headers["x-cron-secret"] ||
      (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!BIGGEST_MOVER_CRON_SECRET || secret !== BIGGEST_MOVER_CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const testUserId =
      typeof req.query?.user_id === "string" && req.query.user_id.trim()
        ? req.query.user_id.trim()
        : null;
    return runBiggestMoverDaily(res, { testUserId });
  }

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
      // Get user from Authorization header token (same as other endpoints)
      const { user, error: authError } = await verifyAuth(req);
      if (authError || !user) {
        console.error("❌ Auth verification failed:", authError);
        return res.status(401).json({ error: "Unauthorized" });
      }
      actualUserId = user.id;

      // If user_id was provided in body, verify it matches authenticated user
      if (user_id && user_id !== user.id) {
        return res.status(403).json({
          error: "Forbidden: Cannot access another user's data",
        });
      }
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

    // 2) Get access token from Vault (only needed for Plaid refresh types)
    let access_token = null;
    if (refresh_type !== "stock_prices") {
      const { data: token, error: tokenErr } = await supabase.rpc(
        "secure_get_plaid_token",
        {
          p_item_id: item_id,
          p_user_id: actualUserId,
        }
      );
      if (tokenErr || !token) {
        console.error("Vault token fetch failed:", tokenErr);
        return res.status(404).json({ error: "Access token not found" });
      }
      access_token = token;
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
            "id, user_id, snaptrade_user_id, account_id, symbol, symbol_id, units, price, market_value, previous_market_value, day_change, day_change_percent, last_updated, security_type, description"
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
          // Helper: is this symbol a cash equivalent? (Don't call FinHub for these - no price data)
          const cashEquivalentSymbols = [
            "SPAXX",
            "SPRXX",
            "FZFXX",
            "FDRXX",
            "SNAXX",
          ];
          const isCashEquivalent = (h) => {
            const symbol = h.symbol?.toUpperCase();
            const securityType = h.security_type?.toLowerCase() || "";
            const description = h.description?.toLowerCase() || "";
            if (cashEquivalentSymbols.includes(symbol)) return true;
            if (
              securityType.includes("money market") ||
              securityType.includes("cash") ||
              description.includes("money market") ||
              description.includes("cash equivalent")
            )
              return true;
            return false;
          };

          // Symbols to fetch from FinHub only (exclude cash equivalents - they stay in holdings, we just don't call FinHub)
          const allUniqueSymbols = [
            ...new Set(holdings.map((h) => h.symbol).filter(Boolean)),
          ];
          const symbolsToFetchFromFinhub = allUniqueSymbols.filter((sym) => {
            const h = holdings.find((x) => x.symbol === sym);
            if (!h) return true;
            if (isCashEquivalent(h)) {
              console.log(
                `💰 Skipping FinHub for cash equivalent: ${sym} (kept in holdings)`
              );
              return false;
            }
            return true;
          });
          console.log(
            `📊 Found ${holdings.length} holdings, ${
              symbolsToFetchFromFinhub.length
            } symbols to fetch from FinHub (${
              allUniqueSymbols.length - symbolsToFetchFromFinhub.length
            } cash equivalents - not fetched, kept as-is)`
          );

          // Batch fetch prices from Finnhub (rate limit: 60 calls/min on free tier)
          const priceMap = new Map();
          const BATCH_DELAY = 1100; // 1.1s between calls to stay under rate limit
          const symbolErrors = []; // Track individual symbol failures

          for (let i = 0; i < symbolsToFetchFromFinhub.length; i++) {
            const symbol = symbolsToFetchFromFinhub[i];
            try {
              const snapshot = await fetchStockSnapshot(symbol);
              if (snapshot?.current != null) {
                priceMap.set(symbol, snapshot.current);
                console.log(`✅ ${symbol}: $${snapshot.current.toFixed(2)}`);
              } else {
                console.warn(`⚠️ No price data for ${symbol}`);
                symbolErrors.push(`${symbol}: No price data available`);
              }

              // Rate limit: wait between calls (except last one)
              if (i < symbolsToFetchFromFinhub.length - 1) {
                await new Promise((resolve) =>
                  setTimeout(resolve, BATCH_DELAY)
                );
              }
            } catch (error) {
              // Non-blocking: log error but continue with other symbols
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              console.error(`❌ Error fetching price for ${symbol}:`, errorMsg);
              symbolErrors.push(`${symbol}: ${errorMsg}`);
              // Continue to next symbol - don't fail entire operation
            }
          }

          console.log(
            `📈 Fetched prices for ${priceMap.size}/${symbolsToFetchFromFinhub.length} symbols`
          );

          // Update holdings with new prices (only those we got a price for; cash equivalents are left as-is)
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
          const holdingErrors = []; // Track individual holding update failures
          const updatesByAccount = new Map(); // Track which accounts need balance recalculation

          for (const holding of holdings) {
            try {
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
                // Non-blocking: log error but continue with other holdings
                console.error(
                  `❌ Failed to update holding ${holding.symbol}:`,
                  updateError
                );
                holdingErrors.push(`${holding.symbol}: ${updateError.message}`);
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
            } catch (error) {
              // Non-blocking: catch any unexpected errors for this holding
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              console.error(
                `❌ Unexpected error updating holding ${holding.symbol}:`,
                errorMsg
              );
              holdingErrors.push(`${holding.symbol}: ${errorMsg}`);
              // Continue to next holding - don't fail entire operation
            }
          }

          console.log(`✅ Updated ${updatedCount} holdings`);

          // Recalculate balances for affected accounts
          const recalculateBalances = async (
            userId,
            snaptradeUserId,
            accountId
          ) => {
            // Fetch holdings with market_value, unrealized_pl, and fields to detect cash equivalents
            const { data: holdings } = await supabase
              .from("investment_holdings")
              .select(
                "market_value, unrealized_pl, symbol, security_type, description"
              )
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_active", true);

            // Fetch options with market_value and unrealized_pl
            const { data: options } = await supabase
              .from("investment_options")
              .select("market_value, unrealized_pl")
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_active", true);

            // Same cash-equivalent detection as above (avoid double-counting cash when SPAXX etc. are in holdings)
            const cashEqSymbols = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];
            const isCashEq = (h) => {
              const sym = h.symbol?.toUpperCase();
              const st = (h.security_type || "").toLowerCase();
              const desc = (h.description || "").toLowerCase();
              if (cashEqSymbols.includes(sym)) return true;
              if (
                st.includes("money market") ||
                st.includes("cash") ||
                desc.includes("money market") ||
                desc.includes("cash equivalent")
              )
                return true;
              return false;
            };

            // Calculate total holdings value (sum of all market_values)
            let totalHoldingsValue = 0;
            let cashEquivalentInHoldings = 0;
            holdings?.forEach((h) => {
              totalHoldingsValue += h.market_value || 0;
              if (isCashEq(h)) cashEquivalentInHoldings += h.market_value || 0;
            });
            options?.forEach((o) => {
              totalHoldingsValue += o.market_value || 0;
            });

            // Calculate total unrealized P/L
            let totalUnrealizedPL = 0;
            holdings?.forEach((h) => {
              totalUnrealizedPL += h.unrealized_pl || 0;
            });
            options?.forEach((o) => {
              totalUnrealizedPL += o.unrealized_pl || 0;
            });

            // Fetch existing balance with all needed fields
            const { data: balance, error: balanceError } = await supabase
              .from("investment_balances")
              .select(
                "total_value, cash, previous_total_value, day_change, day_change_percent, last_updated"
              )
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_current", true)
              .maybeSingle();

            // If no balance exists, skip recalculation (account may not have been synced yet)
            if (balanceError || !balance) {
              console.warn(
                `⚠️ No balance found for account ${accountId}, skipping balance recalculation`
              );
              return;
            }

            // Get cash from existing balance (preserve from SnapTrade sync). Do not use buying_power.
            const cash = parseFloat(balance?.cash || 0) || 0;

            // Avoid double-counting: broker "cash" is often the same as SPAXX/sweep in holdings.
            // Add only the portion of cash not already represented by cash-equivalent holdings.
            const cashToAdd = Math.max(0, cash - cashEquivalentInHoldings);
            const newTotalValue = totalHoldingsValue + cashToAdd;

            // Apply day-boundary logic (same as SnapTrade sync)
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

            const existingLastUpdated = balance?.last_updated;
            const sameDay = isSameCalendarDayUTC(existingLastUpdated);

            // Determine previous_total_value for day_change calculation (same logic as SnapTrade sync)
            // CRITICAL: previous_total_value includes cash only (no buying_power)
            // Only update previous_total_value when rolling to a new day (same logic as holdings)
            // When a new day starts, set previous_total_value to PREVIOUS day's total_value (preserve baseline)
            let previousTotalValue;
            let previousTotalValueForStorage;

            if (sameDay) {
              // Same day: preserve baseline
              previousTotalValue =
                balance.previous_total_value ??
                balance.total_value ??
                newTotalValue;
              previousTotalValueForStorage = previousTotalValue;
            } else {
              // New day: use previous day's total_value as new baseline
              previousTotalValue = balance.total_value ?? newTotalValue;
              previousTotalValueForStorage = previousTotalValue;
            }

            // CRITICAL: Preserve day_change if total_value hasn't changed (prevents overwriting with 0 on repeated updates)
            const EPSILON = 0.01; // Small threshold for floating point comparison
            const existingTotalValue = balance?.total_value;
            const isTotalValueUnchanged =
              existingTotalValue != null &&
              Number.isFinite(existingTotalValue) &&
              Number.isFinite(newTotalValue) &&
              Math.abs(newTotalValue - existingTotalValue) < EPSILON;

            // Calculate day_change and day_change_percent
            let dayChange = balance?.day_change ?? null;
            let dayChangePercent = balance?.day_change_percent ?? null;

            // Only calculate day_change if we have a previous_total_value baseline
            if (
              previousTotalValue != null &&
              previousTotalValue !== undefined &&
              newTotalValue > 0
            ) {
              // Only compute new day_change if total_value actually changed
              if (isTotalValueUnchanged) {
                // Data unchanged: preserve existing day_change values
                dayChange = balance?.day_change ?? null;
                dayChangePercent = balance?.day_change_percent ?? null;
                console.log(
                  `🔄 Total value unchanged (${newTotalValue.toFixed(
                    2
                  )}), preserving day_change: $${(dayChange || 0).toFixed(
                    2
                  )} (${(dayChangePercent || 0).toFixed(2)}%)`
                );
              } else {
                // Data changed: calculate new day_change
                dayChange = newTotalValue - previousTotalValue;
                dayChangePercent =
                  previousTotalValue !== 0
                    ? (dayChange / previousTotalValue) * 100
                    : 0;
                console.log(
                  `✅ Calculated day_change: $${dayChange.toFixed(
                    2
                  )} (${dayChangePercent.toFixed(2)}%)`
                );
              }
            } else {
              // No previous value, preserve existing or set to null
              dayChange = balance?.day_change ?? null;
              dayChangePercent = balance?.day_change_percent ?? null;
              console.log(
                `⚠️ No previous value for day_change calculation. Using existing: $${
                  dayChange || 0
                }`
              );
            }

            // Calculate total_change_percent
            const totalChangePercent =
              newTotalValue > 0 ? (totalUnrealizedPL / newTotalValue) * 100 : 0;

            // Update balance with all calculated values
            const { error: updateError } = await supabase
              .from("investment_balances")
              .update({
                total_value: newTotalValue,
                day_change: dayChange,
                day_change_percent: dayChangePercent,
                previous_total_value: previousTotalValueForStorage,
                total_change: totalUnrealizedPL,
                total_change_percent: totalChangePercent,
                last_updated: now.toISOString(),
              })
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_current", true);

            if (updateError) {
              console.error(
                `❌ Failed to update balance for account ${accountId}:`,
                updateError
              );
              throw updateError;
            }
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

          // Build result message with partial success info
          const hasPartialFailures =
            symbolErrors.length > 0 || holdingErrors.length > 0;
          let message = "Stock prices updated successfully";
          if (hasPartialFailures) {
            message = `Stock prices updated with ${updatedCount} holdings (${symbolErrors.length} symbol fetch failures, ${holdingErrors.length} update failures)`;
          }

          results.stock_prices = {
            message,
            holdingsUpdated: updatedCount,
            accountsRecalculated: recalculatedCount,
            symbolsFetched: priceMap.size,
            totalSymbols: symbolsToFetchFromFinhub.length,
            symbolErrors: symbolErrors.length > 0 ? symbolErrors : undefined,
            holdingErrors: holdingErrors.length > 0 ? holdingErrors : undefined,
          };

          // Add individual errors to results.errors for visibility, but don't fail the operation
          if (symbolErrors.length > 0) {
            results.errors.push(
              `Some symbols failed to fetch: ${symbolErrors
                .slice(0, 5)
                .join(", ")}${
                symbolErrors.length > 5
                  ? ` (+${symbolErrors.length - 5} more)`
                  : ""
              }`
            );
          }
          if (holdingErrors.length > 0) {
            results.errors.push(
              `Some holdings failed to update: ${holdingErrors
                .slice(0, 5)
                .join(", ")}${
                holdingErrors.length > 5
                  ? ` (+${holdingErrors.length - 5} more)`
                  : ""
              }`
            );
          }
        }
      } catch (error) {
        // Only catch truly unexpected errors (e.g., database connection issues)
        // Individual symbol/holding failures are already handled above
        console.error(
          "❌ Stock prices refresh failed with unexpected error:",
          error
        );
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Stock prices refresh failed: ${errorMsg}`);
        results.stock_prices = {
          message: "Stock prices refresh failed",
          error: errorMsg,
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

/**
 * Cron-only: Finnhub batch refresh (no SnapTrade), then create one biggest-mover trigger per user (weekday 4PM ET).
 * One trigger per user per day; only for users with at least one active holding.
 * @param {Object} options - Optional. testUserId: run only for this user (for testing).
 */
async function runBiggestMoverDaily(res, options = {}) {
  const { testUserId } = options;
  const startedAt = new Date().toISOString();
  const result = {
    message: "Biggest mover daily completed",
    test_user_id: testUserId || undefined,
    holdings_updated: 0,
    triggers_created: 0,
    users_sent: 0,
    total_sent: 0,
    total_failed: 0,
    errors: [],
    started_at: startedAt,
    completed_at: null,
  };

  try {
    // 1) Fetch active holdings (all users, or single user when testing)
    let query = supabase
      .from("investment_holdings")
      .select(
        "id, user_id, snaptrade_user_id, account_id, symbol, symbol_id, units, price, market_value, previous_market_value, day_change, day_change_percent, last_updated, security_type, description"
      )
      .eq("is_active", true)
      .not("symbol", "is", null)
      .neq("symbol", "");
    if (testUserId) query = query.eq("user_id", testUserId);
    const { data: allHoldings, error: holdingsError } = await query;

    if (holdingsError) {
      result.errors.push(`Holdings fetch failed: ${holdingsError.message}`);
      result.completed_at = new Date().toISOString();
      return res.status(500).json(result);
    }

    if (!allHoldings || allHoldings.length === 0) {
      result.completed_at = new Date().toISOString();
      if (testUserId) result.message = "No active holdings for this user.";
      return res.status(200).json(result);
    }

    const cashEquivalentSymbols = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];
    const isCashEquivalent = (h) => {
      const symbol = h.symbol?.toUpperCase();
      const st = (h.security_type || "").toLowerCase();
      const desc = (h.description || "").toLowerCase();
      if (cashEquivalentSymbols.includes(symbol)) return true;
      if (
        st.includes("money market") ||
        st.includes("cash") ||
        desc.includes("money market") ||
        desc.includes("cash equivalent")
      )
        return true;
      return false;
    };

    const symbolsToFetch = [
      ...new Set(
        allHoldings
          .filter((h) => !isCashEquivalent(h))
          .map((h) => h.symbol)
          .filter(Boolean)
      ),
    ];

    const priceMap = new Map();
    const BATCH_DELAY = 1100;
    let finnhubSkipped = 0;
    for (let i = 0; i < symbolsToFetch.length; i++) {
      const symbol = symbolsToFetch[i];
      try {
        const snapshot = await fetchStockSnapshot(symbol);
        if (snapshot?.current != null) priceMap.set(symbol, snapshot.current);
        else finnhubSkipped++;
        if (i < symbolsToFetch.length - 1)
          await new Promise((r) => setTimeout(r, BATCH_DELAY));
      } catch {
        finnhubSkipped++;
      }
    }
    if (symbolsToFetch.length > 0) {
      console.log(
        `[biggest_mover] Finnhub: ${priceMap.size}/${
          symbolsToFetch.length
        } symbols${finnhubSkipped > 0 ? `, ${finnhubSkipped} skipped` : ""}`
      );
    }

    const now = new Date();
    const todayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const isSameCalendarDayUTC = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return (
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) ===
        todayUTC
      );
    };
    const EPSILON = 0.01;
    const updatesByAccount = new Map();
    let updatedCount = 0;

    for (const holding of allHoldings) {
      const newPrice = priceMap.get(holding.symbol);
      if (newPrice == null) continue;
      const currentMarketValue =
        holding.units && newPrice ? holding.units * newPrice : null;
      if (currentMarketValue == null) continue;

      const existingMarketValue = holding.market_value;
      const isUnchanged =
        existingMarketValue != null &&
        Number.isFinite(existingMarketValue) &&
        Number.isFinite(currentMarketValue) &&
        Math.abs(currentMarketValue - existingMarketValue) < EPSILON;

      let dayChange = holding.day_change;
      let dayChangePercent = holding.day_change_percent;
      let previousForStorage = holding.previous_market_value;

      if (!isUnchanged) {
        const baseline =
          holding.previous_market_value ?? holding.market_value ?? null;
        if (baseline != null && Number.isFinite(baseline)) {
          dayChange = currentMarketValue - baseline;
          dayChangePercent = baseline !== 0 ? (dayChange / baseline) * 100 : 0;
        }
        if (!isSameCalendarDayUTC(holding.last_updated)) {
          previousForStorage = holding.market_value ?? currentMarketValue;
        }
      }

      const { error: updateError } = await supabase
        .from("investment_holdings")
        .update({
          price: newPrice,
          market_value: currentMarketValue,
          day_change: dayChange,
          day_change_percent: dayChangePercent,
          previous_market_value: previousForStorage,
          last_updated: now.toISOString(),
        })
        .eq("id", holding.id);

      if (!updateError) {
        updatedCount++;
        if (holding.snaptrade_user_id && holding.account_id) {
          const key = `${holding.user_id}:${holding.snaptrade_user_id}:${holding.account_id}`;
          if (!updatesByAccount.has(key))
            updatesByAccount.set(key, {
              user_id: holding.user_id,
              snaptrade_user_id: holding.snaptrade_user_id,
              account_id: holding.account_id,
            });
        }
      }
    }

    result.holdings_updated = updatedCount;

    // Recalculate investment_balances for SnapTrade accounts that were updated
    for (const acc of updatesByAccount.values()) {
      try {
        const { data: holdings } = await supabase
          .from("investment_holdings")
          .select("market_value, symbol, security_type, description")
          .eq("user_id", acc.user_id)
          .eq("snaptrade_user_id", acc.snaptrade_user_id)
          .eq("account_id", acc.account_id)
          .eq("is_active", true);
        const { data: options } = await supabase
          .from("investment_options")
          .select("market_value")
          .eq("user_id", acc.user_id)
          .eq("snaptrade_user_id", acc.snaptrade_user_id)
          .eq("account_id", acc.account_id)
          .eq("is_active", true);
        const cashEq = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];
        const isCashEq = (h) =>
          cashEq.includes((h.symbol || "").toUpperCase()) ||
          (h.security_type || "").toLowerCase().includes("money market") ||
          (h.description || "").toLowerCase().includes("cash");
        let totalHoldings = 0;
        let cashInHoldings = 0;
        holdings?.forEach((h) => {
          totalHoldings += h.market_value || 0;
          if (isCashEq(h)) cashInHoldings += h.market_value || 0;
        });
        options?.forEach((o) => (totalHoldings += o.market_value || 0));
        const { data: balance } = await supabase
          .from("investment_balances")
          .select("total_value, cash, previous_total_value, last_updated")
          .eq("user_id", acc.user_id)
          .eq("snaptrade_user_id", acc.snaptrade_user_id)
          .eq("account_id", acc.account_id)
          .eq("is_current", true)
          .maybeSingle();
        if (!balance) continue;
        const cash = Math.max(
          0,
          (parseFloat(balance.cash) || 0) - cashInHoldings
        );
        const newTotal = totalHoldings + cash;
        const sameDay =
          balance.last_updated && isSameCalendarDayUTC(balance.last_updated);
        const prev =
          sameDay && balance.previous_total_value != null
            ? balance.previous_total_value
            : balance.total_value ?? newTotal;
        const dayCh = prev != null ? newTotal - prev : null;
        const dayChPct =
          prev != null && prev !== 0 ? (dayCh / prev) * 100 : null;
        await supabase
          .from("investment_balances")
          .update({
            total_value: newTotal,
            previous_total_value: prev,
            day_change: dayCh,
            day_change_percent: dayChPct,
            last_updated: now.toISOString(),
          })
          .eq("user_id", acc.user_id)
          .eq("snaptrade_user_id", acc.snaptrade_user_id)
          .eq("account_id", acc.account_id)
          .eq("is_current", true);
      } catch (e) {
        result.errors.push(`Balance recalc ${acc.account_id}: ${e?.message}`);
      }
    }

    // 2) Distinct users with holdings
    const userIds = [...new Set(allHoldings.map((h) => h.user_id))];
    const todayStart = new Date(todayUTC).toISOString();

    // 3) For each user: already have biggest_mover today? Pick biggest mover, create trigger
    const usersWithNewTrigger = [];
    for (const userId of userIds) {
      const userHoldings = allHoldings.filter((h) => h.user_id === userId);
      const withPriceMap = userHoldings
        .map((h) => ({
          ...h,
          newPrice: priceMap.get(h.symbol),
          newDayChangePercent: (() => {
            const p = priceMap.get(h.symbol);
            if (p == null) return h.day_change_percent;
            const mv = h.units && p ? h.units * p : null;
            if (mv == null) return h.day_change_percent;
            const base = h.previous_market_value ?? h.market_value ?? null;
            if (base == null || base === 0) return h.day_change_percent;
            return ((mv - base) / base) * 100;
          })(),
        }))
        .filter((r) => r.newPrice != null && r.newDayChangePercent != null);

      if (withPriceMap.length === 0) continue;

      const { data: existingToday } = await supabase
        .from("notification_triggers")
        .select("id")
        .eq("user_id", userId)
        .eq("trigger_type", "custom")
        .eq("trigger_metadata->>pattern_type", "biggest_mover")
        .gte("detected_at", todayStart)
        .limit(1);

      if (existingToday && existingToday.length > 0) continue;

      const best = withPriceMap.reduce((a, b) =>
        Math.abs(a.newDayChangePercent) >= Math.abs(b.newDayChangePercent)
          ? a
          : b
      );
      const direction = best.newDayChangePercent >= 0 ? "up" : "down";
      const pct = Math.abs(
        Number.isFinite(best.newDayChangePercent) ? best.newDayChangePercent : 0
      ).toFixed(1);
      const priceStr = (
        Number.isFinite(best.newPrice) ? best.newPrice : best.price
      ).toFixed(2);
      const patternDescription = `Your ${best.symbol} closed ${direction} ${pct}% today at $${priceStr}.`;

      const { data: inserted, error: insertErr } = await supabase
        .from("notification_triggers")
        .insert({
          user_id: userId,
          trigger_type: "custom",
          trigger_metadata: {
            pattern_type: "biggest_mover",
            symbol: best.symbol,
            direction,
            day_change_percent: best.newDayChangePercent,
            price: best.newPrice ?? best.price,
            pattern_description: patternDescription,
          },
          priority: 6,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertErr) {
        result.errors.push(`Trigger create ${userId}: ${insertErr.message}`);
        continue;
      }
      result.triggers_created++;
      usersWithNewTrigger.push(userId);
    }

    // 4) Send notifications for users we just created triggers for
    for (const userId of usersWithNewTrigger) {
      try {
        const triggersToSend = await getTriggersForUser(userId);
        const sendResult = await sendNotificationsForUser(
          userId,
          triggersToSend
        );
        result.users_sent++;
        result.total_sent += sendResult.sent;
        result.total_failed += sendResult.failed;
        if (sendResult.errors?.length)
          result.errors.push(
            ...sendResult.errors.map((e) => `${userId}: ${e.error || e}`)
          );
      } catch (e) {
        result.errors.push(`Send ${userId}: ${e?.message}`);
      }
    }

    result.completed_at = new Date().toISOString();
    console.log(
      `[biggest_mover] done holdings=${result.holdings_updated} triggers=${result.triggers_created} sent=${result.total_sent} failed=${result.total_failed}`
    );
    return res.status(200).json(result);
  } catch (err) {
    result.completed_at = new Date().toISOString();
    result.errors.push(err?.message || String(err));
    console.error("[biggest_mover] error:", err?.message || err);
    return res.status(500).json(result);
  }
}
