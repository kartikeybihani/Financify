// api/finny.js
import { supabase } from "../lib/api/supabase.js";
import fetch from "node-fetch";
import crypto from "crypto";
import { handleGoalConversation } from "./goals.js";
import { braveSearch } from "../lib/websearch/brave.js";
import {
  resolveTickerForQuery,
  fetchStockSnapshot,
  buildStockDataSummary,
  fetchJson,
  detectStockCandidate,
} from "../lib/stocks.js";
import {
  getSessionState,
  setSessionState,
  mergeSessionState,
  getConversationContext,
  updateConversationContext,
  invalidateProfileCache,
  loadUserMemory,
  loadUserProfile,
  storeConversationMemory,
  retrieveFeedbackPatterns,
  buildFeedbackContext,
  setPrebuildContextActive,
  clearPrebuildContextActive,
  fetchSupermemoryProfile,
  // saveMemoryCandidates removed - migrating to Supermemory
  // generateMemorySummary removed - migrating to Supermemory
  // validateMemoriesWithSmallModel removed - migrating to Supermemory
  // selectRelevantMemories removed - Supermemory handles relevance ranking
  // categorizeSelectedMemories removed - no longer needed with Supermemory format
} from "../lib/memoryUtils.js";
import {
  detectUserState,
  buildContextAwarePrompt,
} from "../lib/prompt_engine.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

// Simple log level mechanism for controlling verbosity
const LOG_LEVEL =
  process.env.LOG_LEVEL || process.env.NODE_ENV === "production"
    ? "info"
    : "debug";
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CURRENT_LOG_LEVEL =
  LOG_LEVELS[LOG_LEVEL] !== undefined ? LOG_LEVELS[LOG_LEVEL] : LOG_LEVELS.info;

function logDebug(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.debug) console.log(...args);
}
function logInfo(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.info) console.log(...args);
}
function logWarn(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.warn) console.warn(...args);
}
function logError(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.error) console.error(...args);
}

// Utilities
function generateRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

async function withTimeout(
  promise,
  ms,
  onTimeoutValue = null,
  onTimeout = null
) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      if (typeof onTimeout === "function") {
        try {
          onTimeout();
        } catch {
          // Ignore timeout handler errors.
        }
      }
      resolve(onTimeoutValue);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
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

function detectRefusalToAnswer(text) {
  if (!text || typeof text !== "string") return false;
  return /\b(just tell me|no questions|don't ask|dont ask|stop asking|whatever just answer|idk just answer)\b/i.test(
    text
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

function deterministicChance(seed, probability = 0.5) {
  try {
    const p = typeof probability === "number" ? probability : 0.5;
    const clamped = Math.max(0, Math.min(1, p));
    const hash = crypto
      .createHash("sha256")
      .update(String(seed || ""))
      .digest("hex");
    const first8 = parseInt(hash.slice(0, 8), 16);
    const bucket = first8 % 100;
    return bucket < Math.round(clamped * 100);
  } catch {
    return Math.random() < probability;
  }
}

function buildClarificationMessage(message, classificationResult) {
  const missing = Array.isArray(classificationResult?.missing_fields)
    ? classificationResult.missing_fields
    : [];

  const decisionRisk = classificationResult?.decision_risk || "unknown";

  const questionBank = {
    purchase_price:
      "What’s the price (or monthly payment) and when are you trying to do this?",
    timeline: "What’s the timeline (this month vs 6–12 months vs later)?",
    location: "Where are you located (state/country)?",
    income_takehome: "What’s your monthly take-home pay?",
    income_gross: "What’s your gross annual income?",
    fixed_expenses:
      "What are your fixed monthly bills (rent/mortgage, utilities, minimum debt payments)?",
    current_savings:
      "How much cash do you have available (checking/savings) for this?",
    debt_balances: "Any debts (credit cards, loans)? Rough balances + APRs?",
    credit_score: "Rough credit score range (e.g., 650–700)?",
    down_payment:
      "How much can you put down (and do you want to keep an emergency fund)?",
    risk_tolerance: "How do you feel about risk: low / medium / high?",
    investing_horizon: "When would you need this money back (time horizon)?",
    goal_amount: "What’s the target amount you’re aiming for?",
    goal_date: "By what date do you want to hit that?",
    move_countries: "Which country are you moving from/to, and when?",
    employer_match: "Do you get an employer match (401k/etc.)?",
  };

  const questions = [];
  for (const key of missing) {
    const q = questionBank[key];
    if (q) questions.push(q);
    if (questions.length >= 3) break;
  }

  if (questions.length === 0) {
    questions.push(
      "Before I give advice: what’s your income, fixed bills, and current cash savings (rough numbers are fine)?"
    );
  }

  const riskLine =
    decisionRisk === "high"
      ? "This is a high-stakes decision, so I don’t want to guess."
      : "Quick questions so I don’t make stuff up.";

  return `${riskLine}\n\n${questions
    .slice(0, 3)
    .map((q, i) => `${i + 1}) ${q}`)
    .join("\n")}\n\nIf you don’t know exact numbers, give rough ranges.`;
}

function hasEnoughInternalDataToProceed(packs, decisionRisk = "unknown") {
  if (!packs || typeof packs !== "object") return false;

  // Base pack is the minimum requirement to say anything grounded.
  const hasBase = !!packs.base && typeof packs.base === "object";
  if (!hasBase) return false;

  // High-stakes decisions should be grounded in BOTH balance sheet basics and actual spending.
  // Otherwise we risk giving advice that sounds confident but isn’t supported by data.
  const hasAccounts =
    Array.isArray(packs.base?.accounts) && packs.base.accounts.length > 0;
  const hasBalanceSheetNumbers = [
    packs.base?.netWorth,
    packs.base?.liquidAssets,
    packs.base?.investmentsTotal,
    packs.base?.totalLiabilities,
  ].some((v) => typeof v === "number" && Number.isFinite(v));

  // For many “can I afford X?” questions, we can proceed if we have NON-EMPTY
  // cashflow or spend context; otherwise we likely need user inputs.
  const cashflowArray = Array.isArray(packs.cashflow?.cashflow)
    ? packs.cashflow.cashflow
    : Array.isArray(packs.cashflow)
    ? packs.cashflow
    : [];
  const hasCashflow =
    cashflowArray.length > 0 &&
    cashflowArray.some(
      (cf) =>
        typeof cf?.income === "number" ||
        typeof cf?.expense === "number" ||
        typeof cf?.net === "number"
    );

  const hasSpend =
    typeof packs.spend?.count === "number" && packs.spend.count > 0;

  // As a last resort, if we have meaningful transaction history we can still
  // offer a cautious best-effort estimate.
  const hasTxns =
    Array.isArray(packs.base?.recentTransactions) &&
    packs.base.recentTransactions.length >= 5;

  if (decisionRisk === "high") {
    return (hasAccounts || hasBalanceSheetNumbers) && hasSpend;
  }

  return hasCashflow || hasSpend || hasTxns;
}

const NON_INFERABLE_MISSING_FIELDS = new Set([
  // Requires user to specify the decision details
  "purchase_price",
  "down_payment",
  "timeline",
  "location",
  "credit_score",
  "risk_tolerance",
  "investing_horizon",
  "goal_amount",
  "goal_date",
  "move_countries",
]);

const FINANCIAL_BASELINE_MISSING_FIELDS = new Set([
  // These are often required for affordability/plan questions unless we have equivalent internal data.
  "income_takehome",
  "fixed_expenses",
  "current_savings",
  "debt_balances",
]);

function isMissingFieldSatisfiedByPacks(field, packs) {
  if (!packs || !packs.base) return false;

  const cashflowArray = Array.isArray(packs.cashflow?.cashflow)
    ? packs.cashflow.cashflow
    : Array.isArray(packs.cashflow)
    ? packs.cashflow
    : [];

  switch (field) {
    case "current_savings":
      return (
        typeof packs.base?.liquidAssets === "number" &&
        Number.isFinite(packs.base.liquidAssets)
      );
    case "debt_balances": {
      if (
        typeof packs.base?.totalLiabilities === "number" &&
        Number.isFinite(packs.base.totalLiabilities)
      ) {
        return true;
      }
      const accounts = Array.isArray(packs.base?.accounts)
        ? packs.base.accounts
        : [];
      return accounts.some((acc) => {
        const type = String(acc?.type || "").toLowerCase();
        const subtype = String(acc?.subtype || "").toLowerCase();
        const balance =
          acc?.balances?.current ?? acc?.current_balance ?? acc?.balance;
        return (
          typeof balance === "number" &&
          (type === "credit" || type === "loan" || subtype.includes("credit"))
        );
      });
    }
    case "income_takehome":
      // Only consider this “known” if cashflow has actual income numbers.
      return cashflowArray.some(
        (cf) => typeof cf?.income === "number" && cf.income > 0
      );
    case "fixed_expenses":
      // We generally can't infer fixed bills reliably from current packs.
      return false;
    default:
      return false;
  }
}

async function callWithFallback(models, callFn, timeoutMs, label = "LLM") {
  let lastErr = null;
  const tried = [];

  for (const model of models) {
    if (!model) continue;
    tried.push(model);
    try {
      const controller = new AbortController();
      const callPromise = Promise.resolve()
        .then(() => callFn(model, { signal: controller.signal }))
        .catch((err) => {
          if (controller.signal.aborted || err?.name === "AbortError") {
            return { __aborted: true };
          }
          throw err;
        });
      const result = await withTimeout(
        callPromise,
        timeoutMs,
        { __timeout: true },
        () => controller.abort()
      );
      if (result && (result.__timeout || result.__aborted)) {
        throw new Error(`${label} timeout after ${timeoutMs}ms`);
      }
      return { result, model };
    } catch (err) {
      lastErr = err;
      logWarn(`⚠️ [FINNY] ${label} failed for model ${model}:`, err?.message);
    }
  }

  const error = lastErr || new Error(`${label} failed for all models`);
  error.modelsTried = tried;
  throw error;
}

function getOpenRouterKey() {
  return process.env.OPENROUTER_GROK_KEY || process.env.OPENROUTER_API_KEY;
}

function redactPII(text) {
  if (!text || typeof text !== "string") return text;
  const combined =
    /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-])[A-Za-z0-9.-]*(\.[A-Za-z]{2,})|(?:\+?1[-.\s]?)?(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})|\b\d{3}-\d{2}-(\d{4})\b|\b(\d{8,})\b|\b(\d{2,})\s+([A-Za-z])/g;
  return text.replace(
    combined,
    (match, e1, e2, e3, p1, p2, p3, ssn4, longNum, addrNum, addrChar) => {
      if (e1 !== undefined && e2 !== undefined && e3 !== undefined) {
        return `${e1}*****@${e2}*****${e3}`;
      }
      if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
        return `***-***-${p3}`;
      }
      if (ssn4 !== undefined) {
        return `***-**-${ssn4}`;
      }
      if (longNum !== undefined) {
        return `****${String(longNum).slice(-4)}`;
      }
      if (addrNum !== undefined && addrChar !== undefined) {
        return `#### ${addrChar}`;
      }
      return match;
    }
  );
}

// Centralized OpenRouter model selection. Prefer paid model if provided.
// Default to a widely available Grok model to avoid invalid ID errors.
const OPENROUTER_PAID_MODEL = process.env.OPENROUTER_PAID_MODEL;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL; // openai/gpt-oss-20b:free
const PRIMARY_OPENROUTER_MODEL = OPENROUTER_PAID_MODEL || OPENROUTER_MODEL;

// Classification models - for intent detection and message classification
// openai/gpt-oss-20b (paid) and openai/gpt-oss-20b:free
const CLASSIFICATION_MODEL_PAID = process.env.CLASSIFICATION_MODEL_PAID; // openai/gpt-oss-20b
const CLASSIFICATION_MODEL_FREE = process.env.CLASSIFICATION_MODEL_FREE; // openai/gpt-oss-20b:free

// Reasoning model for ask_personalized queries
// meta-llama/llama-4-scout
const REASONING_MODEL_PAID_SCOUT = process.env.REASONING_MODEL_PAID_SCOUT; // meta-llama/llama-4-scout

// Memory extraction model - small, fast, free
const SMALLER_MODEL = "meta-llama/llama-3.2-3b-instruct:free";
// Standard non-free model to fallback to when the free model fails
const STANDARD_MODEL = "meta-llama/llama-3.2-3b-instruct";
// Tertiary model for resilience
const TERTIARY_MODEL = "mistralai/mistral-small-3.1-24b-instruct";

// Classification cache - in-memory cache for classification results
const classificationCache = new Map();
const CLASSIFICATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Memory cache - in-memory cache for memory search results (to avoid duplicate loads)
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes - memories can change, but same query within 5min should reuse

// Data cache - in-memory cache for user data with different TTLs
const dataCache = new Map();

// Persistent cache using Supabase for cross-instance sharing
async function getPersistentCache(dataType, userId, params = {}) {
  try {
    const key = generateDataCacheKey(dataType, userId, params);
    logDebug(`🔍 [PERSISTENT_CACHE] Looking for ${dataType} with key: ${key}`);

    // Use .limit(1) to handle potential duplicates and get the most recent one
    const queryPromise = supabase
      .from("context_cache")
      .select("*")
      .eq("cache_key", key)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }) // Get most recent entry first
      .limit(1);

    const queryResult = await withTimeout(queryPromise, 2500, null);
    if (!queryResult) {
      logWarn(`⏰ [PERSISTENT_CACHE] Timeout reading ${dataType} (${key})`);
      return null;
    }
    const { data, error } = queryResult;

    if (error) {
      logError(
        `❌ [PERSISTENT_CACHE] Database error for ${dataType}:`,
        error.message
      );
      return null;
    }

    if (!data || data.length === 0) {
      logDebug(`❌ [PERSISTENT_CACHE] No data found for ${dataType} (${key})`);
      return null;
    }

    const cacheEntry = data[0]; // Get the first (most recent) entry

    // Check if expired
    const now = Date.now();
    logDebug(
      `🔍 [PERSISTENT_CACHE] Checking expiration for ${dataType}: now=${now}, expires=${
        cacheEntry.expires_at
      }, expired=${now > cacheEntry.expires_at}`
    );

    if (now > cacheEntry.expires_at) {
      logDebug(`⏰ [PERSISTENT_CACHE] Cache EXPIRED for ${dataType} (${key})`);
      // Clean up ALL expired entries for this key
      setImmediate(() => {
        cleanupDuplicateCacheEntries(key, userId).catch((error) => {
          logError("❌ [PERSISTENT_CACHE] Cleanup failed:", error);
        });
      });
      return null;
    }

    // If there are duplicates, clean them up in the background
    if (data.length > 1) {
      logDebug(
        `🧹 [PERSISTENT_CACHE] Found ${data.length} duplicate entries, cleaning up...`
      );
      setImmediate(() => {
        cleanupDuplicateCacheEntries(key, userId).catch((error) => {
          logError("❌ [PERSISTENT_CACHE] Cleanup failed:", error);
        });
      });
    }

    logDebug(`✅ [PERSISTENT_CACHE] Cache HIT for ${dataType} (${key})`);
    return cacheEntry.cache_data;
  } catch (error) {
    logError(
      `❌ [PERSISTENT_CACHE] Error getting cache for ${dataType}:`,
      error
    );
    return null;
  }
}

async function setPersistentCache(dataType, userId, data, params = {}) {
  try {
    const key = generateDataCacheKey(dataType, userId, params);
    const ttl = params.ttl || CACHE_TTL[dataType] || 5 * 60 * 1000;
    const expires_at = Date.now() + ttl;

    logDebug(
      `💾 [PERSISTENT_CACHE] Setting cache for ${dataType} with key: ${key}, expires: ${new Date(
        expires_at
      ).toISOString()}, TTL: ${ttl}ms`
    );

    // First, delete any existing entries with the same cache_key and user_id (best-effort)
    const deletePromise = supabase
      .from("context_cache")
      .delete()
      .eq("cache_key", key)
      .eq("user_id", userId);
    await withTimeout(deletePromise, 2500, null);

    // Then insert the new entry
    const insertPromise = supabase.from("context_cache").insert({
      cache_key: key,
      user_id: userId,
      data_type: dataType,
      cache_data: data,
      expires_at: expires_at,
      created_at: new Date().toISOString(),
    });

    const insertResult = await withTimeout(insertPromise, 2500, null);
    const error = insertResult?.error;

    if (insertResult === null) {
      logWarn(
        `⏰ [PERSISTENT_CACHE] Timeout setting cache for ${dataType} (${key})`
      );
    } else if (error) {
      logError(
        `❌ [PERSISTENT_CACHE] Error setting cache for ${dataType}:`,
        error
      );
    } else {
      logDebug(`✅ [PERSISTENT_CACHE] Cache SET for ${dataType} (${key})`);
    }
  } catch (error) {
    logError(
      `❌ [PERSISTENT_CACHE] Error setting cache for ${dataType}:`,
      error
    );
  }
}

// OPTIMIZED: Unified cache TTL strategy for better performance
const CACHE_TTL = {
  // Fast-changing data (50 minutes) - extended for prebuild optimization
  financial_summary: 50 * 60 * 1000, // 50 minutes
  summary_min: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  net_worth: 50 * 60 * 1000, // 50 minutes (extended for prebuild)

  // Medium-changing data (50 minutes) - extended for prebuild optimization
  spend_data: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  goals_overview: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  cashflow_monthly: 50 * 60 * 1000, // 50 minutes (extended for prebuild)

  // Slow-changing data (50-60 minutes)
  investments_all: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  category_transactions: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
};

const NEED_CONFIG = {
  summary_min: {
    packKey: "base",
    cacheType: "summary_min",
  },
  invest_holdings: {
    packKey: "invest",
    cacheType: "investments_all",
  },
  goals_overview: {
    packKey: "goals",
    cacheType: "goals_overview",
  },
  cashflow_monthly: {
    packKey: "cashflow",
    cacheType: "cashflow_monthly",
  },
  spend_total: {
    packKey: "spend",
    cacheType: "spend_data",
  },
  txns_by_category: {
    packKey: "spend", // merged into spend_total pack
    cacheType: "category_transactions",
  },
  category_details: {
    packKey: "categoryDetails",
    cacheType: "category_transactions",
  },
};

// Cache strategy configuration
const CACHE_STRATEGY = {
  // In-memory cache settings
  in_memory: {
    max_size: 1000, // Maximum number of entries
    cleanup_interval: 10 * 60 * 1000, // Cleanup every 10 minutes
    ttl_multiplier: 0.5, // In-memory TTL is 50% of persistent TTL
  },

  // Persistent cache settings
  persistent: {
    cleanup_interval: 30 * 60 * 1000, // Cleanup every 30 minutes
    batch_cleanup_size: 100, // Clean up 100 expired entries at a time
  },
};

// Generate a cache key for classification
function generateClassificationCacheKey(message) {
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

// Clear all heuristic cache entries - check ALL possible heuristic indicators
function clearHeuristicCacheEntries() {
  let cleared = 0;
  const keysToDelete = [];

  // First pass: collect keys to delete
  for (const [key, value] of classificationCache.entries()) {
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
    classificationCache.delete(key);
  }

  // Cache cleared silently
  return cleared;
}

// Get cached classification result
function getCachedClassification(message) {
  const key = generateClassificationCacheKey(message);
  const cached = classificationCache.get(key);

  if (cached && Date.now() < cached.expires_at) {
    console.log(
      `✅ [CACHE] Classification cache HIT for: "${message.substring(
        0,
        50
      )}..."`
    );
    return cached.result;
  }

  if (cached) {
    console.log(
      `⏰ [CACHE] Classification cache EXPIRED for: "${message.substring(
        0,
        50
      )}..."`
    );
    classificationCache.delete(key);
  }

  return null;
}

// Set cached classification result
function setCachedClassification(message, result) {
  const key = generateClassificationCacheKey(message);
  const expires_at = Date.now() + CLASSIFICATION_CACHE_TTL;

  classificationCache.set(key, {
    result,
    expires_at,
    cached_at: Date.now(),
  });

  logDebug(
    `💾 [CACHE] Classification cached for: "${message.substring(
      0,
      50
    )}..." (expires in 1 hour)`
  );

  // Clean up expired entries periodically (every 100 cache writes)
  if (classificationCache.size % 100 === 0) {
    const now = Date.now();
    for (const [key, value] of classificationCache.entries()) {
      if (now >= value.expires_at) {
        classificationCache.delete(key);
      }
    }
  }
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
        50
      )}..."`
    );
    return cached.result;
  }

  if (cached) {
    logDebug(
      `⏰ [MEMORY_CACHE] Cache EXPIRED for user ${userId}, query: "${query.substring(
        0,
        50
      )}..."`
    );
    memoryCache.delete(key);
  }

  return null;
}

// Set cached memory result
function setCachedMemory(userId, query, result) {
  const key = generateMemoryCacheKey(userId, query);
  if (!key) return;

  const expires_at = Date.now() + MEMORY_CACHE_TTL;
  memoryCache.set(key, { result, expires_at });
  logDebug(
    `💾 [MEMORY_CACHE] Cached memory result for user ${userId}, query: "${query.substring(
      0,
      50
    )}..."`
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

// Generate cache key for data fetching
function generateDataCacheKey(dataType, userId, params = {}) {
  const keyParts = [dataType, userId];

  // Add relevant parameters to the cache key
  if (params.period) {
    keyParts.push(`period_${params.period.start}_${params.period.end}`);
  }
  if (params.category) {
    keyParts.push(`category_${params.category}`);
  }
  if (params.limit) {
    keyParts.push(`limit_${params.limit}`);
  }
  if (params.months) {
    keyParts.push(`months_${params.months}`);
  }

  return keyParts.join("_");
}

// Get cached user data
async function getCachedUserData(dataType, userId, params = {}) {
  const key = generateDataCacheKey(dataType, userId, params);

  // First check in-memory cache
  const cached = dataCache.get(key);
  if (cached && Date.now() < cached.expires_at) {
    logDebug(`✅ [DATA_CACHE] In-memory cache HIT for ${dataType} (${key})`);
    return cached.data;
  }

  if (cached) {
    logDebug(
      `⏰ [DATA_CACHE] In-memory cache EXPIRED for ${dataType} (${key})`
    );
    dataCache.delete(key);
  }

  // Fallback to persistent cache
  logDebug(
    `🔍 [DATA_CACHE] Checking persistent cache for ${dataType} (${key})`
  );
  const persistentData = await getPersistentCache(dataType, userId, params);
  if (persistentData) {
    // Store in in-memory cache for faster access
    const ttl = params.ttl || CACHE_TTL[dataType] || 5 * 60 * 1000;
    dataCache.set(key, {
      data: persistentData,
      expires_at: Date.now() + ttl,
      cached_at: Date.now(),
      dataType,
      userId,
      params,
    });
    return persistentData;
  }

  return null;
}

// Set cached user data
async function setCachedUserData(dataType, userId, data, params = {}) {
  const key = generateDataCacheKey(dataType, userId, params);
  const ttl = params.ttl || CACHE_TTL[dataType] || 5 * 60 * 1000; // Use provided ttl or default
  const expires_at = Date.now() + ttl;

  // Store in in-memory cache
  dataCache.set(key, {
    data,
    expires_at,
    cached_at: Date.now(),
    dataType,
    userId,
    params,
  });

  // Store in persistent cache for cross-instance sharing
  setImmediate(() => {
    setPersistentCache(dataType, userId, data, params).catch((error) => {
      logError(
        `❌ [PERSISTENT_CACHE] Background set failed for ${dataType} (${key}):`,
        error
      );
    });
  });

  const ttlMinutes = Math.round(ttl / (60 * 1000));
  logDebug(
    `💾 [DATA_CACHE] Cached ${dataType} (${key}) - expires in ${ttlMinutes} minutes`
  );

  // Trigger cleanup if cache is getting large
  if (dataCache.size > CACHE_STRATEGY.in_memory.max_size) {
    logDebug(`🧹 [CACHE] Cache size exceeded limit, triggering cleanup`);
    setImmediate(() => {
      cleanupInMemoryCache().catch((error) => {
        logError("❌ [CACHE] In-memory cleanup failed:", error);
      });
    });
  }
}

// Clean up duplicate cache entries (keep only the most recent one)
async function cleanupDuplicateCacheEntries(cacheKey, userId) {
  try {
    // Validate userId is a valid UUID
    if (
      !userId ||
      typeof userId !== "string" ||
      !userId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    ) {
      logWarn(
        `⚠️ [CACHE] Invalid userId format in cleanupDuplicateCacheEntries: ${userId}`
      );
      return;
    }

    // Get all entries for this cache key
    const { data: allEntries, error } = await supabase
      .from("context_cache")
      .select("*")
      .eq("cache_key", cacheKey)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logError("❌ [CACHE] Error fetching duplicate entries:", error);
      return;
    }

    if (!allEntries || allEntries.length <= 1) {
      return; // No duplicates to clean up
    }

    // Keep the most recent entry (first in the sorted list)
    const entriesToDelete = allEntries.slice(1); // All except the first one

    if (entriesToDelete.length > 0) {
      const idsToDelete = entriesToDelete.map((entry) => entry.id);

      const { error: deleteError } = await supabase
        .from("context_cache")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) {
        logError("❌ [CACHE] Error deleting duplicate entries:", deleteError);
      } else {
        logDebug(
          `🧹 [CACHE] Cleaned up ${entriesToDelete.length} duplicate cache entries for key: ${cacheKey}`
        );
      }
    }
  } catch (error) {
    logError("❌ [CACHE] Error in cleanupDuplicateCacheEntries:", error);
  }
}

// ===== CACHE CLEANUP & OPTIMIZATION FUNCTIONS =====

// Clean up expired in-memory cache entries
async function cleanupInMemoryCache() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of dataCache.entries()) {
    if (now >= value.expires_at) {
      dataCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logDebug(`🧹 [CACHE] Cleaned up ${cleaned} expired in-memory entries`);
  }

  return cleaned;
}

// Clean up expired Supabase cache entries
async function cleanupSupabaseCache() {
  try {
    const { error, count } = await supabase
      .from("context_cache")
      .delete()
      .lt("expires_at", new Date().toISOString())
      .select("id", { count: "exact" });

    if (error) {
      logError("❌ [CACHE] Error cleaning Supabase cache:", error);
      return 0;
    }

    logDebug(
      `🧹 [CACHE] Cleaned up ${count || 0} expired Supabase cache entries`
    );
    return count || 0;
  } catch (error) {
    logError("❌ [CACHE] Supabase cleanup failed:", error);
    return 0;
  }
}

// Comprehensive cache cleanup (both in-memory and Supabase)

// Smart cache invalidation for specific user or data type
async function invalidateUserCache(userId, dataType = null) {
  let invalidatedCount = 0;

  if (dataType) {
    // Invalidate specific data type
    const keyPattern = `${dataType}_${userId}`;

    // Remove from in-memory cache
    for (const [key, value] of dataCache.entries()) {
      if (key.startsWith(keyPattern)) {
        dataCache.delete(key);
        invalidatedCount++;
      }
    }

    // Remove from Supabase cache
    try {
      const { error } = await supabase
        .from("context_cache")
        .delete()
        .eq("user_id", userId)
        .eq("data_type", dataType);

      if (error) {
        logError("❌ [CACHE] Error invalidating Supabase cache:", error);
      }
    } catch (error) {
      console.error("❌ [CACHE] Supabase invalidation failed:", error);
    }

    // Cache invalidated silently
  } else {
    // Invalidate all user data
    for (const [key, value] of dataCache.entries()) {
      if (key.includes(userId)) {
        dataCache.delete(key);
        invalidatedCount++;
      }
    }

    // Remove all user data from Supabase
    try {
      const { error } = await supabase
        .from("context_cache")
        .delete()
        .eq("user_id", userId);

      if (error) {
        logError("❌ [CACHE] Error invalidating all user cache:", error);
      }
    } catch (error) {
      console.error("❌ [CACHE] Supabase invalidation failed:", error);
    }

    logInfo(`🗑️ [CACHE] Invalidated all cache for user ${userId}`);
  }

  return invalidatedCount;
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
        logDebug(`✅ [CACHE] ${need} already cached for user ${userId}`);
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
          `⚠️ [CACHE] Failed to pre-populate ${need} for user ${userId}`
        );
        results.failed++;
      }
    } catch (error) {
      logError(`❌ [CACHE] Error pre-populating ${need}:`, error);
      results.failed++;
    }
  }

  logDebug(
    `📊 [CACHE] Pre-population complete - Success: ${results.success}, Failed: ${results.failed}`
  );
  return results;
}

// Clean up existing duplicate cache entries on startup
async function cleanupExistingDuplicates() {
  try {
    // Get all cache entries and find duplicates manually
    const { data: allEntries, error } = await supabase
      .from("context_cache")
      .select("cache_key, user_id");

    if (error) {
      console.error("❌ [CACHE] Error finding duplicates:", error);
      return;
    }

    if (!allEntries || allEntries.length === 0) {
      return;
    }

    // Group by cache_key and user_id to find duplicates
    const duplicates = {};
    for (const entry of allEntries) {
      const key = `${entry.cache_key}_${entry.user_id}`;
      if (!duplicates[key]) {
        duplicates[key] = [];
      }
      duplicates[key].push(entry);
    }

    // Find entries with duplicates
    const duplicateKeys = Object.keys(duplicates).filter(
      (key) => duplicates[key].length > 1
    );

    if (duplicateKeys.length > 0) {
      console.log(
        `🧹 [CACHE] Found ${duplicateKeys.length} cache keys with duplicates`
      );

      // Clean up each duplicate set
      for (const key of duplicateKeys) {
        // Extract cacheKey and userId from the first entry (they're all the same for duplicates)
        const firstEntry = duplicates[key][0];
        const cacheKey = firstEntry.cache_key;
        const userId = firstEntry.user_id;

        // Validate userId is a valid UUID before calling cleanup
        if (
          userId &&
          typeof userId === "string" &&
          userId.match(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          )
        ) {
          await cleanupDuplicateCacheEntries(cacheKey, userId);
        } else {
          logWarn(`⚠️ [CACHE] Skipping cleanup for invalid userId: ${userId}`);
        }
      }

      logDebug("✅ [CACHE] Existing duplicates cleaned up");
    } else {
      logDebug("✅ [CACHE] No existing duplicates found");
    }
  } catch (error) {
    logError("❌ [CACHE] Error cleaning up existing duplicates:", error);
  }
}

// Initialize periodic cache cleanup
function initializeCacheCleanup() {
  logInfo("🔄 [CACHE] Initializing periodic cache cleanup...");

  // Clean up existing duplicates on startup
  setImmediate(() => {
    cleanupExistingDuplicates().catch((error) => {
      logError("❌ [CACHE] Startup cleanup failed:", error);
    });
  });

  // In-memory cache cleanup every 10 minutes
  setInterval(async () => {
    await cleanupInMemoryCache();
  }, CACHE_STRATEGY.in_memory.cleanup_interval);

  // Supabase cache cleanup every 30 minutes
  setInterval(async () => {
    await cleanupSupabaseCache();
  }, CACHE_STRATEGY.persistent.cleanup_interval);

  logInfo("✅ [CACHE] Periodic cleanup initialized");
}

// quickExtract removed - migrating to Supermemory for memory extraction

// Goal extraction function moved to goals.js
// Goal feasibility analysis function moved to goals.js
// Goal conversation handler moved to goals.js
// Goal handler functions moved to goals.js

// shouldRunMemoryExtraction removed - migrating to Supermemory for memory extraction

// Memory extraction helper functions removed - migrating to Supermemory for memory extraction
// Conversation logging functionality with retry logic
async function logConversation(conversationData) {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Insert with metrics and request_id if columns exist; fallback otherwise
      const baseRow = {
        user_id: conversationData.user_id,
        user_message: conversationData.user_message,
        finny_response: conversationData.finny_response,
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
      };

      const insertResult = await withTimeout(
        supabase.from("conversation_logs").insert([baseRow]),
        5000 // 5 second timeout
      );

      if (!insertResult) {
        throw new Error("Insert timed out");
      }

      const { error } = insertResult;

      if (error) {
        const msg = (error?.message || "").toLowerCase();
        const missingCols =
          msg.includes("column") &&
          (msg.includes("metrics") || msg.includes("request_id"));
        if (missingCols) {
          const { metrics, request_id, ...fallbackRow } = baseRow;
          const retry = await withTimeout(
            supabase.from("conversation_logs").insert([fallbackRow]),
            5000
          );
          if (!retry) {
            throw new Error("Fallback insert timed out");
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
            error.message
          );
          return;
        }
      } else {
        return; // Success
      }
    } catch (error) {
      logError(
        `❌ [CONVERSATION_LOG] Attempt ${attempt}/${maxRetries} failed:`,
        error.message
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

  logInfo("🤖 [FINNY] Request received:", req.method);

  if (req.method !== "POST") {
    logWarn("❌ [FINNY] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if client wants streaming response
  const wantsStreaming = req.body.stream === true;

  const { action, message, context, classification, ...otherParams } = req.body;
  logInfo("📝 [FINNY] Action:", action);
  // Avoid logging full message/context to reduce PII exposure
  logInfo("📊 [FINNY] Context provided:", context ? "Yes" : "No");

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  // Derive user from Supabase JWT instead of trusting client context
  let serverUserId = null;
  let userProfile = { name: null, age: null };
  const requestId = generateRequestId();
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
      const { data: authData, error: authError } = await supabase.auth.getUser(
        token
      );
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
  const chatId = req.body.chat_id || context?.chat_id; // Get chat_id from request

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
        buildStreamFallbackResponse(authMessage)
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

  // Load conversation context from Supabase (if chat_id provided)
  // Skip context loading for first message in chat session
  let conversationContext = null;
  let isFirstMessage = false;
  const contextLoadingStartTime = Date.now();

  if (chatId) {
    // Check if this is the first message by looking for existing context
    const existingContext = await getConversationContext(finalUserId, chatId);
    if (
      !existingContext ||
      !existingContext.last_messages ||
      existingContext.last_messages.length === 0
    ) {
      isFirstMessage = true;
      logDebug(
        "🔍 [CONTEXT DEBUG] First message in chat session - skipping context loading"
      );

      // Pre-populate cache for new chat sessions
      logDebug("🚀 [CACHE] Pre-populating cache for new chat session...");
      setImmediate(() => {
        prePopulateUserCache(finalUserId).catch((error) => {
          logError("❌ [CACHE] Pre-population failed:", error);
        });
      });
    } else {
      conversationContext = existingContext;
      logDebug("🔍 [CONTEXT DEBUG] Continuing conversation - loading context");
    }
  }
  timings.context_loading_ms = Date.now() - contextLoadingStartTime;

  // 🔍 DEBUG: Log conversation context loading (debug only)
  logDebug("🔍 [CONTEXT DEBUG] Loading conversation context:");
  logDebug("  - Chat ID:", chatId);
  logDebug("  - User ID:", finalUserId);
  logDebug("  - Is first message:", isFirstMessage);
  logDebug("  - Context loaded:", conversationContext ? "YES" : "NO");
  if (conversationContext) {
    logDebug("  - Active topic:", conversationContext.active_topic);
    logDebug(
      "  - Last entity:",
      JSON.stringify(conversationContext.last_entity)
    );
    logDebug("  - Pending action:", conversationContext.pending_action);
    logDebug(
      "  - Last messages count:",
      conversationContext.last_messages?.length || 0
    );
  }

  let sessionState = getSessionState(finalUserId);

  // Load user profile, memory, and feedback patterns only when needed
  // OPTIMIZED: Only load for "ask" action (not needed for classify or prebuild_context)
  let userMemory = { memories: [], totalCount: 0 };
  let userProfileData = {
    name: null,
    age: null,
    occupation: null,
    finny_style: "conversational",
    intent_context: "",
  };
  let feedbackPatterns = {
    preferences: [],
    patterns: {},
    deepInsights: [],
  };

  // Only load memory and profile data for "ask" action
  if (action === "ask") {
    // Load memory (only for ask handler)
    const memoryLoadingStartTime = Date.now();
    if (message) {
      // Check cache first
      const cachedMemory = getCachedMemory(finalUserId, message);
      if (cachedMemory) {
        userMemory = cachedMemory;
        logInfo(
          `⚡ [MEMORY_CACHE] Using cached memories for message: "${message.substring(
            0,
            50
          )}..."`
        );
      } else {
        // Load from Supermemory and cache the result
        userMemory = await loadUserMemory(finalUserId, message);
        // Always cache the result (even if empty) to avoid repeated API calls for same query
        // loadUserMemory always returns { memories: [], totalCount: 0 } on error/null, so it's safe
        if (userMemory && typeof userMemory === "object") {
          setCachedMemory(finalUserId, message, userMemory);
        }
      }
    } else {
      // No message provided, load empty memories
      userMemory = await loadUserMemory(finalUserId, null);
    }
    timings.memory_loading_ms = Date.now() - memoryLoadingStartTime;

    // Load profile and feedback patterns in parallel (only for ask handler)
    const profileLoadingStartTime = Date.now();
    const [profileData, feedback] = await Promise.all([
      loadUserProfile(finalUserId),
      retrieveFeedbackPatterns(finalUserId, null), // Will extract topic from message later if needed
    ]);
    userProfileData = profileData;
    feedbackPatterns = feedback;
    timings.profile_loading_ms = Date.now() - profileLoadingStartTime;
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
    finny_style: userProfileData.finny_style,
    intent_context: userProfileData.intent_context,
  };

  // Log age source for debugging
  if (
    userProfile.age &&
    userProfileData.age &&
    userProfile.age !== userProfileData.age
  ) {
    logWarn(
      `⚠️ [PROFILE] Age mismatch: user_metadata.age=${userProfile.age}, profiles.age=${userProfileData.age} (using profiles.age)`
    );
  }

  const safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    chat_id: chatId,
    profile: enrichedProfile,
    // carry session short-term state into handlers
    session: sessionState,
    // NEW: Add conversation context
    conversationContext: conversationContext,
    conversation_context: conversationContext, // Keep both for compatibility
    // NEW: Add memory reading
    memory: userMemory,
    // NEW: Add feedback patterns for adaptation
    feedbackPatterns: feedbackPatterns,
  };

  // === PROFILE CACHE INVALIDATION ===
  if (action === "invalidate_profile_cache") {
    // Invalidate profile cache for the authenticated user
    invalidateProfileCache(finalUserId);
    console.log(
      `✅ [CACHE] Profile cache invalidated for user: ${finalUserId}`
    );
    return res.status(200).json({ success: true });
  }

  // === CHAT SESSION CHECK: Clear session state if new chat session ===
  const lastChatId = sessionState?.last_chat_id;
  if (lastChatId && chatId && lastChatId !== chatId) {
    console.log(
      `🆕 [SESSION] New chat detected (old: ${lastChatId}, new: ${chatId}) - clearing session state`
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

  // === FLOW STATE CHECK: Bypass classification for active goal flows ===
  const activeGoalFlow = sessionState?.goal_flow;
  let finalAction = action; // Create mutable copy
  if (action === "classify" && activeGoalFlow && activeGoalFlow.active) {
    console.log(
      `🎯 [FLOW] Active goal flow detected - bypassing classification`
    );
    // Override action to go directly to goal_conversation
    finalAction = "goal_conversation";
  }

  // === ROUTER OVERRIDE: Check pending actions BEFORE classification ===
  if (action === "classify" && conversationContext?.pending_action) {
    console.log(
      `🎯 [ROUTER] Checking pending action: ${conversationContext.pending_action}`
    );

    const lower = (message || "").toLowerCase();
  }

  try {
    let response;
    const handlerStartTime = Date.now();

    switch (finalAction) {
      case "classify": {
        const classifyStartTime = Date.now();
        response = await handleClassify(
          message,
          safeContext,
          conversationContext
        );
        timings.classification_ms = Date.now() - classifyStartTime;

        // CRITICAL FINAL CHECK: Never return heuristic results
        if (
          response &&
          response.hasOwnProperty("heuristic") &&
          (response.heuristic === true ||
            response.heuristic === "true" ||
            response.heuristic === 1)
        ) {
          console.log(
            "🚨 [FINNY] CRITICAL: Response has heuristic flag! Blocking return and forcing fresh LLM classification."
          );
          console.log(
            "🚨 [FINNY] Response was:",
            JSON.stringify(response, null, 2)
          );

          // Clear cache for this specific message to force fresh classification
          const key = generateClassificationCacheKey(message);
          classificationCache.delete(key);
          // Cleared cache for message, forcing fresh LLM call

          // Call handleClassify again - it will now bypass cache and call LLM
          response = await handleClassify(
            message,
            safeContext,
            conversationContext
          );

          // Final check on new response
          if (
            response &&
            response.hasOwnProperty("heuristic") &&
            response.heuristic
          ) {
            console.log(
              "🚨 [FINNY] CRITICAL ERROR: LLM returned heuristic! This should never happen. Removing flag."
            );
            delete response.heuristic;
          }
        }
        break;
      }
      case "ask": {
        const askIntent =
          classification?.intent === "stock_query"
            ? "stock_query"
            : "ask_personalized";
        response = await handleAsk(
          message,
          safeContext,
          askIntent,
          classification,
          conversationContext,
          timings, // Pass timings object to track web search and context packs
          wantsStreaming, // Pass streaming preference
          wantsStreaming ? res : null // Pass response object for progress updates if streaming
        );
        break;
      }
      case "stock_query": {
        response = await handleAsk(
          message,
          safeContext,
          "stock_query",
          classification,
          conversationContext,
          timings, // Pass timings object to track web search and context packs
          wantsStreaming, // Pass streaming preference
          wantsStreaming ? res : null // Pass response object for progress updates if streaming
        );
        break;
      }
      case "off_topic": {
        response = await handleOffTopic(
          message,
          safeContext,
          conversationContext
        );
        break;
      }
      case "goal_conversation": {
        // Check for goal action buttons
        if (message === "cancel_goal") {
          response = {
            message:
              "No worries! Let me know if you have any other questions. 😊",
            type: "assistant",
            intent: "goal_conversation",
            goal_flow: { active: false },
          };
        } else if (message === "start_over_goal") {
          response = {
            message:
              "Sure! Let's start over. What goal would you like to create?",
            type: "assistant",
            intent: "goal_conversation",
            goal_flow: { active: false }, // Reset the flow
          };
        } else if (message === "skip_category") {
          // Set category to "other" and continue with goal creation
          const currentFlow = safeContext?.session?.goal_flow;
          if (currentFlow && currentFlow.slots) {
            const updatedSlots = { ...currentFlow.slots, category: "other" };
            response = await handleGoalCreation(
              { extracted: updatedSlots },
              {
                ...safeContext,
                goal_flow: { ...currentFlow, slots: updatedSlots },
              },
              message
            );
          } else {
            response = {
              message: "I couldn't find your goal details. Let's start over.",
              type: "assistant",
              intent: "goal_conversation",
              goal_flow: { active: false },
            };
          }
        } else if (message === "confirm_create_goal") {
          // User confirmed goal creation - actually create the goal
          const currentFlow = safeContext?.session?.goal_flow;
          if (currentFlow && currentFlow.slots && currentFlow.analysis) {
            // Import the createGoalFromSlots function and call it without confirmation
            const { createGoalFromSlots } = await import("./goals.js");
            response = await createGoalFromSlots(
              currentFlow.slots,
              safeContext,
              currentFlow.analysis,
              false
            );
          } else {
            response = {
              message: "I couldn't find your goal details. Let's start over.",
              type: "assistant",
              intent: "goal_conversation",
              goal_flow: { active: false },
            };
          }
        } else if (message === "edit_goal") {
          // User wants to edit goal details - restart collection
          response = {
            message:
              "Sure! Let's edit your goal details. What would you like to change?",
            type: "assistant",
            intent: "goal_conversation",
            goal_flow: { active: false }, // Reset the flow
          };
        } else {
          // If there's active goal_flow in session, pass it in context
          if (safeContext?.session?.goal_flow) {
            safeContext.goal_flow = safeContext.session.goal_flow;
          }
          try {
            response = await handleGoalConversation(
              message,
              safeContext,
              conversationContext
            );
          } catch (goalError) {
            logError("❌ [GOAL] Goal conversation failed:", goalError);
            response = {
              message:
                "Sorry — I hit an issue while updating your goal. Please try again.",
              type: "assistant",
              intent: "goal_conversation",
              hideActions: true,
              goal_flow: { active: false },
            };
          }
        }

        if (!responseHasVisibleContent(response)) {
          response = {
            message:
              "Sorry — I didn't get a full reply for your goal. Please try again.",
            type: "assistant",
            intent: "goal_conversation",
            hideActions: true,
            goal_flow: { active: false },
          };
        }

        // Persist any goal_flow updates returned by the handler
        if (response?.goal_flow) {
          mergeSessionState(finalUserId, { goal_flow: response.goal_flow });
        } else if (
          safeContext?.session?.goal_flow &&
          response?.intent === "goal_conversation"
        ) {
          // If flow completed or canceled, clear when not active
          const gf = safeContext.session.goal_flow;
          if (gf && gf.active === false) {
            mergeSessionState(finalUserId, { goal_flow: null });
          }
        }
        break;
      }
      case "stock_conversation": {
        const stockFlow = sessionState?.stock_flow;

        if (message === "confirm_stock") {
          if (!stockFlow?.ticker) {
            response = {
              message:
                "I couldn't find a ticker to analyze. Please tell me which stock you want.",
              type: "assistant",
            };
            break;
          }

          const stockContext = {
            ...safeContext,
            skip_stock_confirmation: true,
            stock_override: { ticker: stockFlow.ticker },
          };

          try {
            response = await handleAsk(
              stockFlow.original_message || `${stockFlow.ticker} stock`,
              stockContext,
              "ask_personalized",
              null,
              conversationContext,
              timings,
              wantsStreaming,
              wantsStreaming ? res : null // Pass response object for progress updates if streaming
            );

            // Hide action buttons and show feedback buttons after confirmation
            // Ensure response is an object before modifying
            console.log(
              `🔍 [CONFIRM_STOCK] Response received from handleAsk:`,
              typeof response,
              response?.hideActions,
              response?.hideFeedback
            );

            if (response && typeof response === "object") {
              // Force set these properties to ensure buttons are hidden
              response.hideActions = true; // Hide action buttons (Yes/Change Ticker)
              response.hideFeedback = false; // Show feedback buttons (thumbs up/down) for final analysis
              response.actions = []; // Clear any actions

              console.log(
                `✅ [CONFIRM_STOCK] Response flags set - hideActions: ${response.hideActions}, hideFeedback: ${response.hideFeedback}`
              );
            } else {
              // If response is not an object, wrap it
              response = {
                message: response || "Stock analysis completed",
                type: "assistant",
                hideActions: true,
                hideFeedback: false,
                actions: [],
              };
              console.log(
                `✅ [CONFIRM_STOCK] Wrapped response with flags - hideActions: ${response.hideActions}, hideFeedback: ${response.hideFeedback}`
              );
            }

            // Only clear state AFTER successful completion
            mergeSessionState(finalUserId, { stock_flow: null });
          } catch (error) {
            logError("❌ [STOCK] Error during stock analysis:", error);
            // Keep stock_flow state so user can retry
            response = {
              message:
                "Something went wrong analyzing the stock. Please try again.",
              type: "assistant",
              stock_candidate: { ticker: stockFlow.ticker },
              hideFeedback: true, // Hide feedback buttons for error messages
              actions: [
                {
                  label: "Retry",
                  action: "confirm_stock",
                  style: "primary",
                },
                {
                  label: "Change Ticker",
                  action: "change_stock",
                  style: "secondary",
                },
              ],
            };
          }
          break;
        }

        if (message === "update_stock_ticker") {
          const rawTicker = otherParams?.ticker || otherParams?.stock_ticker;
          if (!rawTicker || typeof rawTicker !== "string") {
            response = {
              message: "Please provide a valid ticker symbol.",
              type: "assistant",
              intent: "ask_personalized",
            };
            break;
          }
          const updatedTicker = rawTicker.toUpperCase().trim().slice(0, 5);

          if (!/^[A-Z]{1,5}$/.test(updatedTicker)) {
            response = {
              message:
                "That doesn't look like a valid ticker. Please enter 1-5 letters.",
              type: "assistant",
              intent: "ask_personalized",
              actions: [
                {
                  label: "Change Ticker",
                  action: "change_stock",
                  style: "secondary",
                },
              ],
            };
            break;
          }

          const updatedFlow = {
            active: true,
            ticker: updatedTicker,
            original_message: stockFlow?.original_message || null,
            stage: "awaiting_confirmation",
            entities: [updatedTicker],
            source: "manual",
          };

          mergeSessionState(finalUserId, { stock_flow: updatedFlow });

          // Improved confirmation message with ticker displayed
          const tickerDisplay = updatedTicker;
          const confirmationMessage = `I found **${tickerDisplay}**. Would you like me to analyze this stock?`;

          const updateResponse = {
            message: confirmationMessage,
            type: "assistant",
            intent: "ask_personalized",
            stock_candidate: { ticker: updatedTicker },
            hideFeedback: true, // Hide feedback buttons for confirmation messages
            hideActions: false, // Show action buttons initially
            actions: [
              {
                label: "Yes",
                action: "confirm_stock",
                style: "primary",
              },
              {
                label: "Change Ticker",
                action: "change_stock",
                style: "secondary",
              },
            ],
          };

          response = updateResponse;
          break;
        }

        response = {
          message:
            "I can analyze a specific stock if you share a ticker symbol.",
          type: "assistant",
        };
        break;
      }
      case "prebuild_context":
        // Set flag to suppress memory storage warnings during prebuild_context
        setPrebuildContextActive(finalUserId);
        try {
          response = await handlePrebuildContext(finalUserId);
        } finally {
          // Always clear the flag, even if there's an error
          clearPrebuildContextActive(finalUserId);
        }
        break;
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    timings.handler_ms = Date.now() - handlerStartTime;

    // Calculate total time until streaming starts
    timings.total_ms = Date.now() - requestStartTime;

    // Log all timings in seconds
    const formatTime = (ms) => (ms / 1000).toFixed(3);

    // Consolidated timing log
    console.log(`\n⏱️  [TIMING] Total: ${formatTime(timings.total_ms)}s`);
    console.log(
      `   └─ Handler: ${formatTime(timings.handler_ms)}s | LLM: ${formatTime(
        timings.llm_ms || 0
      )}s | Memory: ${formatTime(
        timings.memory_loading_ms
      )}s | Profile: ${formatTime(timings.profile_loading_ms)}s`
    );

    // Detailed breakdown only in debug mode
    logDebug("⏱️  [TIMING] Detailed breakdown:");
    logDebug(
      `   Auth: ${formatTime(timings.auth_ms)}s | Context: ${formatTime(
        timings.context_loading_ms
      )}s`
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
            ).toFixed(3)}s to first chunk)`
          );
          console.log(
            "🔄 [STREAMING] Streaming text:",
            textToStream.substring(0, 100) + "..."
          );
          sendStreamEvent(res, "progress", {
            status: "Generating response...",
          });
          await streamTextChunks(res, textToStream);
        } else {
          console.log(
            "⚠️ [STREAMING] No text to stream in response:",
            Object.keys(response)
          );
        }

        // Send final complete response
        sendStreamEvent(res, "complete", response);
        streamCompleted = true;
        res.end();
        console.log("✅ [STREAMING] Streaming completed");
      } catch (streamError) {
        logError("❌ [STREAMING] Stream error:", streamError);
        if (!res.writableEnded) {
          sendStreamEvent(
            res,
            "complete",
            buildStreamFallbackResponse(
              "Sorry — something went wrong while streaming. Please try again."
            )
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
    }
    console.log("🔍 [FINNY] Response:", response);
  } catch (error) {
    console.error("❌ [FINNY] Error:", error);
    if (wantsStreaming && res && !res.writableEnded) {
      sendStreamEvent(
        res,
        "complete",
        buildStreamFallbackResponse(
          "Sorry — something went wrong. Please try again."
        )
      );
      res.end();
      return;
    }
    res.status(500).json({ error: error.message });
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

    // 🔍 CONVERSATION CONTEXT AWARENESS
    // If we have an active conversation context with a specific stock,
    // prioritize that over user's existing holdings
    if (
      context?.conversationContext?.active_topic === "investment_analysis" &&
      context?.conversationContext?.last_entity?.symbol
    ) {
      const contextSymbol = context.conversationContext.last_entity.symbol;
      console.log(
        `🔍 [ENHANCE] Conversation context detected: ${contextSymbol}, prioritizing over user holdings`
      );

      // Return search query for the conversation context stock
      return `${contextSymbol} latest news`;
    }

    console.log(
      "🔍 [ENHANCE] Detected personal investment query, fetching user holdings..."
    );

    // Fetch user's investment holdings
    const { data: holdings, error } = await withTimeout(
      supabase.rpc("get_investment_holdings_detailed", {
        p_user_id: context.user_id,
      }),
      3000 // 3 second timeout
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
        (h) => `${h.symbol} ($${h.market_value?.toFixed(2) || "0"})`
      )
    );

    // Create multiple targeted search queries
    const searchQueries = topHoldings.map(
      (holding) => `${holding.symbol} latest news`
    );

    console.log(
      `🔍 [ENHANCE] Generated ${searchQueries.length} targeted queries:`,
      searchQueries
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
  conversationContext = null,
  requestTimings = null, // Optional: parent request timings object
  wantsStreaming = false, // Whether client wants streaming response
  res = null // Response object for sending progress updates (optional)
) {
  logInfo("🔍 [FINNY] Starting ask handler for message:", message);
  const startTime = Date.now();
  const timings = {
    user_data_ms: 0,
    market_ms: 0,
    web_ms: 0,
    summary_ms: 0,
    llm_ms: 0,
  };
  const toolsUsed = [];
  let degraded = false;

  try {
    // 1) Get user_id from context
    const userId = context?.user_id;

    if (!userId) {
      logWarn("❌ [FINNY] No user_id provided in context");
      return {
        message: cleanResponseFormatting(
          "I need to know who you are to provide personalized advice. Please try again."
        ),
        type: "assistant",
      };
    }

    // 2) NEW: Use deterministic context planner
    logDebug("🎯 [FINNY] Using deterministic context planner");
    const slots = extractSlots(message);
    const needs = planNeeds(slots, message);

    logInfo("🎯 [SLOTS] Extracted slots:", JSON.stringify(slots, null, 2));
    logInfo("🎯 [FINNY] Planned needs:", needs);

    // 2.1) Check if web search is needed
    let webResults = [];
    let webSummary = "";

    // Use passed classification result, or retrieve from cache, or fallback to keyword detection
    if (!classificationResult) {
      // Try to retrieve from cache
      const cachedClassification = getCachedClassification(message);
      if (cachedClassification) {
        logDebug("✅ [FINNY] Retrieved classification from cache");
        classificationResult = cachedClassification;
      } else {
        logDebug(
          "⚠️ [FINNY] No classification result passed and not in cache, using keyword fallback"
        );
      }
    }

    // Backward-compatible defaults for new classification fields
    if (
      classificationResult &&
      classificationResult.needs_clarification === undefined
    ) {
      classificationResult.needs_clarification = false;
    }
    if (
      classificationResult &&
      !Array.isArray(classificationResult.missing_fields)
    ) {
      classificationResult.missing_fields = [];
    }
    if (classificationResult && !classificationResult.info_sufficiency) {
      classificationResult.info_sufficiency = "unknown";
    }
    if (classificationResult && !classificationResult.decision_risk) {
      classificationResult.decision_risk = "unknown";
    }

    const userRefused = detectRefusalToAnswer(message);
    const ambiguousIntent = detectAmbiguousIntent(message);
    const shouldConsiderClarifying =
      classificationResult?.needs_clarification &&
      !userRefused &&
      classificationResult?.intent !== "stock_query";

    // Use classification.needs_web as primary, with keyword detection as fallback
    const needsWeb =
      classificationResult?.needs_web || detectWebSearchNeeded(message, slots);

    logInfo("🌍 [FINNY] Web search decision:", {
      classification_needs_web: classificationResult?.needs_web,
      keyword_fallback: detectWebSearchNeeded(message, slots),
      final_decision: needsWeb,
    });

    if (needsWeb) {
      logInfo("🌍 [FINNY] Web search needed, fetching fresh data...");
      const webStartTime = Date.now();

      try {
        // Enhance search query with user-specific data when relevant
        const enhancedData = await enhanceSearchQuery(message, context);

        // Handle both single queries and multiple queries
        if (typeof enhancedData === "string") {
          // Single query (original behavior)
          webResults = await limitedBraveSearch(enhancedData);
        } else if (enhancedData && enhancedData.queries) {
          // Multiple queries - search in parallel (limited to avoid rate limiting)
          const symbols = enhancedData.queries.map((q) => q.split(" ")[0]);
          logDebug(
            `🔍 [FINNY] Performing ${enhancedData.queries.length} parallel searches for:`,
            symbols
          );

          const searchPromises = enhancedData.queries.map((query) =>
            limitedBraveSearch(query)
          );
          const searchResults = await Promise.all(searchPromises);

          // Combine and deduplicate results
          webResults = searchResults
            .flat()
            .filter(
              (result, index, self) =>
                index === self.findIndex((r) => r.url === result.url)
            );

          logInfo(
            `✅ [FINNY] Combined ${searchResults.length} searches into ${webResults.length} unique results`
          );

          // Add user prompt to context for AI response
          if (enhancedData.userPrompt) {
            context.userPrompt = enhancedData.userPrompt;
            logDebug(
              "🔍 [FINNY] Added user prompt to context:",
              enhancedData.userPrompt
            );
          }
        } else {
          // Fallback to original message
          webResults = await limitedBraveSearch(message);
        }

        timings.web_ms = Date.now() - webStartTime;
        // Update parent timings if provided
        if (requestTimings) {
          requestTimings.web_search_ms = timings.web_ms;
        }

        if (webResults.length > 0) {
          webSummary = webResults
            .map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n${r.snippet}`)
            .join("\n\n");

          console.log(
            `✅ [FINNY] Web search completed: ${webResults.length} results`
          );
          logDebug("📄 [FINNY] Web summary for prompt:", webSummary);
          toolsUsed.push("brave-search");
        } else {
          logInfo("⚠️ [FINNY] Web search returned no results");
        }
      } catch (error) {
        console.error("❌ [FINNY] Web search failed:", error);
        timings.web_ms = Date.now() - webStartTime;
      }
    }

    // Check if user wants to force refresh their data
    const forceRefresh =
      message.toLowerCase().includes("refresh") ||
      message.toLowerCase().includes("update") ||
      message.toLowerCase().includes("latest");

    if (forceRefresh) {
      logInfo("🔄 [FINNY] Force refresh requested, clearing cache...");
      await forceRefreshUserData(userId);
    }

    // 3) Build targeted context packs
    const contextPacksStartTime = Date.now();
    const { packs, gaps, contextHeader } = await buildContextPacks(
      userId,
      needs,
      slots
    );
    const contextPacksTime = Date.now() - contextPacksStartTime;
    // Update parent timings if provided
    if (requestTimings) {
      requestTimings.context_packs_ms = contextPacksTime;
    }

    logInfo("📦 [FINNY] Context packs built:", Object.keys(packs));
    logInfo("⚠️ [FINNY] Data gaps:", gaps);

    // Ambiguous-intent clarification: for medium/high (or unknown sufficiency), ask ONE question first
    // even if we have internal data. This avoids giving the "wrong" advice for the wrong goal.
    const decisionRisk = classificationResult?.decision_risk || "unknown";
    const infoSufficiency = classificationResult?.info_sufficiency || "unknown";
    const shouldClarifyAmbiguity =
      ambiguousIntent &&
      !userRefused &&
      classificationResult?.intent !== "stock_query" &&
      (decisionRisk === "high" ||
        decisionRisk === "medium" ||
        infoSufficiency === "unknown");

    // Clarify-first guardrail (data-aware): only ask questions if we truly lack enough
    // internal data to answer safely.
    if (shouldConsiderClarifying) {
      const missingFields = Array.isArray(classificationResult?.missing_fields)
        ? classificationResult.missing_fields
        : [];
      const remainingMissing = missingFields.filter(
        (f) => !isMissingFieldSatisfiedByPacks(f, packs)
      );
      const requiredClarificationMissing = remainingMissing.filter(
        (f) =>
          NON_INFERABLE_MISSING_FIELDS.has(f) ||
          FINANCIAL_BASELINE_MISSING_FIELDS.has(f)
      );
      const missingBase = !packs.base || gaps.includes("summary_min");
      const lacksSignal = !hasEnoughInternalDataToProceed(
        packs,
        classificationResult?.decision_risk || "unknown"
      );

      if (
        requiredClarificationMissing.length > 0 ||
        missingBase ||
        lacksSignal
      ) {
        const clarificationMessage = buildClarificationMessage(message, {
          ...classificationResult,
          // Ask only for what we actually still need.
          missing_fields: requiredClarificationMissing,
          info_sufficiency:
            classificationResult?.info_sufficiency === "sufficient"
              ? "missing"
              : classificationResult?.info_sufficiency,
        });
        return {
          message: cleanResponseFormatting(clarificationMessage),
          type: "assistant",
          intent: classificationResult?.intent || "ask_personalized",
        };
      }
    }

    // Log what user data is being fed to finny
    if (packs.base) {
      const baseData = packs.base;
      const netWorth = baseData.netWorth || 0;
      const liquidAssets = baseData.liquidAssets || 0;
      const investmentsTotal = baseData.investmentsTotal || 0;
      const totalLiabilities = baseData.totalLiabilities || 0;
      const accountsCount = Array.isArray(baseData.accounts)
        ? baseData.accounts.length
        : 0;
      const investmentAccounts = Array.isArray(baseData.accounts)
        ? baseData.accounts.filter((acc) => acc.type === "investment").length
        : 0;
      logInfo(
        `📊 [USER_DATA] Summary data: netWorth=$${netWorth.toFixed(
          2
        )}, liquidAssets=$${liquidAssets.toFixed(
          2
        )}, investmentsTotal=$${investmentsTotal.toFixed(
          2
        )}, liabilities=$${totalLiabilities.toFixed(
          2
        )}, accounts=${accountsCount} (${investmentAccounts} investment)`
      );
      if (Array.isArray(baseData.accounts) && baseData.accounts.length > 0) {
        const accountSummary = baseData.accounts
          .map(
            (acc) =>
              `${acc.name || acc.account_id}: $${(
                acc.current_balance ||
                acc.balance ||
                0
              ).toFixed(2)} (${acc.type}/${acc.subtype || "N/A"})`
          )
          .join(" | ");
        logInfo(`📊 [USER_DATA] Accounts: ${accountSummary}`);
      }
    }

    // Check for stock candidate - prioritize classification result if available
    let stockCandidate = null;
    if (
      classificationResult?.intent === "stock_query" &&
      classificationResult?.ticker
    ) {
      // Validate and normalize ticker from classification
      const ticker = String(classificationResult.ticker).toUpperCase().trim();

      // Validate ticker format (1-5 uppercase letters)
      if (!/^[A-Z]{1,5}$/.test(ticker)) {
        logWarn(
          `⚠️ [STOCK] Invalid ticker format from classification: ${ticker}, falling back to detection`
        );
        // Fall back to detection
        stockCandidate = detectStockCandidate(message);
      } else {
        // Use classification result if it detected a stock query with ticker
        stockCandidate = {
          ticker: ticker,
          entities: classificationResult.entities || [ticker],
          confidence: classificationResult.confidence || 0.9,
          source: "classification",
        };
        logDebug(
          "🔍 [STOCK] Using stock candidate from classification:",
          stockCandidate
        );
      }
    } else {
      // Fallback to detectStockCandidate if classification didn't catch it
      stockCandidate = detectStockCandidate(message);
      if (stockCandidate) {
        logDebug(
          "🔍 [STOCK] Using stock candidate from detection:",
          stockCandidate
        );
      }
    }

    // Show confirmation prompt if we found a stock candidate and confirmation is not skipped
    if (stockCandidate && !context?.skip_stock_confirmation) {
      // Defensive check for ticker
      if (!stockCandidate.ticker) {
        logError("❌ [STOCK] stockCandidate missing ticker:", stockCandidate);
        // Fall through to regular stock query handling
      } else {
        const stockFlow = {
          active: true,
          ticker: stockCandidate.ticker,
          original_message: message,
          stage: "awaiting_confirmation",
          entities: stockCandidate.entities || [],
          source: stockCandidate.source || null,
        };
        mergeSessionState(userId, { stock_flow: stockFlow });

        // Improved confirmation message with ticker displayed
        const tickerDisplay = stockCandidate.ticker;
        const confirmationMessage = `Okay! Just wanted to confirm, you want me to analyze **${tickerDisplay}**?`;

        const confirmationResponse = {
          message: confirmationMessage,
          type: "assistant",
          intent: "ask_personalized",
          stock_candidate: { ticker: stockCandidate.ticker },
          hideFeedback: true, // Hide feedback buttons for confirmation messages - NEVER show thumbs
          hideActions: false, // Show action buttons initially, frontend will hide on click
          actions: [
            {
              label: "Yes",
              action: "confirm_stock",
              style: "primary",
            },
            {
              label: "Change Ticker",
              action: "change_stock",
              style: "secondary",
            },
          ],
        };

        return confirmationResponse;
      }
    }

    // 3.5) Check if this is a stock query after building context packs
    // Also check if we have stock_override (user confirmed ticker) - that's definitely a stock query!
    const hasStockOverride = !!context?.stock_override?.ticker;
    const isStockQuery = looksLikeStockQuery(message) || hasStockOverride;
    logDebug("🔍 [STOCK_ROUTING] Stock query detection:", {
      message,
      looksLikeStockQuery: looksLikeStockQuery(message),
      hasStockOverride,
      isStockQuery,
    });

    if (isStockQuery) {
      try {
        // Use the built context packs for stock queries
        logDebug("🔍 [STOCK] Using built context packs for stock analysis");
        logDebug("🔍 [STOCK] Available packs:", Object.keys(packs));

        // Get user context for personalization
        // Use cached memory from context if available, otherwise load (will use cache)
        const userMemory =
          context.memory || (await loadUserMemory(userId, message || null));
        const userProfile = context.profile || { name: null, age: null };

        // Get investment holdings from context packs if available
        const investmentHoldings =
          packs[NEED_CONFIG.invest_holdings.packKey] ||
          (await getCachedUserData(
            NEED_CONFIG.invest_holdings.cacheType,
            userId
          ));

        let stockData = null;
        let stockPlan = null;
        const stockOverride = context?.stock_override?.ticker || null;

        // Deep query ALWAYS runs for stock queries (even with stockOverride)
        // stockOverride just provides the ticker, but we still want comprehensive analysis
        const willUseDeepQuery = looksLikeStockDeepQuery(message);
        const willUseOverride = !!stockOverride && !willUseDeepQuery;
        logDebug("🔍 [STOCK_ROUTING] Analysis path:", {
          stockOverride,
          willUseDeepQuery,
          willUseOverride,
        });

        // Deep analysis is default for all stock queries - ALWAYS run deep query for comprehensive analysis
        if (looksLikeStockDeepQuery(message)) {
          logDebug("🔍 [STOCK] Deep query detected, using advanced analysis");

          // Send initial progress message
          sendStockProgress(res, "🔍 Analyzing stock data...", wantsStreaming);

          // Show finance fact while planning
          if (wantsStreaming && res) {
            setTimeout(() => {
              sendStockProgress(res, getRandomFinanceFact(), wantsStreaming);
            }, 500);
          }

          // If we have stockOverride (user confirmed ticker), skip planning and create plan directly
          // This avoids unnecessary API calls and prevents hangs
          if (stockOverride) {
            console.log(
              `🔵 [STOCK] Skipping planStockRequest - using stockOverride ticker: ${stockOverride}`
            );
            // Create a comprehensive plan with all available data types
            stockPlan = {
              ticker_candidates: [stockOverride],
              company_candidates: [],
              wants: [
                "price",
                "market_cap",
                "pe",
                "ps",
                "analyst_targets",
                "news",
                "earnings",
                "filings",
              ], // Comprehensive set of data to fetch
              horizon: null,
              needs_web: false,
            };
            console.log(
              `🔵 [STOCK] Created plan directly with ticker: ${stockOverride}`
            );
          } else {
            // Only call planStockRequest if we don't have a confirmed ticker
            console.log(
              `🔵 [STOCK] No stockOverride, calling planStockRequest to determine ticker`
            );
            stockPlan = await planStockRequest(message);
            logDebug("🔍 [STOCK] Stock plan result:", stockPlan);
          }

          sendStockProgress(res, "📊 Fetching market data...", wantsStreaming);
          const exec = await executeStockPlan(
            stockPlan || {},
            message,
            res,
            wantsStreaming
          );
          logDebug("🔍 [STOCK] Execute result:", exec);

          // 🔍 DIAGNOSTIC: Log why the check might fail
          if (exec.error) {
            console.log(
              `⚠️ [STOCK] executeStockPlan returned error:`,
              exec.error
            );
          } else if (!exec.data) {
            console.log(`⚠️ [STOCK] executeStockPlan has no data field`);
          } else if (exec.data.current == null) {
            const reason = exec.data._usingPrevCloseFallback
              ? "Using prevClose fallback (market may be closed)"
              : "Current price is null/undefined (no prevClose available)";
            console.log(
              `⚠️ [STOCK] executeStockPlan data.current is null/undefined:`,
              {
                hasData: !!exec.data,
                current: exec.data.current,
                currentType: typeof exec.data.current,
                prevClose: exec.data.prevClose,
                usingPrevCloseFallback:
                  exec.data._usingPrevCloseFallback || false,
                hasProfile: !!exec.data.profile,
                hasMetrics: !!exec.data.metrics,
                hasRecommendations: !!exec.data.recommendations,
                ticker: exec.ticker,
                reason: reason,
              }
            );
          }

          if (!exec.error && exec.data?.current != null) {
            // Flatten the structure: exec has { ticker, data: {...}, extra }
            // but buildStockDataSummary expects { ticker, current, profile, ... }
            stockData = {
              ...exec.data, // Spread all the snapshot data (current, profile, metrics, etc.)
              ticker: exec.ticker, // Ensure ticker is at top level
              planWants: exec.planWants, // Preserve plan wants for summary
              extra: exec.extra, // Preserve extra data (earnings, filings, etc.)
            };
            const priceSource = exec.data._usingPrevCloseFallback
              ? "prevClose (market closed)"
              : "current";
            console.log(
              `✅ [STOCK] Using stockData from executeStockPlan (price: ${exec.data.current}, source: ${priceSource})`
            );
          } else {
            const reason = exec.error
              ? `Error: ${exec.error}`
              : !exec.data
              ? "No data field"
              : exec.data.current == null
              ? "Current price is null (market may be closed or data unavailable)"
              : "Unknown reason";
            console.log(
              `🔄 [STOCK] Stock plan check failed (${reason}), falling back to simple query or fallback`
            );
          }
        } else if (stockOverride && !looksLikeStockDeepQuery(message)) {
          // Only use fast path if we have stockOverride AND it's not a deep query
          // Deep queries should always use the planning path above
          console.log(
            `\n🟢 [STOCK] STOCK OVERRIDE PATH (simple query): Fetching directly (ticker: ${stockOverride})`
          );
          logDebug(
            "🔍 [STOCK] Using stockOverride, skipping planStockRequest for faster response"
          );
          const snapshot = await fetchStockSnapshot(stockOverride);
          if (snapshot && !snapshot.error && snapshot.current != null) {
            stockData = {
              ...snapshot,
              ticker: stockOverride,
            };
            console.log(
              `✅ [STOCK] Using stockData from stockOverride (price: ${snapshot.current})`
            );
            console.log(
              `📊 [STOCK] Snapshot summary: price=$${
                snapshot.current
              }, hasProfile=${!!snapshot.profile}, hasMetrics=${!!snapshot.metrics}, recsCount=${
                snapshot.recommendations?.length || 0
              }, newsCount=${snapshot.news?.length || 0}`
            );
          } else {
            console.log(
              `⚠️ [STOCK] Stock snapshot failed for override ticker ${stockOverride}, will try simple query path`
            );
          }
        } else {
          // Simple stock query
          console.log(
            `\n🟡 [STOCK] SIMPLE QUERY PATH: Using cached data with fallback`
          );
          const stockResponse = await getCachedDataWithFallback(
            "stock_snapshot",
            stockOverride
              ? `override:${stockOverride}`
              : message.toLowerCase().trim(),
            async () => {
              if (stockOverride) {
                const snapshot = await fetchStockSnapshot(stockOverride);
                return {
                  ...snapshot,
                  ticker: stockOverride,
                  queryUsed: stockOverride,
                };
              }
              const { ticker, queryUsed } = await resolveTickerForQuery(
                message
              );
              if (!ticker) {
                return {
                  error: "Could not resolve ticker from query",
                  queryUsed,
                };
              }
              const snapshot = await fetchStockSnapshot(ticker);
              return { ...snapshot, ticker, queryUsed };
            },
            false
          );

          const data = stockResponse?.data || stockResponse;
          if (data && !data.error && data.current) {
            stockData = data;
          }
        }

        if (stockData && stockData.current != null) {
          // 🎯 MANUAL CONTEXT SETTING FOR STOCK QUERIES
          // Set conversation context manually to save API calls
          if (stockData.ticker) {
            const manualContext = {
              active_topic: "investment_analysis",
              last_entity: {
                type: "investment",
                symbol: stockData.ticker,
                action: null,
                amount: null,
              },
              pending_action: null,
            };

            // Update conversation context if available
            if (conversationContext) {
              Object.assign(conversationContext, manualContext);
              console.log("🎯 [STOCK] Manual context set:", manualContext);
            }
          }

          // Generate conversational stock response with context packs
          sendStockProgress(
            res,
            "🤖 Generating comprehensive analysis...",
            wantsStreaming
          );
          // Show another finance fact while generating analysis
          if (wantsStreaming && res) {
            setTimeout(() => {
              sendStockProgress(res, getRandomFinanceFact(), wantsStreaming);
            }, 1000);
          }

          const conversationalResponse =
            await generateConversationalStockResponse(
              stockData,
              message,
              userProfile,
              userMemory,
              investmentHoldings,
              stockPlan
            );

          // Ensure comprehensive analysis was generated (not just summary)
          const isComprehensiveAnalysis =
            conversationalResponse && conversationalResponse.length > 1000;
          if (!isComprehensiveAnalysis) {
            console.warn(
              `⚠️ [STOCK] Response appears to be summary (${
                conversationalResponse?.length || 0
              } chars), not comprehensive analysis`
            );
          }

          const response = {
            message: cleanResponseFormatting(conversationalResponse),
            type: "assistant",
            hideActions: true, // Always hide action buttons for final stock analysis
            hideFeedback: false, // Show feedback buttons for final analysis
            actions: [], // Ensure no actions are present
            _comprehensiveAnalysis: isComprehensiveAnalysis, // Internal flag for debugging
          };

          // Log with enhanced data
          setImmediate(() =>
            logConversation({
              user_message: redactPII(message),
              finny_response: redactPII(conversationalResponse),
              timestamp: new Date().toISOString(),
              user_id: context?.user_id || "unknown",
              intent: "ask_personalized",
              entities: [stockData.ticker, stockData.profile?.name].filter(
                Boolean
              ),
              confidence: 0.95,
              response_time_ms: Date.now() - startTime,
              sources_used: [
                "finnhub:quote",
                "finnhub:profile2",
                "finnhub:recommendation",
                stockData.priceTarget ? "finnhub:price-target" : null,
                stockPlan?.wants?.includes("earnings")
                  ? "finnhub:earnings"
                  : null,
                stockPlan?.wants?.includes("filings")
                  ? "finnhub:filings"
                  : null,
                stockPlan?.wants?.includes("insider")
                  ? "finnhub:insider"
                  : null,
              ].filter(Boolean),
              cached: false,
              request_id: generateRequestId(),
              metrics: {
                intent: "ask_personalized",
                latency_ms: { total: Date.now() - startTime },
                tools_used: [
                  {
                    name: "finnhub",
                    latency_ms: Date.now() - startTime,
                    cache_hit: false,
                  },
                  {
                    name: "llm_conversational",
                    latency_ms: 0, // Will be set by the function
                    cache_hit: false,
                  },
                ],
                model: PRIMARY_OPENROUTER_MODEL || STANDARD_MODEL,
                cache_hits: {},
                tokens: null,
                result: "success",
              },
            })
          );

          // 🔍 DEBUG: Save conversation context for stock queries
          console.log("🔍 [STOCK CONTEXT] Saving context for stock query");

          // Extract topic and entity for stock queries
          console.log("🔍 [STOCK CONTEXT] Detecting topic for stock query");
          const topicDetection = detectConversationTopic(
            message,
            context?.conversationContext // Use the context from the safe context object
          );
          const contextMetadata = {
            active_topic: topicDetection?.topic || "investment_analysis",
            last_entity: topicDetection?.entity || {
              type: "investment",
              symbol: stockData.ticker,
            },
            pending_action: topicDetection?.pending_action || null,
          };

          console.log(
            "🔍 [STOCK CONTEXT] Topic detection result:",
            topicDetection
          );
          console.log(
            "🔍 [STOCK CONTEXT] Stock data ticker:",
            stockData.ticker
          );
          console.log("🔍 [STOCK CONTEXT] Context metadata:", contextMetadata);

          // Save conversation context (best-effort, non-blocking)
          if (context?.chat_id) {
            setImmediate(async () => {
              try {
                const result = await withTimeout(
                  updateConversationContext(
                    context.user_id,
                    context.chat_id,
                    message,
                    response.message,
                    contextMetadata
                  ),
                  2000,
                  null
                );
                if (result === null) {
                  logWarn("⏰ [STOCK CONTEXT] Context save timed out");
                }
              } catch (error) {
                logError("❌ [STOCK CONTEXT] Context save failed:", error);
              }
            });
          }

          // Store conversation memory in Supermemory (async, non-blocking)
          if (userId && conversationalResponse) {
            setImmediate(async () => {
              try {
                await storeConversationMemory(
                  userId,
                  message,
                  conversationalResponse,
                  {
                    intent: "ask_personalized",
                    userName: context?.profile?.name || null,
                    chat_id: context?.chat_id,
                    topic: contextMetadata.active_topic,
                    entity: contextMetadata.last_entity,
                    stock_ticker: stockData.ticker,
                  }
                );
              } catch (error) {
                console.error(
                  "❌ [FINNY] Failed to store stock conversation memory:",
                  error
                );
                // Non-fatal, don't break conversation flow
              }
            });
          }

          return response;
        } else {
          // Stock APIs failed or returned incomplete data, use fallback analysis
          const fallbackReason = stockData
            ? "Stock data exists but current price is null (market may be closed)"
            : "Stock APIs failed or returned no data";
          console.log(
            `🔄 [FALLBACK] ${fallbackReason}, using fallback analysis`
          );
          const fallbackResponse = await generateFallbackStockAnalysis(
            stockOverride,
            message,
            userProfile,
            userMemory
          );

          const response = {
            message: cleanResponseFormatting(fallbackResponse),
            type: "assistant",
          };

          // Log fallback usage
          setImmediate(() =>
            logConversation({
              user_message: redactPII(message),
              finny_response: redactPII(fallbackResponse),
              timestamp: new Date().toISOString(),
              user_id: context?.user_id || "unknown",
              intent: "ask_personalized",
              entities: [],
              confidence: 0.7,
              response_time_ms: Date.now() - startTime,
              sources_used: ["fallback_analysis"],
              cached: false,
              request_id: generateRequestId(),
              metrics: {
                intent: "ask_personalized",
                latency_ms: { total: Date.now() - startTime },
                tools_used: [
                  {
                    name: "fallback_analysis",
                    latency_ms: Date.now() - startTime,
                    cache_hit: false,
                  },
                ],
                model: SMALLER_MODEL,
                cache_hits: {},
                tokens: null,
              },
              context_used: {
                user_profile: userProfile,
                user_memory: userMemory ? "loaded" : "none",
                investment_holdings: investmentHoldings ? "loaded" : "none",
                conversation_context: conversationContext ? "loaded" : "none",
              },
              fallback_used: true,
            })
          );

          // Store conversation memory in Supermemory (async, non-blocking)
          if (userId && fallbackResponse) {
            setImmediate(async () => {
              try {
                await storeConversationMemory(
                  userId,
                  message,
                  fallbackResponse,
                  {
                    intent: "ask_personalized",
                    userName: context?.profile?.name || null,
                    chat_id: context?.chat_id,
                    fallback_used: true,
                  }
                );
              } catch (error) {
                console.error(
                  "❌ [FINNY] Failed to store fallback conversation memory:",
                  error
                );
                // Non-fatal, don't break conversation flow
              }
            });
          }

          return response;
        }
      } catch (e) {
        console.log(
          "ℹ️ [FINNY] Conversational stock handler failed, falling back:",
          e?.message
        );
      }
    }

    // 4) Detect user state for context-aware prompting

    const financialDataForState = {
      base: packs.base,
      cashflow: packs.cashflow,
      spend: packs.spend,
      invest: packs.invest, // Investment holdings
      goals: packs.goals, // Financial goals
      categoryDetails: packs.categoryDetails, // Category transaction details for analysis
      transactions: packs.base?.recentTransactions || [],
      accounts: packs.base?.accounts || packs.accounts || [], // Include accounts for credit utilization detection
    };

    logInfo(`🔍 [FINANCIAL_DATA] Building financialDataForState:`, {
      hasBase: !!packs.base,
      hasSpend: !!packs.spend,
      hasCategoryDetails: !!packs.categoryDetails,
      categoryDetailsTransactionCount:
        packs.categoryDetails?.transactions?.length || 0,
    });
    const userState = detectUserState(
      message,
      financialDataForState,
      classificationResult
    );

    // Consolidated user state log with better formatting
    console.log(`\n🎯 [USER_STATE] Detected:`);
    console.log(
      `   └─ Emotional: ${
        userState.emotionalState
      } (confidence: ${userState.confidence.emotional.toFixed(
        2
      )}) | Financial: ${userState.financialState} | Urgency: ${
        userState.urgency
      }`
    );
    if (classificationResult) {
      console.log(
        `   └─ Classification: ${classificationResult.intent} (${
          classificationResult.intent_type || "none"
        }) | Confidence: ${classificationResult.confidence.toFixed(2)}`
      );
    }
    if (userState.needs.length > 0) {
      console.log(`   └─ Needs: [${userState.needs.join(", ")}]`);
    }

    // 5) Build context-aware prompt using new prompt engine
    // Pass finny_style directly to prompt engine (now handled early in prompt)
    const finnyStyle = context.profile?.finny_style || null;

    // Build feedback context if available (for prompt engine)
    let feedbackContext = null;
    if (context.feedbackPatterns) {
      feedbackContext = buildFeedbackContext(context.feedbackPatterns);
      if (feedbackContext) {
        const { preferences, deepInsights } = context.feedbackPatterns;
        // Single consolidated log with visual formatting
        const prefList =
          preferences.length > 0
            ? preferences.map((pref, idx) => `${idx + 1}. ${pref}`).join(" | ")
            : "none";
        console.log(
          `\n📋 [ADAPTATION] Feedback Context Added: ${preferences.length} preferences, ${deepInsights.length} deep insights | ${prefList}`
        );
      }
    }

    // Add feedback context to context object for prompt engine
    const contextWithFeedback = {
      ...context,
      feedbackContext,
    };

    // Build complete prompt using 6-layer architecture
    // Prompt engine now handles: web context, feedback patterns, memories, intent context, user prompt
    const shouldOfferCoachFollowUp =
      !userRefused &&
      (decisionRisk === "high" ||
        decisionRisk === "medium" ||
        infoSufficiency === "unknown") &&
      deterministicChance(
        `${userId}:${context?.chat_id || ""}:${message}`,
        0.5
      );

    const coachingRuntimeFlags = [
      `COACHING_FLAGS:`,
      `- ambiguous_intent_detected: ${ambiguousIntent}`,
      `- clarify_one_question_only: ${shouldClarifyAmbiguity}`,
      `- offer_single_followup_question: ${shouldOfferCoachFollowUp}`,
      `- user_refused_to_answer: ${userRefused}`,
      `- decision_risk: ${decisionRisk}`,
      `- info_sufficiency: ${infoSufficiency}`,
    ].join("\n");

    const classificationHeader = classificationResult
      ? `CLASSIFICATION:\n- needs_clarification: ${
          classificationResult.needs_clarification
        }\n- info_sufficiency: ${
          classificationResult.info_sufficiency
        }\n- decision_risk: ${
          classificationResult.decision_risk
        }\n- missing_fields: ${JSON.stringify(
          classificationResult.missing_fields || []
        )}`
      : null;

    const runtimeHeader = [
      contextHeader,
      classificationHeader,
      coachingRuntimeFlags,
    ]
      .filter(Boolean)
      .join("\n\n");

    const system = buildContextAwarePrompt(
      message,
      contextWithFeedback,
      financialDataForState,
      userState,
      finnyStyle,
      classificationResult, // Pass classification result for intent-first architecture
      webSummary, // Web context
      runtimeHeader // Context header (+ classification)
    );

    // Build minimal user message context (query-specific data only, not raw dumps)
    // Financial data is already synthesized in prompt engine Layer 2
    // Only include query-specific context that prompt engine can't synthesize
    const contextLines = [];

    // Add conversation context if available (for continuity)
    if (conversationContext?.active_topic || conversationContext?.last_entity) {
      if (conversationContext.active_topic) {
        contextLines.push(`Active topic: ${conversationContext.active_topic}`);
      }
      if (
        conversationContext.last_entity &&
        Object.keys(conversationContext.last_entity).length > 0
      ) {
        contextLines.push(
          `Last entity: ${JSON.stringify(conversationContext.last_entity)}`
        );
      }
      if (conversationContext.pending_action) {
        contextLines.push(
          `Pending action: ${conversationContext.pending_action}`
        );
      }
    }

    // Only add query-specific data that's needed for this specific query
    // The prompt engine already has synthesized financial data
    // Only add here if user explicitly asks for specific data (e.g., "show me my accounts")
    const contextNote = contextLines.length > 0 ? contextLines.join("\n") : "";

    // 5) Parallel processing: Main response + Memory extraction
    const llmT0 = Date.now();

    // Build user message (minimal context - financial data is in system prompt)
    const userMessage = contextNote
      ? `Context:\n${contextNote}\n\nUser: ${message}`
      : message;

    // Log prompt summary
    const promptSize = Math.round(system.length / 100) / 10;
    const contextSize = Math.round(contextNote.length / 100) / 10;
    logInfo(
      `📝 [PROMPT] Ready (system: ${promptSize}k chars, context: ${contextSize}k chars)`
    );

    // Log complete system prompt with clear dividers
    console.log("\n" + "=".repeat(100));
    console.log("📋 [PROMPT_ENGINE] COMPLETE SYSTEM PROMPT SENT TO LLM");
    console.log("=".repeat(100));
    console.log(system);
    console.log("=".repeat(100));
    console.log("📋 [PROMPT_ENGINE] USER MESSAGE");
    console.log("=".repeat(100));
    console.log(userMessage);
    console.log("=".repeat(100) + "\n");

    // Memory extraction removed - migrating to Supermemory
    let memoryExtraction = [];

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
            temperature: 0.25,
            max_tokens: 10000,
            stream: false,
            reasoning: { effort: "minimal", exclude: true }, // Disable reasoning output, only return actual response
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: userMessage,
              },
            ],
          }),
        }
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`OpenRouter error ${resp.status}: ${errorText}`);
      }
      return resp;
    }

    // For ask_personalized: Use reasoning model (meta-llama/llama-4-scout) as primary, STANDARD_MODEL as fallback
    const llmModels = [
      REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout",
      STANDARD_MODEL,
      TERTIARY_MODEL,
    ];

    let resp;
    let usedModel = REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout";
    try {
      const llmResult = await callWithFallback(
        llmModels,
        callMainLLM,
        20000,
        "LLM"
      );
      resp = llmResult.result;
      usedModel = llmResult.model;
    } catch (llmError) {
      logError("❌ [FINNY] All LLM attempts failed:", llmError?.message);
      return {
        message: cleanResponseFormatting(
          "Sorry — I'm having trouble reaching the model right now. Please try again."
        ),
        type: "assistant",
        hideActions: true,
      };
    }

    // Memory extraction removed - migrating to Supermemory for memory management
    memoryExtraction = [];

    // Measure LLM response time (single measurement, not duplicated)
    timings.llm_ms = Date.now() - llmT0;
    // Update parent timings if provided
    if (requestTimings) {
      requestTimings.llm_ms = timings.llm_ms;
    }
    toolsUsed.push({
      name: "llm",
      latency_ms: timings.llm_ms,
      cache_hit: false,
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      logError("❌ [FINNY] OpenRouter API error:", resp.status);
      logError("❌ [FINNY] Error response:", errorText);
      try {
        const errorData = JSON.parse(errorText);
        logError(
          "❌ [FINNY] Parsed error:",
          JSON.stringify(errorData, null, 2)
        );
      } catch (e) {
        logError("❌ [FINNY] Could not parse error response");
      }
      return {
        message: cleanResponseFormatting("I'm glitching right now—try again."),
        type: "assistant",
      };
    }

    const data = await resp.json();
    logInfo("✅ [LLM] Response received (status:", resp.status + ")");

    // Extract response content
    const responseMessage = data.choices?.[0]?.message || {};
    const finishReason = data.choices?.[0]?.finish_reason;
    const usage = data.usage || {};

    // Check if response was cut off due to token limits
    if (finishReason === "length" && !responseMessage.content) {
      logWarn("⚠️ [LLM] Response cut off due to token limit!");
      logWarn("⚠️ [LLM] Token usage:", {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        reasoning_tokens: usage.reasoning_tokens,
        max_tokens: 12000,
      });
      logWarn("⚠️ [LLM] Model may be using reasoning tokens despite exclusion");
    }

    const cleanText =
      responseMessage.content || "I'm not sure yet. Ask me again?";

    logInfo("📝 [LLM] Response length:", cleanText?.length || 0, "chars");
    if (usage.reasoning_tokens) {
      logInfo("🧠 [LLM] Reasoning tokens used:", usage.reasoning_tokens);
    }

    if (cleanText === "I'm not sure yet. Ask me again?") {
      logWarn("⚠️ [LLM] Using fallback response!");
      if (finishReason === "length") {
        logWarn(
          "⚠️ [LLM] Response was cut off - consider using a non-reasoning model or increasing max_tokens further"
        );
      }
    }

    // Memory saving will happen after topic detection (see below)

    // Basic response validation (log warnings, don't block)
    const validationIssues = [];

    // Check 1: Intent fulfillment (basic check)
    if (classificationResult?.intent) {
      const intentKeywords = {
        ask_personalized: ["you", "your", "spend", "account", "goal", "invest"],
        goal_conversation: ["goal", "save", "target", "create"],
        off_topic: [], // Off-topic handled separately
      };
      const keywords = intentKeywords[classificationResult.intent] || [];
      const responseLower = cleanText.toLowerCase();
      const hasIntentKeywords =
        keywords.length === 0 ||
        keywords.some((k) => responseLower.includes(k));

      if (!hasIntentKeywords && classificationResult.confidence > 0.8) {
        validationIssues.push(
          `Low intent match for ${classificationResult.intent}`
        );
      }
    }

    // Check 2: Response length (too short might be incomplete)
    if (cleanText.length < 50 && classificationResult?.intent !== "off_topic") {
      validationIssues.push("Response too short (<50 chars)");
    }

    // Check 3: Crisis mode compliance (if crisis detected)
    if (
      userState.emotionalState === "panicked" &&
      userState.confidence.emotional > 0.8
    ) {
      const hasLongTermTerms = /retirement|invest|long.term|future|years/.test(
        cleanText.toLowerCase()
      );
      if (hasLongTermTerms) {
        validationIssues.push(
          "Crisis mode: Response mentions long-term planning (should be immediate only)"
        );
      }
    }

    // Log validation results
    if (validationIssues.length > 0) {
      logWarn("⚠️ [VALIDATION] Response validation issues:");
      validationIssues.forEach((issue, idx) => {
        logWarn(`   ${idx + 1}. ${issue}`);
      });
    } else {
      logInfo("✅ [VALIDATION] Response passed basic validation checks");
    }

    // Clean any markdown formatting from the response
    const cleanedMessage = cleanResponseFormatting(
      gaps.length > 0
        ? `${cleanText}\n\n(Using available data - some data may be incomplete.)`
        : cleanText
    );

    // For streaming: frontend handles splitting during stream (no backend splitting needed)
    // For non-streaming: split long responses into digestible chunks for better UX
    let response;
    if (wantsStreaming) {
      // Streaming - send raw text, frontend will split intelligently
      response = {
        message: cleanedMessage,
        type: "assistant",
        isSplit: false,
      };
    } else {
      // Non-streaming - split on backend for backward compatibility
      const splitMessages = splitLongResponse(cleanedMessage);
      response = {
        message:
          splitMessages.length === 1 ? splitMessages[0].content : splitMessages,
        type: "assistant",
        isSplit: splitMessages.length > 1,
      };
    }

    // Log the conversation
    // Bug fix: Log cleanedMessage (actual response sent to user) instead of cleanText (raw LLM output)
    const conversationData = {
      user_message: redactPII(message),
      finny_response: redactPII(cleanedMessage),
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: classificationResult?.intent || "ask_personalized",
      entities: [],
      confidence: classificationResult?.confidence || 1.0,
      response_time_ms: Date.now() - startTime,
      sources_used:
        webResults.length > 0 ? [...toolsUsed, "brave-search"] : toolsUsed,
      cached: false,
      context_packs: Object.keys(packs),
      data_gaps: gaps,
      request_id: generateRequestId(),
      web_research: webResults.length > 0,
      classification_result: classificationResult,
      validation_issues: validationIssues.length > 0 ? validationIssues : null,
      metrics: {
        intent: "ask_personalized",
        latency_ms: {
          total: Date.now() - startTime,
          llm: timings.llm_ms,
          data_fetch: timings.summary_ms + timings.user_data_ms,
          web_search: timings.web_ms,
        },
        tools_used: toolsUsed,
        model: usedModel,
        cache_hits: {},
        tokens: null,
        result: gaps.length > 0 ? "degraded" : "success",
      },
    };

    // Log conversation asynchronously to avoid adding latency
    setImmediate(() => logConversation(conversationData));

    // Detect conversation topic and extract relevant entities
    const topicDetection = detectConversationTopic(
      message,
      context?.conversationContext // Use the context from the safe context object
    );
    const contextMetadata = {
      active_topic: topicDetection.topic,
      last_entity: topicDetection.entity,
      pending_action: topicDetection.pending_action,
    };

    // Log topic detection for debugging (only if topic detected)
    if (topicDetection.topic) {
      logInfo(`🎯 [TOPIC] Detected: ${topicDetection.topic}`);
    }

    // Update conversation context (best-effort, non-blocking)
    if (context?.chat_id) {
      setImmediate(async () => {
        try {
          const result = await withTimeout(
            updateConversationContext(
              context.user_id,
              context.chat_id,
              message,
              response.message, // Use updated message with goal offer
              contextMetadata
            ),
            2000,
            null
          );
          if (result === null) {
            logWarn("⏰ [CONTEXT] Conversation context update timed out");
          }
        } catch (error) {
          logError("❌ [CONTEXT] Conversation context update failed:", error);
        }
      });
    }

    // Store conversation memory in Supermemory (async, non-blocking)
    // Use cleanedMessage (actual response text) instead of cleanText (raw LLM output)
    const responseTextForStorage =
      cleanedMessage ||
      cleanText ||
      (Array.isArray(response.message)
        ? response.message.map((m) => m.content || m).join("\n\n")
        : response.message || "");

    if (userId && responseTextForStorage) {
      setImmediate(async () => {
        try {
          await storeConversationMemory(
            userId,
            message,
            responseTextForStorage,
            {
              intent: intent,
              chat_id: context?.chat_id,
              topic: topicDetection?.topic,
              entity: topicDetection?.entity,
              userName: context?.profile?.name || null,
            }
          );
        } catch (error) {
          console.error(
            "❌ [FINNY] Failed to store conversation memory:",
            error
          );
          // Non-fatal, don't break conversation flow
        }
      });
    }

    // Update handler time in parent timings if provided
    if (requestTimings) {
      requestTimings.handler_ms = Date.now() - startTime;
    }

    return response;
  } catch (error) {
    console.error("❌ [FINNY] Ask handler error:", error);
    // Update handler time even on error
    if (requestTimings) {
      requestTimings.handler_ms = Date.now() - startTime;
    }
    return {
      message: cleanResponseFormatting(
        "I'm having some technical difficulties right now. Please try again in a moment."
      ),
      type: "assistant",
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
  if (normalized.isSplit == null && answer.isSplit != null) {
    normalized.isSplit = answer.isSplit;
  }
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
// Clean markdown and formatting from responses to ensure chat-friendly format

function cleanResponseFormatting(response) {
  if (!response || typeof response !== "string") {
    return response;
  }

  let cleaned = response;

  // Remove markdown headers (### Header, ## Header, # Header)
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "");

  // Remove markdown headers with emojis (### 1️⃣ Header)
  cleaned = cleaned.replace(
    /^#{1,6}\s*[\d\w]*[\u{1F300}-\u{1F9FF}]+\s*/gmu,
    ""
  );

  // Remove double underscore bold markdown (__text__) but keep double asterisks for your chat system
  cleaned = cleaned.replace(/__(.*?)__/g, "$1");

  // Remove single underscore italic markdown (_text_) but keep asterisks
  cleaned = cleaned.replace(/_(.*?)_/g, "$1");

  // Remove code blocks (```code``` or `code`)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // Convert markdown tables to plain text format (preserve content, remove table formatting)
  // Process table rows line by line to preserve content
  cleaned = cleaned
    .split("\n")
    .map((line) => {
      // If line contains table separators (|), convert to readable format
      if (line.includes("|") && line.trim().startsWith("|")) {
        // Extract cells from table row
        const cells = line
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell && !cell.match(/^[-:]+$/)); // Remove separator rows
        if (cells.length > 0) {
          return cells.join(" | ");
        }
      }
      return line;
    })
    .join("\n");

  // Remove horizontal rules (--- or ***)
  cleaned = cleaned.replace(/^[-*]{3,}$/gm, "");

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]+$/gm, "");

  // Remove standalone hashtags
  cleaned = cleaned.replace(/^#+\s*$/gm, "");

  return cleaned.trim();
}

// === SIMPLE MESSAGE SPLITTING ===
// Split long responses using only natural boundaries (double line breaks, complete sentences)
function splitLongResponse(text) {
  if (!text || typeof text !== "string") {
    return [{ type: "text", content: text }];
  }

  // If response is short enough, return as single message
  if (text.length <= 600) {
    return [{ type: "text", content: text }];
  }

  console.log(
    `[Message Splitting] Response length: ${text.length} characters - splitting needed`
  );

  // Try to split at double line breaks first (natural paragraph boundaries)
  const paragraphs = text.split(/\n\s*\n/);

  if (paragraphs.length > 1) {
    const chunks = [];
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();

      // If adding this paragraph would exceed 500 chars, start a new chunk
      if (
        currentChunk.length + trimmedParagraph.length > 500 &&
        currentChunk.trim()
      ) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedParagraph;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + trimmedParagraph;
      }
    }

    // Add the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // If we have multiple chunks, return them
    if (chunks.length > 1) {
      console.log(
        `[Message Splitting] Split into ${chunks.length} chunks using paragraph boundaries`
      );
      return chunks.map((chunk) => ({
        type: "text",
        content: chunk,
      }));
    }
  }

  // If no good paragraph boundaries or still too long, split at complete sentences only
  const sentences = text.split(/(?<=[.!?])\s+/);

  if (sentences.length > 1) {
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();

      // If adding this sentence would exceed 500 chars, start a new chunk
      if (
        currentChunk.length + trimmedSentence.length > 500 &&
        currentChunk.trim()
      ) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedSentence;
      } else {
        currentChunk += (currentChunk ? " " : "") + trimmedSentence;
      }
    }

    // Add the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    // Only return multiple chunks if we actually have them
    if (chunks.length > 1) {
      console.log(
        `[Message Splitting] Split into ${chunks.length} chunks using sentence boundaries`
      );
      return chunks.map((chunk) => ({
        type: "text",
        content: chunk,
      }));
    }
  }

  // If all else fails and it's still too long, send as single message
  console.log(
    `[Message Splitting] Could not find good split points - sending as single message`
  );
  return [{ type: "text", content: text }];
}

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
    "current",
    "latest",
    "recent",
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

    // Question patterns
    "what is the current",
    "what are the current",
    "what's the current",
    "what is the latest",
    "what are the latest",
    "what's the latest",
    "what are the best",
    "what's the best",
    "current rates",
    "latest news",
  ];

  return webKeywords.some((keyword) => lowerMessage.includes(keyword));
}

// Enhanced off-topic detection with confidence scoring

// === CONTEXT PLANNER ===
// Deterministic context planning to fix "sometimes it works" issue

function planNeeds(slots, message) {
  const needs = ["summary_min"];

  switch (slots.topic) {
    case "spend":
      // HARD GUARDRAIL: For spend questions, ALWAYS include both spend_total and txns_by_category
      needs.push("spend_total", "txns_by_category");
      break;
    case "merchant":
      needs.push("merchant_breakdown");
      break;
    case "accounts":
      // summary_min already covers basic account info
      break;
    case "invest":
    case "retirement":
      // HARD GUARDRAIL: For invest/retirement questions, ALWAYS include both summary_min and invest_holdings
      needs.push("invest_holdings");
      break;
    case "goals":
      // HARD GUARDRAIL: For goals questions, ALWAYS include both goals_overview and cashflow_monthly
      needs.push("goals_overview", "cashflow_monthly");
      break;
  }

  // ADDITIONAL GUARDRAILS: Force critical data combinations
  if (slots.topic === "spend" && slots.category) {
    // If asking about specific category spending, ensure we have both total and category breakdown
    if (!needs.includes("spend_total")) needs.push("spend_total");
    if (!needs.includes("txns_by_category")) needs.push("txns_by_category");
  }

  if (slots.topic === "retirement" || slots.topic === "invest") {
    // For any investment/retirement question, ensure we have holdings data
    if (!needs.includes("invest_holdings")) needs.push("invest_holdings");
  }

  if (
    message.toLowerCase().includes("goal") ||
    message.toLowerCase().includes("save") ||
    message.toLowerCase().includes("target")
  ) {
    // For any goals question, ensure we have both goals and cashflow
    if (!needs.includes("goals_overview")) needs.push("goals_overview");
    if (!needs.includes("cashflow_monthly")) needs.push("cashflow_monthly");
  }

  return needs;
}

function extractSlots(message) {
  const lowerMessage = message.toLowerCase();

  // Detect topic
  let topic;
  if (
    lowerMessage.includes("spen") ||
    lowerMessage.includes("expense") ||
    lowerMessage.includes("food") ||
    lowerMessage.includes("shopping") ||
    lowerMessage.includes("utilities") ||
    lowerMessage.includes("internet") ||
    lowerMessage.includes("phone") ||
    lowerMessage.includes("cable") ||
    lowerMessage.includes("rent") ||
    lowerMessage.includes("mortgage")
  ) {
    topic = "spend";
  } else if (
    lowerMessage.includes("merchant") ||
    lowerMessage.includes("chipotle") ||
    lowerMessage.includes("starbucks") ||
    lowerMessage.includes("amazon")
  ) {
    topic = "merchant";
  } else if (
    lowerMessage.includes("account") ||
    lowerMessage.includes("balance") ||
    lowerMessage.includes("bank") ||
    lowerMessage.includes("credit card") ||
    lowerMessage.includes("debit card") ||
    lowerMessage.includes("loan") ||
    lowerMessage.includes("mortgage") ||
    lowerMessage.includes("rent")
  ) {
    topic = "accounts";
  } else if (
    lowerMessage.includes("invest") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("stock") ||
    lowerMessage.includes("retirement") ||
    lowerMessage.includes("holdings") ||
    lowerMessage.includes("what do i own") ||
    lowerMessage.includes("my investments") ||
    lowerMessage.includes("my portfolio")
  ) {
    topic = lowerMessage.includes("retirement") ? "retirement" : "invest";
  } else if (
    lowerMessage.includes("goal") ||
    lowerMessage.includes("save") ||
    lowerMessage.includes("target")
  ) {
    topic = "goals";
  }

  // Detect category
  let category;
  const categoryPatterns = [
    "food",
    "groceries",
    "shopping",
    "entertainment",
    "transportation",
    "travel",
    "rent",
    "mortgage",
    "utilities",
    "internet",
    "phone",
  ];

  // Map detected patterns to actual database categories
  const categoryMapping = {
    food: "Food",
    groceries: "Groceries",
    shopping: "Shopping",
    entertainment: "Entertainment",
    transportation: "Transportation",
    travel: "Travel",
    rent: "Housing",
    mortgage: "Housing",
    utilities: "Utilities",
    internet: "Utilities",
    phone: "Utilities",
  };

  for (const pattern of categoryPatterns) {
    if (lowerMessage.includes(pattern)) {
      category = categoryMapping[pattern] || pattern;
      break;
    }
  }

  // Detect merchant
  let merchant;
  const merchantPatterns = [
    "chipotle",
    "starbucks",
    "mcdonalds",
    "uber",
    "lyft",
    "amazon",
    "target",
    "walmart",
    "netflix",
    "spotify",
  ];
  for (const pattern of merchantPatterns) {
    if (lowerMessage.includes(pattern)) {
      merchant = pattern;
      break;
    }
  }

  // Detect period
  let period;
  let monthsCount = null; // Track multi-month queries for get_spend_by_category_periods
  const now = new Date();

  // Multi-month patterns (e.g., "last 6 months", "past 3 months")
  const multiMonthMatch = lowerMessage.match(
    /(?:last|past|previous)\s+(\d+)\s+months?/
  );
  if (multiMonthMatch) {
    monthsCount = parseInt(multiMonthMatch[1], 10);
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - monthsCount,
      1
    );
    period = {
      start: startDate.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
      months: monthsCount, // Flag for using get_spend_by_category_periods
    };
  }
  // Multi-year patterns (e.g., "last 1 year", "past 2 years", "last year")
  else if (
    lowerMessage.includes("last year") ||
    lowerMessage.includes("past year") ||
    lowerMessage.includes("previous year")
  ) {
    // Check for "last 1 year" or "past 1 year" explicitly
    const yearMatch = lowerMessage.match(
      /(?:last|past|previous)\s+(\d+)\s+years?/
    );
    if (yearMatch) {
      const yearsCount = parseInt(yearMatch[1], 10);
      monthsCount = yearsCount * 12;
    } else {
      // Default to 1 year if just "last year" or "past year"
      monthsCount = 12;
    }
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - monthsCount,
      1
    );
    period = {
      start: startDate.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
      months: monthsCount,
    };
  } else if (lowerMessage.includes("last month")) {
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    period = {
      start: firstOfLastMonth.toISOString().split("T")[0],
      end: lastOfLastMonth.toISOString().split("T")[0],
    };
  } else if (lowerMessage.includes("this month")) {
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    period = {
      start: firstOfThisMonth.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
    };
  } else if (lowerMessage.includes("last week")) {
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    period = {
      start: lastWeek.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
    };
  } else if (
    lowerMessage.includes("last 30 days") ||
    lowerMessage.includes("past 30 days")
  ) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    period = {
      start: thirtyDaysAgo.toISOString().split("T")[0],
      end: now.toISOString().split("T")[0],
    };
  }

  return {
    intent: "ask",
    topic,
    category,
    merchant,
    period,
  };
}

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
        // For category transactions, include category and period in cache key
        if (slots?.category && slots?.period) {
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
        cacheParams
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
          ", "
        )}]\nDATA_GAPS: []`,
      };
    }

    logInfo(
      `🚀 [FINNY] Building context packs for remaining needs: [${remainingNeeds.join(
        ", "
      )}]`
    );

    // OPTIMIZED: Create optimized fetch operations with better batching
    const fetchOperations = await createOptimizedFetchOperations(
      userId,
      remainingNeeds,
      slots
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
    logInfo(
      `🚀 [FINNY] Executing ${fetchOperations.length} optimized fetch operations in parallel...`
    );

    const results = await Promise.allSettled(
      fetchOperations.map((op) => executeFetchOperation(op))
    );

    const fetchTime = Date.now() - startTime;
    logInfo(`✅ [FINNY] All fetch operations completed in ${fetchTime}ms`);

    // OPTIMIZED: Process results with better error handling and caching
    processFetchResults(results, fetchOperations, packs, gaps);
  } catch (error) {
    logError("❌ [FINNY] Error building context packs:", error);
    // Add all needs as gaps if there's a critical error
    needs.forEach((need) => {
      if (!gaps.includes(need)) gaps.push(need);
    });
  }

  const includedPacks = Object.keys(packs);
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
      addOperation("summary_min", {
        key: "summary_min",
        type: "summary_min",
        userId,
        cached: false,
        priority: 1,
        fetchers: [
          {
            name: "net_worth",
            rpc: "get_net_worth",
            params: { p_user_id: userId },
          },
          {
            name: "recent_transactions",
            rpc: "get_recent_transactions",
            params: { p_user_id: userId, p_limit: 5 },
          },
          {
            name: "spend_by_category",
            rpc: "get_spend_by_category",
            params: {
              p_user_id: userId,
              p_start: getDateRange(30).start,
              p_end: getDateRange(30).end,
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

  // 3. Category transactions operation (OPTIMIZED: Combine category_details and txns_by_category)
  logInfo(
    `🔍 [CATEGORY_TXNS] Checking if operation needed - category: ${
      slots?.category
    }, period: ${slots?.period ? JSON.stringify(slots.period) : "undefined"}`
  );
  if (slots?.category && slots?.period) {
    const cacheKey = `category_transactions_${slots.category}_${slots.period.start}_${slots.period.end}`;
    logInfo(`🔍 [CATEGORY_TXNS] Checking cache with key: ${cacheKey}`);
    const cachedCategoryTxns = await getCachedUserData(
      "category_transactions",
      userId,
      {
        category: slots.category,
        period: slots.period,
      }
    );
    logInfo(
      `🔍 [CATEGORY_TXNS] Cache result: ${cachedCategoryTxns ? "HIT" : "MISS"}`
    );

    // Check if this is a multi-month query (use get_spend_by_category_periods for trends)
    const isMultiMonthQuery = slots.period.months && slots.period.months > 1;
    logInfo(
      `🔍 [CATEGORY_TXNS] Is multi-month query: ${isMultiMonthQuery}, months: ${slots.period.months}`
    );

    if (cachedCategoryTxns) {
      // Use cached data for both category_details and txns_by_category needs
      addOperation(cacheKey, {
        key: cacheKey,
        type: "category_transactions",
        userId,
        category: slots.category,
        period: slots.period,
        cached: true,
        data: cachedCategoryTxns,
        priority: 2,
        servesNeeds: ["category_details", "txns_by_category"], // This operation serves both needs
      });
    } else {
      // For multi-month queries, use get_spend_by_category_periods for monthly breakdown
      // For single period queries, use get_transactions_by_category for detailed transactions
      const fetchers = [];

      if (isMultiMonthQuery) {
        // Add monthly breakdown for multi-month queries
        fetchers.push({
          name: "category_spend_by_periods",
          rpc: "get_spend_by_category_periods",
          params: {
            p_user_id: userId,
            p_months: slots.period.months,
          },
        });
      }

      // Always fetch detailed transactions for the period
      const categoryTxnParams = {
        p_user_id: userId,
        p_category: slots.category,
        p_start: slots.period.start,
        p_end: slots.period.end,
      };
      logInfo(
        `🔍 [CATEGORY_TXNS] Creating RPC call to get_transactions_by_category with params:`,
        JSON.stringify(categoryTxnParams, null, 2)
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
        period: slots.period,
        cached: false,
        priority: 2,
        servesNeeds: ["category_details", "txns_by_category"],
        fetchers,
      });
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
      `🔍 [RPC] Executing ${operation.fetchers.length} fetchers for operation: ${operation.key} (type: ${operation.type})`
    );
    const fetcherPromises = operation.fetchers.map((fetcher) => {
      logInfo(
        `🔍 [RPC] Calling ${fetcher.rpc} with params:`,
        JSON.stringify(fetcher.params, null, 2)
      );
      return withTimeout(supabase.rpc(fetcher.rpc, fetcher.params), 2000, null)
        .then((result) => {
          // Preserve fetcher metadata in result for processing
          return { ...result, name: fetcher.name, rpc: fetcher.rpc };
        })
        .catch((error) => {
          logError(
            `❌ [RPC] ${fetcher.name} (${fetcher.rpc}) fetch failed:`,
            error
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
      }))
    );

    // Process results based on operation type
    logInfo(
      `🔍 [PROCESS] Processing operation ${operation.key} (type: ${operation.type}) with ${results.length} results`
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
        : "NULL - No data processed"
    );

    if (processedData) {
      // Cache the processed data
      await cacheOperationData(operation, processedData);
      return { success: true, data: processedData, cached: false };
    } else {
      logWarn(
        `⚠️ [PROCESS] Operation ${operation.key} returned no valid data. Results were:`,
        results
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
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const operation = operations[i];

    if (result.status === "fulfilled" && result.value.success) {
      const { data, cached } = result.value;

      // Process data based on operation type
      switch (operation.type) {
        case "category_transactions":
          // This operation can serve both category_details and txns_by_category
          logInfo(
            `🔍 [PACKS] Setting categoryDetails pack with ${
              data?.transactions?.length || 0
            } transactions`
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
                `✅ [PACKS] categoryDetails set (serves txns_by_category)`
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
              packs.categoryDetails?.transactions
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

// OPTIMIZED: Process summary data from multiple RPC calls
function processSummaryData(results) {
  const [netWorthRes, recentRes, spendCatRes] = results;

  const net = netWorthRes?.data?.[0] || null;
  if (!net) {
    console.log("⚠️ [SUMMARY_DATA] No net worth data in RPC response");
    return null;
  }

  // Log raw net worth data for debugging
  console.log("📊 [SUMMARY_DATA] Raw net worth from RPC:", {
    net_worth: net.net_worth,
    liquid_assets: net.liquid_assets,
    investments_total: net.investments_total,
    total_liabilities: net.total_liabilities,
    bank_accounts_count: Array.isArray(net.bank_accounts)
      ? net.bank_accounts.length
      : 0,
  });

  const recent = Array.isArray(recentRes?.data) ? recentRes.data : [];
  const spendCats = Array.isArray(spendCatRes?.data) ? spendCatRes.data : [];

  return {
    netWorth: Number(net.net_worth || 0),
    liquidAssets: Number(net.liquid_assets || 0),
    investmentsTotal: Number(net.investments_total || 0),
    totalLiabilities: Number(net.total_liabilities || 0),
    recentTransactions: recent.slice(0, 5).map((txn) => ({
      date: txn.date,
      amount: txn.amount,
      merchant: txn.merchant || txn.name,
    })),
    spendByCategory: spendCats,
    accounts: Array.isArray(net.bank_accounts) ? net.bank_accounts : [],
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
      period: operation.period,
      resultsCount: results.length,
    }
  );

  // Results can contain: [category_spend_by_periods, category_transactions] for multi-month queries
  // Or just: [category_transactions] for single period queries
  const txnRes =
    results.find((r) => r?.name === "category_transactions") ||
    results[results.length - 1];
  const periodsRes = results.find(
    (r) => r?.name === "category_spend_by_periods"
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
      txnRes
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
    }
  );

  // If we have monthly breakdown data, filter it for this category and add it
  if (periodsRes?.data && Array.isArray(periodsRes.data)) {
    const categoryMonthlyData = periodsRes.data
      .filter(
        (item) =>
          item.category &&
          item.category.toLowerCase() === operation.category.toLowerCase()
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

function detectConversationTopic(message, conversationContext) {
  const text = message.toLowerCase();

  // 0. TOPIC CLEARING PATTERNS (Check FIRST - highest priority)
  // Clear active topic if the new message is clearly about a different topic
  const topicClearingPatterns = [
    // General financial advice patterns
    /\b(emergency fund|emergency savings|savings|budget|budgeting|expenses|spending|debt|loan|mortgage|retirement|401k|ira)\b/i,
    /\b(how much should i|what should i|financial planning|money management)\b/i,
    /\b(save|saving|spend|spending|invest|investing)\b.*\b(money|dollars|amount)\b/i,
    // Account balance patterns
    /\b(account balance|checking|savings account|credit card|debit card)\b/i,
    // Goal setting patterns
    /\b(goal|goals|target|save for|planning for)\b/i,
  ];

  const hasTopicClearingPattern = topicClearingPatterns.some((pattern) =>
    pattern.test(text)
  );

  if (hasTopicClearingPattern && conversationContext?.active_topic) {
    // Clear the active topic to start fresh
    conversationContext.active_topic = null;
    conversationContext.last_entity = null;
  }

  // 1. CONTINUATION PATTERNS (Check AFTER topic clearing)
  if (conversationContext?.active_topic) {
    // If we have an active topic, check for continuation patterns
    const continuationPatterns = [
      /\b(it|this|that|them)\b/i,
      /\b(should i|can i|is it|how about)\b/i,
      /\b(what about|tell me more|explain)\b/i,
    ];

    const hasContinuationPattern = continuationPatterns.some((pattern) =>
      pattern.test(text)
    );

    if (hasContinuationPattern) {
      return {
        topic: conversationContext.active_topic,
        entity: conversationContext.last_entity || {},
        pending_action: conversationContext.pending_action,
      };
    }
  }

  // 1. INVESTMENT & STOCKS (Gen Z loves crypto and stocks)
  if (
    /\b(stock|stocks|invest|investment|portfolio|trading)\b/i.test(text) ||
    /\b(apple|aapl|tesla|tsla|bitcoin|btc|ethereum|eth|crypto|cryptocurrency)\b/i.test(
      text
    ) ||
    /\b(robinhood|webull|fidelity|vanguard|schwab)\b/i.test(text) ||
    /\b(should i buy|is.*good|worth.*investing|add.*portfolio)\b/i.test(text)
  ) {
    // Enhanced stock symbol detection - look for ticker symbols (1-5 uppercase letters)
    const tickerMatch = text.match(/\b([A-Z]{1,5})\b/);
    const companyMatch = text.match(
      /\b(apple|aapl|tesla|tsla|bitcoin|btc|ethereum|eth|microsoft|msft|google|googl|amazon|amzn|meta|fb|nvidia|nvda)\b/i
    );
    const stockMatch = tickerMatch || companyMatch;
    const amountMatch = text.match(/\$?([0-9,]+)/);

    console.log("🔍 [SYMBOL DEBUG] Symbol extraction:");
    console.log("  - Ticker match:", tickerMatch);
    console.log("  - Company match:", companyMatch);
    console.log(
      "  - Final symbol:",
      stockMatch
        ? tickerMatch
          ? tickerMatch[1]
          : companyMatch[1].toUpperCase()
        : null
    );

    return {
      topic: "investment_analysis",
      entity: {
        type: "investment",
        symbol: stockMatch
          ? tickerMatch
            ? tickerMatch[1]
            : companyMatch[1].toUpperCase()
          : null,
        amount: amountMatch
          ? parseFloat(amountMatch[1].replace(/,/g, ""))
          : null,
        action: /\bshould i buy\b/i.test(text) ? "buy_consideration" : null,
      },
      pending_action: /\bshould i buy\b/i.test(text)
        ? "investment_advice"
        : null,
    };
  }

  // 2. BUDGET & SPENDING (Gen Z tracks every dollar)
  if (
    /\b(budget|spending|expense|money|dollar|dollars)\b/i.test(text) ||
    /\b(where.*money|how much.*spend|track.*expenses|cut.*costs)\b/i.test(
      text
    ) ||
    /\b(afford|can i buy|should i buy|worth it)\b/i.test(text)
  ) {
    const amountMatch = text.match(/\$?([0-9,]+)/);
    const itemMatch = text.match(
      /\b(a|an|the)\s+(?:\$?[0-9,]+\s+)?([a-z0-9\s]+?)(?:\?|$|\s+for|\s+at)/i
    );

    return {
      topic: "budget_planning",
      entity: {
        type: "purchase",
        item: itemMatch ? itemMatch[2].trim() : null,
        amount: amountMatch
          ? parseFloat(amountMatch[1].replace(/,/g, ""))
          : null,
        category:
          /\b(food|groceries|entertainment|subscription|rent|housing)\b/i.test(
            text
          )
            ? text.match(
                /\b(food|groceries|entertainment|subscription|rent|housing)\b/i
              )[1]
            : null,
      },
      pending_action: /\b(afford|can i buy)\b/i.test(text)
        ? "affordability_check"
        : null,
    };
  }

  // 3. DEBT & CREDIT (Gen Z is debt-conscious)
  if (
    /\b(debt|credit|card|loan|pay.*off|balance|interest|apr)\b/i.test(text) ||
    /\b(should i pay|pay.*down|debt.*free|credit.*score)\b/i.test(text)
  ) {
    const amountMatch = text.match(/\$?([0-9,]+)/);
    const cardMatch = text.match(/\b(credit card|card|loan)\b/i);

    return {
      topic: "debt_management",
      entity: {
        type: "debt",
        amount: amountMatch
          ? parseFloat(amountMatch[1].replace(/,/g, ""))
          : null,
        debt_type: cardMatch ? cardMatch[1] : "general",
        action: /\b(should i pay|pay.*down)\b/i.test(text)
          ? "payment_advice"
          : null,
      },
      pending_action: /\b(should i pay|pay.*down)\b/i.test(text)
        ? "debt_advice"
        : null,
    };
  }

  // 4. SAVINGS & GOALS (Gen Z plans for the future)
  if (
    /\b(save|saving|goal|goals|target|emergency|fund|cushion)\b/i.test(text) ||
    /\b(how much.*save|save.*for|goal.*amount|emergency.*fund)\b/i.test(text)
  ) {
    const amountMatch = text.match(/\$?([0-9,]+)/);
    const goalMatch = text.match(
      /\b(emergency|vacation|car|house|wedding|retirement)\b/i
    );

    return {
      topic: "savings_planning",
      entity: {
        type: "savings_goal",
        amount: amountMatch
          ? parseFloat(amountMatch[1].replace(/,/g, ""))
          : null,
        goal_type: goalMatch ? goalMatch[1] : "general",
        timeframe: /\b(month|year|months|years)\b/i.test(text)
          ? text.match(/\b(\d+)\s*(month|year|months|years)\b/i)
          : null,
      },
      pending_action: /\b(how much.*save|save.*for)\b/i.test(text)
        ? "savings_advice"
        : null,
    };
  }

  // 5. INCOME & CAREER (Gen Z side hustles)
  if (
    /\b(salary|income|pay|paycheck|raise|bonus|side.*hustle|freelance)\b/i.test(
      text
    ) ||
    /\b(how much.*make|negotiate|salary.*negotiation)\b/i.test(text)
  ) {
    const amountMatch = text.match(/\$?([0-9,]+)/);

    return {
      topic: "income_optimization",
      entity: {
        type: "income",
        amount: amountMatch
          ? parseFloat(amountMatch[1].replace(/,/g, ""))
          : null,
        source: /\b(salary|side.*hustle|freelance|bonus)\b/i.test(text)
          ? text.match(/\b(salary|side.*hustle|freelance|bonus)\b/i)[1]
          : "general",
      },
      pending_action: /\b(negotiate|how much.*make)\b/i.test(text)
        ? "income_advice"
        : null,
    };
  }

  // 6. TAXES & DEDUCTIONS (Gen Z is tax-savvy)
  if (
    /\b(tax|taxes|deduction|refund|w2|1099|filing)\b/i.test(text) ||
    /\b(how much.*tax|tax.*return|deductible)\b/i.test(text)
  ) {
    const amountMatch = text.match(/\$?([0-9,]+)/);

    return {
      topic: "tax_planning",
      entity: {
        type: "tax",
        amount: amountMatch
          ? parseFloat(amountMatch[1].replace(/,/g, ""))
          : null,
        tax_type: /\b(deduction|refund|w2|1099)\b/i.test(text)
          ? text.match(/\b(deduction|refund|w2|1099)\b/i)[1]
          : "general",
      },
      pending_action: /\b(how much.*tax|deductible)\b/i.test(text)
        ? "tax_advice"
        : null,
    };
  }

  // Default: no specific topic detected
  return {
    topic: null,
    entity: {},
    pending_action: null,
  };
}

async function handlePrebuildContext(userId) {
  logInfo("🚀 [PREBUILD] Starting context pre-building for user:", userId);
  const startTime = Date.now();

  try {
    // Check if context is already cached and fresh (within 50 minute TTL)
    // This prevents unnecessary rebuilding when user visits Finny tab multiple times
    const commonContexts = [
      "summary_min",
      "invest_holdings",
      "goals_overview",
      "cashflow_monthly",
    ];

    const cachedContexts = {};
    let allCached = true;

    for (const need of commonContexts) {
      const cacheType = NEED_CONFIG[need]?.cacheType || need;
      const cached = await getCachedUserData(cacheType, userId);
      cachedContexts[need] = !!cached;
      if (!cached) {
        allCached = false;
      }
    }

    // If all contexts are already cached and fresh, return early
    if (allCached) {
      const totalTime = Date.now() - startTime;
      logInfo(
        `⚡ [PREBUILD] All contexts already cached and fresh (checked in ${totalTime}ms)`
      );
      return {
        success: true,
        message: "Context already cached and fresh",
        baseContextReady: true,
        backgroundContexts: commonContexts,
        buildTime: totalTime,
        cached: true,
      };
    }

    logInfo(
      `📦 [PREBUILD] Some contexts missing, rebuilding... (cached: ${
        Object.keys(cachedContexts)
          .filter((k) => cachedContexts[k])
          .join(", ") || "none"
      })`
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
          }
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

    // Build other context packs in background (after base is ready)
    logInfo("🔄 [PREBUILD] Starting background context building...");

    // Build investment context (only if not cached)
    if (!cachedContexts.invest_holdings) {
      try {
        const investContext = await buildContextPacks(
          userId,
          ["invest_holdings"],
          {}
        );
        const investPack =
          investContext?.packs?.[NEED_CONFIG.invest_holdings.packKey] || null;
        if (investContext && investContext.packs && investPack) {
          await setCachedUserData(
            NEED_CONFIG.invest_holdings.cacheType,
            userId,
            investPack,
            { ttl: 50 * 60 * 1000 }
          );
          logInfo("✅ [PREBUILD] Investment context cached");
          logInfo("🔍 [PREBUILD] Investment context data:", {
            hasHoldings: !!investPack.holdings,
            holdingsCount: investPack.holdings?.length || 0,
          });
        } else {
          logWarn("❌ [PREBUILD] Investment context failed to build");
        }
      } catch (error) {
        logError("❌ [PREBUILD] Investment context failed:", error);
      }
    } else {
      logInfo(
        "✅ [PREBUILD] Investment context already cached, skipping build"
      );
    }

    // Build goals context (only if not cached)
    if (!cachedContexts.goals_overview) {
      try {
        const goalsContext = await buildContextPacks(
          userId,
          ["goals_overview"],
          {}
        );
        const goalsPack =
          goalsContext?.packs?.[NEED_CONFIG.goals_overview.packKey] || null;
        if (goalsContext && goalsContext.packs && goalsPack) {
          await setCachedUserData(
            NEED_CONFIG.goals_overview.cacheType,
            userId,
            goalsPack,
            { ttl: 50 * 60 * 1000 }
          );
          logInfo("✅ [PREBUILD] Goals context cached");
          logInfo("🔍 [PREBUILD] Goals context data:", {
            hasGoals: !!goalsPack.goals,
            goalsCount: goalsPack.goals?.length || 0,
          });
        } else {
          logWarn("❌ [PREBUILD] Goals context failed to build");
        }
      } catch (error) {
        logError("❌ [PREBUILD] Goals context failed:", error);
      }
    } else {
      logInfo("✅ [PREBUILD] Goals context already cached, skipping build");
    }

    // Build cashflow context (only if not cached)
    if (!cachedContexts.cashflow_monthly) {
      try {
        const cashflowContext = await buildContextPacks(
          userId,
          ["cashflow_monthly"],
          {}
        );
        const cashflowPack =
          cashflowContext?.packs?.[NEED_CONFIG.cashflow_monthly.packKey] ||
          null;
        if (cashflowContext && cashflowContext.packs && cashflowPack) {
          await setCachedUserData(
            NEED_CONFIG.cashflow_monthly.cacheType,
            userId,
            cashflowPack,
            { ttl: 50 * 60 * 1000 }
          );
          logInfo("✅ [PREBUILD] Cashflow context cached");
          logInfo("🔍 [PREBUILD] Cashflow context data:", {
            hasCashflow: !!cashflowPack.cashflow,
            cashflowMonths: cashflowPack.cashflow?.length || 0,
          });
        } else {
          logWarn("❌ [PREBUILD] Cashflow context failed to build");
        }
      } catch (error) {
        logError("❌ [PREBUILD] Cashflow context failed:", error);
      }
    } else {
      logInfo("✅ [PREBUILD] Cashflow context already cached, skipping build");
    }

    // Build spend context for last 30 days (always check cache first due to date range params)
    try {
      const cachedSpend = await getCachedUserData("spend_data", userId, {
        period: getDateRange(30),
      });
      if (!cachedSpend) {
        const spendContext = await buildContextPacks(userId, ["spend_total"], {
          period: getDateRange(30),
        });
        const spendPack =
          spendContext?.packs?.[NEED_CONFIG.spend_total.packKey] || null;
        if (spendContext && spendContext.packs && spendPack) {
          await setCachedUserData(
            NEED_CONFIG.spend_total.cacheType,
            userId,
            spendPack,
            {
              ttl: 50 * 60 * 1000,
            }
          );
          logInfo("✅ [PREBUILD] Spend context cached");
          logInfo("🔍 [PREBUILD] Spend context data:", {
            hasSpendSummary: !!spendPack.total,
            totalSpend: spendPack.total || 0,
          });
        } else {
          logWarn("❌ [PREBUILD] Spend context failed to build");
        }
      } else {
        logInfo("✅ [PREBUILD] Spend context already cached, skipping build");
      }
    } catch (error) {
      logError("❌ [PREBUILD] Spend context failed:", error);
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
        "cashflow_monthly",
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

async function handleClassify(message, context, conversationContext = null) {
  console.log(
    "🔍 [FINNY] Starting classification in handleClassify for message:",
    message
  );
  const startTime = Date.now();

  // ALWAYS clear heuristic cache entries - don't trust old cache
  const clearedCount = clearHeuristicCacheEntries();

  const { text, user } = { text: message, user: context };
  if (!text || typeof text !== "string") {
    console.log("❌ [FINNY] Missing or invalid text parameter");
    return {
      intent: "ask_personalized",
      intent_type: null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      needs_clarification: false,
      info_sufficiency: "unknown",
      missing_fields: [],
      decision_risk: "unknown",
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.1,
      fallback: true,
    };
  }

  // Check cache AFTER clearing heuristic entries
  const cacheKey = generateClassificationCacheKey(text);
  let cachedResult = getCachedClassification(text);

  // CRITICAL: Never return heuristic results - check and delete immediately
  if (cachedResult) {
    // Check for ANY heuristic indicator
    const hasHeuristicFlag =
      cachedResult.hasOwnProperty("heuristic") &&
      (cachedResult.heuristic === true ||
        cachedResult.heuristic === "true" ||
        cachedResult.heuristic === 1 ||
        cachedResult.heuristic === "1");

    if (hasHeuristicFlag) {
      const key = generateClassificationCacheKey(text);
      classificationCache.delete(key);
      // CRITICAL: Set to null to prevent ANY return
      cachedResult = null;
    }

    // Only proceed with cached result if it's NOT heuristic and is valid
    if (
      cachedResult &&
      cachedResult.intent &&
      typeof cachedResult.intent === "string" &&
      cachedResult.needs_web !== undefined &&
      cachedResult.needs_user_data !== undefined
    ) {
      // Final safety check: Never return heuristic results
      const stillHeuristic =
        cachedResult.heuristic === true ||
        cachedResult.heuristic === "true" ||
        cachedResult.heuristic === 1;
      if (stillHeuristic) {
        const key = generateClassificationCacheKey(text);
        classificationCache.delete(key);
        cachedResult = null; // Force to null to skip return
      } else {
        // Ensure new fields exist (backward compatibility with old cache entries)
        if (!cachedResult.intent_type && cachedResult.intent !== "off_topic") {
          cachedResult.intent_type = null;
        }
        if (!cachedResult.emotional_state) {
          cachedResult.emotional_state = "neutral";
        }
        if (cachedResult.needs_clarification === undefined) {
          cachedResult.needs_clarification = false;
        }
        if (!cachedResult.info_sufficiency) {
          cachedResult.info_sufficiency = "unknown";
        }
        if (!Array.isArray(cachedResult.missing_fields)) {
          cachedResult.missing_fields = [];
        }
        if (!cachedResult.decision_risk) {
          cachedResult.decision_risk = "unknown";
        }
        if (!Array.isArray(cachedResult.entities)) {
          cachedResult.entities = [];
        }
        if (cachedResult.ticker === undefined) {
          cachedResult.ticker = null;
        }
        if (
          cachedResult.intent === "stock_query" &&
          cachedResult.ticker &&
          cachedResult.entities.length === 0
        ) {
          cachedResult.entities = [cachedResult.ticker];
        }
        // ABSOLUTE FINAL CHECK: Never return heuristic results
        if (
          cachedResult.hasOwnProperty("heuristic") &&
          (cachedResult.heuristic === true ||
            cachedResult.heuristic === "true" ||
            cachedResult.heuristic === 1)
        ) {
          console.log(
            "🚨 [FINNY] CRITICAL ERROR: About to return heuristic result! Blocking return."
          );
          const key = generateClassificationCacheKey(text);
          classificationCache.delete(key);
          cachedResult = null;
          // Fall through to LLM
        } else {
          return cachedResult;
        }
      }
    } else if (cachedResult) {
      // Clear the malformed cached entry
      const key = generateClassificationCacheKey(text);
      classificationCache.delete(key);
    }
  }

  // No rigid heuristics - all classification is handled by LLM
  // This ensures flexible detection of stocks, goals, and all other intents

  try {
    async function callLLM(model, options = {}) {
      const requestBody = {
        model,
        temperature: 0.05,
        max_tokens: 350,
        top_p: 0.8,
        messages: [
          {
            role: "system",
            content: [
              "You are Finny's intelligent classification system. Analyze user messages to understand their intent, emotional state, and what resources they need.",
              "",
              "=== PRIMARY INTENT CLASSIFICATION ===",
              "Classify into exactly ONE primary intent:",
              "- ask_personalized: Questions about user's finances (spending, accounts, goals, investments, affordability, advice)",
              "- goal_conversation: Creating NEW goals or setting savings targets (explicit goal creation statements)",
              "- stock_query: Questions about specific stocks, tickers, or companies (e.g., 'What about Apple?', 'Tell me about AAPL', 'Should I buy Tesla stock?')",
              "- off_topic: Non-financial topics (weather, cooking, entertainment, general chat, etc)",
              "",
              "GOAL_CONVERSATION STRICTNESS (important):",
              "- Use goal_conversation ONLY when the user explicitly wants to create/set/add a goal in the app (they say 'create a goal', 'set a goal', 'add a goal', or clearly refer to the Goals feature).",
              "- If the user mentions a life goal (house, car, travel, kids) but is asking for feasibility/advice/planning, that is ask_personalized (NOT goal_conversation).",
              "",
              "=== INTENT TYPE (What user wants to accomplish) ===",
              "Detect the underlying intent type (can combine with primary intent):",
              "- exploratory: Learning, understanding concepts ('tell me about investing', 'explain Roth IRA', 'what is a 401k')",
              "- actionable: Specific steps or how-to ('how do I save', 'what should I do', 'help me budget')",
              "- emotional_support: Seeking reassurance, validation ('I'm worried about money', 'am I doing okay?')",
              "- crisis: Immediate urgent help needed ('can't pay rent', 'overdraft', 'need money now')",
              "- planning: Long-term strategy ('retirement planning', 'investment strategy', 'financial plan')",
              "",
              "=== EMOTIONAL STATE DETECTION ===",
              "Detect emotional state from language and context (be nuanced, avoid false positives):",
              "- neutral: No strong emotional signals detected",
              "- anxious: Worry, stress, uncertainty ('worried', 'stressed', 'anxious', 'nervous', 'afraid')",
              "- panicked: Urgent crisis language ('can't pay', 'overdraft', 'declined', 'bounced', 'emergency', 'need money now')",
              "- ashamed: Shame, guilt, embarrassment ('ashamed', 'embarrassed', 'feel stupid', 'should have', 'failure')",
              "- overwhelmed: Too much to handle ('overwhelmed', 'too much', 'can't handle', 'drowning', 'don't know where to start')",
              "- fomo: Fear of missing out ('saw on tiktok', 'everyone's doing', 'fomo', 'impulse', 'couldn't resist')",
              "",
              "CRITICAL EMOTIONAL DETECTION RULES:",
              "- Only detect emotional state if there are CLEAR signals. Don't infer emotions from neutral questions.",
              "- 'Tell me about investing' → neutral (informational query, no emotional distress)",
              "- 'I'm worried about my debt' → anxious (explicit worry)",
              "- 'Can I afford Italy trip?' → neutral (affordability question, not emotional)",
              "- 'I can't pay my rent this month' → panicked (crisis language)",
              "- 'I feel stupid for spending so much' → ashamed (self-blame language)",
              "",
              "=== FLAG RULES (can combine) ===",
              "- needs_user_data=true: Answer requires user's actual data (spend, net worth, accounts, goals, personal recommendations, affordability checks)",
              "- needs_web=true: Answer requires current/2024-2025 info (limits, rates, brackets, market/news, card offers, current regulations)",
              "- needs_clarification=true: The user is asking for advice/plan but key inputs are missing or intent is ambiguous (Ask handler will ask 1–3 questions before advising)",
              "",
              "=== INFO SUFFICIENCY & RISK (Reliable routing) ===",
              "Set these fields so the Ask handler can safely clarify instead of guessing:",
              "- info_sufficiency: 'sufficient'|'missing'|'unknown'",
              "- missing_fields: array of strings from this set:",
              "  [income_takehome,income_gross,fixed_expenses,current_savings,debt_balances,credit_score,purchase_price,down_payment,timeline,location,risk_tolerance,investing_horizon,goal_amount,goal_date,move_countries,employer_match]",
              "- decision_risk: 'low'|'medium'|'high'",
              "- missing_fields must be UNIQUE and short: choose at most 5, no duplicates",
              "",
              "Decision risk guidance (examples, context-dependent):",
              "- high: decisions that commit a large portion of the user's resources, create long-term obligations, or require missing planning data",
              "- medium: decisions with meaningful tradeoffs but reversible or limited downside",
              "- low: definitions, explanations, or small factual questions",
              "",
              "If the user asks a high-risk question and details are missing, set needs_clarification=true and include missing_fields like timeline, income_takehome, fixed_expenses, current_savings, debt_balances, location (as applicable).",
              "",
              "Ambiguity rule:",
              "- If the user asks an ambiguous decision question (e.g., 'should I', 'is it worth it', 'help me decide') and it's medium/high stakes, set needs_clarification=true even if missing_fields is empty (Ask handler may ask 1 sharp question to confirm goal).",
              "",
              "High-stakes planning rule (non-rigid, apply broadly):",
              "- If the user is describing a major plan/decision (big purchase, multiple big goals, multi-country plan, life decision) and asks for guidance/feasibility without key numbers, set decision_risk='high', needs_clarification=true, info_sufficiency='missing'.",
              "- In those cases, include the most relevant missing_fields (pick 3–5): timeline, purchase_price, down_payment, income_takehome, fixed_expenses, current_savings, debt_balances, location.",
              "- Set intent_type='actionable' for feasibility/planning questions, even if the user didn't explicitly say 'how'.",
              "- Do NOT set needs_web=true just because it's a big decision. needs_web is only for current rates/brackets/regulations/news or explicitly asked country-specific rules.",
              "",
              "Info sufficiency rule:",
              "- Default to info_sufficiency='missing' for advice/feasibility questions unless the user supplied the key inputs in their message.",
              "- Do not label info_sufficiency='sufficient' when missing_fields is empty but the user gave no numbers.",
              "",
              "Consistency rule:",
              "- If info_sufficiency is 'missing', needs_clarification MUST be true.",
              "",
              "Examples (follow these patterns):",
              "- 'I want to buy houses in Italy and Japan' -> intent_type:'actionable', decision_risk:'high', needs_web:false, needs_clarification:true, info_sufficiency:'missing', missing_fields includes 3–5 of: timeline, purchase_price, down_payment, income_takehome, fixed_expenses, current_savings, debt_balances, location",
              "- 'Should I save $5000 for a house?' -> ask_personalized (advice), NOT goal_conversation; intent_type:'actionable'",
              "",
              "=== CRITICAL CLASSIFICATION RULES ===",
              "1. Affordability queries are ALWAYS ask_personalized (not goal_conversation):",
              "   - 'Can I afford X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
              "   - 'Can I afford to go Italy trip?' → ask_personalized, needs_user_data:true, intent_type:actionable",
              "   - 'Can I go afford a $1500 trip?' → ask_personalized, needs_user_data:true, intent_type:actionable",
              "",
              "2. Investment advice queries NEVER need web search:",
              "   - 'Tell me about investing' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:exploratory",
              "   - 'Investment advice' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:actionable",
              "   - 'What should I invest in?' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:actionable",
              "",
              "3. Goal queries NEVER need web search:",
              "   - 'Show my goals' → ask_personalized, needs_web:false, needs_user_data:true (inquiry, not creation)",
              "   - 'I want to save $5000 for a house' → goal_conversation, needs_web:false, needs_user_data:true (creation)",
              "",
              "4. Advice-seeking queries are ask_personalized (not goal_conversation):",
              "   - 'What's a good emergency amount for me?' → ask_personalized, needs_user_data:true, intent_type:actionable",
              "   - 'Should I buy X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
              "   - 'Is it worth it to buy X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
              "",
              "5. Credit card queries ALWAYS need web search:",
              "   - 'What credit card should I get?' → ask_personalized, needs_web:true, needs_user_data:true",
              "",
              "6. Stock queries REQUIRE a SPECIFIC ticker/company - general queries are ask_personalized:",
              "   - 'What about Apple stock?' → stock_query, needs_web:false, needs_user_data:false, ticker:'AAPL' (SPECIFIC company)",
              "   - 'Tell me about AAPL' → stock_query, needs_web:false, needs_user_data:false, ticker:'AAPL' (SPECIFIC ticker)",
              "   - 'Should I buy Tesla?' → stock_query, needs_web:false, needs_user_data:true, ticker:'TSLA' (SPECIFIC company)",
              "   - 'Tell me about the stock market' → ask_personalized, needs_web:true (GENERAL - no specific ticker)",
              "",
              "7. TICKER DETECTION RULES:",
              "   - ONLY classify as stock_query if a SPECIFIC ticker symbol OR company name is mentioned",
              "   - Extract ticker symbols (1-5 uppercase letters): AAPL, TSLA, MSFT, GOOGL, etc.",
              "   - Map company names to tickers: Apple→AAPL, Tesla→TSLA, Microsoft→MSFT, Google→GOOGL, Amazon→AMZN, Meta→META, NVIDIA→NVDA",
              "   - If multiple tickers detected, include all in entities array",
              "   - If ticker is ambiguous (e.g., 'Apple' without context), set confidence < 0.8",
              "   - If NO specific ticker/company mentioned, use ask_personalized (NOT stock_query)",
              "",
              "=== OUTPUT FORMAT ===",
              "CRITICAL: You MUST return ONLY valid JSON. No markdown, no code fences, no extra text, no comments.",
              "The JSON must be parseable by JSON.parse(). Follow this EXACT structure:",
              "",
              '{"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"needs_clarification":false,"info_sufficiency":"sufficient","missing_fields":[],"decision_risk":"low","state":null,"entities":[],"ticker":null,"confidence":0.95}',
              "",
              "Valid JSON format rules:",
              "- Use double quotes for all strings",
              "- Use lowercase true/false (not True/False)",
              "- Use null (not NULL or None)",
              "- No trailing commas",
              "- No extra whitespace or line breaks inside JSON",
              "- All fields must be present",
              "",
              "Field requirements:",
              "- intent: REQUIRED string (ask_personalized|goal_conversation|stock_query|off_topic)",
              "- intent_type: string or null (exploratory|actionable|emotional_support|crisis|planning|null)",
              "- emotional_state: REQUIRED string (neutral|anxious|panicked|ashamed|overwhelmed|fomo)",
              "- needs_web: REQUIRED boolean (true|false)",
              "- needs_user_data: REQUIRED boolean (true|false)",
              "- needs_clarification: REQUIRED boolean (true|false)",
              "- info_sufficiency: REQUIRED string ('sufficient'|'missing'|'unknown')",
              "- missing_fields: REQUIRED array (empty array [] if none)",
              "- decision_risk: REQUIRED string ('low'|'medium'|'high')",
              "- state: string or null (state code like AZ, CA, or null)",
              "- entities: REQUIRED array (empty array [] if none, or ticker symbols if stock_query)",
              "- ticker: string or null (ticker symbol like 'AAPL', 'TSLA', or null if not stock_query or ambiguous)",
              "- confidence: REQUIRED number (0.0-1.0)",
              "",
              "TICKER EXTRACTION RULES:",
              "- For stock_query intent, extract ticker symbol from message",
              "- If ticker is clear (e.g., 'AAPL', 'TSLA'), set ticker field and confidence >= 0.9",
              "- If company name maps to ticker (e.g., 'Apple'→'AAPL'), set ticker and confidence >= 0.8",
              "- If ticker is ambiguous or unclear, set ticker:null and confidence < 0.8",
              "- Always include ticker in entities array if detected",
              "",
              "CRITICAL: Meta/system questions about AI capabilities are ALWAYS off_topic:",
              "- 'Can you learn from our conversations?' → off_topic",
              "- 'Do you remember our previous chat?' → off_topic",
              "- 'Are you an AI?' → off_topic",
              "- 'How do you work?' → off_topic",
              "",
              "IMPORTANT:",
              "- Be precise with emotional_state: only detect if CLEAR signals exist, default to 'neutral'",
              "- intent_type can be null for off_topic queries",
              "- confidence should reflect how certain you are (0.9+ for clear cases, 0.7-0.9 for ambiguous)",
              "- If needs_clarification=true, set info_sufficiency to 'missing' or 'unknown' and include missing_fields",
              "- Return ONLY the JSON object, nothing else",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              text,
              user_hint_state: user?.state || null,
            }),
          },
        ],
        response_format: { type: "json_object" },
      };

      const fetchPromise = fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            "Content-Type": "application/json",
          },
          signal: options.signal,
          body: JSON.stringify(requestBody),
        }
      );

      const r = await fetchPromise;
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`OpenRouter error ${r.status}: ${errText}`);
      }
      return r.json();
    }

    // Classification models: openai/gpt-oss-20b (paid) and openai/gpt-oss-20b:free
    const classificationModels = [
      CLASSIFICATION_MODEL_PAID || "openai/gpt-oss-20b",
      CLASSIFICATION_MODEL_FREE || "openai/gpt-oss-20b:free",
    ];
    const { result: data, model: usedModel } = await callWithFallback(
      classificationModels,
      callLLM,
      12000,
      "Classification"
    );
    console.log("🔍 [FINNY] Classification using model:", usedModel);

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [FINNY] No content in response");
      console.log("❌ [FINNY] Full response:", JSON.stringify(data, null, 2));
      throw new Error("No content");
    }

    // Strip markdown code blocks if present
    let cleanContent = content;
    if (content.startsWith("```") && content.endsWith("```")) {
      cleanContent = content.slice(3, -3).trim();
    }
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }

    // Handle incomplete JSON responses
    let out;
    try {
      out = JSON.parse(cleanContent);

      // VALIDATION: Check if the parsed result has the correct structure
      // If 'intent' field is missing or has wrong type, treat as malformed
      if (!out.intent || typeof out.intent !== "string") {
        console.log(
          "❌ [FINNY] Malformed classification result - missing or invalid 'intent' field"
        );
        console.log("❌ [FINNY] Malformed structure:", out);
        throw new Error("Invalid classification structure");
      }

      // Check if required fields exist
      if (out.needs_web === undefined || out.needs_user_data === undefined) {
        console.log(
          "❌ [FINNY] Malformed classification result - missing required fields"
        );
        console.log("❌ [FINNY] Malformed structure:", out);
        throw new Error("Missing required classification fields");
      }

      // Validate new fields with defaults
      if (
        !out.intent_type ||
        (out.intent !== "off_topic" && !out.intent_type)
      ) {
        // intent_type can be null for off_topic, but should exist for others
        if (out.intent !== "off_topic") {
          console.log("⚠️ [FINNY] Missing intent_type, defaulting to null");
          out.intent_type = null;
        }
      }

      if (!out.emotional_state) {
        console.log(
          "⚠️ [FINNY] Missing emotional_state, defaulting to neutral"
        );
        out.emotional_state = "neutral";
      }

      // Defaults for clarification/risk routing fields
      if (out.needs_clarification === undefined)
        out.needs_clarification = false;
      if (!out.info_sufficiency) out.info_sufficiency = "unknown";
      if (!Array.isArray(out.missing_fields)) out.missing_fields = [];
      if (!out.decision_risk) out.decision_risk = "unknown";
    } catch (parseError) {
      console.log(
        "❌ [FINNY] JSON parse/validation error, using fallback classification"
      );
      console.log("❌ [FINNY] Error:", parseError.message);
      console.log("❌ [FINNY] Raw content was:", cleanContent);

      // Default fallback for malformed JSON - no rigid heuristics
      out = {
        intent: "ask_personalized",
        intent_type: null,
        emotional_state: "neutral",
        needs_web: false,
        needs_user_data: true,
        needs_clarification: false,
        info_sufficiency: "unknown",
        missing_fields: [],
        decision_risk: "unknown",
        state: null,
        entities: [],
        ticker: null,
        confidence: 0.8,
        fallback: true,
      };
    }
    // Strict trigger: only treat as goal_conversation when user explicitly wants to create/set/add a goal.
    // Avoid matching casual phrases like "my goal is...".
    const goalConversationTrigger =
      /\b(create|set|add|start|make)\s+(a\s+)?goal\b|\bnew\s+goal\b|\bgoal\s+(called|named)\b/i;

    // Normalize/defend new routing fields (LLMs sometimes ignore constraints)
    const allowedInfo = new Set(["sufficient", "missing", "unknown"]);
    const allowedRisk = new Set(["low", "medium", "high", "unknown"]);
    const allowedMissingFields = new Set([
      "income_takehome",
      "income_gross",
      "fixed_expenses",
      "current_savings",
      "debt_balances",
      "credit_score",
      "purchase_price",
      "down_payment",
      "timeline",
      "location",
      "risk_tolerance",
      "investing_horizon",
      "goal_amount",
      "goal_date",
      "move_countries",
      "employer_match",
    ]);

    out.needs_clarification = !!out.needs_clarification;
    out.info_sufficiency = allowedInfo.has(out.info_sufficiency)
      ? out.info_sufficiency
      : "unknown";
    out.decision_risk = allowedRisk.has(out.decision_risk)
      ? out.decision_risk
      : "unknown";
    if (!Array.isArray(out.missing_fields)) out.missing_fields = [];
    out.missing_fields = Array.from(
      new Set(out.missing_fields.filter((f) => allowedMissingFields.has(f)))
    ).slice(0, 5);

    // Confidence clamp
    if (
      typeof out.confidence !== "number" ||
      !Number.isFinite(out.confidence)
    ) {
      out.confidence = 0.7;
    }
    out.confidence = Math.max(0, Math.min(1, out.confidence));

    // Enforce strict goal_conversation semantics: only when user explicitly requests goal creation.
    if (
      out.intent === "goal_conversation" &&
      !goalConversationTrigger.test(text)
    ) {
      out.intent = "ask_personalized";
      if (out.intent_type === "goal_conversation")
        out.intent_type = "actionable";
    }

    console.log("🔍 [FINNY] Validated classification result:", out);

    // Defensive post-process so your app never crashes
    if (!out.state || typeof out.state !== "string") out.state = null;
    if (!Array.isArray(out.entities)) out.entities = [];
    if (out.ticker === undefined) out.ticker = null;
    if (out.needs_clarification === undefined) out.needs_clarification = false;
    if (!out.info_sufficiency) out.info_sufficiency = "unknown";
    if (!Array.isArray(out.missing_fields)) out.missing_fields = [];
    if (!out.decision_risk) out.decision_risk = "unknown";
    if (
      out.intent === "stock_query" &&
      out.ticker &&
      out.entities.length === 0
    ) {
      out.entities = [out.ticker];
    }

    // Log the classification
    const conversationData = {
      user_message: message,
      finny_response: `Classification: ${out.intent} (confidence: ${out.confidence})`,
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "classify",
      entities: out.entities,
      confidence: out.confidence,
      response_time_ms: Date.now() - startTime,
      sources_used: [],
      cached: false,
      classification_result: out,
    };

    // CRITICAL: Never cache heuristic results - ensure out doesn't have heuristic flag
    if (out.hasOwnProperty("heuristic")) {
      console.log(
        "⚠️ [FINNY] Removing heuristic flag from LLM result before caching"
      );
      delete out.heuristic;
    }

    // Cache the result for future use
    setCachedClassification(text, out);

    // Log conversation asynchronously to reduce latency
    setImmediate(() => logConversation(conversationData));

    // Final safety check before returning
    if (out.hasOwnProperty("heuristic") && out.heuristic) {
      console.log(
        "🚨 [FINNY] CRITICAL: LLM returned heuristic result! Removing flag."
      );
      delete out.heuristic;
    }

    return out;
  } catch (e) {
    console.error("❌ [FINNY] Classification error:", e?.message);

    // Handle timeout specifically
    if (e?.message?.includes("timeout")) {
      console.log(
        "⏰ [FINNY] Classification timed out after 8 seconds, using fallback"
      );
    }

    // Default fallback for any classification error
    // No rigid heuristics - if LLM fails, use safe default
    console.log("🔄 [FINNY] Using default ask_personalized fallback");
    return {
      intent: "ask_personalized",
      intent_type: null,
      emotional_state: "neutral",
      needs_web: false,
      needs_user_data: true,
      needs_clarification: false,
      info_sufficiency: "unknown",
      missing_fields: [],
      decision_risk: "unknown",
      state: null,
      entities: [],
      ticker: null,
      confidence: 0.1,
      fallback: true,
      timeout_fallback: e?.message?.includes("timeout") || false,
    };
  }
}

async function handleOffTopic(message, context, conversationContext = null) {
  console.log("🚫 [FINNY] Handling off-topic query:", message);
  const startTime = Date.now();

  const messageText =
    typeof message === "string" ? message : String(message || "");

  // 🔍 CONVERSATION CONTEXT AWARENESS
  // If we have conversation context, this might not actually be off-topic
  if (conversationContext?.active_topic || conversationContext?.last_entity) {
    console.log(
      "🔍 [OFF_TOPIC] Conversation context detected, this might be a continuation:"
    );
    console.log("  - Active topic:", conversationContext.active_topic);
    console.log("  - Last entity:", conversationContext.last_entity);

    // If we have an active financial conversation, redirect to ask_personalized
    // to maintain conversation flow
    console.log(
      "🔍 [OFF_TOPIC] Redirecting to ask_personalized to maintain conversation flow"
    );
    return await handleAsk(
      messageText,
      context,
      "ask_personalized",
      null,
      conversationContext
    );
  }

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
      lower
    );
  const isVenting = hasVenting && !hasFinancialContext;

  const category = isVenting ? "venting" : context?.category || "general";
  const userProfile = context?.profile || {};
  const userId = context?.user_id;

  // Fetch net worth data for lightweight context
  let netWorthData = null;
  if (userId) {
    try {
      netWorthData = await getNetWorthData(userId);
      if (netWorthData) {
        console.log("📊 [OFF_TOPIC] Net worth data loaded for context");
      }
    } catch (error) {
      console.log(
        "⚠️ [OFF_TOPIC] Could not load net worth data:",
        error?.message
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
    "- If the user asks 'what do you know about me?', answer using available context.",
    "- Never mention the word 'memories' or imply private data access.",
    "- If context is missing, ask clarifying questions instead of assuming.",
    "",
    "STYLE GUIDELINES:",
    "- Sound like a thoughtful human money coach.",
    "- Be concise, grounded, and non-judgmental.",
    "- No lectures. No generic disclaimers. No buzzwords.",
  ].join("\n");

  try {
    // Load relevant memories for this message (always)
    let userMemory = { memories: [], totalCount: 0 };
    let userProfileForFinny = null;
    if (userId) {
      try {
        console.log("🧠 [OFF_TOPIC] Loading user memories for user:", userId);
        userMemory = await loadUserMemory(userId, messageText);
        userProfileForFinny = await fetchSupermemoryProfile(userId);
        console.log("🧠 [OFF_TOPIC] User memories:", userMemory);
      } catch (error) {
        console.log(
          "⚠️ [OFF_TOPIC] Could not load user memories:",
          error?.message
        );
        userMemory = { memories: [], totalCount: 0 };
      }
    }

    const memorySnippets = Array.isArray(userMemory?.memories)
      ? userMemory.memories
          .slice(0, 5)
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

    console.log("🧠 [OFF_TOPIC] User profile for Finny:", userProfileForFinny);
    const userContextParts = [
      `Message: ${messageText}`,
      `Mode hint: ${isVenting ? "venting" : "general_off_topic"}`,
      userProfile?.name ? `User name: ${userProfile.name}` : null,
      userProfileForFinny
        ? `User profile: ${userProfileForFinny.dynamic}`
        : null,
      userProfile?.finny_style
        ? `Finny style: ${userProfile.finny_style}`
        : null,
      netWorthData
        ? `Financial context: Net worth ${netWorthData.formatted.net_worth}, ${netWorthData.formatted.liquid_assets} cash, ${netWorthData.formatted.investments_total} invested, ${netWorthData.formatted.total_liabilities} debt`
        : null,
      memorySnippets.length > 0
        ? `Relevant memories (use subtly, do not mention them):\n${memorySnippets.join(
            "\n"
          )}`
        : "Relevant memories: none",
    ].filter(Boolean);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: SMALLER_MODEL || STANDARD_MODEL,
          temperature: 0.85,
          max_tokens: 350,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userContextParts.join("\n\n"),
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ||
      "I'm all about finance. What money questions can I help you with?";

    // Store conversation memory
    if (userId && content) {
      setImmediate(async () => {
        try {
          await storeConversationMemory(userId, messageText, content, {
            intent: "off_topic",
            chat_id: context?.chat_id,
            category: category,
            userName: userProfile?.name || null,
          });
        } catch (error) {
          console.error(
            "❌ [FINNY] Failed to store off-topic conversation memory:",
            error
          );
        }
      });
    }

    // Log the interaction
    setImmediate(() =>
      logConversation({
        user_message: redactPII(messageText),
        finny_response: redactPII(content),
        timestamp: new Date().toISOString(),
        user_id: userId || "unknown",
        intent: "off_topic",
        entities: [],
        confidence: 1.0,
        response_time_ms: Date.now() - startTime,
        sources_used: [],
        cached: false,
        category: category,
      })
    );

    return {
      text: cleanResponseFormatting(content),
      type: "assistant",
      intent: "off_topic",
      category: category,
    };
  } catch (error) {
    console.error("❌ [FINNY] Off-topic handler error:", error);
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
// Rate limiting configuration
const RATE_LIMITS = {
  maxConcurrent: 3,
  delayBetweenRequests: 1000,
  timeout: 10000,
  maxRetries: 2,
};

let requestQueue = [];
let activeRequests = 0;

// Request deduplication map
const pendingRequests = new Map();

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
        "Sorry — something stalled on my side. Please try again in a moment."
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
          "Sorry — the response took too long. Please try again."
        )
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

async function runNextQueued() {
  if (activeRequests >= RATE_LIMITS.maxConcurrent) return;
  const next = requestQueue.shift();
  if (!next) return;
  activeRequests++;
  try {
    const result = await next.task();
    next.resolve(result);
  } catch (e) {
    next.reject(e);
  } finally {
    activeRequests--;
    setTimeout(runNextQueued, RATE_LIMITS.delayBetweenRequests);
  }
}

function enqueueTask(task) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ task, resolve, reject });
    runNextQueued();
  });
}

async function limitedBraveSearch(query) {
  const key = `brave:${query}`;
  if (pendingRequests.has(key)) return pendingRequests.get(key);

  const job = enqueueTask(async () => {
    let lastErr = null;
    for (let attempt = 0; attempt <= RATE_LIMITS.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const p = braveSearch(query, { signal: controller.signal });
        const res = await withTimeout(p, RATE_LIMITS.timeout, null, () =>
          controller.abort()
        );
        if (res === null) throw new Error("braveSearch timeout");
        return res;
      } catch (e) {
        lastErr = e;
        if (attempt < RATE_LIMITS.maxRetries) {
          await delay(300 * (attempt + 1));
          continue;
        }
        throw lastErr;
      }
    }
  });

  pendingRequests.set(key, job);
  try {
    const out = await job;
    return out;
  } finally {
    pendingRequests.delete(key);
  }
}

// === Stocks via Finnhub ===
function looksLikeStockQuery(message) {
  return !!detectStockCandidate(message);
}

function looksLikeStockDeepQuery(message) {
  // Deep analysis is now the default for all stock queries
  // Only check if it's actually a stock query (handled by caller)
  // This ensures all stock queries get comprehensive analysis
  return true;
}

async function planStockRequest(message) {
  try {
    console.log("🔍 [STOCK_PLANNER] Using model:", PRIMARY_OPENROUTER_MODEL);
    console.log(
      "🔍 [STOCK_PLANNER] API key present:",
      !!process.env.OPENROUTER_GROK_KEY
    );

    // Add timeout to prevent hangs
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Stock planner timeout after 10 seconds")),
        10000
      );
    });

    const fetchPromise = fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: PRIMARY_OPENROUTER_MODEL || STANDARD_MODEL,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content: [
                "You are a stock request planner.",
                "Given a user query, decide what the user wants to fetch.",
                "Return JSON only matching the schema.",
              ].join("\n"),
            },
            { role: "user", content: message },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "stock_plan",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  ticker_candidates: {
                    type: "array",
                    items: { type: "string" },
                  },
                  company_candidates: {
                    type: "array",
                    items: { type: "string" },
                  },
                  wants: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "price",
                        "market_cap",
                        "pe",
                        "ps",
                        "volume",
                        "52w",
                        "earnings",
                        "guidance",
                        "dividend",
                        "news",
                        "filings",
                        "analyst_targets",
                        "insider",
                      ],
                    },
                  },
                  horizon: { type: ["string", "null"] },
                  needs_web: { type: "boolean" },
                },
                required: [
                  "ticker_candidates",
                  "company_candidates",
                  "wants",
                  "needs_web",
                ],
              },
            },
          },
        }),
      }
    );

    // Race between fetch and timeout
    const r = await Promise.race([fetchPromise, timeoutPromise]);

    if (!r.ok) {
      const errorText = await r.text();
      console.error(
        `❌ [STOCK_PLANNER] HTTP Error: ${r.status} ${r.statusText}`
      );
      console.error(`❌ [STOCK_PLANNER] Error details:`, errorText);
      return null;
    }

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("❌ [STOCK_PLANNER] No content in response");
      return null;
    }

    // Strip markdown code blocks if present
    let cleanContent = content;
    if (content.startsWith("```") && content.endsWith("```")) {
      cleanContent = content.slice(3, -3).trim();
    }
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }

    const plan = JSON.parse(cleanContent);
    // Ensure arrays
    plan.ticker_candidates = Array.isArray(plan.ticker_candidates)
      ? plan.ticker_candidates
      : [];
    plan.company_candidates = Array.isArray(plan.company_candidates)
      ? plan.company_candidates
      : [];
    plan.wants = Array.isArray(plan.wants) ? plan.wants : [];
    return plan;
  } catch (e) {
    console.error("❌ [STOCK_PLANNER] Error:", e);
    return null;
  }
}

async function executeStockPlan(
  plan,
  message,
  res = null,
  wantsStreaming = false
) {
  console.log("🔍 [EXECUTE_STOCK] Plan:", plan);
  const wants = plan?.wants || [];
  const preferredTicker = plan?.ticker_candidates?.[0] || null;
  console.log("🔍 [EXECUTE_STOCK] Preferred ticker:", preferredTicker);
  console.log(`[FINNHUB] Starting stock plan execution for: ${message}`);

  const { ticker } = preferredTicker
    ? { ticker: preferredTicker }
    : await resolveTickerForQuery(message);

  console.log("🔍 [EXECUTE_STOCK] Final ticker:", ticker);
  if (!ticker) {
    console.error(`[FINNHUB] Could not resolve ticker for: ${message}`);
    return { error: "Could not resolve ticker" };
  }

  // Base snapshot always
  sendStockProgress(
    res,
    `📈 Fetching current price and market data for ${ticker}...`,
    wantsStreaming
  );
  console.log(`[FINNHUB] Fetching base snapshot for ticker: ${ticker}`);
  const base = await fetchStockSnapshot(ticker);
  if (base?.error) return base;

  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  const extra = {};

  // Earnings
  if (wants.includes("earnings")) {
    sendStockProgress(res, `📊 Analyzing earnings data...`, wantsStreaming);
    console.log(`[FINNHUB] Fetching earnings for ${ticker}`);
    extra.earnings = await fetchJson(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${ticker}&token=${apiKey}`
    );
    console.log(
      `[FINNHUB] Earnings ${
        extra.earnings ? "fetched" : "failed"
      } for ${ticker}`
    );
  }
  // Filings
  if (wants.includes("filings")) {
    sendStockProgress(res, `📄 Gathering company filings...`, wantsStreaming);
    console.log(`[FINNHUB] Fetching filings for ${ticker}`);
    extra.filings = await fetchJson(
      `https://finnhub.io/api/v1/filings?symbol=${ticker}&token=${apiKey}`
    );
    console.log(
      `[FINNHUB] Filings ${extra.filings ? "fetched" : "failed"} for ${ticker}`
    );
  }
  // Insider
  if (wants.includes("insider")) {
    sendStockProgress(
      res,
      `👥 Checking insider transactions...`,
      wantsStreaming
    );
    console.log(`[FINNHUB] Fetching insider transactions for ${ticker}`);
    extra.insider = await fetchJson(
      `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${ticker}&token=${apiKey}`
    );
    console.log(
      `[FINNHUB] Insider transactions ${
        extra.insider ? "fetched" : "failed"
      } for ${ticker}`
    );
  }

  return { ticker, planWants: wants, data: base, extra };
}

async function generateConversationalStockResponse(
  stockData,
  userMessage,
  userProfile,
  userMemory,
  investmentHoldings,
  stockPlan = null
) {
  // Always generate comprehensive analysis using LLM for all stock queries
  console.log(`\n🔍 [STOCK_ANALYSIS] ========================================`);
  console.log(
    `🔍 [STOCK_ANALYSIS] Generating comprehensive analysis for ${stockData.ticker}`
  );
  console.log(`🔍 [STOCK_ANALYSIS] User message: "${userMessage}"`);
  console.log(
    `🔍 [STOCK_ANALYSIS] Stock data available: current=${
      stockData.current
    }, hasProfile=${!!stockData.profile}, hasMetrics=${!!stockData.metrics}`
  );

  // Build the base summary with all available data
  const baseSummary = buildStockDataSummary(stockData, stockPlan);

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
            50
          )}..." has no valid article URL. Available fields:`,
          Object.keys(n)
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
    if (!process.env.OPENROUTER_GROK_KEY) {
      console.error(
        "❌ [STOCK_ANALYSIS] OPENROUTER_GROK_KEY not found, falling back to summary"
      );
      console.log(
        `⚠️ [STOCK_ANALYSIS] Falling back to base summary (no API key)`
      );
      return baseSummary;
    }

    const STOCK_ANALYSIS_MODEL = STANDARD_MODEL;

    console.log(
      `🔍 [STOCK_ANALYSIS] Calling LLM API with model: ${STOCK_ANALYSIS_MODEL}`
    );
    const llmStartTime = Date.now();

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
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
      }
    );

    const llmDuration = Date.now() - llmStartTime;
    console.log(
      `🔍 [STOCK_ANALYSIS] LLM API response received in ${llmDuration}ms (status: ${response.status})`
    );

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;

      // Check if response was truncated
      if (finishReason === "length") {
        console.warn(
          "⚠️ [STOCK_ANALYSIS] Comprehensive analysis response was truncated due to token limit"
        );
      }

      if (content && content.trim()) {
        console.log(
          `✅ [STOCK_ANALYSIS] Generated comprehensive analysis (length: ${content.length} chars, duration: ${llmDuration}ms)`
        );
        return content;
      } else {
        console.error(
          "❌ [STOCK_ANALYSIS] LLM returned empty content. Response data:",
          JSON.stringify(data, null, 2).substring(0, 500)
        );
      }
    } else {
      const errorText = await response
        .text()
        .catch(() => "Unable to read error");
      console.error(
        `❌ [STOCK_ANALYSIS] LLM API request failed: ${response.status} ${response.statusText}`
      );
      console.error(
        `❌ [STOCK_ANALYSIS] Error details: ${errorText.substring(0, 500)}`
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
  userMemory
) {
  console.log(`🔄 [FALLBACK] Generating fallback analysis for ${ticker}`);

  const extractedTicker = ticker;
  if (!extractedTicker) {
    return "I'd be happy to help with stock analysis, but I need a specific ticker symbol. Could you provide the stock symbol you'd like me to analyze?";
  }

  // Use web search as fallback for current data
  try {
    const searchQuery = `${extractedTicker} stock analysis market cap financials`;
    console.log(`🔍 [FALLBACK] Performing Brave search: "${searchQuery}"`);
    const webResults = await limitedBraveSearch(searchQuery);

    if (webResults && webResults.length > 0) {
      console.log(
        `✅ [FALLBACK] Brave search returned ${webResults.length} results:`
      );
      webResults.forEach((result, idx) => {
        console.log(`   ${idx + 1}. ${result.title || "No title"}`);
        console.log(`      URL: ${result.url || "No URL"}`);
        console.log(
          `      Snippet: ${(
            result.snippet ||
            result.content ||
            "No snippet"
          ).substring(0, 100)}...`
        );
      });

      const analysis = await generateStockAnalysisFromWebData(
        extractedTicker,
        webResults,
        userMessage
      );
      console.log(
        `✅ [FALLBACK] Generated analysis from web data (length: ${
          analysis?.length || 0
        } chars)`
      );
      return analysis;
    } else {
      console.warn(`⚠️ [FALLBACK] Brave search returned no results`);
    }
  } catch (error) {
    console.error("❌ [FALLBACK] Web search failed:", error);
  }

  // Final fallback using training data
  return generateTrainingDataStockAnalysis(extractedTicker, userMessage);
}

async function generateStockAnalysisFromWebData(
  ticker,
  webResults,
  userMessage
) {
  const context = webResults
    .slice(0, 3)
    .map((r) => r.content)
    .join("\n\n");

  const analysisPrompt = `Based on the following web search results about ${ticker}, provide a comprehensive stock analysis focusing on market cap, financial performance, and key metrics. Be specific and data-driven.

Web Results:
${context}

User Query: ${userMessage}

Provide a detailed analysis including:
- Current market cap and valuation
- Key financial metrics (P/E, P/S, etc.)
- Recent performance and trends
- Analyst sentiment if available
- Investment considerations`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: PRIMARY_OPENROUTER_MODEL,
          temperature: 0.3,
          max_tokens: 8000, // Allow comprehensive analysis responses
          messages: [
            {
              role: "system",
              content:
                "You are a financial analyst providing detailed stock analysis. Use the provided web data to give comprehensive insights about the company's financial position, market cap, and investment potential.",
            },
            { role: "user", content: analysisPrompt },
          ],
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;

      // Check if response was truncated
      if (finishReason === "length") {
        console.warn(
          "⚠️ [FALLBACK] Stock analysis response was truncated due to token limit"
        );
      }

      if (content && content.trim()) {
        return content;
      }

      // Fallback to training data if no content
      return generateTrainingDataStockAnalysis(ticker, userMessage);
    } else {
      console.error(
        "❌ [FALLBACK] API request failed:",
        response.status,
        response.statusText
      );
    }
  } catch (error) {
    console.error("❌ [FALLBACK] Analysis generation failed:", error);
  }

  return generateTrainingDataStockAnalysis(ticker, userMessage);
}

function generateTrainingDataStockAnalysis(ticker, userMessage) {
  // Use training data knowledge for common stocks
  const stockKnowledge = {
    BRO: {
      name: "Brown & Brown, Inc.",
      description:
        "Brown & Brown, Inc. is a leading insurance brokerage firm offering a range of insurance products and services.",
      marketCap: "Approximately $29 billion",
      industry: "Insurance",
      keyMetrics: "Strong financial performance with consistent revenue growth",
      analysis:
        "Brown & Brown is a well-established insurance brokerage with strong market position and consistent growth.",
    },
    AAPL: {
      name: "Apple Inc.",
      description:
        "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.",
      marketCap: "Over $3 trillion",
      industry: "Technology",
      keyMetrics: "High profitability with strong brand loyalty",
      analysis:
        "Apple is a technology giant with dominant market position in smartphones and services.",
    },
    MSFT: {
      name: "Microsoft Corporation",
      description:
        "Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.",
      marketCap: "Over $3 trillion",
      industry: "Technology",
      keyMetrics: "Strong cloud computing presence with Azure",
      analysis:
        "Microsoft is a technology leader with strong cloud and enterprise software presence.",
    },
    GOOGL: {
      name: "Alphabet Inc. (Google)",
      description:
        "Alphabet Inc. is a multinational technology conglomerate that owns Google and other subsidiaries.",
      marketCap: "Over $2 trillion",
      industry: "Technology",
      keyMetrics: "Dominant search engine and advertising platform",
      analysis:
        "Alphabet is a technology leader with strong positions in search, advertising, and cloud computing.",
    },
    AMZN: {
      name: "Amazon.com Inc.",
      description:
        "Amazon.com Inc. is a multinational technology company focusing on e-commerce, cloud computing, and digital streaming.",
      marketCap: "Over $1.5 trillion",
      industry: "Technology/Retail",
      keyMetrics: "Leading e-commerce platform and AWS cloud services",
      analysis:
        "Amazon is a dominant force in e-commerce and cloud computing with AWS.",
    },
    TSLA: {
      name: "Tesla Inc.",
      description:
        "Tesla Inc. designs, develops, manufactures, and sells electric vehicles and energy storage systems.",
      marketCap: "Over $800 billion",
      industry: "Automotive/Energy",
      keyMetrics: "Leading electric vehicle manufacturer",
      analysis:
        "Tesla is a pioneer in electric vehicles and renewable energy technology.",
    },
  };

  const stock = stockKnowledge[ticker.toUpperCase()];
  if (!stock) {
    return `I'd be happy to provide analysis for ${ticker}, but I don't have current real-time data available. For the most accurate and up-to-date information about ${ticker}'s market cap, financials, and performance, I'd recommend checking financial websites or your brokerage platform.

In the meantime, here's what I can tell you about stock analysis in general:
- **Market Cap** = share price × shares outstanding
- It's a key metric for understanding company size and valuation
- Large-cap stocks (>$10B) tend to be more stable
- Mid-cap stocks ($2B-$10B) often offer growth potential
- Small-cap stocks (<$2B) can be more volatile but have growth potential

Would you like me to help you understand any specific financial metrics or analysis techniques?`;
  }

  return `## ${stock.name} (${ticker}) Analysis

**Company Overview:**
${stock.description}

**Market Cap:** ${stock.marketCap}

**Industry:** ${stock.industry}

**Key Insights:**
${stock.analysis}

**Important Note:** This analysis is based on general knowledge and may not reflect the most current market conditions. For real-time data, current prices, and the most up-to-date financial metrics, I'd recommend checking your brokerage platform or financial websites.

**Key Metrics to Consider:**
- **P/E Ratio:** Price-to-earnings ratio indicates valuation relative to earnings
- **Revenue Growth:** Year-over-year revenue growth trends
- **Profit Margins:** Operating and net profit margins
- **Debt-to-Equity:** Financial leverage and stability
- **Dividend Yield:** Income potential for investors

Would you like me to explain any of these metrics in more detail, or help you understand how to evaluate stocks in general?`;
}

// Enhanced caching functions with different TTLs for different data types
async function getCachedData(type, identifier, userSpecific = false) {
  try {
    const cacheKey = `${type}_${identifier}`;

    const { data: cached, error } = await supabase
      .from("web_scrape_cache")
      .select("*")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (error) {
      console.error("❌ [CACHE] Error getting cached data:", error);
      return null;
    }

    if (!cached) {
      return null;
    }

    const now = new Date();
    const cachedAt = new Date(cached.created_at);

    // Different TTLs for different data types
    let ttl;
    switch (type) {
      case "user_summary":
        ttl = 30 * 60; // 30 minutes for user financial data (goals, accounts, transactions)
        break;
      case "market_data":
        ttl = 4 * 60 * 60; // 4 hours for market data
        break;
      case "enhanced_merchant":
        ttl = 2 * 60 * 60; // 2 hours for merchant data
        break;
      case "web_research":
      default:
        ttl = 30 * 24 * 60 * 60; // 30 days for web scraped data
        break;
    }

    const age = (now - cachedAt) / 1000;

    if (age > ttl) {
      return null;
    }

    // Cache hit
    return {
      data: cached.data_json,
      cachedAt: cached.created_at,
      ttl: ttl - age,
      source: "cache",
    };
  } catch (error) {
    console.error("❌ [CACHE] Error in getCachedData:", error);
    return null;
  }
}

async function setCachedData(type, identifier, data, userSpecific = false) {
  try {
    const cacheKey = `${type}_${identifier}`;

    const dataSize = JSON.stringify(data).length;
    if (dataSize > 1000000) {
      console.warn(`⚠️ [CACHE] Data too large for cache: ${dataSize} bytes`);
      return false;
    }

    const cacheData = {
      cache_key: cacheKey,
      data_type: type,
      data_json: data,
      user_specific: userSpecific,
      data_size: dataSize,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("web_scrape_cache")
      .upsert(cacheData, { onConflict: "cache_key" });

    if (error) {
      console.error("❌ [CACHE] Error setting cached data:", error);
      return false;
    }

    console.log(
      `✅ [CACHE] Cached data for ${cacheKey}, size: ${dataSize} bytes`
    );
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in setCachedData:", error);
    return false;
  }
}

async function getCachedDataWithFallback(
  type,
  identifier,
  fallbackFn,
  userSpecific = false
) {
  const cached = await getCachedData(type, identifier, userSpecific);
  if (cached) {
    return cached;
  }

  console.log(
    `🔄 [CACHE] Cache miss for ${type}_${identifier}, calling fallback`
  );
  try {
    const freshData = await fallbackFn();
    await setCachedData(type, identifier, freshData, userSpecific);

    return {
      data: freshData,
      cachedAt: new Date().toISOString(),
      ttl: 30 * 24 * 60 * 60,
      source: "fresh",
    };
  } catch (error) {
    console.error("❌ [CACHE] Fallback function failed:", error);
    throw error;
  }
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

    const { data: netWorthData, error } = await withTimeout(
      supabase.rpc("get_net_worth", { p_user_id: userId }),
      3000, // 3 second timeout
      null
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
          netWorth.investments_total || 0
        ),
        total_liabilities: formatNetWorthCurrency(
          netWorth.total_liabilities || 0
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
};
