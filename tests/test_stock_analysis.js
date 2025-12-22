#!/usr/bin/env node

/**
 * Stock Analysis Test Script
 *
 * Test stock analysis functionality including:
 * - Ticker resolution (explicit tickers and company names)
 * - Stock snapshot fetching from Finnhub
 * - Full stock query flow through Finny API
 *
 * Usage:
 *   node tests/test_stock_analysis.js "AAPL"
 *   node tests/test_stock_analysis.js "Apple"
 *   node tests/test_stock_analysis.js "What about Tesla?"
 *   node tests/test_stock_analysis.js all
 */

import fetch from "node-fetch";
import dotenv from "dotenv";
import {
  resolveTickerForQuery,
  fetchStockSnapshot,
  buildStockDataSummary,
  detectStockCandidate,
} from "../lib/stocks.js";

dotenv.config();

// Configuration
const BASE_URL =
  process.env.APP_BASE_URL || "https://financify-rose.vercel.app";
const TEST_USER_ID =
  process.env.TEST_USER_ID || "f948c4ab-dc68-41d5-89bf-1935653cca37";

// Test cases for different scenarios
const TEST_CASES = [
  // Explicit ticker symbols
  { query: "AAPL", type: "explicit_ticker", expectedTicker: "AAPL" },
  { query: "TSLA", type: "explicit_ticker", expectedTicker: "TSLA" },
  { query: "MSFT", type: "explicit_ticker", expectedTicker: "MSFT" },
  { query: "NVDA", type: "explicit_ticker", expectedTicker: "NVDA" },
  { query: "GOOGL", type: "explicit_ticker", expectedTicker: "GOOGL" },

  // Company names
  { query: "Apple", type: "company_name", expectedTicker: "AAPL" },
  { query: "Tesla", type: "company_name", expectedTicker: "TSLA" },
  { query: "Microsoft", type: "company_name", expectedTicker: "MSFT" },
  { query: "NVIDIA", type: "company_name", expectedTicker: "NVDA" },
  { query: "Amazon", type: "company_name", expectedTicker: "AMZN" },

  // Natural language queries
  {
    query: "What about Apple stock?",
    type: "natural_language",
    expectedTicker: "AAPL",
  },
  {
    query: "Tell me about Tesla",
    type: "natural_language",
    expectedTicker: "TSLA",
  },
  {
    query: "Should I buy MSFT?",
    type: "natural_language",
    expectedTicker: "MSFT",
  },
  {
    query: "How is NVIDIA doing?",
    type: "natural_language",
    expectedTicker: "NVDA",
  },
];

/**
 * Test ticker resolution
 */
async function testTickerResolution(query, expectedTicker = null) {
  console.log(`\n🔍 Testing ticker resolution for: "${query}"`);
  console.log("─".repeat(80));

  try {
    const startTime = Date.now();
    const result = await resolveTickerForQuery(query);
    const duration = Date.now() - startTime;

    console.log(`⏱️  Resolution took: ${duration}ms`);
    console.log(`📊 Result:`, JSON.stringify(result, null, 2));

    if (result.ticker) {
      console.log(`✅ Ticker resolved: ${result.ticker}`);
      if (expectedTicker && result.ticker === expectedTicker) {
        console.log(`✅ Matches expected ticker: ${expectedTicker}`);
      } else if (expectedTicker) {
        console.log(`⚠️  Expected ${expectedTicker}, got ${result.ticker}`);
      }
      return { success: true, ticker: result.ticker, duration };
    } else {
      console.log(`❌ Failed to resolve ticker`);
      return { success: false, ticker: null, duration };
    }
  } catch (error) {
    console.error(`❌ Error resolving ticker:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test stock snapshot fetching
 */
async function testStockSnapshot(ticker) {
  console.log(`\n📈 Testing stock snapshot for ticker: ${ticker}`);
  console.log("─".repeat(80));

  try {
    const startTime = Date.now();
    const snapshot = await fetchStockSnapshot(ticker);
    const duration = Date.now() - startTime;

    console.log(`⏱️  Fetch took: ${duration}ms`);

    if (snapshot.error) {
      console.error(`❌ Error fetching snapshot:`, snapshot.error);
      return { success: false, error: snapshot.error };
    }

    // 🔍 DIAGNOSTIC: Log the raw quote data structure
    console.log(`\n🔍 [DIAGNOSTIC] Raw snapshot structure:`);
    console.log(
      `   - Has 'current' field: ${
        snapshot.current !== null && snapshot.current !== undefined
          ? "✅"
          : "❌"
      }`
    );
    console.log(`   - 'current' value: ${snapshot.current}`);
    console.log(`   - 'current' type: ${typeof snapshot.current}`);
    console.log(`   - 'prevClose' value: ${snapshot.prevClose}`);
    console.log(
      `   - Using prevClose fallback: ${
        snapshot._usingPrevCloseFallback || false
      }`
    );
    console.log(`   - Has 'error' field: ${snapshot.error ? "✅" : "❌"}`);
    if (snapshot.error) {
      console.log(`   - Error value: ${JSON.stringify(snapshot.error)}`);
    }

    console.log(`\n📊 Stock Data:`);
    console.log(`   Current Price: $${snapshot.current || "N/A"}`);
    console.log(
      `   Change: ${snapshot.change || "N/A"} (${
        snapshot.changePercent || "N/A"
      }%)`
    );
    console.log(`   High: $${snapshot.high || "N/A"}`);
    console.log(`   Low: $${snapshot.low || "N/A"}`);
    console.log(`   Previous Close: $${snapshot.prevClose || "N/A"}`);
    console.log(`   Open: $${snapshot.open || "N/A"}`);

    if (snapshot.profile) {
      console.log(`\n🏢 Company Profile:`);
      console.log(`   Name: ${snapshot.profile.name || "N/A"}`);
      console.log(`   Industry: ${snapshot.profile.finnhubIndustry || "N/A"}`);
      console.log(
        `   Market Cap: $${
          snapshot.profile.marketCapitalization?.toLocaleString() || "N/A"
        }`
      );
      console.log(`   Exchange: ${snapshot.profile.exchange || "N/A"}`);
    }

    if (snapshot.recommendations && snapshot.recommendations.length > 0) {
      const latest = snapshot.recommendations[0];
      console.log(`\n💼 Analyst Recommendations:`);
      console.log(`   Strong Buy: ${latest.strongBuy || 0}`);
      console.log(`   Buy: ${latest.buy || 0}`);
      console.log(`   Hold: ${latest.hold || 0}`);
      console.log(`   Sell: ${latest.sell || 0}`);
      console.log(`   Strong Sell: ${latest.strongSell || 0}`);
    }

    if (snapshot.metrics) {
      console.log(`\n📊 Key Metrics:`);
      const pe =
        snapshot.metrics.peBasicExclExtraTTM || snapshot.metrics.peBasicTTM;
      const ps = snapshot.metrics.psTTM;
      if (pe) console.log(`   P/E Ratio: ${Number(pe).toFixed(2)}`);
      if (ps) console.log(`   P/S Ratio: ${Number(ps).toFixed(2)}`);
    }

    if (snapshot.news && snapshot.news.length > 0) {
      console.log(`\n📰 Recent News (${snapshot.news.length} items):`);
      snapshot.news.slice(0, 3).forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.headline || "N/A"}`);
        if (item.url) console.log(`      ${item.url}`);
      });
    }

    // Build summary
    const summary = buildStockDataSummary(snapshot);
    console.log(`\n📝 Summary:`);
    console.log("─".repeat(80));
    console.log(summary);
    console.log("─".repeat(80));

    return {
      success: true,
      data: snapshot,
      duration,
      hasPrice: !!snapshot.current,
      hasProfile: !!snapshot.profile,
      hasRecommendations: !!snapshot.recommendations?.length,
      hasMetrics: !!snapshot.metrics,
      hasNews: !!snapshot.news?.length,
    };
  } catch (error) {
    console.error(`❌ Error fetching stock snapshot:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test stock candidate detection
 */
function testStockDetection(query) {
  console.log(`\n🎯 Testing stock detection for: "${query}"`);
  console.log("─".repeat(80));

  try {
    const detection = detectStockCandidate(query);

    if (detection) {
      console.log(`✅ Stock detected:`);
      console.log(`   Ticker: ${detection.ticker}`);
      console.log(`   Entities: ${JSON.stringify(detection.entities || [])}`);
      console.log(`   Confidence: ${detection.confidence}`);
      console.log(`   Source: ${detection.source || "unknown"}`);
      return { success: true, detection };
    } else {
      console.log(`❌ No stock detected`);
      return { success: false, detection: null };
    }
  } catch (error) {
    console.error(`❌ Error in stock detection:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test the exact condition that causes fallback - simulate executeStockPlan return structure
 */
async function testExecuteStockPlanCondition(ticker) {
  console.log(
    `\n🔍 Testing executeStockPlan condition check for ticker: ${ticker}`
  );
  console.log("─".repeat(80));

  try {
    // Fetch snapshot (this is what executeStockPlan does)
    const snapshot = await fetchStockSnapshot(ticker);

    // Simulate the structure that executeStockPlan returns
    const exec = {
      ticker: ticker,
      planWants: [],
      data: snapshot, // This is the base snapshot
      extra: {},
    };

    console.log(`\n📊 Simulated executeStockPlan result structure:`);
    console.log(`   - Has error: ${exec.error ? "✅ YES" : "❌ NO"}`);
    console.log(`   - Has data: ${exec.data ? "✅ YES" : "❌ NO"}`);
    if (exec.data) {
      console.log(`   - data.current: ${exec.data.current}`);
      console.log(`   - data.current type: ${typeof exec.data.current}`);
      console.log(`   - data.current === null: ${exec.data.current === null}`);
      console.log(
        `   - data.current === undefined: ${exec.data.current === undefined}`
      );
      console.log(`   - data.current != null: ${exec.data.current != null}`);
      console.log(`   - data.prevClose: ${exec.data.prevClose}`);
      console.log(
        `   - Using prevClose fallback: ${
          exec.data._usingPrevCloseFallback || false
        }`
      );
      console.log(`   - Has profile: ${!!exec.data.profile}`);
      console.log(`   - Has metrics: ${!!exec.data.metrics}`);
      console.log(`   - Has recommendations: ${!!exec.data.recommendations}`);
      console.log(`   - Has news: ${!!exec.data.news?.length}`);
    }
    console.log(`   - Has ticker: ${exec.ticker ? "✅ YES" : "❌ NO"}`);

    // Check the exact condition used in handleAsk
    const condition = !exec.error && exec.data?.current != null;
    console.log(
      `\n🔍 Condition check: !exec.error && exec.data?.current != null`
    );
    console.log(`   - !exec.error: ${!exec.error}`);
    console.log(
      `   - exec.data?.current != null: ${exec.data?.current != null}`
    );
    console.log(`   - Final result: ${condition ? "✅ PASS" : "❌ FAIL"}`);

    if (!condition) {
      console.log(
        `\n⚠️  ⚠️  ⚠️  THIS WOULD TRIGGER FALLBACK ANALYSIS ⚠️  ⚠️  ⚠️`
      );
      console.log(
        `   Reason: ${
          exec.error ? "Has error" : "data.current is null/undefined"
        }`
      );
    } else {
      console.log(`\n✅ Condition passed - would use Finnhub data`);
    }

    return {
      success: condition,
      exec,
      condition,
      wouldUseFallback: !condition,
    };
  } catch (error) {
    console.error(`❌ Error testing condition:`, error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

/**
 * Test full stock query flow through Finny API
 */
async function testFullStockQuery(query, userId = TEST_USER_ID) {
  console.log(`\n🤖 Testing full stock query flow: "${query}"`);
  console.log("─".repeat(80));

  try {
    // Step 1: Classify
    console.log(`\n🎯 Step 1: Classifying message...`);
    const classifyStart = Date.now();
    const classifyRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "classify",
        message: query,
        context: { user_id: userId },
      }),
    });

    const classifyData = await classifyRes.json();
    const classifyDuration = Date.now() - classifyStart;

    console.log(`⏱️  Classification took: ${classifyDuration}ms`);
    console.log(`📊 Classification:`);
    console.log(`   Intent: ${classifyData.intent}`);
    console.log(`   Ticker: ${classifyData.ticker || "null"}`);
    console.log(`   Confidence: ${classifyData.confidence || "N/A"}`);

    if (classifyData.intent !== "stock_query") {
      console.log(
        `⚠️  Expected stock_query intent, got ${classifyData.intent}`
      );
    }

    // Step 2: Ask Finny (with classification)
    console.log(`\n🤖 Step 2: Asking Finny with stock query...`);
    const askStart = Date.now();
    const askRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ask",
        message: query,
        context: { user_id: userId },
        classification: classifyData,
      }),
    });

    const askData = await askRes.json();
    const askDuration = Date.now() - askStart;

    console.log(`⏱️  Ask took: ${askDuration}ms`);
    console.log(`📥 Response status: ${askRes.status}`);

    if (askRes.ok && askData.message) {
      console.log(`\n✅ Stock Analysis Response:`);
      console.log("─".repeat(80));
      console.log(askData.message.substring(0, 500));
      if (askData.message.length > 500) {
        console.log(`\n... (${askData.message.length - 500} more characters)`);
      }
      console.log("─".repeat(80));

      if (askData.stock_candidate) {
        console.log(
          `\n📈 Stock Candidate:`,
          JSON.stringify(askData.stock_candidate)
        );
      }

      if (askData.actions) {
        console.log(`\n🔘 Actions:`, JSON.stringify(askData.actions));
      }

      return {
        success: true,
        classification: classifyData,
        response: askData,
        durations: { classify: classifyDuration, ask: askDuration },
      };
    } else {
      console.error(`❌ Request failed:`, askData);
      return { success: false, error: askData };
    }
  } catch (error) {
    console.error(`❌ Error in full stock query:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test a single stock query end-to-end
 */
async function testSingleStock(query, options = {}) {
  const { skipFullQuery = false } = options;

  console.log("\n" + "═".repeat(80));
  console.log(`🧪 Testing Stock Analysis: "${query}"`);
  if (skipFullQuery) {
    console.log(`⚠️  Skipping full Finny API query (use --full to include)`);
  }
  console.log("═".repeat(80));

  const results = {
    detection: null,
    resolution: null,
    snapshot: null,
    executePlanCondition: null,
    fullQuery: null,
  };

  // 1. Test stock detection
  results.detection = testStockDetection(query);

  // 2. Test ticker resolution
  const ticker = results.detection.detection?.ticker;
  if (ticker) {
    results.resolution = await testTickerResolution(query, ticker);
  } else {
    results.resolution = await testTickerResolution(query);
  }

  // 3. Test stock snapshot (if we have a ticker)
  const resolvedTicker = results.resolution.ticker;
  if (resolvedTicker) {
    results.snapshot = await testStockSnapshot(resolvedTicker);

    // 3b. Test executeStockPlan condition (diagnostic)
    results.executePlanCondition = await testExecuteStockPlanCondition(
      resolvedTicker
    );
  } else {
    console.log(`\n⚠️  Skipping snapshot test - no ticker resolved`);
  }

  // 4. Test full query flow (optional)
  if (!skipFullQuery) {
    results.fullQuery = await testFullStockQuery(query);
  } else {
    console.log(`\n⏭️  Skipping full Finny API query test`);
    results.fullQuery = { success: null, skipped: true };
  }

  // Summary
  console.log("\n" + "═".repeat(80));
  console.log("📊 Test Summary");
  console.log("═".repeat(80));
  console.log(
    `✅ Stock Detection: ${results.detection.success ? "PASS" : "FAIL"}`
  );
  console.log(
    `✅ Ticker Resolution: ${results.resolution.success ? "PASS" : "FAIL"}`
  );
  if (results.snapshot) {
    console.log(
      `✅ Stock Snapshot: ${results.snapshot.success ? "PASS" : "FAIL"}`
    );
    if (results.snapshot.success) {
      console.log(`   - Has Price: ${results.snapshot.hasPrice ? "✅" : "❌"}`);
      console.log(
        `   - Has Profile: ${results.snapshot.hasProfile ? "✅" : "❌"}`
      );
      console.log(
        `   - Has Recommendations: ${
          results.snapshot.hasRecommendations ? "✅" : "❌"
        }`
      );
      console.log(
        `   - Has Metrics: ${results.snapshot.hasMetrics ? "✅" : "❌"}`
      );
      console.log(`   - Has News: ${results.snapshot.hasNews ? "✅" : "❌"}`);
    }
  }
  if (results.fullQuery?.skipped) {
    console.log(`⏭️  Full Query Flow: SKIPPED (use --full to test)`);
  } else {
    console.log(
      `✅ Full Query Flow: ${results.fullQuery?.success ? "PASS" : "FAIL"}`
    );
  }

  return results;
}

/**
 * Run all test cases
 */
async function runAllTests(options = {}) {
  const { skipFullQuery = false } = options;

  console.log("🚀 Running All Stock Analysis Tests");
  if (skipFullQuery) {
    console.log(`⚠️  Skipping full Finny API queries (use --full to include)`);
  }
  console.log("═".repeat(80));

  const results = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n\n${"=".repeat(80)}`);
    console.log(`Test Case: ${testCase.type} - "${testCase.query}"`);
    console.log("=".repeat(80));

    const result = await testSingleStock(testCase.query, { skipFullQuery });
    results.push({
      testCase,
      result,
      allPassed:
        result.detection.success &&
        result.resolution.success &&
        (result.snapshot?.success ?? true) &&
        (skipFullQuery ? true : result.fullQuery?.success),
    });

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Final summary
  console.log("\n\n" + "═".repeat(80));
  console.log("📊 Final Test Summary");
  console.log("═".repeat(80));

  const passed = results.filter((r) => r.allPassed).length;
  console.log(`✅ Passed: ${passed}/${results.length}`);

  results.forEach((r, idx) => {
    const status = r.allPassed ? "✅" : "❌";
    console.log(
      `${status} ${idx + 1}. ${r.testCase.type} - "${r.testCase.query}"`
    );
  });
}

/**
 * Test Finnhub API connectivity
 */
async function testFinnhubConnectivity() {
  console.log("\n🌐 Testing Finnhub API Connectivity");
  console.log("─".repeat(80));

  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY ||
    "d38i461r01qlbdj5kqe0d38i461r01qlbdj5kqeg";

  if (!apiKey) {
    console.error("❌ No Finnhub API key found in environment variables");
    console.error(
      "   Please set FINHUB_API_KEY, FINNHUB_API_KEY, or EXPO_PUBLIC_FINNHUB_API_KEY"
    );
    return false;
  }

  console.log(`✅ API Key found: ${apiKey.substring(0, 10)}...`);

  // Test with a simple quote request
  try {
    const testTicker = "AAPL";
    console.log(`\n🔍 Testing quote endpoint with ${testTicker}...`);
    const startTime = Date.now();
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${testTicker}&token=${apiKey}`
    );
    const duration = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Quote endpoint working (${duration}ms)`);
      console.log(`   Current price: $${data.c || "N/A"}`);
      return true;
    } else {
      console.error(
        `❌ Quote endpoint failed: ${response.status} ${response.statusText}`
      );
      return false;
    }
  } catch (error) {
    console.error(`❌ Connectivity test failed:`, error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log("📈 Stock Analysis Test Script");
  console.log("═".repeat(80));
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`👤 Test User: ${TEST_USER_ID}`);

  // Check API connectivity first
  const apiWorking = await testFinnhubConnectivity();
  if (!apiWorking) {
    console.error(
      "\n❌ Finnhub API is not working. Please check your API key."
    );
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  const skipFullQuery = !args.includes("--full");
  const query = args.find((arg) => !arg.startsWith("--"));

  if (!query) {
    console.log("\n❌ Please provide a query to test");
    console.log('Usage: node tests/test_stock_analysis.js "AAPL"');
    console.log('       node tests/test_stock_analysis.js "Apple"');
    console.log('       node tests/test_stock_analysis.js "What about Tesla?"');
    console.log("       node tests/test_stock_analysis.js all");
    console.log("\nOptions:");
    console.log(
      "  --full    Include full Finny API query test (default: skipped)"
    );
    console.log("\nExample queries:");
    TEST_CASES.slice(0, 5).forEach((q, i) => {
      console.log(`  ${i + 1}. "${q.query}" (${q.type})`);
    });
    return;
  }

  if (query === "all") {
    await runAllTests({ skipFullQuery });
  } else {
    await testSingleStock(query, { skipFullQuery });
  }
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Run the script
if (import.meta.url === new URL(import.meta.url).href) {
  main().catch(console.error);
}

export {
  testSingleStock,
  testTickerResolution,
  testStockSnapshot,
  testStockDetection,
  testFullStockQuery,
  testFinnhubConnectivity,
  TEST_CASES,
};
