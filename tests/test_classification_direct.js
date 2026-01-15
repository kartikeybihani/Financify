/**
 * Direct Classification Test with Improved Prompting
 * Tests the classification function directly with enhanced web search detection
 *
 * Usage:
 *   node tests/test_classification_direct.js "your query here"
 *   node tests/test_classification_direct.js hardball
 *   node tests/test_classification_direct.js stock
 *   node tests/test_classification_direct.js test1
 */

// Load environment variables BEFORE importing finny.js (which initializes Supabase)
import "dotenv/config";

// Import the production classification function
import { handleClassify } from "../api/finny.js";

// Test function - uses production handleClassify
async function testSingleMessage(message) {
  try {
    console.log(`\n🧪 Testing: "${message}"`);

    const startTime = Date.now();

    // Call the classification function directly
    const classification = await handleClassify(message, {
      user_id: "f948c4ab-dc68-41d5-89bf-1935653cca37",
    });
    const responseTime = Date.now() - startTime;

    console.log("📊 Classification Results:");
    console.log(`  Intent: ${classification.intent}`);
    if (classification.intent_type) {
      console.log(`  Intent Type: ${classification.intent_type}`);
    }
    if (classification.emotional_state) {
      console.log(`  Emotional State: ${classification.emotional_state}`);
    }
    console.log(`  needs_web: ${classification.needs_web}`);
    console.log(`  needs_user_data: ${classification.needs_user_data}`);
    console.log(`  needs_clarification: ${classification.needs_clarification}`);
    if (classification.info_sufficiency) {
      console.log(`  info_sufficiency: ${classification.info_sufficiency}`);
    }
    if (classification.decision_risk) {
      console.log(`  decision_risk: ${classification.decision_risk}`);
    }
    if (classification.missing_fields && classification.missing_fields.length) {
      console.log(
        `  missing_fields: ${JSON.stringify(classification.missing_fields)}`
      );
    }
    console.log(`  confidence: ${classification.confidence}`);
    console.log(`  response_time: ${responseTime}ms`);

    if (classification.ticker) {
      console.log(`  ticker: ${classification.ticker}`);
    }

    if (classification.entities && classification.entities.length > 0) {
      console.log(`  entities: ${JSON.stringify(classification.entities)}`);
    }

    if (classification.state) {
      console.log(`  state: ${classification.state}`);
    }

    if (classification.fallback) {
      console.log(`  ⚠️  FALLBACK USED`);
    }

    if (classification.timeout_fallback) {
      console.log(`  ⏰ TIMEOUT FALLBACK USED`);
    }

    // Analysis
    console.log("\n🔍 Analysis:");
    if (classification.intent === "ask_personalized") {
      console.log("  ✅ Correctly identified as personal financial query");
    } else if (classification.intent === "goal_conversation") {
      console.log("  ✅ Correctly identified as goal-related query");
    } else if (classification.intent === "off_topic") {
      console.log("  ✅ Correctly identified as off-topic (non-financial)");
    } else if (classification.intent === "stock_query") {
      console.log("  ✅ Correctly identified as stock query");
      if (classification.ticker) {
        console.log(`  📈 Ticker detected: ${classification.ticker}`);
      } else {
        console.log(
          "  ⚠️  Stock query but no ticker detected (may need confirmation)"
        );
      }
    }

    if (classification.needs_web) {
      console.log(
        "  🌐 Web search will be triggered (good for current info queries)"
      );
    } else {
      console.log("  📊 No web search needed (good for personal data queries)");
    }

    if (classification.needs_user_data) {
      console.log("  👤 User data will be fetched (good for personal queries)");
    } else {
      console.log("  🌍 No user data needed (good for general info queries)");
    }

    if (classification.confidence >= 0.8) {
      console.log("  🎯 High confidence classification");
    } else if (classification.confidence >= 0.6) {
      console.log("  ⚠️  Medium confidence classification");
    } else {
      console.log("  ❌ Low confidence classification");
    }

    // Specific analysis for different query types
    const lowerMessage = message.toLowerCase();

    // Roth IRA queries
    if (lowerMessage.includes("roth ira") && lowerMessage.includes("limit")) {
      if (classification.needs_web) {
        console.log(
          "  🎯 PERFECT! Roth IRA limit query correctly triggers web search"
        );
      } else {
        console.log(
          "  ❌ ISSUE! Roth IRA limit query should trigger web search but doesn't"
        );
      }
    }

    // Off-topic queries
    if (
      lowerMessage.includes("weather") ||
      lowerMessage.includes("cook") ||
      lowerMessage.includes("movie")
    ) {
      if (classification.intent === "off_topic") {
        console.log("  🎯 PERFECT! Off-topic query correctly identified");
      } else {
        console.log(
          "  ❌ ISSUE! Off-topic query should be classified as off_topic"
        );
      }
    }

    // Goal queries
    if (
      lowerMessage.includes("save") &&
      (lowerMessage.includes("goal") || lowerMessage.includes("want"))
    ) {
      if (classification.intent === "goal_conversation") {
        console.log("  🎯 PERFECT! Goal query correctly identified");
      } else {
        console.log(
          "  ❌ ISSUE! Goal query should be classified as goal_conversation"
        );
      }
    }

    // Personal financial queries
    if (
      lowerMessage.includes("spend") ||
      lowerMessage.includes("net worth") ||
      lowerMessage.includes("transaction")
    ) {
      if (
        classification.intent === "ask_personalized" &&
        classification.needs_user_data
      ) {
        console.log(
          "  🎯 PERFECT! Personal financial query correctly identified"
        );
      } else {
        console.log(
          "  ❌ ISSUE! Personal financial query should need user data"
        );
      }
    }

    return { classification, responseTime };
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return { error: error.message };
  }
}

// Hardball tests - edge cases for classification
async function runHardballTests() {
  const tests = [
    {
      q: "What's a good emergency amount for me?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation",
    },
    {
      q: "Can I afford a $1500 trip?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (affordability check), NOT goal_conversation",
    },
    {
      q: "Should I move to Japan this year?",
      expected: "ask_personalized",
      note: "High-stakes ambiguous decision. Should be ask_personalized and typically needs_clarification + decision_risk:high",
    },
    {
      q: "Is it worth it to have kids?",
      expected: "ask_personalized",
      note: "High-stakes ambiguous decision. Should be ask_personalized and typically needs_clarification + decision_risk:high",
    },
    {
      q: "I want to create a goal for my emergency fund",
      expected: "goal_conversation",
      note: "Should be goal_conversation (explicit goal creation)",
    },
    {
      q: "How much should I have in my emergency fund?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation",
    },
    {
      q: "Is it worth it to buy a $2000 laptop?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (value assessment), NOT goal_conversation",
    },
    {
      q: "I want to buy houses in italy and japan",
      expected: "ask_personalized",
      note: "Major multi-country plan; expect needs_clarification:true, decision_risk:high, info_sufficiency:missing (soft checks)",
    },
    {
      q: "Should I save $5000 for a house?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation (note: 'save' + 'for' but phrased as advice)",
    },
    {
      q: "I want to save $5000 for a house",
      expected: "goal_conversation",
      note: "Should be goal_conversation (explicit goal creation statement)",
    },
    {
      q: "What's a good amount to save for retirement?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (advice query), NOT goal_conversation",
    },
    {
      q: "Let's set a goal to save for my emergency fund",
      expected: "goal_conversation",
      note: "Should be goal_conversation (explicit goal creation with 'set a goal')",
    },
    {
      q: "Can I go afford a $1500 trip?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (affordability check with typo 'go afford'), NOT goal_conversation",
    },
    {
      q: "Can I afford to go Italy trip?",
      expected: "ask_personalized",
      note: "Should be ask_personalized (affordability check with natural language variation), NOT goal_conversation",
    },
  ];

  console.log("\n" + "=".repeat(80));
  console.log("🔥 HARDBALL TESTS - Edge Cases for Classification");
  console.log("=".repeat(80));

  let pass = 0;
  let total = tests.length;

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log(`\n${i + 1}. Testing: "${t.q}"`);
    console.log(`   Expected: ${t.expected}`);
    console.log(`   Note: ${t.note}`);
    console.log("-".repeat(80));

    try {
      const { classification } = await testSingleMessage(t.q);
      const actual = classification?.intent;
      const isCorrect = actual === t.expected;

      if (isCorrect) {
        pass++;
        console.log(`   ✅ PASS - Got ${actual} (as expected)`);

        // Soft checks (non-fatal): new routing signals for ambiguous/high-stakes decisions
        const lower = t.q.toLowerCase();
        const isBigLifeDecision =
          lower.includes("move") ||
          lower.includes("moving") ||
          lower.includes("kids") ||
          lower.includes("have kids") ||
          lower.includes("married") ||
          lower.includes("marriage");
        if (isBigLifeDecision) {
          if (classification?.decision_risk !== "high") {
            console.log(
              `   ⚠️  Note: expected decision_risk ~ high, got ${classification?.decision_risk}`
            );
          }
          if (classification?.needs_clarification !== true) {
            console.log(
              `   ⚠️  Note: expected needs_clarification ~ true, got ${classification?.needs_clarification}`
            );
          }
        }
      } else {
        console.log(`   ❌ FAIL - Got ${actual}, expected ${t.expected}`);
        console.log(`   Confidence: ${classification?.confidence}`);
        console.log(`   Needs web: ${classification?.needs_web}`);
        console.log(`   Needs user data: ${classification?.needs_user_data}`);
        console.log(
          `   needs_clarification: ${classification?.needs_clarification}`
        );
        console.log(
          `   decision_risk: ${classification?.decision_risk} | info_sufficiency: ${classification?.info_sufficiency}`
        );
        if (classification?.missing_fields?.length) {
          console.log(
            `   missing_fields: ${JSON.stringify(
              classification.missing_fields
            )}`
          );
        }
        if (classification?.reason) {
          console.log(`   Reason: ${classification.reason}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`📊 HARDBALL TEST SUMMARY: ${pass}/${total} passed`);
  console.log("=".repeat(80));

  if (pass === total) {
    console.log("🎉 All tests passed!");
  } else {
    console.log(`⚠️  ${total - pass} test(s) failed`);
  }
}

// Test1 - User-provided questions
async function runTest1() {
  const questions = [
    "Can I afford a $1,500 trip?",
    "I want to buy houses in Italy and Japan",
    "What do you know about me?",
    "I feel stupid about my spending",
    "Tell me about investing",
  ];

  console.log("\n" + "=".repeat(80));
  console.log("🧪 TEST1 - Classification Tests");
  console.log("=".repeat(80));

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`\n${i + 1}. "${question}"`);
    console.log("-".repeat(80));

    try {
      const classification = await handleClassify(question, {
        user_id: "f948c4ab-dc68-41d5-89bf-1935653cca37",
      });

      // Only log the 4 requested fields
      console.log(`  intent_type: ${classification.intent_type}`);
      console.log(`  emotional_state: ${classification.emotional_state}`);
      console.log(
        `  needs_clarification: ${classification.needs_clarification}`
      );
      console.log(`  decision_risk: ${classification.decision_risk}`);
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ TEST1 completed");
  console.log("=".repeat(80));
}

// Run if called directly with node
// Check if this is the main module (works for both CommonJS and ES modules)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith("test_classification_direct.js") ||
  process.argv[1]?.endsWith("test_classification_direct.js");

if (isMainModule) {
  const userMessage = process.argv[2];
  const testType = process.argv[3];

  if (
    userMessage &&
    userMessage !== "hardball" &&
    userMessage !== "stock" &&
    userMessage !== "curveball" &&
    userMessage !== "test1"
  ) {
    // User provided a query string
    console.log("🚀 Testing Single Statement");
    console.log(`Testing: "${userMessage}"`);
    console.log("=".repeat(50));

    testSingleMessage(userMessage)
      .then(() => {
        console.log("\n✅ Test completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
      });
  } else if (userMessage === "hardball" || testType === "hardball") {
    console.log("🔥 Running hardball tests...");
    runHardballTests()
      .then(() => {
        console.log("\n✅ Hardball tests completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Hardball tests failed:", error);
        process.exit(1);
      });
  } else if (userMessage === "stock" || testType === "stock") {
    console.log("📈 Running stock query tests...");
    runStockQueryTests()
      .then(() => {
        console.log("\n✅ Stock query tests completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Stock query tests failed:", error);
        process.exit(1);
      });
  } else if (userMessage === "test1" || testType === "test1") {
    console.log("🧪 Running test1...");
    runTest1()
      .then(() => {
        console.log("\n✅ Test1 completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Test1 failed:", error);
        process.exit(1);
      });
  } else {
    console.log("Running curveball tests...");
    runCurveballTests()
      .then(() => {
        console.log("\n✅ Curveball tests completed");
        process.exit(0);
      })
      .catch((error) => {
        console.error("❌ Curveball tests failed:", error);
        process.exit(1);
      });
  }
}

export { testSingleMessage, handleClassify, runStockQueryTests, runTest1 };

// Curveball hard tests
async function runCurveballTests() {
  const tests = [
    {
      q: "Can you tell me about the bank?",
      note: "Ambiguous 'bank' (river bank vs financial). Expect off_topic or ask_personalized depending on context",
    },
    {
      q: "Is it ever acceptable to lie?",
      note: "Ethical dilemma → off_topic",
    },
    {
      q: "I'm feeling really down today; what should I do?",
      note: "Emotional support → off_topic",
    },
    {
      q: "What is the meaning of life?",
      note: "Philosophical → off_topic",
    },
    {
      q: "Will AI ever surpass human intelligence?",
      note: "Future prediction → off_topic",
    },
    {
      q: "Why did the chicken cross the road?",
      note: "Humor → off_topic",
    },
    {
      q: "If I have a red house on the left and a blue house on the right, where is the white house?",
      note: "Common-sense riddle → off_topic",
    },
    {
      q: "Do you know that you're an AI?",
      note: "Self-awareness → off_topic",
    },
    {
      q: "Can you learn from our previous conversations?",
      note: "Meta/system behavior → off_topic",
    },
    {
      q: "What are the best practices for greeting someone in Japan?",
      note: "Cultural sensitivity → off_topic",
    },
  ];

  let pass = 0;
  for (const t of tests) {
    const { classification } = await testSingleMessage(t.q);
    const isOffTopic = classification?.intent === "off_topic";
    const ok =
      isOffTopic &&
      !classification?.needs_web &&
      !classification?.needs_user_data;
    if (ok) pass++;
    console.log(`\n➡️  Curveball: ${t.q}`);
    console.log(
      `   -> intent=${classification?.intent}, needs_web=${classification?.needs_web}, needs_user_data=${classification?.needs_user_data}`
    );
    console.log(`   Note: ${t.note}`);
    console.log(
      `   Result: ${
        ok ? "✅ as expected (off_topic)" : "⚠️ check classification"
      }`
    );
  }
  console.log(
    `\nCurveball summary: ${pass}/${tests.length} off_topic as expected`
  );
}

// Stock query test cases - Easy, Medium, Hard
async function runStockQueryTests() {
  const tests = [
    // EASY TESTS - Clear ticker symbols
    {
      q: "What about AAPL?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.95,
        note: "Clear ticker symbol - should be high confidence",
      },
    },
    {
      q: "Tell me about TSLA",
      expected: {
        intent: "stock_query",
        ticker: "TSLA",
        confidence: 0.95,
        note: "Clear ticker symbol with 'tell me about' pattern",
      },
    },
    {
      q: "Should I buy MSFT?",
      expected: {
        intent: "stock_query",
        ticker: "MSFT",
        needs_user_data: true,
        confidence: 0.9,
        note: "Clear ticker with investment advice question",
      },
    },
    {
      q: "What's the price of GOOGL?",
      expected: {
        intent: "stock_query",
        ticker: "GOOGL",
        confidence: 0.95,
        note: "Clear ticker with price query",
      },
    },

    // MEDIUM TESTS - Company names that map to tickers
    {
      q: "What about Apple stock?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.85,
        note: "Company name 'Apple' should map to AAPL",
      },
    },
    {
      q: "Tell me about Tesla",
      expected: {
        intent: "stock_query",
        ticker: "TSLA",
        confidence: 0.8,
        note: "Company name 'Tesla' should map to TSLA (medium confidence due to ambiguity)",
      },
    },
    {
      q: "How is Microsoft doing?",
      expected: {
        intent: "stock_query",
        ticker: "MSFT",
        confidence: 0.8,
        note: "Company name 'Microsoft' should map to MSFT",
      },
    },
    {
      q: "Should I invest in NVIDIA?",
      expected: {
        intent: "stock_query",
        ticker: "NVDA",
        needs_user_data: true,
        confidence: 0.85,
        note: "Company name 'NVIDIA' should map to NVDA with investment advice",
      },
    },

    // HARD TESTS - Ambiguous or unclear cases
    {
      q: "What about Apple?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.7,
        note: "Ambiguous - could be company or stock, should detect as stock_query but lower confidence",
      },
    },
    {
      q: "Tell me about the stock market",
      expected: {
        intent: "ask_personalized",
        ticker: null,
        needs_web: true,
        confidence: 0.9,
        note: "General stock market query - NOT stock_query (no specific ticker)",
      },
    },
    {
      q: "What stocks should I buy?",
      expected: {
        intent: "ask_personalized",
        ticker: null,
        needs_user_data: true,
        confidence: 0.9,
        note: "General investment advice - NOT stock_query (no specific ticker)",
      },
    },
    {
      q: "Apple",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        confidence: 0.6,
        note: "Very ambiguous - single word could be anything, but in financial context likely stock",
      },
    },
    {
      q: "What's happening with AMZN and MSFT?",
      expected: {
        intent: "stock_query",
        ticker: "AMZN",
        entities: ["AMZN", "MSFT"],
        confidence: 0.9,
        note: "Multiple tickers detected - should include both in entities",
      },
    },
    {
      q: "Is Apple a good investment?",
      expected: {
        intent: "stock_query",
        ticker: "AAPL",
        needs_user_data: true,
        confidence: 0.85,
        note: "Investment question about company - should map to AAPL",
      },
    },
  ];

  console.log("\n" + "=".repeat(80));
  console.log("📈 STOCK QUERY TESTS - Easy, Medium, Hard Cases");
  console.log("=".repeat(80));

  let pass = 0;
  let total = tests.length;

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log(`\n${i + 1}. Testing: "${t.q}"`);
    console.log(
      `   Expected: intent=${t.expected.intent}, ticker=${t.expected.ticker}, confidence>=${t.expected.confidence}`
    );
    console.log(`   Note: ${t.note}`);
    console.log("-".repeat(80));

    try {
      const { classification } = await testSingleMessage(t.q);
      const actual = classification?.intent;
      const actualTicker = classification?.ticker;
      const actualConfidence = classification?.confidence;
      const actualNeedsUserData = classification?.needs_user_data;

      // Check intent match
      const intentMatch = actual === t.expected.intent;

      // Check ticker match (null/undefined matches null, or exact match)
      const tickerMatch =
        (t.expected.ticker === null &&
          (actualTicker === null || actualTicker === undefined)) ||
        (t.expected.ticker && actualTicker === t.expected.ticker);

      // Check confidence threshold
      const confidenceMatch = actualConfidence >= t.expected.confidence;

      // Check needs_user_data if specified
      const needsUserDataMatch =
        t.expected.needs_user_data === undefined ||
        actualNeedsUserData === t.expected.needs_user_data;

      const isCorrect =
        intentMatch && tickerMatch && confidenceMatch && needsUserDataMatch;

      if (isCorrect) {
        pass++;
        console.log(`   ✅ PASS`);
        console.log(`      Intent: ${actual} (expected: ${t.expected.intent})`);
        console.log(
          `      Ticker: ${actualTicker} (expected: ${t.expected.ticker})`
        );
        console.log(
          `      Confidence: ${actualConfidence} (expected: >=${t.expected.confidence})`
        );
        if (t.expected.needs_user_data !== undefined) {
          console.log(
            `      Needs User Data: ${actualNeedsUserData} (expected: ${t.expected.needs_user_data})`
          );
        }
      } else {
        console.log(`   ❌ FAIL`);
        if (!intentMatch) {
          console.log(
            `      Intent mismatch: got ${actual}, expected ${t.expected.intent}`
          );
        }
        if (!tickerMatch) {
          console.log(
            `      Ticker mismatch: got ${actualTicker}, expected ${t.expected.ticker}`
          );
        }
        if (!confidenceMatch) {
          console.log(
            `      Confidence too low: got ${actualConfidence}, expected >=${t.expected.confidence}`
          );
        }
        if (!needsUserDataMatch) {
          console.log(
            `      Needs user data mismatch: got ${actualNeedsUserData}, expected ${t.expected.needs_user_data}`
          );
        }
        console.log(
          `      Full result:`,
          JSON.stringify(classification, null, 2)
        );
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`📊 STOCK QUERY TEST SUMMARY: ${pass}/${total} passed`);
  console.log("=".repeat(80));

  if (pass === total) {
    console.log("🎉 All stock query tests passed!");
  } else {
    console.log(`⚠️  ${total - pass} test(s) failed`);
  }
}
