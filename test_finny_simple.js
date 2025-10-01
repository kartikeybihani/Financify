#!/usr/bin/env node

/**
 * Simple Finny Test Script (No external dependencies)
 *
 * Uses Node.js built-in modules only to test Finny API.
 *
 * Usage:
 *   node test_finny_simple.js "What were my food expenses last month?"
 */

import https from "https";
import http from "http";
import { URL } from "url";

// Configuration
const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
const TEST_USER_ID =
  process.env.TEST_USER_ID || "79952f35-b607-40d6-a32e-d81386882eb7";

// Simple HTTP request function
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    const req = client.request(requestOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (error) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testFinnyQuery(message, userId = TEST_USER_ID) {
  console.log(`\n🧪 Testing: "${message}"`);
  console.log(`👤 User ID: ${userId}`);
  console.log("─".repeat(80));

  try {
    // Step 1: Classify the message
    console.log("🎯 Step 1: Classifying message...");
    const classifyResult = await makeRequest(`${BASE_URL}/api/finny`, {
      method: "POST",
      body: {
        action: "classify",
        message: message,
        context: { user_id: userId },
      },
    });

    if (classifyResult.status !== 200) {
      console.error("❌ Classification failed:", classifyResult.data);
      return null;
    }

    console.log(`✅ Classification: ${classifyResult.data.intent}`);

    // Step 2: Ask Finny
    console.log("🤖 Step 2: Asking Finny...");
    const askResult = await makeRequest(`${BASE_URL}/api/finny`, {
      method: "POST",
      body: {
        action: "ask",
        message: message,
        context: { user_id: userId },
      },
    });

    if (askResult.status !== 200) {
      console.error("❌ Ask failed:", askResult.data);
      return null;
    }

    console.log("✅ Response received:");
    console.log("─".repeat(40));
    console.log(askResult.data.message);
    console.log("─".repeat(40));

    // Log context packs info if available
    if (askResult.data.context_packs) {
      console.log(
        `📦 Context packs used: ${askResult.data.context_packs.join(", ")}`
      );
    }
    if (askResult.data.data_gaps) {
      console.log(`⚠️  Data gaps: ${askResult.data.data_gaps.join(", ")}`);
    }

    return askResult.data;
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return null;
  }
}

// Test queries
const TEST_QUERIES = [
  "What were my food expenses last month?",
  "What are my current accounts and investments?",
  "Do you think I can achieve my goals?",
  "What's my net worth?",
  "How much did I spend on shopping last month?",
];

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
    console.log('Usage: node test_finny_simple.js "Your question here"');
    console.log("\nExample queries:");
    TEST_QUERIES.forEach((q, i) => {
      console.log(`  ${i + 1}. "${q}"`);
    });
    return;
  }

  await testFinnyQuery(query);
}

// Main execution
async function main() {
  console.log("🎭 Simple Finny Test Script");
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
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testFinnyQuery, TEST_QUERIES };
