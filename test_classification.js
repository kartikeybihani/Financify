/**
 * Classification Layer Test Suite
 * Tests the handleClassify function for accuracy, edge cases, and performance
 */

// Test configuration - UPDATE THESE VALUES
const TEST_CONFIG = {
  // API Configuration
  API_BASE_URL: "https://financify-rose.vercel.app/", // e.g., 'http://localhost:3000/api'
  OPENROUTER_API_KEY:
    "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",

  // Test thresholds
  ACCURACY_THRESHOLD: 0.85, // Minimum accuracy expected
  RESPONSE_TIME_THRESHOLD: 8000, // Max response time in ms
  CONFIDENCE_THRESHOLD: 0.7, // Minimum confidence for valid classifications

  // Test data
  TEST_MESSAGES: {
    // ask_personalized cases
    ask_personalized: [
      "How much did I spend last month?",
      "What's my current net worth?",
      "Show me my recent transactions",
      "How am I doing financially?",
      "What are my biggest expenses?",
      "Can I afford a $500 purchase?",
      "How much should I save each month?",
      "What's my spending pattern?",
      "Am I spending too much on food?",
      "How much do I have in savings?",
    ],

    // goal_conversation cases
    goal_conversation: [
      "I want to save $10,000 for a house down payment",
      "Set a goal to save $5,000 by December",
      "I need to build an emergency fund",
      "How can I save for retirement?",
      "I want to pay off my credit card debt",
      "Help me create a savings plan",
      "I'm saving for a vacation",
      "What's a good savings goal?",
      "I want to invest $1,000 monthly",
      "Help me plan for a major purchase",
    ],

    // off_topic cases
    off_topic: [
      "What's the weather like today?",
      "How do I cook pasta?",
      "What movie should I watch?",
      "Tell me a joke",
      "What's 2+2?",
      "How are you doing?",
      "What's your favorite color?",
      "Can you help me with my homework?",
      "What's the capital of France?",
      "How do I fix my computer?",
    ],

    // needs_web cases (should trigger web search)
    needs_web: [
      "What is the Roth IRA contribution limit for 2025?",
      "What are the current mortgage rates?",
      "What's the latest news on Tesla stock?",
      "What are the best credit cards right now?",
      "What's the current inflation rate?",
      "What are the 2024 tax brackets?",
      "What's the current federal funds rate?",
      "What are analysts saying about Apple?",
      "What's the latest on the housing market?",
      "What are the current CD rates?",
    ],

    // Edge cases
    edge_cases: [
      "", // Empty string
      "   ", // Whitespace only
      "a", // Single character
      "What is the difference between a Roth IRA and traditional IRA?", // Financial concept
      "Should I rent or buy in Phoenix?", // Location-specific
      "Can I hit FIRE by 35?", // FIRE planning
      "Will I have enough to retire?", // Retirement planning
      "What's the difference between credit and debit cards?", // Educational
      "How do I apply for a credit card?", // Action-oriented
      "What's my credit score?", // Personal data query
    ],

    // Ambiguous cases
    ambiguous: [
      "I want to save money", // Could be goal or ask
      "Help me with my finances", // Could be goal or ask
      "I need financial advice", // Could be goal or ask
      "What should I do with my money?", // Could be goal or ask
      "I'm struggling financially", // Could be goal or ask
      "How can I be better with money?", // Could be goal or ask
      "I want to be financially secure", // Could be goal or ask
      "What's the best way to save?", // Could be goal or ask
      "I need help with budgeting", // Could be goal or ask
      "How do I start investing?", // Could be goal or ask
    ],
  },
};

// Test results storage
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  responseTimes: [],
  accuracy: 0,
  details: [],
};

/**
 * Test a single classification
 */
async function testClassification(
  message,
  expectedIntent,
  expectedNeedsWeb = null,
  expectedNeedsUserData = null
) {
  const startTime = Date.now();

  try {
    console.log(`\n🧪 Testing: "${message}"`);
    console.log(
      `Expected: ${expectedIntent}${
        expectedNeedsWeb !== null ? `, needs_web: ${expectedNeedsWeb}` : ""
      }${
        expectedNeedsUserData !== null
          ? `, needs_user_data: ${expectedNeedsUserData}`
          : ""
      }`
    );

    // Make API call to your classification endpoint
    const response = await fetch(`${TEST_CONFIG.API_BASE_URL}/finny`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_CONFIG.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        message: message,
        context: { user_id: "test_user" },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    // Extract classification result (adjust based on your API response structure)
    const classification = data.classification_result || data;

    console.log(
      `Got: ${classification.intent}, needs_web: ${classification.needs_web}, needs_user_data: ${classification.needs_user_data}`
    );
    console.log(
      `Confidence: ${classification.confidence}, Response time: ${responseTime}ms`
    );

    // Test assertions
    const tests = [
      {
        name: "Intent matches",
        passed: classification.intent === expectedIntent,
        expected: expectedIntent,
        actual: classification.intent,
      },
    ];

    if (expectedNeedsWeb !== null) {
      tests.push({
        name: "needs_web matches",
        passed: classification.needs_web === expectedNeedsWeb,
        expected: expectedNeedsWeb,
        actual: classification.needs_web,
      });
    }

    if (expectedNeedsUserData !== null) {
      tests.push({
        name: "needs_user_data matches",
        passed: classification.needs_user_data === expectedNeedsUserData,
        expected: expectedNeedsUserData,
        actual: classification.needs_user_data,
      });
    }

    // Check response time
    tests.push({
      name: "Response time acceptable",
      passed: responseTime <= TEST_CONFIG.RESPONSE_TIME_THRESHOLD,
      expected: `<= ${TEST_CONFIG.RESPONSE_TIME_THRESHOLD}ms`,
      actual: `${responseTime}ms`,
    });

    // Check confidence
    tests.push({
      name: "Confidence acceptable",
      passed: classification.confidence >= TEST_CONFIG.CONFIDENCE_THRESHOLD,
      expected: `>= ${TEST_CONFIG.CONFIDENCE_THRESHOLD}`,
      actual: classification.confidence,
    });

    const allPassed = tests.every((test) => test.passed);

    testResults.total++;
    if (allPassed) {
      testResults.passed++;
      console.log("✅ PASSED");
    } else {
      testResults.failed++;
      console.log("❌ FAILED");
      tests.forEach((test) => {
        if (!test.passed) {
          console.log(
            `  ❌ ${test.name}: expected ${test.expected}, got ${test.actual}`
          );
        }
      });
    }

    testResults.responseTimes.push(responseTime);
    testResults.details.push({
      message,
      expectedIntent,
      actualIntent: classification.intent,
      expectedNeedsWeb,
      actualNeedsWeb: classification.needs_web,
      expectedNeedsUserData,
      actualNeedsUserData: classification.needs_user_data,
      confidence: classification.confidence,
      responseTime,
      passed: allPassed,
      tests,
    });

    return { passed: allPassed, responseTime, classification };
  } catch (error) {
    testResults.total++;
    testResults.errors++;
    console.log(`❌ ERROR: ${error.message}`);
    testResults.details.push({
      message,
      expectedIntent,
      error: error.message,
      passed: false,
    });
    return { passed: false, error: error.message };
  }
}

/**
 * Run all test categories
 */
async function runAllTests() {
  console.log("🚀 Starting Classification Layer Tests\n");
  console.log("=" * 50);

  // Test ask_personalized cases
  console.log("\n📊 Testing ask_personalized cases...");
  for (const message of TEST_CONFIG.TEST_MESSAGES.ask_personalized) {
    await testClassification(message, "ask_personalized", null, true);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Rate limiting
  }

  // Test goal_conversation cases
  console.log("\n🎯 Testing goal_conversation cases...");
  for (const message of TEST_CONFIG.TEST_MESSAGES.goal_conversation) {
    await testClassification(message, "goal_conversation", null, true);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Test off_topic cases
  console.log("\n🚫 Testing off_topic cases...");
  for (const message of TEST_CONFIG.TEST_MESSAGES.off_topic) {
    await testClassification(message, "off_topic", false, false);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Test needs_web cases
  console.log("\n🌐 Testing needs_web cases...");
  for (const message of TEST_CONFIG.TEST_MESSAGES.needs_web) {
    await testClassification(message, "ask_personalized", true, false);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Test edge cases
  console.log("\n⚠️ Testing edge cases...");
  const edgeCaseExpectations = [
    { message: "", expected: "ask_personalized" },
    { message: "   ", expected: "ask_personalized" },
    { message: "a", expected: "ask_personalized" },
    {
      message: "What is the difference between a Roth IRA and traditional IRA?",
      expected: "ask_personalized",
    },
    {
      message: "Should I rent or buy in Phoenix?",
      expected: "ask_personalized",
    },
    { message: "Can I hit FIRE by 35?", expected: "ask_personalized" },
    { message: "Will I have enough to retire?", expected: "ask_personalized" },
    {
      message: "What's the difference between credit and debit cards?",
      expected: "ask_personalized",
    },
    {
      message: "How do I apply for a credit card?",
      expected: "ask_personalized",
    },
    { message: "What's my credit score?", expected: "ask_personalized" },
  ];

  for (const { message, expected } of edgeCaseExpectations) {
    await testClassification(message, expected);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Test ambiguous cases
  console.log("\n❓ Testing ambiguous cases...");
  for (const message of TEST_CONFIG.TEST_MESSAGES.ambiguous) {
    // These could be either ask_personalized or goal_conversation, so we accept both
    const result = await testClassification(message, "ask_personalized");
    if (!result.passed) {
      // Try goal_conversation as fallback
      await testClassification(message, "goal_conversation");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Generate final report
  generateReport();
}

/**
 * Generate comprehensive test report
 */
function generateReport() {
  console.log("\n" + "=" * 50);
  console.log("📊 TEST REPORT");
  console.log("=" * 50);

  const accuracy = (testResults.passed / testResults.total) * 100;
  const avgResponseTime =
    testResults.responseTimes.reduce((a, b) => a + b, 0) /
    testResults.responseTimes.length;
  const maxResponseTime = Math.max(...testResults.responseTimes);
  const minResponseTime = Math.min(...testResults.responseTimes);

  console.log(`\n📈 Overall Results:`);
  console.log(`  Total Tests: ${testResults.total}`);
  console.log(`  Passed: ${testResults.passed} (${accuracy.toFixed(1)}%)`);
  console.log(`  Failed: ${testResults.failed}`);
  console.log(`  Errors: ${testResults.errors}`);

  console.log(`\n⏱️ Performance:`);
  console.log(`  Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
  console.log(`  Min Response Time: ${minResponseTime}ms`);
  console.log(`  Max Response Time: ${maxResponseTime}ms`);
  console.log(`  Threshold: ${TEST_CONFIG.RESPONSE_TIME_THRESHOLD}ms`);

  console.log(`\n🎯 Accuracy:`);
  console.log(`  Current: ${accuracy.toFixed(1)}%`);
  console.log(`  Target: ${TEST_CONFIG.ACCURACY_THRESHOLD * 100}%`);
  console.log(
    `  Status: ${
      accuracy >= TEST_CONFIG.ACCURACY_THRESHOLD * 100
        ? "✅ PASSED"
        : "❌ FAILED"
    }`
  );

  // Detailed failure analysis
  const failures = testResults.details.filter((d) => !d.passed);
  if (failures.length > 0) {
    console.log(`\n❌ Failed Tests:`);
    failures.forEach((failure, index) => {
      console.log(`  ${index + 1}. "${failure.message}"`);
      console.log(`     Expected: ${failure.expectedIntent}`);
      console.log(`     Got: ${failure.actualIntent || "ERROR"}`);
      if (failure.error) {
        console.log(`     Error: ${failure.error}`);
      }
    });
  }

  // Recommendations
  console.log(`\n💡 Recommendations:`);
  if (accuracy < TEST_CONFIG.ACCURACY_THRESHOLD * 100) {
    console.log(`  - Classification accuracy is below threshold`);
    console.log(`  - Consider improving the classification prompt`);
    console.log(`  - Review failed test cases for patterns`);
  }

  if (avgResponseTime > TEST_CONFIG.RESPONSE_TIME_THRESHOLD) {
    console.log(`  - Response times are too slow`);
    console.log(`  - Consider optimizing the model or increasing timeout`);
  }

  if (testResults.errors > 0) {
    console.log(`  - ${testResults.errors} API errors occurred`);
    console.log(`  - Check API configuration and network connectivity`);
  }

  console.log(`\n✅ Test completed!`);
}

/**
 * Run specific test category
 */
async function runCategoryTest(category) {
  console.log(`🧪 Running ${category} tests...`);

  switch (category) {
    case "ask_personalized":
      for (const message of TEST_CONFIG.TEST_MESSAGES.ask_personalized) {
        await testClassification(message, "ask_personalized", null, true);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      break;

    case "goal_conversation":
      for (const message of TEST_CONFIG.TEST_MESSAGES.goal_conversation) {
        await testClassification(message, "goal_conversation", null, true);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      break;

    case "off_topic":
      for (const message of TEST_CONFIG.TEST_MESSAGES.off_topic) {
        await testClassification(message, "off_topic", false, false);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      break;

    case "needs_web":
      for (const message of TEST_CONFIG.TEST_MESSAGES.needs_web) {
        await testClassification(message, "ask_personalized", true, false);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      break;

    case "edge_cases":
      const edgeCaseExpectations = [
        { message: "", expected: "ask_personalized" },
        { message: "   ", expected: "ask_personalized" },
        { message: "a", expected: "ask_personalized" },
        {
          message:
            "What is the difference between a Roth IRA and traditional IRA?",
          expected: "ask_personalized",
        },
        {
          message: "Should I rent or buy in Phoenix?",
          expected: "ask_personalized",
        },
        { message: "Can I hit FIRE by 35?", expected: "ask_personalized" },
        {
          message: "Will I have enough to retire?",
          expected: "ask_personalized",
        },
        {
          message: "What's the difference between credit and debit cards?",
          expected: "ask_personalized",
        },
        {
          message: "How do I apply for a credit card?",
          expected: "ask_personalized",
        },
        { message: "What's my credit score?", expected: "ask_personalized" },
      ];

      for (const { message, expected } of edgeCaseExpectations) {
        await testClassification(message, expected);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      break;

    default:
      console.log(
        "❌ Unknown category. Available: ask_personalized, goal_conversation, off_topic, needs_web, edge_cases"
      );
      return;
  }

  generateReport();
}

// Export functions for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    runAllTests,
    runCategoryTest,
    testClassification,
    TEST_CONFIG,
  };
}

// Auto-run if called directly
if (
  typeof window === "undefined" &&
  import.meta.url === `file://${process.argv[1]}`
) {
  console.log(
    "🔧 Please update TEST_CONFIG with your API details before running tests."
  );
  console.log("Then run: node test_classification.js");
}
