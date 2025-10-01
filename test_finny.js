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

const fetch = require("node-fetch");
require("dotenv").config();

// Configuration
const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
const TEST_USER_ID = process.env.TEST_USER_ID || "test-user-123";

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
    const classifyRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "classify",
        message: message,
        context: { user_id: userId },
      }),
    });

    const classifyData = await classifyRes.json();
    console.log(`✅ Classification: ${classifyData.intent}`);

    // Step 2: Ask Finny
    console.log("🤖 Step 2: Asking Finny...");
    const askRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ask",
        message: message,
        context: { user_id: userId },
      }),
    });

    const askData = await askRes.json();

    if (askRes.ok) {
      console.log("✅ Response received:");
      console.log("─".repeat(40));
      console.log(askData.message);
      console.log("─".repeat(40));

      // Log context packs info if available
      if (askData.context_packs) {
        console.log(
          `📦 Context packs used: ${askData.context_packs.join(", ")}`
        );
      }
      if (askData.data_gaps) {
        console.log(`⚠️  Data gaps: ${askData.data_gaps.join(", ")}`);
      }

      return askData;
    } else {
      console.error("❌ Error:", askData);
      return null;
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
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

  if (process.argv[2]) {
    // Test specific query
    await testSpecificQuery();
  } else {
    // Run all tests
    await runAllTests();
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
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testFinnyQuery, TEST_QUERIES };
