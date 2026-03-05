// core/finny/pipeline/ExecutionStage.js
/**
 * Execution Stage - Stage 5 of Ask Pipeline
 * 
 * Responsibilities:
 * - Execute LLM call with fallback models
 * - Validate response against contract
 * - Apply repair logic for contract violations
 * - Handle affordability-specific repairs
 * - Enforce advisory question policies
 */

import { logDebug, logInfo, logWarn, logError } from "../utils/logging.js";
import { cleanResponseFormatting } from "../utils/formatting.js";
import {
  validateResponseContract,
  buildContractRepairPrompt,
  applyLightAffordabilityRepair,
  buildGuidedSpendingTipRepairPrompt,
  renderDeterministicFallback,
  countQuestionMarks,
} from "../services/ResponseContractService.js";
import { STANDARD_MODEL, TERTIARY_MODEL, getOpenRouterKey } from "../utils/constants/modelConfig.js";

/**
 * Enforce advisory question policy on response text
 */
export function enforceAdvisoryQuestionPolicy(responseText = "", advisoryRuntime = null) {
  const text = String(responseText || "").trim();
  if (!text || !advisoryRuntime?.resolution) return text;

  const questionPolicy = advisoryRuntime.resolution.question_policy || "none";
  const allowedQuestions =
    questionPolicy === "required_one" || questionPolicy === "optional_one"
      ? 1
      : 0;

  if (countQuestionMarks(text) <= allowedQuestions) return text;

  const segments = text.split(/(?<=[.?!])\s+/).filter(Boolean);
  const questionSegments = segments.filter((segment) => segment.includes("?"));
  if (questionSegments.length === 0) return text;

  if (allowedQuestions === 0) {
    const nonQuestionSegments = segments.filter((segment) => !segment.includes("?"));
    const repaired = nonQuestionSegments.join(" ").trim();
    if (repaired) return repaired;

    const strippedQuestions = text.replace(/\?/g, "").trim();
    return strippedQuestions || text;
  }

  const keepQuestion =
    questionPolicy === "optional_one"
      ? questionSegments[questionSegments.length - 1]
      : questionSegments[0];

  let kept = false;
  const repaired = segments
    .filter((segment) => {
      if (!segment.includes("?")) return true;
      if (!kept && segment === keepQuestion) {
        kept = true;
        return true;
      }
      return false;
    })
    .join(" ")
    .replace(/\s+\n/g, "\n")
    .trim();

  return repaired || text;
}

/**
 * Build deterministic category exclusion answer
 */
export function buildDeterministicCategoryExclusionAnswer(message, basePack = {}) {
  if (!message || !basePack) return null;
  const lower = String(message).toLowerCase();
  if (
    !lower.includes("this month") ||
    (!lower.includes("besides") &&
      !lower.includes("excluding") &&
      !lower.includes("except"))
  ) {
    return null;
  }

  const categories = Array.isArray(basePack.spendByCategoryCurrentMonth)
    ? basePack.spendByCategoryCurrentMonth
    : [];
  if (categories.length === 0) return null;

  const categoryNames = categories
    .map((c) => String(c?.category || c?.name || "").toLowerCase())
    .filter(Boolean);

  const exclusionRegex =
    /\b(?:besides|excluding|except)\s+([a-z][a-z\s]{1,30})/i;
  const match = lower.match(exclusionRegex);
  if (!match) return null;

  const requested = match[1].trim();
  const excludedName =
    categoryNames.find(
      (name) => requested.includes(name) || name.includes(requested),
    ) || null;
  if (!excludedName) return null;

  const normalizedExcluded = excludedName.toLowerCase();
  const included = categories.filter(
    (c) =>
      String(c?.category || c?.name || "").toLowerCase() !== normalizedExcluded,
  );
  if (included.length === 0) return null;

  const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const includedTotal = included.reduce(
    (sum, c) => sum + asNumber(c?.total_spend ?? c?.amount),
    0,
  );
  const excludedAmount = categories.find(
    (c) =>
      String(c?.category || c?.name || "").toLowerCase() === normalizedExcluded,
  );
  const excludedTotal = asNumber(
    excludedAmount?.total_spend ?? excludedAmount?.amount,
  );

  const lines = included.map((c) => {
    const category = c?.category || c?.name || "Unknown";
    const total = asNumber(c?.total_spend ?? c?.amount);
    return `- ${category}: $${total.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  });

  const excludedDisplay =
    excludedAmount?.category || excludedAmount?.name || requested;

  return [
    `This month, excluding ${excludedDisplay}, you've spent $${includedTotal.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )}.`,
    "",
    ...lines,
    "",
    `${excludedDisplay} itself is $${excludedTotal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}.`,
  ].join("\n");
}

/**
 * Execute Execution Stage
 * Returns final response text with validation
 */
export async function executeExecutionStage(input) {
  const {
    messages,
    responseContract,
    advisoryRuntime,
    message,
    routingMessage = null,
    packs,
    classification,
    profile,
    continuityOverride = null,
    spendingTipEvidence = null,
    llmService,
    timings = {},
    toolsUsed = [],
  } = input;

  logInfo("🤖 [STAGE:EXECUTION] Starting execution stage");

  const llmT0 = Date.now();

  // 1. Execute LLM call with fallback
  const llmModels = [STANDARD_MODEL, TERTIARY_MODEL];
  let resp;
  let usedModel = llmModels[0];

  try {
    const llmResult = await llmService.callWithFallback(
      llmModels,
      async (model, options) => {
        const modelTemperature =
          responseContract === "factual_lookup" ? 0.2 : 0.35;
        // Build LLM call
        return await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            "Content-Type": "application/json",
          },
          signal: options.signal,
          body: JSON.stringify({
            model,
            temperature: modelTemperature,
            max_tokens: 6000,
            stream: false,
            reasoning: { effort: "minimal", exclude: true },
            messages,
          }),
        });
      },
      20000,
      "LLM",
    );
    resp = llmResult.result;
    usedModel = llmResult.model;
  } catch (llmError) {
    logError("❌ [STAGE:EXECUTION] All LLM attempts failed:", llmError?.message);
    throw new Error("LLM_FAILURE");
  }

  const llmLatency = Date.now() - llmT0;
  timings.llm_ms = llmLatency;
  toolsUsed.push({
    name: "llm",
    latency_ms: llmLatency,
    cache_hit: false,
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    logError("❌ [STAGE:EXECUTION] OpenRouter API error:", resp.status);
    throw new Error(`LLM_API_ERROR: ${resp.status}`);
  }

  const data = await resp.json();
  const responseMessage = data.choices?.[0]?.message || {};
  const finishReason = data.choices?.[0]?.finish_reason;
  const usage = data.usage || {};

  let cleanText = responseMessage.content || "I'm not sure yet. Ask me again?";

  logInfo(`✅ [STAGE:EXECUTION] LLM response received (${cleanText.length} chars, ${llmLatency}ms)`);

  // 2. Apply deterministic arithmetic override if applicable
  const deterministicSpendAnswer = buildDeterministicCategoryExclusionAnswer(
    message,
    packs.base || {},
  );
  if (deterministicSpendAnswer) {
    logInfo("🧮 [STAGE:EXECUTION] Using deterministic category-exclusion answer");
    cleanText = deterministicSpendAnswer;
  }

  // 3. Apply affordability repair if needed
  if (responseContract === "affordability_decision") {
    const repaired = applyLightAffordabilityRepair(
      routingMessage || message,
      cleanText,
      packs,
      profile,
    );
    if (repaired && repaired !== cleanText) {
      logInfo("🧭 [STAGE:EXECUTION] Applied light affordability repair");
      cleanText = repaired;
    }
  }

  // 4. Enforce advisory question policy
  if (advisoryRuntime) {
    const repaired = enforceAdvisoryQuestionPolicy(cleanText, advisoryRuntime);
    if (repaired && repaired !== cleanText) {
      logInfo("🧭 [STAGE:EXECUTION] Enforced question policy");
      cleanText = repaired;
    }
  }

  let contractRepairUsed = false;
  let contractFallbackUsed = false;

  async function callContractRepairLLM(
    model,
    repairPrompt,
    options = {},
  ) {
    const repairMessages = [
      {
        role: "system",
        content: [
          "You are Finny.",
          "Rewrite the reply so it satisfies the response contract and uses the provided financial context.",
          "Return only the final assistant reply.",
        ].join("\n"),
      },
      {
        role: "user",
        content: repairPrompt,
      },
    ];

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenRouterKey()}`,
        "Content-Type": "application/json",
      },
      signal: options.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1800,
        stream: false,
        reasoning: { effort: "minimal", exclude: true },
        messages: repairMessages,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`OpenRouter error ${resp.status}: ${errorText}`);
    }
    return resp;
  }

  // 5. Validate response contract
  let contractValidationResult = validateResponseContract({
    contract: responseContract,
    responseText: cleanText,
    message: routingMessage || message,
    packs,
    classificationResult: classification,
    continuityDirective: continuityOverride,
    spendingTipEvidence,
  });

  if (contractValidationResult.severity === "fail") {
    logWarn("⚠️ [STAGE:EXECUTION] Contract validation failed; attempting constrained repair", {
      contract: responseContract,
      issues: contractValidationResult.issues,
    });

    try {
      const repairPrompt = buildContractRepairPrompt({
        contract: responseContract,
        message: routingMessage || message,
        responseText: cleanText,
        issues: contractValidationResult.issues,
        continuityDirective: continuityOverride,
        spendingTipEvidence,
      });
      const repairResult = await llmService.callWithFallback(
        llmModels,
        (model, options) =>
          callContractRepairLLM(model, repairPrompt, options),
        12000,
        "LLM Contract Repair",
      );
      const repairPayload = await repairResult.result.json();
      const repairedText =
        repairPayload?.choices?.[0]?.message?.content?.trim() || "";
      if (repairedText) {
        cleanText = repairedText;
        contractRepairUsed = true;
      }
    } catch (error) {
      logWarn("⚠️ [STAGE:EXECUTION] Constrained repair failed:", error?.message);
    }

    if (responseContract === "affordability_decision") {
      const repaired = applyLightAffordabilityRepair(
        routingMessage || message,
        cleanText,
        packs,
        profile,
      );
      if (repaired && repaired !== cleanText) {
        cleanText = repaired;
      }
    }

    if (advisoryRuntime) {
      cleanText = enforceAdvisoryQuestionPolicy(cleanText, advisoryRuntime);
    }

    contractValidationResult = validateResponseContract({
      contract: responseContract,
      responseText: cleanText,
      message: routingMessage || message,
      packs,
      classificationResult: classification,
      continuityDirective: continuityOverride,
      spendingTipEvidence,
    });

    const spendingTipLikeContract =
      responseContract === "spending_tip_grounded" ||
      (responseContract === "repair_previous_answer" &&
        continuityOverride?.source_contract === "spending_tip_grounded");

    if (
      contractValidationResult.severity === "fail" &&
      spendingTipLikeContract &&
      spendingTipEvidence?.label
    ) {
      try {
        const guidedRepairPrompt = buildGuidedSpendingTipRepairPrompt({
          message: routingMessage || message,
          continuityDirective: continuityOverride,
          spendingTipEvidence,
        });
        const guidedRepairResult = await llmService.callWithFallback(
          llmModels,
          (model, options) =>
            callContractRepairLLM(model, guidedRepairPrompt, options),
          12000,
          "LLM Guided Spending Tip Repair",
        );
        const guidedRepairPayload = await guidedRepairResult.result.json();
        const guidedRepairedText =
          guidedRepairPayload?.choices?.[0]?.message?.content?.trim() || "";
        if (guidedRepairedText) {
          cleanText = guidedRepairedText;
          contractRepairUsed = true;
        }
      } catch (error) {
        logWarn(
          "⚠️ [STAGE:EXECUTION] Guided spending-tip repair failed:",
          error?.message,
        );
      }

      if (advisoryRuntime) {
        cleanText = enforceAdvisoryQuestionPolicy(cleanText, advisoryRuntime);
      }

      contractValidationResult = validateResponseContract({
        contract: responseContract,
        responseText: cleanText,
        message: routingMessage || message,
        packs,
        classificationResult: classification,
        continuityDirective: continuityOverride,
        spendingTipEvidence,
      });
    }

    if (contractValidationResult.severity === "fail") {
      const fallbackText = renderDeterministicFallback({
        contract: responseContract,
        continuityDirective: continuityOverride,
        spendingTipEvidence,
      });
      if (fallbackText) {
        cleanText = fallbackText;
        contractFallbackUsed = true;
        contractValidationResult = validateResponseContract({
          contract: responseContract,
          responseText: cleanText,
          message: routingMessage || message,
          packs,
          classificationResult: classification,
          continuityDirective: continuityOverride,
          spendingTipEvidence,
        });
      }
    }
  }

  logInfo("✅ [STAGE:EXECUTION] Execution stage complete", {
    model: usedModel,
    responseLength: cleanText.length,
    contractSeverity: contractValidationResult.severity,
    issues: contractValidationResult.issues.length,
    issue_codes: contractValidationResult.issues,
    repair_used: contractRepairUsed,
    fallback_used: contractFallbackUsed,
  });

  return {
    responseText: cleanText,
    usedModel,
    usage,
    finishReason,
    contractValidationResult,
    contractRepairUsed,
    contractFallbackUsed,
  };
}
