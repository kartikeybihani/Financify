// core/finny/services/ClassificationService.js
// Classification service with caching and LLM fallback
// Extracted from api/finny.js lines 6154-6871 + cache functions (946-1053)

import { logDebug, logInfo, logWarn, logError } from '../utils/logging.js';
import { 
  CLASSIFICATION_CACHE_TTL, 
  CLASSIFICATION_CACHE_MAX_SIZE 
} from '../utils/constants/cacheConfig.js';
import { 
  CLASSIFICATION_MODEL,
  CLASSIFICATION_FALLBACK_MODEL,
  getOpenRouterKey 
} from '../utils/constants/modelConfig.js';
import { LLMService } from '../infrastructure/llm/LLMService.js';

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
  generateCacheKey(message) {
    // Normalize the message for better cache hits
    const normalized = message
      .toLowerCase()
      .trim()
      // Remove common variations
      .replace(/\b(i|me|my|mine)\b/g, "USER")
      .replace(/\b(last month|this month|december|january|etc)\b/g, "PERIOD")
      .replace(/\$\d+/g, "AMOUNT")
      .replace(/\d+/g, "NUMBER");

    return normalized;
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
  getCached(message) {
    const key = this.generateCacheKey(message);
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
  setCached(message, result) {
    const key = this.generateCacheKey(message);
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

  /**
   * Classify a user message
   * @param {string} message - User message to classify
   * @param {object} context - User context
   * @returns {Promise<object>} Classification result
   */
  async classify(message, _context) {
    logInfo("🔍 [FINNY] Starting classification...");
    const startTime = Date.now();

    // Check cache first
    const cached = this.getCached(message);
    if (cached) {
      const duration = Date.now() - startTime;
      logInfo(`✅ [FINNY] Classification from cache (${duration}ms)`);
      return cached;
    }

    logInfo("🔍 [FINNY] Cache miss, calling LLM for classification...");

    // Import getClassificationPrompt dynamically to avoid circular dependency
    const { getClassificationPrompt } = await import('../../../lib/prompt_engine.js');

    // Call classification LLM with fallback
    const models = [
      CLASSIFICATION_MODEL,
      CLASSIFICATION_FALLBACK_MODEL,
    ].filter(Boolean);

    if (models.length === 0) {
      logWarn("⚠️ [CLASSIFICATION] No models configured, using heuristic fallback");
      return {
        intent: "ask_personalized",
        intent_type: "exploratory",
        needs_user_data: true,
        decision_risk: "low",
        data_requirements: {
          required_packs: ["summary_min"],
          optional_packs: [],
          filters: {},
        },
        heuristic: true,
        fallback: true,
      };
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
                    content: getClassificationPrompt(),
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
          let parsed;
          try {
            // Try to extract JSON from markdown code blocks if present
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            const jsonStr = jsonMatch ? jsonMatch[1] : content;
            parsed = JSON.parse(jsonStr);
          } catch (_parseError) {
            logError("❌ [CLASSIFICATION] Failed to parse LLM response:", content);
            throw new Error("Invalid classification JSON from LLM");
          }

          return parsed;
        },
        8000, // 8 second timeout
        "Classification",
      );

      classificationResult = llmResult.result;
    } catch (error) {
      logError("❌ [CLASSIFICATION] All classification attempts failed:", error?.message);
      
      // Return a safe fallback classification
      return {
        intent: "ask_personalized",
        intent_type: "exploratory",
        needs_user_data: true,
        decision_risk: "low",
        data_requirements: {
          required_packs: ["summary_min"],
          optional_packs: [],
          filters: {},
        },
        heuristic: true, // Mark as heuristic fallback
        fallback: true,
      };
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
    if (!classificationResult.decision_risk) {
      classificationResult.decision_risk = "low";
    }

    // Cache the result
    this.setCached(message, classificationResult);

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
