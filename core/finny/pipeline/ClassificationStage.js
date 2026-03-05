// core/finny/pipeline/ClassificationStage.js
/**
 * Classification Stage - Stage 1 of Ask Pipeline
 * 
 * Responsibilities:
 * - Normalize classification results with context data
 * - Merge classification with continuity directives
 * - Build classification hints from conversation history
 * - Determine final intent and risk levels
 */

import { logDebug, logInfo } from "../utils/logging.js";
import { buildContinuityClassification } from "../services/ContinuityService.js";

/**
 * Normalize classification result based on available context data
 * Adjusts missing_fields, info_sufficiency, and decision_risk based on actual data
 */
export function normalizeClassificationFromContext(
  classificationResult,
  packs = {},
  profile = {},
) {
  if (!classificationResult || typeof classificationResult !== "object") {
    return classificationResult;
  }

  const out = { ...classificationResult };
  const base = packs.base || {};

  const hasBaseContext =
    Number.isFinite(Number(base.netWorth)) ||
    Number.isFinite(Number(base.liquidAssets)) ||
    Number.isFinite(Number(base.totalLiabilities)) ||
    (Array.isArray(base.accounts) && base.accounts.length > 0);

  const hasSpendFromBase =
    (Array.isArray(base.spendByCategoryCurrentMonth) &&
      base.spendByCategoryCurrentMonth.length > 0) ||
    (Array.isArray(base.spendByCategoryLastMonth) &&
      base.spendByCategoryLastMonth.length > 0) ||
    (Array.isArray(base.spendByCategory) && base.spendByCategory.length > 0);

  const hasSpendFromPack =
    !!packs.spend &&
    (Number.isFinite(Number(packs.spend.total)) ||
      Number.isFinite(Number(packs.spend.count)) ||
      (Array.isArray(packs.spend.transactions) &&
        packs.spend.transactions.length > 0));

  const hasIncome = Number(profile?.monthly_income) > 0;
  const hasDebtSignal =
    Number.isFinite(Number(base.totalLiabilities)) ||
    (Array.isArray(base.accounts) &&
      base.accounts.some((acc) => acc?.type === "credit"));

  if (!Array.isArray(out.missing_fields)) out.missing_fields = [];

  out.missing_fields = out.missing_fields.filter((field) => {
    if (
      (field === "income_takehome" || field === "income_gross") &&
      hasIncome
    ) {
      return false;
    }
    if (field === "current_savings" && hasBaseContext) return false;
    if (field === "debt_balances" && hasDebtSignal) return false;
    return true;
  });

  const hasActionableContext =
    hasBaseContext || hasSpendFromBase || hasSpendFromPack || hasIncome;

  if (hasActionableContext && out.missing_fields.length === 0) {
    out.info_sufficiency = "sufficient";
    out.needs_clarification = false;
  }

  if (out.decision_risk === "unknown") {
    out.decision_risk =
      out.intent_type === "planning" || out.intent_type === "actionable"
        ? "medium"
        : "low";
  }

  if (out.intent === "ask_personalized" && out.intent_type === "factual") {
    if (out.decision_risk !== "high") out.decision_risk = "low";
    if (out.info_sufficiency === "unknown") {
      out.info_sufficiency = hasBaseContext ? "sufficient" : "unknown";
    }
    if (out.info_sufficiency === "missing") out.info_sufficiency = "unknown";
    out.needs_clarification = false;
    out.missing_fields = [];
  }

  return out;
}

/**
 * Execute Classification Stage
 * Returns normalized classification with context awareness
 */
export async function executeClassificationStage(input) {
  const {
    message,
    classificationResult,
    packs,
    profile,
    userId,
    chatId,
    continuityOverride,
  } = input;

  logInfo("🎯 [STAGE:CLASSIFICATION] Starting classification stage");

  // 1. Normalize classification with context data
  const normalizedClassification = normalizeClassificationFromContext(
    classificationResult,
    packs,
    profile,
  );

  // 2. Build continuity classification if needed
  let finalClassification = normalizedClassification;
  if (continuityOverride) {
    const continuityClassification = buildContinuityClassification(
      continuityOverride,
      normalizedClassification,
    );
    if (continuityClassification) {
      finalClassification = {
        ...normalizedClassification,
        ...continuityClassification,
      };
      logDebug(
        "🔄 [STAGE:CLASSIFICATION] Applied continuity classification override",
      );
    }
  }

  // 3. Build classification hint from conversation history if available
  const classificationHint = null;

  logInfo("✅ [STAGE:CLASSIFICATION] Classification stage complete", {
    intent: finalClassification?.intent,
    decision_risk: finalClassification?.decision_risk,
    info_sufficiency: finalClassification?.info_sufficiency,
  });

  return {
    classification: finalClassification,
    classificationHint,
    normalizedClassification,
  };
}
