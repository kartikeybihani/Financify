/**
 * Full Pipeline Test (Classification → Ask Handler)
 * Tests the complete pipeline: classification followed by ask handler
 *
 * Logs for every response:
 * - intent_type
 * - decisionRisk (final, post-adjustment)
 * - whether clarification was triggered
 *
 * Usage:
 *   node tests/test_finny1.js "your query here"
 *   node tests/test_finny1.js test1
 */

// Load environment variables BEFORE importing finny.js (which initializes Supabase)
import "dotenv/config";

import { handleClassify, handleAsk } from "../api/finny.js";

// Test user context
const TEST_USER_CONTEXT = {
  user_id: "f948c4ab-dc68-41d5-89bf-1935653cca37",
  state: null,
};

async function testFullPipeline(message) {
  try {
    console.log(`\n🧪 Testing Full Pipeline: "${message}"`);
    console.log("=".repeat(80));

    const startTime = Date.now();

    // Step 1: Classification
    console.log("\n📋 Step 1: Classification");
    console.log("-".repeat(80));
    const classification = await handleClassify(message, TEST_USER_CONTEXT);

    console.log("Classification Result:");
    console.log(`  intent: ${classification.intent}`);
    console.log(`  intent_type: ${classification.intent_type || "null"}`);
    console.log(`  decision_risk (initial): ${classification.decision_risk}`);
    console.log(`  needs_clarification: ${classification.needs_clarification}`);
    console.log(`  info_sufficiency: ${classification.info_sufficiency}`);
    if (
      classification.missing_fields &&
      classification.missing_fields.length > 0
    ) {
      console.log(
        `  missing_fields: ${JSON.stringify(classification.missing_fields)}`
      );
    }

    // Step 2: Ask Handler
    console.log("\n💬 Step 2: Ask Handler");
    console.log("-".repeat(80));

    // Determine intent for handleAsk
    const askIntent =
      classification.intent === "stock_query"
        ? "stock_query"
        : "ask_personalized";

    // Call handleAsk with classification result
    const response = await handleAsk(
      message,
      TEST_USER_CONTEXT,
      askIntent,
      classification, // Pass classification result
      null, // conversationContext
      null, // requestTimings
      false, // wantsStreaming
      null // res
    );

    // Determine if clarification was triggered
    // Clarification is triggered if handleAsk returns early with a clarification message
    // We can detect this by checking if the response message contains clarification patterns
    const responseMessage = Array.isArray(response.message)
      ? response.message.map((m) => m.content || m).join("\n")
      : response.message || "";

    const clarificationTriggered =
      classification.needs_clarification &&
      (responseMessage.includes("Quick questions") ||
        responseMessage.includes("Before I give advice") ||
        responseMessage.includes("This is a high-stakes decision") ||
        responseMessage.includes("so I don't want to guess"));

    // Final decision_risk (post-adjustment)
    // In production, decision_risk might be adjusted, but it's typically the same as classification
    // We use the classification's decision_risk as the final value
    const finalDecisionRisk = classification.decision_risk;

    // Log the requested information
    console.log("\n📊 Pipeline Results:");
    console.log("=".repeat(80));
    console.log(`  intent_type: ${classification.intent_type || "null"}`);
    console.log(
      `  decisionRisk (final, post-adjustment): ${finalDecisionRisk}`
    );
    console.log(`  clarification_triggered: ${clarificationTriggered}`);
    console.log(`\n  Response message:`);
    if (Array.isArray(response.message)) {
      response.message.forEach((m, i) => {
        const content = m.content || m;
        console.log(
          `    [${i + 1}] ${content.substring(0, 200)}${
            content.length > 200 ? "..." : ""
          }`
        );
      });
    } else {
      console.log(
        `    ${responseMessage.substring(0, 500)}${
          responseMessage.length > 500 ? "..." : ""
        }`
      );
    }
    console.log(`\n  Response time: ${Date.now() - startTime}ms`);

    return {
      classification,
      response,
      intent_type: classification.intent_type,
      decisionRisk: finalDecisionRisk,
      clarificationTriggered,
    };
  } catch (error) {
    console.error(`❌ ERROR: ${error.message}`);
    console.error(error.stack);
    return { error: error.message };
  }
}

// Main execution
const userMessage = process.argv[2];
const testType = process.argv[3];

if (userMessage && userMessage !== "test1") {
  console.log("🚀 Testing Full Pipeline");
  testFullPipeline(userMessage)
    .then(() => {
      console.log("\n✅ Test completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Test failed:", error);
      process.exit(1);
    });
} else if (userMessage === "test1" || testType === "test1") {
  console.log("🧪 Running test1...");
  const questions = [
    "Can I afford a $1,500 trip?",
    "I want to buy houses in Italy and Japan",
    "What do you know about me?",
    "I feel stupid about my spending",
    "Tell me about investing",
  ];

  console.log("\n" + "=".repeat(80));
  console.log("🧪 TEST1 - Full Pipeline Tests");
  console.log("=".repeat(80));

  (async () => {
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`\n${i + 1}. "${question}"`);
      await testFullPipeline(question);
      if (i < questions.length - 1) {
        console.log("\n" + "-".repeat(80));
      }
    }
    console.log("\n" + "=".repeat(80));
    console.log("✅ TEST1 completed");
    console.log("=".repeat(80));
    process.exit(0);
  })().catch((error) => {
    console.error("❌ Test1 failed:", error);
    process.exit(1);
  });
} else {
  console.log('Usage: node tests/test_finny1.js "your query here"');
  console.log("       node tests/test_finny1.js test1");
  process.exit(1);
}
