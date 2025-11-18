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
