// test-web-research.js
// Simple test to verify the web research system works

import { researchFinancialProducts } from "./api/utils/webResearchEngine.js";

async function testWebResearch() {
  console.log("🧪 Testing Web Research System...\n");

  const testQueries = [
    "Chase vs Amex",
    "What is the best credit card for travel?",
    "Compare Chase Sapphire and Capital One Venture",
    "Tell me about Fidelity vs Vanguard",
    "Which bank has the best savings account?",
  ];

  for (const query of testQueries) {
    console.log(`\n🔍 Testing query: "${query}"`);
    console.log("─".repeat(50));

    try {
      const result = await researchFinancialProducts(query);

      if (result.success) {
        console.log("✅ Research successful");
        console.log(`📊 Entities found: ${result.entities.rawEntities.length}`);
        console.log(`🎯 Intent: ${result.intent.intent}`);
        console.log(`🌐 Sources: ${result.searchStrategy.searchUrls.length}`);
        console.log(`📈 Products found: ${result.results.products.length}`);

        if (result.results.products.length > 0) {
          console.log("\n📋 Product details:");
          result.results.products.forEach((product, index) => {
            console.log(`  ${index + 1}. ${product.title}`);
            if (product.metrics.apr && product.metrics.apr.length > 0) {
              const avgApr =
                product.metrics.apr.reduce((sum, val) => sum + val, 0) /
                product.metrics.apr.length;
              console.log(`     APR: ${avgApr.toFixed(2)}%`);
            }
            if (
              product.metrics.annualFee &&
              product.metrics.annualFee.length > 0
            ) {
              const avgFee =
                product.metrics.annualFee.reduce((sum, val) => sum + val, 0) /
                product.metrics.annualFee.length;
              console.log(`     Annual Fee: $${avgFee.toFixed(2)}`);
            }
          });
        }

        if (result.results.comparisons.length > 0) {
          console.log("\n⚖️ Comparisons:");
          result.results.comparisons.forEach((comparison) => {
            console.log(
              `  ${comparison.product1} vs ${comparison.product2}: ${comparison.winner} wins`
            );
          });
        }
      } else {
        console.log("❌ Research failed:", result.error);
      }
    } catch (error) {
      console.log("💥 Test failed:", error.message);
    }

    console.log("\n" + "=".repeat(60));
  }

  console.log("\n🎉 Web Research System Test Complete!");
}

// Run the test
testWebResearch().catch(console.error);
