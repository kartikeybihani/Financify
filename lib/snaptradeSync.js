// /lib/snaptradeSync.js
// SnapTrade investment sync logic - runs on Node.js (Vercel) for crypto compatibility
// Ported from supabase/functions/sync-investments (Deno) - Node has crypto.createHmac

import { supabase } from "./api/supabase.js";
import { snaptrade } from "./api/snaptrade.js";

/**
 * Recalculate portfolio metrics from existing database holdings and options
 */
async function recalculatePortfolioMetricsFromDatabase(
  userId,
  snaptradeUserId,
  accountId
) {
  try {
    console.log(
      "🔄 Recalculating portfolio metrics from database holdings and options..."
    );

    const { data: holdings, error: holdingsError } = await supabase
      .from("investment_holdings")
      .select("*")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_active", true);

    if (holdingsError) {
      console.error("❌ Error fetching holdings for recalculation:", holdingsError);
      return;
    }

    const { data: options, error: optionsError } = await supabase
      .from("investment_options")
      .select("*")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_active", true);

    if (optionsError) {
      console.error("❌ Error fetching options for recalculation:", optionsError);
    }

    if (
      (!holdings || holdings.length === 0) &&
      (!options || options.length === 0)
    ) {
      console.log("ℹ️ No holdings or options found for recalculation");
      return;
    }

    let totalValue = 0;
    let totalDayChange = 0;
    let totalUnrealizedPL = 0;

    holdings?.forEach((holding) => {
      totalValue += holding.market_value || 0;
      totalDayChange += holding.day_change || 0;
      totalUnrealizedPL += holding.unrealized_pl || 0;
    });

    options?.forEach((option) => {
      totalValue += option.market_value || 0;
      totalDayChange += option.day_change || 0;
      totalUnrealizedPL += option.unrealized_pl || 0;
    });

    const totalPortfolioValue = totalValue;
    const dayChangePercent =
      totalPortfolioValue > 0 ? (totalDayChange / totalPortfolioValue) * 100 : 0;
    const totalChangePercent =
      totalPortfolioValue > 0 ? (totalUnrealizedPL / totalPortfolioValue) * 100 : 0;

    const { error: updateError } = await supabase
      .from("investment_balances")
      .update({
        total_value: totalPortfolioValue,
        day_change: totalDayChange,
        day_change_percent: dayChangePercent,
        total_change: totalUnrealizedPL,
        total_change_percent: totalChangePercent,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_current", true);

    if (updateError) {
      console.error(
        "❌ Error updating balance with recalculated metrics:",
        updateError
      );
    } else {
      console.log(
        "✅ Portfolio metrics recalculated and updated from database holdings"
      );
    }
  } catch (error) {
    console.error(
      "❌ Error in recalculatePortfolioMetricsFromDatabase:",
      error
    );
  }
}

/**
 * Sync SnapTrade investments for a single account
 * @param {string} userId - Supabase auth user ID
 * @param {string} snaptradeUserId - SnapTrade user ID
 * @param {string} accountId - SnapTrade account ID
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function syncSnaptradeInvestments(
  userId,
  snaptradeUserId,
  accountId
) {
  try {
    console.log("🔄 Starting SnapTrade investments sync...", {
      userId: userId?.substring(0, 8) + "...",
      snaptradeUserId,
      accountId: accountId?.substring(0, 8) + "...",
    });

    const { data: connection, error: tokenErr } = await supabase
      .from("snaptrade_connections")
      .select("user_secret")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_active", true)
      .single();

    if (tokenErr || !connection?.user_secret) {
      console.error("❌ Database credential fetch failed:", tokenErr);
      throw new Error("Credentials not found");
    }

    const userSecret = connection.user_secret;
    console.log("✅ User secret retrieved from database");

    // 1. Sync Account Balances
    console.log("💰 Syncing account balances...");
    try {
      const balanceResponse =
        await snaptrade.accountInformation.getUserAccountBalance({
          accountId,
          userId: snaptradeUserId,
          userSecret,
        });

      const balanceData = balanceResponse.data;

      if (balanceData && Array.isArray(balanceData) && balanceData.length > 0) {
        // CRITICAL: Check for existing balances WITHOUT is_current filter
        // The unique constraint is on (user_id, snaptrade_user_id, account_id, currency_code)
        // regardless of is_current value
        const { data: existingBalances } = await supabase
          .from("investment_balances")
          .select("currency_code, previous_total_value, total_value, id")
          .eq("user_id", userId)
          .eq("snaptrade_user_id", snaptradeUserId)
          .eq("account_id", accountId)
          .eq("provider", "snaptrade");

        const { data: currentHoldings } = await supabase
          .from("investment_holdings")
          .select("market_value")
          .eq("user_id", userId)
          .eq("snaptrade_user_id", snaptradeUserId)
          .eq("account_id", accountId)
          .eq("is_active", true);

        const totalHoldingsValue = (currentHoldings || []).reduce(
          (sum, h) => sum + (h.market_value || 0),
          0
        );

        // Set all existing balances for this account to is_current: false first
        // This ensures only one current balance exists per account
        await supabase
          .from("investment_balances")
          .update({ is_current: false })
          .eq("user_id", userId)
          .eq("snaptrade_user_id", snaptradeUserId)
          .eq("account_id", accountId)
          .eq("provider", "snaptrade");

        // Process each balance and upsert individually
        let successCount = 0;
        let errorCount = 0;

        for (const balance of balanceData) {
          const currencyCode = balance.currency?.code || "USD";
          const cash = balance.cash || 0;
          const totalValue = totalHoldingsValue + cash;

          const existingBalance = existingBalances?.find(
            (eb) => eb.currency_code === currencyCode
          );
          const previousTotalValue =
            existingBalance?.previous_total_value ??
            existingBalance?.total_value ??
            null;

          let dayChange = null;
          let dayChangePercent = null;
          if (previousTotalValue != null) {
            dayChange = totalValue - previousTotalValue;
            dayChangePercent =
              previousTotalValue !== 0
                ? (dayChange / previousTotalValue) * 100
                : 0;
          }

          const balanceRow = {
            user_id: userId,
            snaptrade_user_id: snaptradeUserId,
            account_id: accountId,
            provider: "snaptrade",
            currency_code: currencyCode,
            cash,
            buying_power: balance.buying_power || 0,
            total_value: totalValue,
            previous_total_value: totalValue,
            day_change: dayChange,
            day_change_percent: dayChangePercent,
            is_current: true,
            last_updated: new Date().toISOString(),
          };

          // Check if row exists (without is_current filter)
          if (existingBalance?.id) {
            // Update existing row
            const { error: updateErr } = await supabase
              .from("investment_balances")
              .update(balanceRow)
              .eq("id", existingBalance.id);

            if (updateErr) {
              console.error(
                `❌ Error updating balance for ${currencyCode}:`,
                updateErr
              );
              errorCount++;
            } else {
              successCount++;
            }
          } else {
            // Insert new row
            const { error: insertErr } = await supabase
              .from("investment_balances")
              .insert(balanceRow);

            if (insertErr) {
              console.error(
                `❌ Error inserting balance for ${currencyCode}:`,
                insertErr
              );
              errorCount++;
            } else {
              successCount++;
            }
          }
        }

        if (errorCount > 0) {
          console.error(
            `❌ Balance sync completed with ${errorCount} errors, ${successCount} succeeded`
          );
        } else {
          console.log(`✅ Balances synced successfully: ${successCount}`);
        }
      } else {
        console.log("ℹ️ No balance data to sync (empty or null response)");
      }
    } catch (error) {
      console.error("❌ Error syncing balances:", error);
      throw error;
    }

    // 2. Sync Holdings
    console.log("📈 Syncing investment holdings...");
    try {
      const holdingsResponse =
        await snaptrade.accountInformation.getUserHoldings({
          accountId,
          userId: snaptradeUserId,
          userSecret,
        });

      const holdingsData = holdingsResponse?.data || {};
      let positions = [];
      if (Array.isArray(holdingsData)) {
        positions = holdingsData;
      } else if (
        holdingsData.positions &&
        Array.isArray(holdingsData.positions)
      ) {
        positions = holdingsData.positions;
      } else if (
        holdingsData.holdings &&
        Array.isArray(holdingsData.holdings)
      ) {
        positions = holdingsData.holdings;
      }

      if (positions && positions.length > 0) {
        const { data: existingHoldings } = await supabase
          .from("investment_holdings")
          .select("symbol_id, previous_market_value, market_value, symbol")
          .eq("user_id", userId)
          .eq("snaptrade_user_id", snaptradeUserId)
          .eq("account_id", accountId)
          .eq("is_active", true);

        const holdingsRows = positions
          .filter((holding) => holding && (holding.symbol || holding.symbol_id))
          .map((holding) => {
            let symbolId = null;
            let universalSymbolId = null;
            let symbolObj = null;

            if (holding.symbol?.id) {
              symbolId = holding.symbol.id;
              symbolObj = holding.symbol.symbol || holding.symbol;
              universalSymbolId = holding.symbol.symbol?.id || null;
            } else if (holding.symbol?.symbol?.id) {
              symbolId = holding.symbol.symbol.id;
              universalSymbolId = holding.symbol.symbol.id;
              symbolObj = holding.symbol.symbol;
            } else if (holding.symbol_id) {
              symbolId = holding.symbol_id;
              symbolObj = holding.symbol;
            }

            const symbolString =
              symbolObj?.symbol || symbolObj?.raw_symbol || holding.ticker || null;
            const marketValue =
              holding.units && holding.price ? holding.units * holding.price : null;

            const existingHolding = existingHoldings?.find(
              (eh) =>
                eh.symbol_id === symbolId ||
                eh.symbol_id === universalSymbolId ||
                (symbolString && eh.symbol === symbolString)
            );
            const finalSymbolId = existingHolding?.symbol_id || symbolId;
            const previousMarketValue =
              existingHolding?.previous_market_value ??
              existingHolding?.market_value ??
              null;

            let dayChange = null;
            let dayChangePercent = null;
            if (
              previousMarketValue != null &&
              marketValue != null
            ) {
              dayChange = marketValue - previousMarketValue;
              dayChangePercent =
                previousMarketValue !== 0
                  ? (dayChange / previousMarketValue) * 100
                  : 0;
            }

            return {
              user_id: userId,
              snaptrade_user_id: snaptradeUserId,
              account_id: accountId,
              provider: "snaptrade",
              symbol_id: finalSymbolId,
              symbol: symbolString,
              description: symbolObj?.description || null,
              currency_code: holding.currency?.code || "USD",
              exchange_code: symbolObj?.exchange?.code || null,
              exchange_name: symbolObj?.exchange?.name || null,
              security_type: symbolObj?.type?.description || null,
              units: holding.units || 0,
              price: holding.price,
              market_value: marketValue,
              previous_market_value: marketValue,
              average_purchase_price: holding.average_purchase_price,
              total_cost_basis:
                holding.units && holding.average_purchase_price
                  ? holding.units * holding.average_purchase_price
                  : null,
              unrealized_pl: holding.open_pnl,
              day_change: dayChange,
              day_change_percent: dayChangePercent,
              total_percent_change: null,
              is_active: true,
              last_updated: new Date().toISOString(),
            };
          })
          .filter((h) => h.symbol_id != null);

        const { error: holdingsErr } = await supabase
          .from("investment_holdings")
          .upsert(holdingsRows, {
            onConflict: "snaptrade_user_id,account_id,symbol_id",
          });

        if (holdingsErr) {
          console.error("❌ Holdings upsert error:", holdingsErr);
        } else {
          console.log("✅ Holdings synced successfully");
        }

        // Mark sold holdings as inactive
        if (holdingsRows.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));

          const activeSymbolIds = new Set(
            holdingsRows
              .map((h) => h.symbol_id)
              .filter((id) => id != null && id !== "")
          );
          const activeSymbols = new Set(
            holdingsRows
              .map((h) => h.symbol)
              .filter((s) => s != null && s !== "")
          );

          if (activeSymbolIds.size > 0 || activeSymbols.size > 0) {
            const { data: allActiveHoldings, error: fetchError } = await supabase
              .from("investment_holdings")
              .select("symbol_id, symbol")
              .eq("user_id", userId)
              .eq("snaptrade_user_id", snaptradeUserId)
              .eq("account_id", accountId)
              .eq("is_active", true);

            if (!fetchError && allActiveHoldings?.length > 0) {
              const soldHoldings = allActiveHoldings.filter((h) => {
                const existsById =
                  h.symbol_id && activeSymbolIds.has(h.symbol_id);
                const existsBySymbol = h.symbol && activeSymbols.has(h.symbol);
                return !existsById && !existsBySymbol;
              });

              // Safety: don't deactivate ALL holdings (could indicate API/ID mismatch)
              if (
                soldHoldings.length === allActiveHoldings.length &&
                activeSymbolIds.size > 0
              ) {
                console.error(
                  "⚠️ Would deactivate ALL holdings - skipping to prevent data loss"
                );
              } else if (soldHoldings.length > 0) {
                const soldSymbolIds = soldHoldings
                  .map((h) => h.symbol_id)
                  .filter(Boolean);
                await supabase
                  .from("investment_holdings")
                  .update({
                    is_active: false,
                    last_updated: new Date().toISOString(),
                  })
                  .eq("user_id", userId)
                  .eq("snaptrade_user_id", snaptradeUserId)
                  .eq("account_id", accountId)
                  .in("symbol_id", soldSymbolIds);
              }
            }
          }
        }
      } else {
        console.log("ℹ️ No holdings data to sync (empty or null response)");
      }
    } catch (error) {
      console.error("❌ Error syncing holdings:", error);
      throw error;
    }

    // 3. Recalculate portfolio metrics
    await recalculatePortfolioMetricsFromDatabase(
      userId,
      snaptradeUserId,
      accountId
    );

    // 4. Update last_synced_at
    await supabase
      .from("snaptrade_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId);

    console.log("✅ SnapTrade investments sync completed successfully");
    return { success: true };
  } catch (error) {
    console.error("❌ SnapTrade investments sync error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
