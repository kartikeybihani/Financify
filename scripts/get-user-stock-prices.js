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

    // Step 2: Filter out cash equivalents (same logic as API)
    console.log("💰 Step 2: Filtering cash equivalents...");
    const cashEquivalentSymbols = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];
    const filteredHoldings = holdings.filter((h) => {
      const symbol = h.symbol?.toUpperCase();
      const securityType = h.security_type?.toLowerCase() || "";
      const description = h.description?.toLowerCase() || "";

      if (cashEquivalentSymbols.includes(symbol)) {
        console.log(`   ⏭️  Skipping cash equivalent: ${symbol}`);
        return false;
      }

      if (
        securityType.includes("money market") ||
        securityType.includes("cash") ||
        description.includes("money market") ||
        description.includes("cash equivalent")
      ) {
        console.log(
          `   ⏭️  Skipping cash equivalent: ${symbol} (${
            securityType || description
          })`
        );
        return false;
      }

      return true;
    });

    console.log(
      `✅ Filtered to ${filteredHoldings.length} holdings (skipped ${
        holdings.length - filteredHoldings.length
      } cash equivalents)\n`
    );

    // Step 3: Get unique symbols (deduplicate) from filtered holdings
    console.log("📊 Step 3: Getting unique symbols...");
    const uniqueSymbols = [
      ...new Set(filteredHoldings.map((h) => h.symbol).filter(Boolean)),
    ];
    console.log(`✅ Found ${uniqueSymbols.length} unique symbols to fetch\n`);

    // Step 4: Fetch prices from Finnhub (same logic as API)
    console.log("📈 Step 4: Fetching prices from Finnhub...\n");
    const priceMap = new Map();
    const symbolErrors = []; // Track failures
    const BATCH_DELAY = 1100; // 1.1s between calls to stay under rate limit

    for (let i = 0; i < uniqueSymbols.length; i++) {
      const symbol = uniqueSymbols[i];
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

        // Rate limit: wait between calls (except last one)
        if (i < uniqueSymbols.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`❌ Error: ${errorMsg}`);
        symbolErrors.push(`${symbol}: ${errorMsg}`);
        // Continue to next symbol - non-blocking
      }
    }

    console.log(
      `\n✅ Step 4 Complete: Fetched prices for ${priceMap.size}/${uniqueSymbols.length} symbols`
    );
    if (symbolErrors.length > 0) {
      console.log(`⚠️  ${symbolErrors.length} symbol(s) failed:`);
      symbolErrors.forEach((err) => console.log(`   - ${err}`));
    }
    console.log();

    // Display results grouped by symbol
    console.log("=".repeat(80));
    console.log("STOCK PRICES SUMMARY");
    console.log("=".repeat(80));
    console.log();

    // Step 5: Group filtered holdings by symbol
    console.log("📊 Step 5: Grouping holdings by symbol...");
    const holdingsBySymbol = new Map();
    filteredHoldings.forEach((holding) => {
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

      // Calculate totals for this symbol
      const totalUnits = symbolHoldings.reduce(
        (sum, h) => sum + (parseFloat(h.units) || 0),
        0
      );
      const currentMarketValue = currentPrice
        ? totalUnits * currentPrice
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
      if (currentPrice) {
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
      } else {
        console.log(`   Current Price (Finnhub): ❌ Not available`);
      }
      console.log(`   Stored Market Value: $${storedMarketValue.toFixed(2)}`);
      if (currentMarketValue) {
        console.log(
          `   Current Market Value: $${currentMarketValue.toFixed(2)}`
        );
        const valueDiff = currentMarketValue - storedMarketValue;
        console.log(
          `   Value Change: ${valueDiff >= 0 ? "+" : ""}$${valueDiff.toFixed(
            2
          )}`
        );
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
