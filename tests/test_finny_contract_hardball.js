/**
 * Contract regression tests for hardball prompts.
 *
 * Usage:
 *   node tests/test_finny_contract_hardball.js
 *
 * Notes:
 * - Uses forced classification per case to exercise contract behavior deterministically.
 * - If your network/model provider is unavailable, some checks will be reported as SKIP.
 */

import "dotenv/config";
import { handleAsk } from "../api/finny.js";

const TEST_USER_ID = "79952f35-b607-40d6-a32e-d81386882eb7";

function countQuestionMarks(text = "") {
  const m = String(text).match(/\?/g);
  return m ? m.length : 0;
}

function hasAny(text = "", patterns = []) {
  const lower = String(text).toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function printCaseHeader(index, total, name, message) {
  console.log(`\n[${index + 1}/${total}] ${name}`);
  console.log(`Q: ${message}`);
}

function printResult(status, details) {
  const icon = status === "PASS" ? "✅" : status === "SKIP" ? "⏭️" : "❌";
  console.log(`${icon} ${status}: ${details}`);
}

function baseClassification(overrides = {}) {
  return {
    intent: "ask_personalized",
    intent_type: "actionable",
    emotional_state: "neutral",
    needs_web: false,
    needs_user_data: true,
    needs_clarification: false,
    info_sufficiency: "sufficient",
    missing_fields: [],
    decision_risk: "medium",
    state: null,
    entities: [],
    ticker: null,
    confidence: 0.9,
    data_requirements: {
      required_packs: ["summary_min"],
      optional_packs: [],
      filters: {},
      granularity: "summary_level",
      time_range: "current",
    },
    ...overrides,
  };
}

const CASES = [
  {
    name: "Affordability with explicit amount",
    message: "do you think i can buy a $2500 art piece?",
    classification: baseClassification({ intent_type: "actionable", decision_risk: "medium" }),
    validate: (text) => {
      const lower = text.toLowerCase();
      if (lower.includes("having trouble reaching the model")) return { status: "SKIP", details: "model unavailable" };
      if (hasAny(lower, ["price tag", "what's the price", "what is the price", "price range"])) {
        return { status: "FAIL", details: "asked for price even though amount was provided" };
      }
      if (hasAny(lower, ["how will it impact", "will it impact your", "do you think it will affect"])) {
        return { status: "FAIL", details: "asked user to assess impact instead of advisor computing it" };
      }
      if (countQuestionMarks(text) > 1) {
        return { status: "FAIL", details: "asked too many follow-up questions" };
      }
      return { status: "PASS", details: "decision-style affordability response shape respected" };
    },
  },
  {
    name: "Factual lookup",
    message: "how much have i spent this month besides travel?",
    classification: baseClassification({
      intent_type: "factual",
      decision_risk: "low",
      info_sufficiency: "sufficient",
      data_requirements: {
        required_packs: ["summary_min", "spend_total", "category_details"],
        optional_packs: [],
        filters: { category: "travel" },
        granularity: "transaction_level",
        time_range: "1_month",
      },
    }),
    validate: (text) => {
      const lower = text.toLowerCase();
      if (lower.includes("having trouble reaching the model")) return { status: "SKIP", details: "model unavailable" };
      if (countQuestionMarks(text) > 1) {
        return { status: "FAIL", details: "factual lookup asked unnecessary follow-up questions" };
      }
      return { status: "PASS", details: "factual response remained concise" };
    },
  },
  {
    name: "High-stakes planning",
    message: "should i buy a house this year?",
    classification: baseClassification({
      intent_type: "actionable",
      decision_risk: "high",
      info_sufficiency: "missing",
      needs_clarification: true,
      missing_fields: ["timeline", "current_savings", "income_takehome"],
    }),
    validate: (text) => {
      const lower = text.toLowerCase();
      if (lower.includes("having trouble reaching the model")) return { status: "SKIP", details: "model unavailable" };
      if (lower.includes("high-stakes decision")) {
        return { status: "FAIL", details: "legacy hard-clarify gate should be bypassed under advisory runtime flag" };
      }
      if (countQuestionMarks(text) > 1) {
        return { status: "FAIL", details: "expected at most one question in flagged high-risk response" };
      }
      return { status: "PASS", details: "high-risk response stayed within one-question policy" };
    },
  },
  {
    name: "Exploratory education",
    message: "explain roth ira like i'm a beginner",
    classification: baseClassification({
      intent_type: "exploratory",
      decision_risk: "low",
      info_sufficiency: "sufficient",
      needs_clarification: false,
    }),
    validate: (text) => {
      const lower = text.toLowerCase();
      if (lower.includes("having trouble reaching the model")) return { status: "SKIP", details: "model unavailable" };
      if (countQuestionMarks(text) > 1) {
        return { status: "FAIL", details: "explainer asked too many questions" };
      }
      return { status: "PASS", details: "explainer remained mostly instructional" };
    },
  },
  {
    name: "Affordability with long query",
    message:
      "i'm trying to be more intentional with spending this year and i'm considering buying a $3200 watch because i hit some milestones, but i'm also worried about lifestyle creep and long-term goals, should i do it?",
    classification: baseClassification({ intent_type: "actionable", decision_risk: "medium" }),
    validate: (text) => {
      const lower = text.toLowerCase();
      if (lower.includes("having trouble reaching the model")) return { status: "SKIP", details: "model unavailable" };
      if (hasAny(lower, ["what's the price", "price tag", "price range"])) {
        return { status: "FAIL", details: "asked for price despite explicit amount in long query" };
      }
      return { status: "PASS", details: "long affordability query handled without price re-ask" };
    },
  },
];

async function runCase(testCase, index, total) {
  printCaseHeader(index, total, testCase.name, testCase.message);

  const previous = process.env.FINNY_ADVISORY_RUNTIME_V1;
  process.env.FINNY_ADVISORY_RUNTIME_V1 = "true";

  const response = await handleAsk(
    testCase.message,
    { user_id: TEST_USER_ID },
    "ask_personalized",
    testCase.classification,
    null,
    false,
    null,
  );

  process.env.FINNY_ADVISORY_RUNTIME_V1 = previous;

  const text = String(response?.message || response?.text || "");
  const verdict = testCase.validate(text);

  printResult(verdict.status, verdict.details);
  console.log(`Response preview: ${text.slice(0, 220).replace(/\n/g, " ")}${text.length > 220 ? "..." : ""}`);

  return verdict.status;
}

async function main() {
  console.log("🧪 Finny Contract Hardball Regression");
  console.log("=".repeat(72));

  let pass = 0;
  let fail = 0;
  let skip = 0;

  for (let i = 0; i < CASES.length; i += 1) {
    try {
      const status = await runCase(CASES[i], i, CASES.length);
      if (status === "PASS") pass += 1;
      else if (status === "FAIL") fail += 1;
      else skip += 1;
    } catch (err) {
      fail += 1;
      printResult("FAIL", err?.message || String(err));
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`Summary: PASS=${pass} FAIL=${fail} SKIP=${skip}`);

  process.exit(fail > 0 ? 1 : 0);
}

main();
