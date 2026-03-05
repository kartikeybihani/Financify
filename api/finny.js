// api/finny.js
import { supabase } from "../lib/api/supabase.js";
import fetch from "node-fetch";
import crypto from "crypto";
import { handleGoalConversation, handleGoalCreation } from "./goals.js";
import {
  getSessionState,
  setSessionState,
  mergeSessionState,
  getRecentConversationTurns,
  appendConversationTurns,
  invalidateProfileCache,
  loadUserMemory,
  loadUserProfile,
  storeUserMessageMemory,
  retrieveFeedbackPatterns,
  buildFeedbackContext,
  loadUserMemoryWithTimeout,
  fetchSupermemoryProfileWithTimeout,
  // saveMemoryCandidates removed - migrating to Supermemory
  // generateMemorySummary removed - migrating to Supermemory
  // validateMemoriesWithSmallModel removed - migrating to Supermemory
  // selectRelevantMemories removed - Supermemory handles relevance ranking
  // categorizeSelectedMemories removed - no longer needed with Supermemory format
} from "../lib/memoryUtils.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";
import {
  logDebug,
  logInfo,
  logWarn,
  logError,
} from "../core/finny/utils/logging.js";
import { withTimeout } from "../core/finny/utils/timeout.js";
import {
  redactPII,
  cleanResponseFormatting,
} from "../core/finny/utils/formatting.js";
import {
  STANDARD_MODEL,
  TERTIARY_MODEL,
  MEMORY_LOAD_TIMEOUT_MS,
  getOpenRouterKey,
} from "../core/finny/utils/constants/modelConfig.js";
import {
  MEMORY_CACHE_TTL,
  MEMORY_CACHE_MAX_SIZE,
} from "../core/finny/utils/constants/cacheConfig.js";
import {
  NEED_CONFIG,
  CACHE_STRATEGY,
} from "../core/finny/utils/constants/needConfig.js";
import { createContextCacheManager } from "../core/finny/cache/contextCacheManager.js";
import { ClassificationService } from "../core/finny/services/ClassificationService.js";
import { ContextPlanningService } from "../core/finny/services/ContextPlanningService.js";
import { LLMService } from "../core/finny/infrastructure/llm/LLMService.js";
import { DataFetchService } from "../core/finny/services/DataFetchService.js";
import { StockAnalysisService } from "../core/finny/services/StockAnalysisService.js";
import { WebSearchService } from "../core/finny/services/WebSearchService.js";
import {
  loadLastTurnMeta,
  persistLastTurnMeta,
  analyzeContinuityDirective,
  buildLastTurnMeta,
  buildContinuityPromptHeader,
  buildContinuityClassification,
  buildClassificationHint,
  createContinuityShadowLog,
} from "../core/finny/services/ContinuityService.js";
import { createActionRouter } from "../core/finny/router/ActionRouter.js";
import { runAskAction } from "../core/finny/handlers/AskHandler.js";
import { runClassifyAction } from "../core/finny/handlers/ClassifyHandler.js";
import { runOffTopicAction } from "../core/finny/handlers/OffTopicHandler.js";
import { runPrebuildContextAction } from "../core/finny/handlers/PrebuildContextHandler.js";
import { runStockQueryAction } from "../core/finny/handlers/StockQueryHandler.js";
import { runGoalConversationAction } from "../core/finny/handlers/GoalConversationHandler.js";
import { runStockConversationAction } from "../core/finny/handlers/StockConversationHandler.js";

// Utilities
function generateRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function responseHasVisibleContent(response) {
  if (!response || typeof response !== "object") return false;
  if (Array.isArray(response.message) && response.message.length > 0)
    return true;
  if (typeof response.message === "string" && response.message.trim())
    return true;
  if (typeof response.text === "string" && response.text.trim()) return true;
  if (Array.isArray(response.actions) && response.actions.length > 0)
    return true;
  return false;
}

function responsePreview(response) {
  if (!response || typeof response !== "object") return "";
  if (typeof response.message === "string") return response.message.slice(0, 180);
  if (typeof response.text === "string") return response.text.slice(0, 180);
  if (Array.isArray(response.message)) {
    return String(
      response.message
        .map((entry) =>
          typeof entry === "string" ? entry : (entry?.content ?? ""),
        )
        .join(" "),
    ).slice(0, 180);
  }
  return "";
}

function detectRefusalToAnswer(text) {
  if (!text || typeof text !== "string") return false;
  return /\b(just tell me|no questions|don't ask|dont ask|stop asking|whatever just answer|idk just answer)\b/i.test(
    text,
  );
}

function detectAmbiguousIntent(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();

  // A lightweight trigger for “coach should clarify goal first”.
  // Not a topic map; just catches common ambiguous decision phrasing.
  const patterns = [
    /\bshould i\b/, // "Should I buy..."
    /\bis it worth it\b/,
    /\bworth it\b/,
    /\bhelp me decide\b/,
    /\bwhat should i do\b/,
    /\bwhat do i do\b/,
    /\bdo you think i should\b/,
    /\bhow do i decide\b/,
  ];

  if (patterns.some((p) => p.test(lower))) return true;

  // Single-word “yes/no” prompts can be ambiguous in medium/high risk contexts.
  if (lower.trim() === "help") return true;

  return false;
}

function isContinuityRouterV1Enabled() {
  return (
    String(process.env.FINNY_CONTINUITY_ROUTER_V1 || "").toLowerCase() ===
    "true"
  );
}

// callWithFallback moved to service

// Classification cache - in-memory cache for classification results
const classificationCache = new Map();
const classificationService = new ClassificationService(classificationCache);
const contextPlanningService = new ContextPlanningService();
const llmService = new LLMService();
const dataFetchService = new DataFetchService();
const webSearchService = new WebSearchService();
const stockAnalysisService = new StockAnalysisService({ webSearchService });

// Memory cache - in-memory cache for memory search results (to avoid duplicate loads)
const memoryCache = new Map();

// Data cache manager consolidates in-memory + persistent cache behavior.
const contextCacheManager = createContextCacheManager({
  supabase,
  withTimeout,
  logDebug,
  logInfo,
  logWarn,
  logError,
  cacheStrategy: CACHE_STRATEGY,
});

function getCachedUserData(dataType, userId, params = {}, silent = false) {
  return contextCacheManager.getCachedUserData(dataType, userId, params, silent);
}

function setCachedUserData(dataType, userId, data, params = {}) {
  return contextCacheManager.setCachedUserData(dataType, userId, data, params);
}

function invalidateUserCache(userId, dataType = null) {
  return contextCacheManager.invalidateUserCache(userId, dataType);
}

function initializeCacheCleanup() {
  contextCacheManager.initializeLifecycle();
}

// Generate a cache key for classification
function generateClassificationCacheKey(message) {
  return classificationService.generateCacheKey(message);
}

// Clear all heuristic cache entries - check ALL possible heuristic indicators
// clearHeuristicCacheEntries moved to service

// Get cached classification result
function getCachedClassification(message) {
  return classificationService.getCached(message);
}

// Generate a cache key for memory search (user-specific)
function generateMemoryCacheKey(userId, query) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return null;
  }
  // Normalize the query for better cache hits
  const normalized = query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Normalize whitespace
    .substring(0, 200); // Limit length for cache key

  return `${userId}:${normalized}`;
}

// Get cached memory result
function getCachedMemory(userId, query) {
  const key = generateMemoryCacheKey(userId, query);
  if (!key) return null;

  const cached = memoryCache.get(key);

  if (cached && Date.now() < cached.expires_at) {
    logDebug(
      `✅ [MEMORY_CACHE] Cache HIT for user ${userId}, query: "${query.substring(
        0,
        50,
      )}..."`,
    );
    return cached.result;
  }

  if (cached) {
    logDebug(
      `⏰ [MEMORY_CACHE] Cache EXPIRED for user ${userId}, query: "${query.substring(
        0,
        50,
      )}..."`,
    );
    memoryCache.delete(key);
  }

  return null;
}

// Set cached memory result
function setCachedMemory(userId, query, result) {
  const key = generateMemoryCacheKey(userId, query);
  if (!key) return;

  // Enforce max size: remove oldest entries if at capacity
  if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE) {
    // Delete oldest entry (first in Map iteration order)
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }

  const expires_at = Date.now() + MEMORY_CACHE_TTL;
  memoryCache.set(key, { result, expires_at });
  logDebug(
    `💾 [MEMORY_CACHE] Cached memory result for user ${userId}, query: "${query.substring(
      0,
      50,
    )}..."`,
  );

  // Clean up expired entries periodically (every 100 cache writes)
  if (memoryCache.size % 100 === 0) {
    const now = Date.now();
    for (const [key, value] of memoryCache.entries()) {
      if (now >= value.expires_at) {
        memoryCache.delete(key);
      }
    }
  }
}

// Pre-populate cache for common user data
async function prePopulateUserCache(userId) {
  logDebug(`🚀 [CACHE] Pre-populating cache for user: ${userId}`);

  // Use canonical need names; cache types are derived via NEED_CONFIG
  const commonNeeds = ["summary_min", "invest_holdings", "goals_overview"];
  const results = { success: 0, failed: 0 };

  for (const need of commonNeeds) {
    try {
      // Check if already cached for this need's cache type
      const cfg = NEED_CONFIG[need];
      const cacheType = cfg?.cacheType || need;
      const cached = await getCachedUserData(cacheType, userId);
      if (cached) {
        console.log(`✅ [CACHE] ${need} already cached for user ${userId}`);
        results.success++;
        continue;
      }

      // Build context pack for this canonical need
      const contextResult = await buildContextPacks(userId, [need], {});
      if (
        contextResult &&
        contextResult.packs &&
        contextResult.packs[NEED_CONFIG[need]?.packKey || need]
      ) {
        logDebug(`✅ [CACHE] Pre-populated ${need} for user ${userId}`);
        results.success++;
      } else {
        logDebug(
          `⚠️ [CACHE] Failed to pre-populate ${need} for user ${userId}`,
        );
        results.failed++;
      }
    } catch (error) {
      logError(`❌ [CACHE] Error pre-populating ${need}:`, error);
      results.failed++;
    }
  }

  logDebug(
    `📊 [CACHE] Pre-population complete - Success: ${results.success}, Failed: ${results.failed}`,
  );
  return results;
}

// quickExtract removed - migrating to Supermemory for memory extraction

// Goal extraction function moved to goals.js
// Goal feasibility analysis function moved to goals.js
// Goal conversation handler moved to goals.js
// Goal handler functions moved to goals.js

// shouldRunMemoryExtraction removed - migrating to Supermemory for memory extraction

// Memory extraction helper functions removed - migrating to Supermemory for memory extraction
// Conversation logging functionality with retry logic
// Helper function to extract base packs summary for logging
// Handles both camelCase (processSummaryData) and snake_case (raw/cached variants)
function extractBasePacksSummary(packs) {
  if (!packs || typeof packs !== "object") return null;

  // Support both packs.base and packs.summary_min (legacy/alternate pack keys)
  const base = packs.base || packs.summary_min;
  const otherPacksAvailable = Object.keys(packs).filter(
    (key) => key !== "base" && key !== "summary_min",
  );

  // When we have packs but no base (e.g. stock-only flow), still log what we had
  if (!base || typeof base !== "object") {
    return otherPacksAvailable.length > 0
      ? { base: null, otherPacksAvailable }
      : null;
  }

  const summary = {
    // Financial summary (camelCase + snake_case fallbacks)
    netWorth: base.netWorth ?? base.net_worth ?? null,
    liquidAssets: base.liquidAssets ?? base.liquid_assets ?? null,
    investmentsTotal: base.investmentsTotal ?? base.investments_total ?? null,
    totalLiabilities: base.totalLiabilities ?? base.total_liabilities ?? null,

    // Account counts and types
    accountsCount: Array.isArray(base.accounts) ? base.accounts.length : 0,
    accountTypes: Array.isArray(base.accounts)
      ? [...new Set(base.accounts.map((acc) => acc?.type).filter(Boolean))]
      : [],

    // Transaction data
    recentTransactionsCount: Array.isArray(base.recentTransactions)
      ? base.recentTransactions.length
      : 0,

    // Spending data
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

    // Budget data
    hasBudget: !!base.budget,

    // Other packs available
    otherPacksAvailable,
  };

  return summary;
}

async function logConversation(conversationData) {
  const maxRetries = 2;
  const retryDelay = 800;
  const insertTimeoutMs = 3500;

  const truncateForStorage = (value, maxChars = 6000) => {
    const text = String(value || "");
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}… [truncated ${text.length - maxChars} chars]`;
  };

  const compactPromptForStorage = (prompt) => {
    if (!prompt) return null;
    const promptText = String(prompt);
    const maxChars = 12000;
    if (promptText.length <= maxChars) return promptText;

    const promptHash = crypto
      .createHash("sha256")
      .update(promptText)
      .digest("hex")
      .slice(0, 16);

    return JSON.stringify({
      truncated: true,
      hash: promptHash,
      original_chars: promptText.length,
      preview: promptText.slice(0, maxChars),
    });
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Insert with metrics and request_id if columns exist; fallback otherwise
      const baseRow = {
        user_id: conversationData.user_id,
        chat_id: conversationData.chat_id || null,
        user_message: truncateForStorage(conversationData.user_message, 4000),
        finny_response: truncateForStorage(conversationData.finny_response, 8000),
        timestamp: conversationData.timestamp,
        intent: conversationData.intent,
        entities: conversationData.entities,
        confidence: conversationData.confidence,
        response_time_ms: conversationData.response_time_ms,
        sources_used: conversationData.sources_used,
        cached: conversationData.cached,
        enhanced_data: conversationData.enhanced_data || false,
        market_data: conversationData.market_data || false,
        web_research: conversationData.web_research || false,
        metrics: conversationData.metrics || null,
        request_id: conversationData.request_id || null,
        base_packs: conversationData.base_packs || null,
        classification_details:
          conversationData.classification_result ||
          conversationData.classification_details ||
          null,
        prompt_used: compactPromptForStorage(conversationData.prompt_used),
      };

      const insertResult = await withTimeout(
        supabase.from("conversation_logs").insert([baseRow]),
        insertTimeoutMs,
        null,
      );

      if (!insertResult) {
        logWarn("⚠️ [CONVERSATION_LOG] Insert timed out; skipping retry to avoid duplicate writes", {
          request_id: baseRow.request_id || null,
          chat_id: baseRow.chat_id || null,
          timeout_ms: insertTimeoutMs,
        });
        return;
      }

      const { error } = insertResult;

      if (error) {
        const msg = (error?.message || "").toLowerCase();
        const missingCols =
          msg.includes("column") &&
          (msg.includes("metrics") ||
            msg.includes("request_id") ||
            msg.includes("chat_id") ||
            msg.includes("base_packs") ||
            msg.includes("classification_details") ||
            msg.includes("prompt_used"));
        if (missingCols) {
          logWarn(
            `⚠️ [CONVERSATION_LOG] Insert failed (missing columns: ${error.message}). ` +
              `Falling back to insert WITHOUT base_packs/prompt_used. ` +
              `Ensure migrations add_base_packs_to_conversation_logs.sql and 20260212190000_add_prompt_used_to_conversation_logs.sql are applied.`,
          );
          const {
            metrics,
            request_id,
            chat_id,
            base_packs,
            classification_details,
            prompt_used,
            ...fallbackRow
          } = baseRow;
          const retry = await withTimeout(
            supabase.from("conversation_logs").insert([fallbackRow]),
            insertTimeoutMs,
            null,
          );
          if (!retry) {
            logWarn("⚠️ [CONVERSATION_LOG] Fallback insert timed out; dropping log", {
              request_id: baseRow.request_id || null,
              chat_id: baseRow.chat_id || null,
              timeout_ms: insertTimeoutMs,
            });
            return;
          }
          if (retry.error) {
            throw new Error(`Fallback insert failed: ${retry.error.message}`);
          } else {
            return; // Success
          }
        } else if (
          msg.includes("timeout") ||
          msg.includes("too many requests") ||
          error.code === "ETIMEDOUT"
        ) {
          // Transient error: allow retry loop to continue
          throw new Error(error.message || "Transient insert error");
        } else {
          // Non-retryable: log and bail to avoid noisy retries
          console.error(
            "❌ [CONVERSATION_LOG] Non-retryable error:",
            error.message,
          );
          return;
        }
      } else {
        return; // Success
      }
    } catch (error) {
      const errorMessage = String(error?.message || "unknown");
      if (/timed out|timeout/i.test(errorMessage)) {
        logWarn("⚠️ [CONVERSATION_LOG] Insert timeout; dropping log entry", {
          attempt,
          max_retries: maxRetries,
          error: errorMessage,
          request_id: conversationData?.request_id || null,
          chat_id: conversationData?.chat_id || null,
        });
        return;
      }

      const logMethod = attempt === maxRetries ? logError : logWarn;
      logMethod(
        `❌ [CONVERSATION_LOG] Attempt ${attempt}/${maxRetries} failed:`,
        errorMessage,
      );

      if (attempt === maxRetries) {
        logError("❌ [CONVERSATION_LOG] All retry attempts failed, giving up");
        return; // Don't throw error - logging failure shouldn't break the API
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }
}

async function ensureChatSessionRecord(userId, chatId, firstMessage) {
  if (!userId || !chatId || !firstMessage) {
    return;
  }

  try {
    const insertResult = await withTimeout(
      supabase.from("chat_sessions").upsert(
        {
          id: chatId,
          user_id: userId,
          session_title: String(firstMessage).trim().slice(0, 60) || "Chat",
          first_message: String(firstMessage),
          messages: [
            {
              id: `user-${Date.now()}`,
              sender: "user",
              text: String(firstMessage),
              timestamp: Date.now(),
            },
          ],
        },
        {
          onConflict: "id",
          ignoreDuplicates: true,
        },
      ),
      5000,
      null,
    );

    if (!insertResult?.error) {
      return;
    }

    logWarn("⚠️ [CHAT_SESSION] Placeholder upsert failed:", insertResult.error);
  } catch (error) {
    logWarn("⚠️ [CHAT_SESSION] Could not ensure placeholder chat session:", error);
  }
}

// Initialize cache cleanup on server start
initializeCacheCleanup();

export default async function handler(req, res) {
  // Initialize timing tracker for entire request
  const requestStartTime = Date.now();
  const timings = {
    auth_ms: 0,
    context_loading_ms: 0,
    memory_loading_ms: 0,
    profile_loading_ms: 0,
    classification_ms: 0,
    web_search_ms: 0,
    context_packs_ms: 0,
    handler_ms: 0,
    llm_ms: 0,
    total_ms: 0,
  };
  const requestId = generateRequestId();

  // Parse body if raw (some platforms pass string/buffer)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      logError("❌ [FINNY] Failed to parse body:", e?.message);
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Missing or invalid request body" });
  }

  const {
    action,
    message,
    context,
    classification: bodyClassification,
    chat_id: bodyChatId,
    ...otherParams
  } = body;

  // For prebuild_context, we'll check if all contexts are cached after we have userId
  // and suppress logs if they are. For now, we'll log normally and check later.
  let shouldSuppressLogs = false;

  // Try to check early if we have userId in context (for prebuild_context silent mode)
  if (action === "prebuild_context" && context?.user_id) {
    try {
      shouldSuppressLogs = await areAllContextsCached(context.user_id);
    } catch (error) {
      // If check fails, continue with normal logging
    }
  }

  if (!shouldSuppressLogs) {
    logInfo("🤖 [FINNY] Request received:", req.method);
    logInfo("🆔 [FINNY] Request ID:", requestId);
  }

  if (req.method !== "POST") {
    logWarn("❌ [FINNY] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if client wants streaming response
  const wantsStreaming = body.stream === true;

  if (!shouldSuppressLogs) {
    logInfo("📝 [FINNY] Action:", action);
    // Avoid logging full message/context to reduce PII exposure
    logInfo("📊 [FINNY] Context provided:", context ? "Yes" : "No");
  }

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  // Derive user from Supabase JWT instead of trusting client context
  let serverUserId = null;
  let userProfile = { name: null, age: null, monthly_income: null };
  const authStartTime = Date.now();
  let hadAuthHeader = false;
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];
    hadAuthHeader =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ");
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;
    if (token) {
      const { data: authData, error: authError } =
        await supabase.auth.getUser(token);
      if (!authError && authData?.user?.id) {
        serverUserId = authData.user.id;
        // Try to enrich profile from auth metadata
        try {
          const admin = supabase.auth.admin;
          if (admin && serverUserId) {
            const { data: adminUser, error: adminErr } =
              await admin.getUserById(serverUserId);
            if (!adminErr && adminUser?.user) {
              const meta = adminUser.user.user_metadata || {};
              userProfile.name = meta.name || meta.full_name || null;
              userProfile.age = meta.age || null;
              const metaMonthlyIncome = Number(meta.monthly_income);
              userProfile.monthly_income = Number.isFinite(metaMonthlyIncome)
                ? metaMonthlyIncome
                : null;
            }
          }
        } catch (e) {
          console.log("ℹ️ [FINNY] Could not fetch user profile:", e?.message);
        }
      }
    }
  } catch (e) {
    console.error("⚠️ [FINNY] Auth verification failed:", e?.message);
  }
  timings.auth_ms = Date.now() - authStartTime;

  // Build safe context that overrides any client-provided user_id
  // But fall back to client-provided user_id if no JWT token is present (for testing)
  const finalUserId = serverUserId || context?.user_id;
  const chatIdRaw = bodyChatId ?? body.chat_id ?? context?.chat_id ?? null;
  const chatId = chatIdRaw || null;
  if (
    !chatIdRaw &&
    action !== "prebuild_context" &&
    !shouldSuppressLogs
  ) {
    logWarn(`⚠️ [FINNY] chat_id missing for action=${action}`);
  }

  // Re-check with finalUserId (more secure) - always use server-verified userId when available
  if (action === "prebuild_context" && finalUserId) {
    try {
      shouldSuppressLogs = await areAllContextsCached(finalUserId);
    } catch (error) {
      // If check fails, continue with normal logging
    }
  }

  if (
    (hadAuthHeader && !serverUserId) ||
    (!hadAuthHeader && !finalUserId && action !== "classify")
  ) {
    const authMessage = "Please log in to continue.";
    if (wantsStreaming) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      });
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }
      sendStreamEvent(
        res,
        "complete",
        buildStreamFallbackResponse(authMessage),
      );
      res.end();
      return;
    }

    res.status(401).json({ message: authMessage });
    return;
  }

  const finnyRateConfig =
    action === "classify"
      ? { limit: 90, windowMs: 60 * 1000 }
      : action === "goal_conversation"
        ? { limit: 30, windowMs: 60 * 1000 }
        : { limit: 20, windowMs: 60 * 1000 };

  const finnyRateLimit = await checkRateLimit(req, {
    scope: `finny:${action}`,
    userId: finalUserId,
    ...finnyRateConfig,
  });

  if (!finnyRateLimit.allowed) {
    const retryAfter = formatRetryAfterSeconds(finnyRateLimit.retryAfterMs);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", retryAfter);
    }
    return res.status(429).json({
      error: "Too many assistant requests. Please wait before retrying.",
      retry_after: retryAfter,
    });
  }

  if (wantsStreaming) {
    // Set SSE headers for streaming after confirming rate limit allowance
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }
  }

  // Conversation context removed.
  timings.context_loading_ms = 0;

  let sessionState = getSessionState(finalUserId);
  let effectiveClassification = bodyClassification;
  let finalAction = action;
  let continuityOverride = null;
  let safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    chat_id: chatId,
    request_id: requestId,
    profile: {
      name: userProfile.name,
      age: userProfile.age,
      occupation: null,
      monthly_income: userProfile.monthly_income,
      finny_style: "conversational",
      intent_context: "",
    },
    session: sessionState,
    memory: { memories: [], totalCount: 0 },
    feedbackPatterns: {
      preferences: [],
      patterns: {},
      deepInsights: [],
    },
  };

  // === FLOW STATE CHECK: Bypass classification for active goal flows ===
  const activeGoalFlow = sessionState?.goal_flow || context?.goal_flow || null;
  if (
    (action === "classify" || action === "message") &&
    activeGoalFlow &&
    activeGoalFlow.active
  ) {
    console.log(
      `🎯 [FLOW] Active goal flow detected - bypassing classification`,
    );
    finalAction = "goal_conversation";
  } else if (action === "message") {
    try {
      const lastTurnMeta = await loadLastTurnMeta({
        userId: finalUserId,
        chatId,
        sessionState,
      });
      const continuityAnalysis = analyzeContinuityDirective({
        message,
        lastTurnMeta,
        activeGoalFlow,
        currentAction: action,
      });
      const shadowDirective = continuityAnalysis.directive;

      if (isContinuityRouterV1Enabled()) {
        logInfo("🧭 [CONTINUITY] Evaluation:", {
          ...createContinuityShadowLog(message, lastTurnMeta),
          reason: continuityAnalysis.reason,
          applied: !!shadowDirective,
        });
      }

      if (shadowDirective && !isContinuityRouterV1Enabled()) {
        logInfo("🧭 [CONTINUITY_SHADOW] Override available but disabled:", {
          ...createContinuityShadowLog(message, lastTurnMeta),
          mode: shadowDirective.mode,
          reason: continuityAnalysis.reason,
        });
      }

      if (shadowDirective && isContinuityRouterV1Enabled()) {
        continuityOverride = shadowDirective;
        effectiveClassification = buildContinuityClassification(
          continuityOverride,
        );
        finalAction = "ask";
        logInfo("🧭 [CONTINUITY] Applied pre-classification override:", {
          mode: continuityOverride.mode,
          source_contract: continuityOverride.source_contract,
          source_subject: continuityOverride.source_subject,
        });
      } else {
        const classifyStartTime = Date.now();
        const classificationContext = {
          ...safeContext,
          classification_hint: buildClassificationHint(lastTurnMeta),
        };
        effectiveClassification = await handleClassify(
          message,
          classificationContext,
        );
        timings.classification_ms = Date.now() - classifyStartTime;

        if (
          effectiveClassification &&
          effectiveClassification.hasOwnProperty("heuristic") &&
          (effectiveClassification.heuristic === true ||
            effectiveClassification.heuristic === "true" ||
            effectiveClassification.heuristic === 1)
        ) {
          const key = generateClassificationCacheKey(message);
          classificationCache.delete(key);
          effectiveClassification = await handleClassify(
            message,
            classificationContext,
          );
        }

        const classifiedIntent = effectiveClassification?.intent;
        if (classifiedIntent === "stock_query") {
          finalAction = "stock_query";
        } else if (classifiedIntent === "off_topic") {
          finalAction = "off_topic";
        } else if (
          classifiedIntent === "goal_conversation" ||
          classifiedIntent === "goal"
        ) {
          finalAction = "goal_conversation";
        } else {
          finalAction = "ask";
        }
      }
    } catch (error) {
      logError("❌ [FINNY] Message classification failed, defaulting to ask:", error);
      finalAction = "ask";
    }
  }

  // Load user profile, memory, and feedback patterns only when needed
  // OPTIMIZED: Only load for "ask" action (not needed for classify or prebuild_context)
  let userMemory = { memories: [], totalCount: 0 };
  let userProfileData = {
    name: null,
    age: null,
    occupation: null,
    monthly_income: null,
    finny_style: "conversational",
    intent_context: "",
  };
  let feedbackPatterns = {
    preferences: [],
    patterns: {},
    deepInsights: [],
  };

  // Only load memory and profile data for ask-like actions
  if (finalAction === "ask" || finalAction === "stock_query") {
    // OPTIMIZED: Load memory, profile, and feedback patterns in parallel for better performance
    const prepStartTime = Date.now();

    // Prepare memory loading promise (with cache check)
    const memoryPromise = (async () => {
      if (message) {
        // Check cache first
        const cachedMemory = getCachedMemory(finalUserId, message);
        if (cachedMemory) {
          logInfo(
            `⚡ [MEMORY_CACHE] Using cached memories for message: "${message.substring(
              0,
              50,
            )}..."`,
          );
          return cachedMemory;
        } else {
          // Load from Supermemory with 5s timeout (non-blocking) and cache the result
          const loadedMemory = await loadUserMemoryWithTimeout(
            finalUserId,
            message,
            MEMORY_LOAD_TIMEOUT_MS,
          );
          // Always cache the result (even if empty) to avoid repeated API calls for same query
          // loadUserMemoryWithTimeout always returns { memories: [], totalCount: 0 } on error/timeout, so it's safe
          if (loadedMemory && typeof loadedMemory === "object") {
            setCachedMemory(finalUserId, message, loadedMemory);
          }
          return loadedMemory;
        }
      } else {
        // No message provided, load empty memories (no Supermemory call needed)
        return { memories: [], totalCount: 0 };
      }
    })().catch((error) => {
      logError("❌ [MEMORY] Error loading memory:", error);
      return { memories: [], totalCount: 0 };
    });

    // Prepare profile and feedback loading promises
    const profilePromise = loadUserProfile(finalUserId).catch((error) => {
      logError("❌ [PROFILE] Error loading profile:", error);
      return {
        name: null,
        age: null,
        occupation: null,
        monthly_income: null,
        finny_style: "conversational",
        intent_context: "",
      };
    });

    const feedbackPromise = retrieveFeedbackPatterns(finalUserId, null).catch(
      (error) => {
        logError("❌ [FEEDBACK] Error loading feedback patterns:", error);
        return {
          preferences: [],
          patterns: {},
          deepInsights: [],
        };
      },
    );

    // Execute all three in parallel
    const [loadedMemory, profileData, feedback] = await Promise.all([
      memoryPromise,
      profilePromise,
      feedbackPromise,
    ]);

    userMemory = loadedMemory;
    userProfileData = profileData;
    feedbackPatterns = feedback;

    const prepTime = Date.now() - prepStartTime;
    timings.memory_loading_ms = prepTime; // Combined time for parallel operations
    timings.profile_loading_ms = prepTime; // Combined time for parallel operations
    logInfo(
      `⚡ [PARALLEL_PREP] Loaded memory, profile, and feedback in ${prepTime}ms (parallel)`,
    );
  } else {
    // For classify and prebuild_context: Skip memory and feedback patterns
    // Only load minimal profile if needed (but classification doesn't need user data)
    if (action === "classify") {
      // Classification doesn't need user data - skip profile loading
      timings.memory_loading_ms = 0;
      timings.profile_loading_ms = 0;
    } else {
      // prebuild_context: Skip everything
      timings.memory_loading_ms = 0;
      timings.profile_loading_ms = 0;
    }
  }

  // Merge profile data with existing userProfile (from auth metadata)
  // IMPORTANT: Profiles table is source of truth for age (user_metadata.age may be outdated)
  const enrichedProfile = {
    name: userProfile.name || userProfileData.name,
    age: userProfileData.age || userProfile.age, // Prioritize profiles table over user_metadata
    occupation: userProfileData.occupation,
    monthly_income:
      userProfileData.monthly_income ?? userProfile.monthly_income ?? null,
    finny_style: userProfileData.finny_style,
    intent_context: userProfileData.intent_context,
  };

  // === PROFILE CACHE INVALIDATION ===
  if (action === "invalidate_profile_cache") {
    // Invalidate profile cache for the authenticated user
    invalidateProfileCache(finalUserId);
    console.log(
      `✅ [CACHE] Profile cache invalidated for user: ${finalUserId}`,
    );
    return res.status(200).json({ success: true });
  }

  // === CHAT SESSION CHECK: Clear session state if new chat session ===
  const lastChatId = sessionState?.last_chat_id;
  const shouldPrePopulateCache =
    !!chatId &&
    (!lastChatId || (typeof lastChatId === "string" && lastChatId !== chatId));
  if (lastChatId && chatId && lastChatId !== chatId) {
    console.log(
      `🆕 [SESSION] New chat detected (old: ${lastChatId}, new: ${chatId}) - clearing session state`,
    );
    // Clear session state for fresh conversation
    setSessionState(finalUserId, { last_chat_id: chatId });
    // Reload clean session state
    sessionState = getSessionState(finalUserId);
    console.log("✅ [SESSION] Session state cleared for new chat");
  } else if (chatId && !lastChatId) {
    // First message in this session - store chat_id
    console.log(`📝 [SESSION] Storing chat_id for session: ${chatId}`);
    mergeSessionState(finalUserId, { last_chat_id: chatId });
  }

  // Keep chat start-up optimization by pre-populating the cache ONCE per chat.
  if (shouldPrePopulateCache) {
    logDebug(
      "🚀 [CACHE] Pre-populating cache for new chat session (conversation context disabled)",
    );
    setImmediate(() => {
      prePopulateUserCache(finalUserId).catch((error) => {
        logError("❌ [CACHE] Pre-population failed:", error);
      });
    });
  }

  // Log age source for debugging
  if (
    userProfile.age &&
    userProfileData.age &&
    userProfile.age !== userProfileData.age
  ) {
    logWarn(
      `⚠️ [PROFILE] Age mismatch: user_metadata.age=${userProfile.age}, profiles.age=${userProfileData.age} (using profiles.age)`,
    );
  }

  safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    chat_id: chatId,
    request_id: requestId,
    profile: enrichedProfile,
    session: sessionState,
    memory: userMemory,
    feedbackPatterns: feedbackPatterns,
    continuity_override: continuityOverride,
  };

  if (action === "message" && finalUserId && chatId && message) {
    setImmediate(() => {
      ensureChatSessionRecord(finalUserId, chatId, message);
    });
  }

  const shouldStoreUserMessageInSupermemory =
    action === "message" &&
    finalUserId &&
    message &&
    finalAction !== "stock_query" &&
    finalAction !== "stock_conversation" &&
    finalAction !== "goal_conversation";

  const storeUserMessageAfterResponse =
    shouldStoreUserMessageInSupermemory
      ? () => {
          const messageMemoryMetadata = {
            chat_id: chatId || null,
            request_action: action,
            final_action: finalAction,
            classified_intent: effectiveClassification?.intent || null,
            intent_type: effectiveClassification?.intent_type || null,
            decision_risk: effectiveClassification?.decision_risk || null,
          };

          storeUserMessageMemory(
            finalUserId,
            message,
            messageMemoryMetadata,
          ).catch((error) => {
            console.error(
              "❌ [FINNY] Failed to store user message memory:",
              error?.message || error,
            );
          });
        }
      : null;
  let userMessageStorageScheduled = false;
  const scheduleUserMessageStorageOnFinish = () => {
    if (!storeUserMessageAfterResponse || !res || userMessageStorageScheduled) {
      return;
    }
    userMessageStorageScheduled = true;
    res.once("finish", storeUserMessageAfterResponse);
  };
  const scheduleUserMessageStorageAsync = () => {
    if (!storeUserMessageAfterResponse || userMessageStorageScheduled) {
      return;
    }
    userMessageStorageScheduled = true;
    setImmediate(storeUserMessageAfterResponse);
  };

  // Initialize action router with handlers
  const actionRouter = createActionRouter({
    classify: async (payload) =>
      runClassifyAction({
        message: payload.message,
        safeContext: payload.safeContext,
        handleClassify,
        timings: payload.timings,
        classificationCache,
        generateClassificationCacheKey,
      }),
    ask: async (payload) =>
      runAskAction({
        message: payload.message,
        safeContext: payload.safeContext,
        effectiveClassification: payload.effectiveClassification,
        timings: payload.timings,
        wantsStreaming: payload.wantsStreaming,
        res: payload.res,
        handleAsk,
      }),
    stock_query: async (payload) =>
      runStockQueryAction({
        message: payload.message,
        safeContext: payload.safeContext,
        effectiveClassification: payload.effectiveClassification,
        timings: payload.timings,
        wantsStreaming: payload.wantsStreaming,
        res: payload.res,
        handleAsk,
      }),
    off_topic: async (payload) =>
      runOffTopicAction({
        message: payload.message,
        safeContext: payload.safeContext,
        effectiveClassification: payload.effectiveClassification,
        wantsStreaming: payload.wantsStreaming,
        res: payload.res,
        handleOffTopic,
      }),
    prebuild_context: async (payload) =>
      runPrebuildContextAction({
        finalUserId: payload.finalUserId,
        shouldSuppressLogs: payload.shouldSuppressLogs,
        handlePrebuildContext,
      }),
    goal_conversation: async (payload) =>
      runGoalConversationAction({
        message: payload.message,
        safeContext: payload.safeContext,
        finalUserId: payload.finalUserId,
        handleGoalConversation,
        handleGoalCreation,
        mergeSessionState,
        logError,
        responseHasVisibleContent,
      }),
    stock_conversation: async (payload) =>
      runStockConversationAction({
        message: payload.message,
        safeContext: payload.safeContext,
        sessionState: payload.sessionState,
        finalUserId: payload.finalUserId,
        otherParams: payload.otherParams,
        timings: payload.timings,
        wantsStreaming: payload.wantsStreaming,
        res: payload.res,
        handleAsk,
        mergeSessionState,
        logError,
      }),
  });

  try {
    let response;
    const handlerStartTime = Date.now();

    // Route all supported actions through extracted handlers
    if (
      finalAction === "classify" ||
      finalAction === "ask" ||
      finalAction === "stock_query" ||
      finalAction === "off_topic" ||
      finalAction === "prebuild_context" ||
      finalAction === "goal_conversation" ||
      finalAction === "stock_conversation"
    ) {
      response = await actionRouter(finalAction, {
        message,
        safeContext,
        effectiveClassification,
        timings,
        wantsStreaming,
        res,
        finalUserId,
        shouldSuppressLogs,
        sessionState,
        otherParams,
      });
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    timings.handler_ms = Date.now() - handlerStartTime;

    // Calculate total time until streaming starts
    timings.total_ms = Date.now() - requestStartTime;

    // Log all timings in seconds
    const formatTime = (ms) => (ms / 1000).toFixed(3);

    // Consolidated timing log (suppress if all contexts cached for prebuild_context)
    if (!shouldSuppressLogs) {
      console.log(`\n⏱️  [TIMING] Total: ${formatTime(timings.total_ms)}s`);
      console.log(
        `   └─ Handler: ${formatTime(timings.handler_ms)}s | LLM: ${formatTime(
          timings.llm_ms || 0,
        )}s | Memory: ${formatTime(
          timings.memory_loading_ms,
        )}s | Profile: ${formatTime(timings.profile_loading_ms)}s`,
      );
    }

    // Detailed breakdown only in debug mode
    logDebug("⏱️  [TIMING] Detailed breakdown:");
    logDebug(
      `   Auth: ${formatTime(timings.auth_ms)}s | Context: ${formatTime(
        timings.context_loading_ms,
      )}s`,
    );
    if (timings.classification_ms > 0) {
      logDebug(`   Classification: ${formatTime(timings.classification_ms)}s`);
    }
    if (timings.web_search_ms > 0) {
      logDebug(`   Web Search: ${formatTime(timings.web_search_ms)}s`);
    }
    if (timings.context_packs_ms > 0) {
      logDebug(`   Context Packs: ${formatTime(timings.context_packs_ms)}s`);
    }

    response = normalizeResponseEnvelope(response);

    // Handle streaming vs regular response
    if (wantsStreaming) {
      console.log("🔄 [STREAMING] Starting streaming response");

      scheduleUserMessageStorageOnFinish();

      const streamWatchdog = startStreamWatchdog(res, {
        timeoutMs: 30000,
        pingMs: 8000,
      });
      let streamCompleted = false;

      try {
        // Send progress events first
        sendStreamEvent(res, "progress", {
          status: "Processing your request...",
        });

        // Extract the text to stream from the response
        // For streaming, response.message is always a string (no backend splitting)
        let textToStream = null;
        if (typeof response.message === "string") {
          textToStream = response.message;
        } else if (typeof response.text === "string") {
          textToStream = response.text;
        } else {
          // Fallback: handle array (shouldn't happen for streaming, but just in case)
          textToStream = Array.isArray(response.message)
            ? response.message.map((m) => m.content || m).join("\n\n")
            : String(response.message || "");
        }

        if (textToStream) {
          const streamingStartTime = Date.now();
          const timeToFirstChunk = streamingStartTime - requestStartTime;
          console.log(
            `🔄 [STREAMING] Starting stream (${(
              timeToFirstChunk / 1000
            ).toFixed(3)}s to first chunk)`,
          );
          console.log(
            "🔄 [STREAMING] Streaming text:",
            textToStream.substring(0, 100) + "...",
          );
          sendStreamEvent(res, "progress", {
            status: "Generating response...",
          });
          await streamTextChunks(res, textToStream);
        } else {
          console.log(
            "⚠️ [STREAMING] No text to stream in response:",
            Object.keys(response),
          );
        }

        // Send final complete response
        sendStreamEvent(res, "complete", response);
        streamCompleted = true;
        res.end();
        console.log("✅ [STREAMING] Streaming completed");

        // Memory storage will be triggered by res.once('finish') handler set earlier
      } catch (streamError) {
        logError("❌ [STREAMING] Stream error:", streamError);
        if (!res.writableEnded) {
          sendStreamEvent(
            res,
            "complete",
            buildStreamFallbackResponse(
              "Sorry — something went wrong while streaming. Please try again.",
            ),
          );
          res.end();
        }
      } finally {
        if (streamWatchdog) clearInterval(streamWatchdog);
        if (!streamCompleted && !res.writableEnded) {
          sendStreamEvent(res, "complete", buildStreamFallbackResponse());
          res.end();
        }
      }
    } else {
      res.status(200).json(response);
      scheduleUserMessageStorageAsync();
    }
    if (!shouldSuppressLogs) {
      console.log("🔍 [FINNY] Response:", {
        request_id: requestId,
        action: finalAction,
        has_visible_content: responseHasVisibleContent(response),
        response_preview: responsePreview(response),
        response,
      });
    }
  } catch (error) {
    console.error("❌ [FINNY] Error:", error);
    if (wantsStreaming && res && !res.writableEnded) {
      scheduleUserMessageStorageOnFinish();
      sendStreamEvent(
        res,
        "complete",
        buildStreamFallbackResponse(
          "Sorry — something went wrong. Please try again.",
        ),
      );
      res.end();
      return;
    }
    res.status(500).json({ error: error.message });
    scheduleUserMessageStorageAsync();
  }
}

// Enhanced search query function to include user-specific data when relevant
async function enhanceSearchQuery(message, context) {
  try {
    const lowerMessage = message.toLowerCase();

    // Check if this is a query about user's personal investments/holdings
    const isPersonalInvestmentQuery =
      lowerMessage.includes("my holdings") ||
      lowerMessage.includes("my investments") ||
      lowerMessage.includes("my portfolio") ||
      lowerMessage.includes("my stocks") ||
      lowerMessage.includes("my positions") ||
      (lowerMessage.includes("holdings") &&
        (lowerMessage.includes("my") || lowerMessage.includes("investment"))) ||
      (lowerMessage.includes("news") &&
        lowerMessage.includes("investment") &&
        lowerMessage.includes("my"));

    if (!isPersonalInvestmentQuery || !context?.user_id) {
      console.log("🔍 [ENHANCE] No enhancement needed for query:", message);
      return message;
    }

    console.log(
      "🔍 [ENHANCE] Detected personal investment query, fetching user holdings...",
    );

    // Fetch user's investment holdings
    const { data: holdings, error } =
      await dataFetchService.getInvestmentHoldingsDetailed(
        context.user_id,
        3000,
      );

    if (error || !holdings || holdings.length === 0) {
      console.log("⚠️ [ENHANCE] No holdings found or error:", error?.message);
      return message;
    }

    // Sort holdings by market value (largest first) and get top 1 to avoid rate limiting
    const topHoldings = holdings
      .filter((holding) => holding.symbol && holding.symbol.length <= 5)
      .sort((a, b) => (b.market_value || 0) - (a.market_value || 0))
      .slice(0, 1); // Reduced to just 1 to completely avoid rate limiting

    if (topHoldings.length === 0) {
      console.log("⚠️ [ENHANCE] No valid holdings found");
      return message;
    }

    console.log(
      `✅ [ENHANCE] Selected top ${topHoldings.length} holdings by value:`,
      topHoldings.map(
        (h) => `${h.symbol} ($${h.market_value?.toFixed(2) || "0"})`,
      ),
    );

    // Create multiple targeted search queries
    const searchQueries = topHoldings.map(
      (holding) => `${holding.symbol} latest news`,
    );

    console.log(
      `🔍 [ENHANCE] Generated ${searchQueries.length} targeted queries:`,
      searchQueries,
    );

    // Get all available holdings for user prompt
    const allHoldings = holdings
      .filter((holding) => holding.symbol && holding.symbol.length <= 5)
      .sort((a, b) => (b.market_value || 0) - (a.market_value || 0));

    // Return multiple queries for parallel processing with additional context
    return {
      queries: searchQueries,
      holdings: topHoldings,
      allHoldings: allHoldings, // For user prompting
      userPrompt: `I'm showing news for your top holding (${topHoldings[0].symbol}). You have ${allHoldings.length} total holdings. If you'd like news about any other specific stock, just ask! For example: "What's the latest news on AMD?" or "Tell me about PLTR news."`,
    };
  } catch (error) {
    console.error("❌ [ENHANCE] Error enhancing search query:", error);
    return message; // Fallback to original message
  }
}

async function handleAsk(
  message,
  context,
  intent = "ask_personalized",
  classificationResult = null,
  requestTimings = null, // Optional: parent request timings object
  wantsStreaming = false, // Whether client wants streaming response
  res = null, // Response object for sending progress updates (optional)
) {
  logInfo("🔍 [FINNY] Starting ask handler for message:", message);
  const startTime = Date.now();
  const requestId = context?.request_id || generateRequestId();
  
  try {
    // 1. Validate user_id
    const userId = context?.user_id;
    if (!userId) {
      logWarn("❌ [FINNY] No user_id provided in context");
      return {
        message: cleanResponseFormatting(
          "I need to know who you are to provide personalized advice. Please try again.",
        ),
        type: "assistant",
      };
    }

    // 2. Get classification if not provided
    if (!classificationResult) {
      const cachedClassification = getCachedClassification(message);
      if (cachedClassification) {
        logInfo("✅ [FINNY] Retrieved classification from cache");
        classificationResult = cachedClassification;
      }
    }

    // 3. Execute the Ask Pipeline (Phase 4 refactor)
    const { executeAskPipeline } = await import("../core/finny/pipeline/index.js");

    const pipelineResult = await executeAskPipeline({
      message,
      context,
      classificationResult,
      services: {
        contextPlanningService,
        llmService,
        webSearchService,
        stockAnalysisService,
      },
      helpers: {
        buildContextPacks,
        logConversation,
        detectRefusalToAnswer,
        detectAmbiguousIntent,
      },
      requestMetadata: {
        requestId,
        startTime,
      },
    });

    // 4. Return the pipeline result
    return pipelineResult;

  } catch (error) {
    logError("❌ [FINNY] Ask handler failed:", error?.message);
    
    // Fallback error response
    return {
      message: cleanResponseFormatting(
        "Sorry — I'm having trouble processing your request right now. Please try again.",
      ),
      type: "assistant",
      hideActions: true,
    };
  }
}

// Normalize response envelopes that wrap the actual message under `answer`
function normalizeResponseEnvelope(response) {
  if (!response || typeof response !== "object") return response;
  const answer = response.answer;
  if (!answer || typeof answer !== "object") return response;

  const normalized = { ...response };

  if (normalized.message == null && answer.message != null) {
    normalized.message = answer.message;
  }
  if (normalized.text == null && answer.text != null) {
    normalized.text = answer.text;
  }
  if (normalized.type == null && answer.type != null) {
    normalized.type = answer.type;
  }
  // isSplit flag removed - frontend handles all splitting
  if (normalized.actions == null && answer.actions != null) {
    normalized.actions = answer.actions;
  }
  if (
    normalized.hideFeedback === undefined &&
    answer.hideFeedback !== undefined
  ) {
    normalized.hideFeedback = answer.hideFeedback;
  }
  if (
    normalized.hideActions === undefined &&
    answer.hideActions !== undefined
  ) {
    normalized.hideActions = answer.hideActions;
  }
  if (normalized.stock_candidate == null && answer.stock_candidate != null) {
    normalized.stock_candidate = answer.stock_candidate;
  }
  if (normalized.stockCandidate == null && answer.stockCandidate != null) {
    normalized.stockCandidate = answer.stockCandidate;
  }

  return normalized;
}

// === RESPONSE FORMATTING ===
// cleanResponseFormatting now imported from utils/formatting.js

// === MESSAGE SPLITTING ===
// Message splitting is now handled entirely on the frontend using a sophisticated
// algorithm that respects code blocks, list contexts, and sentence boundaries.
// Backend always sends full message strings - frontend splits intelligently.

// === ENHANCED WEB SEARCH DETECTION ===
// Enhanced web search detection patterns
function detectWebSearchNeeded(message) {
  const lowerMessage = message.toLowerCase();
  // Off-topic detection removed - let classification layer handle it

  // Production-optimized web search keywords
  const webKeywords = [
    // Year indicators
    "2025",
    "2024",
    "latest",
    "updated",
    "today",

    // Financial limits & rates
    "roth ira",
    "ira limit",
    "contribution limit",
    "401k limit",
    "hsa limit",
    "tax bracket",
    "interest rate",
    "mortgage rate",
    "fed rate",
    "inflation rate",
    "cd rate",
    "savings rate",
    "credit card rate",
    "credit card",
    "which credit card",
    "best credit card",
    "credit card should",
    "card should i",
    "standard deduction",

    // Market & economic data
    "stock market",
    "housing market",
    "market trend",
    "economic",
    "crypto",
    "bitcoin",
    "ethereum",
    "regulation",
    "policy",

    // Government & institutions
    "federal",
    "state",
    "irs",
    "treasury",
    "fed",
    "social security",
    "medicare",

    "current rates",
    "latest news",
  ];

  return webKeywords.some((keyword) => lowerMessage.includes(keyword));
}

// Enhanced off-topic detection with confidence scoring

// === CONTEXT PLANNER ===
// Deterministic context planning to fix "sometimes it works" issue

/**
 * Selects data packs from classification result (Phase 2)
 * Maps classification data_requirements to internal needs and filters
 * Returns: { needs: string[], filters: object, useMerchantRPC: boolean }
 */
// selectDataPacksFromClassification moved to service

// planNeeds moved to service

// extractSlots moved to service

async function buildContextPacks(userId, needs, slots) {
  const packs = {};
  const gaps = [];
  const startTime = Date.now();

  try {
    // OPTIMIZED: Pre-validate needs and slots to avoid unnecessary work
    if (!userId || !needs || needs.length === 0) {
      logWarn("⚠️ [FINNY] No valid needs provided, returning empty packs");
      return {
        packs,
        gaps,
        contextHeader: "CONTEXT_PACKS_INCLUDED: []\nDATA_GAPS: []",
      };
    }

    // OPTIMIZATION: Check for pre-built context first
    logDebug("🔍 [FINNY] Checking for pre-built context...");
    const remainingNeeds = [];

    for (const need of needs) {
      const cacheType = NEED_CONFIG[need]?.cacheType || need;

      // Build cache params based on need type and slots
      let cacheParams = {};
      if (need === "txns_by_category" || need === "category_details") {
        // For category/merchant transactions, include category/merchant and period in cache key
        if (slots?.merchant && slots?.period && slots?.useMerchantRPC) {
          // Merchant query
          cacheParams = {
            merchant: slots.merchant,
            period: slots.period,
          };
        } else if (slots?.category && slots?.period) {
          // Category query
          cacheParams = {
            category: slots.category,
            period: slots.period,
          };
        }
      } else if (need === "spend_total" && slots?.period) {
        // For spend_total, include period in cache key
        cacheParams = { period: slots.period };
      } else if (need === "goals_overview") {
        cacheParams = { limit: 10 };
      } else if (need === "cashflow_monthly") {
        cacheParams = { months: 3 };
      }

      const cachedData = await getCachedUserData(
        cacheType,
        userId,
        cacheParams,
      );
      if (cachedData) {
        logInfo(`✅ [FINNY] Using pre-built context for: ${need}`);
        logDebug(`🔍 [FINNY] Pre-built data for ${need}:`, {
          hasData: !!cachedData,
          dataKeys: Object.keys(cachedData || {}),
          isCached: true,
          cacheParams,
        });
        // Store data in the correct pack structure for context building
        const packKey = NEED_CONFIG[need]?.packKey || need;
        packs[packKey] = cachedData;
      } else {
        logDebug(`⚠️ [FINNY] No pre-built context for: ${need}, will fetch`);
        remainingNeeds.push(need);
      }
    }

    // If all contexts are pre-built, return early
    if (remainingNeeds.length === 0) {
      logInfo("🎯 [FINNY] All contexts pre-built, returning cached data");
      return {
        packs,
        gaps,
        contextHeader: `CONTEXT_PACKS_INCLUDED: [${needs.join(
          ", ",
        )}]\nDATA_GAPS: []`,
      };
    }

    logInfo(
      `🚀 [FINNY] Building context packs for remaining needs: [${remainingNeeds.join(
        ", ",
      )}]`,
    );

    // OPTIMIZED: Create optimized fetch operations with better batching
    const fetchOperations = await createOptimizedFetchOperations(
      userId,
      remainingNeeds,
      slots,
    );

    if (fetchOperations.length === 0) {
      logWarn("⚠️ [FINNY] No fetch operations needed, returning empty packs");
      return {
        packs,
        gaps,
        contextHeader: "CONTEXT_PACKS_INCLUDED: []\nDATA_GAPS: []",
      };
    }

    // OPTIMIZED: Execute all operations in parallel with better error handling
    const results = await Promise.allSettled(
      fetchOperations.map((op) => executeFetchOperation(op)),
    );

    const fetchTime = Date.now() - startTime;
    logInfo(`✅ [FINNY] All fetch operations completed in ${fetchTime}ms`);

    // OPTIMIZED: Process results with better error handling and caching
    const { emptyMerchantQueries } = processFetchResults(
      results,
      fetchOperations,
      packs,
      gaps,
    );
    // Store empty merchant queries in packs for prompt engine access
    if (emptyMerchantQueries && emptyMerchantQueries.length > 0) {
      packs.emptyMerchantQueries = emptyMerchantQueries;
    }
  } catch (error) {
    logError("❌ [FINNY] Error building context packs:", error);
    // Add all needs as gaps if there's a critical error
    needs.forEach((need) => {
      if (!gaps.includes(need)) gaps.push(need);
    });
  }

  const allContexts = [...needs]; // Include all original needs
  const contextHeader = `CONTEXT_PACKS_INCLUDED: [${allContexts
    .map((p) => `"${p}"`)
    .join(", ")}]\nDATA_GAPS: [${gaps.map((g) => `"${g}"`).join(", ")}]`;

  return { packs, gaps, contextHeader };
}

// OPTIMIZED: Create optimized fetch operations to avoid redundancy
async function createOptimizedFetchOperations(userId, needs, slots) {
  const operations = [];
  const operationKeys = new Set(); // Prevent duplicate operations

  // Helper function to add operation if not already added
  const addOperation = (key, operation) => {
    if (!operationKeys.has(key)) {
      operationKeys.add(key);
      operations.push(operation);
    }
  };

  // 1. Financial summary operation (always needed for base context)
  if (needs.includes("summary_min")) {
    const cachedSummary = await getCachedUserData("summary_min", userId);

    if (cachedSummary) {
      addOperation("summary_min", {
        key: "summary_min",
        type: "summary_min",
        userId,
        cached: true,
        data: cachedSummary,
        priority: 1, // High priority
      });
    } else {
      // OPTIMIZED: Use composite RPC function to reduce network round-trips from 3 to 1
      const dateRange = getDateRange(30);
      addOperation("summary_min", {
        key: "summary_min",
        type: "summary_min",
        userId,
        cached: false,
        priority: 1,
        fetchers: [
          {
            name: "summary_min_composite",
            rpc: "get_summary_min_composite",
            params: {
              p_user_id: userId,
              p_limit: 5,
              p_start: dateRange.start,
              p_end: dateRange.end,
            },
          },
        ],
      });
    }
  }

  // 2. Spend data operation (only if period is provided)
  if (needs.includes("spend_total") && slots?.period) {
    const cacheKey = `spend_data_${slots.period.start}_${slots.period.end}`;
    const cachedSpend = await getCachedUserData("spend_data", userId, {
      period: slots.period,
    });

    if (cachedSpend) {
      addOperation(cacheKey, {
        key: cacheKey,
        type: "spend_total",
        userId,
        period: slots.period,
        cached: true,
        data: cachedSpend,
        priority: 2,
      });
    } else {
      addOperation(cacheKey, {
        key: cacheKey,
        type: "spend_total",
        userId,
        period: slots.period,
        cached: false,
        priority: 2,
        fetchers: [
          {
            name: "spend_summary",
            rpc: "get_spend_summary",
            params: {
              p_user_id: userId,
              p_start: slots.period.start,
              p_end: slots.period.end,
            },
          },
        ],
      });
    }
  }

  // 3. Category/Merchant transactions operation (OPTIMIZED: Combine category_details and txns_by_category)
  // PHASE 2: Support merchant RPC when merchant filter exists
  logInfo(
    `🔍 [CATEGORY_TXNS] Checking if operation needed - category: ${
      slots?.category
    }, merchant: ${slots?.merchant}, period: ${slots?.period ? JSON.stringify(slots.period) : "undefined"}, useMerchantRPC: ${slots?.useMerchantRPC}`,
  );

  // Helper: Create default period if missing (for merchant/category queries without explicit period)
  const createDefaultPeriod = (timeRange) => {
    const now = new Date();
    let startDate, endDate, months;

    switch (timeRange) {
      case "1_month":
        months = 1;
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "3_months":
        months = 3;
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "6_months":
        months = 6;
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "1_year":
        months = 12;
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "current":
      default:
        // Default to last 30 days for "current" or unknown time_range
        months = 1;
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        );
        startDate = new Date(
          thirtyDaysAgo.getFullYear(),
          thirtyDaysAgo.getMonth(),
          1,
        );
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
    }

    return {
      months,
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    };
  };

  const needsCategoryTransactions =
    needs.includes("category_details") || needs.includes("txns_by_category");

  // Check if we need merchant-specific transactions (use merchant RPC)
  // If period is missing but merchant exists, create default period from time_range
  if (needsCategoryTransactions && slots?.useMerchantRPC && slots?.merchant) {
    let period = slots.period;

    // If no period provided, create default based on time_range from slots or default to 30 days
    if (!period) {
      const timeRange = slots.time_range || "current";
      period = createDefaultPeriod(timeRange);
      logInfo(
        `📅 [MERCHANT_TXNS] No period provided, creating default period from time_range '${timeRange}':`,
        period,
      );
    }
    const cacheKey = `merchant_transactions_${slots.merchant}_${period.start}_${period.end}`;
    logInfo(`🔍 [MERCHANT_TXNS] Checking cache with key: ${cacheKey}`);
    const cachedMerchantTxns = await getCachedUserData(
      "category_transactions", // Use same cache type
      userId,
      {
        merchant: slots.merchant,
        period: period,
      },
    );
    logInfo(
      `🔍 [MERCHANT_TXNS] Cache result: ${cachedMerchantTxns ? "HIT" : "MISS"}`,
    );

    if (cachedMerchantTxns) {
      addOperation(cacheKey, {
        key: cacheKey,
        type: "category_transactions", // Same type for processing
        userId,
        merchant: slots.merchant,
        period: period,
        cached: true,
        data: cachedMerchantTxns,
        priority: 2,
        servesNeeds: ["category_details"],
        isMerchantQuery: true,
      });
    } else {
      // Use get_transactions_by_merchant RPC for merchant-specific transaction queries
      const merchantTxnParams = {
        p_user_id: userId,
        p_merchant: slots.merchant,
        p_start: period.start,
        p_end: period.end,
      };
      logInfo(
        `🔍 [MERCHANT_TXNS] Creating RPC call to get_transactions_by_merchant with params:`,
        JSON.stringify(merchantTxnParams, null, 2),
      );
      addOperation(cacheKey, {
        key: cacheKey,
        type: "category_transactions",
        userId,
        merchant: slots.merchant,
        period: period,
        cached: false,
        priority: 2,
        servesNeeds: ["category_details"],
        isMerchantQuery: true,
        fetchers: [
          {
            name: "merchant_transactions",
            rpc: "get_transactions_by_merchant",
            params: merchantTxnParams,
          },
        ],
      });
    }
  }
  // Category transactions (existing logic)
  // If period is missing but category exists, create default period from time_range
  else if (needsCategoryTransactions && slots?.category) {
    let period = slots.period;

    // If no period provided, create default based on time_range from slots or default to 30 days
    if (!period) {
      const timeRange = slots.time_range || "current";
      period = createDefaultPeriod(timeRange);
      logInfo(
        `📅 [CATEGORY_TXNS] No period provided, creating default period from time_range '${timeRange}':`,
        period,
      );
    }

    if (period) {
      const cacheKey = `category_transactions_${slots.category}_${period.start}_${period.end}`;
      logInfo(`🔍 [CATEGORY_TXNS] Checking cache with key: ${cacheKey}`);
      const cachedCategoryTxns = await getCachedUserData(
        "category_transactions",
        userId,
        {
          category: slots.category,
          period: period,
        },
      );
      logInfo(
        `🔍 [CATEGORY_TXNS] Cache result: ${cachedCategoryTxns ? "HIT" : "MISS"}`,
      );

      if (cachedCategoryTxns) {
        // Use cached data for both category_details and txns_by_category needs
        addOperation(cacheKey, {
          key: cacheKey,
          type: "category_transactions",
          userId,
          category: slots.category,
          period: period,
          cached: true,
          data: cachedCategoryTxns,
          priority: 2,
          servesNeeds: ["category_details", "txns_by_category"], // This operation serves both needs
        });
      } else {
        // For multi-month queries, use get_spend_by_category_periods for monthly breakdown
        // For single period queries, use get_transactions_by_category for detailed transactions
        const fetchers = [];

        // Check if this is a multi-month query (use get_spend_by_category_periods for trends)
        const isMultiMonthQuery = period.months && period.months > 1;
        logInfo(
          `🔍 [CATEGORY_TXNS] Is multi-month query: ${isMultiMonthQuery}, months: ${period.months}`,
        );

        if (isMultiMonthQuery) {
          // Add monthly breakdown for multi-month queries
          fetchers.push({
            name: "category_spend_by_periods",
            rpc: "get_spend_by_category_periods",
            params: {
              p_user_id: userId,
              p_months: period.months,
            },
          });
        }

        // Always fetch detailed transactions for the period
        const categoryTxnParams = {
          p_user_id: userId,
          p_category: slots.category,
          p_start: period.start,
          p_end: period.end,
        };
        logInfo(
          `🔍 [CATEGORY_TXNS] Creating RPC call to get_transactions_by_category with params:`,
          JSON.stringify(categoryTxnParams, null, 2),
        );
        fetchers.push({
          name: "category_transactions",
          rpc: "get_transactions_by_category",
          params: categoryTxnParams,
        });

        addOperation(cacheKey, {
          key: cacheKey,
          type: "category_transactions",
          userId,
          category: slots.category,
          period: period,
          cached: false,
          priority: 2,
          servesNeeds: ["category_details", "txns_by_category"],
          fetchers,
        });
      }
    }
  }

  // 4. Investment holdings operation
  if (needs.includes("invest_holdings")) {
    const cachedInvest = await getCachedUserData("investments_all", userId);

    if (cachedInvest) {
      addOperation("invest_holdings", {
        key: "invest_holdings",
        type: "invest_holdings",
        userId,
        cached: true,
        data: cachedInvest,
        priority: 3,
      });
    } else {
      addOperation("invest_holdings", {
        key: "invest_holdings",
        type: "invest_holdings",
        userId,
        cached: false,
        priority: 3,
        fetchers: [
          {
            name: "investment_overview",
            rpc: "get_investment_overview",
            params: { p_user_id: userId },
          },
        ],
      });
    }
  }

  // 5. Goals overview operation
  if (needs.includes("goals_overview")) {
    const cachedGoals = await getCachedUserData("goals_overview", userId, {
      limit: 10,
    });

    if (cachedGoals) {
      addOperation("goals_overview", {
        key: "goals_overview",
        type: "goals_overview",
        userId,
        cached: true,
        data: cachedGoals,
        priority: 3,
      });
    } else {
      addOperation("goals_overview", {
        key: "goals_overview",
        type: "goals_overview",
        userId,
        cached: false,
        priority: 3,
        fetchers: [
          {
            name: "goals_overview",
            rpc: "get_goals_overview",
            params: { p_user_id: userId, p_limit: 10 },
          },
        ],
      });
    }
  }

  // 6. Cashflow monthly operation
  if (needs.includes("cashflow_monthly")) {
    const cachedCashflow = await getCachedUserData("cashflow_monthly", userId, {
      months: 3,
    });

    if (cachedCashflow) {
      addOperation("cashflow_monthly", {
        key: "cashflow_monthly",
        type: "cashflow_monthly",
        userId,
        cached: true,
        data: cachedCashflow,
        priority: 3,
      });
    } else {
      addOperation("cashflow_monthly", {
        key: "cashflow_monthly",
        type: "cashflow_monthly",
        userId,
        cached: false,
        priority: 3,
        fetchers: [
          {
            name: "cashflow_monthly",
            rpc: "get_cashflow_monthly",
            params: { p_user_id: userId, p_months: 3 },
          },
        ],
      });
    }
  }

  // OPTIMIZED: Sort operations by priority (critical data first)
  return operations.sort((a, b) => a.priority - b.priority);
}

// OPTIMIZED: Execute a single fetch operation with proper error handling
async function executeFetchOperation(operation) {
  if (operation.cached) {
    return { success: true, data: operation.data, cached: true };
  }

  try {
    // Execute all fetchers for this operation in parallel
    logInfo(
      `🔍 [RPC] Executing ${operation.fetchers.length} fetchers for operation: ${operation.key} (type: ${operation.type})`,
    );
    const fetcherPromises = operation.fetchers.map((fetcher) => {
      logInfo(
        `🔍 [RPC] Calling ${fetcher.rpc} with params:`,
        JSON.stringify(fetcher.params, null, 2),
      );
      return withTimeout(supabase.rpc(fetcher.rpc, fetcher.params), 2000, null)
        .then((result) => {
          // Preserve fetcher metadata in result for processing
          return { ...result, name: fetcher.name, rpc: fetcher.rpc };
        })
        .catch((error) => {
          logError(
            `❌ [RPC] ${fetcher.name} (${fetcher.rpc}) fetch failed:`,
            error,
          );
          logError(`❌ [RPC] Error details:`, {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
          });
          return { name: fetcher.name, rpc: fetcher.rpc, data: null, error };
        });
    });

    const results = await Promise.all(fetcherPromises);
    logInfo(
      `🔍 [RPC] All fetchers completed. Results:`,
      results.map((r, idx) => ({
        fetcher: operation.fetchers[idx]?.name,
        rpc: operation.fetchers[idx]?.rpc,
        hasData: !!r?.data,
        dataLength: Array.isArray(r?.data) ? r.data.length : r?.data ? 1 : 0,
        error: r?.error || null,
      })),
    );

    // Process results based on operation type
    logInfo(
      `🔍 [PROCESS] Processing operation ${operation.key} (type: ${operation.type}) with ${results.length} results`,
    );
    const processedData = processOperationData(operation, results);
    logInfo(
      `🔍 [PROCESS] Processed data for ${operation.key}:`,
      processedData
        ? {
            hasData: true,
            keys: Object.keys(processedData),
            dataPreview:
              operation.type === "category_transactions"
                ? {
                    category: processedData.category,
                    transactionCount: Array.isArray(processedData.transactions)
                      ? processedData.transactions.length
                      : 0,
                    period: processedData.period,
                  }
                : "See full data",
          }
        : "NULL - No data processed",
    );

    if (processedData) {
      // Cache the processed data
      await cacheOperationData(operation, processedData);
      return { success: true, data: processedData, cached: false };
    } else {
      logWarn(
        `⚠️ [PROCESS] Operation ${operation.key} returned no valid data. Results were:`,
        results,
      );
      return { success: false, error: "No valid data returned" };
    }
  } catch (error) {
    console.error(`❌ [FINNY] Operation ${operation.key} failed:`, error);
    return { success: false, error: error.message };
  }
}

// OPTIMIZED: Process fetch results with better error handling and caching
function processFetchResults(results, operations, packs, gaps) {
  // Track empty merchant queries explicitly
  const emptyMerchantQueries = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const operation = operations[i];

    if (result.status === "fulfilled" && result.value.success) {
      const { data } = result.value;

      // Process data based on operation type
      switch (operation.type) {
        case "category_transactions":
          // This operation can serve both category_details and txns_by_category
          logInfo(
            `🔍 [PACKS] Setting categoryDetails pack with ${
              data?.transactions?.length || 0
            } transactions`,
          );
          if (operation.servesNeeds?.includes("category_details")) {
            packs.categoryDetails = data;
            logInfo(`✅ [PACKS] categoryDetails set (serves category_details)`);
          }
          if (operation.servesNeeds?.includes("txns_by_category")) {
            // Merge into spend pack for totals, but also keep categoryDetails for analysis
            packs.spend = { ...packs.spend, ...data };
            // Ensure categoryDetails is set for transaction analysis
            if (!packs.categoryDetails) {
              packs.categoryDetails = data;
              logInfo(
                `✅ [PACKS] categoryDetails set (serves txns_by_category)`,
              );
            }
          }
          logInfo(`🔍 [PACKS] Final categoryDetails:`, {
            hasData: !!packs.categoryDetails,
            category: packs.categoryDetails?.category,
            transactionCount: Array.isArray(packs.categoryDetails?.transactions)
              ? packs.categoryDetails.transactions.length
              : 0,
            sampleTransactionNames: Array.isArray(
              packs.categoryDetails?.transactions,
            )
              ? packs.categoryDetails.transactions
                  .slice(0, 3)
                  .map((t) => t.merchant || t.name)
              : [],
          });
          break;
        default: {
          const packKey =
            NEED_CONFIG[operation.type]?.packKey || operation.type;
          packs[packKey] = data;
          break;
        }
      }
    } else {
      // Handle failed operations
      const error =
        result.status === "rejected" ? result.reason : result.value?.error;
      console.error(`❌ [FINNY] Operation ${operation.key} failed:`, error);

      // CRITICAL FIX: Track empty merchant queries explicitly
      // When a merchant query returns empty (not an error, just no transactions found),
      // we need to pass this info to the prompt so the LLM can respond appropriately
      if (
        operation.type === "category_transactions" &&
        operation.isMerchantQuery &&
        operation.merchant &&
        operation.period &&
        result.status === "fulfilled" &&
        !result.value.success &&
        result.value?.error === "No valid data returned"
      ) {
        // This is an empty merchant query result (not a system error)
        // The query executed successfully but returned zero transactions
        emptyMerchantQueries.push({
          merchant: operation.merchant,
          period: operation.period,
          periodDisplay: `${operation.period.start} to ${operation.period.end}`,
        });
        logInfo(
          `📝 [EMPTY_MERCHANT] Tracked empty merchant query: ${operation.merchant} (${operation.period.start} to ${operation.period.end})`,
        );
      }

      // Add to gaps based on what needs this operation was serving
      if (operation.servesNeeds) {
        operation.servesNeeds.forEach((need) => {
          if (!gaps.includes(need)) gaps.push(need);
        });
      } else {
        if (!gaps.includes(operation.type)) gaps.push(operation.type);
      }
    }
  }

  // Return empty merchant queries (will be stored in packs by caller)
  return { packs, gaps, emptyMerchantQueries };
}

// OPTIMIZED: Helper function to get date range
function getDateRange(daysAgo) {
  const now = new Date();
  const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return {
    start: past.toISOString().split("T")[0],
    end: now.toISOString().split("T")[0],
  };
}

// OPTIMIZED: Process operation data based on type
function processOperationData(operation, results) {
  switch (operation.type) {
    case "summary_min":
      return processSummaryData(results);
    case "spend_total":
      return processSpendData(operation, results);
    case "category_transactions":
      return processCategoryTransactionsData(operation, results);
    case "invest_holdings":
      return processInvestmentData(results);
    case "goals_overview":
      return processGoalsData(results);
    case "cashflow_monthly":
      return processCashflowData(results);
    default:
      return null;
  }
}

// OPTIMIZED: Process summary data from composite RPC call (single JSONB response)
function processSummaryData(results) {
  // Composite function returns single result with all data in JSONB format
  const compositeRes = results[0];

  if (!compositeRes?.data) {
    console.log("⚠️ [SUMMARY_DATA] No data in composite RPC response");
    return null;
  }

  // Handle both old format (array of results) and new format (single JSONB object)
  let compositeData;
  if (
    typeof compositeRes.data === "object" &&
    !Array.isArray(compositeRes.data)
  ) {
    // New composite format: single JSONB object
    compositeData = compositeRes.data;
  } else if (Array.isArray(compositeRes.data) && compositeRes.data.length > 0) {
    // Fallback: if it's an array, take first element (shouldn't happen with composite)
    compositeData = compositeRes.data[0];
  } else {
    console.log("⚠️ [SUMMARY_DATA] Invalid composite RPC response format");
    return null;
  }

  const netWorth = compositeData.net_worth || {};
  const recentTransactions = compositeData.recent_transactions || [];
  const spendByCategory = compositeData.spend_by_category || [];
  // New fields for monthly breakdown (backward compatible - will be empty array if not present)
  const spendByCategoryCurrentMonth =
    compositeData.spend_by_category_current_month || [];
  const spendByCategoryLastMonth =
    compositeData.spend_by_category_last_month || [];
  const budget = compositeData.budget || null;

  // Log raw data for debugging
  const hasNewFields =
    Array.isArray(spendByCategoryCurrentMonth) &&
    spendByCategoryCurrentMonth.length > 0;
  console.log("📊 [SUMMARY_DATA] Raw composite data from RPC:", {
    net_worth: netWorth.net_worth,
    liquid_assets: netWorth.liquid_assets,
    investments_total: netWorth.investments_total,
    total_liabilities: netWorth.total_liabilities,
    bank_accounts_count: netWorth.bank_accounts_count || 0,
    recent_transactions_count: recentTransactions.length,
    spend_categories_count: spendByCategory.length,
    spend_categories_current_month_count: Array.isArray(
      spendByCategoryCurrentMonth,
    )
      ? spendByCategoryCurrentMonth.length
      : 0,
    spend_categories_last_month_count: Array.isArray(spendByCategoryLastMonth)
      ? spendByCategoryLastMonth.length
      : 0,
    has_new_monthly_fields: hasNewFields,
    has_budget: !!budget,
  });

  // Warn if new fields are missing (likely old cache or migration not run)
  if (!hasNewFields && spendByCategory.length > 0) {
    console.log(
      "⚠️ [SUMMARY_DATA] New monthly spending fields are missing! This could mean:",
    );
    console.log("   1. SQL migration hasn't been run yet");
    console.log(
      "   2. Cache contains old data - clear cache or wait for expiration",
    );
    console.log("   3. Database function doesn't have the new fields");
  }

  return {
    netWorth: Number(netWorth.net_worth || 0),
    liquidAssets: Number(netWorth.liquid_assets || 0),
    investmentsTotal: Number(netWorth.investments_total || 0),
    totalLiabilities: Number(netWorth.total_liabilities || 0),
    recentTransactions: Array.isArray(recentTransactions)
      ? recentTransactions.slice(0, 5).map((txn) => ({
          date: txn.date,
          amount: txn.amount,
          merchant: txn.merchant || txn.name,
        }))
      : [],
    spendByCategory: Array.isArray(spendByCategory) ? spendByCategory : [],
    spendByCategoryCurrentMonth: Array.isArray(spendByCategoryCurrentMonth)
      ? spendByCategoryCurrentMonth
      : [],
    spendByCategoryLastMonth: Array.isArray(spendByCategoryLastMonth)
      ? spendByCategoryLastMonth
      : [],
    accounts: Array.isArray(netWorth.bank_accounts)
      ? netWorth.bank_accounts
      : [],
    budget,
  };
}

// OPTIMIZED: Process spend data
function processSpendData(operation, results) {
  const [spendRes] = results;
  if (!spendRes?.data) return null;

  return {
    total: spendRes.data.total_spend || 0,
    count: spendRes.data.txn_count || 0,
    period: `${operation.period.start} to ${operation.period.end}`,
  };
}

// OPTIMIZED: Process category transactions data
function processCategoryTransactionsData(operation, results) {
  logInfo(
    `🔍 [CATEGORY_TXNS_PROCESS] Processing category transactions for operation:`,
    {
      key: operation.key,
      category: operation.category,
      merchant: operation.merchant,
      period: operation.period,
      resultsCount: results.length,
      isMerchantQuery: operation.isMerchantQuery || false,
    },
  );

  // PHASE 2: Handle merchant queries (get_transactions_by_merchant returns transactions directly)
  if (operation.isMerchantQuery) {
    const merchantRes =
      results.find((r) => r?.name === "merchant_transactions") ||
      results[results.length - 1];

    if (
      !merchantRes?.data ||
      !Array.isArray(merchantRes.data) ||
      merchantRes.data.length === 0
    ) {
      logWarn(
        `⚠️ [MERCHANT_TXNS_PROCESS] No merchant transaction data found. merchantRes:`,
        merchantRes,
      );
      return null;
    }

    // get_transactions_by_merchant already filters by merchant, so use data directly
    // CRITICAL FIX: Calculate totals separately for sent (positive) vs received (negative)
    // Amount convention: Positive = sent (outgoing), Negative = received (incoming)
    let totalSent = 0;
    let totalReceived = 0;
    let sentCount = 0;
    let receivedCount = 0;

    merchantRes.data.forEach((txn) => {
      const amount = Number(txn.amount) || 0;
      if (amount > 0) {
        // Positive = sent (outgoing)
        totalSent += amount;
        sentCount++;
      } else if (amount < 0) {
        // Negative = received (incoming)
        totalReceived += Math.abs(amount); // Store as positive for clarity
        receivedCount++;
      }
      // amount === 0 is ignored (refunds/adjustments)
    });

    // Legacy total_spend for backward compatibility (all transactions)
    // Note: This represents total activity (sent + received), not net flow
    const totalSpend = totalSent + totalReceived;

    // CRITICAL: Always include sent/received totals even if one is zero
    // This ensures bidirectional detection works correctly in prompt engine

    const result = {
      category: null, // No specific category for merchant queries
      merchant: operation.merchant,
      transactions: merchantRes.data.map((txn) => {
        const amount = Number(txn.amount) || 0;
        return {
          date: txn.date,
          amount: txn.amount, // Preserve original sign
          name: txn.name,
          merchant: txn.merchant_name || txn.name || operation.merchant,
          category: txn.category || null,
          direction: amount > 0 ? "sent" : amount < 0 ? "received" : "neutral", // Add direction metadata
        };
      }),
      total_spend: totalSpend, // Legacy: total of all transactions
      total_sent: totalSent, // NEW: only sent transactions
      total_received: totalReceived, // NEW: only received transactions
      txn_count: merchantRes.data.length,
      sent_count: sentCount,
      received_count: receivedCount,
      period: `${operation.period.start} to ${operation.period.end}`,
    };

    logInfo(
      `🔍 [MERCHANT_TXNS_PROCESS] Processed ${result.transactions.length} merchant transactions:`,
      {
        merchant: result.merchant,
        period: result.period,
        transactionCount: result.transactions.length,
        totalSpend: result.total_spend,
        totalSent: result.total_sent,
        totalReceived: result.total_received,
        sentCount: result.sent_count,
        receivedCount: result.received_count,
        sampleTransactions: result.transactions.slice(0, 5).map((t) => ({
          date: t.date,
          merchant: t.merchant,
          name: t.name,
          amount: t.amount,
          direction: t.direction,
        })),
      },
    );

    return result;
  }

  // Results can contain: [category_spend_by_periods, category_transactions] for multi-month queries
  // Or just: [category_transactions] for single period queries
  const txnRes =
    results.find((r) => r?.name === "category_transactions") ||
    results[results.length - 1];
  const periodsRes = results.find(
    (r) => r?.name === "category_spend_by_periods",
  );

  logInfo(`🔍 [CATEGORY_TXNS_PROCESS] Found transaction result:`, {
    found: !!txnRes,
    hasData: !!txnRes?.data,
    dataLength: Array.isArray(txnRes?.data)
      ? txnRes.data.length
      : txnRes?.data
        ? 1
        : 0,
    dataType: txnRes?.data ? typeof txnRes.data : "undefined",
    firstItem:
      Array.isArray(txnRes?.data) && txnRes.data.length > 0
        ? txnRes.data[0]
        : null,
  });

  if (!txnRes?.data || txnRes.data.length === 0) {
    logWarn(
      `⚠️ [CATEGORY_TXNS_PROCESS] No transaction data found. txnRes:`,
      txnRes,
    );
    return null;
  }

  const result = {
    category: operation.category,
    transactions: txnRes.data.map((txn) => ({
      date: txn.date,
      amount: txn.amount,
      name: txn.name,
      merchant: txn.merchant_name || txn.name,
      category: txn.category,
    })),
    period: `${operation.period.start} to ${operation.period.end}`,
  };

  logInfo(
    `🔍 [CATEGORY_TXNS_PROCESS] Processed ${result.transactions.length} transactions:`,
    {
      category: result.category,
      period: result.period,
      transactionCount: result.transactions.length,
      sampleTransactions: result.transactions.slice(0, 5).map((t) => ({
        date: t.date,
        merchant: t.merchant,
        name: t.name,
        amount: t.amount,
      })),
      allMerchants: [
        ...new Set(result.transactions.map((t) => t.merchant)),
      ].slice(0, 10),
    },
  );

  // If we have monthly breakdown data, filter it for this category and add it
  if (periodsRes?.data && Array.isArray(periodsRes.data)) {
    const categoryMonthlyData = periodsRes.data
      .filter(
        (item) =>
          item.category &&
          item.category.toLowerCase() === operation.category.toLowerCase(),
      )
      .map((item) => ({
        month: item.month,
        total_spend: item.total_spend,
        txn_count: item.txn_count,
      }));

    if (categoryMonthlyData.length > 0) {
      result.monthlyBreakdown = categoryMonthlyData;
    }
  }

  return result;
}

// OPTIMIZED: Process investment data
function processInvestmentData(results) {
  const [investRes] = results;
  if (!investRes?.data) return null;

  const payload = investRes.data || {};
  return {
    holdings: Array.isArray(payload.holdings)
      ? payload.holdings.map((h) => ({
          symbol: h.symbol,
          description: h.description,
          units: h.units,
          market_value: h.market_value,
        }))
      : [],
    balances: Array.isArray(payload.balances) ? payload.balances : [],
    options: Array.isArray(payload.options) ? payload.options : [],
  };
}

// OPTIMIZED: Process goals data
function processGoalsData(results) {
  const [goalsRes] = results;
  if (!goalsRes?.data) return null;

  return {
    goals: (goalsRes.data || []).map((goal) => ({
      label: goal.label,
      current_amount: goal.current_amount,
      target_amount: goal.target_amount,
      progress_pct: goal.progress_pct,
      target_date: goal.target_date,
    })),
  };
}

// OPTIMIZED: Process cashflow data
function processCashflowData(results) {
  const [cashflowRes] = results;
  if (!cashflowRes?.data) return null;

  return {
    cashflow: (cashflowRes.data || []).map((cf) => ({
      month: cf.month,
      income: cf.income,
      expense: cf.expense,
      net: cf.net,
    })),
  };
}

// OPTIMIZED: Cache operation data
async function cacheOperationData(operation, data) {
  const cfg = NEED_CONFIG[operation.type];
  if (!cfg) return;

  // Always start with an object so downstream helpers that expect fields on
  // params (like ttl/period) never receive undefined.
  let params = {};

  switch (operation.type) {
    case "spend_total":
      params = { period: operation.period };
      break;
    case "category_transactions":
      params = {
        category: operation.category,
        period: operation.period,
      };
      break;
    case "goals_overview":
      params = { limit: 10 };
      break;
    case "cashflow_monthly":
      params = { months: 3 };
      break;
  }

  await setCachedUserData(cfg.cacheType, operation.userId, data, params);
}

// Helper function to check if all contexts are cached (silently)
async function areAllContextsCached(userId) {
  const commonContexts = ["summary_min", "invest_holdings", "goals_overview"];

  for (const need of commonContexts) {
    const cacheType = NEED_CONFIG[need]?.cacheType || need;
    const cached = await getCachedUserData(cacheType, userId, {}, true); // silent = true
    if (!cached) {
      return false;
    }
  }

  const spendParams = { period: getDateRange(30) };
  const cachedSpend = await getCachedUserData(
    "spend_data",
    userId,
    spendParams,
    true,
  );
  if (!cachedSpend) {
    return false;
  }

  return true;
}

async function handlePrebuildContext(userId, silent = false) {
  const startTime = Date.now();
  const spendParams = { period: getDateRange(30) };

  try {
    // Check if context is already cached and fresh (within 50 minute TTL)
    // Skip entirely when all packs are cached - no API work needed
    const commonContexts = ["summary_min", "invest_holdings", "goals_overview"];

    const cachedContexts = {};
    let allCached = true;

    for (const need of commonContexts) {
      const cacheType = NEED_CONFIG[need]?.cacheType || need;
      const cached = await getCachedUserData(cacheType, userId, {}, silent);
      cachedContexts[need] = !!cached;
      if (!cached) {
        allCached = false;
      }
    }

    const cachedSpend = await getCachedUserData(
      "spend_data",
      userId,
      spendParams,
      silent,
    );
    cachedContexts.spend_total = !!cachedSpend;
    if (!cachedSpend) {
      allCached = false;
    }

    // If all contexts are already cached and fresh, return early
    if (allCached) {
      const totalTime = Date.now() - startTime;
      if (!silent) {
        logInfo(
          `⚡ [PREBUILD] All contexts already cached and fresh (checked in ${totalTime}ms), skipping build`,
        );
      }
      return {
        success: true,
        message: "Context already cached and fresh",
        baseContextReady: true,
        backgroundContexts: [...commonContexts, "spend_total"],
        buildTime: totalTime,
        cached: true,
      };
    }

    logInfo(
      `📦 [PREBUILD] Some contexts missing, rebuilding... (cached: ${
        Object.keys(cachedContexts)
          .filter((k) => cachedContexts[k])
          .join(", ") || "none"
      })`,
    );

    // Build base context pack first (highest priority) - only if not cached
    if (!cachedContexts.summary_min) {
      logInfo("📦 [PREBUILD] Building base context pack...");
      const baseContext = await buildContextPacks(userId, ["summary_min"], {});
      const basePack =
        baseContext?.packs?.[NEED_CONFIG.summary_min.packKey] || null;
      logInfo("🔍 [PREBUILD] Base context result:", {
        hasBaseContext: !!baseContext,
        hasPacks: !!baseContext?.packs,
        hasSummaryMin: !!basePack,
        summaryMinKeys: basePack ? Object.keys(basePack) : [],
      });

      // Cache base context for 50 minutes
      if (basePack) {
        await setCachedUserData(
          NEED_CONFIG.summary_min.cacheType,
          userId,
          basePack,
          {
            ttl: 50 * 60 * 1000,
          },
        );
        logInfo("✅ [PREBUILD] Base context cached successfully");
        logInfo("🔍 [PREBUILD] Base context data:", {
          hasNetWorth: !!basePack.netWorth,
          hasTransactions: !!basePack.recentTransactions,
          hasSpendByCategory: !!basePack.spendByCategory,
        });
      } else {
        logWarn("❌ [PREBUILD] Base context failed to build or cache");
        logDebug("🔍 [PREBUILD] Debug info:", {
          baseContext: baseContext,
          packs: baseContext?.packs,
          basePack: basePack,
        });
      }
    } else {
      logInfo("✅ [PREBUILD] Base context already cached, skipping build");
    }

    // Build invest, goals, spend in parallel (only if not cached)
    const backgroundBuilds = [];

    if (!cachedContexts.invest_holdings) {
      backgroundBuilds.push(
        (async () => {
          try {
            const investContext = await buildContextPacks(
              userId,
              ["invest_holdings"],
              {},
            );
            const investPack =
              investContext?.packs?.[NEED_CONFIG.invest_holdings.packKey] ||
              null;
            if (investContext && investContext.packs && investPack) {
              await setCachedUserData(
                NEED_CONFIG.invest_holdings.cacheType,
                userId,
                investPack,
                { ttl: 50 * 60 * 1000 },
              );
              logInfo("✅ [PREBUILD] Investment context cached");
            } else {
              logWarn("❌ [PREBUILD] Investment context failed to build");
            }
          } catch (error) {
            logError("❌ [PREBUILD] Investment context failed:", error);
          }
        })(),
      );
    }

    if (!cachedContexts.goals_overview) {
      backgroundBuilds.push(
        (async () => {
          try {
            const goalsContext = await buildContextPacks(
              userId,
              ["goals_overview"],
              {},
            );
            const goalsPack =
              goalsContext?.packs?.[NEED_CONFIG.goals_overview.packKey] || null;
            if (goalsContext && goalsContext.packs && goalsPack) {
              await setCachedUserData(
                NEED_CONFIG.goals_overview.cacheType,
                userId,
                goalsPack,
                { ttl: 50 * 60 * 1000 },
              );
              logInfo("✅ [PREBUILD] Goals context cached");
            } else {
              logWarn("❌ [PREBUILD] Goals context failed to build");
            }
          } catch (error) {
            logError("❌ [PREBUILD] Goals context failed:", error);
          }
        })(),
      );
    }

    if (!cachedContexts.spend_total) {
      backgroundBuilds.push(
        (async () => {
          try {
            const spendContext = await buildContextPacks(
              userId,
              ["spend_total"],
              spendParams,
            );
            const spendPack =
              spendContext?.packs?.[NEED_CONFIG.spend_total.packKey] || null;
            if (spendContext && spendContext.packs && spendPack) {
              await setCachedUserData(
                NEED_CONFIG.spend_total.cacheType,
                userId,
                spendPack,
                { ttl: 50 * 60 * 1000 },
              );
              logInfo("✅ [PREBUILD] Spend context cached");
            } else {
              logWarn("❌ [PREBUILD] Spend context failed to build");
            }
          } catch (error) {
            logError("❌ [PREBUILD] Spend context failed:", error);
          }
        })(),
      );
    }

    if (backgroundBuilds.length > 0) {
      logInfo(
        `📦 [PREBUILD] Building ${backgroundBuilds.length} context pack(s) in parallel...`,
      );
      await Promise.allSettled(backgroundBuilds);
    }

    const totalTime = Date.now() - startTime;
    logInfo(`🎯 [PREBUILD] Context pre-building completed in ${totalTime}ms`);

    return {
      success: true,
      message: "Context pre-built successfully",
      baseContextReady: true,
      backgroundContexts: [
        "summary_min",
        "invest_holdings",
        "goals_overview",
        "spend_total",
      ],
      buildTime: totalTime,
    };
  } catch (error) {
    logError("❌ [PREBUILD] Context pre-building failed:", error);
    return {
      success: false,
      message:
        "Context pre-building failed, will fallback to on-demand building",
      error: error.message,
    };
  }
}

// handleClassify - wrapper for ClassificationService
async function handleClassify(message, context) {
  return await classificationService.classify(message, context);
}

async function handleOffTopic(
  message,
  context,
  wantsStreaming = false,
  res = null,
) {
  console.log("🚫 [FINNY] Handling off-topic query:", message);
  const startTime = Date.now();

  // Helper to send progress updates
  const sendProgress = (status) => {
    if (wantsStreaming && res && !res.writableEnded) {
      sendStreamEvent(res, "progress", { status });
    }
  };

  const messageText =
    typeof message === "string" ? message : String(message || "");

  // Simple venting detection (same handler/prompt, but we tag the mode)
  const lower = messageText.toLowerCase();
  const ventingPatterns = [
    /\b(stressed|overwhelmed|tired|exhausted|frustrated|annoyed|upset|sad|depressed|anxious|worried)\b/i,
    /\b(having a hard time|going through|struggling|difficult|tough|rough)\b/i,
    /\b(work is|job is|boss|colleague|relationship|family|friend)\b/i,
  ];
  const hasVenting = ventingPatterns.some((pattern) => pattern.test(lower));
  const hasFinancialContext =
    /\b(money|finance|financial|budget|debt|spend|save|invest|income|salary|bill|payment|rent|mortgage|credit|loan)\b/i.test(
      lower,
    );
  const isVenting = hasVenting && !hasFinancialContext;

  const category = isVenting ? "venting" : context?.category || "general";
  const userProfile = context?.profile || {};
  const userId = context?.user_id;
  const persistOffTopicTurnMeta = async (assistantText) => {
    if (!userId) return null;
    const meta = buildLastTurnMeta({
      route: "off_topic",
      classificationResult: context?.classification_result || {
        intent: "off_topic",
      },
      responseContract: null,
      assistantText,
      userMessage: messageText,
      chatId: context?.chat_id || null,
      groundedAnswer: false,
      topic: category,
    });
    mergeSessionState(userId, { last_turn_meta: meta });
    const persisted = await persistLastTurnMeta({
      userId,
      chatId: context?.chat_id || null,
      lastTurnMeta: meta,
    });
    if (!persisted?.persisted) {
      logWarn("⚠️ [CONTINUITY] Failed to persist off-topic turn meta:", {
        chat_id: context?.chat_id || null,
        reason: persisted?.reason || "unknown",
      });
    }
    return meta;
  };

  // Fetch net worth data for lightweight context
  let netWorthData = null;
  if (userId) {
    try {
      sendProgress("Loading your financess...");
      netWorthData = await getNetWorthData(userId);
      if (netWorthData) {
        console.log("📊 [OFF_TOPIC] Net worth data loaded for context");
      }
    } catch (error) {
      console.log(
        "⚠️ [OFF_TOPIC] Could not load net worth data:",
        error?.message,
      );
    }
  }

  const systemPrompt = [
    "You are Finny, a calm, intelligent money coach.",
    "",
    "CORE BEHAVIOR:",
    "- Your primary role is personal finance guidance and money coaching.",
    "- You are friendly, human, and conversational, not robotic.",
    "- You acknowledge the user as a person before steering toward finance.",
    "",
    "NON-CONFLICTING RULES:",
    "1) You must NOT provide detailed answers or factual explanations in non-finance domains (religion, physics, cooking, movies, sports, weather, games, etc.).",
    "2) You may acknowledge non-finance topics briefly, but never explain or teach them.",
    "3) You must NOT engage with sexual, unsafe, or inappropriate content. Redirect immediately.",
    "4) Every conversation should gently and naturally connect back to money or financial decisions.",
    "",
    "SMALL TALK & GREETINGS:",
    "- If the user says something like 'hi', 'how are you', or casual small talk:",
    "  • Respond naturally and briefly.",
    "  • End with a subtle, low-pressure bridge to finance.",
    "  • Example: mood, plans, money goals, or financial well-being.",
    "",
    "OFF-TOPIC (NOT EMOTIONAL):",
    "- Acknowledge in one sentence.",
    "- Do NOT provide domain facts.",
    "- Redirect to a specific finance angle.",
    "- Ask ONE clear finance-related question.",
    "- Keep total response to 2–4 sentences.",
    "",
    "EMOTIONAL / VENTING USER:",
    "- Acknowledge feelings with empathy (1–2 sentences).",
    "- Do NOT give medical or legal advice.",
    "- Gently connect emotions to money impact (stress, control, stability).",
    "- Ask ONE focused finance question to move forward.",
    "",
    "MEMORY & USER CONTEXT:",
    "- You may use stored user context to personalize advice.",
    "- If the user asks 'what do you know about me?', answer using available context both personal and financial.",
    "- Never mention the word 'memories' or imply private data access.",
    "- If context is missing, ask clarifying questions instead of assuming.",
    "",
    "STYLE GUIDELINES:",
    "- Sound like a thoughtful human money coach.",
    "- Be concise, grounded, and non-judgmental.",
    "- No lectures. No generic disclaimers. No buzzwords.",
    "",
    "RESPONSE FORMATTING:",
    "- For longer responses (3+ sentences), use line breaks to improve readability.",
    "- When your response has distinct parts (acknowledgment + question, or multiple thoughts),",
    "  separate them with two blank lines (double line break) for better chat readability.",
    "- Short responses (1-2 sentences) can remain as single paragraphs.",
    "- Format naturally like a chat message, not a dense paragraph.",
    "- Example structure for longer responses:",
    "  [Acknowledgment or first thought]",
    "",
    "",
    "  [Question or second thought]",
  ].join("\n");

  try {
    // Load off-topic memory context plus a lightweight Supermemory profile.
    let userMemory = { memories: [], totalCount: 0 };
    let userProfileForFinny = null;
    sendProgress("Brewing...");
    if (userId) {
      try {
        console.log(
          "🧠 [OFF_TOPIC] Loading user memories and profile for off-topic context for user:",
          userId,
        );

        const [loadedMemory, loadedProfile] = await Promise.all([
          loadUserMemoryWithTimeout(
            userId,
            messageText,
            MEMORY_LOAD_TIMEOUT_MS,
          ).catch((error) => {
            console.log("⚠️ [OFF_TOPIC] Error loading memory:", error?.message);
            return { memories: [], totalCount: 0 };
          }),
          fetchSupermemoryProfileWithTimeout(userId, 2000).catch((error) => {
            console.log(
              "⚠️ [OFF_TOPIC] Error loading Supermemory profile:",
              error?.message,
            );
            return null;
          }),
        ]);

        userMemory = loadedMemory;
        userProfileForFinny = loadedProfile;

        sendProgress("Brewing about you...");
        console.log("🧠 [OFF_TOPIC] User memories:", userMemory);
        if (userProfileForFinny?.profile) {
          console.log("🧠 [OFF_TOPIC] Supermemory profile loaded");
        }
      } catch (error) {
        console.log("⚠️ [OFF_TOPIC] Could not load user data:", error?.message);
        userMemory = { memories: [], totalCount: 0 };
        userProfileForFinny = null;
      }
    }

    const memorySnippets = Array.isArray(userMemory?.memories)
      ? userMemory.memories
          .slice(0, 10)
          .map((m, idx) => {
            const raw = String(m?.content || "");
            const cleaned = redactPII(raw).replace(/\s+/g, " ").trim();
            const clipped =
              cleaned.length > 240 ? `${cleaned.slice(0, 240)}…` : cleaned;
            const score =
              typeof m?.similarity === "number" && Number.isFinite(m.similarity)
                ? m.similarity
                : null;
            return `- ${idx + 1})${
              score !== null ? ` (${score.toFixed(2)})` : ""
            } ${clipped}`;
          })
          .filter(Boolean)
      : [];
    const userContextParts = [
      `Message: ${messageText}`,
      `Mode hint: ${isVenting ? "venting" : "general_off_topic"}`,
      userProfile?.name ? `User name: ${userProfile.name}` : null,
      typeof userProfile?.monthly_income === "number" &&
      Number.isFinite(userProfile.monthly_income) &&
      userProfile.monthly_income > 0
        ? `Monthly income: $${userProfile.monthly_income.toLocaleString(
            undefined,
            { maximumFractionDigits: 0 },
          )}`
        : null,
      userProfileForFinny?.profile
        ? `Supermemory profile:\n${
            Array.isArray(userProfileForFinny.profile.static) &&
            userProfileForFinny.profile.static.length > 0
              ? `Static: ${userProfileForFinny.profile.static.join(", ")}\n`
              : ""
          }${
            userProfileForFinny.profile.dynamic
              ? `Dynamic: ${
                  Array.isArray(userProfileForFinny.profile.dynamic)
                    ? userProfileForFinny.profile.dynamic.join(", ")
                    : userProfileForFinny.profile.dynamic
                }`
              : ""
          }`
        : null,
      userProfile?.finny_style
        ? `Finny style: ${userProfile.finny_style}`
        : null,
      netWorthData
        ? `Financial context: Net worth ${netWorthData.formatted.net_worth}, ${netWorthData.formatted.liquid_assets} cash, ${netWorthData.formatted.investments_total} invested, ${netWorthData.formatted.total_liabilities} debt`
        : null,
      memorySnippets.length > 0
        ? `Relevant memories (use them well):\n${memorySnippets.join("\n")}`
        : "Relevant memories: none",
    ].filter(Boolean);

    const userMessage = userContextParts.join("\n\n");

    // Build prompt_used for logging (full messages sent to LLM)
    const promptUsed = JSON.stringify([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ]);

    async function callMainLLM(model, options = {}) {
      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            "Content-Type": "application/json",
          },
          signal: options.signal,
          body: JSON.stringify({
            model,
            temperature: 0.85,
            max_tokens: 1500,
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          }),
        },
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`OpenRouter error ${resp.status}: ${errorText}`);
      }
      return resp;
    }

    const llmModels = [STANDARD_MODEL, TERTIARY_MODEL];

    let resp;
    let usedModel = STANDARD_MODEL;
    try {
      const llmResult = await llmService.callWithFallback(
        llmModels,
        callMainLLM,
        20000,
        "LLM",
      );
      resp = llmResult.result;
      usedModel = llmResult.model;
    } catch (llmError) {
      console.error(
        "❌ [FINNY] All LLM attempts failed for off-topic:",
        llmError?.message,
      );
      await persistOffTopicTurnMeta(
        "I'm a finance coach. What financial questions can I help you with?",
      );
      return {
        text: "I'm a finance coach. What financial questions can I help you with?",
        type: "assistant",
        intent: "off_topic",
        category: category,
        fallback: true,
      };
    }

    const data = await resp.json();
    const content =
      data.choices?.[0]?.message?.content ||
      "I'm all about finance. What money questions can I help you with?";
    const offTopicTurnMeta = await persistOffTopicTurnMeta(content);

    // Log in background (non-blocking)
    setImmediate(() =>
      logConversation({
        user_message: redactPII(messageText),
        finny_response: redactPII(content),
        timestamp: new Date().toISOString(),
        user_id: userId || "unknown",
        chat_id: context?.chat_id || null,
        intent: "off_topic",
        entities: [],
        confidence: 1.0,
        response_time_ms: Date.now() - startTime,
        sources_used: [],
        cached: false,
        category: category,
        request_id: context?.request_id || null,
        classification_details: context?.classification_result || {
          intent: "off_topic",
          confidence: 1.0,
          emotional_state: isVenting ? "venting" : "neutral",
        },
        prompt_used: promptUsed,
        metrics: {
          intent: "off_topic",
          model: usedModel,
          result: "success",
          finny_turn_meta: offTopicTurnMeta,
        },
      }).catch((err) =>
        console.error(
          "❌ [CONVERSATION_LOG] Background log failed:",
          err?.message,
        ),
      ),
    );

    return {
      text: cleanResponseFormatting(content),
      type: "assistant",
      intent: "off_topic",
      category: category,
    };
  } catch (error) {
    console.error("❌ [FINNY] Off-topic handler error:", error);
    await persistOffTopicTurnMeta(
      "I'm strictly a finance coach. What financial questions can I help you with?",
    );
    return {
      text: "I'm strictly a finance coach. What financial questions can I help you with?",
      type: "assistant",
      intent: "off_topic",
      category: category,
      fallback: true,
    };
  }
}

// =====================
// GOALS: Slot-filling
// =====================

// GOAL_CATEGORY_KEYWORDS moved to goals.js

// guessGoalCategory function moved to goals.js

// parseCurrencyAmount function moved to goals.js

// parseTargetDate function moved to goals.js

// extractLabel and handleGoal functions moved to goals.js

// ============================================================================
// WEB RESEARCH SYSTEM - CONSOLIDATED UTILITIES
// ============================================================================
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function to send streaming events
function sendStreamEvent(res, event, data) {
  if (!res || res.writableEnded) return;
  if (event !== "ping") {
    res.__finny_last_emit = Date.now();
  }
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === "function") {
    res.flush();
  }
}

function buildStreamFallbackResponse(message) {
  return {
    message: cleanResponseFormatting(
      message ||
        "Sorry — something stalled on my side. Please try again in a moment.",
    ),
    type: "assistant",
    hideActions: true,
    hideFeedback: true,
    actions: [],
  };
}

function startStreamWatchdog(res, { timeoutMs = 30000, pingMs = 8000 } = {}) {
  const startedAt = Date.now();
  res.__finny_last_emit = startedAt;

  const intervalId = setInterval(() => {
    if (!res || res.writableEnded) {
      clearInterval(intervalId);
      return;
    }

    const lastEmit = res.__finny_last_emit || startedAt;
    const now = Date.now();
    if (now - lastEmit >= timeoutMs) {
      logWarn("⚠️ [STREAMING] Watchdog timeout; forcing complete");
      sendStreamEvent(
        res,
        "complete",
        buildStreamFallbackResponse(
          "Sorry — the response took too long. Please try again.",
        ),
      );
      res.end();
      clearInterval(intervalId);
      return;
    }

    sendStreamEvent(res, "ping", { ts: now });
  }, pingMs);

  return intervalId;
}

// Finance facts to show during stock analysis loading
const FINANCE_FACTS = [
  "💡 Did you know? The stock market has historically returned about 10% annually over the long term.",
  "📊 Fun fact: The first stock exchange was established in Amsterdam in 1602 for the Dutch East India Company.",
  "💰 Tip: Diversification is key - don't put all your eggs in one basket!",
  "📈 Interesting: The S&P 500 has had positive returns in about 75% of all years since 1926.",
  "🎯 Fact: Warren Buffett's favorite holding period is 'forever' - think long-term!",
  "💼 Did you know? The average investor underperforms the market by about 2-3% annually due to emotional trading.",
  "📉 Insight: Market corrections (10-20% drops) happen about once every 2 years on average.",
  "🚀 Fun fact: The term 'bull market' comes from bulls attacking upward, while 'bear market' comes from bears swiping downward.",
  "💎 Tip: Dollar-cost averaging can help reduce the impact of market volatility.",
  "📊 Fact: The P/E ratio (Price-to-Earnings) helps investors understand if a stock is overvalued or undervalued.",
  "🎓 Did you know? The first IPO (Initial Public Offering) was by the Dutch East India Company in 1602.",
  "💡 Insight: Compound interest is often called the 'eighth wonder of the world' - time is your best friend in investing!",
  "📈 Fact: The stock market is closed on weekends and major holidays - plan your trades accordingly.",
  "💰 Tip: Emergency funds should cover 3-6 months of expenses before you start investing heavily.",
  "🚀 Fun fact: The NASDAQ was the world's first electronic stock market when it launched in 1971.",
];

function getRandomFinanceFact() {
  return FINANCE_FACTS[Math.floor(Math.random() * FINANCE_FACTS.length)];
}

// Helper to send progress update (works for both streaming and non-streaming)
function sendStockProgress(res, message, wantsStreaming) {
  if (wantsStreaming && res && !res.writableEnded) {
    sendStreamEvent(res, "progress", { status: message });
  }
  console.log(`📊 [STOCK_PROGRESS] ${message}`);
}

// Helper function to stream text chunks
async function streamTextChunks(res, text, chunkSize = 15) {
  if (!text || typeof text !== "string") return;

  const words = text.split(" ");
  let currentChunk = "";

  for (let i = 0; i < words.length; i++) {
    currentChunk += (currentChunk ? " " : "") + words[i];

    // Send chunk when we reach chunkSize words or at the end
    if (currentChunk.split(" ").length >= chunkSize || i === words.length - 1) {
      // CRITICAL: Add trailing space if there are more words coming
      // This ensures word boundaries are preserved when chunks are concatenated
      if (i < words.length - 1) {
        currentChunk += " ";
      }

      sendStreamEvent(res, "text_chunk", { text: currentChunk });
      currentChunk = "";

      // Tiny delay for smooth streaming (network latency provides natural delay)
      await delay(20 + Math.random() * 30);
    }
  }
}

async function limitedBraveSearch(query) {
  return webSearchService.limitedSearch(query);
}

// === Stocks via Finnhub ===
function looksLikeStockQuery(message, classificationResult = null) {
  // Rely solely on classification - no rigid detection
  return classificationResult?.intent === "stock_query";
}

async function planStockRequest(message) {
  return stockAnalysisService.planStockRequest(message);
}

async function executeStockPlan(
  plan,
  message,
  res = null,
  wantsStreaming = false,
) {
  return stockAnalysisService.executeStockPlan(plan, message, {
    sendProgress: (status) => sendStockProgress(res, status, wantsStreaming),
  });
}

async function generateConversationalStockResponse(
  stockData,
  userMessage,
  userProfile,
  userMemory,
  investmentHoldings,
  stockPlan = null,
) {
  // Always generate comprehensive analysis using LLM for all stock queries
  console.log(`\n🔍 [STOCK_ANALYSIS] ========================================`);
  console.log(
    `🔍 [STOCK_ANALYSIS] Generating comprehensive analysis for ${stockData.ticker}`,
  );
  console.log(`🔍 [STOCK_ANALYSIS] User message: "${userMessage}"`);
  console.log(
    `🔍 [STOCK_ANALYSIS] Stock data available: current=${
      stockData.current
    }, hasProfile=${!!stockData.profile}, hasMetrics=${!!stockData.metrics}`,
  );

  // Build the base summary with all available data
  const baseSummary = stockAnalysisService.buildStockDataSummary(
    stockData,
    stockPlan,
  );

  // Format stock data for LLM context
  const stockDataContext = {
    ticker: stockData.ticker,
    name: stockData.profile?.name || stockData.ticker,
    currentPrice: stockData.current,
    change: stockData.change,
    changePercent: stockData.changePercent,
    high: stockData.high,
    low: stockData.low,
    prevClose: stockData.prevClose,
    open: stockData.open,
    industry: stockData.profile?.finnhubIndustry,
    marketCap: stockData.profile?.marketCapitalization,
    employees: stockData.profile?.employeeTotal,
    description: stockData.profile?.description,
    peRatio:
      stockData.metrics?.peBasicExclExtraTTM || stockData.metrics?.peBasicTTM,
    psRatio: stockData.metrics?.psTTM,
    recommendations: stockData.recommendations?.[0] || null,
    news: (stockData.news || []).map((n) => {
      // Finnhub company-news API returns 'url' field which is often a Finnhub API endpoint
      // We need to check if it's an actual article URL or an API endpoint
      // Some news items may have the actual article URL, others may only have API endpoints
      let articleUrl = null;

      // Check if url exists and is not a Finnhub API endpoint
      if (n.url && typeof n.url === "string") {
        // Finnhub API endpoints typically contain '/api/news' or are finnhub.io domains
        if (
          !n.url.includes("finnhub.io/api/news") &&
          !n.url.includes("finnhub.io/api/v1") &&
          (n.url.startsWith("http://") || n.url.startsWith("https://"))
        ) {
          articleUrl = n.url;
        }
      }

      // Log for debugging if no URL found
      if (!articleUrl && n.headline) {
        console.log(
          `[STOCK_ANALYSIS] News item "${n.headline.substring(
            0,
            50,
          )}..." has no valid article URL. Available fields:`,
          Object.keys(n),
        );
      }

      return {
        ...n,
        articleUrl: articleUrl, // Store the actual article URL separately
      };
    }),
    earnings: stockData.extra?.earnings || null,
    filings: stockData.extra?.filings || null,
    insider: stockData.extra?.insider || null,
  };

  // Build comprehensive analysis prompt
  const analysisPrompt = `You are a financial analyst providing comprehensive stock analysis. Based on the following stock data for ${
    stockDataContext.ticker
  }, provide a detailed, comprehensive analysis.

Stock Data:
- Company: ${stockDataContext.name} (${stockDataContext.ticker})
- Current Price: $${stockDataContext.currentPrice || "N/A"}${
    stockDataContext.changePercent
      ? ` (${
          stockDataContext.changePercent > 0 ? "+" : ""
        }${stockDataContext.changePercent.toFixed(2)}%)`
      : ""
  }
- Industry: ${stockDataContext.industry || "N/A"}
${
  stockDataContext.marketCap
    ? `- Market Cap: $${stockDataContext.marketCap.toLocaleString()}`
    : ""
}
${
  stockDataContext.peRatio
    ? `- P/E Ratio: ${stockDataContext.peRatio.toFixed(2)}`
    : ""
}
${
  stockDataContext.psRatio
    ? `- P/S Ratio: ${stockDataContext.psRatio.toFixed(2)}`
    : ""
}
${
  stockDataContext.recommendations
    ? `- Analyst Recommendations: ${
        stockDataContext.recommendations.strongBuy || 0
      } Strong Buy, ${stockDataContext.recommendations.buy || 0} Buy, ${
        stockDataContext.recommendations.hold || 0
      } Hold, ${stockDataContext.recommendations.sell || 0} Sell, ${
        stockDataContext.recommendations.strongSell || 0
      } Strong Sell`
    : ""
}
${
  stockDataContext.description
    ? `- Company Description: ${stockDataContext.description.substring(0, 500)}`
    : ""
}
${
  stockDataContext.news && stockDataContext.news.length > 0
    ? `- Recent News (IMPORTANT: Use ONLY the article URLs provided below. If "URL not available", omit the URL entirely):
${stockDataContext.news
  .slice(0, 5)
  .map((n, idx) => {
    const articleUrl = n.articleUrl || null;
    // Only include URL if we have a valid article URL
    if (articleUrl) {
      return `  ${idx + 1}. ${n.headline} - Article URL: ${articleUrl}`;
    } else {
      return `  ${idx + 1}. ${
        n.headline
      } - URL not available (do NOT include any URL for this item)`;
    }
  })
  .join("\n")}`
    : ""
}

User Query: ${userMessage}

Provide a comprehensive, structured stock analysis using bullet points for easy reading. Format as follows:

**Current Market Position**
• Current price: $[price] ([change]%)
• Day range: $[low] - $[high]
• Brief performance note (1-2 sentences max)

**Financial Metrics**
• P/E Ratio: [value] - [brief interpretation]
• P/S Ratio: [value] - [brief interpretation]
• Other key metrics if available

**Valuation Assessment**
• Market Cap: $[value]
• Company size classification (large/mid/small cap)
• Valuation context (1-2 bullet points)

**Analyst Sentiment**
• [X] Strong Buy, [Y] Buy, [Z] Hold, [A] Sell, [B] Strong Sell
• Overall sentiment summary (2 bullet point)

**Recent Developments**
• [News headline 1] - [ONLY include URL if provided in news data above, otherwise omit URL]
• [News headline 2] - [ONLY include URL if provided in news data above, otherwise omit URL]
• [News headline 3] - [ONLY include URL if provided in news data above, otherwise omit URL]
CRITICAL: 
- Use ONLY the article URLs explicitly provided in the "Recent News" section above
- If a news item shows "URL not available", include ONLY the headline without any URL
- Format as: "Headline - https://actual-url.com" (only if URL was provided)
- Do NOT use placeholder URLs like "example.com" or "https://example.com"
- Do NOT use markdown link format [text](url)
- Do NOT use Finnhub API endpoint URLs (finnhub.io/api/news)
- Do NOT invent or guess URLs

**Investment Considerations**
• Opportunities (2-3 bullet points)
• Risks (2-3 bullet points)

**Industry Context**
• Industry: [industry name]
• Market position (1-2 bullet points)

**Summary**
• [2-3 sentence overall assessment]

CRITICAL FORMATTING REQUIREMENTS:
- Use bullet points (•) for ALL content, NOT paragraphs
- Keep each bullet point concise (1-2 sentences max)
- For news URLs: Use the ACTUAL article URLs provided in the news data above, formatted as plain URLs (e.g., https://actual-domain.com/article)
- Format news items as: "Headline - [actual URL from news data]"
- Do NOT use placeholder URLs like "example.com" or "https://example.com"
- Do NOT use markdown link format [text](url)
- Do NOT use Finnhub API endpoint URLs (finnhub.io/api/news?id=...)
- Use bold section headers (**Section Name**)
- Be data-driven and specific
- Keep total length under 2000 words but comprehensive`;

  try {
    // Check if API key is available
    if (!process.env.OPENROUTER_API_KEY) {
      console.error(
        "❌ [STOCK_ANALYSIS] OPENROUTER_API_KEY not found, falling back to summary",
      );
      console.log(
        `⚠️ [STOCK_ANALYSIS] Falling back to base summary (no API key)`,
      );
      return baseSummary;
    }

    const STOCK_ANALYSIS_MODEL = STANDARD_MODEL;

    console.log(
      `🔍 [STOCK_ANALYSIS] Calling LLM API with model: ${STOCK_ANALYSIS_MODEL}`,
    );
    const llmStartTime = Date.now();

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: STOCK_ANALYSIS_MODEL,
          temperature: 0.3,
          max_tokens: 8000, // Allow comprehensive analysis responses
          messages: [
            {
              role: "system",
              content:
                "You are a financial analyst providing comprehensive stock analysis. ALWAYS format responses using bullet points (•) for easy reading. For news URLs, use the ACTUAL article URLs provided in the user's stock data, formatted as plain URLs (e.g., https://actual-domain.com/article). Format news items as: 'Headline - [actual URL from provided news data]'. Do NOT use placeholder URLs like 'example.com'. Do NOT use markdown link format [text](url). Keep each bullet point concise (1-2 sentences max). Use bold section headers. Be specific, data-driven, and actionable.",
            },
            { role: "user", content: analysisPrompt },
          ],
        }),
      },
    );

    const llmDuration = Date.now() - llmStartTime;
    console.log(
      `🔍 [STOCK_ANALYSIS] LLM API response received in ${llmDuration}ms (status: ${response.status})`,
    );

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;

      // Check if response was truncated
      if (finishReason === "length") {
        console.warn(
          "⚠️ [STOCK_ANALYSIS] Comprehensive analysis response was truncated due to token limit",
        );
      }

      if (content && content.trim()) {
        console.log(
          `✅ [STOCK_ANALYSIS] Generated comprehensive analysis (length: ${content.length} chars, duration: ${llmDuration}ms)`,
        );
        return content;
      } else {
        console.error(
          "❌ [STOCK_ANALYSIS] LLM returned empty content. Response data:",
          JSON.stringify(data, null, 2).substring(0, 500),
        );
      }
    } else {
      const errorText = await response
        .text()
        .catch(() => "Unable to read error");
      console.error(
        `❌ [STOCK_ANALYSIS] LLM API request failed: ${response.status} ${response.statusText}`,
      );
      console.error(
        `❌ [STOCK_ANALYSIS] Error details: ${errorText.substring(0, 500)}`,
      );
    }
  } catch (error) {
    console.error("❌ [STOCK_ANALYSIS] Analysis generation failed:", error);
    console.error("❌ [STOCK_ANALYSIS] Error stack:", error.stack);
  }

  // Fallback to base summary if LLM fails
  console.log(`⚠️ [STOCK_ANALYSIS] Falling back to base summary`);
  return baseSummary;
}

// Fallback function for when stock APIs fail
async function generateFallbackStockAnalysis(
  ticker,
  userMessage,
  userProfile,
  userMemory,
) {
  return stockAnalysisService.generateFallbackStockAnalysis(
    ticker,
    userMessage,
  );
}

function generateTrainingDataStockAnalysis(ticker, userMessage) {
  return stockAnalysisService.generateTrainingDataStockAnalysis(
    ticker,
    userMessage,
  );
}

// Cache clearing functions

async function forceRefreshUserData(userId) {
  try {
    // Clear relevant rows in Postgres web_scrape_cache for this user (prefix match)
    try {
      const prefixes = [
        "user_summary",
        "enhanced_merchant",
        "web_research",
        "stock_snapshot",
        "brave_search",
      ];
      for (const prefix of prefixes) {
        const { error } = await supabase
          .from("web_scrape_cache")
          .delete()
          .like("cache_key", `${prefix}_${userId}%`);
        if (error) {
          // Failed to clear cache prefix
        }
      }
    } catch (e) {
      // Postgres cache purge skipped
    }

    // Use our new smart cache invalidation
    try {
      await invalidateUserCache(userId);
    } catch (e) {
      // Smart cache invalidation skipped
    }
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in forceRefreshUserData:", error);
    return false;
  }
}

// === NET WORTH DATA FUNCTIONS ===
// Helper function to format currency for net worth display
function formatNetWorthCurrency(amount) {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}K`;
  } else {
    return `$${amount.toFixed(0)}`;
  }
}

// Fetch and cache net worth data
async function getNetWorthData(userId) {
  if (!userId) {
    console.log("❌ [NET_WORTH] No userId provided");
    return null;
  }

  // Check cache first
  const cached = await getCachedUserData("net_worth", userId);
  if (cached) {
    console.log("✅ [NET_WORTH] Using cached net worth data");
    return cached;
  }

  try {
    console.log("📊 [NET_WORTH] Fetching net worth data for user:", userId);

    const { data: netWorthData, error } = await dataFetchService.getNetWorth(
      userId,
      3000,
    );

    if (error) {
      console.error("❌ [NET_WORTH] Error fetching net worth:", error);
      return null;
    }

    if (!netWorthData || netWorthData.length === 0) {
      console.log("⚠️ [NET_WORTH] No net worth data found");
      return null;
    }

    const netWorth = netWorthData[0]; // get_net_worth returns array with single object

    // Log raw RPC response for debugging
    // console.log(
    //   "📊 [NET_WORTH] Raw RPC response:",
    //   JSON.stringify(netWorth, null, 2)
    // );

    // Process and format the data
    const processedData = {
      liquid_assets: netWorth.liquid_assets || 0,
      investments_total: netWorth.investments_total || 0,
      total_liabilities: netWorth.total_liabilities || 0,
      net_worth: netWorth.net_worth || 0,
      bank_accounts: Array.isArray(netWorth.bank_accounts)
        ? netWorth.bank_accounts
        : [],
      summary: {
        total_assets:
          (netWorth.liquid_assets || 0) + (netWorth.investments_total || 0),
        total_liabilities: netWorth.total_liabilities || 0,
        net_worth: netWorth.net_worth || 0,
      },
      formatted: {
        liquid_assets: formatNetWorthCurrency(netWorth.liquid_assets || 0),
        investments_total: formatNetWorthCurrency(
          netWorth.investments_total || 0,
        ),
        total_liabilities: formatNetWorthCurrency(
          netWorth.total_liabilities || 0,
        ),
        net_worth: formatNetWorthCurrency(netWorth.net_worth || 0),
      },
    };

    // Cache the processed data
    await setCachedUserData("net_worth", userId, processedData);
    console.log("💾 [NET_WORTH] Cached net worth data");

    return processedData;
  } catch (error) {
    console.error("❌ [NET_WORTH] Error in getNetWorthData:", error);
    return null;
  }
}

export {
  loadUserMemory,
  generateFallbackStockAnalysis,
  generateTrainingDataStockAnalysis,
  getNetWorthData,
  formatNetWorthCurrency,
  handleAsk,
  handleClassify,
  handleOffTopic,
};
