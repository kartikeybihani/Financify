/**
 * Manual Classification Test Script
 * Test individual messages to debug classification issues
 */

// UPDATE THESE VALUES
const API_BASE_URL = "https://financify-rose.vercel.app/"; // e.g., 'http://localhost:3000/api'
const OPENROUTER_API_KEY =
  "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";

async function testMessage(message) {
  try {
    console.log(`\n🧪 Testing: "${message}"`);

    const startTime = Date.now();

    // Make API call - ADJUST THIS BASED ON YOUR API STRUCTURE
    const response = await fetch(`${API_BASE_URL}/finny`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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

    // Extract classification result - ADJUST THIS BASED ON YOUR API RESPONSE
    const classification = data.classification_result || data;

    console.log("📊 Results:");
    console.log(`  Intent: ${classification.intent}`);
    console.log(`  needs_web: ${classification.needs_web}`);
    console.log(`  needs_user_data: ${classification.needs_user_data}`);
    console.log(`  confidence: ${classification.confidence}`);
    console.log(`  response_time: ${responseTime}ms`);

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

    return classification;
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return null;
  }
}

// Test specific problematic cases
async function testProblematicCases() {
  console.log("🔍 Testing Problematic Cases");
  console.log("=" * 40);

  const problematicCases = [
    "What is the Roth IRA limit?", // Should trigger web search
    "What are my current goals?", // Should NOT trigger goal creation
    "How much did I spend on food last month?", // Should be ask_personalized
    "I want to save $5000 for a house", // Should be goal_conversation
    "What's the weather like?", // Should be off_topic
    "What are the best credit cards?", // Should be ask_personalized with web search
    "Can I afford a $2000 purchase?", // Should be ask_personalized
    "Help me create a budget", // Could be either ask_personalized or goal_conversation
    "What's the current inflation rate?", // Should be ask_personalized with web search
    "I need financial advice", // Could be either ask_personalized or goal_conversation
  ];

  for (const message of problematicCases) {
    await testMessage(message);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limiting
  }
}

// Test edge cases
async function testEdgeCases() {
  console.log("\n⚠️ Testing Edge Cases");
  console.log("=" * 40);

  const edgeCases = [
    "", // Empty string
    "   ", // Whitespace
    "a", // Single character
    "What is the difference between a Roth IRA and traditional IRA?", // Financial concept
    "Should I rent or buy in Phoenix?", // Location-specific
    "Can I hit FIRE by 35?", // FIRE planning
    "Will I have enough to retire?", // Retirement planning
    "What's the difference between credit and debit cards?", // Educational
    "How do I apply for a credit card?", // Action-oriented
    "What's my credit score?", // Personal data query
  ];

  for (const message of edgeCases) {
    await testMessage(message);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// Test web search detection
async function testWebSearchDetection() {
  console.log("\n🌐 Testing Web Search Detection");
  console.log("=" * 40);

  const webSearchCases = [
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
  ];

  for (const message of webSearchCases) {
    await testMessage(message);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// Main test runner
async function runManualTests() {
  console.log("🚀 Manual Classification Tests");
  console.log(
    "Update API_BASE_URL and OPENROUTER_API_KEY at the top of this file"
  );
  console.log("Then run: node manual_test.js");

  // Uncomment the tests you want to run:

  // await testProblematicCases();
  // await testEdgeCases();
  // await testWebSearchDetection();

  // Or test a specific message:
  // await testMessage("What is the Roth IRA limit?");
}

// Run if called directly
if (
  require.main === module &&
  import.meta.url === `file://${process.argv[1]}`
) {
  runManualTests().catch(console.error);
}

module.exports = {
  testMessage,
  testProblematicCases,
  testEdgeCases,
  testWebSearchDetection,
};
