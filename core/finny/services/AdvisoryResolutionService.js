function lower(text = "") {
  return String(text || "").toLowerCase();
}

function hasNumberContext(value) {
  return Number.isFinite(Number(value));
}

function countTrue(values = []) {
  return values.filter(Boolean).length;
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function extractMentionedAmount(message = "") {
  const text = String(message || "");
  const dollarMatch = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (dollarMatch?.[1]) {
    const value = Number(dollarMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  const plainMatch = text.match(
    /\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(usd|dollars?)\b/i,
  );
  if (plainMatch?.[1]) {
    const value = Number(plainMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

function summarizeSpendingContext(base = {}) {
  const currentMonth = Array.isArray(base.spendByCategoryCurrentMonth)
    ? base.spendByCategoryCurrentMonth
    : [];
  const lastMonth = Array.isArray(base.spendByCategoryLastMonth)
    ? base.spendByCategoryLastMonth
    : [];
  const rolling = Array.isArray(base.spendByCategory) ? base.spendByCategory : [];

  const sumCategorySpend = (items) =>
    items.reduce((sum, item) => {
      const amount = Number(item?.total_spend ?? item?.amount ?? 0);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);

  const currentTotal = sumCategorySpend(currentMonth);
  const lastTotal = sumCategorySpend(lastMonth);
  const rollingTotal = sumCategorySpend(rolling);

  return {
    hasCurrentMonth: currentMonth.length > 0,
    hasLastMonth: lastMonth.length > 0,
    hasRolling: rolling.length > 0,
    currentTotal,
    lastTotal,
    rollingTotal,
  };
}

function getInvestmentAssetsTotal(packs = {}) {
  const explicitInvestments = Number(packs?.invest?.totalValue ?? NaN);
  if (Number.isFinite(explicitInvestments)) {
    return explicitInvestments;
  }

  const accounts = Array.isArray(packs?.base?.accounts) ? packs.base.accounts : [];
  return accounts.reduce((sum, account) => {
    const isInvestment =
      account?.type === "investment" || account?.subtype === "investment";
    const balance = Number(
      account?.balance ?? account?.current_balance ?? account?.available ?? NaN,
    );
    return isInvestment && Number.isFinite(balance) ? sum + balance : sum;
  }, 0);
}

function getEstimatedMonthlyBurn(base = {}) {
  const spendSummary = summarizeSpendingContext(base);
  if (spendSummary.lastTotal > 0) return spendSummary.lastTotal;
  if (spendSummary.currentTotal > 0) return spendSummary.currentTotal;
  return null;
}

function isDiscretionarySubject(message = "", decision = {}) {
  const text = lower(message);
  const subject = lower(decision?.subject || "");

  if (
    /\b(luxury|trip|vacation|holiday|milan|japan|macbook|laptop|watch|art piece|art|shopping)\b/.test(
      text,
    )
  ) {
    return true;
  }

  return /\b(trip|vacation|watch|macbook|art|shopping)\b/.test(subject);
}

function isBusinessFundingAsk(message = "", decision = {}) {
  const text = lower(message);
  const subject = lower(decision?.subject || "");
  return /\b(start(?:ing)? a business|put into .*business|business)\b/.test(text) ||
    subject === "business" ||
    subject === "food business";
}

function getFinancialRealitySignals(packs = {}, profile = {}, message = "", decision = {}) {
  const base = packs?.base || {};
  const liquidAssets = Number(base.liquidAssets ?? NaN);
  const totalLiabilities = Number(base.totalLiabilities ?? NaN);
  const monthlyIncome = Number(profile?.monthly_income ?? NaN);
  const investmentAssets = getInvestmentAssetsTotal(packs);
  const monthlyBurn = getEstimatedMonthlyBurn(base);

  const liquidMinusLiabilities =
    Number.isFinite(liquidAssets) && Number.isFinite(totalLiabilities)
      ? liquidAssets - totalLiabilities
      : null;
  const liabilitiesToLiquidRatio = safeDivide(totalLiabilities, liquidAssets);
  const burnToIncomeRatio = safeDivide(monthlyBurn, monthlyIncome);
  const burnIncomeGap =
    Number.isFinite(monthlyBurn) && Number.isFinite(monthlyIncome)
      ? monthlyBurn - monthlyIncome
      : null;

  const debtNearLiquidAssets =
    Number.isFinite(liabilitiesToLiquidRatio) && liabilitiesToLiquidRatio >= 0.75;
  const burnAboveIncome =
    Number.isFinite(burnToIncomeRatio) && burnToIncomeRatio > 1.15;
  const hasInvestmentAssets = Number.isFinite(investmentAssets) && investmentAssets > 0;
  const discretionaryAsk = isDiscretionarySubject(message, decision);
  const businessFundingAsk = isBusinessFundingAsk(message, decision);

  let discretionaryAffordabilityPosture = "flexible";
  if (debtNearLiquidAssets || burnAboveIncome) {
    discretionaryAffordabilityPosture = "constrained";
  } else if (
    Number.isFinite(liabilitiesToLiquidRatio) && liabilitiesToLiquidRatio >= 0.35
  ) {
    discretionaryAffordabilityPosture = "cautious";
  }

  let safeSpendPosture = "normal";
  if (debtNearLiquidAssets || burnAboveIncome) {
    safeSpendPosture = "preserve_buffer";
  } else if (
    Number.isFinite(liquidMinusLiabilities) &&
    liquidMinusLiabilities < Math.max(monthlyIncome || 0, 1000)
  ) {
    safeSpendPosture = "tight_buffer";
  }

  return {
    liquidAssets,
    totalLiabilities,
    monthlyIncome,
    investmentAssets,
    monthlyBurn,
    liquidMinusLiabilities,
    liabilitiesToLiquidRatio,
    burnToIncomeRatio,
    burnIncomeGap,
    debtNearLiquidAssets,
    burnAboveIncome,
    hasInvestmentAssets,
    discretionaryAsk,
    businessFundingAsk,
    discretionaryAffordabilityPosture,
    safeSpendPosture,
  };
}

function hasExplicitSubject(message = "", decisionType = "none") {
  const text = lower(message);

  if (
    decisionType === "spend_limit" ||
    decisionType === "allocation" ||
    decisionType === "priority" ||
    decisionType === "none"
  ) {
    return true;
  }

  const explicitSubjectPatterns = [
    /\bhouse\b/,
    /\bhome\b/,
    /\bcar\b/,
    /\bwatch\b/,
    /\btrip\b/,
    /\bvacation\b/,
    /\bbusiness\b/,
    /\bfood business\b/,
    /\brestaurant\b/,
    /\brent\b/,
    /\bmortgage\b/,
    /\bdebt\b/,
    /\bloan\b/,
    /\bemergency fund\b/,
    /\bportfolio\b/,
    /\binvest(?:ment|ing)?\b/,
    /\bsavings?\b/,
    /\bbudget\b/,
    /\bretirement\b/,
    /\bcredit card\b/,
  ];

  if (explicitSubjectPatterns.some((pattern) => pattern.test(text))) {
    return true;
  }

  const referentialOnlyPatterns = [
    /\bcan i afford it\b/,
    /\bshould i buy it\b/,
    /\bshould i buy this\b/,
    /\bis it worth it\b/,
    /\bcan i afford this\b/,
  ];

  if (referentialOnlyPatterns.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (decisionType === "affordability" || decisionType === "tradeoff") {
    return !/\b(it|this|that)\b/.test(text);
  }

  return true;
}

function extractSubject(message = "", decisionType = "none") {
  const text = String(message || "").trim();
  const normalized = lower(text);

  if (decisionType === "spend_limit") return "available spending";
  if (decisionType === "allocation") return "money allocation";
  if (decisionType === "priority") return "financial priority";

  const nounMatches = [
    { pattern: /\bhouse\b/i, subject: "house" },
    { pattern: /\bhome\b/i, subject: "home" },
    { pattern: /\bcar\b/i, subject: "car" },
    { pattern: /\bwatch\b/i, subject: "watch" },
    { pattern: /\btrip\b/i, subject: "trip" },
    { pattern: /\bvacation\b/i, subject: "vacation" },
    { pattern: /\bbusiness\b/i, subject: "business" },
    { pattern: /\bfood business\b/i, subject: "food business" },
    { pattern: /\brestaurant\b/i, subject: "restaurant" },
    { pattern: /\bdebt\b/i, subject: "debt" },
    { pattern: /\bloan\b/i, subject: "loan" },
    { pattern: /\bsavings?\b/i, subject: "savings" },
    { pattern: /\binvest(?:ment|ing)?\b/i, subject: "investing" },
  ];

  const nounMatch = nounMatches.find((entry) => entry.pattern.test(text));
  if (nounMatch) return nounMatch.subject;

  if (
    /\b(can i afford it|should i buy this|should i buy it|is it worth it)\b/.test(
      normalized,
    )
  ) {
    return null;
  }

  const tripToMatch = text.match(/\btrip to ([^?.!,]+)/i);
  if (tripToMatch?.[1]) return `trip to ${tripToMatch[1].trim()}`;

  return null;
}

function extractTimeframe(message = "") {
  const text = String(message || "");
  const lowerText = lower(text);
  const patterns = [
    /\b(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/i,
    /\bthis year\b/i,
    /\bnext year\b/i,
    /\bthis month\b/i,
    /\blast month\b/i,
    /\bin june\b/i,
    /\bin july\b/i,
    /\bin august\b/i,
    /\bin september\b/i,
    /\bin october\b/i,
    /\bin november\b/i,
    /\bin december\b/i,
    /\bin january\b/i,
    /\bin february\b/i,
    /\bin march\b/i,
    /\bin april\b/i,
    /\bin may\b/i,
  ];

  const match = patterns.find((pattern) => pattern.test(text));
  if (!match) return null;

  const found = text.match(match);
  if (found?.[0]) return found[0].trim();

  if (/\bthis year\b/.test(lowerText)) return "this year";
  if (/\bnext year\b/.test(lowerText)) return "next year";
  if (/\bthis month\b/.test(lowerText)) return "this month";
  if (/\blast month\b/.test(lowerText)) return "last month";

  return null;
}

function extractGoalPosture(message = "") {
  const text = lower(message);

  if (/\b(max|maximum|risk it all|everything|all in)\b/.test(text)) {
    return /\b(safe|safely|without trouble|without getting in trouble)\b/.test(
      text,
    )
      ? "safe"
      : "max";
  }
  if (/\b(go all in|aggressive|risk everything)\b/.test(text)) {
    return "aggressive";
  }
  if (/\b(save as much as possible|save more)\b/.test(text)) {
    return "save_more";
  }
  if (/\b(safer|safe|lower risk|without trouble|without screwing myself)\b/.test(text)) {
    return "safe";
  }
  if (/\b(reduce risk|lower risk)\b/.test(text)) {
    return "reduce_risk";
  }

  return "neutral";
}

function hasPersonalMoneyContext(packs = {}, profile = {}) {
  const base = packs?.base || {};
  const spendSummary = summarizeSpendingContext(base);
  const accountCount = Array.isArray(base.accounts) ? base.accounts.length : 0;

  return (
    hasNumberContext(base.netWorth) ||
    hasNumberContext(base.liquidAssets) ||
    hasNumberContext(base.totalLiabilities) ||
    accountCount > 0 ||
    spendSummary.hasCurrentMonth ||
    spendSummary.hasLastMonth ||
    spendSummary.hasRolling ||
    hasNumberContext(profile?.monthly_income)
  );
}

function getInfoAnchors(packs = {}, profile = {}) {
  const base = packs?.base || {};
  const spendSummary = summarizeSpendingContext(base);

  const hasLiquidContext = hasNumberContext(base.liquidAssets);
  const hasIncomeContext = hasNumberContext(profile?.monthly_income);
  const hasDebtContext =
    hasNumberContext(base.totalLiabilities) ||
    (Array.isArray(base.accounts) &&
      base.accounts.some(
        (account) =>
          account?.type === "credit" || account?.subtype === "credit card",
      ));
  const hasSpendContext =
    spendSummary.hasCurrentMonth || spendSummary.hasLastMonth || spendSummary.hasRolling;
  const hasTransactionContext =
    Array.isArray(base.recentTransactions) && base.recentTransactions.length > 0;
  const hasCategoryContext =
    spendSummary.hasCurrentMonth || spendSummary.hasLastMonth || spendSummary.hasRolling;

  return {
    hasLiquidContext,
    hasIncomeContext,
    hasDebtContext,
    hasSpendContext,
    hasTransactionContext,
    hasCategoryContext,
    anchorCount: countTrue([
      hasLiquidContext,
      hasIncomeContext,
      hasDebtContext,
      hasSpendContext,
      hasTransactionContext,
      hasCategoryContext,
    ]),
  };
}

function buildDerivedValues(packs = {}, profile = {}, message = "", decision = {}) {
  const base = packs?.base || {};
  const spendSummary = summarizeSpendingContext(base);
  const derived = [];
  const reality = getFinancialRealitySignals(packs, profile, message, decision);

  if (hasNumberContext(base.liquidAssets)) {
    derived.push(`liquid_assets_total:${Number(base.liquidAssets).toFixed(2)}`);
  }
  if (Number.isFinite(reality.investmentAssets) && reality.investmentAssets > 0) {
    derived.push(`investment_assets_total:${Number(reality.investmentAssets).toFixed(2)}`);
    derived.push(`investment_assets_default:long_term_not_casual_spending`);
  }
  if (hasNumberContext(profile?.monthly_income)) {
    derived.push(
      `monthly_income_profile:${Number(profile.monthly_income).toFixed(2)}`,
    );
  }
  if (spendSummary.currentTotal > 0) {
    derived.push(`observed_spend_current_month:${spendSummary.currentTotal.toFixed(2)}`);
  }
  if (spendSummary.lastTotal > 0) {
    derived.push(`observed_spend_last_complete_month:${spendSummary.lastTotal.toFixed(2)}`);
    derived.push(`estimated_monthly_burn:${spendSummary.lastTotal.toFixed(2)}`);
  } else if (spendSummary.currentTotal > 0) {
    derived.push(`estimated_monthly_burn:${spendSummary.currentTotal.toFixed(2)}`);
  }
  if (hasNumberContext(base.totalLiabilities)) {
    derived.push(`known_total_liabilities:${Number(base.totalLiabilities).toFixed(2)}`);
  }
  if (Number.isFinite(reality.liquidMinusLiabilities)) {
    derived.push(`liquid_minus_liabilities:${reality.liquidMinusLiabilities.toFixed(2)}`);
  }
  if (Number.isFinite(reality.liabilitiesToLiquidRatio)) {
    derived.push(`liabilities_to_liquid_ratio:${reality.liabilitiesToLiquidRatio.toFixed(2)}`);
  }
  if (Number.isFinite(reality.burnIncomeGap)) {
    derived.push(`monthly_burn_minus_income:${reality.burnIncomeGap.toFixed(2)}`);
  }
  if (Number.isFinite(reality.burnToIncomeRatio)) {
    derived.push(`burn_to_income_ratio:${reality.burnToIncomeRatio.toFixed(2)}`);
  }
  if (reality.debtNearLiquidAssets) {
    derived.push(`cash_pressure:debt_near_liquid_assets`);
  }
  if (reality.burnAboveIncome) {
    derived.push(`cash_pressure:burn_above_income`);
  }
  if (reality.discretionaryAsk) {
    derived.push(
      `discretionary_affordability_posture:${reality.discretionaryAffordabilityPosture}`,
    );
  }
  if (reality.businessFundingAsk) {
    derived.push(`business_funding_posture:${reality.safeSpendPosture}`);
  }
  if (decision?.goal_posture === "safe") {
    derived.push(`safe_max_interpretation:preserve_buffer`);
  }

  return derived;
}

export function deriveAdvisoryJob(
  message,
  classificationResult = {},
  userState = {},
) {
  const text = lower(message);
  const intentType = classificationResult?.intent_type || null;

  if (intentType === "factual") return "lookup";
  if (intentType === "exploratory") return "understand";
  if (
    intentType === "crisis" ||
    userState?.emotionalState === "panicked" ||
    userState?.urgency === "crisis"
  ) {
    return "crisis_override";
  }

  if (
    /\b(help me plan|what'?s the plan|roadmap|step by step|what order should i|what should i pay off first|how should i pay this off)\b/.test(
      text,
    )
  ) {
    return "plan";
  }

  if (
    /\b(how can i save more|where am i wasting money|what should i cut|what should i cut back|how do i spend less|save more money|spending tip|spending advice|help me reduce spending|how can i cut down)\b/.test(
      text,
    )
  ) {
    return "improve";
  }

  if (
    /\b(can i afford|should i buy|what'?s the max i can spend|how much can i put into|what should i budget for|how long can this last|is it worth it|how much can i spend)\b/.test(
      text,
    )
  ) {
    return "assess";
  }

  if (intentType === "planning") return "plan";
  if (intentType === "actionable") return "assess";

  return "understand";
}

export function deriveDecisionContext(message, classificationResult = {}) {
  const text = lower(message);
  const decision = {
    type: "none",
    subject: null,
    timeframe: extractTimeframe(message),
    goal_posture: extractGoalPosture(message),
  };

  if (
    /\b(should i do .+ or .+|save or invest|trip or pay debt|pay debt or save)\b/.test(
      text,
    )
  ) {
    decision.type = "tradeoff";
  } else if (
    /\b(what should i tackle first|what should i pay off first|what order)\b/.test(
      text,
    )
  ) {
    decision.type = "priority";
  } else if (
    /\b(how much should go to|how should i split|how much should i invest|how much should i save|how much should i pay)\b/.test(
      text,
    )
  ) {
    decision.type = "allocation";
  } else if (
    /\b(how much can i spend|what'?s my max|how much can i put in(?:to)?|how much can i use|max i can spend)\b/.test(
      text,
    )
  ) {
    decision.type = "spend_limit";
  } else if (
    /\b(can i afford|should i buy|worth it|can i go on this trip|can i start this business|buy )\b/.test(
      text,
    )
  ) {
    decision.type = "affordability";
  }

  decision.subject = extractSubject(message, decision.type);
  return decision;
}

export function deriveRiskContext({
  message,
  classificationResult = {},
  packs = {},
  profile = {},
  advisoryJob,
  decision,
}) {
  const text = lower(message);
  const reasons = [];
  let level = "medium";
  const reality = getFinancialRealitySignals(packs, profile, message, decision);

  if (
    advisoryJob === "lookup" ||
    advisoryJob === "understand" ||
    advisoryJob === "improve"
  ) {
    level = "low";
  }

  if (
    /\b(house|home|mortgage|real estate|retirement|leverage|loan|debt payoff|move|moving|relocat|business|risk everything|all in|survive|without earning|no income)\b/.test(
      text,
    ) ||
    decision?.goal_posture === "aggressive" ||
    decision?.goal_posture === "max"
  ) {
    level = "high";
  }

  if (
    (reality.discretionaryAsk || reality.businessFundingAsk) &&
    (reality.debtNearLiquidAssets || reality.burnAboveIncome)
  ) {
    level = "high";
    reasons.push("real_life_affordability_pressure");
  }

  const baseRisk = String(classificationResult?.decision_risk || "").toLowerCase();
  if (baseRisk === "high") {
    level = "high";
    reasons.push("classifier_high_risk");
  } else if (baseRisk === "low" && level !== "high") {
    level = "low";
    reasons.push("classifier_low_risk");
  }

  if (advisoryJob === "plan" && level !== "high") {
    level = "medium";
    reasons.push("planning_question");
  }

  if (hasNumberContext(packs?.base?.liquidAssets) && Number(packs.base.liquidAssets) < 500) {
    reasons.push("thin_liquidity");
    if (level === "low") level = "medium";
  }

  if (!reasons.length) {
    reasons.push(`${advisoryJob || "general"}_${decision?.type || "none"}`);
  }

  if (hasNumberContext(profile?.monthly_income)) {
    reasons.push("has_income_context");
  }

  return { level, reasons };
}

export function deriveInfoContext({
  message,
  packs = {},
  profile = {},
  advisoryJob,
  decision,
}) {
  const base = packs?.base || {};
  const anchors = getInfoAnchors(packs, profile);
  const available = [];
  const missing = [];
  const blockers = [];
  const derived = buildDerivedValues(packs, profile, message, decision);
  const amount = extractMentionedAmount(message);

  if (decision?.subject) available.push("subject");
  if (decision?.timeframe) available.push("timeframe");
  if (Number.isFinite(amount)) available.push("mentioned_amount");
  if (anchors.hasLiquidContext) available.push("liquid_context");
  if (anchors.hasIncomeContext) available.push("income_context");
  if (anchors.hasDebtContext) available.push("debt_context");
  if (anchors.hasSpendContext) available.push("spend_context");
  if (anchors.hasTransactionContext) available.push("transaction_context");
  if (anchors.hasCategoryContext) available.push("category_context");

  if (!hasPersonalMoneyContext(packs, profile)) {
    blockers.push("no_personal_data");
  }

  const subjectIsClear = hasExplicitSubject(message, decision?.type);
  const hasMeaningfulMoneyAnchor = anchors.anchorCount > 0;
  const hasStrongMoneyContext =
    anchors.anchorCount >= 2 &&
    (anchors.hasLiquidContext ||
      anchors.hasIncomeContext ||
      anchors.hasSpendContext ||
      anchors.hasDebtContext);

  if (advisoryJob === "lookup") {
    const lookupAvailable =
      anchors.hasLiquidContext ||
      anchors.hasSpendContext ||
      anchors.hasTransactionContext ||
      anchors.hasCategoryContext ||
      hasNumberContext(base.netWorth);
    return {
      coverage: lookupAvailable ? "grounded" : "blocked",
      available,
      missing: lookupAvailable ? [] : ["requested_metric"],
      blockers: lookupAvailable ? [] : ["no_personal_data"],
      derived,
      confidence: lookupAvailable ? "high" : "low",
    };
  }

  if (advisoryJob === "understand") {
    return {
      coverage: "grounded",
      available,
      missing,
      blockers: [],
      derived,
      confidence: "high",
    };
  }

  if (advisoryJob === "improve") {
    if (!anchors.hasSpendContext && !anchors.hasTransactionContext && !anchors.hasCategoryContext) {
      blockers.push("no_personal_data");
      return {
        coverage: "blocked",
        available,
        missing: ["spend_context"],
        blockers: Array.from(new Set(blockers)),
        derived,
        confidence: "low",
      };
    }

    if (anchors.hasCategoryContext || anchors.hasTransactionContext) {
      return {
        coverage: "grounded",
        available,
        missing,
        blockers,
        derived,
        confidence: "high",
      };
    }

    missing.push("category_context");
    return {
      coverage: "partial",
      available,
      missing,
      blockers,
      derived,
      confidence: "medium",
    };
  }

  if (advisoryJob === "plan") {
    const hasTarget = decision?.type !== "none" || /\b(goal|save for|pay off|budget|plan)\b/i.test(message);
    if (!hasTarget) blockers.push("target_missing");
    if (!decision?.timeframe) missing.push("timeframe");
    if (!hasMeaningfulMoneyAnchor) blockers.push("no_personal_data");

    if (blockers.length > 0 && (!hasTarget || !hasMeaningfulMoneyAnchor)) {
      return {
        coverage: "blocked",
        available,
        missing,
        blockers: Array.from(new Set(blockers)),
        derived,
        confidence: "low",
      };
    }

    if (decision?.timeframe && hasStrongMoneyContext) {
      return {
        coverage: "grounded",
        available,
        missing,
        blockers,
        derived,
        confidence: "high",
      };
    }

    return {
      coverage: "partial",
      available,
      missing,
      blockers,
      derived,
      confidence: "medium",
    };
  }

  if (advisoryJob === "crisis_override") {
    return {
      coverage: hasMeaningfulMoneyAnchor ? "partial" : "blocked",
      available,
      missing: hasMeaningfulMoneyAnchor ? missing : ["personal_context"],
      blockers: hasMeaningfulMoneyAnchor ? blockers : ["no_personal_data"],
      derived,
      confidence: hasMeaningfulMoneyAnchor ? "medium" : "low",
    };
  }

  // assess fallback
  if (!subjectIsClear) {
    blockers.push("subject_missing");
  }

  if (!hasMeaningfulMoneyAnchor) {
    blockers.push("no_personal_data");
  }

  if (decision?.type === "affordability" && !Number.isFinite(amount)) {
    if (!subjectIsClear) {
      blockers.push("amount_missing");
    } else {
      missing.push("amount");
    }
  }

  if (decision?.type === "spend_limit" && !decision?.timeframe) {
    missing.push("timeframe");
  }

  if (blockers.includes("subject_missing")) {
    return {
      coverage: "blocked",
      available,
      missing,
      blockers: Array.from(new Set(blockers)),
      derived,
      confidence: "low",
    };
  }

  if (blockers.includes("no_personal_data")) {
    return {
      coverage: "blocked",
      available,
      missing,
      blockers: Array.from(new Set(blockers)),
      derived,
      confidence: "low",
    };
  }

  if (subjectIsClear && hasStrongMoneyContext) {
    return {
      coverage: "grounded",
      available,
      missing,
      blockers,
      derived,
      confidence: "high",
    };
  }

  if (subjectIsClear && hasMeaningfulMoneyAnchor) {
    if (!anchors.hasIncomeContext) missing.push("income_context");
    if (!anchors.hasSpendContext) missing.push("spend_context");
    return {
      coverage: "partial",
      available,
      missing: Array.from(new Set(missing)),
      blockers,
      derived,
      confidence: "medium",
    };
  }

  return {
    coverage: "blocked",
    available,
    missing: Array.from(new Set(missing)),
    blockers: Array.from(new Set(blockers)),
    derived,
    confidence: "low",
  };
}

function deriveOptionalQuestion(
  advisoryJob,
  decision,
  info,
  mode,
  userRefused,
) {
  if (userRefused || mode === "ask_one_blocker") {
    return { question_policy: "none", question_reason: "none" };
  }

  if (advisoryJob === "lookup" || advisoryJob === "understand" || advisoryJob === "crisis_override") {
    return { question_policy: "none", question_reason: "none" };
  }

  if (advisoryJob === "assess") {
    if (
      mode === "answer_with_assumptions" &&
      info.missing.some((item) =>
        ["timeframe", "amount", "income_context", "spend_context"].includes(item),
      )
    ) {
      return { question_policy: "optional_one", question_reason: "tighten_answer" };
    }

    if (
      mode === "answer_now" &&
      decision?.goal_posture === "neutral" &&
      ["spend_limit", "allocation", "priority", "tradeoff"].includes(decision?.type)
    ) {
      return { question_policy: "optional_one", question_reason: "clarify_goal" };
    }
  }

  if (advisoryJob === "improve") {
    if (mode !== "ask_one_blocker" && info.missing.includes("category_context")) {
      return { question_policy: "optional_one", question_reason: "unlock_next_step" };
    }
  }

  if (advisoryJob === "plan") {
    if (
      mode === "answer_with_assumptions" &&
      info.missing.some((item) => ["timeframe", "target_missing"].includes(item))
    ) {
      return { question_policy: "optional_one", question_reason: "unlock_next_step" };
    }
  }

  return { question_policy: "none", question_reason: "none" };
}

export function resolveAdvisoryMode({
  advisoryJob,
  decision,
  risk,
  info,
  userRefused,
}) {
  let mode = "answer_now";
  let assumptionPolicy = "none";

  if (info.coverage === "blocked") {
    if (
      userRefused &&
      !info.blockers.includes("subject_missing") &&
      !info.blockers.includes("target_missing")
    ) {
      mode = "answer_with_assumptions";
      assumptionPolicy = "explicit";
    } else {
      mode = "ask_one_blocker";
      assumptionPolicy = "none";
    }
  } else if (info.coverage === "partial") {
    mode = "answer_with_assumptions";
    assumptionPolicy = "explicit";
  }

  const questionConfig =
    mode === "ask_one_blocker"
      ? { question_policy: "required_one", question_reason: "blocker" }
      : deriveOptionalQuestion(
          advisoryJob,
          decision,
          info,
          mode,
          userRefused,
        );

  return {
    mode,
    question_policy: questionConfig.question_policy,
    question_reason: questionConfig.question_reason,
    max_questions: 1,
    assumption_policy: assumptionPolicy,
    response_shape:
      advisoryJob === "crisis_override" ? "crisis" : advisoryJob || "assess",
  };
}

export function buildAdvisoryRuntime({
  message,
  classificationResult = {},
  packs = {},
  profile = {},
  userState = {},
  userRefused = false,
}) {
  const advisory_job = deriveAdvisoryJob(message, classificationResult, userState);
  const decision = deriveDecisionContext(message, classificationResult);
  const risk = deriveRiskContext({
    message,
    classificationResult,
    packs,
    profile,
    advisoryJob: advisory_job,
    decision,
  });
  const info = deriveInfoContext({
    message,
    packs,
    profile,
    advisoryJob: advisory_job,
    decision,
  });
  const resolution = resolveAdvisoryMode({
    advisoryJob: advisory_job,
    decision,
    risk,
    info,
    userRefused,
  });

  return {
    advisory_job,
    decision,
    risk,
    info,
    resolution,
  };
}
