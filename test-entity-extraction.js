// test-entity-extraction.js
// Simple test for entity extraction without external dependencies

import {
  extractEntities,
  determineIntent,
} from "./api/utils/entityExtractor.js";

async function testEntityExtraction() {
  console.log("🧪 Testing Entity Extraction System...\n");

  const testQueries = [
    "Chase vs Amex",
    "What is the best credit card for travel?",
    "Compare Chase Sapphire and Capital One Venture",
    "Tell me about Fidelity vs Vanguard",
    "Which bank has the best savings account?",
    "What are the current credit card APRs?",
    "Does New Jersey have inheritance tax?",
    "Set a $2000 emergency fund by March",
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing query: "${query}"`);
    console.log("─".repeat(50));

    try {
      const entities = await extractEntities(query);
      const intent = determineIntent(entities, query);

      console.log("✅ Entity extraction successful");
      console.log(`📊 Raw entities: ${entities.rawEntities.join(", ")}`);
      console.log(
        `💳 Credit card issuers: ${entities.creditCardIssuers.join(", ")}`
      );
      console.log(`🏦 Banks: ${entities.banks.join(", ")}`);
      console.log(
        `📈 Investment platforms: ${entities.investmentPlatforms.join(", ")}`
      );
      console.log(
        `⚖️ Comparison words: ${entities.comparisonWords.join(", ")}`
      );
      console.log(`🗺️ States: ${entities.states.join(", ")}`);
      console.log(`🎯 Intent: ${intent.intent}`);
      console.log(`🌐 Needs web: ${intent.needs_web}`);
      console.log(`👤 Needs user data: ${intent.needs_user_data}`);
      console.log(`💭 Reasoning: ${intent.reasoning}`);
    } catch (error) {
      console.log("💥 Test failed:", error.message);
    }

    console.log("\n" + "=".repeat(60));
  }

  console.log("\n🎉 Entity Extraction Test Complete!");
}

// Run the test
testEntityExtraction().catch(console.error);
