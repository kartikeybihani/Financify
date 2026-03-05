// core/finny/pipeline/PromptAssemblyStage.js
/**
 * Prompt Assembly Stage - Stage 4 of Ask Pipeline
 * 
 * Responsibilities:
 * - Determine response contract
 * - Build contract instructions and grounding headers
 * - Build continuity headers
 * - Assemble complete prompt with all context layers
 * - Build advisory runtime instructions
 */

import { logDebug, logInfo } from "../utils/logging.js";
import {
  determineResponseContract,
  buildResponseContractInstructions,
  buildGroundingPolicyHeader,
  extractMentionedAmount,
  extractSpendingTipEvidence,
} from "../services/ResponseContractService.js";
import {
  buildContinuityPromptHeader,
} from "../services/ContinuityService.js";
import { buildAdvisoryRuntime } from "../services/AdvisoryResolutionService.js";
import { detectUserState } from "../../../lib/prompt_engine.js";
import { buildContextAwarePromptDetailed } from "../../../lib/prompt_engine.js";
import { buildFeedbackContext, getRecentConversationTurns } from "../../../lib/memoryUtils.js";
import { buildMainAskMessages } from "../../../lib/llm/promptLogging.js";

/**
 * Build insufficiency state for high-risk decisions
 */
export function buildInsufficiencyState(
  message,
  classificationResult,
  packs,
  profile,
) {
  const lower = String(message || "").toLowerCase();
  const base = packs?.base || {};
  const missing_numeric_inputs = [];
  const missing_decision_context = [];

  const highRisk = classificationResult?.decision_risk === "high";

  if (highRisk) {
    if (!(Number(profile?.monthly_income) > 0)) {
      missing_numeric_inputs.push("income_takehome");
    }
    if (!Number.isFinite(Number(base.liquidAssets))) {
      missing_numeric_inputs.push("current_savings");
    }
    if (!Number.isFinite(Number(base.totalLiabilities))) {
      missing_numeric_inputs.push("debt_balances");
    }
  }

  const houseLike =
    /\b(house|home|mortgage|property|condo|real estate)\b/.test(lower) &&
    /\b(buy|purchase|afford|should)\b/.test(lower);
  if (houseLike && highRisk) {
    if (
      !/\b(investment|rental|primary|first home|vacation|luxury|live in)\b/.test(
        lower,
      )
    ) {
      missing_decision_context.push("purchase_purpose");
    }
    if (
      !/\b(in \d+ months?|by \d{4}|this year|next year|timeline)\b/.test(lower)
    ) {
      missing_decision_context.push("timeline");
    }
  }

  return {
    missing_numeric_inputs: Array.from(new Set(missing_numeric_inputs)),
    missing_decision_context: Array.from(new Set(missing_decision_context)),
  };
}

/**
 * Detect if user is refusing to answer questions
 */
export function detectRefusalToAnswer(text) {
  if (!text || typeof text !== "string") return false;
  return /\b(just tell me|no questions|don't ask|dont ask|stop asking|whatever just answer|idk just answer)\b/i.test(
    text,
  );
}

/**
 * Detect if intent is ambiguous
 */
export function detectAmbiguousIntent(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();

  const patterns = [
    /\bshould i\b/,
    /\bis it worth it\b/,
    /\bworth it\b/,
    /\bhelp me decide\b/,
    /\bwhat should i do\b/,
    /\bwhat do i do\b/,
    /\bdo you think i should\b/,
    /\bhow do i decide\b/,
  ];

  if (patterns.some((p) => p.test(lower))) return true;
  if (lower.trim() === "help") return true;

  return false;
}

/**
 * Build deterministic high-risk clarification response
 */
export function buildHighRiskClarificationResponse(insufficiency) {
  const numeric = insufficiency?.missing_numeric_inputs || [];
  const decision = insufficiency?.missing_decision_context || [];
  const questions = [];

  if (decision.includes("purchase_purpose")) {
    questions.push(
      "Is this purchase for a primary home, investment/rental, vacation, or luxury use?",
    );
  }
  if (decision.includes("timeline")) {
    questions.push("What timeline are you targeting for this purchase?");
  }
  if (numeric.includes("income_takehome")) {
    questions.push("What is your current monthly take-home income?");
  }
  if (numeric.includes("current_savings")) {
    questions.push(
      "How much cash is available today for down payment and buffer?",
    );
  }

  const finalQuestions = questions.slice(0, 3);
  return {
    type: "assistant",
    message: [
      "This is a high-stakes decision, so I won't guess and give a fake-precise recommendation.",
      "",
      ...finalQuestions.map((q, idx) => `${idx + 1}. ${q}`),
    ].join("\n"),
    hideActions: true,
  };
}

/**
 * Execute Prompt Assembly Stage
 * Returns complete prompt and metadata
 */
export async function executePromptAssemblyStage(input) {
  const {
    message,
    classification,
    packs,
    enrichedData,
    context,
    continuityOverride,
    userRefused,
    ambiguousIntent,
  } = input;

  logInfo("📝 [STAGE:PROMPT] Starting prompt assembly stage");

  const routingMessage = continuityOverride?.source_user_message || message;
  const userId = context?.user_id;
  const chatId = context?.chat_id || null;
  const profile = context?.profile || {};

  // 1. Determine response contract
  const responseContract = determineResponseContract(
    routingMessage,
    classification,
    { continuityDirective: continuityOverride },
  );

  logInfo(`📋 [STAGE:PROMPT] Response contract: ${responseContract}`);

  // 2. Build user state for advisory runtime
  const financialDataForState = {
    accounts: packs?.base?.accounts || [],
    netWorth: packs?.base?.netWorth || 0,
    liquidAssets: packs?.base?.liquidAssets || 0,
    totalLiabilities: packs?.base?.totalLiabilities || 0,
  };

  const userState = detectUserState(
    message,
    financialDataForState,
    classification,
  );

  // 3. Build advisory runtime (if enabled)
  const advisoryRuntimeEnabled = 
    String(process.env.FINNY_ADVISORY_RUNTIME_V1 || "").toLowerCase() === "true";
  
  const advisoryRuntime = advisoryRuntimeEnabled
    ? buildAdvisoryRuntime({
        message: routingMessage,
        classificationResult: classification,
        packs,
        profile,
        userState,
        userRefused,
      })
    : null;

  if (advisoryRuntime) {
    logInfo("🧭 [STAGE:PROMPT] Advisory runtime:", {
      advisory_job: advisoryRuntime.advisory_job,
      resolution_mode: advisoryRuntime.resolution?.mode,
      question_policy: advisoryRuntime.resolution?.question_policy,
    });
  }

  const spendingTipEvidence =
    responseContract === "spending_tip_grounded" ||
    (responseContract === "repair_previous_answer" &&
      continuityOverride?.source_contract === "spending_tip_grounded")
      ? extractSpendingTipEvidence(packs, profile)
      : null;

  // 4. Build contract instructions
  const amountMentioned = extractMentionedAmount(routingMessage);
  const contractInstructions = buildResponseContractInstructions(
    responseContract,
    {
      message: routingMessage,
      continuityDirective: continuityOverride,
      spendingTipEvidence,
    }
  );

  // 5. Build grounding policy header
  const groundingHeader = buildGroundingPolicyHeader(
    classification,
    packs,
  );

  // 6. Build continuity header if needed
  let continuityHeader = "";
  if (continuityOverride) {
    continuityHeader = buildContinuityPromptHeader(continuityOverride);
  }

  const classificationHeader = classification
    ? `CLASSIFICATION:\n- needs_clarification: ${
        classification.needs_clarification
      }\n- info_sufficiency: ${
        classification.info_sufficiency
      }\n- decision_risk: ${
        classification.decision_risk
      }\n- missing_fields: ${JSON.stringify(classification.missing_fields || [])}`
    : null;

  const contextHeader = [
    `CONTEXT_PACKS_INCLUDED: [${Object.keys(packs || {}).join(", ")}]`,
    `DATA_GAPS: ${JSON.stringify(context?.data_gaps || [])}`,
    classificationHeader,
    groundingHeader,
    continuityHeader || null,
    contractInstructions,
  ]
    .filter(Boolean)
    .join("\n\n");

  // 7. Build feedback context
  let feedbackContext = null;
  if (context.feedbackPatterns) {
    feedbackContext = buildFeedbackContext(context.feedbackPatterns);
  }

  // 8. Assemble complete prompt
  const contextWithFeedback = {
    ...context,
    feedbackContext,
  };

  const recentTurns = await getRecentConversationTurns(userId, chatId, {
    maxMessages: 8,
    maxChars: 6000,
  });

  const finnyStyle = profile?.finny_style || null;

  const promptResult = buildContextAwarePromptDetailed(
    message,
    contextWithFeedback,
    packs,
    userState,
    finnyStyle,
    classification,
    enrichedData?.webSummary || "",
    contextHeader,
    recentTurns,
    advisoryRuntime,
  );

  const promptText = String(promptResult?.system || "");
  const messages = buildMainAskMessages({
    system: promptText,
    recentTurns,
    userMessage: message,
  });

  logInfo("✅ [STAGE:PROMPT] Prompt assembly complete", {
    promptLength: promptText.length,
    contract: responseContract,
    hasAdvisory: !!advisoryRuntime,
    hasContinuity: !!continuityOverride,
    recentTurns: recentTurns.length,
  });

  return {
    prompt: promptText,
    messages,
    responseContract,
    advisoryRuntime,
    userState,
    amountMentioned,
    groundingHeader,
    contractInstructions,
    continuityHeader,
    feedbackContext,
    spendingTipEvidence,
    routingMessage,
    recentTurns,
  };
}
