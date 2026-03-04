import assert from "node:assert/strict";

import {
  determineResponseContract,
  extractSpendingTipEvidence,
  validateResponseContract,
} from "../core/finny/services/ResponseContractService.js";

function baseClassification(overrides = {}) {
  return {
    intent: "ask_personalized",
    intent_type: "actionable",
    needs_user_data: true,
    ...overrides,
  };
}

function basePacks() {
  return {
    base: {
      liquidAssets: 4300.25,
      totalLiabilities: 4313.09,
      spendByCategoryCurrentMonth: [
        { category: "Food", total_spend: 37.18 },
        { category: "Business", total_spend: 27.03 },
      ],
      spendByCategoryLastMonth: [
        { category: "Travel", total_spend: 5262.93 },
        { category: "Housing", total_spend: 875.91 },
        { category: "Food", total_spend: 200.2 },
      ],
      recentTransactions: [
        { merchant: "American Airlines", amount: -550.56 },
        { merchant: "Temu", amount: -86.66 },
      ],
    },
  };
}

function main() {
  const message = "Give me a spending tip";
  const classification = baseClassification();
  const packs = basePacks();
  const profile = { monthly_income: 1500 };

  assert.equal(
    determineResponseContract(message, classification),
    "spending_tip_grounded",
  );

  const evidence = extractSpendingTipEvidence(packs, profile);
  assert.equal(evidence?.label, "Travel");
  assert.equal(evidence?.timeframe, "last_complete_month");

  const invalid = validateResponseContract({
    contract: "spending_tip_grounded",
    responseText:
      "Track your expenses for a month and see where your money is going.",
    message,
    packs,
    classificationResult: classification,
    spendingTipEvidence: evidence,
  });
  assert.equal(invalid.severity, "fail");
  assert.ok(invalid.issues.includes("manual_data_analysis_instruction"));
  assert.ok(invalid.issues.includes("missing_spending_anchor"));

  const valid = validateResponseContract({
    contract: "spending_tip_grounded",
    responseText:
      "Cut travel first. You spent $5262.93 there last month, which is the clearest place to trim.",
    message,
    packs,
    classificationResult: classification,
    spendingTipEvidence: evidence,
  });
  assert.equal(valid.severity, "none");

  const weak = validateResponseContract({
    contract: "spending_tip_grounded",
    responseText:
      "Here's a revised spending tip: consider a 30-day waiting period for travel. I can help you set a realistic budget for discretionary spending too.",
    message,
    packs,
    classificationResult: classification,
    spendingTipEvidence: evidence,
  });
  assert.equal(weak.severity, "fail");
  assert.ok(weak.issues.includes("weak_spending_tip_language"));

  const repairInvalid = validateResponseContract({
    contract: "repair_previous_answer",
    responseText:
      "I see you're confident about my role as a money coach. That's great! How's your week going?",
    message: "But that's your job",
    packs,
    classificationResult: classification,
    continuityDirective: {
      mode: "repair_previous_answer",
      source_user_message: "Give me a spending tip",
      source_assistant_message_excerpt: "Track your expenses for a month.",
      source_contract: "spending_tip_grounded",
      source_subject: "Travel",
    },
    spendingTipEvidence: evidence,
  });
  assert.equal(repairInvalid.severity, "fail");
  assert.ok(repairInvalid.issues.includes("defensive_repair_tone"));
  assert.ok(repairInvalid.issues.includes("off_topic_redirect"));

  console.log("✅ response contract checks passed");
}

main();
