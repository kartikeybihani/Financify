import { cleanResponseFormatting } from "../utils/formatting.js";

const GENERIC_DATA_ANALYSIS_PATTERNS = [
  /\btrack your expenses\b/i,
  /\bwrite down everything\b/i,
  /\breview your transactions\b/i,
  /\blook at your spending for a month\b/i,
  /\bsee where your money is going\b/i,
  /\bgo through your spending\b/i,
  /\bmonitor your spending\b/i,
  /\bkeep an eye on your expenses\b/i,
];

const SPENDING_TIP_PATTERNS = [
  /\bspending tip\b/i,
  /\bspending advice\b/i,
  /\bwhere should i cut\b/i,
  /\bwhere should i cut back\b/i,
  /\bhow do i spend less\b/i,
  /\bhow can i save more\b/i,
  /\bwhere am i wasting money\b/i,
  /\bhow can i cut down\b/i,
  /\bhelp me reduce spending\b/i,
];

const FOLLOWUP_REDIRECT_PATTERNS = [
  /\bwhat financial questions can i help you with\b/i,
  /\bhow'?s your week going\b/i,
  /\bpressing financial concerns\b/i,
];

const REPAIR_DEFENSIVE_PATTERNS = [
  /\bi see you'?re confident about my role\b/i,
  /\bthat'?s great\b/i,
  /\blet me explain how i work\b/i,
  /\bi'?m an ai\b/i,
];

function lower(text = "") {
  return String(text || "").toLowerCase();
}

function categoryName(item = {}) {
  return String(item?.category || item?.name || "").trim();
}

function categoryAmount(item = {}) {
  const amount = Number(item?.total_spend ?? item?.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function hasSpendData(base = {}) {
  return (
    (Array.isArray(base?.spendByCategoryCurrentMonth) &&
      base.spendByCategoryCurrentMonth.length > 0) ||
    (Array.isArray(base?.spendByCategoryLastMonth) &&
      base.spendByCategoryLastMonth.length > 0) ||
    (Array.isArray(base?.spendByCategory) && base.spendByCategory.length > 0)
  );
}

export function extractMentionedAmount(message = "") {
  const text = String(message);
  const dollarMatch = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (dollarMatch?.[1]) {
    const value = Number(dollarMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  const usdMatch = text.match(
    /\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(usd|dollars?)\b/i,
  );
  if (usdMatch?.[1]) {
    const value = Number(usdMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function countQuestionMarks(text = "") {
  const matches = String(text).match(/\?/g);
  return matches ? matches.length : 0;
}

export function isSpendingTipRequest(message = "") {
  return SPENDING_TIP_PATTERNS.some((pattern) => pattern.test(String(message || "")));
}

export function determineResponseContract(
  message = "",
  classificationResult = {},
  { continuityDirective = null } = {},
) {
  if (continuityDirective?.mode === "repair_previous_answer") {
    return "repair_previous_answer";
  }
  if (continuityDirective?.mode === "ask_followup_contextual") {
    return "followup_contextual";
  }

  const lowerMessage = lower(message);
  const intent = classificationResult?.intent || "ask_personalized";
  const intentType = classificationResult?.intent_type || null;
  const decisionRisk = classificationResult?.decision_risk || "unknown";

  const affordabilityPattern =
    /\b(can i afford|can i buy|should i buy|do u think i can buy|do you think i can buy|worth buying|worth it to buy)\b/.test(
      lowerMessage,
    ) ||
    (/\b(buy|purchase)\b/.test(lowerMessage) && /\$[\d,]+/.test(lowerMessage));

  if (intent === "ask_personalized" && isSpendingTipRequest(message)) {
    return "spending_tip_grounded";
  }
  if (intent === "ask_personalized" && affordabilityPattern) {
    return "affordability_decision";
  }
  if (intent === "ask_personalized" && intentType === "factual") {
    return "factual_lookup";
  }
  if (
    decisionRisk === "high" &&
    (intentType === "actionable" || intentType === "planning")
  ) {
    return "high_stakes_planning";
  }
  if (intent === "ask_personalized" && intentType === "exploratory") {
    return "education_explainer";
  }
  return "default_coach";
}

export function buildResponseContractInstructions(
  contract,
  {
    message = "",
    continuityDirective = null,
    spendingTipEvidence = null,
  } = {},
) {
  const amount = extractMentionedAmount(message);
  const amountProvided = Number.isFinite(amount);
  const lines = [`RESPONSE_CONTRACT: ${contract}`];

  if (contract === "affordability_decision") {
    lines.push("- Lead with the decision in the first sentence.");
    lines.push("- Use only necessary money context; do not dump balances.");
    lines.push("- Compute impact yourself; do not ask user to assess impact.");
    lines.push(
      amountProvided
        ? `- Purchase amount is already provided (${amount}); never ask for price again.`
        : "- If price is missing, ask exactly one question for price and stop.",
    );
  } else if (contract === "factual_lookup") {
    lines.push("- Direct answer first, then brief supporting math.");
    lines.push("- No coaching questions unless truly blocked.");
  } else if (contract === "high_stakes_planning") {
    lines.push("- Brief framing, 1-2 principles, at most one targeted blocker question.");
  } else if (contract === "education_explainer") {
    lines.push("- Direct explanation, short example, one practical takeaway.");
  } else if (contract === "spending_tip_grounded") {
    lines.push("- Lead with one concrete spend adjustment.");
    lines.push("- Use the provided spending evidence anchor.");
    lines.push("- Do not tell the user to track, review, or analyze spending data manually.");
    lines.push("- Ask zero questions unless truly blocked.");
    if (spendingTipEvidence?.label) {
      lines.push(
        `- Required anchor: ${spendingTipEvidence.label}${
          Number.isFinite(spendingTipEvidence.amount)
            ? ` ($${Number(spendingTipEvidence.amount).toFixed(2)})`
            : ""
        }.`,
      );
    }
  } else if (contract === "repair_previous_answer") {
    lines.push("- Acknowledge the miss in one short sentence max, then replace the answer.");
    lines.push("- Do not defend the previous answer or explain process.");
    if (continuityDirective?.source_user_message) {
      lines.push(
        `- Original question to answer: ${continuityDirective.source_user_message}`,
      );
    }
  } else if (contract === "followup_contextual") {
    lines.push("- Continue the same subject directly.");
    lines.push("- Do not restart, redirect, or ask a generic finance opener.");
  } else {
    lines.push("- Keep response concise, personalized, and directly actionable.");
  }

  return lines.join("\n");
}

export function buildGroundingPolicyHeader(
  classificationResult = {},
  packs = {},
) {
  if (!classificationResult?.needs_user_data) return null;
  if (!packs?.base && !packs?.categoryDetails) return null;
  return [
    "GROUNDING_RULES:",
    "- Base the answer on the provided user financial data.",
    "- Mention only the facts that materially change the answer.",
    "- Do not tell the user to manually review data Finny already has.",
  ].join("\n");
}

export function detectAffordabilityContractIssues(message = "", responseText = "") {
  const amountProvided = Number.isFinite(extractMentionedAmount(message));
  const lowerText = lower(responseText);
  const asksForPrice =
    /\b(how much is|what('?s| is) the price|price tag|what's the price range)\b/.test(
      lowerText,
    );
  const asksUserToAssessImpact =
    /\b(will it impact|how will it impact|do you think it will affect)\b/.test(
      lowerText,
    );
  const asksUserToCheckSavings =
    /\b(check if you have enough savings|make sure you have enough savings|ensure you have enough savings|check your savings)\b/.test(
      lowerText,
    );
  const hedgesKnownDebt = /\b(if you have any debt|if you have debt)\b/.test(
    lowerText,
  );
  const tooManyQuestions = countQuestionMarks(responseText) > 1;

  return {
    amountProvided,
    asksForPrice: amountProvided && asksForPrice,
    asksUserToAssessImpact,
    asksUserToCheckSavings,
    hedgesKnownDebt,
    tooManyQuestions,
  };
}

function getAffordabilityVerdictLine(message = "", packs = {}) {
  const amount = extractMentionedAmount(message);
  if (!Number.isFinite(amount)) return null;

  const liquidAssets = Number(packs?.base?.liquidAssets);
  const liabilities = Number(packs?.base?.totalLiabilities);
  if (!Number.isFinite(liquidAssets)) return null;

  const remaining = liquidAssets - amount;
  let decisionLine = "This purchase is possible, but it’s not a clean yes.";

  if (remaining < 1000) {
    decisionLine = "I’d hold off right now on this purchase.";
  } else if (Number.isFinite(liabilities) && liabilities > remaining) {
    decisionLine = "I’d only buy this if you pay cash and avoid adding debt.";
  }
  return decisionLine;
}

export function applyLightAffordabilityRepair(
  message = "",
  responseText = "",
  packs = {},
) {
  let text = String(responseText || "").trim();
  if (!text) return text;

  const issues = detectAffordabilityContractIssues(message, text);
  const hasContractIssue =
    issues.asksForPrice ||
    issues.asksUserToAssessImpact ||
    issues.asksUserToCheckSavings ||
    issues.hedgesKnownDebt ||
    issues.tooManyQuestions;

  if (!hasContractIssue) return text;

  text = text
    .replace(
      /(^|\n).*(price tag|what('?s| is) the price|what's the price range|how much is).*(\n|$)/gi,
      "\n",
    )
    .replace(
      /(^|\n).*(how will it impact|will it impact your|do you think it will affect).*(\n|$)/gi,
      "\n",
    )
    .replace(
      /(^|\n).*(check if you have enough savings|make sure you have enough savings|ensure you have enough savings|check your savings).*(\n|$)/gi,
      "\n",
    )
    .replace(/(^|\n).*(if you have any debt|if you have debt).*(\n|$)/gi, "\n");

  if (issues.tooManyQuestions) {
    const parts = text.split(/(?<=[.?!])\s+/);
    let questionKept = false;
    text = parts
      .filter((part) => {
        if (!part.includes("?")) return true;
        if (questionKept) return false;
        questionKept = true;
        return true;
      })
      .join(" ")
      .trim();
  }

  const verdict = getAffordabilityVerdictLine(message, packs);
  if (verdict) {
    const startsWithDecision =
      /^(i('| a)m|i would|you can|you should|this purchase|i’d|i'd)/i.test(text);
    if (!startsWithDecision) {
      text = `${verdict}\n\n${text}`;
    }
  }

  const amount = extractMentionedAmount(message);
  const liquidAssets = Number(packs?.base?.liquidAssets);
  if (
    Number.isFinite(amount) &&
    Number.isFinite(liquidAssets) &&
    !/cash after this purchase|would leave about \$/.test(lower(text))
  ) {
    const remaining = liquidAssets - amount;
    text = `${text}\n\n- Cash after this purchase would be about $${remaining.toFixed(
      2,
    )}.`;
  }

  return cleanResponseFormatting(text);
}

export function extractSpendingTipEvidence(
  packs = {},
  profile = {},
) {
  const base = packs?.base || {};
  const lastMonth = Array.isArray(base?.spendByCategoryLastMonth)
    ? base.spendByCategoryLastMonth
    : [];
  const currentMonth = Array.isArray(base?.spendByCategoryCurrentMonth)
    ? base.spendByCategoryCurrentMonth
    : [];
  const recentTransactions = Array.isArray(base?.recentTransactions)
    ? base.recentTransactions
    : [];
  const monthlyIncome = Number(profile?.monthly_income ?? NaN);
  const liquidAssets = Number(base?.liquidAssets ?? NaN);
  const liabilities = Number(base?.totalLiabilities ?? NaN);

  const discretionaryLabels = new Set([
    "travel",
    "shopping",
    "entertainment",
    "other",
    "badminton",
    "dining",
    "restaurants",
    "food",
  ]);

  const preferredCategories = lastMonth.length > 0 ? lastMonth : currentMonth;
  const discretionaryCategories = preferredCategories
    .map((item) => ({
      label: categoryName(item),
      amount: categoryAmount(item),
    }))
    .filter((item) => item.label && item.amount > 0)
    .filter((item) => discretionaryLabels.has(lower(item.label)));

  let bestCategory = discretionaryCategories.sort((a, b) => b.amount - a.amount)[0] || null;

  if (!bestCategory && preferredCategories.length > 0) {
    bestCategory = preferredCategories
      .map((item) => ({
        label: categoryName(item),
        amount: categoryAmount(item),
      }))
      .filter((item) => item.label && item.amount > 0)
      .sort((a, b) => b.amount - a.amount)[0] || null;
  }

  const merchantOutlier = recentTransactions
    .map((tx) => ({
      label: String(tx?.merchant || tx?.merchant_name || tx?.name || "").trim(),
      amount: Math.abs(Number(tx?.amount ?? 0)),
    }))
    .filter((tx) => tx.label && Number.isFinite(tx.amount) && tx.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0] || null;

  let cashPressure = "none";
  const debtNearLiquid =
    Number.isFinite(liquidAssets) &&
    Number.isFinite(liabilities) &&
    liquidAssets > 0 &&
    liabilities / liquidAssets >= 0.75;
  const burnAmount = bestCategory?.amount || 0;
  const burnAboveIncome =
    Number.isFinite(monthlyIncome) && monthlyIncome > 0 && burnAmount > monthlyIncome;
  if (debtNearLiquid && burnAboveIncome) cashPressure = "both";
  else if (debtNearLiquid) cashPressure = "debt_near_liquid";
  else if (burnAboveIncome) cashPressure = "burn_above_income";

  if (bestCategory) {
    return {
      kind: "category",
      label: bestCategory.label,
      amount: bestCategory.amount,
      timeframe: lastMonth.length > 0 ? "last_complete_month" : "current_month",
      rationale:
        burnAboveIncome || debtNearLiquid
          ? "dominant discretionary category with current income/cash pressure"
          : "dominant discretionary spending category",
      income_reference: Number.isFinite(monthlyIncome) ? monthlyIncome : null,
      cash_pressure: cashPressure,
    };
  }

  if (merchantOutlier) {
    return {
      kind: "merchant",
      label: merchantOutlier.label,
      amount: merchantOutlier.amount,
      timeframe: "recent_transactions",
      rationale: "largest recent merchant outlier",
      income_reference: Number.isFinite(monthlyIncome) ? monthlyIncome : null,
      cash_pressure: cashPressure,
    };
  }

  return null;
}

function responseMentionsEvidence(responseText = "", evidence = null) {
  if (!evidence) return false;
  const lowerText = lower(responseText);
  if (evidence.label && lowerText.includes(lower(evidence.label))) return true;
  if (Number.isFinite(evidence.amount)) {
    const amount = Number(evidence.amount).toFixed(2);
    if (lowerText.includes(amount) || lowerText.includes(String(Math.round(evidence.amount)))) {
      return true;
    }
  }
  return false;
}

function detectGenericDataAnalysisIssues(responseText = "", packs = {}, classificationResult = {}) {
  if (!classificationResult?.needs_user_data) return [];
  if (!hasSpendData(packs?.base || {}) && !packs?.categoryDetails) return [];
  const issues = [];
  for (const pattern of GENERIC_DATA_ANALYSIS_PATTERNS) {
    if (pattern.test(responseText)) {
      issues.push("manual_data_analysis_instruction");
      break;
    }
  }
  return issues;
}

export function validateResponseContract({
  contract,
  responseText,
  message = "",
  packs = {},
  classificationResult = {},
  continuityDirective = null,
  spendingTipEvidence = null,
} = {}) {
  const text = String(responseText || "").trim();
  const issues = [];
  let severity = "none";

  issues.push(...detectGenericDataAnalysisIssues(text, packs, classificationResult));

  if (contract === "spending_tip_grounded") {
    if (!spendingTipEvidence) {
      issues.push("missing_spending_evidence");
    }
    if (!responseMentionsEvidence(text, spendingTipEvidence)) {
      issues.push("missing_spending_anchor");
    }
    if (countQuestionMarks(text) > 0) {
      issues.push("unexpected_question");
    }
  } else if (contract === "repair_previous_answer") {
    if (REPAIR_DEFENSIVE_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.push("defensive_repair_tone");
    }
    if (FOLLOWUP_REDIRECT_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.push("off_topic_redirect");
    }
    if (continuityDirective?.source_user_message) {
      const originalLower = lower(continuityDirective.source_user_message);
      if (
        isSpendingTipRequest(originalLower) &&
        spendingTipEvidence &&
        !responseMentionsEvidence(text, spendingTipEvidence)
      ) {
        issues.push("repair_missing_spending_anchor");
      }
    }
  } else if (contract === "followup_contextual") {
    if (FOLLOWUP_REDIRECT_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.push("generic_followup_redirect");
    }
    if (
      continuityDirective?.source_subject &&
      !lower(text).includes(lower(continuityDirective.source_subject))
    ) {
      issues.push("missing_followup_subject");
    }
  } else if (contract === "affordability_decision") {
    const affordabilityIssues = detectAffordabilityContractIssues(message, text);
    if (
      affordabilityIssues.asksForPrice ||
      affordabilityIssues.asksUserToAssessImpact ||
      affordabilityIssues.asksUserToCheckSavings ||
      affordabilityIssues.hedgesKnownDebt ||
      affordabilityIssues.tooManyQuestions
    ) {
      issues.push("affordability_contract_issue");
    }
  }

  if (issues.length > 0) {
    severity =
      contract === "default_coach" || contract === "education_explainer"
        ? "warn"
        : "fail";
  }

  return { issues, severity };
}

export function buildContractRepairPrompt({
  contract,
  message = "",
  responseText = "",
  issues = [],
  continuityDirective = null,
  spendingTipEvidence = null,
} = {}) {
  const lines = [
    "You are rewriting a Finny answer because it violated the response contract.",
    "Return ONLY the corrected assistant reply.",
    `Contract: ${contract}`,
  ];

  if (issues.length > 0) {
    lines.push(`Issues: ${issues.join(", ")}`);
  }
  if (continuityDirective?.mode) {
    lines.push(`Continuity mode: ${continuityDirective.mode}`);
  }
  if (continuityDirective?.source_user_message) {
    lines.push(`Original user question: ${continuityDirective.source_user_message}`);
  }
  if (continuityDirective?.source_assistant_message_excerpt) {
    lines.push(
      `Previous answer excerpt: ${continuityDirective.source_assistant_message_excerpt}`,
    );
  }
  if (spendingTipEvidence?.label) {
    lines.push(
      `Required evidence anchor: ${spendingTipEvidence.label}${
        Number.isFinite(spendingTipEvidence.amount)
          ? ` ($${Number(spendingTipEvidence.amount).toFixed(2)})`
          : ""
      }`,
    );
  }
  lines.push(
    "Do not tell the user to track, review, or analyze data manually if Finny already has that data.",
  );
  lines.push(`Current user message: ${message}`);
  lines.push(`Rejected answer: ${responseText}`);

  return lines.join("\n");
}

export function renderDeterministicFallback({
  contract,
  continuityDirective = null,
  spendingTipEvidence = null,
} = {}) {
  if (
    (contract === "spending_tip_grounded" ||
      contract === "repair_previous_answer") &&
    spendingTipEvidence?.label &&
    Number.isFinite(spendingTipEvidence.amount)
  ) {
    const opener =
      contract === "repair_previous_answer" ? "You're right. " : "";
    const timeframe =
      spendingTipEvidence.timeframe === "last_complete_month"
        ? "last month"
        : spendingTipEvidence.timeframe === "current_month"
          ? "this month"
          : "recently";
    return cleanResponseFormatting(
      `${opener}The clearest place to cut right now is ${spendingTipEvidence.label}. You spent $${Number(
        spendingTipEvidence.amount,
      ).toFixed(
        2,
      )} there ${timeframe}, which is too large relative to your current cash pressure. Cut that first before worrying about smaller categories.`,
    );
  }

  if (contract === "followup_contextual" && continuityDirective?.source_subject) {
    return cleanResponseFormatting(
      `I’m still talking about ${continuityDirective.source_subject}. That’s the main thing driving the answer.`,
    );
  }

  return null;
}
