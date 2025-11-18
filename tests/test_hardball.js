#!/usr/bin/env node

/**
 * Hardball Test Script for Finny
 *
 * Tests 15 challenging questions that push Finny's emotional intelligence,
 * state detection, and response quality to the limit.
 *
 * Usage:
 *   node test_hardball.js 1                    # Test question 1
 *   node test_hardball.js 2                    # Test question 2
 *   node test_hardball.js "Your custom question" # Test custom question
 *   node test_hardball.js                       # List all questions
 */

import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Configuration
const BASE_URL =
  process.env.APP_BASE_URL || "https://financify-rose.vercel.app";
const TEST_USER_ID =
  process.env.TEST_USER_ID || "79952f35-b607-40d6-a32e-d81386882eb7";

// 15 Hardball Questions - Designed to test emotional intelligence and edge cases
// Written in authentic Gen Z conversational style
const HARDBALL_QUESTIONS = [
  // 1. Panic/Crisis Detection
  {
    id: 1,
    question:
      "ok so my card literally just got declined at target and rent is due tomorrow and idk what to do im actually freaking out",
    category: "Panic/Crisis",
    expectedState: "panicked",
    description: "Tests panic detection and crisis response",
  },

  // 2. Overwhelmed State
  {
    id: 2,
    question:
      "honestly i'm so overwhelmed rn like i have student loans and credit card debt and no savings and all these klarna payments and i literally don't know where to even start like everything is too much",
    category: "Overwhelmed",
    expectedState: "overwhelmed",
    description: "Tests overwhelmed detection and simplification",
  },

  // 3. Shame/Guilt
  {
    id: 3,
    question:
      "ngl i feel so stupid like i'm 24 and have 25k in credit card debt and everyone else my age seems to have their shit together and i'm just here failing",
    category: "Shame/Guilt",
    expectedState: "ashamed",
    description: "Tests shame detection and normalization",
  },

  // 4. FOMO Spending
  {
    id: 4,
    question:
      "so i keep buying stuff i see on tiktok and instagram like everyone's doing it and i couldn't help myself but now i feel guilty but also like fomo is real",
    category: "FOMO",
    expectedState: "fomo",
    description: "Tests FOMO detection and guilt-free budgeting",
  },

  // 5. Anxiety with Sleep Issues
  {
    id: 5,
    question:
      "i'm so stressed about money i literally can't sleep like i keep worrying about my debt and i'm too scared to even check my bank account",
    category: "Anxiety",
    expectedState: "anxious",
    description: "Tests anxiety detection with physical symptoms",
  },

  // 6. Paycheck-to-Paycheck Reality
  {
    id: 6,
    question:
      "everyone keeps saying save 20% but like how?? my rent is 2k and i only make 3k a month and i'm literally drowning in bills",
    category: "Systemic Challenges",
    expectedState: "high_fixed_costs",
    description: "Tests realistic advice vs generic rules",
  },

  // 7. Emergency Fund vs Investing Conflict
  {
    id: 7,
    question:
      "should i start investing? i have like 200 bucks saved and everyone on reddit says to invest early but idk",
    category: "Buffer First",
    expectedState: "no_buffer",
    description: "Tests buffer-first philosophy enforcement",
  },

  // 8. Multiple BNPL Traps
  {
    id: 8,
    question:
      "ok so i have klarna payments and afterpay and affirm all due this month and idk how i'm gonna pay for all of them",
    category: "BNPL Crisis",
    expectedState: "crisis",
    description: "Tests BNPL awareness and payment collision detection",
  },

  // 9. Comparison Anxiety
  {
    id: 9,
    question:
      "all my friends are buying houses and going on these amazing trips and i'm here broke and feel like such a failure like what's wrong with me",
    category: "Comparison Anxiety",
    expectedState: "ashamed",
    description: "Tests comparison anxiety and normalization",
  },

  // 10. Existential Financial Fear
  {
    id: 10,
    question:
      "i'm terrified i'll never be able to retire like i have zero savings and i'm already 28 is it too late?",
    category: "Existential Fear",
    expectedState: "anxious",
    description: "Tests long-term fear and reassurance",
  },

  // 11. Emergency Without Buffer
  {
    id: 11,
    question:
      "my car broke down and i need 800 to fix it but i don't have a lot in my accounts what do i even do",
    category: "Emergency Crisis",
    expectedState: "crisis",
    description: "Tests emergency response without buffer",
  },

  // 12. Debt Shame with Specific Amounts
  {
    id: 12,
    question:
      "this is embarrassing but i have like 40k in student loans and 15k in credit card debt and i feel like i completely ruined my life",
    category: "Debt Shame",
    expectedState: "ashamed",
    description: "Tests debt normalization with specific amounts",
  },

  // 13. Overwhelmed by Options
  {
    id: 13,
    question:
      "there's just so much i need to do like pay off debt and save for emergencies and invest and save for retirement and idk where to start it's all too much",
    category: "Options Paralysis",
    expectedState: "overwhelmed",
    description: "Tests one-action focus vs multiple options",
  },

  // 14. Social Media Pressure
  {
    id: 14,
    question:
      "so i saw everyone on instagram going to coachella and i impulsively bought tickets even though i can't afford it and now i'm stressed but i don't wanna miss out",
    category: "Social Media FOMO",
    expectedState: "fomo",
    description: "Tests impulse spending from social media",
  },

  // 15. Complete Financial Breakdown
  {
    id: 15,
    question:
      "i'm panicking my account is negative and i have late payments and my credit score dropped and idk how i'm gonna pay my bills i feel sick",
    category: "Complete Crisis",
    expectedState: "panicked",
    description: "Tests multiple crisis signals and immediate action focus",
  },
];

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

async function testHardballQuestion(questionObj, userId = TEST_USER_ID) {
  const { id, question, category, expectedState, description } = questionObj;

  logHeader(`Hardball Test #${id}: ${category}`);
  logInfo(`Expected State: ${expectedState}`);
  logInfo(`Description: ${description}`);
  log(`\n${colors.bright}Question:${colors.reset} "${question}"`);
  log(`👤 User ID: ${userId}`);
  logSection("Testing...");

  try {
    const startTime = Date.now();

    // Step 1: Classify the message
    log("🎯 Step 1: Classifying message...");
    const classifyRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "classify",
        message: question,
        context: { user_id: userId },
      }),
    });

    const classifyData = await classifyRes.json();
    logSuccess(`Classification: ${classifyData.intent || "N/A"}`);

    // Step 2: Ask Finny
    log("🤖 Step 2: Asking Finny...");
    const askRes = await fetch(`${BASE_URL}/api/finny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ask",
        message: question,
        context: { user_id: userId },
      }),
    });

    const askData = await askRes.json();
    const responseTime = Date.now() - startTime;

    if (askRes.ok) {
      logSuccess("Response received:");
      log("─".repeat(80), "cyan");

      // Handle different response formats
      let messageText = "";
      if (typeof askData.message === "string") {
        messageText = askData.message;
      } else if (Array.isArray(askData.message)) {
        messageText = askData.message
          .map((m) =>
            typeof m === "string" ? m : m.content || JSON.stringify(m)
          )
          .join("\n\n");
      } else if (askData.message && typeof askData.message === "object") {
        messageText =
          askData.message.content ||
          askData.message.text ||
          JSON.stringify(askData.message, null, 2);
      } else {
        messageText = JSON.stringify(askData, null, 2);
      }

      log(messageText);
      log("─".repeat(80), "cyan");
      logInfo(`Response time: ${responseTime}ms`);

      // Log context packs info if available
      if (askData.context_packs) {
        logInfo(`Context packs used: ${askData.context_packs.join(", ")}`);
      }
      if (askData.data_gaps) {
        logWarning(`Data gaps: ${askData.data_gaps.join(", ")}`);
      }

      // Evaluation checklist
      logSection("Evaluation Checklist");
      log("Review the response for:");
      log("  ✓ Appropriate emotional tone for the state");
      log("  ✓ ONE clear action (not multiple options)");
      log("  ✓ Normalization (if shame/anxiety detected)");
      log("  ✓ Realistic advice (not generic rules)");
      log("  ✓ Crisis action focus (if panic detected)");
      log("  ✓ Buffer-first approach (if no buffer)");
      log("  ✓ Non-judgmental language");
      log("  ✓ Gen Z communication style");

      return {
        success: true,
        message: askData.message,
        intent: classifyData.intent,
        response_time: responseTime,
        context_packs: askData.context_packs || [],
        data_gaps: askData.data_gaps || [],
      };
    } else {
      const errorMsg = askData.error || askData.message || "Unknown error";
      logError(`Error: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  } catch (error) {
    logError(`Test failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

function listAllQuestions() {
  logHeader("15 Hardball Test Questions");
  log("\nThese questions are designed to test Finny's emotional intelligence,");
  log("state detection, and response quality under challenging scenarios.\n");

  HARDBALL_QUESTIONS.forEach((q) => {
    log(
      `\n${colors.bright}${colors.cyan}#${q.id}. ${q.category}${colors.reset}`
    );
    log(`   ${colors.yellow}Expected State:${colors.reset} ${q.expectedState}`);
    log(`   ${colors.magenta}Question:${colors.reset} "${q.question}"`);
    log(`   ${colors.blue}Description:${colors.reset} ${q.description}`);
  });

  log("\n" + "═".repeat(80));
  log("\nUsage:");
  log(
    `  ${colors.green}node test_hardball.js 1${colors.reset}                    # Test question 1`
  );
  log(
    `  ${colors.green}node test_hardball.js 2${colors.reset}                    # Test question 2`
  );
  log(
    `  ${colors.green}node test_hardball.js "Your question"${colors.reset}       # Test custom question`
  );
}

async function main() {
  const args = process.argv.slice(2);

  logHeader("Hardball Test Script for Finny");
  log(`🌐 Base URL: ${BASE_URL}`);
  log(`👤 Test User: ${TEST_USER_ID}`);

  if (args.length === 0) {
    // List all questions
    listAllQuestions();
    return;
  }

  const input = args[0];

  // Check if it's a number (question ID)
  const questionId = parseInt(input, 10);
  if (!isNaN(questionId) && questionId >= 1 && questionId <= 15) {
    const questionObj = HARDBALL_QUESTIONS.find((q) => q.id === questionId);
    if (questionObj) {
      await testHardballQuestion(questionObj);
    } else {
      logError(`Question #${questionId} not found.`);
      listAllQuestions();
    }
  } else {
    // Custom question
    logHeader("Custom Question Test");
    log(`Question: "${input}"`);
    logSection("Testing...");

    try {
      const startTime = Date.now();

      // Classify
      log("🎯 Step 1: Classifying message...");
      const classifyRes = await fetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "classify",
          message: input,
          context: { user_id: TEST_USER_ID },
        }),
      });

      const classifyData = await classifyRes.json();
      logSuccess(`Classification: ${classifyData.intent || "N/A"}`);

      // Ask
      log("🤖 Step 2: Asking Finny...");
      const askRes = await fetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          message: input,
          context: { user_id: TEST_USER_ID },
        }),
      });

      const askData = await askRes.json();
      const responseTime = Date.now() - startTime;

      if (askRes.ok) {
        logSuccess("Response received:");
        log("─".repeat(80), "cyan");

        // Handle different response formats
        let messageText = "";
        if (typeof askData.message === "string") {
          messageText = askData.message;
        } else if (Array.isArray(askData.message)) {
          messageText = askData.message
            .map((m) =>
              typeof m === "string" ? m : m.content || JSON.stringify(m)
            )
            .join("\n\n");
        } else if (askData.message && typeof askData.message === "object") {
          messageText =
            askData.message.content ||
            askData.message.text ||
            JSON.stringify(askData.message, null, 2);
        } else {
          messageText = JSON.stringify(askData, null, 2);
        }

        log(messageText);
        log("─".repeat(80), "cyan");
        logInfo(`Response time: ${responseTime}ms`);

        if (askData.context_packs) {
          logInfo(`Context packs used: ${askData.context_packs.join(", ")}`);
        }
        if (askData.data_gaps) {
          logWarning(`Data gaps: ${askData.data_gaps.join(", ")}`);
        }
      } else {
        logError(
          `Error: ${askData.error || askData.message || "Unknown error"}`
        );
      }
    } catch (error) {
      logError(`Test failed: ${error.message}`);
    }
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
if (import.meta.url === new URL(import.meta.url).href) {
  main().catch(console.error);
}

export { testHardballQuestion, HARDBALL_QUESTIONS };
