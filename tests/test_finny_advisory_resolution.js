import assert from "node:assert/strict";

import {
  buildAdvisoryRuntime,
  deriveAdvisoryJob,
  deriveDecisionContext,
} from "../core/finny/services/AdvisoryResolutionService.js";

function baseClassification(overrides = {}) {
  return {
    intent: "ask_personalized",
    intent_type: "actionable",
    emotional_state: "neutral",
    decision_risk: "medium",
    ...overrides,
  };
}

function basePacks(overrides = {}) {
  return {
    base: {
      liquidAssets: 5413.94,
      totalLiabilities: 500,
      netWorth: 8644.17,
      accounts: [{ type: "depository", subtype: "checking", balance: 5413.94 }],
      spendByCategoryCurrentMonth: [
        { category: "Shopping", total_spend: 297.22 },
        { category: "Food", total_spend: 46.8 },
      ],
      recentTransactions: [
        { merchant: "Trader Joe's", amount: 46.8, date: "2026-03-01" },
      ],
    },
    ...overrides,
  };
}

function baseProfile(overrides = {}) {
  return {
    monthly_income: 3000,
    ...overrides,
  };
}

function assertRuntime(message, expected, options = {}) {
  const runtime = buildAdvisoryRuntime({
    message,
    classificationResult: baseClassification(options.classification),
    packs: basePacks(options.packs),
    profile: baseProfile(options.profile),
    userState: options.userState || { emotionalState: "neutral", urgency: "normal" },
    userRefused: options.userRefused || false,
  });

  if (expected.advisory_job) {
    assert.equal(runtime.advisory_job, expected.advisory_job);
  }
  if (expected.decision_type) {
    assert.equal(runtime.decision.type, expected.decision_type);
  }
  if (expected.coverage) {
    assert.equal(runtime.info.coverage, expected.coverage);
  }
  if (expected.risk_level) {
    assert.equal(runtime.risk.level, expected.risk_level);
  }
  if (expected.mode) {
    assert.equal(runtime.resolution.mode, expected.mode);
  }
  if (expected.question_policy) {
    assert.equal(runtime.resolution.question_policy, expected.question_policy);
  }
  if (expected.blocker) {
    assert.ok(runtime.info.blockers.includes(expected.blocker));
  }
  if (expected.derived_includes) {
    for (const item of expected.derived_includes) {
      assert.ok(
        runtime.info.derived.includes(item),
        `expected derived to include ${item}, got ${runtime.info.derived.join(", ")}`,
      );
    }
  }

  return runtime;
}

function main() {
  assert.equal(
    deriveAdvisoryJob(
      "How much have I spent this month?",
      baseClassification({ intent_type: "factual" }),
      { emotionalState: "neutral", urgency: "normal" },
    ),
    "lookup",
  );

  assert.equal(
    deriveDecisionContext("Give me the max I can spend").type,
    "spend_limit",
  );

  assertRuntime("How much have I spent this month?", {
    advisory_job: "lookup",
    decision_type: "none",
    coverage: "grounded",
    mode: "answer_now",
    question_policy: "none",
  }, {
    classification: { intent_type: "factual" },
  });

  assertRuntime("How much can I spend on a 2 week trip to Indonesia in June", {
    advisory_job: "assess",
    decision_type: "spend_limit",
    coverage: "grounded",
    mode: "answer_now",
  });

  assertRuntime("I want to save more money", {
    advisory_job: "improve",
    coverage: "grounded",
    mode: "answer_now",
  });

  assertRuntime("Can I afford it?", {
    advisory_job: "assess",
    decision_type: "affordability",
    coverage: "blocked",
    mode: "ask_one_blocker",
    question_policy: "required_one",
    blocker: "subject_missing",
  });

  assertRuntime(
    "Can I afford it?",
    {
      mode: "ask_one_blocker",
      question_policy: "required_one",
      blocker: "subject_missing",
    },
    { userRefused: true },
  );

  assertRuntime(
    "How much can I spend max so I can survive for 6 months without earning",
    {
      advisory_job: "assess",
      decision_type: "spend_limit",
      mode: "answer_now",
      question_policy: "none",
    },
    {
      userRefused: true,
      profile: { monthly_income: null },
      packs: {
        base: {
          liquidAssets: 5413.94,
          totalLiabilities: 500,
          netWorth: 8644.17,
          accounts: [{ type: "depository", subtype: "checking", balance: 5413.94 }],
          spendByCategoryCurrentMonth: [],
          spendByCategoryLastMonth: [],
          recentTransactions: [],
        },
      },
    },
  );

  assertRuntime(
    "Help me plan my debt payoff",
    {
      advisory_job: "plan",
      coverage: "partial",
      mode: "answer_with_assumptions",
      question_policy: "optional_one",
    },
    {
      packs: {
        base: {
          liquidAssets: 2500,
          totalLiabilities: 12000,
          netWorth: -3000,
          accounts: [{ type: "credit", subtype: "credit card", balance: 12000 }],
          spendByCategoryCurrentMonth: [{ category: "Food", total_spend: 300 }],
          recentTransactions: [{ merchant: "Rent", amount: 1200, date: "2026-03-01" }],
        },
      },
      profile: { monthly_income: 3200 },
    },
  );

  assertRuntime(
    "Help me plan my debt payoff",
    {
      advisory_job: "plan",
      coverage: "partial",
      mode: "answer_with_assumptions",
      question_policy: "none",
    },
    {
      userRefused: true,
      packs: {
        base: {
          liquidAssets: 2500,
          totalLiabilities: 12000,
          netWorth: -3000,
          accounts: [{ type: "credit", subtype: "credit card", balance: 12000 }],
          spendByCategoryCurrentMonth: [{ category: "Food", total_spend: 300 }],
          recentTransactions: [{ merchant: "Rent", amount: 1200, date: "2026-03-01" }],
        },
      },
      profile: { monthly_income: 3200 },
    },
  );

  assertRuntime(
    "How much can I put into my business this month?",
    {
      advisory_job: "assess",
      decision_type: "spend_limit",
      coverage: "grounded",
      mode: "answer_now",
      question_policy: "optional_one",
    },
    {
      packs: {
        base: {
          liquidAssets: 5413.94,
          totalLiabilities: 500,
          netWorth: 8644.17,
          accounts: [{ type: "depository", subtype: "checking", balance: 5413.94 }],
          spendByCategoryCurrentMonth: [],
          spendByCategoryLastMonth: [],
          recentTransactions: [],
        },
      },
      profile: { monthly_income: null },
    },
  );

  assertRuntime(
    "Can I afford a 10 day luxury trip to Japan right now?",
    {
      advisory_job: "assess",
      decision_type: "affordability",
      coverage: "grounded",
      risk_level: "high",
      mode: "answer_now",
      question_policy: "none",
      derived_includes: [
        "investment_assets_default:long_term_not_casual_spending",
        "discretionary_affordability_posture:constrained",
        "cash_pressure:debt_near_liquid_assets",
        "cash_pressure:burn_above_income",
      ],
    },
    {
      packs: {
        base: {
          liquidAssets: 4335.4,
          totalLiabilities: 4342.11,
          netWorth: 2756.75,
          accounts: [
            { type: "credit", subtype: "credit card", balance: 824.88 },
            { type: "investment", subtype: "investment", balance: 2763.46 },
            { type: "credit", subtype: "credit card", balance: 141.89 },
            { type: "depository", subtype: "checking", balance: 462.54 },
            { type: "depository", subtype: "checking", balance: 3925.86 },
            { type: "credit", subtype: "credit card", balance: 3375.34 },
          ],
          spendByCategoryCurrentMonth: [],
          spendByCategoryLastMonth: [
            { category: "Travel", total_spend: 5262.93 },
            { category: "Housing", total_spend: 875.91 },
            { category: "Food", total_spend: 200.2 },
            { category: "Groceries", total_spend: 176.22 },
            { category: "Business", total_spend: 99.17 },
            { category: "Badminton", total_spend: 53.0 },
            { category: "Other", total_spend: 25.96 },
            { category: "Entertainment", total_spend: 20.99 },
            { category: "Health", total_spend: 6.52 },
          ],
          recentTransactions: [{ merchant: "Capcut", amount: 13.03, date: "2026-02-28" }],
        },
      },
      profile: { monthly_income: 1500 },
    },
  );

  console.log("✅ advisory resolution tests passed");
}

main();
