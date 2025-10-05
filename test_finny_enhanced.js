#!/usr/bin/env node

/**
 * Enhanced Finny Test Script
 *
 * A comprehensive testing tool for the Finny system that allows you to:
 * - Test individual queries
 * - Run batch tests with different scenarios
 * - Test memory system functionality
 * - Test goal management
 * - Test investment queries
 * - Interactive mode for real-time testing
 *
 * Usage:
 *   node test_finny_enhanced.js                           # Interactive mode
 *   node test_finny_enhanced.js "Your question here"      # Test specific query
 *   node test_finny_enhanced.js --batch                   # Run all batch tests
 *   node test_finny_enhanced.js --memory                  # Test memory system
 *   node test_finny_enhanced.js --goals                   # Test goal functionality
 *   node test_finny_enhanced.js --investments             # Test investment queries
 *   node test_finny_enhanced.js --spending                # Test spending queries
 */

const fetch = require("node-fetch");
const readline = require("readline");
require("dotenv").config();

// Configuration
const BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
const TEST_USER_ID = process.env.TEST_USER_ID || "test-user-123";

// Color codes for console output
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

// Test categories with different types of queries
const TEST_CATEGORIES = {
  spending: [
    "What were my food expenses last month?",
    "How much did I spend on shopping this month?",
    "What were my transportation costs last month?",
    "Show me my restaurant spending",
    "How much do I spend on groceries?",
    "What's my biggest expense category?",
    "How much did I spend on entertainment?",
    "Break down my spending by category",
  ],

  investments: [
    "What are my current accounts and investments?",
    "Show me my investment portfolio",
    "What stocks do I own?",
    "How is my retirement planning going?",
    "What's my total investment value?",
    "How are my investments performing?",
    "Show me my portfolio allocation",
    "What's my investment return this year?",
  ],

  goals: [
    "Do you think I can achieve my goals?",
    "How am I doing with my savings goals?",
    "Can I afford to buy a house?",
    "What should I prioritize for my financial goals?",
    "How much should I save for retirement?",
    "Am I on track for my vacation fund?",
    "Should I increase my emergency fund?",
    "What's my progress on paying off debt?",
  ],

  accounts: [
    "What are my account balances?",
    "Show me my bank accounts",
    "What's my checking account balance?",
    "How much is in my savings?",
    "What's my total net worth?",
    "Show me all my financial accounts",
    "What's my available cash?",
    "How much credit do I have available?",
  ],

  general: [
    "How am I doing financially?",
    "Give me a financial overview",
    "What's my financial health like?",
    "What should I focus on financially?",
    "How can I improve my finances?",
    "What are my financial strengths?",
    "What should I be concerned about?",
    "Give me financial advice",
  ],

  memory: [
    "Remember that I prefer to save 20% of my income",
    "I work as a software engineer",
    "My goal is to buy a house in 3 years",
    "I have a dog named Max",
    "I prefer index funds for investing",
    "Remember that I travel for work frequently",
    "I'm planning to start a side business",
    "I prefer to eat out on weekends",
  ],
};

// Utility functions
function log(message, color = "white") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(title) {
  log(`\n${colors.cyan}${"═".repeat(80)}${colors.reset}`);
  log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  log(`${colors.cyan}${"═".repeat(80)}${colors.reset}`);
}

function logSection(title) {
  log(`\n${colors.yellow}${"─".repeat(60)}${colors.reset}`);
  log(`${colors.bright}${colors.yellow}${title}${colors.reset}`);
  log(`${colors.yellow}${"─".repeat(60)}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, "green");
}

function logError(message) {
  log(`❌ ${message}`, "red");
}

function logWarning(message) {
  log(`⚠️  ${message}`, "yellow");
}

function logInfo(message) {
  log(`ℹ️  ${message}`, "blue");
}

// Core testing functions
async function testFinnyQuery(
  message,
  userId = TEST_USER_ID,
  showDetails = true
) {
  if (showDetails) {
    logSection(`Testing: "${message}"`);
    logInfo(`User ID: ${userId}`);
  }

  try {
    const startTime = Date.now();

    // Step 1: Classify the message
    if (showDetails) log("🎯 Step 1: Classifying message...");
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
    if (showDetails) logSuccess(`Classification: ${classifyData.intent}`);

    // Step 2: Ask Finny
    if (showDetails) log("🤖 Step 2: Asking Finny...");
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
    const responseTime = Date.now() - startTime;

    if (askRes.ok) {
      if (showDetails) {
        logSuccess("Response received:");
        log("─".repeat(40), "cyan");
        log(askData.message);
        log("─".repeat(40), "cyan");
        logInfo(`Response time: ${responseTime}ms`);
      }

      // Log context packs info if available
      if (askData.context_packs && showDetails) {
        logInfo(`Context packs used: ${askData.context_packs.join(", ")}`);
      }
      if (askData.data_gaps && showDetails) {
        logWarning(`Data gaps: ${askData.data_gaps.join(", ")}`);
      }

      return {
        success: true,
        message: askData.message,
        intent: classifyData.intent,
        context_packs: askData.context_packs || [],
        data_gaps: askData.data_gaps || [],
        response_time: responseTime,
        error: null,
      };
    } else {
      const errorMsg = askData.error || askData.message || "Unknown error";
      if (showDetails) logError(`Error: ${errorMsg}`);
      return {
        success: false,
        message: null,
        intent: classifyData.intent,
        context_packs: [],
        data_gaps: [],
        response_time: responseTime,
        error: errorMsg,
      };
    }
  } catch (error) {
    const errorMsg = error.message;
    if (showDetails) logError(`Test failed: ${errorMsg}`);
    return {
      success: false,
      message: null,
      intent: null,
      context_packs: [],
      data_gaps: [],
      response_time: 0,
      error: errorMsg,
    };
  }
}

// Batch testing functions
async function runBatchTests(category = null) {
  logHeader("Running Batch Tests");

  const categories = category ? [category] : Object.keys(TEST_CATEGORIES);
  const results = [];

  for (const cat of categories) {
    logSection(`Testing ${cat.toUpperCase()} queries`);
    const queries = TEST_CATEGORIES[cat];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      log(`\n[${i + 1}/${queries.length}] Testing: "${query}"`);

      const result = await testFinnyQuery(query, TEST_USER_ID, false);
      results.push({ category: cat, query, ...result });

      // Show quick result
      if (result.success) {
        logSuccess(`✅ ${result.intent} - ${result.response_time}ms`);
      } else {
        logError(`❌ ${result.error}`);
      }

      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Summary
  logHeader("Test Summary");
  const successful = results.filter((r) => r.success).length;
  const total = results.length;
  logSuccess(
    `Successful: ${successful}/${total} (${Math.round(
      (successful / total) * 100
    )}%)`
  );

  // Group by category
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catSuccessful = catResults.filter((r) => r.success).length;
    log(
      `${colors.cyan}${cat.toUpperCase()}:${colors.reset} ${catSuccessful}/${
        catResults.length
      } successful`
    );
  }

  // Show failures
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    logSection("Failed Tests");
    failures.forEach((failure, index) => {
      logError(`${index + 1}. [${failure.category}] ${failure.query}`);
      log(`   Error: ${failure.error}`, "red");
    });
  }

  return results;
}

// Memory system testing
async function testMemorySystem() {
  logHeader("Testing Memory System");

  const memoryQueries = TEST_CATEGORIES.memory;
  const results = [];

  for (const query of memoryQueries) {
    logSection(`Testing memory: "${query}"`);

    // Test the query
    const result = await testFinnyQuery(query, TEST_USER_ID, false);
    results.push(result);

    if (result.success) {
      logSuccess("Memory stored successfully");
    } else {
      logError(`Failed to store memory: ${result.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Test memory retrieval
  logSection("Testing Memory Retrieval");
  const retrievalQueries = [
    "What do you remember about my preferences?",
    "What goals have I mentioned?",
    "Tell me what you know about me",
    "What should I remember about my work?",
  ];

  for (const query of retrievalQueries) {
    log(`\nTesting retrieval: "${query}"`);
    const result = await testFinnyQuery(query, TEST_USER_ID, false);

    if (result.success) {
      logSuccess("Memory retrieved successfully");
      log(result.message.substring(0, 100) + "...");
    } else {
      logError(`Failed to retrieve memory: ${result.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

// Interactive mode
async function interactiveMode() {
  logHeader("Interactive Finny Testing");
  log("Type your questions below. Type 'quit', 'exit', or 'q' to stop.");
  log("Special commands:");
  log("  'help' - Show available commands");
  log("  'stats' - Show testing statistics");
  log("  'clear' - Clear screen");
  log("  'user <id>' - Change user ID");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.green}Finny> ${colors.reset}`,
  });

  let stats = { total: 0, successful: 0, failed: 0 };
  let currentUserId = TEST_USER_ID;

  rl.prompt();

  rl.on("line", async (input) => {
    const command = input.trim();

    if (command === "quit" || command === "exit" || command === "q") {
      log("\nGoodbye! 👋");
      rl.close();
      return;
    }

    if (command === "help") {
      log("\nAvailable commands:");
      log("  help     - Show this help");
      log("  stats    - Show testing statistics");
      log("  clear    - Clear screen");
      log("  user <id> - Change user ID");
      log("  quit/exit/q - Exit interactive mode");
      log("\nOr just type your question!");
      rl.prompt();
      return;
    }

    if (command === "stats") {
      log(`\n📊 Testing Statistics:`);
      log(`Total queries: ${stats.total}`);
      log(
        `Successful: ${stats.successful} (${Math.round(
          (stats.successful / stats.total) * 100
        )}%)`
      );
      log(`Failed: ${stats.failed}`);
      log(`Current user: ${currentUserId}`);
      rl.prompt();
      return;
    }

    if (command === "clear") {
      console.clear();
      rl.prompt();
      return;
    }

    if (command.startsWith("user ")) {
      currentUserId = command.substring(5).trim();
      log(`User ID changed to: ${currentUserId}`);
      rl.prompt();
      return;
    }

    if (command === "") {
      rl.prompt();
      return;
    }

    // Test the query
    log(`\n🧪 Testing with user: ${currentUserId}`);
    const result = await testFinnyQuery(command, currentUserId, true);

    stats.total++;
    if (result.success) {
      stats.successful++;
    } else {
      stats.failed++;
    }

    rl.prompt();
  });

  rl.on("close", () => {
    log("\nSession ended.");
    process.exit(0);
  });
}

// Performance testing
async function performanceTest() {
  logHeader("Performance Testing");

  const testQuery = "What's my financial overview?";
  const iterations = 10;
  const results = [];

  log(`Running ${iterations} iterations of: "${testQuery}"`);

  for (let i = 0; i < iterations; i++) {
    log(`Iteration ${i + 1}/${iterations}...`);
    const result = await testFinnyQuery(testQuery, TEST_USER_ID, false);
    results.push(result);

    if (result.success) {
      logSuccess(`${result.response_time}ms`);
    } else {
      logError(`Failed: ${result.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const successful = results.filter((r) => r.success);
  if (successful.length > 0) {
    const avgTime =
      successful.reduce((sum, r) => sum + r.response_time, 0) /
      successful.length;
    const minTime = Math.min(...successful.map((r) => r.response_time));
    const maxTime = Math.max(...successful.map((r) => r.response_time));

    logSection("Performance Results");
    logSuccess(`Average response time: ${Math.round(avgTime)}ms`);
    logSuccess(`Fastest response: ${minTime}ms`);
    logSuccess(`Slowest response: ${maxTime}ms`);
    logSuccess(
      `Success rate: ${successful.length}/${iterations} (${Math.round(
        (successful.length / iterations) * 100
      )}%)`
    );
  }

  return results;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  logHeader("Enhanced Finny Test Script");
  log(`🌐 Base URL: ${BASE_URL}`);
  log(`👤 Test User: ${TEST_USER_ID}`);

  if (args.length === 0) {
    // Interactive mode
    await interactiveMode();
  } else if (args[0] === "--batch") {
    // Run all batch tests
    await runBatchTests();
  } else if (args[0] === "--memory") {
    // Test memory system
    await testMemorySystem();
  } else if (args[0] === "--goals") {
    // Test goal functionality
    await runBatchTests("goals");
  } else if (args[0] === "--investments") {
    // Test investment queries
    await runBatchTests("investments");
  } else if (args[0] === "--spending") {
    // Test spending queries
    await runBatchTests("spending");
  } else if (args[0] === "--performance") {
    // Performance testing
    await performanceTest();
  } else if (args[0] === "--help") {
    // Show help
    log("\nEnhanced Finny Test Script Usage:");
    log(
      "  node test_finny_enhanced.js                           # Interactive mode"
    );
    log(
      '  node test_finny_enhanced.js "Your question here"      # Test specific query'
    );
    log(
      "  node test_finny_enhanced.js --batch                   # Run all batch tests"
    );
    log(
      "  node test_finny_enhanced.js --memory                  # Test memory system"
    );
    log(
      "  node test_finny_enhanced.js --goals                   # Test goal functionality"
    );
    log(
      "  node test_finny_enhanced.js --investments             # Test investment queries"
    );
    log(
      "  node test_finny_enhanced.js --spending                # Test spending queries"
    );
    log(
      "  node test_finny_enhanced.js --performance             # Run performance tests"
    );
    log(
      "  node test_finny_enhanced.js --help                    # Show this help"
    );
  } else {
    // Test specific query
    const query = args.join(" ");
    await testFinnyQuery(query);
  }
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logError(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logError(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testFinnyQuery,
  runBatchTests,
  testMemorySystem,
  performanceTest,
  TEST_CATEGORIES,
};
