/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Snaptrade } from "https://esm.sh/snaptrade-typescript-sdk@1.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// SnapTrade SDK configuration
const SNAPTRADE_CLIENT_ID = Deno.env.get("SNAPTRADE_CLIENT_ID")!;
const SNAPTRADE_CONSUMER_KEY = Deno.env.get("SNAPTRADE_CONSUMER_KEY")!;

const snaptrade = new Snaptrade({
  clientId: SNAPTRADE_CLIENT_ID,
  consumerKey: SNAPTRADE_CONSUMER_KEY,
});

// Helper function to recalculate portfolio metrics from database holdings
async function recalculatePortfolioMetricsFromDatabase(userId: string, snaptradeUserId: string, accountId: string) {
  try {
    console.log("🔄 Recalculating portfolio metrics from database holdings...");

    // Get all active holdings for this account from the database
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

    if (!holdings || holdings.length === 0) {
      console.log("ℹ️ No holdings found for recalculation");
      return;
    }

    // Calculate totals from database holdings
    let totalValue = 0;
    let totalDayChange = 0;
    let totalUnrealizedPL = 0;

    holdings.forEach((holding: any) => {
      const marketValue = holding.market_value || 0;
      const dayChange = holding.day_change || 0;
      const unrealizedPL = holding.unrealized_pl || 0;

      totalValue += marketValue;
      totalDayChange += dayChange;
      totalUnrealizedPL += unrealizedPL;
    });

    // Get cash balance from investment_balances
    const { data: balanceData, error: balanceError } = await supabase
      .from("investment_balances")
      .select("cash")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_current", true)
      .single();

    const cashAmount = balanceData?.cash || 0;
    const totalPortfolioValue = totalValue + cashAmount;

    // Calculate percentages
    const dayChangePercent = totalPortfolioValue > 0 ? (totalDayChange / totalPortfolioValue) * 100 : 0;
    const totalChangePercent = totalPortfolioValue > 0 ? (totalUnrealizedPL / totalPortfolioValue) * 100 : 0;

    console.log("📊 Database-calculated portfolio metrics:", {
      holdingsCount: holdings.length,
      totalValue: totalValue.toFixed(2),
      cashAmount: cashAmount.toFixed(2),
      totalPortfolioValue: totalPortfolioValue.toFixed(2),
      totalDayChange: totalDayChange.toFixed(2),
      dayChangePercent: dayChangePercent.toFixed(2),
      totalUnrealizedPL: totalUnrealizedPL.toFixed(2),
      totalChangePercent: totalChangePercent.toFixed(2),
    });

    // Update investment_balances with recalculated values
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
      console.error("❌ Error updating balance with recalculated metrics:", updateError);
    } else {
      console.log("✅ Portfolio metrics recalculated and updated from database holdings");
    }
  } catch (error) {
    console.error("❌ Error in recalculatePortfolioMetricsFromDatabase:", error);
  }
}

serve(async (req: Request) => {
  try {
    console.log("🔄 Starting investments sync...");
    
    const { user_id, snaptrade_user_id, account_id } = (await req.json()) as {
      user_id: string;
      snaptrade_user_id: string;
      account_id: string;
    };
    
    console.log("📋 Sync request:", { 
      user_id: user_id.substring(0, 8) + "...", 
      snaptrade_user_id,
      account_id: account_id.substring(0, 8) + "..."
    });
    
    if (!user_id || !snaptrade_user_id || !account_id) {
      console.error("❌ Missing required parameters");
      return new Response("Missing user_id, snaptrade_user_id, or account_id", { status: 400 });
    }

    // 1. Get user_secret directly from database
    console.log("🔑 Fetching user_secret from database...");
    const { data: connection, error: tokenErr } = await supabase
      .from("snaptrade_connections")
      .select("user_secret")
      .eq("user_id", user_id)
      .eq("snaptrade_user_id", snaptrade_user_id)
      .eq("account_id", account_id)
      .eq("is_active", true)
      .single();

    if (tokenErr || !connection?.user_secret) {
      console.error("❌ Database credential fetch failed:", tokenErr);
      return new Response("Credentials not found", { status: 404 });
    }

    const user_secret = connection.user_secret;
    console.log("✅ User secret retrieved from database");

    // 2. Sync Account Balances
    console.log("💰 Syncing account balances...");
    try {
      const balanceResponse = await snaptrade.accountInformation.getUserAccountBalance({
        accountId: account_id,
        userId: snaptrade_user_id,
        userSecret: user_secret
      });

      const balanceData = balanceResponse.data;
      console.log("💰 Balance data received:", JSON.stringify(balanceData, null, 2));

      if (balanceData && Array.isArray(balanceData) && balanceData.length > 0) {
        // Get existing balances to read previous_total_value before updating
        const { data: existingBalances } = await supabase
          .from("investment_balances")
          .select("currency_code, previous_total_value, total_value")
          .eq("user_id", user_id)
          .eq("snaptrade_user_id", snaptrade_user_id)
          .eq("account_id", account_id)
          .eq("is_current", true);

        // Calculate total holdings value from the holdings we'll sync (need to fetch holdings first)
        // Note: We'll calculate this after holdings are synced, but for now use existing holdings
        // The recalculatePortfolioMetricsFromDatabase function will fix this later
        const { data: currentHoldings } = await supabase
          .from("investment_holdings")
          .select("market_value")
          .eq("user_id", user_id)
          .eq("snaptrade_user_id", snaptrade_user_id)
          .eq("account_id", account_id)
          .eq("is_active", true);

        const totalHoldingsValue = (currentHoldings || []).reduce(
          (sum: number, h: any) => sum + (h.market_value || 0),
          0
        );

        const balanceRows = balanceData.map((balance: any) => {
          const currencyCode = balance.currency?.code || 'USD';
          const cash = balance.cash || 0;
          const totalValue = totalHoldingsValue + cash;

          // Find existing balance for this currency to get previous_total_value
          const existingBalance = existingBalances?.find(
            (eb: any) => eb.currency_code === currencyCode
          );
          const previousTotalValue = existingBalance?.previous_total_value ?? existingBalance?.total_value ?? null;

          // Calculate day_change and day_change_percent
          let dayChange = null;
          let dayChangePercent = null;
          if (previousTotalValue !== null && previousTotalValue !== undefined) {
            dayChange = totalValue - previousTotalValue;
            dayChangePercent = previousTotalValue !== 0 
              ? (dayChange / previousTotalValue) * 100 
              : 0;
          }

          return {
            user_id,
            snaptrade_user_id,
            account_id,
            currency_code: currencyCode,
            cash: cash,
            buying_power: balance.buying_power || 0,
            total_value: totalValue,
            previous_total_value: totalValue, // Set for next sync
            day_change: dayChange,
            day_change_percent: dayChangePercent,
            is_current: true,
            last_updated: new Date().toISOString()
          };
        });

        // Mark all previous balances as not current
        await supabase
          .from("investment_balances")
          .update({ is_current: false })
          .eq("snaptrade_user_id", snaptrade_user_id)
          .eq("account_id", account_id);

        // Insert new balances
        const { error: balanceErr } = await supabase
          .from("investment_balances")
          .upsert(balanceRows, { onConflict: "snaptrade_user_id,account_id,currency_code" });

        if (balanceErr) {
          console.error("❌ Balance upsert error:", balanceErr);
        } else {
          console.log("✅ Balances synced successfully:", balanceRows.length);
        }
      } else {
        console.log("ℹ️ No balance data to sync (empty or null response)");
      }
    } catch (error) {
      console.error("❌ Error syncing balances:", error);
    }

    // 3. Sync Holdings (Regular Positions)
    console.log("📈 Syncing investment holdings...");
    try {
      const holdingsResponse = await snaptrade.accountInformation.getUserHoldings({
        accountId: account_id,
        userId: snaptrade_user_id,
        userSecret: user_secret
      });

      const holdingsData = holdingsResponse?.data || {};
      console.log("📈 Holdings data received:", JSON.stringify(holdingsData, null, 2));

      // CRITICAL: Handle different response structures
      // Holdings can be in positions array, or holdingsData itself might be an array
      let positions: any[] = [];
      if (Array.isArray(holdingsData)) {
        positions = holdingsData;
      } else if (holdingsData.positions && Array.isArray(holdingsData.positions)) {
        positions = holdingsData.positions;
      } else if (holdingsData.holdings && Array.isArray(holdingsData.holdings)) {
        positions = holdingsData.holdings;
      }

      if (positions && positions.length > 0) {
        // Get existing holdings to read previous_market_value before updating
        const { data: existingHoldings } = await supabase
          .from("investment_holdings")
          .select("symbol_id, previous_market_value, market_value")
          .eq("user_id", user_id)
          .eq("snaptrade_user_id", snaptrade_user_id)
          .eq("account_id", account_id)
          .eq("is_active", true);

        const holdingsRows = positions
          .filter((holding: any) => holding && (holding.symbol || holding.symbol_id))
          .map((holding: any) => {
            // CRITICAL: Extract symbol_id correctly from SnapTrade API structure
            // API structure: holding.symbol.id (position symbol ID) or holding.symbol.symbol.id (universal symbol ID)
            // We need to check BOTH to match existing holdings in database
            let symbolId: string | null = null;
            let universalSymbolId: string | null = null;
            let symbolObj: any = null;
            
            if (holding.symbol?.id) {
              // Primary: Use position symbol ID (holding.symbol.id)
              symbolId = holding.symbol.id;
              symbolObj = holding.symbol.symbol || holding.symbol;
              // Also extract universal symbol ID for matching
              universalSymbolId = holding.symbol.symbol?.id || null;
            } else if (holding.symbol?.symbol?.id) {
              // Fallback: Use universal symbol ID if position ID not available
              symbolId = holding.symbol.symbol.id;
              universalSymbolId = holding.symbol.symbol.id;
              symbolObj = holding.symbol.symbol;
            } else if (holding.symbol_id) {
              // Fallback: Direct symbol_id field
              symbolId = holding.symbol_id;
              symbolObj = holding.symbol;
            }
            
            // Extract symbol string
            const symbolString = symbolObj?.symbol || symbolObj?.raw_symbol || holding.ticker || null;

            if (!symbolId) {
              console.warn("⚠️ Warning: Could not extract symbol_id for holding:", symbolString || "unknown");
            }

            const marketValue = holding.units && holding.price ? holding.units * holding.price : null;

            // Find existing holding to get previous_market_value
            // Match by symbol_id (position ID) OR universal symbol ID OR symbol string
            const existingHolding = existingHoldings?.find(
              (eh: any) =>
                eh.symbol_id === symbolId ||
                eh.symbol_id === universalSymbolId ||
                (symbolString && eh.symbol === symbolString)
            );
            const previousMarketValue = existingHolding?.previous_market_value ?? existingHolding?.market_value ?? null;
            
            // Log price updates for debugging
            if (existingHolding && existingHolding.price !== holding.price) {
              console.log(`💰 Price update for ${symbolString}:`, {
                previous_price: existingHolding.price,
                new_price: holding.price,
                change: holding.price - existingHolding.price,
                change_percent: existingHolding.price 
                  ? ((holding.price - existingHolding.price) / existingHolding.price * 100).toFixed(2) + '%'
                  : 'N/A'
              });
            } else if (!existingHolding) {
              console.log(`💰 New holding price for ${symbolString}: $${holding.price}`);
            } else if (existingHolding && existingHolding.price === holding.price) {
              console.log(`💰 Price unchanged for ${symbolString}: $${holding.price}`);
            }

            // Calculate day_change and day_change_percent
            let dayChange = null;
            let dayChangePercent = null;
            if (previousMarketValue !== null && previousMarketValue !== undefined && marketValue !== null) {
              dayChange = marketValue - previousMarketValue;
              dayChangePercent = previousMarketValue !== 0 
                ? (dayChange / previousMarketValue) * 100 
                : 0;
            }

            return {
              user_id,
              snaptrade_user_id,
              account_id,
              symbol_id: symbolId, // CRITICAL: Must be extracted correctly for comparison
              symbol: symbolString,
              description: symbolObj?.description || null,
              currency_code: holding.currency?.code || 'USD',
              exchange_code: symbolObj?.exchange?.code || null,
              exchange_name: symbolObj?.exchange?.name || null,
              security_type: symbolObj?.type?.description || null,
            units: holding.units || 0,
            price: holding.price,
            market_value: marketValue,
            previous_market_value: marketValue, // Set for next sync
            average_purchase_price: holding.average_purchase_price,
            total_cost_basis: holding.units && holding.average_purchase_price ? holding.units * holding.average_purchase_price : null,
            unrealized_pl: holding.open_pnl,
            // NOTE: realized_pl is NOT in investment_holdings table (only in investment_options)
            day_change: dayChange,
            day_change_percent: dayChangePercent,
            total_percent_change: null, // Will be calculated by trigger: ((market_value - total_cost_basis) / total_cost_basis) * 100
            is_active: true,
            last_updated: new Date().toISOString()
          };
          })
          .filter((h: any) => h.symbol_id !== null); // CRITICAL: Filter out holdings without valid symbol_id

        const { error: holdingsErr } = await supabase
          .from("investment_holdings")
          .upsert(holdingsRows, { onConflict: "snaptrade_user_id,account_id,symbol_id" });

        if (holdingsErr) {
          console.error("❌ Holdings upsert error:", holdingsErr);
        } else {
          console.log("✅ Holdings synced successfully");
        }

        // CRITICAL: Mark holdings as inactive if they're no longer in the API response
        // This handles the case where stocks are sold
        // SAFETY: Only run this AFTER successful upsert and only if we have valid symbol_ids
        if (holdingsRows.length > 0) {
          // CRITICAL: Wait a moment for upsert to fully commit to database
          await new Promise((resolve) => setTimeout(resolve, 500));
          
          console.log("🔄 Checking for sold holdings to mark as inactive...");
          
          // Get all symbol identifiers from the API response (these are the ACTIVE holdings)
          // We need to match by BOTH symbol_id AND symbol string to handle ID mismatches
          const activeSymbolIds = new Set(
            holdingsRows
              .map((h) => h.symbol_id)
              .filter((id) => id !== null && id !== undefined && id !== "")
          );
          const activeSymbols = new Set(
            holdingsRows
              .map((h) => h.symbol)
              .filter((s) => s !== null && s !== undefined && s !== "")
          );
          
          console.log(
            `📊 Found ${activeSymbolIds.size} active holdings in API response (by ID):`,
            Array.from(activeSymbolIds).slice(0, 5).join(", ") + (activeSymbolIds.size > 5 ? "..." : "")
          );
          console.log(
            `📊 Found ${activeSymbols.size} active holdings in API response (by symbol):`,
            Array.from(activeSymbols).slice(0, 5).join(", ") + (activeSymbols.size > 5 ? "..." : "")
          );
          
          // SAFETY CHECK: Don't proceed if we have no valid identifiers
          if (activeSymbolIds.size === 0 && activeSymbols.size === 0) {
            console.error("❌ CRITICAL: No valid symbol_ids or symbols found in API response - skipping deactivation to prevent data loss");
            console.log("🔍 Debug - holdingsRows sample:", JSON.stringify(holdingsRows.slice(0, 2), null, 2));
          } else {
            // Get all currently active holdings from database (AFTER upsert)
            const { data: allActiveHoldings, error: fetchError } = await supabase
              .from("investment_holdings")
              .select("symbol_id, symbol")
              .eq("user_id", user_id)
              .eq("snaptrade_user_id", snaptrade_user_id)
              .eq("account_id", account_id)
              .eq("is_active", true);
            
            if (fetchError) {
              console.error("❌ Error fetching active holdings:", fetchError);
              console.error("⚠️ SKIPPING deactivation to prevent data loss");
            } else if (allActiveHoldings && allActiveHoldings.length > 0) {
              console.log(`📊 Found ${allActiveHoldings.length} active holdings in database`);
              
              // Find holdings that are in DB but NOT in API response (sold stocks)
              // Match by BOTH symbol_id AND symbol string to handle ID mismatches
              const soldHoldings = allActiveHoldings.filter((h: any) => {
                if (!h.symbol_id && !h.symbol) return false;
                
                // Check if holding exists in API by symbol_id OR symbol string
                const existsById = h.symbol_id && activeSymbolIds.has(h.symbol_id);
                const existsBySymbol = h.symbol && activeSymbols.has(h.symbol);
                
                // If it exists by either identifier, it's NOT sold
                return !existsById && !existsBySymbol;
              });
              
              // SAFETY CHECK: Don't deactivate if it would affect ALL holdings
              if (soldHoldings.length === allActiveHoldings.length && activeSymbolIds.size > 0) {
                console.error("❌ CRITICAL SAFETY CHECK FAILED: Would deactivate ALL holdings!");
                console.error("🔍 Debug info:", {
                  activeSymbolIdsCount: activeSymbolIds.size,
                  activeSymbolIdsSample: Array.from(activeSymbolIds).slice(0, 3),
                  dbHoldingsCount: allActiveHoldings.length,
                  dbHoldingsSample: allActiveHoldings.slice(0, 3).map(h => ({ symbol: h.symbol, symbol_id: h.symbol_id })),
                });
                console.error("⚠️ ABORTING deactivation to prevent data loss - symbol_id mismatch detected");
              } else if (soldHoldings.length > 0) {
                console.log(
                  `🔴 Found ${soldHoldings.length} sold holdings to deactivate:`,
                  soldHoldings.map((h) => `${h.symbol} (${h.symbol_id})`).join(", ")
                );
                
                const soldSymbolIds = soldHoldings.map((h) => h.symbol_id).filter(id => id);
                const { error: deactivateError } = await supabase
                  .from("investment_holdings")
                  .update({
                    is_active: false,
                    last_updated: new Date().toISOString(),
                  })
                  .eq("user_id", user_id)
                  .eq("snaptrade_user_id", snaptrade_user_id)
                  .eq("account_id", account_id)
                  .in("symbol_id", soldSymbolIds);
                
                if (deactivateError) {
                  console.error("❌ Error marking sold holdings as inactive:", deactivateError);
                } else {
                  console.log(`✅ Successfully marked ${soldSymbolIds.length} sold holdings as inactive`);
                }
              } else {
                console.log("✅ No sold holdings found - all holdings are still active");
              }
            } else {
              console.log("ℹ️ No active holdings found in database to compare");
            }
          }
        }
        // SAFETY: Removed automatic deactivation when holdingsRows.length === 0
        // This could happen if API returns empty array temporarily - better to preserve existing data
      } else {
        console.log("ℹ️ No holdings data to sync (empty or null response)");
        // SAFETY: Don't automatically mark all holdings as inactive if positions array is empty
        // This could be a temporary API issue - better to leave holdings as-is
        console.log("⚠️ No positions found in API response - keeping existing holdings active (may be temporary API issue)");
      }
    } catch (error) {
      console.error("❌ Error syncing holdings:", error);
    }

    // 4. Sync Options Positions (TODO: Find correct SDK method)
    console.log("📊 Skipping options sync for now - need to find correct SDK method");
    /*
    console.log("📊 Syncing options positions...");
    try {
      // TODO: Find the correct SDK method for options
      // const optionsResponse = await snaptrade.???
      
      console.log("ℹ️ Options sync not implemented yet");
    } catch (error) {
      console.error("❌ Error syncing options:", error);
    }
    */

    // 5. Recalculate portfolio metrics from database holdings
    console.log("🔄 Recalculating portfolio metrics from database holdings...");
    await recalculatePortfolioMetricsFromDatabase(user_id, snaptrade_user_id, account_id);

    // 6. Update last_synced_at timestamp
    await supabase
      .from("snaptrade_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("snaptrade_user_id", snaptrade_user_id)
      .eq("account_id", account_id);

    console.log("✅ Investments sync completed successfully");
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Investments synced successfully" 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("❌ Investments sync error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error"
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
