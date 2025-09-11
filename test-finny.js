#!/usr/bin/env node

// test-finny.js - Quick test script for Finny API
// Usage: node test-finny.js "your query here"

import https from "https";
import http from "http";

// Configuration
const API_BASE_URL = "https://financify-rose.vercel.app";
const API_ENDPOINT = "/api/finny";

// Test queries - you can modify these or pass custom ones via command line
const TEST_QUERIES = [
  "What are the Chase Ultimate card benefits?",
  "Which is better chase sapphire card or Amex platinum?",
  "Which is a better chase sapphire card or bilt card?",
  "What is the 2025 estate tax exemption?",
  "Chase Sapphire Preferred vs Amex Gold",
  "What are the benefits of the Bilt Rewards card?",
  "Compare Chase Sapphire Reserve vs Amex Platinum",
  "What is the 2025 IRA contribution limit?",
  "Chase Freedom Unlimited benefits",
  "Amex Gold card annual fee and benefits",
];

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function makeRequest(query, action = "ask_fact_fresh") {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      action: action,
      message: query,
      context: {
        entities: [],
      },
    });

    const options = {
      hostname: "financify-rose.vercel.app",
      port: 443,
      path: API_ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "Finny-Test-Script/1.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: response,
          });
        } catch (error) {
          reject(
            new Error(
              `Failed to parse response: ${error.message}\nRaw data: ${data}`
            )
          );
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function formatResponse(response, query) {
  const { status, data } = response;

  console.log(colorize(`\n${"=".repeat(80)}`, "cyan"));
  console.log(colorize(`Query: ${query}`, "bright"));
  console.log(colorize(`Status: ${status}`, status === 200 ? "green" : "red"));
  console.log(colorize(`${"=".repeat(80)}`, "cyan"));

  if (status !== 200) {
    console.log(colorize(`Error: ${data.error || "Unknown error"}`, "red"));
    return;
  }

  // Display response details
  if (data.intent) {
    console.log(colorize(`Intent: ${data.intent}`, "blue"));
  }

  if (data.cached !== undefined) {
    console.log(
      colorize(`Cached: ${data.cached}`, data.cached ? "yellow" : "green")
    );
  }

  if (data.error) {
    console.log(colorize(`Error: ${data.error}`, "red"));
  }

  if (data.message) {
    console.log(colorize("\nResponse:", "bright"));
    console.log(data.message);
  }

  if (data.type) {
    console.log(colorize(`\nType: ${data.type}`, "magenta"));
  }
}

async function testQuery(query) {
  try {
    console.log(colorize(`\n🔍 Testing: "${query}"`, "bright"));

    const startTime = Date.now();
    const response = await makeRequest(query);
    const endTime = Date.now();

    formatResponse(response, query);
    console.log(
      colorize(`\n⏱️  Response time: ${endTime - startTime}ms`, "cyan")
    );
  } catch (error) {
    console.log(colorize(`\n❌ Error testing query: ${error.message}`, "red"));
  }
}

async function runAllTests() {
  console.log(colorize("🚀 Starting Finny API Tests", "bright"));
  console.log(
    colorize(`Testing ${TEST_QUERIES.length} predefined queries...`, "blue")
  );

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const query = TEST_QUERIES[i];
    console.log(colorize(`\n[${i + 1}/${TEST_QUERIES.length}]`, "yellow"));
    await testQuery(query);

    // Add a small delay between requests to be respectful
    if (i < TEST_QUERIES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(colorize("\n✅ All tests completed!", "green"));
}

async function testCustomQuery(query) {
  console.log(colorize("🚀 Testing Custom Query", "bright"));
  await testQuery(query);
}

function showHelp() {
  console.log(colorize("Finny API Test Script", "bright"));
  console.log(colorize("====================", "bright"));
  console.log("");
  console.log("Usage:");
  console.log(
    "  node test-finny.js                    # Run all predefined tests"
  );
  console.log('  node test-finny.js "your query"       # Test a custom query');
  console.log("  node test-finny.js --help             # Show this help");
  console.log("");
  console.log("Examples:");
  console.log('  node test-finny.js "Chase Sapphire Preferred benefits"');
  console.log('  node test-finny.js "Compare Amex Gold vs Chase Sapphire"');
  console.log('  node test-finny.js "What is the 2025 estate tax exemption?"');
  console.log("");
  console.log("Predefined test queries:");
  TEST_QUERIES.forEach((query, index) => {
    console.log(`  ${index + 1}. ${query}`);
  });
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No arguments - run all tests
    await runAllTests();
  } else if (args[0] === "--help" || args[0] === "-h") {
    showHelp();
  } else {
    // Custom query provided
    const query = args.join(" ");
    await testCustomQuery(query);
  }
}

// Handle uncaught errors gracefully
process.on("uncaughtException", (error) => {
  console.log(colorize(`\n❌ Uncaught Exception: ${error.message}`, "red"));
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.log(
    colorize(
      `\n❌ Unhandled Rejection at: ${promise}, reason: ${reason}`,
      "red"
    )
  );
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.log(colorize(`\n❌ Main execution error: ${error.message}`, "red"));
  process.exit(1);
});
