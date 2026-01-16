/**
 * Goal Analysis Test
 * Tests the goal analysis LLM pipeline with user-provided goal details
 * Uses production functions directly from api/goals.js
 *
 * Usage:
 *   node tests/test_goal_analysis.js
 *   Then enter goal details when prompted
 */

// Load environment variables BEFORE importing modules
import "dotenv/config";
import readline from "readline";
import { analyzeGoalWithLLM } from "../api/goals.js";

// Test user context - you can change this to test with different users
const TEST_USER_ID = "f948c4ab-dc68-41d5-89bf-1935653cca37";

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function getGoalDetails() {
  console.log("\n" + "=".repeat(80));
  console.log("🎯 GOAL ANALYSIS TEST");
  console.log("=".repeat(80));
  console.log("\nPlease enter the goal details:\n");

  const label = await question("Goal Name (e.g., Dream Vacation): ");
  const targetAmount = await question("Target Amount (e.g., 5000): ");
  const targetDate = await question(
    "Target Date (YYYY-MM-DD, e.g., 2025-12-31): "
  );
  const category = await question(
    "Category (emergency_fund/vacation/car/house_down_payment/education/retirement/wedding/debt_payoff/investment/other): "
  );
  const note = await question("Note (optional, press Enter to skip): ");
  const currentAmount = await question(
    "Current Amount (default 0, press Enter for 0): "
  );

  return {
    id: `test-${Date.now()}`, // Temporary ID for testing
    label: label.trim(),
    target_amount: parseFloat(targetAmount) || 0,
    current_amount: parseFloat(currentAmount) || 0,
    target_date: targetDate.trim() || new Date().toISOString().split("T")[0],
    category: category.trim() || "other",
    note: note.trim() || null,
    status: "active",
    user_id: TEST_USER_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function testGoalAnalysis(goalData) {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🧠 Starting Goal Analysis");
    console.log("=".repeat(80));
    console.log("\nGoal Details:");
    console.log(`  Name: ${goalData.label}`);
    console.log(`  Target Amount: $${goalData.target_amount.toLocaleString()}`);
    console.log(
      `  Current Amount: $${goalData.current_amount.toLocaleString()}`
    );
    console.log(`  Target Date: ${goalData.target_date}`);
    console.log(`  Category: ${goalData.category}`);
    if (goalData.note) {
      console.log(`  Note: ${goalData.note}`);
    }

    const startTime = Date.now();

    // Use the production function directly - it will handle all fetching and logging
    console.log("\n📊 Calling analyzeGoalWithLLM (production function)...");
    console.log("   This will fetch all data in parallel and log each step.\n");

    let analysis;
    try {
      // Call the production function - it will log everything internally
      // The function will try to update the DB, but since we're using a test ID, it will fail
      // That's okay - we'll catch it and still show the analysis
      analysis = await analyzeGoalWithLLM(goalData, TEST_USER_ID);
    } catch (error) {
      // If DB update fails (because we're using a test ID), extract the analysis from the error
      if (error.dbUpdateFailed && error.analysis) {
        console.log(
          "\n⚠️  Note: Database update failed (expected for test ID), but analysis was generated."
        );
        analysis = error.analysis;
      } else {
        // Some other error - re-throw it
        throw error;
      }
    }

    const totalTime = Date.now() - startTime;

    // Display results
    console.log("\n" + "=".repeat(80));
    console.log("✅ ANALYSIS COMPLETE");
    console.log("=".repeat(80));
    console.log(
      `⏱️  Total Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`
    );
    console.log("\n📊 LLM-Generated Analysis:");
    console.log("-".repeat(80));
    console.log(analysis);
    console.log("-".repeat(80));

    return {
      goal: goalData,
      analysis,
      totalTime,
    };
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    return { error: error.message };
  }
}

// Main execution
async function main() {
  try {
    const goalData = await getGoalDetails();
    rl.close();

    await testGoalAnalysis(goalData);

    console.log("\n✅ Test completed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:", error);
    rl.close();
    process.exit(1);
  }
}

main();
