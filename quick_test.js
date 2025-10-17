/**
 * Quick Classification Test Script
 * Run this to test your classification layer quickly
 */

// UPDATE THESE VALUES
const API_BASE_URL = "https://financify-rose.vercel.app/"; // e.g., 'http://localhost:3000/api'
const OPENROUTER_API_KEY =
  "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";

// Test cases with expected results
const TEST_CASES = [
  // ask_personalized tests
  {
    message: "How much did I spend last month?",
    expected: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
  },
  {
    message: "What's my current net worth?",
    expected: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
  },
  {
    message: "Show me my recent transactions",
    expected: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
  },

  // goal_conversation tests
  {
    message: "I want to save $10,000 for a house down payment",
    expected: "goal_conversation",
    needs_web: false,
    needs_user_data: true,
  },
  {
    message: "Set a goal to save $5,000 by December",
    expected: "goal_conversation",
    needs_web: false,
    needs_user_data: true,
  },
  {
    message: "I need to build an emergency fund",
    expected: "goal_conversation",
    needs_web: false,
    needs_user_data: true,
  },

  // off_topic tests
  {
    message: "What's the weather like today?",
    expected: "off_topic",
    needs_web: false,
    needs_user_data: false,
  },
  {
    message: "How do I cook pasta?",
    expected: "off_topic",
    needs_web: false,
    needs_user_data: false,
  },
  {
    message: "Tell me a joke",
    expected: "off_topic",
    needs_web: false,
    needs_user_data: false,
  },

  // needs_web tests
  {
    message: "What is the Roth IRA contribution limit for 2025?",
    expected: "ask_personalized",
    needs_web: true,
    needs_user_data: false,
  },
  {
    message: "What are the current mortgage rates?",
    expected: "ask_personalized",
    needs_web: true,
    needs_user_data: false,
  },
  {
    message: "What's the latest news on Tesla stock?",
    expected: "ask_personalized",
    needs_web: true,
    needs_user_data: false,
  },

  // Edge cases
  {
    message: "",
    expected: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
  },
  {
    message: "What is the difference between a Roth IRA and traditional IRA?",
    expected: "ask_personalized",
    needs_web: false,
    needs_user_data: false,
  },
  {
    message: "Should I rent or buy in Phoenix?",
    expected: "ask_personalized",
    needs_web: true,
    needs_user_data: true,
  },

  // Ambiguous cases (could be either)
  {
    message: "I want to save money",
    expected: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
  },
  {
    message: "Help me with my finances",
    expected: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
  },
];

async function testSingleClassification(message, expected) {
  try {
    console.log(`\n🧪 Testing: "${message}"`);
    console.log(
      `Expected: ${expected.intent}, needs_web: ${expected.needs_web}, needs_user_data: ${expected.needs_user_data}`
    );

    const startTime = Date.now();

    // Make API call - ADJUST THIS BASED ON YOUR API STRUCTURE
    const response = await fetch(`${API_BASE_URL}/api/finny`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        action: "classify",
        message: message,
        context: { user_id: "79952f35-b607-40d6-a32e-d81386882eb7" },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    // Extract classification result - the API returns the classification directly
    const classification = data;

    console.log(
      `Got: ${classification.intent}, needs_web: ${classification.needs_web}, needs_user_data: ${classification.needs_user_data}`
    );
    console.log(
      `Confidence: ${classification.confidence}, Response time: ${responseTime}ms`
    );

    // Check results
    const intentMatch = classification.intent === expected.intent;
    const webMatch = classification.needs_web === expected.needs_web;
    const userDataMatch =
      classification.needs_user_data === expected.needs_user_data;
    const confidenceGood = classification.confidence >= 0.7;
    const timeGood = responseTime <= 8000;

    const passed =
      intentMatch && webMatch && userDataMatch && confidenceGood && timeGood;

    if (passed) {
      console.log("✅ PASSED");
    } else {
      console.log("❌ FAILED");
      if (!intentMatch)
        console.log(
          `  ❌ Intent: expected ${expected.intent}, got ${classification.intent}`
        );
      if (!webMatch)
        console.log(
          `  ❌ needs_web: expected ${expected.needs_web}, got ${classification.needs_web}`
        );
      if (!userDataMatch)
        console.log(
          `  ❌ needs_user_data: expected ${expected.needs_user_data}, got ${classification.needs_user_data}`
        );
      if (!confidenceGood)
        console.log(`  ❌ Confidence too low: ${classification.confidence}`);
      if (!timeGood)
        console.log(`  ❌ Response time too slow: ${responseTime}ms`);
    }

    return { passed, responseTime, classification };
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

async function runQuickTest() {
  console.log("🚀 Quick Classification Test");
  console.log("=".repeat(40));

  let passed = 0;
  let failed = 0;
  let errors = 0;
  const responseTimes = [];

  for (const testCase of TEST_CASES) {
    const result = await testSingleClassification(testCase.message, testCase);

    if (result.passed) {
      passed++;
    } else if (result.error) {
      errors++;
    } else {
      failed++;
    }

    if (result.responseTime) {
      responseTimes.push(result.responseTime);
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Summary
  console.log("\n" + "=" * 40);
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(40));
  console.log(`Total: ${TEST_CASES.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Accuracy: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%`);

  if (responseTimes.length > 0) {
    const avgTime =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    console.log(`Average response time: ${avgTime.toFixed(0)}ms`);
  }

  console.log("\n💡 To run this test:");
  console.log("1. Update API_BASE_URL and OPENROUTER_API_KEY at the top");
  console.log("2. Adjust the API call structure if needed");
  console.log("3. Run: node quick_test.js");
}

// Run if called directly
if (
  typeof window === "undefined" &&
  import.meta.url === `file://${process.argv[1]}`
) {
  const userMessage = process.argv[2];

  if (userMessage) {
    // Test single message provided as command line argument
    console.log("🚀 Testing Single Statement");
    console.log(`Testing: "${userMessage}"`);
    console.log("=".repeat(50));

    // Create a test case for the user message
    const testCase = {
      message: userMessage,
      expected: {
        intent: "unknown", // We don't know the expected intent
        needs_web: false,
        needs_user_data: false,
      },
    };

    testSingleClassification(testCase.message, testCase).catch(console.error);
  } else {
    // Run all test cases
    runQuickTest().catch(console.error);
  }
}

export { runQuickTest, testSingleClassification, TEST_CASES };
