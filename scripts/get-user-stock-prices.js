#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";

/**
 * CLI Script: Get Current Stock Prices for User's Holdings
 * =========================================================
 * Fetches current stock prices from Finnhub API for all user's active holdings
 *
 * Usage:
 * ------
 * node scripts/get-user-stock-prices.js <user_id>
 *
 * Example:
 * node scripts/get-user-stock-prices.js 79952f35-b607-40d6-a32e-d81386882eb7
 */

import { supabase } from "../lib/api/supabase.js";
import { fetchStockSnapshot } from "../lib/stocks.js";

// Get user_id from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error("❌ Error: User ID is required");
  console.log("\nUsage: node scripts/get-user-stock-prices.js <user_id>");
  console.log(
    "\nExample: node scripts/get-user-stock-prices.js 79952f35-b607-40d6-a32e-d81386882eb7"
  );
  process.exit(1);
}

async function getUserStockPrices(userId) {
  try {
    console.log(`\n🔍 Fetching holdings for user: ${userId}\n`);

    // Step 1: Get all active holdings with symbols for this user
    console.log("📋 Step 1: Fetching holdings from database...");
    const { data: holdings, error: holdingsError } = await supabase
      .from("investment_holdings")
      .select(
        "id, symbol, symbol_id, units, price, market_value, day_change, day_change_percent, account_id, security_type, description, snaptrade_user_id"
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .not("symbol", "is", null)
      .neq("symbol", "")
      .order("symbol", { ascending: true });

    if (holdingsError) {
      console.error("❌ Database Error:", holdingsError);
      throw new Error(`Failed to fetch holdings: ${holdingsError.message}`);
    }

    if (!holdings || holdings.length === 0) {
      console.log("ℹ️  No active holdings found for this user");
      return;
    }

    console.log(`✅ Found ${holdings.length} active holdings\n`);

    // Step 2: Identify cash equivalents (include in holdings, but don't call FinHub)
    console.log("💰 Step 2: Identifying cash equivalents (included in holdings, FinHub not called)...");
    const cashEquivalentSymbols = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];
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

    const allUniqueSymbols = [
      ...new Set(holdings.map((h) => h.symbol).filter(Boolean)),
    ];
    const symbolsToFetchFromFinhub = allUniqueSymbols.filter((sym) => {
      const h = holdings.find((x) => x.symbol === sym);
      if (!h) return true;
      if (isCashEquivalent(h)) {
        console.log(`   ⏭️  ${sym}: cash equivalent - not calling FinHub (kept in holdings)`);
        return false;
      }
      return true;
    });
    console.log(
      `✅ ${holdings.length} holdings total, ${symbolsToFetchFromFinhub.length} symbols to fetch from FinHub (${allUniqueSymbols.length - symbolsToFetchFromFinhub.length} cash equivalents - not fetched)\n`
    );

    // Step 3: Fetch prices from Finnhub only for non-cash-equivalent symbols
    console.log("📈 Step 3: Fetching prices from Finnhub...\n");
    const priceMap = new Map();
    const symbolErrors = [];
    const BATCH_DELAY = 1100;

    for (let i = 0; i < symbolsToFetchFromFinhub.length; i++) {
      const symbol = symbolsToFetchFromFinhub[i];
      try {
        process.stdout.write(`  Fetching ${symbol}... `);
        const snapshot = await fetchStockSnapshot(symbol);
        if (snapshot?.current != null) {
          priceMap.set(symbol, snapshot.current);
          console.log(`✅ $${snapshot.current.toFixed(2)}`);
        } else {
          console.log(`⚠️  No price data`);
          symbolErrors.push(`${symbol}: No price data available`);
        }

        if (i < symbolsToFetchFromFinhub.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`❌ Error: ${errorMsg}`);
        symbolErrors.push(`${symbol}: ${errorMsg}`);
      }
    }

    console.log(
      `\n✅ Step 3 Complete: Fetched prices for ${priceMap.size}/${symbolsToFetchFromFinhub.length} symbols`
    );
    if (symbolErrors.length > 0) {
      console.log(`⚠️  ${symbolErrors.length} symbol(s) failed:`);
      symbolErrors.forEach((err) => console.log(`   - ${err}`));
    }
    console.log();

    // Display results grouped by symbol (all holdings, including cash equivalents)
    console.log("=".repeat(80));
    console.log("STOCK PRICES SUMMARY");
    console.log("=".repeat(80));
    console.log();

    // Step 4: Group all holdings by symbol
    console.log("📊 Step 4: Grouping holdings by symbol...");
    const holdingsBySymbol = new Map();
    holdings.forEach((holding) => {
      if (!holdingsBySymbol.has(holding.symbol)) {
        holdingsBySymbol.set(holding.symbol, []);
      }
      holdingsBySymbol.get(holding.symbol).push(holding);
    });
    console.log(`✅ Grouped into ${holdingsBySymbol.size} unique symbols\n`);

    let totalCurrentValue = 0;
    let totalStoredValue = 0;

    for (const [symbol, symbolHoldings] of holdingsBySymbol.entries()) {
      const currentPrice = priceMap.get(symbol);
      const storedPrice = symbolHoldings[0].price;
      const isCash = isCashEquivalent(symbolHoldings[0]);

      // Calculate totals for this symbol
      const totalUnits = symbolHoldings.reduce(
        (sum, h) => sum + (parseFloat(h.units) || 0),
        0
      );
      const currentMarketValue = currentPrice
        ? totalUnits * currentPrice
        : isCash
          ? totalUnits * (parseFloat(storedPrice) || 0)
          : null;
      const storedMarketValue = symbolHoldings.reduce(
        (sum, h) => sum + (parseFloat(h.market_value) || 0),
        0
      );

      if (currentMarketValue) totalCurrentValue += currentMarketValue;
      totalStoredValue += storedMarketValue;

      console.log(`📊 ${symbol}`);
      console.log(`   Type: ${symbolHoldings[0].security_type || "N/A"}`);
      console.log(`   Units: ${totalUnits.toFixed(4)}`);
      console.log(`   Stored Price: $${(storedPrice || 0).toFixed(2)}`);
      if (isCash) {
        console.log(
          `   Current Price (Finnhub): not fetched (cash equivalent - kept as stored)`
        );
        console.log(`   Stored Market Value: $${storedMarketValue.toFixed(2)}`);
        console.log(
          `   Current Market Value: $${storedMarketValue.toFixed(2)} (same - cash)`
        );
      } else if (currentPrice) {
        console.log(`   Current Price (Finnhub): $${currentPrice.toFixed(2)}`);
        const priceDiff = currentPrice - (storedPrice || 0);
        const priceDiffPercent =
          storedPrice && storedPrice > 0
            ? ((priceDiff / storedPrice) * 100).toFixed(2)
            : "N/A";
        console.log(
          `   Price Change: ${priceDiff >= 0 ? "+" : ""}$${priceDiff.toFixed(
            2
          )} (${priceDiffPercent}%)`
        );
        console.log(`   Stored Market Value: $${storedMarketValue.toFixed(2)}`);
        console.log(
          `   Current Market Value: $${currentMarketValue.toFixed(2)}`
        );
        const valueDiff = currentMarketValue - storedMarketValue;
        console.log(
          `   Value Change: ${valueDiff >= 0 ? "+" : ""}$${valueDiff.toFixed(
            2
          )}`
        );
      } else {
        console.log(`   Current Price (Finnhub): ❌ Not available`);
        console.log(`   Stored Market Value: $${storedMarketValue.toFixed(2)}`);
      }
      console.log();
    }

    console.log("=".repeat(80));
    console.log("TOTALS");
    console.log("=".repeat(80));
    console.log(`Total Stored Value: $${totalStoredValue.toFixed(2)}`);
    if (totalCurrentValue > 0) {
      console.log(`Total Current Value: $${totalCurrentValue.toFixed(2)}`);
      const totalDiff = totalCurrentValue - totalStoredValue;
      const totalDiffPercent =
        totalStoredValue > 0
          ? ((totalDiff / totalStoredValue) * 100).toFixed(2)
          : "N/A";
      console.log(
        `Total Value Change: ${totalDiff >= 0 ? "+" : ""}$${totalDiff.toFixed(
          2
        )} (${totalDiffPercent}%)`
      );
    }
    console.log("=".repeat(80));
    console.log();

    // Step 6: Summary of what would be updated (simulating API endpoint behavior)
    console.log("=".repeat(80));
    console.log("UPDATE SIMULATION (What API endpoint would do)");
    console.log("=".repeat(80));
    console.log(
      `✅ Holdings that would be updated: ${
        filteredHoldings.filter((h) => priceMap.has(h.symbol)).length
      }`
    );
    console.log(
      `⚠️  Holdings skipped (no price data): ${
        filteredHoldings.filter((h) => !priceMap.has(h.symbol)).length
      }`
    );
    console.log(
      `💰 Cash equivalents filtered out: ${
        holdings.length - filteredHoldings.length
      }`
    );
    if (symbolErrors.length > 0) {
      console.log(`❌ Symbol fetch errors: ${symbolErrors.length}`);
      symbolErrors.slice(0, 5).forEach((err) => console.log(`   - ${err}`));
      if (symbolErrors.length > 5) {
        console.log(`   ... and ${symbolErrors.length - 5} more`);
      }
    }
    console.log("=".repeat(80));
    console.log();
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
getUserStockPrices(userId);
