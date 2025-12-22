#!/usr/bin/env node

/**
 * Finny Test Script
 *
 * Test the Finny API directly without UI to verify context planner functionality.
 *
 * Usage:
 *   node test_finny.js "What were my food expenses last month?"
 *   node test_finny.js "What are my current accounts and investments?"
 *   node test_finny.js "Do you think I can achieve my goals?"
 */

import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Configuration
const BASE_URL =
  process.env.APP_BASE_URL || "https://financify-rose.vercel.app";
const TEST_USER_ID =
  process.env.TEST_USER_ID || "79952f35-b607-40d6-a32e-d81386882eb7";

// Test queries to verify different scenarios
const TEST_QUERIES = [
  // Spend queries - should get spend_total + txns_by_category
  "What were my food expenses last month?",
  "How much did I spend on shopping last month?",
  "What were my transportation costs this month?",

  // Investment queries - should get summary_min + invest_holdings
  "What are my current accounts and investments?",
  "Show me my investment portfolio",
  "What stocks do I own?",
  "How is my retirement planning going?",

  // Goals queries - should get goals_overview + cashflow_monthly
  "Do you think I can achieve my goals?",
  "How am I doing with my savings goals?",
  "Can I afford to buy a house?",

  // Account queries - should get summary_min only
  "What are my account balances?",
  "Show me my bank accounts",

  // General queries - should get summary_min
  "What's my net worth?",
  "How am I doing financially?",
];

async function testFinnyQuery(message, userId = TEST_USER_ID) {
  console.log(`\n🧪 Testing: "${message}"`);
  console.log(`👤 User ID: ${userId}`);
  console.log("─".repeat(80));

  try {
    // Step 1: Classify the message
    console.log("🎯 Step 1: Classifying message...");
    console.log(`📤 [REQUEST] Sending classification request:`);
    console.log(`   - Message: "${message}"`);
    console.log(`   - Message length: ${message.length}`);
    console.log(`   - Message type: ${typeof message}`);
    console.log(`   - User ID: ${userId}`);
    
    const classifyRequestStart = Date.now();
    const classifyRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "classify",
        message: message,
        context: { user_id: userId },
      }),
    });

    const classifyRequestTime = Date.now() - classifyRequestStart;
    console.log(`⏱️  [TIMING] Classification request took: ${classifyRequestTime}ms`);
    console.log(`📥 [RESPONSE] Status: ${classifyRes.status} ${classifyRes.statusText}`);

    const classifyData = await classifyRes.json();
    console.log(`\n📊 [CLASSIFICATION] Full response:`);
    console.log(JSON.stringify(classifyData, null, 2));
    console.log(`\n✅ Classification Result:`);
    console.log(`   - Intent: ${classifyData.intent}`);
    console.log(`   - Intent Type: ${classifyData.intent_type || 'null'}`);
    console.log(`   - Confidence: ${classifyData.confidence || 'N/A'}`);
    console.log(`   - Ticker: ${classifyData.ticker || 'null'}`);
    console.log(`   - Entities: ${JSON.stringify(classifyData.entities || [])}`);
    console.log(`   - Needs Web: ${classifyData.needs_web}`);
    console.log(`   - Needs User Data: ${classifyData.needs_user_data}`);
    console.log(`   - Emotional State: ${classifyData.emotional_state || 'N/A'}`);
    if (classifyData.fallback) {
      console.log(`   ⚠️  FALLBACK USED`);
    }
    if (classifyData.timeout_fallback) {
      console.log(`   ⏰ TIMEOUT FALLBACK USED`);
    }

    // Step 2: Ask Finny
    console.log("\n🤖 Step 2: Asking Finny...");
    console.log(`📤 [REQUEST] Sending ask request:`);
    console.log(`   - Message: "${message}"`);
    console.log(`   - Classification intent: ${classifyData.intent}`);
    console.log(`   - Classification ticker: ${classifyData.ticker || 'null'}`);
    console.log(`   - User ID: ${userId}`);
    
    const askRequestStart = Date.now();
    const askRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ask",
        message: message,
        context: { user_id: userId },
        classification: classifyData, // Pass classification result
      }),
    });

    const askRequestTime = Date.now() - askRequestStart;
    console.log(`⏱️  [TIMING] Ask request took: ${askRequestTime}ms`);
    console.log(`📥 [RESPONSE] Status: ${askRes.status} ${askRes.statusText}`);

    const askData = await askRes.json();
    console.log(`\n📊 [ASK] Response received:`);
    if (askData.message) {
      console.log(`   - Message length: ${askData.message.length} chars`);
      console.log(`   - Message preview: ${askData.message.substring(0, 200)}...`);
    }

    if (askRes.ok) {
      console.log("\n✅ [SUCCESS] Full response received:");
      console.log("─".repeat(80));
      console.log(askData.message);
      console.log("─".repeat(80));

      // Log context packs info if available
      if (askData.context_packs) {
        console.log(
          `\n📦 Context packs used: ${askData.context_packs.join(", ")}`
        );
      }
      if (askData.data_gaps) {
        console.log(`\n⚠️  Data gaps: ${askData.data_gaps.join(", ")}`);
      }
      if (askData.stock_candidate) {
        console.log(`\n📈 Stock candidate: ${JSON.stringify(askData.stock_candidate)}`);
      }
      if (askData.actions) {
        console.log(`\n🔘 Actions available: ${JSON.stringify(askData.actions)}`);
      }

      // Compare classification vs actual handling
      console.log(`\n🔍 [COMPARISON] Classification vs Handling:`);
      console.log(`   - Classification intent: ${classifyData.intent}`);
      console.log(`   - Classification ticker: ${classifyData.ticker || 'null'}`);
      if (askData.intent) {
        console.log(`   - Response intent: ${askData.intent}`);
      }
      if (askData.stock_candidate?.ticker) {
        console.log(`   - Stock candidate ticker: ${askData.stock_candidate.ticker}`);
      }

      return askData;
    } else {
      console.error("\n❌ [ERROR] Request failed:");
      console.error(`   - Status: ${askRes.status}`);
      console.error(`   - Response:`, JSON.stringify(askData, null, 2));
      return null;
    }
  } catch (error) {
    console.error("\n❌ [EXCEPTION] Test failed:");
    console.error(`   - Error: ${error.message}`);
    console.error(`   - Stack: ${error.stack}`);
    return null;
  }
}

async function runAllTests() {
  console.log("🚀 Running all Finny tests...");
  console.log("═".repeat(80));

  const results = [];

  for (const query of TEST_QUERIES) {
    const result = await testFinnyQuery(query);
    results.push({ query, success: !!result, response: result?.message });

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  console.log("\n📊 Test Summary:");
  console.log("═".repeat(80));
  const successful = results.filter((r) => r.success).length;
  console.log(`✅ Successful: ${successful}/${results.length}`);

  results.forEach((result, index) => {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${index + 1}. ${result.query.substring(0, 50)}...`);
  });
}

async function testSpecificQuery() {
  const query = process.argv[2];

  if (!query) {
    console.log("❌ Please provide a query to test");
    console.log('Usage: node test_finny.js "Your question here"');
    console.log("\nExample queries:");
    TEST_QUERIES.slice(0, 5).forEach((q, i) => {
      console.log(`  ${i + 1}. "${q}"`);
    });
    return;
  }

  await testFinnyQuery(query);
}

// Main execution
async function main() {
  console.log("🎭 Finny Test Script");
  console.log("═".repeat(80));
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`👤 Test User: ${TEST_USER_ID}`);

  if (process.argv[2] === "timeout") {
    // Test timeout mechanism specifically
    await testClassificationTimeout();
  } else if (process.argv[2]) {
    // Test specific query
    await testSpecificQuery();
  } else {
    // Run all tests including timeout test
    await runAllTests();
    console.log("\n" + "═".repeat(80));
    await testClassificationTimeout();
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

// Test timeout mechanism
async function testClassificationTimeout() {
  console.log("\n🧪 Testing classification timeout mechanism...");

  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "classify",
        message: "What's the latest on AMD?",
        context: {
          user_id: TEST_USER_ID,
        },
      }),
    });

    const result = await response.json();
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`⏱️  Classification completed in ${duration}ms`);
    console.log("📋 Classification result:", JSON.stringify(result, null, 2));

    if (result.timeout_fallback) {
      console.log("✅ Timeout fallback mechanism working correctly");
    } else if (duration > 4000) {
      console.log(
        "⚠️  Classification took longer than 4 seconds but no timeout detected"
      );
    } else {
      console.log("✅ Classification completed within timeout window");
    }

    return { success: true, duration, result };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.error("❌ Classification test failed:", error.message);
    return { success: false, duration, error: error.message };
  }
}

// Run the script
if (import.meta.url === new URL(import.meta.url).href) {
  main().catch(console.error);
}

export { testFinnyQuery, TEST_QUERIES, testClassificationTimeout };
