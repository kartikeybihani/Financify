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

async function withTimeout(promise, ms, onTimeoutValue = null) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(onTimeoutValue), ms);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
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

// Centralized OpenRouter model selection. Override via OPENROUTER_MODEL env.
// Default to a widely available Grok model to avoid invalid ID errors.
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL;

// Memory extraction model - small, fast, free
const SMALLER_MODEL = "meta-llama/llama-3.3-8b-instruct:free";

// Session summarization model (LLM) via OpenRouter
const SUMMARY_MODEL = "deepseek/deepseek-r1-0528-qwen3-8b:free";

// Classification cache - in-memory cache for classification results
const classificationCache = new Map();
const CLASSIFICATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Data cache - in-memory cache for user data with different TTLs
const dataCache = new Map();

// Persistent cache using Supabase for cross-instance sharing
async function getPersistentCache(dataType, userId, params = {}) {
  try {
    const key = generateDataCacheKey(dataType, userId, params);
    logDebug(`🔍 [PERSISTENT_CACHE] Looking for ${dataType} with key: ${key}`);

    // Use .limit(1) to handle potential duplicates and get the most recent one
    const { data, error } = await supabase
      .from("context_cache")
      .select("*")
      .eq("cache_key", key)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }) // Get most recent entry first
      .limit(1);

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
      await cleanupDuplicateCacheEntries(key, userId);
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

    // First, delete any existing entries with the same cache_key and user_id
    await supabase
      .from("context_cache")
      .delete()
      .eq("cache_key", key)
      .eq("user_id", userId);

    // Then insert the new entry
    const { error } = await supabase.from("context_cache").insert({
      cache_key: key,
      user_id: userId,
      data_type: dataType,
      cache_data: data,
      expires_at: expires_at,
      created_at: new Date().toISOString(),
    });

    if (error) {
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
  // Fast-changing data (5 minutes) - in-memory priority
  financial_summary: 5 * 60 * 1000, // 5 minutes
  summary_min: 5 * 60 * 1000, // 5 minutes (reduced from 15)
  net_worth: 5 * 60 * 1000, // 5 minutes (reduced from 10)

  // Medium-changing data (15 minutes)
  spend_data: 15 * 60 * 1000, // 15 minutes (reduced from 30)
  goals_overview: 15 * 60 * 1000, // 15 minutes (reduced from 60)
  cashflow_monthly: 15 * 60 * 1000, // 15 minutes (reduced from 30)

  // Slow-changing data (30-60 minutes)
  investments_all: 60 * 60 * 1000, // 1 hour (reduced from 6 hours)
  category_transactions: 30 * 60 * 1000, // 30 minutes
};

// Centralized mapping from "needs" to pack keys and persistent cache types
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
  await setPersistentCache(dataType, userId, data, params);

  const ttlMinutes = Math.round(ttl / (60 * 1000));
  logDebug(
    `💾 [DATA_CACHE] Cached ${dataType} (${key}) - expires in ${ttlMinutes} minutes`
  );

  // Trigger cleanup if cache is getting large
  if (dataCache.size > CACHE_STRATEGY.in_memory.max_size) {
    logDebug(`🧹 [CACHE] Cache size exceeded limit, triggering cleanup`);
    await cleanupInMemoryCache();
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
async function cleanupAllCaches() {
  logInfo("🧹 [CACHE] Starting comprehensive cache cleanup...");

  const inMemoryCleaned = await cleanupInMemoryCache();
  const supabaseCleaned = await cleanupSupabaseCache();

  logInfo(
    `✅ [CACHE] Cleanup complete - In-memory: ${inMemoryCleaned}, Supabase: ${supabaseCleaned}`
  );

  return {
    inMemoryCleaned,
    supabaseCleaned,
    totalCleaned: inMemoryCleaned + supabaseCleaned,
  };
}

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

    console.log(`🗑️ [CACHE] Invalidated ${dataType} cache for user ${userId}`);
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
    console.log("🧹 [CACHE] Cleaning up existing duplicate cache entries...");

    // Get all cache entries and find duplicates manually
    const { data: allEntries, error } = await supabase
      .from("context_cache")
      .select("cache_key, user_id");

    if (error) {
      console.error("❌ [CACHE] Error finding duplicates:", error);
      return;
    }

    if (!allEntries || allEntries.length === 0) {
      console.log("✅ [CACHE] No cache entries found");
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
  console.log(
    "🔄 [CONVERSATION_LOG] logConversation called with:",
    conversationData?.timestamp
  );

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
            console.log(
              "📝 [CONVERSATION_LOG] Logged (fallback) to Supabase:",
              conversationData.timestamp
            );
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
        logDebug(
          "📝 [CONVERSATION_LOG] Logged conversation to Supabase:",
          conversationData.timestamp
        );
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
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];
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

  // Build safe context that overrides any client-provided user_id
  // But fall back to client-provided user_id if no JWT token is present (for testing)
  const finalUserId = serverUserId || context?.user_id;
  const chatId = req.body.chat_id || context?.chat_id; // Get chat_id from request

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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });
  }

  // Load conversation context from Supabase (if chat_id provided)
  // Skip context loading for first message in chat session
  let conversationContext = null;
  let isFirstMessage = false;

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

  // Load user profile (onboarding data) and memory in parallel
  // Pass message for semantic search in Supermemory
  const [userProfileData, userMemory] = await Promise.all([
    loadUserProfile(finalUserId),
    loadUserMemory(finalUserId, message || null),
  ]);

  // Merge profile data with existing userProfile (from auth metadata)
  const enrichedProfile = {
    name: userProfile.name || userProfileData.name,
    age: userProfile.age || userProfileData.age,
    occupation: userProfileData.occupation,
    finny_style: userProfileData.finny_style,
    intent_context: userProfileData.intent_context,
  };

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

    switch (finalAction) {
      case "classify":
        response = await handleClassify(
          message,
          safeContext,
          conversationContext
        );
        break;
      case "ask":
        response = await handleAsk(
          message,
          safeContext,
          "ask_personalized",
          classification,
          conversationContext
        );
        break;
      case "off_topic":
        response = await handleOffTopic(
          message,
          safeContext,
          conversationContext
        );
        break;
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
          response = await handleGoalConversation(
            message,
            safeContext,
            conversationContext
          );
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
      case "prebuild_context":
        response = await handlePrebuildContext(finalUserId);
        break;
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    // Handle streaming vs regular response
    if (wantsStreaming) {
      console.log("🔄 [STREAMING] Starting streaming response");

      // Send progress events first
      sendStreamEvent(res, "progress", {
        status: "Processing your request...",
      });

      // Extract the text to stream from the response
      let textToStream = null;
      if (typeof response.message === "string") {
        textToStream = response.message;
      } else if (typeof response.text === "string") {
        textToStream = response.text;
      } else if (Array.isArray(response.message)) {
        // Handle split messages
        textToStream = response.message.map((m) => m.content || m).join("\n\n");
      }

      if (textToStream) {
        console.log(
          "🔄 [STREAMING] Streaming text:",
          textToStream.substring(0, 100) + "..."
        );
        sendStreamEvent(res, "progress", { status: "Generating response..." });
        await streamTextChunks(res, textToStream);
      } else {
        console.log(
          "⚠️ [STREAMING] No text to stream in response:",
          Object.keys(response)
        );
      }

      // Send final complete response
      sendStreamEvent(res, "complete", response);
      res.end();
      console.log("✅ [STREAMING] Streaming completed");
    } else {
      res.status(200).json(response);
    }
    console.log("🔍 [FINNY] Response:", response);
  } catch (error) {
    console.error("❌ [FINNY] Error:", error);
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
  conversationContext = null
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

    logDebug("🎯 [FINNY] Extracted slots:", slots);
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
    const { packs, gaps, contextHeader } = await buildContextPacks(
      userId,
      needs,
      slots
    );

    logInfo("📦 [FINNY] Context packs built:", Object.keys(packs));
    logInfo("⚠️ [FINNY] Data gaps:", gaps);

    // 3.5) Check if this is a stock query after building context packs
    logDebug(
      "🔍 [STOCK_ROUTING] Checking if message looks like stock query:",
      message
    );
    const isStockQuery = looksLikeStockQuery(message);
    logDebug("🔍 [STOCK_ROUTING] Result:", isStockQuery);

    if (isStockQuery) {
      try {
        // Use the built context packs for stock queries
        logDebug("🔍 [STOCK] Using built context packs for stock analysis");
        logDebug("🔍 [STOCK] Available packs:", Object.keys(packs));

        // Get user context for personalization
        // Pass message for semantic search in Supermemory
        const userMemory = await loadUserMemory(userId, message || null);
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

        // Try deep query first
        if (looksLikeStockDeepQuery(message)) {
          logDebug("🔍 [STOCK] Deep query detected, using advanced analysis");
          stockPlan = await planStockRequest(message);
          logDebug("🔍 [STOCK] Stock plan result:", stockPlan);
          const exec = await executeStockPlan(stockPlan || {}, message);
          logDebug("🔍 [STOCK] Execute result:", exec);
          if (!exec.error && exec.data?.current != null) {
            stockData = exec;
          } else {
            logDebug(
              "🔍 [STOCK] Stock plan failed, falling back to simple query"
            );
          }
        } else {
          // Simple stock query
          const stockResponse = await getCachedDataWithFallback(
            "stock_snapshot",
            message.toLowerCase().trim(),
            async () => {
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
          const conversationalResponse =
            await generateConversationalStockResponse(
              stockData,
              message,
              userProfile,
              userMemory,
              investmentHoldings,
              stockPlan
            );

          const response = {
            message: cleanResponseFormatting(conversationalResponse),
            type: "assistant",
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
                model: "gpt-4o-mini",
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

          // Save conversation context synchronously
          if (context?.chat_id) {
            console.log("🔍 [STOCK CONTEXT] Saving context synchronously");
            await updateConversationContext(
              context.user_id,
              context.chat_id,
              message,
              response.message,
              contextMetadata
            );
            console.log("✅ [STOCK CONTEXT] Context saved successfully");
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
          // Stock APIs failed, use fallback analysis
          console.log(
            "🔄 [FALLBACK] Stock APIs failed, using fallback analysis"
          );
          const fallbackResponse = await generateFallbackStockAnalysis(
            null, // ticker will be extracted from message
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
      transactions: packs.base?.recentTransactions || [],
    };
    const userState = detectUserState(message, financialDataForState);
    console.log("🎯 [PROMPT ENGINE] Detected user state:", userState);

    // 5) Build context-aware prompt using new prompt engine
    let system = buildContextAwarePrompt(
      message,
      context,
      financialDataForState,
      userState
    );

    // Add additional context sections that aren't handled by prompt engine
    const additionalSections = [];

    // User profile financial perspective (from onboarding)
    if (context.profile?.intent_context) {
      additionalSections.push(
        "",
        "USER'S FINANCIAL PERSPECTIVE (from onboarding - use as reference, may not be current):",
        context.profile.intent_context
      );
    }

    // Communication style preference
    if (context.profile?.finny_style) {
      additionalSections.push(
        "",
        `COMMUNICATION STYLE PREFERENCE: User prefers ${context.profile.finny_style} communication style. Adjust your tone accordingly:`,
        context.profile.finny_style === "direct"
          ? "- Be more direct and to-the-point, focus on facts and numbers"
          : context.profile.finny_style === "witty"
          ? "- Add more humor and light-heartedness while staying professional"
          : "- Use conversational, friendly tone (default)"
      );
    }

    // Memory context from Supermemory (already ranked by semantic search)
    const memorySections = [];
    if (context.memory?.memories?.length > 0) {
      // Group memories by context_type from metadata
      const memoriesByType = {};
      context.memory.memories.forEach((m) => {
        const type = m.context_type || "general";
        if (!memoriesByType[type]) {
          memoriesByType[type] = [];
        }
        memoriesByType[type].push(m);
      });

      // Build prompt sections using content from Supermemory documents
      // Note: v4/search returns 'memory' field (mapped to 'content'), not 'summary'
      // Summaries are only available in list endpoint, not search endpoint
      Object.entries(memoriesByType).forEach(([type, mems]) => {
        // Use content (which contains the memory text from v4/search)
        // Limit each memory to 200 chars to avoid prompt bloat
        const memoryTexts = mems
          .map((m) => {
            const text = m.content || m.summary || "";
            return text.length > 200 ? text.substring(0, 200) + "..." : text;
          })
          .filter(Boolean)
          .join("; ");
        if (memoryTexts) {
          // Format context type names for readability
          const typeLabel =
            type === "goal"
              ? "Goals"
              : type === "constraint"
              ? "Constraints"
              : type === "preference"
              ? "Preferences"
              : type === "life_event"
              ? "Life Events"
              : type === "decision"
              ? "Decisions"
              : type.charAt(0).toUpperCase() + type.slice(1);
          memorySections.push(`${typeLabel}: ${memoryTexts}`);
        }
      });
    }

    if (memorySections.length > 0) {
      additionalSections.push("", "USER MEMORIES:", ...memorySections);
    }

    // Add web context if available
    if (webSummary) {
      additionalSections.push(
        "",
        "WEB CONTEXT:",
        "The following is current information from web search:",
        "",
        webSummary,
        "",
        "IMPORTANT: Use the web search results above for current information. These results are more up-to-date than training data.",
        "",
        "SOURCE INCLUSION: When using web search results, ALWAYS include 2-3 most relevant source URLs in your response. Format them as links at the end of your response under a 'Sources:' section. Choose the most authoritative and directly relevant sources. Do NOT overwhelm with too many sources - quality over quantity.",
        "",
        "LINK PROVISION: When suggesting users go online for additional resources (like checking credit scores, applying for credit cards, or accessing specific services), ALWAYS provide the direct link if you have it. This saves users time and provides immediate access to the resources you're recommending."
      );
      if (context.userPrompt) {
        additionalSections.push("", "USER GUIDANCE:", context.userPrompt);
      }
    }

    // Add standard response guidelines (these are always needed)
    additionalSections.push(
      "",
      "ADDITIONAL RESPONSE GUIDELINES:",
      "- ALWAYS prioritize web search results over training data for current information (rates, limits, rules, etc.)",
      "- If user asks about 'accounts', show individual account names, balances, and types from the provided account data",
      "- If user asks 'net worth' or 'what's my net worth', ALWAYS include a brief breakdown: show total plus top 2–3 contributors across what you have and what you owe (e.g., cash, investments, credit card debt). Use simple language like 'money you have' instead of 'assets' and 'money you owe' instead of 'liabilities'. Keep it concise, no long lists",
      "- If user asks about 'investments' or 'holdings', then show ALL holdings with their symbols, descriptions, and market values. Do not limit to top ones - show the complete portfolio",
      "- If user asks for 'investment advice' or 'financial advice', focus on actionable recommendations, not data dumps",
      "- If required data is missing (e.g., no transactions or summary), explicitly say so and ask the user to refresh or connect accounts. Do NOT fabricate data.",
      "- When listing transactions, ONLY use transactions present in the provided context. If none exist, say you couldn't find recent transactions.",
      "- For amounts like net worth, ONLY use values from the context. If missing, state that it's unavailable.",
      "- NEVER make meta-references to data sources or summaries. Avoid phrases like 'matching the summary', 'as shown in your summary', 'according to your data', 'based on your financial summary', 'based on the data you shared', 'this is based on data', 'data you shared', or any similar phrases.",
      "- Present information as if it's naturally known, without mentioning where you got it from or how you accessed it.",
      "- When mentioning that things might change (like net worth, balances, etc.), do it conversationally: 'If anything changes—like a new loan or a big purchase—let me know and we can update it.' Do NOT say 'based on data you shared' or 'this snapshot is based on' - just state the information naturally.",
      "",
      "RESPONSE STRUCTURE FOR BETTER MESSAGE SPLITTING:",
      "- For GOAL queries: Structure as 'Here's your current goals:' followed by all goals in bullet points in ONE cohesive message, then separate message for progress commentary",
      "- For INVESTMENT HOLDINGS queries: List ALL holdings with their details in bullet points. Do not limit to top holdings - show the complete portfolio",
      "- For INVESTMENT advice: Group related bullet points (sector overlap, risk tolerance, diversification) together in logical chunks",
      "- Use clear section breaks with phrases like 'Bottom line:', 'Heads up:', 'Hit me up if you need help' to create natural split points",
      "- Keep related content together - don't split mid-concept or mid-sentence",
      "- End with actionable next steps or encouragement in a separate message when appropriate",
      "",
      "GOAL QUERY DETECTION:",
      "- If user asks about their goals (current goals, my goals, goal progress, etc.), this is a personal data query",
      "- For goal queries, do NOT include any source links or external references",
      "- Focus purely on their personal goal data and provide encouragement/advice without external sources",
      "",
      "CRITICAL FORMATTING RULES:",
      "- NEVER use markdown headers (no ###, ##, #) or hashtags",
      "- NEVER use numbered headers with emojis (like ### 1️⃣)",
      "- You CAN use double asterisks (**text**) for emphasis - the chat system will handle the formatting",
      "- NEVER use single asterisks (*text*) or underscores (__text__, _text_)",
      "- NEVER use code blocks (`code` or ```code```)",
      "- Write in plain text format - like you're texting a friend",
      "- Use simple line breaks and bullet points with dashes (-) instead of markdown",
      "- Keep the conversational tone natural and chat-like",
      "- Avoid any formatting that would look robotic or structured",
      "",
      "DATA INTERPRETATION:",
      "- IMPORTANT: In transaction data, EXPENSE means money spent (going out), INCOME means money received (coming in).",
      "- CREDIT CARD DATA STRUCTURE: For credit cards, 'current_balance' is the debt amount (what you owe), and 'available_balance' is the credit limit. Available credit = credit limit - debt.",
      "- SPENDING BY CATEGORY INTERPRETATION: When you see 'Spending by category' data, these represent RECURRING monthly expenses. Housing = rent/mortgage, Food = groceries, Transportation = commute costs, etc. Use this to estimate upcoming obligations when suggesting cash use for emergencies.",
      "",
      "FINANCIAL PROJECTIONS & CALCULATIONS:",
      "- When users ask about retirement, FIRE, or financial goals, perform compound growth calculations using their actual data",
      "- Use realistic assumptions: 7% annual return for investments, 3% inflation for long-term projections",
      "- For retirement projections: Target 25x annual expenses (4% rule) unless user specifies different amount",
      "- Calculate monthly savings needed to reach goals and provide specific, actionable recommendations",
      "- Show both optimistic and conservative scenarios when appropriate",
      "- Always explain the math behind your projections in simple terms",
      "- If user asks 'can I achieve X goal', provide a clear yes/no with supporting calculations",
      "- EMERGENCY CASH CALCULATIONS: When suggesting using cash for emergencies, ALWAYS calculate: Available cash - Emergency expense - Upcoming monthly obligations (from spending by category) = Remaining buffer. If remaining buffer is tight (< $500), acknowledge the constraint and suggest alternatives (payment plans, credit, prioritizing bills). Don't just say 'you have enough' - show the full financial picture.",
      "",
      "DISCLAIMERS:",
      "- Only add investment disclaimer ('Note: This response is for informational purposes and does not constitute financial advice.') when the user asks specifically about investments, investing advice, or investment-related recommendations.",
      "",
      "CRITICAL: AVOID SUGGESTING COMPETITOR FINANCIAL APPS:",
      "- NEVER suggest using Mint, YNAB, Personal Capital, or other budgeting/expense tracking apps",
      "- NEVER recommend external financial advisory apps or money management tools",
      "- You ARE the financial advisor and app - always suggest using Finny's features for budgeting, expense tracking, and financial analysis",
      "- You CAN suggest legitimate financial services that Finny doesn't provide:",
      "  * Credit score checks (Credit Karma, Experian, etc.)",
      "  * Bank transfers or account management through their actual banks",
      "  * Investment platforms for specific needs Finny doesn't cover",
      "  * Insurance providers or other non-competitive financial services",
      "- Always end responses by encouraging users to ask Finny about their specific financial questions"
    );

    // Combine base prompt with additional sections
    system = system + "\n\n" + additionalSections.join("\n");

    // Build context from packs
    logDebug("🔍 [CONTEXT] Building context from packs:", {
      packsKeys: Object.keys(packs),
      hasBase: !!packs.base,
      baseKeys: packs.base ? Object.keys(packs.base) : [],
    });
    const contextLines = [contextHeader];

    if (packs.base) {
      logDebug("🔍 [CONTEXT] Building context from packs.base:", {
        hasBase: !!packs.base,
        baseKeys: Object.keys(packs.base || {}),
        netWorth: packs.base?.netWorth,
        liquidAssets: packs.base?.liquidAssets,
      });
      contextLines.push("Financial Summary:");
      contextLines.push(`Net Worth: $${packs.base.netWorth}`);
      contextLines.push(`Money You Have (Cash): $${packs.base.liquidAssets}`);
      contextLines.push(`Investments Total: $${packs.base.investmentsTotal}`);
      contextLines.push(
        `Money You Owe (Debt): $${packs.base.totalLiabilities}`
      );

      if (packs.base.accounts?.length > 0) {
        contextLines.push("Your accounts:");
        packs.base.accounts.forEach((account) => {
          const balance =
            account.current_balance || account.available_balance || 0;
          const accountName =
            account.name || account.official_name || "Unknown Account";
          const accountType = account.type || "Unknown Type";
          contextLines.push(
            `${accountName} (${accountType}): $${Number(balance).toFixed(2)}`
          );
        });
      }

      if (packs.base.recentTransactions?.length > 0) {
        contextLines.push("Recent transactions:");
        packs.base.recentTransactions.forEach((txn) => {
          const amount = Math.abs(txn.amount);
          const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
          const sign = txn.amount < 0 ? "-" : "+";
          contextLines.push(
            `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
              txn.merchant
            }`
          );
        });
      }

      if (packs.base.spendByCategory?.length > 0) {
        contextLines.push("Spending by category:");
        packs.base.spendByCategory.forEach((category) => {
          contextLines.push(
            `${category.category}: $${Number(category.total_spend).toFixed(
              2
            )} (${category.txn_count} transactions)`
          );
        });
      }
    }

    if (packs.spend) {
      contextLines.push(
        `Spending for ${packs.spend.period || "selected period"}:`
      );
      contextLines.push(
        `Total: $${packs.spend.total} (${packs.spend.count} transactions)`
      );

      if (packs.spend.category) {
        contextLines.push(`Category: ${packs.spend.category}`);
      }

      if (packs.spend.transactions?.length > 0) {
        contextLines.push("Transactions:");
        packs.spend.transactions.forEach((txn) => {
          const amount = Math.abs(txn.amount);
          const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
          const sign = txn.amount < 0 ? "-" : "+";
          contextLines.push(
            `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
              txn.merchant
            }`
          );
        });
      }
    }

    // Add detailed category transactions when available
    if (packs.categoryDetails) {
      contextLines.push(
        `${packs.categoryDetails.category} transactions (${packs.categoryDetails.period}):`
      );
      packs.categoryDetails.transactions.forEach((txn) => {
        const amount = Math.abs(txn.amount);
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        contextLines.push(
          `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
            txn.merchant || txn.name
          }`
        );
      });
    }

    if (packs.invest?.holdings?.length > 0) {
      contextLines.push(
        `Investment holdings (${packs.invest.holdings.length} total):`
      );
      packs.invest.holdings.forEach((holding) => {
        contextLines.push(
          `${holding.symbol} (${holding.description}): ${
            holding.units
          } shares, $${holding.market_value.toFixed(2)}`
        );
      });
    }

    if (packs.goals?.goals?.length > 0) {
      contextLines.push("Current goals:");
      packs.goals.goals.forEach((goal) => {
        contextLines.push(
          `${goal.label}: $${goal.current_amount.toFixed(
            2
          )} / $${goal.target_amount.toFixed(2)} (${
            goal.progress_pct
          }%) - Due ${goal.target_date}`
        );
      });
    }

    if (packs.cashflow?.cashflow?.length > 0) {
      contextLines.push("Recent cashflow:");
      packs.cashflow.cashflow.forEach((cf) => {
        contextLines.push(
          `${cf.month}: Income $${cf.income.toFixed(
            2
          )}, Expenses $${cf.expense.toFixed(2)}, Net $${cf.net.toFixed(2)}`
        );
      });
    }

    // Add conversation context if available
    if (conversationContext?.active_topic || conversationContext?.last_entity) {
      contextLines.push("\n--- Conversation Context ---");
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

    const contextNote = contextLines.join("\n");
    logDebug("🔍 [FINNY] Context note:", contextNote);

    // 5) Parallel processing: Main response + Memory extraction
    const llmT0 = Date.now();

    // Memory extraction removed - migrating to Supermemory
    let memoryExtraction = [];
    const [resp] = await Promise.all([
      // Main response (existing LLM)
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL || SMALLER_MODEL,
          temperature: 0.25,
          max_tokens: 5000,
          stream: false,
          reasoning: { exclude: true }, // Disable reasoning output, only return actual response
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: `Context:\n${contextNote}\n\nUser: ${message}`,
            },
          ],
        }),
      }),
    ]);

    // 🔍 DEBUG: Log context extraction after LLM call
    logDebug("🔍 [CONTEXT DEBUG] After LLM call:");
    logDebug("  - Message:", message);
    logDebug("  - Context provided:", contextNote ? "YES" : "NO");
    if (contextNote) {
      logDebug("  - Context content:", contextNote.substring(0, 200) + "...");
    }
    logDebug(
      "  - Conversation context loaded:",
      context?.conversationContext ? "YES" : "NO"
    );
    if (context?.conversationContext) {
      logDebug("  - Active topic:", context.conversationContext.active_topic);
      logDebug("  - Last entity:", context.conversationContext.last_entity);
      logDebug(
        "  - Pending action:",
        context.conversationContext.pending_action
      );
    }

    // Memory extraction removed - migrating to Supermemory for memory management
    memoryExtraction = [];

    timings.llm_ms = Date.now() - llmT0;
    toolsUsed.push({
      name: "llm",
      latency_ms: timings.llm_ms,
      cache_hit: false,
    });

    console.log("🔵 [LLM] Response status:", resp.status);
    console.log("🔵 [LLM] Response ok:", resp.ok);

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error("❌ [FINNY] OpenRouter API error:", resp.status);
      console.error("❌ [FINNY] Error response:", errorText);
      try {
        const errorData = JSON.parse(errorText);
        console.error(
          "❌ [FINNY] Parsed error:",
          JSON.stringify(errorData, null, 2)
        );
      } catch (e) {
        console.error("❌ [FINNY] Could not parse error response");
      }
      return {
        message: cleanResponseFormatting("I'm glitching right now—try again."),
        type: "assistant",
      };
    }

    const data = await resp.json();
    console.log("🔵 [LLM] Response data keys:", Object.keys(data));
    console.log("🔵 [LLM] Choices length:", data.choices?.length || 0);
    console.log(
      "🔵 [LLM] First choice:",
      JSON.stringify(data.choices?.[0], null, 2)
    );

    // Extract response content (reasoning disabled, so content should always be present)
    const responseMessage = data.choices?.[0]?.message || {};
    const cleanText =
      responseMessage.content || "I'm not sure yet. Ask me again?";

    console.log("🔵 [LLM] Extracted cleanText length:", cleanText?.length || 0);
    console.log(
      "🔵 [LLM] cleanText preview:",
      cleanText?.substring(0, 200) || "EMPTY"
    );

    if (cleanText === "I'm not sure yet. Ask me again?") {
      console.warn("⚠️ [LLM] Using fallback response!");
      console.warn(
        "⚠️ [LLM] Full API response:",
        JSON.stringify(data, null, 2)
      );
    }

    // Memory saving will happen after topic detection (see below)

    // Clean any markdown formatting from the response
    const cleanedMessage = cleanResponseFormatting(
      gaps.length > 0
        ? `${cleanText}\n\n(Using available data - some data may be incomplete.)`
        : cleanText
    );

    // Split long responses into digestible chunks for better UX
    const splitMessages = splitLongResponse(cleanedMessage);

    const response = {
      message:
        splitMessages.length === 1 ? splitMessages[0].content : splitMessages,
      type: "assistant",
      isSplit: splitMessages.length > 1,
    };

    // Log the conversation
    // Bug fix: Log cleanedMessage (actual response sent to user) instead of cleanText (raw LLM output)
    const conversationData = {
      user_message: redactPII(message),
      finny_response: redactPII(cleanedMessage),
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "ask_personalized",
      entities: [],
      confidence: 1.0,
      response_time_ms: Date.now() - startTime,
      sources_used:
        webResults.length > 0 ? [...toolsUsed, "brave-search"] : toolsUsed,
      cached: false,
      context_packs: Object.keys(packs),
      data_gaps: gaps,
      request_id: generateRequestId(),
      web_research: webResults.length > 0,
      classification_result: classificationResult,
      metrics: {
        intent: "ask_personalized",
        latency_ms: {
          total: Date.now() - startTime,
          llm: timings.llm_ms,
          data_fetch: timings.summary_ms + timings.user_data_ms,
          web_search: timings.web_ms,
        },
        tools_used: toolsUsed,
        model: OPENROUTER_MODEL,
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

    // Log topic detection for debugging
    if (topicDetection.topic) {
      console.log(`🎯 [TOPIC] Detected: ${topicDetection.topic}`);
      console.log(`🎯 [TOPIC] Entity:`, topicDetection.entity);
      console.log(
        `🎯 [TOPIC] Pending action: ${topicDetection.pending_action}`
      );
    }

    // Update conversation context SYNCHRONOUSLY to ensure it's saved before response
    if (context?.chat_id) {
      console.log(
        "🔍 [CONTEXT SAVE] Saving context synchronously before response"
      );
      await updateConversationContext(
        context.user_id,
        context.chat_id,
        message,
        response.message, // Use updated message with goal offer
        contextMetadata
      );
      console.log("✅ [CONTEXT SAVE] Context saved successfully");
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

    return response;
  } catch (error) {
    console.error("❌ [FINNY] Ask handler error:", error);
    return {
      message: cleanResponseFormatting(
        "I'm having some technical difficulties right now. Please try again in a moment."
      ),
      type: "assistant",
    };
  }
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

  // Remove markdown tables (| col1 | col2 |)
  cleaned = cleaned.replace(/\|.*\|/g, "");

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

// === GEN Z LANGUAGE ENHANCEMENT ===
// This function is now removed - Gen Z language is handled via prompt engineering

// === ENHANCED WEB SEARCH DETECTION ===
// Enhanced web search detection patterns
function detectWebSearchNeeded(message) {
  const lowerMessage = message.toLowerCase();
  // Do not trigger web search for off-topic queries (e.g., weather)
  const offTopicCheck = detectOffTopic(message);
  if (offTopicCheck.isOffTopic && offTopicCheck.confidence >= 0.7) return false;

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
function detectOffTopic(message, conversationContext = null) {
  const lower = message.toLowerCase();

  // Comprehensive financial terms list - if message contains any, it's NOT off-topic
  const financeTerms = [
    // Core financial terms
    "money",
    "financial",
    "finance",
    "finances",
    "wealth",
    "budget",
    "budgeting",
    "expense",
    "expenses",
    "income",
    "salary",
    "wage",
    "earn",
    "earning",
    "debt",
    "loan",
    "mortgage",
    "rent",
    "renting",
    "lease",
    "payment",
    "payments",
    "cost",
    "costs",
    "price",
    "prices",
    "expensive",
    "cheap",
    "afford",
    "affordable",
    "save",
    "saving",
    "spend",
    "spent",
    "spending",
    "invest",
    "investment",
    "investments",
    "account",
    "accounts",
    "balance",
    "net worth",
    "credit",
    "debit",
    "card",
    "cards",
    "transaction",
    "transactions",
    "bill",
    "cash",
    "dollar",
    "dollars",
    "cent",
    "cents",
    // Investment terms
    "stock",
    "stocks",
    "ira",
    "401k",
    "roth",
    "rate",
    "rates",
    "limit",
    "limits",
    // Purchase/housing terms
    "buy",
    "buying",
    "purchase",
    "house",
    "home",
    // Goal terms
    "goal",
    "goals",
    "achieve",
  ];

  // If message contains financial terms, it's NOT off-topic
  if (financeTerms.some((term) => lower.includes(term))) {
    return { isOffTopic: false, confidence: 0.0 };
  }

  // Strong off-topic indicators (high confidence)
  const strongOffTopicPatterns = [
    // Weather & environment
    "what's the weather",
    "weather today",
    "weather forecast",
    "temperature today",
    "is it raining",
    "is it sunny",
    "what's the weather like",

    // Cooking & food
    "recipe for",
    "cooking",
    "baking",

    // Entertainment
    "what movie",
    "netflix",
    "tv show",
    "entertainment",
    "cinema",
    "actor",
    "actress",
    "director",
    "oscar",
    "award",
    "film",

    // Philosophy / existential
    "meaning of life",
    "purpose of life",
    "existential",

    // AI meta
    "surpass human intelligence",
    "are you an ai",
    "do you know that you're an ai",
    "can you learn from our previous conversations",

    // Humor / riddles
    "why did the chicken cross the road",
    "riddle",
    "tell me a joke",
    "amuse me",

    // Technical support
    "computer",
    "laptop",
    "phone",
    "internet",
    "wifi",
    "password",
    "login",
    "software",
    "app",
    "download",
    "install",
    "update",
    "virus",
    "bug",

    // Academic
    "homework",
    "assignment",
    "school",
    "university",
    "college",
    "study",
    "exam",
    "test",
    "grade",
    "teacher",
    "professor",
  ];

  if (strongOffTopicPatterns.some((p) => lower.includes(p))) {
    return { isOffTopic: true, confidence: 0.9 }; // High confidence
  }

  // Weak off-topic indicators (medium confidence)
  const weakOffTopicPatterns = [
    // General greetings (might be followed by financial question)
    "hello",
    "hi",
    "hey",
    "how are you",
    "what's up",
    "good morning",
    "good evening",

    // Broad weather
    "weather",
    "forecast",

    // Ethics / morality
    "acceptable to lie",
    "is it ok to lie",
    "is it ever acceptable",
    "ethical",
    "morality",
    "moral",

    // Emotions (but could be financial stress)
    "feeling really down",
    "depressed",
    "anxious",
    "anxiety",
    "sad",

    // Culture / etiquette
    "best practices for greeting",
    "etiquette",
    "cultural",

    // General chat
    "joke",
    "funny",
    "laugh",
    "humor",
  ];

  if (weakOffTopicPatterns.some((p) => lower.includes(p))) {
    return { isOffTopic: true, confidence: 0.6 }; // Medium confidence
  }

  // Trust/meta questions (medium-high confidence)
  const trustPatterns = [
    "can i trust you",
    "are you trustworthy",
    "can we trust",
    "is this trustworthy",
    "are you reliable",
    "can i trust this",
    "can i rely on you",
  ];

  if (trustPatterns.some((p) => lower.includes(p))) {
    return { isOffTopic: true, confidence: 0.75 }; // Medium-high confidence
  }

  // No off-topic detected
  return { isOffTopic: false, confidence: 0.0 };
}

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
  const now = new Date();

  if (lowerMessage.includes("last month")) {
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
      const cachedData = await getCachedUserData(cacheType, userId);
      if (cachedData) {
        logInfo(`✅ [FINNY] Using pre-built context for: ${need}`);
        logDebug(`🔍 [FINNY] Pre-built data for ${need}:`, {
          hasData: !!cachedData,
          dataKeys: Object.keys(cachedData || {}),
          isCached: true,
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
  if (slots?.category && slots?.period) {
    const cacheKey = `category_transactions_${slots.category}_${slots.period.start}_${slots.period.end}`;
    const cachedCategoryTxns = await getCachedUserData(
      "category_transactions",
      userId,
      {
        category: slots.category,
        period: slots.period,
      }
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
      addOperation(cacheKey, {
        key: cacheKey,
        type: "category_transactions",
        userId,
        category: slots.category,
        period: slots.period,
        cached: false,
        priority: 2,
        servesNeeds: ["category_details", "txns_by_category"],
        fetchers: [
          {
            name: "category_transactions",
            rpc: "get_transactions_by_category",
            params: {
              p_user_id: userId,
              p_category: slots.category,
              p_start: slots.period.start,
              p_end: slots.period.end,
            },
          },
        ],
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
    const fetcherPromises = operation.fetchers.map((fetcher) =>
      withTimeout(supabase.rpc(fetcher.rpc, fetcher.params), 2000, null).catch(
        (error) => {
          console.error(`❌ [FINNY] ${fetcher.name} fetch failed:`, error);
          return null;
        }
      )
    );

    const results = await Promise.all(fetcherPromises);

    // Process results based on operation type
    const processedData = processOperationData(operation, results);

    if (processedData) {
      // Cache the processed data
      await cacheOperationData(operation, processedData);
      return { success: true, data: processedData, cached: false };
    } else {
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
          if (operation.servesNeeds?.includes("category_details")) {
            packs.categoryDetails = data;
          }
          if (operation.servesNeeds?.includes("txns_by_category")) {
            packs.spend = { ...packs.spend, ...data };
          }
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
  if (!net) return null;

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
  const [txnRes] = results;
  if (!txnRes?.data || txnRes.data.length === 0) return null;

  return {
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

// Heuristic: detect clearly in-scope financial concept questions to avoid false off-topic
function financialConceptHeuristic(raw) {
  const text = (raw || "").toLowerCase();
  if (!text) return null;

  // Investment advice queries - should NOT need web search
  const investmentAdvicePatterns = [
    "investment advice",
    "investing advice",
    "investment recommendations",
    "what should i invest in",
    "investment suggestions",
    "portfolio advice",
    "investment guidance",
    "investment help",
    "investing help",
    "what to invest in",
    "investment tips",
    "investing tips",
  ];

  if (investmentAdvicePatterns.some((pattern) => text.includes(pattern))) {
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: 0.9,
      heuristic: true,
    };
  }

  // Personal financial data queries - should NOT need web search
  const personalFinancialPatterns = [
    "my net worth",
    "net worth",
    "my spend",
    "my spending",
    "my transaction",
    "my balance",
    "my account",
    "my money",
    "my financial",
    "how much did i",
    "what did i spend",
    "my expenses",
    "my income",
    "my assets",
    "my goals",
    "current goals",
    "what are my goals",
  ];

  const isPersonalQuery = personalFinancialPatterns.some((pattern) =>
    text.includes(pattern)
  );

  if (isPersonalQuery) {
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: 0.9,
      heuristic: true,
    };
  }

  // If contains these finance keywords, treat as in-scope concept unless it's about app/tech
  const financeKeywords = [
    "credit",
    "debit",
    "card",
    "apr",
    "interest",
    "loan",
    "mortgage",
    "budget",
    "budgeting",
    "saving",
    "savings",
    "checking",
    "account",
    "fico",
    "credit score",
    "bnpl",
    "tax",
    "ira",
    "401k",
    "roth",
    "brokerage",
    "stock",
    "stocks",
    "etf",
    "mutual fund",
    "dividend",
    "net worth",
    "cashflow",
    "cash flow",
  ];

  const hasFinanceKeyword = financeKeywords.some((k) => text.includes(k));

  // Specific: credit vs debit concept
  const creditAndDebit = text.includes("credit") && text.includes("debit");
  const vsOrDifference =
    creditAndDebit &&
    (text.includes(" vs ") ||
      text.includes("difference") ||
      text.includes("b/w") ||
      text.includes("between"));

  if (vsOrDifference || hasFinanceKeyword) {
    // Classify based on whether it's personal or general
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: isPersonalQuery,
      state: null,
      entities: [],
      confidence: 0.85,
      heuristic: true,
    };
  }

  return null;
}

function detectConversationTopic(message, conversationContext) {
  const text = message.toLowerCase();

  // 🔍 DEBUG: Log topic detection
  console.log("🔍 [TOPIC DEBUG] Detecting conversation topic:");
  console.log("  - Message:", message);
  console.log(
    "  - Conversation context:",
    conversationContext ? "EXISTS" : "NULL"
  );
  if (conversationContext) {
    console.log("  - Active topic:", conversationContext.active_topic);
    console.log(
      "  - Last entity:",
      JSON.stringify(conversationContext.last_entity)
    );
  }

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
    console.log(
      "🔄 [TOPIC CLEARING] Detected topic change, clearing active topic"
    );
    console.log("  - Previous topic:", conversationContext.active_topic);
    console.log("  - New topic pattern detected");
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
    console.log("🔍 [CONTINUATION DEBUG] Checking continuation patterns:");
    console.log("  - Has continuation pattern:", hasContinuationPattern);
    console.log("  - Active topic:", conversationContext.active_topic);
    console.log(
      "  - Last entity:",
      JSON.stringify(conversationContext.last_entity)
    );

    if (hasContinuationPattern) {
      console.log("✅ [CONTINUATION] Pattern detected, inheriting context");
      return {
        topic: conversationContext.active_topic,
        entity: conversationContext.last_entity || {},
        pending_action: conversationContext.pending_action,
      };
    }
  }

  // 1. INVESTMENT & STOCKS (Gen Z loves crypto and stocks)
  if (
    /\b(stock|stocks|invest|investment|portfolio|trading|buy|sell)\b/i.test(
      text
    ) ||
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

function detectGoalIntent(message, conversationContext) {
  const lower = message.toLowerCase();

  // Check if there's an active goal flow in session state
  const activeGoalFlow = conversationContext?.goal_flow;
  const isContinuingGoalFlow = activeGoalFlow && activeGoalFlow.active;

  // 0.5. Check for advice-seeking patterns FIRST (these override goal creation patterns)
  const adviceSeekingPatterns = [
    /\bshould\s+i\s+(?:save|buy|invest|spend)/i, // "Should I save/buy/invest"
    /\bis\s+it\s+(?:worth|smart|good|wise)/i, // "Is it worth/smart/good"
    /\bcan\s+i\s+afford/i, // "Can I afford"
    /\bwhat'?s?\s+a\s+good/i, // "What's a good"
    /\bhow\s+much\s+(?:should|can|could)/i, // "How much should/can/could"
  ];

  if (adviceSeekingPatterns.some((p) => p.test(message))) {
    console.log(
      "✅ [GOAL] Advice-seeking pattern detected → routing to ask_personalized"
    );
    return {
      intent: "ask_personalized",
      confidence: 0.9,
      reason: "advice_query",
    };
  }

  // 1. EXPLICIT goal creation patterns (high confidence)
  const explicitGoalPatterns = [
    /\b(?:create|set|add|make)\s+(?:a\s+)?(?:new\s+)?goal/i,
    /\bgoal\s+(?:for|to)\s+(?:save|buy)/i,
    /\b(?:i\s+want\s+to|i'd\s+like\s+to|let'?s)\s+save\s+\$?\d+[k]?\s+(?:for|toward)/i, // "I want to save $5000 for" or "Let's save $5000 for"
    /\btarget\s+(?:amount|of)\s+\$?\d+/i, // "target amount $5000"
  ];

  if (explicitGoalPatterns.some((p) => p.test(message))) {
    console.log("✅ [GOAL] Explicit goal creation detected");
    return {
      intent: "goal_conversation",
      confidence: 0.95,
      reason: "goal_creation",
    };
  }

  // 1.5. If there's an active goal flow, any response is likely goal-related
  if (isContinuingGoalFlow) {
    // Check if it's clearly off-topic
    const offTopicKeywords = ["weather"];
    const isOffTopic = offTopicKeywords.some((keyword) =>
      lower.includes(keyword)
    );

    if (!isOffTopic) {
      console.log("✅ [GOAL] Continuing active goal flow detected");
      return {
        intent: "goal_conversation",
        confidence: 0.85,
        reason: "continuing_goal_flow",
      };
    }
  }

  // 2. INQUIRY about existing goals (should be ask_personalized, NOT goal_conversation)
  const goalInquiryPatterns = [
    /\b(?:what are|show|list|tell me|display)\s+(?:my\s+)?(?:current\s+)?goals?\b/i,
    /\bam\s+i\s+on\s+track.*goals?\b/i,
    /\bgoal\s+(?:progress|status|update)/i,
    /\bhow.*doing.*goals?\b/i,
  ];

  if (goalInquiryPatterns.some((p) => p.test(message))) {
    console.log(
      "✅ [GOAL] Goal inquiry detected → routing to ask_personalized"
    );
    return {
      intent: "ask_personalized",
      confidence: 0.9,
      reason: "data_query",
    };
  }

  // 3. NOT goal creation - general financial queries (affordability, advice, recommendations)
  const nonGoalPatterns = [
    /\bcan\s+i\s+afford/i, // Affordability check
    /\bshould\s+i\s+buy/i, // Purchase advice
    /\bis\s+it\s+worth\s+it/i, // Value assessment
    /\bis\s+it\s+smart\s+to/i, // Advice seeking
    /\bwhat.*(?:spend|spent)/i, // Spending analysis
    /\bhow\s+much.*(?:spend|spent)/i, // Spending questions
    /\bwhere.*(?:money|spending)/i, // Transaction queries
    /\bshow.*(?:transactions|spending)/i, // Transaction display
    /\bafford.*\$\d+/i, // "afford $1000" patterns
    /\bafford.*\d+[k]/i, // "afford 5k" patterns
    /\bwhat.*(?:good|recommended|suggested).*(?:emergency|savings|amount)/i, // Advice queries like "what's a good emergency amount"
    /\bhow\s+much.*(?:should|can|could).*(?:save|have|keep)/i, // Advice on amounts
    /\b(?:good|ideal|recommended|suggested).*(?:emergency|savings|fund|amount)/i, // General advice patterns
  ];

  if (nonGoalPatterns.some((p) => p.test(message))) {
    console.log("✅ [GOAL] Non-goal financial query detected");
    return {
      intent: "ask_personalized",
      confidence: 0.9,
      reason: "financial_analysis",
    };
  }

  // Default: no strong signal, let LLM decide
  return null;
}

async function handlePrebuildContext(userId) {
  logInfo("🚀 [PREBUILD] Starting context pre-building for user:", userId);
  const startTime = Date.now();

  try {
    // Build base context pack first (highest priority)
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

    // Cache base context for 5 minutes
    if (basePack) {
      await setCachedUserData(
        NEED_CONFIG.summary_min.cacheType,
        userId,
        basePack,
        {
          ttl: 5 * 60 * 1000,
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

    // Build other context packs in background (after base is ready)
    logInfo("🔄 [PREBUILD] Starting background context building...");

    // Build investment context
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
          { ttl: 5 * 60 * 1000 }
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

    // Build goals context
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
          { ttl: 5 * 60 * 1000 }
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

    // Build cashflow context
    try {
      const cashflowContext = await buildContextPacks(
        userId,
        ["cashflow_monthly"],
        {}
      );
      const cashflowPack =
        cashflowContext?.packs?.[NEED_CONFIG.cashflow_monthly.packKey] || null;
      if (cashflowContext && cashflowContext.packs && cashflowPack) {
        await setCachedUserData(
          NEED_CONFIG.cashflow_monthly.cacheType,
          userId,
          cashflowPack,
          { ttl: 5 * 60 * 1000 }
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

    // Build spend context for last 30 days
    try {
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
            ttl: 5 * 60 * 1000,
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

  const { text, user } = { text: message, user: context };
  if (!text || typeof text !== "string") {
    console.log("❌ [FINNY] Missing or invalid text parameter");
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: 0.1,
      fallback: true,
    };
  }

  // Check cache first
  const cachedResult = getCachedClassification(text);
  if (cachedResult) {
    // Validate cached result structure before using it
    if (
      cachedResult.intent &&
      typeof cachedResult.intent === "string" &&
      cachedResult.needs_web !== undefined &&
      cachedResult.needs_user_data !== undefined
    ) {
      console.log(
        `⚡ [FINNY] Using cached classification result (${
          Date.now() - startTime
        }ms)`
      );
      return cachedResult;
    } else {
      console.log(
        "⚠️ [FINNY] Cached classification is malformed, invalidating cache"
      );
      // Clear the malformed cached entry
      const key = generateClassificationCacheKey(text);
      classificationCache.delete(key);
      console.log(
        "✅ [FINNY] Malformed cache entry cleared, proceeding with fresh classification"
      );
    }
  }

  // Check for goal intent (before LLM call for efficiency)
  const goalDetection = detectGoalIntent(text, context?.conversation_context);
  if (goalDetection) {
    console.log(`✅ [FINNY] Goal detection heuristic: ${goalDetection.reason}`);
    const result = {
      intent: goalDetection.intent,
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: goalDetection.confidence,
      heuristic: true,
      reason: goalDetection.reason,
    };
    setCachedClassification(text, result);
    return result;
  }

  // Positive heuristic for common financial concept questions (BEFORE off-topic detection)
  const heuristic = financialConceptHeuristic(text);
  if (heuristic) {
    // If both personal data and web recency patterns, set both flags
    const needsWebToo = detectWebSearchNeeded(text) === true;
    const merged = needsWebToo ? { ...heuristic, needs_web: true } : heuristic;

    console.log("✅ [FINNY] Heuristic classified (with combined flags check)");
    setCachedClassification(text, merged);
    setImmediate(() =>
      logConversation({
        user_message: message,
        finny_response: `Heuristic classification: ${merged.intent} (confidence: ${merged.confidence})`,
        timestamp: new Date().toISOString(),
        user_id: context?.user_id || "unknown",
        intent: "classify",
        entities: merged.entities,
        confidence: merged.confidence,
        response_time_ms: Date.now() - startTime,
        sources_used: [],
        cached: false,
        classification_result: merged,
      })
    );
    return merged;
  }

  // Enhanced heuristic for web search detection
  const webSearchHeuristic = detectWebSearchNeeded(text);
  if (webSearchHeuristic) {
    console.log("✅ [FINNY] Heuristic detected web search needed");
    const result = {
      intent: "ask_personalized",
      needs_web: true,
      needs_user_data: false,
      state: null,
      entities: [],
      confidence: 0.9,
      heuristic: true,
    };
    setCachedClassification(text, result);
    return result;
  }

  // Check for off-topic LAST (after financial heuristics) with confidence scoring
  const offTopicResult = detectOffTopic(text, context?.conversation_context);
  if (offTopicResult.isOffTopic) {
    // Hybrid approach: Only route to handleOffTopic if confidence >= 0.7
    if (offTopicResult.confidence >= 0.7) {
      console.log(
        `✅ [FINNY] Heuristic detected off-topic query (confidence: ${offTopicResult.confidence})`
      );
      const result = {
        intent: "off_topic",
        needs_web: false,
        needs_user_data: false,
        state: null,
        entities: [],
        confidence: offTopicResult.confidence,
        heuristic: true,
      };
      setCachedClassification(text, result);
      return result;
    } else {
      // Low confidence off-topic - let LLM decide (route to handleAsk)
      console.log(
        `⚠️ [FINNY] Low confidence off-topic (${offTopicResult.confidence}), routing to handleAsk for LLM decision`
      );
      // Continue to LLM classification
    }
  }

  try {
    // Create a timeout promise that rejects after 8 seconds (increased for stability)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Classification timeout after 8 seconds")),
        8000
      );
    });

    // Create the fetch promise
    const fetchPromise = fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0.1,
          max_tokens: 350, // Allow slightly longer responses for stability
          top_p: 0.9, // Add top_p for better stability
          messages: [
            {
              role: "system",
              content: [
                "You are Financify's intent router. Classify the user message into exactly one intent and set flags.",
                "",
                "Intents:",
                "- ask_personalized: user's finances (spending, accounts, goals, investments)",
                "- goal_conversation: saving/targets/feasibility conversations",
                "- off_topic: non-financial (weather, love, relationships, etc)",
                "",
                "Flag rules (can combine):",
                "- needs_user_data=true when the answer requires the user's actual data (spend, net worth, accounts, goals, personal recommendations)",
                "- needs_web=true when the answer requires current/2024-2025 info (limits, rates, brackets, market/news, card offers)",
                "",
                "CRITICAL: Investment advice queries should NEVER need web search:",
                "- 'Investment advice' → intent:ask_personalized, needs_web:false, needs_user_data:true",
                "- 'What should I invest in?' → intent:ask_personalized, needs_web:false, needs_user_data:true",
                "- 'Portfolio advice' → intent:ask_personalized, needs_web:false, needs_user_data:true",
                "- 'Investment recommendations' → intent:ask_personalized, needs_web:false, needs_user_data:true",
                "- 'Analyze my investment strategy' → intent:ask_personalized, needs_web:false, needs_user_data:true",
                "",
                "CRITICAL: Goal queries should NEVER need web search:",
                "- 'Show my goals/Current goals' → intent:goal_conversation, needs_web:false, needs_user_data:true",
                "",
                "CRITICAL: Affordability and advice queries are ask_personalized, NOT goal_conversation:",
                "- 'Can I afford X?' → ask_personalized (user wants to know if they can afford something now)",
                "- 'What's a good emergency amount for me?' → ask_personalized (user wants personalized advice)",
                "- 'Should I buy X?' → ask_personalized (user wants purchase advice)",
                "- 'Is it worth it to buy X?' → ask_personalized (user wants value assessment)",
                "",
                "goal_conversation is ONLY for creating NEW goals or setting savings targets:",
                "- 'I want to save $5000 for a house' → goal_conversation (user wants to CREATE a goal)",
                "- 'Let's set a goal to save for vacation' → goal_conversation (user wants to CREATE a goal)",
                "",
                "Examples:",
                '"What is the Roth IRA limit for 2025?" → {intent:"ask_personalized", needs_web:true, needs_user_data:false}',
                '"How much did I spend last month?" → {intent:"ask_personalized", needs_web:false, needs_user_data:true}',
                '"I want to save $5000 for a house" → {intent:"goal_conversation", needs_web:false, needs_user_data:true}',
                '"Which credit card should I get?" → {intent:"ask_personalized", needs_web:true, needs_user_data:true}',
                '"Rent vs buy in Phoenix at 7% for me" → {intent:"ask_personalized", needs_web:true, needs_user_data:true, state:"AZ"}',
                '"What\'s the weather?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
                '"Can I afford a $10000 watch?" → {intent:"ask_personalized", needs_web:false, needs_user_data:true}',
                '"What\'s a good emergency amount for me?" → {intent:"ask_personalized", needs_web:false, needs_user_data:true}',
                "",
                "Return ONLY JSON (no code fences, no commentary):",
                '{"intent":"ask_personalized|goal_conversation|off_topic","needs_web":true|false,"needs_user_data":true|false,"state":null|"AZ","entities":[],"confidence":0.0-1.0}',
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
          response_format: {
            type: "json_object",
          },
        }),
      }
    );

    // Race between fetch and timeout
    const r = await Promise.race([fetchPromise, timeoutPromise]);

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`OpenRouter error ${r.status}: ${errText}`);
    }
    const data = await r.json();
    console.log("🔍 [FINNY] Classification data inside handleClassify:", data);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [FINNY] No content in response");
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
    } catch (parseError) {
      console.log(
        "❌ [FINNY] JSON parse/validation error, using fallback classification"
      );
      console.log("❌ [FINNY] Error:", parseError.message);
      console.log("❌ [FINNY] Raw content was:", cleanContent);

      // Use goal detection fallback instead of trying to parse malformed JSON
      const goalDetection = detectGoalIntent(message, conversationContext);
      if (goalDetection && goalDetection.intent === "goal_conversation") {
        console.log("✅ [FINNY] Using goal detection fallback");
        out = {
          intent: "goal_conversation",
          needs_web: false,
          needs_user_data: true,
          state: null,
          entities: [],
          confidence: goalDetection.confidence,
          fallback: true,
          detection_reason: goalDetection.reason,
        };
      } else {
        // Default fallback
        out = {
          intent: "ask_personalized",
          needs_web: false,
          needs_user_data: true,
          state: null,
          entities: [],
          confidence: 0.8,
          fallback: true,
        };
      }
    }
    console.log("🔍 [FINNY] Validated classification result:", out);

    // Defensive post-process so your app never crashes
    if (!out.state || typeof out.state !== "string") out.state = null;
    if (!Array.isArray(out.entities)) out.entities = [];

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

    // Cache the result for future use
    setCachedClassification(text, out);

    // Log conversation asynchronously to reduce latency
    setImmediate(() => logConversation(conversationData));

    return out;
  } catch (e) {
    console.error("❌ [FINNY] Classification error:", e?.message);

    // Handle timeout specifically
    if (e?.message?.includes("timeout")) {
      console.log(
        "⏰ [FINNY] Classification timed out after 4 seconds, using fallback"
      );
    }

    // Enhanced heuristic fallbacks in priority order

    // 1. Off-topic detection (highest priority)
    const offTopicCheck = detectOffTopic(message);
    if (offTopicCheck.isOffTopic && offTopicCheck.confidence >= 0.7) {
      console.log("✅ [FINNY] Using off-topic heuristic fallback");
      return {
        intent: "off_topic",
        needs_web: false,
        needs_user_data: false,
        state: null,
        entities: [],
        confidence: 0.9,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
      };
    }

    // 2. Web search detection
    const webSearchHeuristic = detectWebSearchNeeded(message);
    if (webSearchHeuristic) {
      console.log("✅ [FINNY] Using web search heuristic fallback");
      return {
        intent: "ask_personalized",
        needs_web: true,
        needs_user_data: false,
        state: null,
        entities: [],
        confidence: 0.8,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
      };
    }

    // 3. Goal conversation detection (using tightened detection with context)
    const goalDetection = detectGoalIntent(
      message,
      context?.conversation_context
    );
    if (goalDetection && goalDetection.intent === "goal_conversation") {
      console.log(
        `✅ [FINNY] Using goal conversation heuristic fallback (reason: ${goalDetection.reason})`
      );
      return {
        intent: "goal_conversation",
        needs_web: false,
        needs_user_data: true,
        state: null,
        entities: [],
        confidence: goalDetection.confidence,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
        detection_reason: goalDetection.reason,
      };
    }

    // Heuristic fallback if available
    const heuristic = financialConceptHeuristic(message);
    if (heuristic) {
      console.log(
        "✅ [FINNY] Using heuristic fallback after classification error"
      );
      return {
        ...heuristic,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
      };
    }

    // Default fallback for any classification error
    console.log("🔄 [FINNY] Using default ask_personalized fallback");
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      state: null,
      entities: [],
      confidence: 0.1,
      fallback: true,
      timeout_fallback: e?.message?.includes("timeout") || false,
    };
  }
}

async function handleOffTopic(message, context, conversationContext = null) {
  console.log("🚫 [FINNY] Handling off-topic query:", message);
  const startTime = Date.now();

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
      message,
      context,
      "ask_personalized",
      null,
      conversationContext
    );
  }

  const category = context?.category || "general";
  const userProfile = context?.profile || {};

  // Fetch net worth data for context
  let netWorthData = null;
  if (context?.user_id) {
    try {
      netWorthData = await getNetWorthData(context.user_id);
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

  // Generate context-aware financial redirection suggestions
  const redirectionSuggestions = generateFinancialRedirectionSuggestions(
    category,
    userProfile
  );

  const systemPrompt = [
    "You are Finny, a warm, personable, and emotionally intelligent financial coach who genuinely cares about people.",
    "",
    "CORE PRINCIPLE: When users share personal information (introductions, life details, interests), respond like a REAL HUMAN would - with genuine interest, warmth, and engagement. Build authentic rapport FIRST, then naturally weave in financial topics.",
    "",
    "CRITICAL BEHAVIOR RULES:",
    "1. ALWAYS greet users back when they introduce themselves (e.g., 'Hi Kartik!' or 'Nice to meet you, Kartik!')",
    "2. Show GENUINE interest in what they share - their name, age, studies, career, location, interests, etc.",
    "3. Respond with enthusiasm and emotional intelligence - acknowledge their excitement, validate their interests, show you're listening",
    "4. NEVER immediately jump to financial questions - that feels robotic and dismissive",
    "5. Make the conversation feel natural and human - like talking to a friend who happens to be a financial expert",
    "6. Connect their personal information to financial topics NATURALLY (e.g., 'Since you're studying CS and finance, you're probably thinking about...')",
    "7. Use their name naturally throughout the conversation",
    "8. Keep responses warm, engaging, and conversational (3-5 sentences is fine for introductions)",
    "9. You can use emojis sparingly to add warmth (😊, 👋, 💪, etc.)",
    "",
    "RESPONSE STRUCTURE FOR INTRODUCTIONS/PERSONAL SHARING:",
    "- Start with a warm greeting using their name",
    "- Acknowledge and show interest in what they shared (age, studies, interests, etc.)",
    "- Make a genuine, specific comment about their situation",
    "- Naturally transition to financial topics by connecting it to their life",
    "- End with an open, inviting question",
    "",
    "EXAMPLE RESPONSES:",
    "",
    "User: 'My name is Kartik Bihani, I'm 20 years old. Senior at university of Arizona studying computer science and finance. I love understanding wealth and all and money'",
    "Good response: 'Hi Kartik! 👋 Nice to meet you! That's awesome that you're a senior studying CS and finance at Arizona - what a powerful combination! I love that you're already passionate about understanding wealth and money. That curiosity is going to serve you really well, especially as you're about to graduate and start your career. What financial questions have you been thinking about lately? Are you curious about investing, building wealth, or something else?'",
    "",
    "User: 'I'm 25, work as a software engineer in San Francisco'",
    "Good response: 'Hey there! 👋 That's great - software engineering in SF is such an exciting field, and I bet you're learning a ton. Being 25 and already established in your career puts you in a really strong position to build wealth. What's your biggest financial question right now? Are you thinking about investing, saving for a big goal, or something else?'",
    "",
    "User: 'I love traveling and want to see the world'",
    "Good response: 'That's wonderful! Traveling is such an enriching experience. I'm guessing you're thinking about how to make that happen financially - whether it's budgeting for trips, saving up, or maybe even finding ways to travel while building wealth. What's your travel dream, and what financial questions do you have around making it happen?'",
    "",
    "FOR NON-PERSONAL OFF-TOPIC (weather, random questions):",
    "- Acknowledge briefly with warmth",
    "- Gently redirect: 'I'm focused on helping with your finances! What money question can I help with?'",
    "",
    "EMOTIONAL INTELLIGENCE GUIDELINES:",
    "- Match their energy level (if they're excited, be enthusiastic; if they're serious, be thoughtful)",
    "- Validate their interests and experiences",
    "- Show empathy and understanding",
    "- Make them feel heard and valued as a person, not just a financial case",
    "- Remember: People trust financial advisors who care about them as humans first",
    "",
    // USER PROFILE (from onboarding)
    ...(context.profile?.name ? [`User's name: ${context.profile.name}`] : []),
    ...(context.profile?.age ? [`User's age: ${context.profile.age}`] : []),
    ...(context.profile?.occupation
      ? [`User's occupation: ${context.profile.occupation}`]
      : []),
    ...(context.profile?.intent_context
      ? [
          "",
          "USER'S FINANCIAL PERSPECTIVE (from onboarding - use as reference, may not be current):",
          context.profile.intent_context,
        ]
      : []),
    ...(context.profile?.finny_style
      ? [
          "",
          `COMMUNICATION STYLE PREFERENCE: User prefers ${context.profile.finny_style} communication style. Adjust your tone accordingly:`,
          context.profile.finny_style === "direct"
            ? "- Be more direct and to-the-point, focus on facts and numbers"
            : context.profile.finny_style === "witty"
            ? "- Add more humor and light-heartedness while staying professional"
            : "- Use conversational, friendly tone (default)",
        ]
      : []),
    "",
    // Memory context from Supermemory (already ranked by semantic search)
    ...(() => {
      if (!context.memory?.memories?.length) return [];

      // Group memories by context_type from metadata
      const memoriesByType = {};
      context.memory.memories.forEach((m) => {
        const type = m.context_type || "general";
        if (!memoriesByType[type]) {
          memoriesByType[type] = [];
        }
        memoriesByType[type].push(m);
      });

      // Build prompt sections using content from Supermemory documents
      // Note: v4/search returns 'memory' field (mapped to 'content'), not 'summary'
      // Summaries are only available in list endpoint, not search endpoint
      const memorySections = [];
      Object.entries(memoriesByType).forEach(([type, mems]) => {
        // Use content (which contains the memory text from v4/search)
        // Limit each memory to 200 chars to avoid prompt bloat
        const memoryTexts = mems
          .map((m) => {
            const text = m.content || m.summary || "";
            return text.length > 200 ? text.substring(0, 200) + "..." : text;
          })
          .filter(Boolean)
          .join("; ");
        if (memoryTexts) {
          // Format context type names for readability
          const typeLabel =
            type === "goal"
              ? "Goals"
              : type === "constraint"
              ? "Constraints"
              : type === "preference"
              ? "Preferences"
              : type === "life_event"
              ? "Life Events"
              : type === "decision"
              ? "Decisions"
              : type.charAt(0).toUpperCase() + type.slice(1);
          memorySections.push(`${typeLabel}: ${memoryTexts}`);
        }
      });

      return memorySections.length > 0
        ? ["USER MEMORIES:", ...memorySections]
        : [];
    })(),
    // Net worth context
    ...(netWorthData
      ? [
          "",
          "FINANCIAL SITUATION:",
          `Current net worth: ${netWorthData.formatted.net_worth}`,
          `Money you have (cash): ${netWorthData.formatted.liquid_assets}`,
          `Investments: ${netWorthData.formatted.investments_total}`,
          `Money you owe (debt): ${netWorthData.formatted.total_liabilities}`,
          "",
          "Use this financial context to provide more relevant and personalized financial advice when redirecting the user to financial topics.",
        ]
      : []),
  ].join("\n");

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
          model: SMALLER_MODEL,
          temperature: 0.8,
          max_tokens: 400,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `${message}${
                userProfile.name
                  ? `\n\n(Note: The user's name is ${userProfile.name})`
                  : ""
              }${
                netWorthData
                  ? `\n\n(Financial context: Net worth ${netWorthData.formatted.net_worth}, ${netWorthData.formatted.liquid_assets} cash, ${netWorthData.formatted.investments_total} invested, ${netWorthData.formatted.total_liabilities} debt)`
                  : ""
              }${
                conversationContext?.active_topic
                  ? `\n\n(Conversation context: Active topic - ${
                      conversationContext.active_topic
                    }${
                      conversationContext.last_entity &&
                      Object.keys(conversationContext.last_entity).length > 0
                        ? `, Last entity: ${JSON.stringify(
                            conversationContext.last_entity
                          )}`
                        : ""
                    }${
                      conversationContext.pending_action
                        ? `, Pending action: ${conversationContext.pending_action}`
                        : ""
                    })`
                  : ""
              }${
                redirectionSuggestions.length > 0
                  ? `\n\n(Optional financial topics to naturally weave in: ${redirectionSuggestions.join(
                      ", "
                    )})`
                  : ""
              }`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ||
      "I'd love to help you with your finances! What financial questions can I answer for you today?";

    // Store conversation memory in Supermemory (async, non-blocking)
    const userId = context?.user_id;
    if (userId && content) {
      setImmediate(async () => {
        try {
          await storeConversationMemory(userId, message, content, {
            intent: "off_topic",
            chat_id: context?.chat_id,
            category: category,
            redirection_suggestions: redirectionSuggestions,
            userName: context?.profile?.name || null,
          });
        } catch (error) {
          console.error(
            "❌ [FINNY] Failed to store off-topic conversation memory:",
            error
          );
          // Non-fatal, don't break conversation flow
        }
      });
    }

    // Log the off-topic interaction
    const conversationData = {
      user_message: message,
      finny_response: content,
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "off_topic",
      entities: [],
      confidence: 1.0,
      response_time_ms: Date.now() - startTime,
      sources_used: [],
      cached: false,
      category: category,
      redirection_suggestions: redirectionSuggestions,
    };

    // Log conversation asynchronously
    setImmediate(() => logConversation(conversationData));

    return {
      text: cleanResponseFormatting(content),
      type: "assistant",
      intent: "off_topic",
      category: category,
      redirection_suggestions: redirectionSuggestions,
    };
  } catch (error) {
    console.error("❌ [FINNY] Off-topic handler error:", error);

    // Fallback response
    const fallbackResponse = generateFallbackRedirection(category, userProfile);

    // Store conversation memory in Supermemory for fallback response (async, non-blocking)
    const userId = context?.user_id;
    if (userId && fallbackResponse) {
      setImmediate(async () => {
        try {
          await storeConversationMemory(userId, message, fallbackResponse, {
            intent: "off_topic",
            chat_id: context?.chat_id,
            category: category,
            fallback: true,
            userName: context?.profile?.name || null,
          });
        } catch (error) {
          console.error(
            "❌ [FINNY] Failed to store off-topic fallback conversation memory:",
            error
          );
          // Non-fatal, don't break conversation flow
        }
      });
    }

    return {
      text: cleanResponseFormatting(fallbackResponse),
      type: "assistant",
      intent: "off_topic",
      category: category,
      fallback: true,
    };
  }
}

function generateFinancialRedirectionSuggestions(category, userProfile) {
  const suggestions = {
    weather: [
      "budgeting for seasonal expenses",
      "planning for weather-related financial impacts",
      "emergency fund for weather emergencies",
    ],
    greeting: [
      "your financial goals",
      "budgeting strategies",
      "investment planning",
    ],
    lifestyle: [
      "budgeting for hobbies",
      "financial planning for lifestyle goals",
      "saving strategies for entertainment",
    ],
    technical: [
      "financial app features",
      "budgeting tools",
      "investment tracking",
    ],
    philosophical: [
      "financial independence goals",
      "long-term financial planning",
      "building wealth over time",
    ],
    general: [
      "your financial situation",
      "budgeting and saving",
      "investment opportunities",
    ],
  };

  return suggestions[category] || suggestions.general;
}

function generateFallbackRedirection(category, userProfile) {
  const name = userProfile.name || "there";
  const suggestions = generateFinancialRedirectionSuggestions(
    category,
    userProfile
  );

  return `Hi ${name}! I can't help with that, but I'd love to help you with your finances! How about we discuss ${suggestions[0]} or ${suggestions[1]}? What financial questions do you have?`;
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
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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
        const p = braveSearch(query);
        const timed = withTimeout(p, RATE_LIMITS.timeout, null);
        const res = await timed;
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
  const m = message.toLowerCase();

  // FIRST: Check for personal portfolio queries that should NOT go to stock analysis
  const personalPortfolioPatterns = [
    /\b(what holdings do i own|my holdings|my portfolio|my investments|my stocks|my shares|what do i own|show my portfolio|show my holdings|my investment portfolio|my stock portfolio)\b/i,
    /\b(holdings|portfolio|investments)\b.*\b(do i have|do i own|my|mine|show me|what are)\b/i,
    /\b(investment advice|investment help|portfolio advice|portfolio help)\b/i,
  ];

  // If it's a personal portfolio query, don't route to stock analysis
  if (personalPortfolioPatterns.some((pattern) => pattern.test(message))) {
    console.log(
      "🎯 [STOCK_ROUTING] Personal portfolio query detected, NOT routing to stock analysis"
    );
    return false;
  }

  // Check for general financial advice that should NOT go to stock analysis
  const generalFinancialPatterns = [
    /\b(emergency fund|emergency savings|savings|budget|budgeting|expenses|spending|debt|loan|mortgage|retirement|401k|ira)\b/i,
    /\b(how much should i|what should i|financial planning|money management)\b/i,
    /\b(save|saving|spend|spending|invest|investing)\b.*\b(money|dollars|amount)\b/i,
  ];

  // If it's general financial advice, don't route to stock analysis
  if (generalFinancialPatterns.some((pattern) => pattern.test(message))) {
    console.log(
      "🎯 [STOCK_ROUTING] General financial advice query detected, NOT routing to stock analysis"
    );
    return false;
  }

  // Check for explicit stock analysis keywords (more specific)
  const stockAnalysisKeywords =
    /\b(stock|stocks|ticker|share|shares|price|quote|buy|sell|valuation|pt|price target|market cap|pe ratio|earnings|dividend|analyst|recommendation|trading|trader)\b/;

  // Check for company names or ticker symbols (but be more strict)
  const hasTickerSymbol =
    /\b[A-Z]{1,5}\b/.test(message) &&
    /\b(stock|share|ticker|quote|price|analysis)\b/i.test(message);

  // Check for natural language patterns that indicate stock analysis interest
  const naturalLanguagePatterns = [
    /\b(tell me about|show me|get me|what about|how is|how are)\b.*\b(stock|company|corp|inc|ltd|llc)\b/i,
    /\b(about|regarding|concerning)\b.*\b[A-Z]{1,5}\b/i,
    /\b(should i buy|is.*good|worth.*investing|add.*portfolio)\b/i,
    /\b(apple|microsoft|google|amazon|tesla|meta|nvidia|netflix|uber|airbnb|spotify|twitter|snapchat|zoom|palantir|snowflake|shopify|square|paypal|coinbase|robinhood|doordash|peloton)\b/i,
  ];

  const hasNaturalLanguage = naturalLanguagePatterns.some((pattern) =>
    pattern.test(message)
  );

  return stockAnalysisKeywords.test(m) || hasTickerSymbol || hasNaturalLanguage;
}

function looksLikeStockDeepQuery(message) {
  const m = message.toLowerCase();

  // Original deep analysis triggers (specific financial metrics)
  const deepAnalysisTriggers =
    m.includes("more") ||
    m.includes("market cap") ||
    m.includes("cap") ||
    m.includes("earnings") ||
    m.includes("guidance") ||
    m.includes("dividend") ||
    m.includes("pe") ||
    m.includes("p/e") ||
    m.includes("ps") ||
    m.includes("filings") ||
    m.includes("insider") ||
    m.includes("target") ||
    m.includes("52w") ||
    m.includes("52-week");

  // Natural language stock queries that should use LLM-based approach
  const naturalLanguageStockQueries = [
    /\b(tell me about|show me|get me|what about|how is|how are)\b.*\b(stock|company|corp|inc|ltd|llc)\b/i,
    /\b(about|regarding|concerning)\b.*\b[A-Z]{1,5}\b/i,
    /\b(should i buy|is.*good|worth.*investing|add.*portfolio)\b/i,
    /\b(apple|microsoft|google|amazon|tesla|meta|nvidia|netflix|uber|airbnb|spotify|twitter|snapchat|zoom|palantir|snowflake|shopify|square|paypal|coinbase|robinhood|doordash|peloton)\b/i,
    /\b(analysis|analyze|research|researching)\b.*\b(stock|company|investment)\b/i,
    /\b(performance|price|valuation|value|worth)\b.*\b(stock|company|investment)\b/i,
  ];

  const hasNaturalLanguage = naturalLanguageStockQueries.some((pattern) =>
    pattern.test(message)
  );

  return deepAnalysisTriggers || hasNaturalLanguage;
}

async function planStockRequest(message) {
  try {
    console.log("🔍 [STOCK_PLANNER] Using model:", OPENROUTER_MODEL);
    console.log(
      "🔍 [STOCK_PLANNER] API key present:",
      !!process.env.OPENROUTER_GROK_KEY
    );

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL || "meta-llama/llama-3.3-8b-instruct:free",
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
                ticker_candidates: { type: "array", items: { type: "string" } },
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
    });

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

async function executeStockPlan(plan, message) {
  console.log("🔍 [EXECUTE_STOCK] Plan:", plan);
  const wants = plan?.wants || [];
  const preferredTicker = plan?.ticker_candidates?.[0] || null;
  console.log("🔍 [EXECUTE_STOCK] Preferred ticker:", preferredTicker);

  const { ticker } = preferredTicker
    ? { ticker: preferredTicker }
    : await resolveTickerForQuery(message);

  console.log("🔍 [EXECUTE_STOCK] Final ticker:", ticker);
  if (!ticker) return { error: "Could not resolve ticker" };

  // Base snapshot always
  const base = await fetchStockSnapshot(ticker);
  if (base?.error) return base;

  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  const extra = {};

  // Earnings
  if (wants.includes("earnings")) {
    extra.earnings = await fetchJson(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${ticker}&token=${apiKey}`
    );
  }
  // Filings
  if (wants.includes("filings")) {
    extra.filings = await fetchJson(
      `https://finnhub.io/api/v1/filings?symbol=${ticker}&token=${apiKey}`
    );
  }
  // Insider
  if (wants.includes("insider")) {
    extra.insider = await fetchJson(
      `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${ticker}&token=${apiKey}`
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
  // Use deterministic summary only; no additional prompting
  return buildStockDataSummary(stockData, stockPlan);
}

// Fallback function for when stock APIs fail
async function generateFallbackStockAnalysis(
  ticker,
  userMessage,
  userProfile,
  userMemory
) {
  console.log(`🔄 [FALLBACK] Generating fallback analysis for ${ticker}`);

  // Extract ticker from message if not provided
  const extractedTicker = ticker || extractTickerFromMessage(userMessage);
  if (!extractedTicker) {
    return "I'd be happy to help with stock analysis, but I need a specific ticker symbol. Could you provide the stock symbol you'd like me to analyze?";
  }

  // Use web search as fallback for current data
  try {
    const searchQuery = `${extractedTicker} stock analysis market cap financials`;
    const webResults = await limitedBraveSearch(searchQuery);

    if (webResults && webResults.length > 0) {
      const analysis = await generateStockAnalysisFromWebData(
        extractedTicker,
        webResults,
        userMessage
      );
      return analysis;
    }
  } catch (error) {
    console.error("❌ [FALLBACK] Web search failed:", error);
  }

  // Final fallback using training data
  return generateTrainingDataStockAnalysis(extractedTicker, userMessage);
}

function extractTickerFromMessage(message) {
  // Look for common ticker patterns
  const tickerMatch = message.match(/\b[A-Z]{1,5}\b/g);
  if (tickerMatch) {
    return tickerMatch.find((t) => t !== "USD" && t !== "ETF" && t !== "API");
  }
  return null;
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
          model: OPENROUTER_MODEL,
          temperature: 0.3,
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
      return (
        data.choices?.[0]?.message?.content ||
        generateTrainingDataStockAnalysis(ticker, userMessage)
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
      console.log(
        `🕒 [CACHE] Cache expired for ${cacheKey}, age: ${age}s, ttl: ${ttl}s`
      );
      return null;
    }

    console.log(`✅ [CACHE] Cache hit for ${cacheKey}, age: ${age}s`);
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
    console.log(`🔄 [CACHE] Force refreshing user data for: ${userId}`);

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
          console.log(`ℹ️ [CACHE] Failed to clear ${prefix}:`, error.message);
        }
      }
    } catch (e) {
      console.log("ℹ️ [CACHE] Postgres cache purge skipped:", e?.message);
    }

    // Use our new smart cache invalidation
    try {
      const invalidatedCount = await invalidateUserCache(userId);
      console.log(
        `🗑️ [CACHE] Invalidated ${invalidatedCount} cache entries for user ${userId}`
      );
    } catch (e) {
      console.log("ℹ️ [CACHE] Smart cache invalidation skipped:", e?.message);
    }

    console.log(`✅ [CACHE] Force refresh completed for user: ${userId}`);
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

// Memory management functions moved to api/memory.js

// KEY_SYNONYMS moved to src/constants/keySynonyms.ts

// Named exports for testing
export {
  // quickExtract removed - migrating to Supermemory
  // shouldRunMemoryExtraction removed - migrating to Supermemory
  // validateMemoriesWithSmallModel removed - migrating to Supermemory
  // selectRelevantMemories removed - Supermemory handles relevance ranking
  loadUserMemory,
  // saveMemoryCandidates removed - migrating to Supermemory
  generateFallbackStockAnalysis,
  extractTickerFromMessage,
  generateTrainingDataStockAnalysis,
  // generateMemorySummary removed - migrating to Supermemory
  getNetWorthData,
  formatNetWorthCurrency,
};
