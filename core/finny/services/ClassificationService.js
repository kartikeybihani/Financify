// core/finny/services/ClassificationService.js
// Classification service with caching and LLM fallback
// Extracted from api/finny.js lines 6154-6871 + cache functions (946-1053)

import { logDebug, logInfo, logWarn, logError } from "../utils/logging.js";
import {
  CLASSIFICATION_CACHE_TTL,
  CLASSIFICATION_CACHE_MAX_SIZE,
} from "../utils/constants/cacheConfig.js";
import {
  CLASSIFICATION_MODEL,
  CLASSIFICATION_FALLBACK_MODEL,
  getOpenRouterKey,
} from "../utils/constants/modelConfig.js";
import { LLMService } from "../infrastructure/llm/LLMService.js";
import {
  isComplaintLikeMessage,
  isReferentialFollowupMessage,
} from "./ContinuityService.js";

function looksLikeFactualLookup(message = "") {
  const lower = String(message).toLowerCase();
  return (
    /\b(how much|how many|what is my|what's my|show me|did i spend|spent this month|spent last month)\b/.test(
      lower,
    ) && !/\b(should i|can i afford|worth it|help me decide)\b/.test(lower)
  );
}

function canonicalizeDataRequirements(
  dataRequirements,
  needsUserData,
  message = "",
) {
  if (!needsUserData) return null;

  const dr =
    dataRequirements && typeof dataRequirements === "object"
      ? { ...dataRequirements }
      : {};

  const allowedPacks = new Set([
    "summary_min",
    "spend_total",
    "category_details",
    "merchant_breakdown",
    "invest_holdings",
    "goals_overview",
  ]);
  const required = Array.isArray(dr.required_packs) ? dr.required_packs : [];
  const optional = Array.isArray(dr.optional_packs) ? dr.optional_packs : [];

  const normalizedRequired = Array.from(
    new Set(required.filter((pack) => allowedPacks.has(pack))),
  );
  if (!normalizedRequired.includes("summary_min")) {
    normalizedRequired.unshift("summary_min");
  }

  const normalizedOptional = Array.from(
    new Set(optional.filter((pack) => allowedPacks.has(pack))),
  ).filter((pack) => !normalizedRequired.includes(pack));

  const allowedGranularity = new Set([
    "summary_level",
    "transaction_level",
    "category_level",
  ]);
  const granularity = allowedGranularity.has(dr.granularity)
    ? dr.granularity
    : "summary_level";

  const allowedTimeRange = new Set([
    "current",
    "1_month",
    "3_months",
    "6_months",
    "1_year",
    "all_time",
  ]);
  const time_range = allowedTimeRange.has(dr.time_range)
    ? dr.time_range
    : looksLikeFactualLookup(message)
      ? "1_month"
      : "current";

  const filters =
    dr.filters && typeof dr.filters === "object" ? dr.filters : {};

  return {
    required_packs: normalizedRequired,
    optional_packs: normalizedOptional,
    filters: {
      merchant:
        typeof filters.merchant === "string" ? filters.merchant.trim() : null,
      category:
        typeof filters.category === "string" ? filters.category.trim() : null,
      period:
        filters.period && typeof filters.period === "object"
          ? filters.period
          : null,
    },
    granularity,
    time_range,
  };
}

function extractJSONObject(content = "") {
  const trimmed = String(content).trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = fencedMatch?.[1]?.trim() || trimmed;
  const start = source.indexOf("{");

  if (start === -1) return source;

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return source;
}

/**
 * ClassificationService handles message classification with intelligent caching
 */
export class ClassificationService {
  constructor(classificationCache) {
    this.cache = classificationCache;
    this.llmService = new LLMService();
  }

  /**
   * Generate a normalized cache key for classification
   * @param {string} message - User message
   * @returns {string} Normalized cache key
   */
  generateCacheKey(message, context = {}) {
    // Normalize the message for better cache hits
    const normalized = message
      .toLowerCase()
      .trim()
      // Remove common variations
      .replace(/\b(i|me|my|mine)\b/g, "USER")
      .replace(/\b(last month|this month|december|january|etc)\b/g, "PERIOD")
      .replace(/\$\d+/g, "AMOUNT")
      .replace(/\d+/g, "NUMBER");

    const hint = context?.classification_hint || null;
    if (!hint) return normalized;

    const needsContextSignature =
      normalized.length <= 16 ||
      isComplaintLikeMessage(message) ||
      isReferentialFollowupMessage(message);

    if (!needsContextSignature) return normalized;

    return [
      normalized,
      `fin:${hint.same_chat_last_turn_was_finance_advice ? 1 : 0}`,
      `contract:${hint.previous_contract || ""}`,
      `subject:${hint.previous_subject || ""}`,
    ].join("|");
  }

  shouldBypassCache(message) {
    const text = String(message || "").trim();
    if (!text) return true;
    return (
      text.length <= 16 ||
      isComplaintLikeMessage(text) ||
      isReferentialFollowupMessage(text)
    );
  }

  /**
   * Clear all heuristic cache entries
   * @returns {number} Number of entries cleared
   */
  clearHeuristicEntries() {
    let cleared = 0;
    const keysToDelete = [];

    // First pass: collect keys to delete
    for (const [key, value] of this.cache.entries()) {
      const result = value?.result;
      if (result && result.hasOwnProperty("heuristic")) {
        const isHeuristic =
          result.heuristic === true ||
          result.heuristic === "true" ||
          result.heuristic === 1 ||
          result.heuristic === "1";
        if (isHeuristic) {
          keysToDelete.push(key);
          cleared++;
        }
      }
    }

    // Second pass: delete collected keys
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    return cleared;
  }

  /**
   * Get cached classification result
   * @param {string} message - User message
   * @returns {object|null} Cached result or null
   */
  getCached(message, context = {}) {
    if (this.shouldBypassCache(message)) return null;
    const key = this.generateCacheKey(message, context);
    const cached = this.cache.get(key);

    if (cached && Date.now() < cached.expires_at) {
      console.log(
        `✅ [CACHE] Classification cache HIT for: "${message.substring(
          0,
          50,
        )}..."`,
      );
      return cached.result;
    }

    if (cached) {
      console.log(
        `⏰ [CACHE] Classification cache EXPIRED for: "${message.substring(
          0,
          50,
        )}..."`,
      );
      this.cache.delete(key);
    }

    return null;
  }

  /**
   * Set cached classification result
   * @param {string} message - User message
   * @param {object} result - Classification result
   */
  setCached(message, result, context = {}) {
    if (this.shouldBypassCache(message)) return;
    const key = this.generateCacheKey(message, context);
    const expires_at = Date.now() + CLASSIFICATION_CACHE_TTL;

    // Enforce max size: remove oldest entries if at capacity
    if (this.cache.size >= CLASSIFICATION_CACHE_MAX_SIZE) {
      // Delete oldest entry (first in Map iteration order)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      result,
      expires_at,
      cached_at: Date.now(),
    });

    logDebug(
      `💾 [CACHE] Classification cached for: "${message.substring(
        0,
        50,
      )}..." (expires in 1 hour)`,
    );

    // Clean up expired entries periodically (every 100 cache writes)
    if (this.cache.size % 100 === 0) {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now >= value.expires_at) {
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Canonicalize intent type to standard values
   * @param {string} intentType - Raw intent type from LLM
   * @param {string} message - User message for context
   * @returns {string} Canonicalized intent type
   */
  canonicalizeIntentType(intentType, message = "") {
    if (!intentType || typeof intentType !== "string") return "exploratory";

    const lower = intentType.toLowerCase().trim();

    // Map known variations to canonical values
    if (lower === "factual" || lower === "fact" || lower === "fact-based") {
      return "factual";
    }
    if (
      lower === "exploratory" ||
      lower === "explore" ||
      lower === "exploration"
    ) {
      return "exploratory";
    }
    if (
      lower === "actionable" ||
      lower === "action" ||
      lower === "action-oriented"
    ) {
      return "actionable";
    }
    if (lower === "planning" || lower === "plan" || lower === "strategic") {
      return "planning";
    }
    if (
      lower === "educational" ||
      lower === "education" ||
      lower === "learning"
    ) {
      return "educational";
    }

    // Heuristic fallback based on message content
    const lowerMessage = String(message).toLowerCase();

    // Factual indicators
    if (
      /\b(how much|what is|what's|how many|did i|have i)\b/.test(lowerMessage)
    ) {
      return "factual";
    }

    // Actionable indicators
    if (
      /\b(should i|can i|do i need to|help me|what do i do)\b/.test(
        lowerMessage,
      )
    ) {
      return "actionable";
    }

    // Planning indicators
    if (
      /\b(plan|goal|strategy|prepare|budget|save for|invest for)\b/.test(
        lowerMessage,
      )
    ) {
      return "planning";
    }

    // Educational indicators
    if (
      /\b(what is|how does|explain|tell me about|learn|understand)\b/.test(
        lowerMessage,
      )
    ) {
      return "educational";
    }

    // Default to exploratory
    return "exploratory";
  }

  buildFallbackClassification() {
    return {
      intent: "ask_personalized",
      intent_type: "exploratory",
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      needs_clarification: false,
      info_sufficiency: "unknown",
      missing_fields: [],
      decision_risk: "low",
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.5,
      data_requirements: {
        required_packs: ["summary_min"],
        optional_packs: [],
        filters: {
          merchant: null,
          category: null,
          period: null,
        },
        granularity: "summary_level",
        time_range: "current",
      },
      heuristic: true,
      fallback: true,
    };
  }

  /**
   * Classify a user message
   * @param {string} message - User message to classify
   * @param {object} context - User context
   * @returns {Promise<object>} Classification result
   */
  async classify(message, context = {}) {
    logInfo("🔍 [FINNY] Starting classification...");
    const startTime = Date.now();

    // Check cache first
    const cached = this.getCached(message, context);
    if (cached) {
      const duration = Date.now() - startTime;
      logInfo(`✅ [FINNY] Classification from cache (${duration}ms)`);
      return cached;
    }

    logInfo("🔍 [FINNY] Cache miss, calling LLM for classification...");

    // Import getClassificationPrompt dynamically to avoid circular dependency
    const { getClassificationPrompt } =
      await import("../../../lib/prompt_engine.js");

    // Call classification LLM with fallback
    const models = [CLASSIFICATION_MODEL, CLASSIFICATION_FALLBACK_MODEL].filter(
      Boolean,
    );

    if (models.length === 0) {
      logWarn(
        "⚠️ [CLASSIFICATION] No models configured, using heuristic fallback",
      );
      return this.buildFallbackClassification();
    }

    let classificationResult;
    try {
      const llmResult = await this.llmService.callWithFallback(
        models,
        async (model, options) => {
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
                temperature: 0.2,
                max_tokens: 1500,
                stream: false,
                messages: [
                  {
                    role: "system",
                    content: getClassificationPrompt({
                      contextHint: context?.classification_hint || null,
                    }),
                  },
                  {
                    role: "user",
                    content: message,
                  },
                ],
              }),
            },
          );

          if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(
              `OpenRouter classification error ${resp.status}: ${errorText}`,
            );
          }

          const data = await resp.json();
          const content = data?.choices?.[0]?.message?.content;

          if (!content) {
            throw new Error("No classification result from LLM");
          }

          // Parse JSON from LLM response
          console.log("🔍 [CLASSIFICATION] LLM response:", content);
          let parsed;
          try {
            const jsonStr = extractJSONObject(content);

            parsed = JSON.parse(jsonStr.trim());

            if (!parsed || typeof parsed !== "object") {
              throw new Error("Classification result must be a JSON object");
            }

            parsed.intent =
              typeof parsed.intent === "string"
                ? parsed.intent
                : "ask_personalized";
            parsed.intent_type = this.canonicalizeIntentType(
              parsed.intent_type,
              message,
            );
            parsed.emotional_state =
              typeof parsed.emotional_state === "string"
                ? parsed.emotional_state
                : "neutral";
            parsed.needs_web = parsed.needs_web === true;
            if (parsed.needs_user_data === undefined) {
              parsed.needs_user_data = parsed.intent !== "off_topic";
            } else {
              parsed.needs_user_data = parsed.needs_user_data === true;
            }
            parsed.needs_clarification = parsed.needs_clarification === true;
            parsed.info_sufficiency = new Set([
              "sufficient",
              "missing",
              "unknown",
            ]).has(parsed.info_sufficiency)
              ? parsed.info_sufficiency
              : "unknown";
            parsed.missing_fields = Array.isArray(parsed.missing_fields)
              ? parsed.missing_fields
              : [];
            parsed.decision_risk = new Set([
              "low",
              "medium",
              "high",
              "unknown",
            ]).has(parsed.decision_risk)
              ? parsed.decision_risk
              : "low";
            parsed.state =
              typeof parsed.state === "string" ? parsed.state : null;
            parsed.entities = Array.isArray(parsed.entities)
              ? parsed.entities
              : [];
            parsed.ticker =
              typeof parsed.ticker === "string" ? parsed.ticker : null;
            parsed.confidence =
              typeof parsed.confidence === "number" &&
              Number.isFinite(parsed.confidence)
                ? Math.max(0, Math.min(1, parsed.confidence))
                : 0.7;
            parsed.data_requirements = canonicalizeDataRequirements(
              parsed.data_requirements,
              parsed.needs_user_data === true,
              message,
            );
          } catch (parseError) {
            logError(
              "❌ [CLASSIFICATION] Failed to parse LLM response:",
              content,
            );
            logError("❌ [CLASSIFICATION] Parse error:", parseError?.message);
            throw new Error("Invalid classification JSON from LLM");
          }

          return parsed;
        },
        8000, // 8 second timeout
        "Classification",
      );

      classificationResult = llmResult.result;
    } catch (error) {
      logError(
        "❌ [CLASSIFICATION] All classification attempts failed:",
        error?.message,
      );

      // Return a safe fallback classification
      return this.buildFallbackClassification();
    }

    // Canonicalize intent_type
    if (classificationResult.intent_type) {
      classificationResult.intent_type = this.canonicalizeIntentType(
        classificationResult.intent_type,
        message,
      );
    }

    // Ensure required fields exist
    if (!classificationResult.intent) {
      classificationResult.intent = "ask_personalized";
    }
    if (!classificationResult.intent_type) {
      classificationResult.intent_type = "exploratory";
    }
    if (classificationResult.needs_user_data === undefined) {
      classificationResult.needs_user_data = true;
    }
    if (classificationResult.needs_web === undefined) {
      classificationResult.needs_web = false;
    }
    if (classificationResult.needs_clarification === undefined) {
      classificationResult.needs_clarification = false;
    }
    if (!classificationResult.info_sufficiency) {
      classificationResult.info_sufficiency = "unknown";
    }
    if (!Array.isArray(classificationResult.missing_fields)) {
      classificationResult.missing_fields = [];
    }
    if (!classificationResult.decision_risk) {
      classificationResult.decision_risk = "low";
    }
    classificationResult.data_requirements = canonicalizeDataRequirements(
      classificationResult.data_requirements,
      classificationResult.needs_user_data === true,
      message,
    );

    // Cache the result
    this.setCached(message, classificationResult, context);

    const duration = Date.now() - startTime;
    logInfo(`✅ [FINNY] Classification complete (${duration}ms)`);
    logInfo("📊 [FINNY] Classification result:", {
      intent: classificationResult.intent,
      intent_type: classificationResult.intent_type,
      needs_user_data: classificationResult.needs_user_data,
      decision_risk: classificationResult.decision_risk,
    });

    return classificationResult;
  }
}
