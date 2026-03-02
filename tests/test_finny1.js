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

// Override classification models for testing - use llama-3.2-3b-instruct
process.env.CLASSIFICATION_MODEL_PAID = "meta-llama/llama-4-scout";
process.env.CLASSIFICATION_MODEL_FREE = "meta-llama/llama-4-scout:free";

import { handleClassify, handleAsk, handleOffTopic } from "../api/finny.js";
import { loadUserMemory, loadUserProfile } from "../lib/memoryUtils.js";

// Test user context
const TEST_USER_CONTEXT = {
  user_id: "79952f35-b607-40d6-a32e-d81386882eb7",
  state: null,
};

async function testFullPipeline(message) {
  try {
    console.log(`\n🧪 Testing Full Pipeline: "${message}"`);
    console.log("=".repeat(80));

    // Start total timer - from message sent to reply received
    const totalStartTime = Date.now();
    const timings = {
      classification: 0,
      handler: 0,
      total: 0,
    };

    // Step 1: Classification
    console.log("\n📋 Step 1: Classification");
    console.log("-".repeat(80));
    const classificationStartTime = Date.now();
    const classification = await handleClassify(message, TEST_USER_CONTEXT);
    timings.classification = Date.now() - classificationStartTime;

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
        `  missing_fields: ${JSON.stringify(classification.missing_fields)}`,
      );
    }

    // Step 2: Handler (Ask Handler or Off-Topic Handler)
    console.log("\n💬 Step 2: Handler");
    console.log("-".repeat(80));

    let response;
    const handlerStartTime = Date.now();

    // Load memory and profile for ask handler (same as main handler does)
    let contextWithData = { ...TEST_USER_CONTEXT };
    if (classification.intent !== "off_topic") {
      // Load memory and profile (only for ask handler)
      const userId = TEST_USER_CONTEXT.user_id;
      const [userMemory, userProfile] = await Promise.all([
        loadUserMemory(userId, message),
        loadUserProfile(userId),
      ]);

      contextWithData = {
        ...TEST_USER_CONTEXT,
        memory: userMemory,
        profile: userProfile,
      };
    }

    // Route to appropriate handler based on intent
    if (classification.intent === "off_topic") {
      // Handle off-topic queries
      response = await handleOffTopic(
        message,
        contextWithData,
        null, // conversationContext
      );
    } else {
      // Determine intent for handleAsk
      const askIntent =
        classification.intent === "stock_query"
          ? "stock_query"
          : "ask_personalized";

      // Call handleAsk with classification result
      response = await handleAsk(
        message,
        contextWithData,
        askIntent,
        classification, // Pass classification result
        null, // conversationContext
        null, // requestTimings
        false, // wantsStreaming
        null, // res
      );
    }

    timings.handler = Date.now() - handlerStartTime;
    timings.total = Date.now() - totalStartTime;

    // Determine if clarification was triggered
    // Clarification is triggered if handleAsk returns early with a clarification message
    // We can detect this by checking if the response message contains clarification patterns
    // Note: handleOffTopic returns 'text' field, handleAsk returns 'message' field
    const responseMessage = Array.isArray(response.message)
      ? response.message.map((m) => m.content || m).join("\n")
      : response.message || response.text || "";

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
      `  decisionRisk (final, post-adjustment): ${finalDecisionRisk}`,
    );
    console.log(`  clarification_triggered: ${clarificationTriggered}`);
    console.log(`\n  Response message:`);
    // handleOffTopic returns 'text', handleAsk returns 'message' (may be array if split)
    if (Array.isArray(response.message)) {
      // Response was split into multiple chunks by splitLongResponse() in handleAsk
      console.log(
        `  (Split into ${response.message.length} chunks by backend)`,
      );
      response.message.forEach((m, i) => {
        const content = m.content || m;
        console.log(`\n    [Chunk ${i + 1}] ${content}`);
      });
    } else if (response.text) {
      // handleOffTopic returns 'text' field
      console.log(`    ${response.text}`);
    } else {
      // handleAsk returns 'message' field (string)
      console.log(`    ${responseMessage}`);
    }

    // Timing information - from message sent to reply received
    console.log("\n⏱️  Timing Information:");
    console.log("=".repeat(80));
    console.log(
      `  ⏱️  Total Time (Message → Reply): ${timings.total}ms (${(
        timings.total / 1000
      ).toFixed(2)}s)`,
    );
    console.log(
      `  📋 Classification Time: ${timings.classification}ms (${(
        timings.classification / 1000
      ).toFixed(2)}s)`,
    );
    console.log(
      `  💬 Handler Time: ${timings.handler}ms (${(
        timings.handler / 1000
      ).toFixed(2)}s)`,
    );
    console.log(
      `  📊 Breakdown: ${(
        (timings.classification / timings.total) *
        100
      ).toFixed(1)}% classification, ${(
        (timings.handler / timings.total) *
        100
      ).toFixed(1)}% handler`,
    );

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
