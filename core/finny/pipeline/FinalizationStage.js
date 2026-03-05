// core/finny/pipeline/FinalizationStage.js
/**
 * Finalization Stage - Stage 6 of Ask Pipeline
 * 
 * Responsibilities:
 * - Normalize response envelope
 * - Log conversation to database
 * - Persist turn metadata for continuity
 * - Record conversation turns to history
 * - Build final response object
 */

import { logDebug, logInfo, logError } from "../utils/logging.js";
import { cleanResponseFormatting, redactPII } from "../utils/formatting.js";
import { persistLastTurnMeta, buildLastTurnMeta } from "../services/ContinuityService.js";
import { appendConversationTurns } from "../../../lib/memoryUtils.js";

/**
 * Extract base packs summary for logging
 */
export function extractBasePacksSummary(packs) {
  if (!packs || typeof packs !== "object") return null;

  const base = packs.base || packs.summary_min;
  const otherPacksAvailable = Object.keys(packs).filter(
    (key) => key !== "base" && key !== "summary_min",
  );

  if (!base || typeof base !== "object") {
    return otherPacksAvailable.length > 0
      ? { base: null, otherPacksAvailable }
      : null;
  }

  const summary = {
    netWorth: base.netWorth ?? base.net_worth ?? null,
    liquidAssets: base.liquidAssets ?? base.liquid_assets ?? null,
    investmentsTotal: base.investmentsTotal ?? base.investments_total ?? null,
    totalLiabilities: base.totalLiabilities ?? base.total_liabilities ?? null,
    accountsCount: Array.isArray(base.accounts) ? base.accounts.length : 0,
    accountTypes: Array.isArray(base.accounts)
      ? [...new Set(base.accounts.map((acc) => acc?.type).filter(Boolean))]
      : [],
    recentTransactionsCount: Array.isArray(base.recentTransactions)
      ? base.recentTransactions.length
      : 0,
    spendByCategoryCount: Array.isArray(base.spendByCategory)
      ? base.spendByCategory.length
      : 0,
    spendByCategoryCurrentMonthCount: Array.isArray(
      base.spendByCategoryCurrentMonth,
    )
      ? base.spendByCategoryCurrentMonth.length
      : 0,
    spendByCategoryLastMonthCount: Array.isArray(base.spendByCategoryLastMonth)
      ? base.spendByCategoryLastMonth.length
      : 0,
    hasBudget: !!base.budget,
    otherPacksAvailable,
  };

  return summary;
}

/**
 * Normalize response envelope to standard format
 */
export function normalizeResponseEnvelope(response) {
  if (!response || typeof response !== "object") {
    return {
      message: cleanResponseFormatting(String(response || "")),
      type: "assistant",
    };
  }

  const normalized = {
    type: response.type || "assistant",
    message: response.message || response.text || "",
  };

  // Preserve optional fields
  if (response.actions) normalized.actions = response.actions;
  if (response.intent) normalized.intent = response.intent;
  if (response.hideActions !== undefined) normalized.hideActions = response.hideActions;
  if (response.hideFeedback !== undefined) normalized.hideFeedback = response.hideFeedback;
  if (response.stock_candidate) normalized.stock_candidate = response.stock_candidate;

  return normalized;
}

/**
 * Log conversation to database (async/non-blocking)
 */
export async function logConversationToDatabase(conversationData, logConversation) {
  try {
    await logConversation(conversationData);
  } catch (error) {
    logError("❌ [FINALIZATION] Conversation logging failed:", error?.message);
  }
}

/**
 * Execute Finalization Stage
 * Returns final response with all metadata
 */
export async function executeFinalizationStage(input) {
  const {
    message,
    responseText,
    classification,
    packs,
    context,
    responseContract,
    advisoryRuntime,
    usedModel,
    usage,
    timings = {},
    toolsUsed = [],
    requestId,
    startTime,
    logConversation,
  } = input;

  logInfo("📦 [STAGE:FINALIZATION] Starting finalization stage");

  const userId = context?.user_id;
  const chatId = context?.chat_id;
  const profile = context?.profile || {};

  // 1. Clean and format response text
  const cleanedText = cleanResponseFormatting(responseText);

  // 2. Build response envelope
  const response = {
    message: cleanedText,
    type: "assistant",
    intent: classification?.intent || "ask_personalized",
  };

  // 3. Persist turn metadata for continuity
  if (userId && chatId) {
    try {
      const turnMeta = buildLastTurnMeta({
        userMessage: message,
        assistantResponse: cleanedText,
        classification,
        responseContract,
        advisoryRuntime,
        packs,
      });

      await persistLastTurnMeta(userId, chatId, turnMeta);
      logDebug("✅ [FINALIZATION] Turn metadata persisted");
    } catch (error) {
      logError("⚠️ [FINALIZATION] Failed to persist turn metadata:", error?.message);
    }
  }

  // 4. Record conversation turns to history
  if (userId && chatId) {
    try {
      appendConversationTurns(userId, chatId, message, cleanedText);
      logDebug("✅ [FINALIZATION] Conversation turns recorded");
    } catch (error) {
      logDebug("⚠️ [FINALIZATION] Failed to record turns:", error?.message);
    }
  }

  // 5. Build conversation log data
  const conversationLogData = {
    user_message: redactPII(message),
    finny_response: redactPII(cleanedText),
    timestamp: new Date().toISOString(),
    user_id: userId || "unknown",
    chat_id: chatId || null,
    intent: classification?.intent || "ask_personalized",
    entities: classification?.entities || [],
    confidence: classification?.confidence || 0.0,
    response_time_ms: Date.now() - startTime,
    sources_used: toolsUsed.map((t) => t.name),
    cached: false,
    request_id: requestId,
    base_packs: extractBasePacksSummary(packs),
    classification_details: classification || null,
    metrics: {
      intent: classification?.intent || "ask_personalized",
      latency_ms: {
        total: Date.now() - startTime,
        user_data: timings.user_data_ms || 0,
        market: timings.market_ms || 0,
        web: timings.web_ms || 0,
        summary: timings.summary_ms || 0,
        llm: timings.llm_ms || 0,
      },
      tools_used: toolsUsed,
      model: usedModel,
      cache_hits: {},
      tokens: usage,
    },
    prompt_used: null, // Can be added if needed
  };

  // 6. Log conversation in background (non-blocking)
  if (logConversation) {
    setImmediate(() => {
      logConversationToDatabase(conversationLogData, logConversation).catch((err) => {
        logError("❌ [FINALIZATION] Background log failed:", err?.message);
      });
    });
  }

  logInfo("✅ [STAGE:FINALIZATION] Finalization stage complete", {
    responseLength: cleanedText.length,
    totalTime: Date.now() - startTime,
    conversationLogged: !!logConversation,
  });

  return {
    response,
    conversationLogData,
  };
}
