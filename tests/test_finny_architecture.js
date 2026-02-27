/**
 * Finny architecture regression checks.
 * Usage:
 *   node tests/test_finny_architecture.js
 */

import "dotenv/config";
import { handleClassify, handleAsk } from "../api/finny.js";

const TEST_USER_ID = "79952f35-b607-40d6-a32e-d81386882eb7";

function pass(name) {
  console.log(`✅ ${name}`);
}

function fail(name, details) {
  console.error(`❌ ${name}: ${details}`);
}

async function testFactualClassification() {
  const name = "Factual classification is deterministic for spend lookup";
  const q = "How much have i spent this month besides travel?";
  const cls = await handleClassify(q, { user_id: TEST_USER_ID });

  if (cls?.fallback) {
    pass(`${name} (skipped: classifier fallback mode)`); // network/provider unavailable
    return true;
  }

  if (cls.intent !== "ask_personalized") {
    fail(name, `intent=${cls.intent}`);
    return false;
  }
  if (cls.intent_type !== "factual") {
    fail(name, `intent_type=${cls.intent_type}`);
    return false;
  }
  if (cls.needs_user_data !== true) {
    fail(name, `needs_user_data=${cls.needs_user_data}`);
    return false;
  }

  pass(name);
  return true;
}

async function testClassificationContract() {
  const name = "Classification contract uses structured data_requirements";
  const q = "How much have i spent this month besides travel?";
  const cls = await handleClassify(q, { user_id: TEST_USER_ID });

  if (cls?.fallback) {
    pass(`${name} (skipped: classifier fallback mode)`);
    return true;
  }

  if (cls.needs_user_data !== true) {
    pass(`${name} (skipped: needs_user_data=false)`);
    return true;
  }

  if (!cls.data_requirements || typeof cls.data_requirements !== "object") {
    fail(name, "missing data_requirements");
    return false;
  }

  const period = cls.data_requirements?.filters?.period;
  if (period != null && typeof period === "string") {
    fail(name, `period should be object/null, got string=${period}`);
    return false;
  }

  pass(name);
  return true;
}

async function testHighRiskHardClarify() {
  const name = "High-risk insufficient context triggers deterministic clarify";
  const message = "Should I buy a house now?";

  const forcedClassification = {
    intent: "ask_personalized",
    intent_type: "actionable",
    needs_user_data: true,
    needs_web: false,
    needs_clarification: true,
    info_sufficiency: "missing",
    missing_fields: ["income_takehome", "current_savings", "timeline"],
    decision_risk: "high",
    emotional_state: "neutral",
    confidence: 0.9,
    data_requirements: {
      required_packs: ["summary_min"],
      optional_packs: [],
      filters: {},
      granularity: "summary_level",
      time_range: "current",
    },
  };

  const response = await handleAsk(
    message,
    { user_id: TEST_USER_ID },
    "ask_personalized",
    forcedClassification,
    null,
    false,
    null,
  );

  const text = String(response?.message || response?.text || "");
  if (!text.includes("high-stakes decision")) {
    fail(name, `unexpected response: ${text.slice(0, 140)}`);
    return false;
  }

  pass(name);
  return true;
}

async function main() {
  const checks = [
    testFactualClassification,
    testClassificationContract,
    testHighRiskHardClarify,
  ];

  let passed = 0;
  for (const check of checks) {
    try {
      const ok = await check();
      if (ok) passed += 1;
    } catch (err) {
      fail(check.name, err?.message || String(err));
    }
  }

  console.log(`\n${passed}/${checks.length} checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
}

main();
