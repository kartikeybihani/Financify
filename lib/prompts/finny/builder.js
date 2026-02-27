/**
 * Main prompt builder for Finny chat (6-layer architecture).
 */

import { synthesizeFinancialData, prioritizeMemories } from "./synthesis.js";
import { resolveIntentStateConflict, selectStrategies } from "./state.js";
import { PROMPT_MODULES } from "./modules.js";

const PROMPT_DEBUG_FULL = process.env.PROMPT_DEBUG_FULL === "true";

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

export function buildContextAwarePromptDetailed(
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
  const strategiesForPrompt = strategies
    .filter((s) => s.name !== "personalization_strategy")
    .slice(0, 2);

  const memories = context.memory?.memories
    ? prioritizeMemories(context.memory.memories, message, intent.intent)
    : [];

  const style = finnyStyle || context?.profile?.finny_style || "conversational";

  const feedbackContext = context.feedbackContext || null;

  const promptParts = [];
  const layers = [];

  const coreIdentity = PROMPT_MODULES.core_identity();
  promptParts.push(coreIdentity);
  layers.push({
    id: "core_identity",
    title: "Core Identity",
    content: coreIdentity,
  });

  const emptyMerchantQueries = financialData?.emptyMerchantQueries || [];
  const currentSituation = PROMPT_MODULES.current_situation(
    intent,
    userState,
    synthesizedFinancial,
    conflictResolution,
    webSummary,
    contextHeader,
    decisionRisk,
    recentTurns,
    emptyMerchantQueries,
  );
  promptParts.push(currentSituation);
  layers.push({
    id: "current_situation",
    title: "Current Situation",
    content: currentSituation,
  });

  const responseStrategy = PROMPT_MODULES.response_strategy(
    strategiesForPrompt,
    conflictResolution,
  );
  promptParts.push(responseStrategy);
  layers.push({
    id: "response_strategy",
    title: "Response Strategy",
    content: responseStrategy,
  });

  strategiesForPrompt.forEach((strategy) => {
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
      const part = `${strategy.name
        .toUpperCase()
        .replace(/_/g, " ")}:\n${strategyContent}`;
      promptParts.push(part);
      layers.push({
        id: `response_strategy_impl:${strategy.name}`,
        title: `Response Strategy Impl: ${strategy.name}`,
        content: part,
      });
    }
  });

  const personalization = PROMPT_MODULES.personalization(
    context.profile || {},
    memories,
    feedbackContext || null,
    context.profile?.intent_context || null,
  );
  promptParts.push(personalization);
  layers.push({
    id: "personalization",
    title: "Personalization",
    content: personalization,
  });

  const communicationStyle = PROMPT_MODULES.communication_style(style);
  promptParts.push(communicationStyle);
  layers.push({
    id: "communication_style",
    title: "Communication Style",
    content: communicationStyle,
  });

  const responseGuidelines = PROMPT_MODULES.response_guidelines(
    intent,
    strategies,
    conflictResolution,
    context.userPrompt || null,
  );
  promptParts.push(responseGuidelines);
  layers.push({
    id: "response_guidelines",
    title: "Response Guidelines",
    content: responseGuidelines,
  });

  console.log(
    `\n📦 [PROMPT_ENGINE] 6-Layer Architecture: 1. Core Identity | 2. Current Situation (${
      intent.intent_type || "unknown"
    } intent) | 3. Response Strategy (${
      strategiesForPrompt.length
    } strategies) | 4. Personalization (${
      memories.length
    } memories) | 5. Communication Style (${style}) | 6. Response Guidelines`,
  );

  const system = promptParts.join("\n\n");

  if (PROMPT_DEBUG_FULL) {
    console.log("--------------------------------");
    console.log(system);
    console.log("--------------------------------");
  }

  return {
    system,
    layers,
    meta: {
      intent,
      decisionRisk,
      strategies: strategiesForPrompt.map((s) => s.name),
      memoriesCount: memories.length,
      style,
    },
  };
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
  return buildContextAwarePromptDetailed(
    message,
    context,
    financialData,
    userState,
    finnyStyle,
    classificationResult,
    webSummary,
    contextHeader,
    recentTurns,
  ).system;
}
