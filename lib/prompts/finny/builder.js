/**
 * Main prompt builder for Finny chat (6-layer architecture).
 */

import { synthesizeFinancialData, prioritizeMemories } from "./synthesis.js";
import { resolveIntentStateConflict, selectStrategies } from "./state.js";
import { PROMPT_MODULES } from "./modules.js";

export function adjustDecisionRisk({
  baseRisk,
  intentType,
  financialData,
  dataGaps = [],
}) {
  let riskScore =
    {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      UNKNOWN: 2,
    }[String(baseRisk).toUpperCase()] ?? 2;

  const base = financialData?.base || {};
  const netWorth = Number(base.netWorth ?? NaN);
  const liquidAssets = Number(base.liquidAssets ?? NaN);

  const hasNetWorth = Number.isFinite(netWorth);
  const hasLiquidity = Number.isFinite(liquidAssets);

  if (intentType === "planning" && dataGaps.length > 0) {
    riskScore = Math.max(riskScore, 3);
  }

  if (hasLiquidity && liquidAssets < 500) {
    riskScore = Math.max(riskScore, 3);
  }

  if (intentType === "planning" && hasNetWorth && netWorth < 25000) {
    riskScore = Math.max(riskScore, 3);
  }

  if (intentType === "exploratory") {
    riskScore = Math.min(riskScore, 2);
  }

  return riskScore === 3 ? "HIGH" : riskScore === 2 ? "MEDIUM" : "LOW";
}

export function buildContextAwarePrompt(
  message,
  context,
  financialData,
  userState,
  finnyStyle = null,
  classificationResult = null,
  webSummary = null,
  contextHeader = null,
  recentTurns = [],
) {
  const intent = {
    intent: classificationResult?.intent || "ask_personalized",
    intent_type: classificationResult?.intent_type || null,
  };

  const baseDecisionRisk = classificationResult?.decision_risk || "UNKNOWN";
  const decisionRisk = adjustDecisionRisk({
    baseRisk: baseDecisionRisk,
    intentType: intent.intent_type,
    financialData,
    dataGaps: classificationResult?.missing_fields || [],
  });

  const synthesizedFinancial = synthesizeFinancialData(financialData, intent);

  const conflictResolution = resolveIntentStateConflict(intent, userState);

  const strategies = selectStrategies(
    intent,
    userState,
    conflictResolution,
    decisionRisk,
  );

  const memories = context.memory?.memories
    ? prioritizeMemories(context.memory.memories, message, intent.intent)
    : [];

  const style = finnyStyle || context?.profile?.finny_style || "conversational";

  const feedbackContext = context.feedbackContext || null;

  const promptParts = [];

  promptParts.push(PROMPT_MODULES.core_identity());

  const emptyMerchantQueries = financialData?.emptyMerchantQueries || [];
  promptParts.push(
    PROMPT_MODULES.current_situation(
      intent,
      userState,
      synthesizedFinancial,
      conflictResolution,
      webSummary,
      contextHeader,
      decisionRisk,
      recentTurns,
      emptyMerchantQueries,
    ),
  );

  promptParts.push(
    PROMPT_MODULES.response_strategy(strategies, conflictResolution),
  );

  strategies.forEach((strategy) => {
    const impl = PROMPT_MODULES.response_strategy_impl[strategy.name];
    if (impl) {
      let strategyContent;
      if (typeof impl === "function") {
        if (strategy.name === "crisis_action_strategy") {
          strategyContent = impl(conflictResolution);
        } else {
          strategyContent = impl();
        }
      } else {
        strategyContent = impl;
      }
      promptParts.push(
        `${strategy.name.toUpperCase().replace(/_/g, " ")}:\n${strategyContent}`,
      );
    }
  });

  promptParts.push(
    PROMPT_MODULES.personalization(
      context.profile || {},
      memories,
      feedbackContext || null,
      context.profile?.intent_context || null,
    ),
  );

  promptParts.push(PROMPT_MODULES.communication_style(style));

  promptParts.push(
    PROMPT_MODULES.response_guidelines(
      intent,
      strategies,
      conflictResolution,
      context.userPrompt || null,
    ),
  );

  console.log(
    `\n📦 [PROMPT_ENGINE] 6-Layer Architecture: 1. Core Identity | 2. Current Situation (${
      intent.intent_type || "unknown"
    } intent) | 3. Response Strategy (${
      strategies.length
    } strategies) | 4. Personalization (${
      memories.length
    } memories) | 5. Communication Style (${style}) | 6. Response Guidelines`,
  );

  return promptParts.join("\n\n");
}
