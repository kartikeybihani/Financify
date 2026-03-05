// /api/refresh_financial_data.js
import { client } from "../lib/api/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import { verifyItemOwnership, verifyAuth } from "../lib/api/auth.js";
import { refreshAndStoreRecurringForItem } from "../lib/plaid/recurringRefresh.js";
import { fetchQuoteOnly } from "../lib/stocks.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";
import { getTriggersForUser } from "../lib/notificationDecisionEngine.js";
import {
  sendNotificationsForUser,
  generateNotificationContent,
} from "../lib/notificationSender.js";

const BIGGEST_MOVER_CRON_SECRET = process.env.BIGGEST_MOVER_CRON_SECRET;

export default async function handler(req, res) {
  // GET ?mode=biggest_mover — cron-only (Finnhub refresh + create triggers + send). Weekdays 4PM ET via Supabase pg_cron.
  // Optional: ?user_id=UUID to run for a single user (for testing).
  // Optional: ?force_send=1 when testing with user_id to create and send a trigger even if one already exists today.
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
    const forceSend =
      testUserId &&
      (req.query?.force_send === "1" || req.query?.force_send === "true");
    return runBiggestMoverDaily(res, { testUserId, forceSend });
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
          } else {
            const anchorRows = accounts.map((account) => ({
              user_id: actualUserId,
              item_id: item_id,
              account_id: account.account_id,
              account_type: account.type || null,
              account_subtype: account.subtype || null,
              anchor_current: account.balances.current,
              anchor_available: account.balances.available,
              anchor_limit: account.balances.limit ?? null,
              anchored_at: now,
              anchor_source: "plaid_manual",
            }));

            const { error: anchorErr } = await supabase
              .from("account_balance_anchors")
              .insert(anchorRows);
            if (anchorErr) {
              console.error("Failed to write balance anchors:", anchorErr);
            }
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
          // Store { current, prevClose } - prevClose is used for correct day_change vs previous trading day
          const priceMap = new Map();
          const BATCH_DELAY = 1100; // 1.1s between calls to stay under rate limit
          const symbolErrors = []; // Track individual symbol failures

          for (let i = 0; i < symbolsToFetchFromFinhub.length; i++) {
            const symbol = symbolsToFetchFromFinhub[i];
            try {
              const quote = await fetchQuoteOnly(symbol);
              if (quote?.current != null) {
                priceMap.set(symbol, {
                  current: quote.current,
                  prevClose: quote.prevClose ?? null,
                });
                const prevStr =
                  quote.prevClose != null
                    ? ` (prevClose: $${quote.prevClose.toFixed(2)})`
                    : "";
                console.log(`✅ ${symbol}: $${quote.current.toFixed(2)}${prevStr}`);
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
              const priceData = priceMap.get(holding.symbol);
              if (priceData == null) continue;
              const actualPrice =
                typeof priceData === "object" ? priceData.current : priceData;
              const prevClose =
                typeof priceData === "object" ? priceData.prevClose : null;

              if (actualPrice == null) continue;
              const currentMarketValue =
                holding.units && actualPrice ? holding.units * actualPrice : null;
              if (currentMarketValue == null) continue;

              const existingMarketValue = holding.market_value;

              // day_change: use Finnhub prevClose (previous trading day close) when available.
              // This fixes wrong day_change when DB baseline was stale (e.g. Snaptrade skipped).
              let dayChange = holding.day_change;
              let dayChangePercent = holding.day_change_percent;
              let previousMarketValueForStorage = holding.previous_market_value;

              if (prevClose != null && Number.isFinite(prevClose) && prevClose > 0) {
                // Finnhub provides prevClose - use it for correct day change
                const prevCloseMarketValue = holding.units * prevClose;
                dayChange = currentMarketValue - prevCloseMarketValue;
                dayChangePercent =
                  (dayChange / prevCloseMarketValue) * 100;
                previousMarketValueForStorage = prevCloseMarketValue;
              } else {
                // Fallback: no prevClose (e.g. some ETFs) - use DB baseline
                const dayBaseline =
                  holding.previous_market_value ?? holding.market_value ?? null;
                if (dayBaseline != null && Number.isFinite(dayBaseline)) {
                  dayChange = currentMarketValue - dayBaseline;
                  dayChangePercent =
                    dayBaseline !== 0 ? (dayChange / dayBaseline) * 100 : 0;
                }
                const sameDay = isSameCalendarDayUTC(holding.last_updated);
                if (!sameDay) {
                  previousMarketValueForStorage =
                    holding.market_value ?? currentMarketValue;
                }
              }

              // Update holding
              const { error: updateError } = await supabase
                .from("investment_holdings")
                .update({
                  price: actualPrice,
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

          // Recalculate balances for affected accounts (Plaid: snaptrade_user_id is null - use .is() not .eq())
          const snapIdFilter = (q, val) =>
            val == null ? q.is("snaptrade_user_id", null) : q.eq("snaptrade_user_id", val);

          const recalculateBalances = async (
            userId,
            snaptradeUserId,
            accountId
          ) => {
            let hQ = supabase
              .from("investment_holdings")
              .select(
                "market_value, unrealized_pl, day_change, symbol, security_type, description"
              )
              .eq("user_id", userId)
              .eq("account_id", accountId)
              .eq("is_active", true);
            hQ = snapIdFilter(hQ, snaptradeUserId);
            const { data: holdings } = await hQ;

            let optQ = supabase
              .from("investment_options")
              .select("market_value, unrealized_pl, day_change")
              .eq("user_id", userId)
              .eq("account_id", accountId)
              .eq("is_active", true);
            optQ = snapIdFilter(optQ, snaptradeUserId);
            const { data: options } = await optQ;

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
            // CRITICAL: Sum day_change from holdings - this is the source of truth
            let totalDayChangeFromHoldings = 0;
            holdings?.forEach((h) => {
              totalHoldingsValue += h.market_value || 0;
              if (isCashEq(h)) cashEquivalentInHoldings += h.market_value || 0;
              // Sum day_change from individual holdings (calculated by Finnhub price update)
              totalDayChangeFromHoldings += h.day_change || 0;
            });
            options?.forEach((o) => {
              totalHoldingsValue += o.market_value || 0;
              totalDayChangeFromHoldings += o.day_change || 0;
            });

            // Calculate total unrealized P/L
            let totalUnrealizedPL = 0;
            holdings?.forEach((h) => {
              totalUnrealizedPL += h.unrealized_pl || 0;
            });
            options?.forEach((o) => {
              totalUnrealizedPL += o.unrealized_pl || 0;
            });

            let balQ = supabase
              .from("investment_balances")
              .select(
                "total_value, cash, previous_total_value, day_change, day_change_percent, last_updated"
              )
              .eq("user_id", userId)
              .eq("account_id", accountId)
              .eq("is_current", true);
            balQ = snapIdFilter(balQ, snaptradeUserId);
            const { data: balance, error: balanceError } = await balQ.maybeSingle();

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

            // CRITICAL: Use day_change summed from holdings - this is the source of truth
            // Each holding's day_change is calculated by Finnhub price update based on previous_market_value
            // Balance day_change = SUM(holdings.day_change) - this ensures consistency
            let dayChange = totalDayChangeFromHoldings;
            let dayChangePercent = newTotalValue > 0 
              ? (dayChange / newTotalValue) * 100 
              : 0;
            
            console.log(
              `✅ Balance day_change computed from holdings: $${dayChange.toFixed(
                2
              )} (${dayChangePercent.toFixed(2)}%) from ${holdings?.length || 0} holdings`
            );

            // Calculate total_change_percent
            const totalChangePercent =
              newTotalValue > 0 ? (totalUnrealizedPL / newTotalValue) * 100 : 0;

            let updQ = supabase
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
              .eq("account_id", accountId)
              .eq("is_current", true);
            updQ = snapIdFilter(updQ, snaptradeUserId);
            const { error: updateError } = await updQ;

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
 * Persist biggest_mover run to biggest_mover_runs for debugging/monitoring.
 * @param {Object} result - Run result object
 * @param {'success'|'failure'} status
 */
async function logBiggestMoverRun(result, status) {
  try {
    result.completed_at = result.completed_at || new Date().toISOString();
    await supabase.from("biggest_mover_runs").insert({
      started_at: result.started_at,
      completed_at: result.completed_at,
      holdings_updated: result.holdings_updated,
      triggers_created: result.triggers_created,
      users_sent: result.users_sent,
      total_sent: result.total_sent,
      total_failed: result.total_failed,
      errors: result.errors,
      status,
    });
  } catch (e) {
    console.error("[biggest_mover] Failed to log run:", e?.message);
  }
}

/**
 * Cron-only: Finnhub batch refresh (no SnapTrade), then create one biggest-mover trigger per user (weekday 4PM ET).
 * One trigger per user per day; only for users with at least one active holding.
 * @param {Object} options - Optional. testUserId: run only for this user (for testing). forceSend: create/send trigger even if one exists today (manual test only).
 */
async function runBiggestMoverDaily(res, options = {}) {
  const { testUserId, forceSend } = options;
  const startedAt = new Date().toISOString();
  const result = {
    message: "Biggest mover daily completed",
    test_user_id: testUserId || undefined,
    force_send: forceSend || undefined,
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
      await logBiggestMoverRun(result, "failure");
      return res.status(500).json(result);
    }

    if (!allHoldings || allHoldings.length === 0) {
      result.completed_at = new Date().toISOString();
      if (testUserId) result.message = "No active holdings for this user.";
      await logBiggestMoverRun(result, "success");
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
        const quote = await fetchQuoteOnly(symbol);
        if (quote?.current != null) {
          priceMap.set(symbol, {
            current: quote.current,
            prevClose: quote.prevClose ?? null,
          });
        } else finnhubSkipped++;
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
    const updatesByAccount = new Map();
    let updatedCount = 0;

    for (const holding of allHoldings) {
      const priceData = priceMap.get(holding.symbol);
      if (priceData == null) continue;
      const actualPrice =
        typeof priceData === "object" ? priceData.current : priceData;
      const prevClose =
        typeof priceData === "object" ? priceData.prevClose : null;

      if (actualPrice == null) continue;
      const currentMarketValue =
        holding.units && actualPrice ? holding.units * actualPrice : null;
      if (currentMarketValue == null) continue;

      let dayChange = holding.day_change;
      let dayChangePercent = holding.day_change_percent;
      let previousForStorage = holding.previous_market_value;

      if (prevClose != null && Number.isFinite(prevClose) && prevClose > 0) {
        const prevCloseMarketValue = holding.units * prevClose;
        dayChange = currentMarketValue - prevCloseMarketValue;
        dayChangePercent = (dayChange / prevCloseMarketValue) * 100;
        previousForStorage = prevCloseMarketValue;
      } else {
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
          price: actualPrice,
          market_value: currentMarketValue,
          day_change: dayChange,
          day_change_percent: dayChangePercent,
          previous_market_value: previousForStorage,
          last_updated: now.toISOString(),
        })
        .eq("id", holding.id);

      if (!updateError) {
        updatedCount++;
        if (holding.account_id) {
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

    const snapIdFilter = (q, val) =>
      val == null ? q.is("snaptrade_user_id", null) : q.eq("snaptrade_user_id", val);

    // Recalculate investment_balances for all accounts (SnapTrade + Plaid) that were updated
    for (const acc of updatesByAccount.values()) {
      try {
        let hQ = supabase
          .from("investment_holdings")
          .select("market_value, symbol, security_type, description, day_change")
          .eq("user_id", acc.user_id)
          .eq("account_id", acc.account_id)
          .eq("is_active", true);
        hQ = snapIdFilter(hQ, acc.snaptrade_user_id);
        const { data: holdings } = await hQ;
        let optQ = supabase
          .from("investment_options")
          .select("market_value, day_change")
          .eq("user_id", acc.user_id)
          .eq("account_id", acc.account_id)
          .eq("is_active", true);
        optQ = snapIdFilter(optQ, acc.snaptrade_user_id);
        const { data: options } = await optQ;
        const cashEq = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];
        const isCashEq = (h) =>
          cashEq.includes((h.symbol || "").toUpperCase()) ||
          (h.security_type || "").toLowerCase().includes("money market") ||
          (h.description || "").toLowerCase().includes("cash");
        let totalHoldings = 0;
        let cashInHoldings = 0;
        // CRITICAL: Sum day_change from holdings - this is the source of truth for balance day_change
        let totalDayChangeFromHoldings = 0;
        holdings?.forEach((h) => {
          totalHoldings += h.market_value || 0;
          if (isCashEq(h)) cashInHoldings += h.market_value || 0;
          totalDayChangeFromHoldings += h.day_change || 0;
        });
        options?.forEach((o) => {
          totalHoldings += o.market_value || 0;
          totalDayChangeFromHoldings += o.day_change || 0;
        });
        let balQ = supabase
          .from("investment_balances")
          .select("total_value, cash, previous_total_value, last_updated")
          .eq("user_id", acc.user_id)
          .eq("account_id", acc.account_id)
          .eq("is_current", true);
        balQ = snapIdFilter(balQ, acc.snaptrade_user_id);
        const { data: balance } = await balQ.maybeSingle();
        if (!balance) continue;
        const cash = Math.max(
          0,
          (parseFloat(balance.cash) || 0) - cashInHoldings
        );
        const newTotal = totalHoldings + cash;
        // CRITICAL: day_change is computed from SUM(holdings.day_change), not from total_value diff
        const dayCh = totalDayChangeFromHoldings;
        const dayChPct = newTotal > 0 ? (dayCh / newTotal) * 100 : 0;
        // Preserve previous_total_value baseline (don't overwrite with current)
        const sameDay =
          balance.last_updated && isSameCalendarDayUTC(balance.last_updated);
        const prev =
          sameDay && balance.previous_total_value != null
            ? balance.previous_total_value
            : balance.total_value ?? newTotal;
        let updQ = supabase
          .from("investment_balances")
          .update({
            total_value: newTotal,
            previous_total_value: prev,
            day_change: dayCh,
            day_change_percent: dayChPct,
            last_updated: now.toISOString(),
          })
          .eq("user_id", acc.user_id)
          .eq("account_id", acc.account_id)
          .eq("is_current", true);
        updQ = snapIdFilter(updQ, acc.snaptrade_user_id);
        await updQ;
      } catch (e) {
        result.errors.push(`Balance recalc ${acc.account_id}: ${e?.message}`);
      }
    }

    // 2) Distinct users with holdings
    const userIds = [...new Set(allHoldings.map((h) => h.user_id))];
    const todayStart = new Date(todayUTC).toISOString();

    // 3) For each user: already have biggest_mover today? Pick biggest mover, create trigger
    const usersWithNewTrigger = [];
    /** When forceSend: trigger we just created, to send directly and bypass daily limit. */
    const forceSendTriggerByUser = new Map();
    for (const userId of userIds) {
      const userHoldings = allHoldings.filter((h) => h.user_id === userId);
      const withPriceMap = userHoldings
        .map((h) => {
          const pd = priceMap.get(h.symbol);
          const price =
            typeof pd === "object" && pd != null ? pd.current : pd;
          let dayChgPct = h.day_change_percent;
          if (price != null && pd != null) {
            const mv = h.units && price ? h.units * price : null;
            if (mv != null) {
              const prevC =
                typeof pd === "object" && pd.prevClose != null
                  ? pd.prevClose
                  : null;
              const base =
                prevC != null && prevC > 0
                  ? h.units * prevC
                  : h.previous_market_value ?? h.market_value ?? null;
              if (base != null && base !== 0) {
                dayChgPct = ((mv - base) / base) * 100;
              }
            }
          }
          return {
            ...h,
            newPrice: price,
            newDayChangePercent: dayChgPct,
          };
        })
        .filter((r) => r.newPrice != null && r.newDayChangePercent != null);

      if (withPriceMap.length === 0) continue;

      if (!forceSend) {
        const { data: existingToday } = await supabase
          .from("notification_triggers")
          .select("id")
          .eq("user_id", userId)
          .eq("trigger_type", "custom")
          .eq("trigger_metadata->>pattern_type", "biggest_mover")
          .gte("detected_at", todayStart)
          .limit(1);

        if (existingToday && existingToday.length > 0) continue;
      }

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
        .select("id, trigger_type, trigger_metadata")
        .single();

      if (insertErr) {
        result.errors.push(`Trigger create ${userId}: ${insertErr.message}`);
        continue;
      }
      result.triggers_created++;
      usersWithNewTrigger.push(userId);
      if (forceSend) forceSendTriggerByUser.set(userId, inserted);
    }

    // 4) Send notifications for users we just created triggers for
    for (const userId of usersWithNewTrigger) {
      try {
        const triggersToSend =
          forceSend && forceSendTriggerByUser.has(userId)
            ? [forceSendTriggerByUser.get(userId)]
            : await getTriggersForUser(userId);
        for (const trigger of triggersToSend) {
          const { title, body } = generateNotificationContent(trigger);
          console.log(
            `[biggest_mover] notification user=${userId.substring(
              0,
              8
            )}... title="${title}" body="${body}"`
          );
        }
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
    await logBiggestMoverRun(result, "success");
    return res.status(200).json(result);
  } catch (err) {
    result.completed_at = new Date().toISOString();
    result.errors.push(err?.message || String(err));
    console.error("[biggest_mover] error:", err?.message || err);
    await logBiggestMoverRun(result, "failure");
    return res.status(500).json(result);
  }
}
