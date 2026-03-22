// lib/memoryUtils.js
// Utility functions for memory management and Supermemory integration
// Separated from api/memory.js to avoid mixing API route handlers with utility functions

import { supabase } from "./api/supabase.js";

// === MEMORY MANAGEMENT FUNCTIONS ===

// In-memory cache for user memories
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// In-memory cache for user profiles (onboarding data - rarely changes)
const profileCache = new Map();
const PROFILE_CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days (onboarding data rarely changes, only finny_style/occupation can change)

// In-memory cache for feedback patterns (feedback rarely changes, cache for 10 minutes)
const feedbackPatternsCache = new Map();
const FEEDBACK_PATTERNS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (feedback patterns don't change frequently)

// Lightweight session state (goal_flow, etc.) with TTL
const sessionStateCache = new Map(); // key: userId, value: { state, timestamp }
const SESSION_STATE_TTL = 15 * 60 * 1000; // 15 minutes

// Short-term conversation turns (for continuity across multi-turn clarify flows)
// key: `${userId}:${chatId}` -> { turns: [{role, content, ts}], timestamp }
const conversationTurnsCache = new Map();
const CONVERSATION_TURNS_TTL = 30 * 60 * 1000; // 30 minutes

// Periodic cleanup of expired session state entries to prevent memory leaks
// Runs every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [userId, entry] of sessionStateCache.entries()) {
      if (now - entry.timestamp > SESSION_STATE_TTL) {
        sessionStateCache.delete(userId);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      console.log(
        `🧹 [SESSION_STATE] Cleaned up ${cleanedCount} expired session state entries`
      );
    }
  }, 5 * 60 * 1000); // Run every 5 minutes
}

function getSessionState(userId) {
  if (!userId) return {};
  const entry = sessionStateCache.get(userId);
  if (!entry) return {};
  if (Date.now() - entry.timestamp > SESSION_STATE_TTL) {
    sessionStateCache.delete(userId);
    return {};
  }
  return entry.state || {};
}

function setSessionState(userId, state) {
  if (!userId) return;
  sessionStateCache.set(userId, { state: state || {}, timestamp: Date.now() });
}

function mergeSessionState(userId, partial) {
  if (!userId) return;
  // Atomic update to prevent race conditions
  const entry = sessionStateCache.get(userId);
  const current =
    entry && Date.now() - entry.timestamp <= SESSION_STATE_TTL
      ? entry.state || {}
      : {};
  sessionStateCache.set(userId, {
    state: { ...current, ...(partial || {}) },
    timestamp: Date.now(),
  });
}

function getConversationTurnsKey(userId, chatId) {
  if (!userId || !chatId) return null;
  return `${userId}:${chatId}`;
}

function trimTurnContent(role, content) {
  const text = typeof content === "string" ? content : String(content || "");

  // Keep assistant messages bounded (they can be very long).
  // Keep the end of the assistant message because clarifying questions often appear there.
  if (role === "assistant") {
    const max = 1500;
    if (text.length <= max) return text;
    return `…${text.slice(-max)}`;
  }

  // User messages are usually short; still cap to avoid pathological inputs.
  const max = 800;
  if (text.length <= max) return text;
  return `…${text.slice(-max)}`;
}

function appendConversationTurns(userId, chatId, userText, assistantText) {
  const key = getConversationTurnsKey(userId, chatId);
  if (!key) {
    console.log("⚠️ [APPEND_TURNS] Cannot append - missing key:", {
      userId: !!userId,
      chatId: !!chatId,
      userIdValue: userId,
      chatIdValue: chatId,
    });
    return;
  }

  // CRITICAL: Don't store classification results as conversation turns
  // Classification results start with "Classification:" - skip those
  if (assistantText && assistantText.trim().startsWith("Classification:")) {
    console.log("⚠️ [APPEND_TURNS] Skipping classification result - not a conversation turn");
    return;
  }

  const now = Date.now();
  const entry = conversationTurnsCache.get(key);
  const turns = Array.isArray(entry?.turns) ? entry.turns : [];

  // Only store valid user messages (not empty, not classification-related)
  if (userText && userText.trim() && !userText.trim().startsWith("Classification:")) {
    turns.push({
      role: "user",
      content: trimTurnContent("user", userText),
      ts: now,
    });
  }

  // Only store valid assistant responses (not empty, not classification results)
  if (assistantText && assistantText.trim() && !assistantText.trim().startsWith("Classification:")) {
    turns.push({
      role: "assistant",
      content: trimTurnContent("assistant", assistantText),
      ts: now,
    });
  }

  // Keep a reasonable upper bound to avoid memory growth.
  conversationTurnsCache.set(key, {
    turns: turns.slice(-40),
    timestamp: now,
  });
  
  console.log(`✅ [APPEND_TURNS] Stored ${turns.length} total turns for key: ${key}`);
}

async function getRecentConversationTurns(
  userId,
  chatId,
  { maxMessages = 8, maxChars = 6000 } = {}
) {
  const key = getConversationTurnsKey(userId, chatId);
  if (!key) {
    console.log("⚠️ [GET_TURNS] Cannot get turns - missing key:", {
      userId: !!userId,
      chatId: !!chatId,
      userIdValue: userId,
      chatIdValue: chatId,
    });
    return [];
  }

  // First, try in-memory cache (fast, works within same instance)
  const entry = conversationTurnsCache.get(key);
  if (entry) {
    const age = Date.now() - entry.timestamp;
    if (age <= CONVERSATION_TURNS_TTL) {
      const rawTurns = Array.isArray(entry.turns) ? entry.turns : [];
      if (rawTurns.length > 0) {
        const limited = rawTurns.slice(-Math.max(0, maxMessages));
        let total = 0;
        const kept = [];
        for (let i = limited.length - 1; i >= 0; i--) {
          const t = limited[i];
          const c =
            typeof t?.content === "string" ? t.content : String(t?.content || "");
          const cost = c.length;
          if (kept.length >= maxMessages) break;
          if (total + cost > maxChars && kept.length > 0) break;
          kept.push({ role: t.role, content: c });
          total += cost;
        }
        console.log(`✅ [GET_TURNS] Returning ${kept.length} turns from cache (from ${rawTurns.length} total) for key: ${key}`);
        return kept.reverse();
      }
    }
  }

  // Fallback to database (for serverless/cross-instance persistence)
  try {
    // Query conversation_logs table - get most recent conversations
    // CRITICAL: Exclude classification logs (intent = "classify") - we only want actual conversation turns
    // Note: conversation_logs doesn't have chat_id, so we get all recent messages for the user
    // This works because we order by timestamp and limit to recent messages
    const { data: logs, error } = await supabase
      .from("conversation_logs")
      .select("user_message, finny_response, timestamp, intent")
      .eq("user_id", userId)
      .eq("chat_id", chatId)
      .neq("intent", "classify") // Exclude classification logs - only get actual conversations
      .order("timestamp", { ascending: false }) // Newest first
      .limit(maxMessages * 2); // Get more than needed to account for filtering

    if (error) {
      const msg = (error?.message || "").toLowerCase();
      // Phase I safety: if DB isn't ready for chat-scoped queries, avoid cross-chat leakage.
      if (msg.includes("chat_id")) {
        console.log(
          "⚠️ [GET_TURNS] Skipping DB fallback because conversation_logs.chat_id is missing or inaccessible"
        );
        return [];
      }
      console.log(`⚠️ [GET_TURNS] Database query error: ${error.message}`);
      return [];
    }

    if (!logs || logs.length === 0) {
      console.log(`⚠️ [GET_TURNS] No conversation logs found in database for user: ${userId}`);
      return [];
    }

    // Convert database logs to conversation turns format
    // Query returns logs ordered DESC (newest first), so reverse to get chronological order
    // Filter out classification results and ensure we only get actual conversation turns
    const turns = [];
    for (const log of logs.reverse()) {
      // Skip classification logs (should be filtered by query, but double-check)
      if (log.intent === "classify") {
        continue;
      }
      
      // Skip if finny_response looks like a classification result (safety check)
      if (log.finny_response && log.finny_response.trim().startsWith("Classification:")) {
        continue;
      }
      
      // Schema: user_message and finny_response are both NOT NULL, but check for empty strings
      // Only add if both user message and response are valid conversation content
      if (log.user_message && log.user_message.trim() && 
          log.finny_response && log.finny_response.trim() &&
          !log.finny_response.trim().startsWith("Classification:")) {
        // Add user message
        turns.push({
          role: "user",
          content: trimTurnContent("user", log.user_message),
        });
        // Add assistant response (full message - split messages are handled on frontend)
        turns.push({
          role: "assistant",
          content: trimTurnContent("assistant", log.finny_response),
        });
      }
    }

    // Now turns are in chronological order (oldest to newest)
    // We want the most recent messages, so take from the end
    // Enforce char budget by taking from the end (most recent) first
    let total = 0;
    const kept = [];
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      const cost = (t.content || "").length;
      if (kept.length >= maxMessages) break;
      if (total + cost > maxChars && kept.length > 0) break;
      kept.unshift(t); // Add to beginning to maintain chronological order
      total += cost;
    }

    // Update in-memory cache for future requests
    if (kept.length > 0) {
      conversationTurnsCache.set(key, {
        turns: kept,
        timestamp: Date.now(),
      });
    }

    console.log(`✅ [GET_TURNS] Returning ${kept.length} turns from database (from ${logs.length} logs) for key: ${key}`);
    return kept; // Already in chronological order (oldest to newest)
  } catch (error) {
    console.log(`⚠️ [GET_TURNS] Error fetching from database: ${error.message}`);
    return [];
  }
}

// Cleanup expired conversation turns to avoid memory leaks
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of conversationTurnsCache.entries()) {
      if (!entry?.timestamp || now - entry.timestamp > CONVERSATION_TURNS_TTL) {
        conversationTurnsCache.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

// NOTE: Conversation context storage has been removed.
// Continuity should be handled by higher-level systems.

// Cache entry structure: { data, timestamp }
function getCachedMemory(userId) {
  const cached = memoryCache.get(userId);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > MEMORY_CACHE_TTL) {
    memoryCache.delete(userId);
    return null;
  }

  return cached.data;
}

function setCachedMemory(userId, data) {
  memoryCache.set(userId, {
    data,
    timestamp: Date.now(),
  });
}

function invalidateMemoryCache(userId) {
  memoryCache.delete(userId);
}

// Profile cache functions
function getCachedProfile(userId) {
  const cached = profileCache.get(userId);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > PROFILE_CACHE_TTL) {
    profileCache.delete(userId);
    return null;
  }

  return cached.data;
}

// Get cached feedback patterns
function getCachedFeedbackPatterns(userId) {
  const cached = feedbackPatternsCache.get(userId);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > FEEDBACK_PATTERNS_CACHE_TTL) {
    feedbackPatternsCache.delete(userId);
    return null;
  }

  return cached.data;
}

// Set cached feedback patterns
function setCachedFeedbackPatterns(userId, data) {
  feedbackPatternsCache.set(userId, {
    data,
    timestamp: Date.now(),
  });
  console.log(
    `💾 [FEEDBACK_CACHE] Cached feedback patterns for user: ${userId}`
  );
}

function setCachedProfile(userId, data) {
  profileCache.set(userId, {
    data,
    timestamp: Date.now(),
  });
}

function invalidateProfileCache(userId) {
  profileCache.delete(userId);
  console.log(
    `🧹 [PROFILE_CACHE] Invalidated profile cache for user: ${userId}`
  );
}

// Note: selectRelevantMemories() and categorizeSelectedMemories() removed
// Supermemory's semantic search handles relevance ranking automatically

async function loadUserMemory(userId, query = null) {
  if (!userId) return { memories: [], totalCount: 0 };

  // Note: Caching disabled for semantic search since results are query-dependent
  // Each query returns different relevant memories, so caching would be incorrect

  try {
    console.log(
      "🧠 [MEMORY] Loading memories from Supermemory for user:",
      userId
    );

    // If no query provided, return empty (semantic search requires a query)
    // Using "*" would return random memories, which is not useful
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      console.log("🧠 [MEMORY] No query provided, returning empty memories");
      return { memories: [], totalCount: 0 };
    }

    // Search Supermemory for relevant memories
    const supermemoryResults = await searchSupermemoryMemories(
      userId,
      query.trim(),
      {
        limit: 10, // Reduced from 15 to avoid prompt bloat
        threshold: 0.4, // Increased from 0.3 for better relevance
      }
    );

    // Transform Supermemory v4/search results to our format
    // v4/search returns: { id, memory, similarity, metadata, updatedAt, documents, ... }
    const memories = supermemoryResults
      .map((result) => {
        // v4/search returns 'memory' field (not 'summary' or 'content')
        const memoryText = result.memory || "";
        if (!memoryText) {
          console.warn(
            `⚠️ [MEMORY] Result ${result.id} has no memory field, skipping`
          );
          return null;
        }

        // Extract metadata
        const metadata = result.metadata || {};

        // Get document ID (for updates/deletes if needed)
        // documents array may contain full document objects or just IDs
        const documentId =
          result.documents?.[0]?.id ||
          (typeof result.documents?.[0] === "string"
            ? result.documents[0]
            : null) ||
          result.id;

        return {
          id: result.id,
          documentId: documentId,
          content: memoryText, // The actual memory text from v4/search
          summary: null, // Summaries not available in v4/search, only in list endpoint
          metadata: metadata,
          context_type: metadata.context_type || "general",
          financial_relevance: metadata.financial_relevance || "medium",
          tags: Array.isArray(metadata.tags) ? metadata.tags : [],
          similarity: result.similarity || 0, // Relevance score from semantic search
          updatedAt:
            result.updatedAt || metadata.timestamp || new Date().toISOString(),
          // Keep original result for reference
          _originalResult: result,
        };
      })
      .filter(Boolean); // Remove null entries
    // Note: No need to sort - Supermemory already returns results ranked by relevance

    const result = {
      memories: memories,
      totalCount: memories.length,
    };

    // console.log("🧠 [MEMORY] Memories:", memories);
    console.log(
      `🧠 [MEMORY] Loaded ${
        result.totalCount
      } relevant memories for user ${userId} (avg similarity: ${
        memories.length > 0
          ? (
              memories.reduce((sum, m) => sum + (m.similarity || 0), 0) /
              memories.length
            ).toFixed(2)
          : 0
      })`
    );
    return result;
  } catch (error) {
    console.error("❌ [MEMORY] Error loading user memory:", error);
    // Return empty result for graceful degradation
    return { memories: [], totalCount: 0 };
  }
}

/**
 * Load user memory with timeout fallback (non-blocking)
 * Returns empty memories if timeout occurs, preventing request blocking
 * @param {string} userId - User ID
 * @param {string} query - Search query (optional)
 * @param {number} timeoutMs - Timeout in milliseconds (default: SUPERMEMORY_FETCH_TIMEOUT_MS + 700)
 * @returns {Promise<{memories: Array, totalCount: number}>} - Memory result or empty fallback
 */
async function loadUserMemoryWithTimeout(
  userId,
  query = null,
  timeoutMs = SUPERMEMORY_FETCH_TIMEOUT_MS + 700,
) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        `⏱️ [MEMORY] Memory loading timeout after ${timeoutMs}ms, using empty fallback`
      );
      resolve({ memories: [], totalCount: 0 });
    }, timeoutMs);
  });

  return Promise.race([
    loadUserMemory(userId, query).catch((error) => {
      // Defensive: catch any unexpected errors from loadUserMemory
      console.warn(
        `⚠️ [MEMORY] Error in loadUserMemory (caught by wrapper):`,
        error?.message
      );
      return { memories: [], totalCount: 0 };
    }),
    timeoutPromise,
  ])
    .then((result) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return result;
    })
    .catch((error) => {
    // Final safety net: ensure we never reject, always return empty memories
    console.warn(
      `⚠️ [MEMORY] Unexpected error in loadUserMemoryWithTimeout:`,
      error?.message
    );
    return { memories: [], totalCount: 0 };
    });
}

/**
 * Fetch profile with timeout fallback (non-blocking)
 * Returns null if timeout occurs, preventing request blocking
 * @param {string} userId - User ID
 * @param {number} timeoutMs - Timeout in milliseconds (default: SUPERMEMORY_FETCH_TIMEOUT_MS + 700)
 * @returns {Promise<object|null>} - Profile result or null fallback
 */
async function fetchSupermemoryProfileWithTimeout(
  userId,
  timeoutMs = SUPERMEMORY_FETCH_TIMEOUT_MS + 700,
) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        `⏱️ [PROFILE] Profile loading timeout after ${timeoutMs}ms, using null fallback`
      );
      resolve(null);
    }, timeoutMs);
  });

  return Promise.race([
    fetchSupermemoryProfile(userId).catch((error) => {
      // Defensive: catch any unexpected errors from fetchSupermemoryProfile
      console.warn(
        `⚠️ [PROFILE] Error in fetchSupermemoryProfile (caught by wrapper):`,
        error?.message
      );
      return null;
    }),
    timeoutPromise,
  ])
    .then((result) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return result;
    })
    .catch((error) => {
    // Final safety net: ensure we never reject, always return null
    console.warn(
      `⚠️ [PROFILE] Unexpected error in fetchSupermemoryProfileWithTimeout:`,
      error?.message
    );
    return null;
    });
}

// Helper function to check if data is sensitive
function isSensitiveData(value) {
  if (!value || typeof value !== "string") return false;

  const sensitivePatterns = [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card numbers
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email addresses
    /\b\d{3}-\d{3}-\d{4}\b/, // Phone numbers
  ];

  return sensitivePatterns.some((pattern) => pattern.test(value));
}

// Helper function to get expiry date for different memory types
function getExpiryDate(memoryType) {
  const now = new Date();

  switch (memoryType) {
    case "profile_trait":
      // Profile traits last 1 year
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    case "constraint":
      // Constraints last 6 months
      return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    case "preference":
      // Preferences last 3 months
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    case "goal":
      // Goals last 6 months
      return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    case "context_signal":
      // Context signals last 1 month
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    default:
      // Default to 3 months
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  }
}

// Redact PII function (imported from main file)
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

// === SUPERMEMORY INTEGRATION ===

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const SUPERMEMORY_BASE_URL = "https://api.supermemory.ai";

// Fetch timeout configuration
const SUPERMEMORY_FETCH_TIMEOUT_MS = Math.max(
  Number(process.env.SUPERMEMORY_FETCH_TIMEOUT_MS || 4500),
  1000,
); // Default 4.5s timeout for API calls with graceful fallback
const SUPERMEMORY_SEARCH_MAX_RETRIES = Math.max(
  Number(process.env.SUPERMEMORY_SEARCH_MAX_RETRIES || 1),
  0,
); // Retry count for memory search only
const SUPERMEMORY_SEARCH_RETRY_BASE_MS = Math.max(
  Number(process.env.SUPERMEMORY_SEARCH_RETRY_BASE_MS || 250),
  50,
);
const SUPERMEMORY_SEARCH_BREAKER_THRESHOLD = Math.max(
  Number(process.env.SUPERMEMORY_SEARCH_BREAKER_THRESHOLD || 3),
  1,
);
const SUPERMEMORY_SEARCH_BREAKER_COOLDOWN_MS = Math.max(
  Number(process.env.SUPERMEMORY_SEARCH_BREAKER_COOLDOWN_MS || 30000),
  1000,
);

const supermemorySearchBreaker = {
  consecutiveFailures: 0,
  openUntil: 0,
};

/**
 * Fetch with timeout wrapper to prevent hanging requests
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 2000)
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = SUPERMEMORY_FETCH_TIMEOUT_MS
) {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const method = options.method || "GET";
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    const elapsed = Date.now() - startTime;
    console.error(
      `⏱️ [FETCH_TIMEOUT] Request timeout triggered [${requestId}]`,
      {
        method,
        url,
        timeoutMs,
        elapsedMs: elapsed,
        timestamp: new Date().toISOString(),
      }
    );
    controller.abort();
  }, timeoutMs);

  try {
    const fetchStartTime = Date.now();
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const totalDuration = Date.now() - startTime;
    clearTimeout(timeoutId);

    // Only log if request failed (non-2xx status)
    if (!response.ok) {
      console.error(`❌ [FETCH_TIMEOUT] Request failed [${requestId}]`, {
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        totalDurationMs: totalDuration,
        timestamp: new Date().toISOString(),
      });
    }

    return response;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    clearTimeout(timeoutId);
    const errorCode = error?.code || error?.cause?.code || null;

    if (error.name === "AbortError") {
      console.error(
        `❌ [FETCH_TIMEOUT] Request aborted (timeout) [${requestId}]`,
        {
          method,
          url,
          timeoutMs,
          totalDurationMs: totalDuration,
          errorName: error.name,
          errorMessage: error.message,
          timestamp: new Date().toISOString(),
        }
      );
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }

    console.error(`❌ [FETCH_TIMEOUT] Request failed [${requestId}]`, {
      method,
      url,
      totalDurationMs: totalDuration,
      errorName: error.name,
      errorCode,
      errorMessage: error.message,
      errorStack: error.stack?.substring(0, 200),
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}

function cleanSupermemoryMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([_, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "object" && !Array.isArray(value)) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

async function storeSupermemoryDocumentWithRetry(
  userId,
  content,
  metadata,
  {
    logLabel = "memory",
    maxRetries = 1,
    initialRetryDelayMs = 750,
    maxRetryDelayMs = 3000,
  } = {}
) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      `⚠️ [SUPERMEMORY] API key not configured, skipping ${logLabel} storage`
    );
    return null;
  }

  if (!userId) {
    console.warn(
      `⚠️ [SUPERMEMORY] No userId provided, skipping ${logLabel} storage`
    );
    return null;
  }

  if (!content || !String(content).trim()) {
    console.warn(
      `⚠️ [SUPERMEMORY] Empty content provided, skipping ${logLabel} storage`
    );
    return null;
  }

  const requestBody = {
    content: String(content).trim(),
    metadata: cleanSupermemoryMetadata(metadata),
    containerTags: [`user_${userId}`],
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${SUPERMEMORY_BASE_URL}/v3/documents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        SUPERMEMORY_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        const errorMessage = `Supermemory API error: ${
          errorData.message || response.statusText
        } (${response.status})`;

        if (response.status >= 400 && response.status < 500) {
          throw new Error(errorMessage);
        }

        const retryableError = new Error(errorMessage);
        retryableError.isRetryable = true;
        retryableError.statusCode = response.status;
        throw retryableError;
      }

      const result = await response.json();
      console.log(
        `✅ [SUPERMEMORY] Stored ${logLabel} for user ${userId}${
          attempt > 0
            ? ` (after ${attempt} retry${attempt > 1 ? "ies" : ""})`
            : ""
        }: ${result.id || "success"}`
      );

      await invalidateSupermemoryDocumentsCache(userId);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isTimeout = error.message?.includes("timeout");
      const isServerError = error.statusCode >= 500 && error.statusCode < 600;
      const normalizedErrorMessage = String(error.message || "").toLowerCase();
      const errorCode = String(
        error.code || error?.cause?.code || "",
      ).toUpperCase();
      const isRetryable =
        error.isRetryable ||
        isServerError ||
        isTimeout ||
        normalizedErrorMessage.includes("network") ||
        normalizedErrorMessage.includes("fetch failed") ||
        normalizedErrorMessage.includes("socket hang up") ||
        errorCode === "ECONNRESET" ||
        errorCode === "ETIMEDOUT" ||
        errorCode === "EAI_AGAIN" ||
        errorCode === "ENOTFOUND" ||
        errorCode === "ECONNREFUSED";

      if (isLastAttempt || !isRetryable) {
        console.error(
          `❌ [SUPERMEMORY] Error storing ${logLabel}${
            isLastAttempt && maxRetries > 0
              ? ` (after ${maxRetries} retries)`
              : ""
          }:`,
          error.message
        );
        return null;
      }

      const baseDelay = Math.min(
        initialRetryDelayMs * Math.pow(2, attempt),
        maxRetryDelayMs
      );
      const jitter = Math.random() * 0.3 * baseDelay;
      const delay = baseDelay + jitter;

      console.warn(
        `⚠️ [SUPERMEMORY] ${logLabel} storage failed (attempt ${attempt + 1}/${
          maxRetries + 1
        }), retrying in ${Math.round(delay)}ms:`,
        error.message
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

export async function storeUserMessageMemory(
  userId,
  userMessage,
  metadata = {}
) {
  const trimmedMessage =
    typeof userMessage === "string" ? userMessage.trim() : "";

  if (!trimmedMessage) {
    return null;
  }

  const tags = extractSupermemoryFinancialTags(trimmedMessage);
  const financialRelevance = (() => {
    if (
      metadata.final_action === "ask" ||
      metadata.final_action === "stock_query" ||
      metadata.final_action === "goal_conversation"
    ) {
      return "high";
    }
    if (tags.length > 0) {
      return "medium";
    }
    return "low";
  })();

  const memoryMetadata = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    source: "chat_message",
    memory_type: "user_message",
    context_type: "conversation",
    financial_relevance: financialRelevance,
    message_length: trimmedMessage.length,
    tags,
    ...metadata,
  };

  return storeSupermemoryDocumentWithRetry(
    userId,
    trimmedMessage,
    memoryMetadata,
    {
      logLabel: "user message",
      maxRetries: 1,
      initialRetryDelayMs: 600,
      maxRetryDelayMs: 2000,
    }
  );
}

/**
 * Store onboarding profile and intent data in Supermemory
 * @param {string} userId - User ID for container tag isolation
 * @param {object} profileData - Profile data (age, occupation, referral)
 * @param {object} intentAnswers - Intent answers (money_mindset, stress_level, emergency_readiness)
 * @returns {Promise<object>} - Supermemory API response
 */
async function storeOnboardingMemory(userId, profileData, intentAnswers) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, skipping onboarding memory storage"
    );
    return null;
  }

  if (!userId) {
    console.warn(
      "⚠️ [SUPERMEMORY] No userId provided, skipping onboarding memory storage"
    );
    return null;
  }

  // Fetch user's name from profiles table
  let userName = null;
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    if (!error && profile) {
      const firstName = profile.first_name || null;
      const lastName = profile.last_name || null;
      if (firstName && lastName) {
        userName = `${firstName} ${lastName}`;
      } else if (firstName) {
        userName = firstName;
      } else if (lastName) {
        userName = lastName;
      }
    }
  } catch (error) {
    console.warn(
      `⚠️ [SUPERMEMORY] Could not fetch user name for onboarding memory:`,
      error.message
    );
  }

  // Build rich memory content from onboarding data
  const memoryContent = buildOnboardingContent(
    userName,
    profileData,
    intentAnswers
  );

  // Build metadata with onboarding context
  const memoryMetadata = buildOnboardingMetadata(
    userId,
    profileData,
    intentAnswers
  );

  // Filter out null, undefined, empty objects, and nested objects (Supermemory only accepts primitives and string arrays)
  const cleanedMetadata = Object.fromEntries(
    Object.entries(memoryMetadata).filter(([key, value]) => {
      // Remove null, undefined
      if (value === null || value === undefined) return false;
      // Remove all objects (nested objects not allowed - only primitives and string arrays)
      if (typeof value === "object" && !Array.isArray(value)) return false;
      // Remove empty arrays
      if (Array.isArray(value) && value.length === 0) return false;
      // Only keep primitives (string, number, boolean) and non-empty string arrays
      return true;
    })
  );

  const requestBody = {
    content: memoryContent,
    metadata: cleanedMetadata,
    containerTags: [`user_${userId}`],
  };

  // Retry configuration for Supermemory document writes
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
  const MAX_RETRY_DELAY_MS = 8000; // 8 seconds max delay

  // Retry logic with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${SUPERMEMORY_BASE_URL}/v3/documents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        SUPERMEMORY_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        const errorMessage = `Supermemory API error: ${
          errorData.message || response.statusText
        } (${response.status})`;

        // Don't retry on 4xx errors (client errors) - these won't succeed on retry
        if (response.status >= 400 && response.status < 500) {
          throw new Error(errorMessage);
        }

        // Retry on 5xx errors (server errors) - attach status for retry detection
        const retryableError = new Error(errorMessage);
        retryableError.isRetryable = true;
        retryableError.statusCode = response.status;
        throw retryableError;
      }

      const result = await response.json();
      console.log(
        `✅ [SUPERMEMORY] Stored onboarding memory for user ${userId}${
          attempt > 0
            ? ` (after ${attempt} retry${attempt > 1 ? "ies" : ""})`
            : ""
        }: ${result.id || "success"}`
      );

      // Invalidate cache after successful memory creation
      await invalidateSupermemoryDocumentsCache(userId);

      return result;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const isTimeout = error.message?.includes("timeout");
      const isServerError = error.statusCode >= 500 && error.statusCode < 600;
      const isRetryable =
        error.isRetryable ||
        isServerError ||
        isTimeout ||
        error.message?.includes("network") ||
        error.message?.includes("ECONNRESET") ||
        error.message?.includes("ETIMEDOUT");

      if (isLastAttempt || !isRetryable) {
        // Final attempt failed or non-retryable error
        console.error(
          `❌ [SUPERMEMORY] Error storing onboarding memory${
            isLastAttempt ? ` (after ${MAX_RETRIES} retries)` : ""
          }:`,
          error.message
        );
        // Don't throw - memory storage failures shouldn't break onboarding flow
        return null;
      }

      // Calculate exponential backoff delay with jitter
      const baseDelay = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
        MAX_RETRY_DELAY_MS
      );
      const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
      const delay = baseDelay + jitter;

      console.warn(
        `⚠️ [SUPERMEMORY] Onboarding memory storage failed (attempt ${
          attempt + 1
        }/${MAX_RETRIES + 1}), retrying in ${Math.round(delay)}ms:`,
        error.message
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but just in case
  return null;
}

/**
 * Calculate days until target date
 * @param {string} targetDate - Target date in YYYY-MM-DD format
 * @returns {number} - Number of days until target date
 */
function calculateDaysUntil(targetDate) {
  if (!targetDate) return null;
  try {
    const target = new Date(targetDate);
    const now = new Date();
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  } catch (error) {
    console.warn("⚠️ [GOAL MEMORY] Error calculating days until:", error);
    return null;
  }
}

/**
 * Categorize goal timeline as short_term, medium_term, or long_term
 * @param {string} targetDate - Target date in YYYY-MM-DD format
 * @returns {string} - Timeline category
 */
function categorizeTimeline(targetDate) {
  const daysUntil = calculateDaysUntil(targetDate);
  if (daysUntil === null) return "unknown";

  if (daysUntil <= 90) return "short_term";
  if (daysUntil <= 365) return "medium_term";
  return "long_term";
}

/**
 * Store goal creation memory in Supermemory
 * @param {string} userId - User ID for container tag isolation
 * @param {object} goalData - Goal data { id, label, target_amount, current_amount, target_date, category, note }
 * @param {string} createdVia - How goal was created: "chat" | "goals_screen"
 * @param {object} metadata - Additional metadata (analysis, chat_id, etc.)
 * @returns {Promise<object>} - Supermemory API response
 */
export async function storeGoalCreationMemory(
  userId,
  goalData,
  createdVia = "goals_screen",
  metadata = {}
) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, skipping goal creation memory storage"
    );
    return null;
  }

  if (!userId) {
    console.warn(
      "⚠️ [SUPERMEMORY] No userId provided, skipping goal creation memory storage"
    );
    return null;
  }

  if (!goalData || !goalData.id) {
    console.warn(
      "⚠️ [SUPERMEMORY] Invalid goal data provided, skipping goal creation memory storage"
    );
    return null;
  }

  // Fetch user's name from profiles table
  let userName = null;
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    if (!error && profile) {
      const firstName = profile.first_name || null;
      const lastName = profile.last_name || null;
      if (firstName && lastName) {
        userName = `${firstName} ${lastName}`;
      } else if (firstName) {
        userName = firstName;
      } else if (lastName) {
        userName = lastName;
      }
    }
  } catch (error) {
    console.warn(
      `⚠️ [SUPERMEMORY] Could not fetch user name for goal memory:`,
      error.message
    );
  }

  // Build memory content
  const contentParts = [];

  // Main goal creation statement
  const formattedAmount = `$${Number(goalData.target_amount).toLocaleString()}`;
  const formattedCurrent = `$${Number(
    goalData.current_amount || 0
  ).toLocaleString()}`;
  contentParts.push(
    `User created goal: ${goalData.label} for ${formattedAmount} by ${goalData.target_date}. Category: ${goalData.category}.`
  );

  // Add note if exists
  if (goalData.note) {
    contentParts.push(`Note: ${goalData.note}`);
  }

  // Add context about how goal was created
  if (createdVia === "chat") {
    contentParts.push(
      "\nThe goal was created through conversation with Finny. The conversation history leading to this goal creation is stored separately in Supermemory."
    );
  } else {
    contentParts.push(
      "\nThe goal was created manually through the goals screen."
    );
  }

  // Add goal details section
  const daysUntil = calculateDaysUntil(goalData.target_date);
  const timelineCategory = categorizeTimeline(goalData.target_date);

  contentParts.push("\nGOAL DETAILS:");
  contentParts.push(`- Target Amount: ${formattedAmount}`);
  contentParts.push(`- Current Progress: ${formattedCurrent}`);
  contentParts.push(`- Target Date: ${goalData.target_date}`);
  if (daysUntil !== null) {
    contentParts.push(`- Timeline: ${daysUntil} days (${timelineCategory})`);
  }
  contentParts.push(`- Category: ${goalData.category}`);

  // Add feasibility analysis if available
  const analysis = metadata?.analysis;
  if (analysis) {
    contentParts.push("\n");
    if (analysis.feasibility) {
      const feasibilityLabels = {
        high: "high",
        medium: "medium",
        low: "low",
      };
      contentParts.push(
        `- Feasibility: ${
          feasibilityLabels[analysis.feasibility] || analysis.feasibility
        }`
      );
    }
    if (analysis.monthly_savings_needed) {
      contentParts.push(
        `- Monthly Savings Needed: $${Number(
          analysis.monthly_savings_needed
        ).toLocaleString()}`
      );
    }
    if (analysis.advice) {
      contentParts.push(`- ${analysis.advice}`);
    }
  }

  const memoryContent = contentParts.join("\n");

  // Build metadata
  const tags = [
    "goal",
    "goal_created",
    goalData.category,
    "financial_planning",
    createdVia === "chat" ? "chat_created" : "manual_creation",
  ];

  const memoryMetadata = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    memory_type: "goal_creation",
    goal_id: goalData.id,
    goal_category: goalData.category,
    goal_amount: goalData.target_amount,
    goal_timeline_days: daysUntil,
    goal_timeline_category: timelineCategory,
    created_via: createdVia,
    financial_relevance: "high",
    context_type: "goal",
    tags: tags,
  };

  // Add optional metadata fields
  if (metadata?.chat_id) {
    memoryMetadata.chat_id = metadata.chat_id;
  }
  if (analysis?.feasibility) {
    memoryMetadata.feasibility = analysis.feasibility;
  }
  if (analysis?.monthly_savings_needed) {
    memoryMetadata.monthly_savings_needed = analysis.monthly_savings_needed;
  }

  // Filter out null, undefined, empty objects, and nested objects
  const cleanedMetadata = Object.fromEntries(
    Object.entries(memoryMetadata).filter(([key, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "object" && !Array.isArray(value)) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );

  const requestBody = {
    content: memoryContent,
    metadata: cleanedMetadata,
    containerTags: [`user_${userId}`],
  };

  // Retry configuration
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY_MS = 1000;
  const MAX_RETRY_DELAY_MS = 8000;

  // Retry logic with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${SUPERMEMORY_BASE_URL}/v3/documents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        SUPERMEMORY_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        const errorMessage = `Supermemory API error: ${
          errorData.message || response.statusText
        } (${response.status})`;

        if (response.status >= 400 && response.status < 500) {
          throw new Error(errorMessage);
        }

        const retryableError = new Error(errorMessage);
        retryableError.isRetryable = true;
        retryableError.statusCode = response.status;
        throw retryableError;
      }

      const result = await response.json();
      console.log(
        `✅ [SUPERMEMORY] Stored goal creation memory for user ${userId}${
          attempt > 0
            ? ` (after ${attempt} retry${attempt > 1 ? "ies" : ""})`
            : ""
        }: ${result.id || "success"}`
      );

      // Invalidate cache after successful memory creation
      await invalidateSupermemoryDocumentsCache(userId);

      return result;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const isTimeout = error.message?.includes("timeout");
      const isServerError = error.statusCode >= 500 && error.statusCode < 600;
      const isRetryable =
        error.isRetryable ||
        isServerError ||
        isTimeout ||
        error.message?.includes("network") ||
        error.message?.includes("ECONNRESET") ||
        error.message?.includes("ETIMEDOUT");

      if (isLastAttempt || !isRetryable) {
        console.error(
          `❌ [SUPERMEMORY] Error storing goal creation memory${
            isLastAttempt ? ` (after ${MAX_RETRIES} retries)` : ""
          }:`,
          error.message
        );
        return null;
      }

      // Calculate exponential backoff delay with jitter
      const baseDelay = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
        MAX_RETRY_DELAY_MS
      );
      const jitter = Math.random() * 0.3 * baseDelay;
      const delay = baseDelay + jitter;

      console.warn(
        `⚠️ [SUPERMEMORY] Goal creation memory storage failed (attempt ${
          attempt + 1
        }/${MAX_RETRIES + 1}), retrying in ${Math.round(delay)}ms:`,
        error.message
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

/**
 * Store goal deletion memory in Supermemory
 * @param {string} userId - User ID for container tag isolation
 * @param {object} goalData - Goal data { id, label, target_amount, current_amount, target_date, category, note }
 * @param {string} deletedVia - How goal was deleted: "goals_screen" | "chat"
 * @returns {Promise<object>} - Supermemory API response
 */
export async function storeGoalDeletionMemory(
  userId,
  goalData,
  deletedVia = "goals_screen"
) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, skipping goal deletion memory storage"
    );
    return null;
  }

  if (!userId) {
    console.warn(
      "⚠️ [SUPERMEMORY] No userId provided, skipping goal deletion memory storage"
    );
    return null;
  }

  if (!goalData || !goalData.id) {
    console.warn(
      "⚠️ [SUPERMEMORY] Invalid goal data provided, skipping goal deletion memory storage"
    );
    return null;
  }

  // Fetch user's name from profiles table
  let userName = null;
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    if (!error && profile) {
      const firstName = profile.first_name || null;
      const lastName = profile.last_name || null;
      if (firstName && lastName) {
        userName = `${firstName} ${lastName}`;
      } else if (firstName) {
        userName = firstName;
      } else if (lastName) {
        userName = lastName;
      }
    }
  } catch (error) {
    console.warn(
      `⚠️ [SUPERMEMORY] Could not fetch user name for goal deletion memory:`,
      error.message
    );
  }

  // Build memory content
  const contentParts = [];

  // Main goal deletion statement
  const formattedAmount = `$${Number(goalData.target_amount).toLocaleString()}`;
  const formattedCurrent = `$${Number(
    goalData.current_amount || 0
  ).toLocaleString()}`;
  const progressPercent =
    goalData.target_amount > 0
      ? Math.round(
          ((goalData.current_amount || 0) / goalData.target_amount) * 100
        )
      : 0;

  contentParts.push(
    `User deleted goal: ${goalData.label} (target: ${formattedAmount}, progress: ${formattedCurrent} / ${progressPercent}%). Category: ${goalData.category}. Target date was: ${goalData.target_date}.`
  );

  // Add note if exists
  if (goalData.note) {
    contentParts.push(`Original note: ${goalData.note}`);
  }

  // Add context about how goal was deleted
  if (deletedVia === "chat") {
    contentParts.push(
      "\nThe goal was deleted through conversation with Finny. The conversation history leading to this goal deletion is stored separately in Supermemory."
    );
  } else {
    contentParts.push(
      "\nThe goal was deleted manually through the goals screen."
    );
  }

  // Add goal details section for context
  contentParts.push("\nDELETED GOAL DETAILS:");
  contentParts.push(`- Goal Name: ${goalData.label}`);
  contentParts.push(`- Target Amount: ${formattedAmount}`);
  contentParts.push(`- Current Progress: ${formattedCurrent} (${progressPercent}%)`);
  contentParts.push(`- Target Date: ${goalData.target_date}`);
  contentParts.push(`- Category: ${goalData.category}`);
  if (goalData.status) {
    contentParts.push(`- Status at deletion: ${goalData.status}`);
  }

  const memoryContent = contentParts.join("\n");

  // Build metadata
  const tags = [
    "goal",
    "goal_deleted",
    goalData.category,
    "financial_planning",
    deletedVia === "chat" ? "chat_deleted" : "manual_deletion",
  ];

  const memoryMetadata = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    memory_type: "goal_deletion",
    goal_id: goalData.id,
    goal_category: goalData.category,
    goal_amount: goalData.target_amount,
    goal_progress_percent: progressPercent,
    deleted_via: deletedVia,
    financial_relevance: "high",
    context_type: "goal",
    tags: tags,
  };

  // Filter out null, undefined, empty objects, and nested objects
  const cleanedMetadata = Object.fromEntries(
    Object.entries(memoryMetadata).filter(([key, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "object" && !Array.isArray(value)) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );

  const requestBody = {
    content: memoryContent,
    metadata: cleanedMetadata,
    containerTags: [`user_${userId}`],
  };

  // Retry configuration
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY_MS = 1000;
  const MAX_RETRY_DELAY_MS = 8000;

  // Retry logic with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${SUPERMEMORY_BASE_URL}/v3/documents`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
        SUPERMEMORY_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        const errorMessage = `Supermemory API error: ${
          errorData.message || response.statusText
        } (${response.status})`;

        if (response.status >= 400 && response.status < 500) {
          throw new Error(errorMessage);
        }

        const retryableError = new Error(errorMessage);
        retryableError.isRetryable = true;
        retryableError.statusCode = response.status;
        throw retryableError;
      }

      const result = await response.json();
      console.log(
        `✅ [SUPERMEMORY] Stored goal deletion memory for user ${userId}${
          attempt > 0
            ? ` (after ${attempt} retry${attempt > 1 ? "ies" : ""})`
            : ""
        }: ${result.id || "success"}`
      );

      // Invalidate cache after successful memory creation
      await invalidateSupermemoryDocumentsCache(userId);

      return result;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const isTimeout = error.message?.includes("timeout");
      const isServerError = error.statusCode >= 500 && error.statusCode < 600;
      const isRetryable =
        error.isRetryable ||
        isServerError ||
        isTimeout ||
        error.message?.includes("network") ||
        error.message?.includes("ECONNRESET") ||
        error.message?.includes("ETIMEDOUT");

      if (isLastAttempt || !isRetryable) {
        console.error(
          `❌ [SUPERMEMORY] Error storing goal deletion memory${
            isLastAttempt ? ` (after ${MAX_RETRIES} retries)` : ""
          }:`,
          error.message
        );
        return null;
      }

      // Calculate exponential backoff delay with jitter
      const baseDelay = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
        MAX_RETRY_DELAY_MS
      );
      const jitter = Math.random() * 0.3 * baseDelay;
      const delay = baseDelay + jitter;

      console.warn(
        `⚠️ [SUPERMEMORY] Goal deletion memory storage failed (attempt ${
          attempt + 1
        }/${MAX_RETRIES + 1}), retrying in ${Math.round(delay)}ms:`,
        error.message
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return null;
}

/**
 * Build rich memory content from onboarding data
 * @param {string} userName - User's full name (first_name + last_name)
 * @param {object} profileData - Profile data (age, occupation, referral)
 * @param {object} intentAnswers - Intent answers (money_mindset, stress_level, emergency_readiness)
 * @returns {string} - Formatted memory content
 */
function buildOnboardingContent(userName, profileData, intentAnswers) {
  const parts = [];

  // Profile section
  if (profileData || userName) {
    const profileParts = [];
    if (userName) {
      profileParts.push(`Name: ${userName}`);
    }
    if (profileData?.age) {
      profileParts.push(`Age ${profileData.age}`);
    }
    if (profileData?.occupation) {
      profileParts.push(`Occupation: ${profileData.occupation}`);
    }
    if (profileData?.referral) {
      const referralLabels = {
        tiktok: "TikTok",
        instagram: "Instagram",
        twitter: "Twitter/X",
        email: "Email",
        friend: "Friend",
        appstore: "App Store",
        reddit: "Reddit",
        founder: "Founder",
      };
      const referralLabel =
        referralLabels[profileData.referral] || profileData.referral;
      profileParts.push(`Found Finny via: ${referralLabel}`);
    }
    if (profileParts.length > 0) {
      parts.push(`Profile:\n${profileParts.join("\n")}`);
    }
  }

  // Intent answers section
  if (intentAnswers) {
    const intentParts = [];

    // Money mindset
    if (intentAnswers.money_mindset) {
      const mindsetLabels = {
        freedom: "Tool for freedom",
        stress: "It stresses me",
        ignore: "I kind of ignore it",
        disciplined: "I'm disciplined",
      };
      const mindsetLabel =
        mindsetLabels[intentAnswers.money_mindset] ||
        intentAnswers.money_mindset;
      intentParts.push(`Money mindset: ${mindsetLabel}`);
    }

    // Stress level
    if (intentAnswers.stress_level) {
      const stressLabels = {
        chill: "Chill",
        tense: "A bit tense",
        stressed: "Stressed",
        overwhelmed: "Overwhelmed",
      };
      const stressLabel =
        stressLabels[intentAnswers.stress_level] || intentAnswers.stress_level;
      intentParts.push(`Financial stress level: ${stressLabel}`);
    }

    // Emergency readiness
    if (intentAnswers.emergency_readiness) {
      const emergencyLabels = {
        yes: "Yes",
        maybe: "Maybe",
        no: "No",
        unsure: "Not sure",
      };
      const emergencyLabel =
        emergencyLabels[intentAnswers.emergency_readiness] ||
        intentAnswers.emergency_readiness;
      intentParts.push(
        `Emergency readiness ($1,000 expense): ${emergencyLabel}`
      );
    }

    if (intentParts.length > 0) {
      parts.push(`Financial Intent & Mindset:\n${intentParts.join("\n")}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * Build metadata for onboarding memory storage
 * @param {string} userId - User ID
 * @param {object} profileData - Profile data (age, occupation, referral)
 * @param {object} intentAnswers - Intent answers (money_mindset, stress_level, emergency_readiness)
 * @returns {object} - Metadata object
 */
function buildOnboardingMetadata(userId, profileData, intentAnswers) {
  const tags = ["onboarding", "profile", "intent_answers"];

  // Add specific tags based on answers
  if (intentAnswers?.money_mindset) {
    tags.push(`money_mindset_${intentAnswers.money_mindset}`);
  }
  if (intentAnswers?.stress_level) {
    tags.push(`stress_level_${intentAnswers.stress_level}`);
  }
  if (intentAnswers?.emergency_readiness) {
    tags.push(`emergency_${intentAnswers.emergency_readiness}`);
  }
  if (profileData?.referral) {
    tags.push(`referral_${profileData.referral}`);
  }

  // Age group tags
  if (profileData?.age) {
    const age = parseInt(profileData.age);
    if (age >= 18 && age <= 24) tags.push("age_18_24");
    else if (age >= 25 && age <= 34) tags.push("age_25_34");
    else if (age >= 35 && age <= 44) tags.push("age_35_44");
    else if (age >= 45 && age <= 54) tags.push("age_45_54");
    else if (age >= 55) tags.push("age_55_plus");
  }

  // Extract financial tags from occupation text if available
  if (profileData?.occupation) {
    const occupationTags = extractSupermemoryFinancialTags(
      profileData.occupation
    );
    tags.push(...occupationTags);
  }

  const metadata = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    source: "onboarding",
    memory_type: "profile_trait",
    onboarding_step: 3,
    created_via: "onboarding_flow_v1",
    tags: tags,
    financial_relevance: "high", // Onboarding data is always highly relevant
    context_type: "profile",
  };

  // Add raw profile data (primitives only)
  if (profileData) {
    if (profileData.age) metadata.age = parseInt(profileData.age);
    if (profileData.occupation)
      metadata.occupation = String(profileData.occupation);
    if (profileData.referral) metadata.referral = String(profileData.referral);
  }

  // Add raw intent answers (primitives only)
  if (intentAnswers) {
    if (intentAnswers.money_mindset)
      metadata.intent_q1 = String(intentAnswers.money_mindset);
    if (intentAnswers.stress_level)
      metadata.intent_q2 = String(intentAnswers.stress_level);
    if (intentAnswers.emergency_readiness)
      metadata.intent_q3 = String(intentAnswers.emergency_readiness);
  }

  return metadata;
}

/**
 * Extract financial tags from message
 * @param {string} message - User message
 * @returns {string[]} - Array of tags
 */
function extractSupermemoryFinancialTags(message) {
  const tags = [];
  const lower = message.toLowerCase();

  // Centralized financial tag definitions for Supermemory
  const SUPERMEMORY_FINANCIAL_TAG_RULES = [
    {
      // "i wanna", "tryna", "manifest", etc.
      tag: "goal_mentioned",
      regex:
        /want|wanna|tryna|trying to|goal|plan|planning|dream|dreaming|target|save for|manifest/,
    },
    {
      // "trip", "vacay", "getaway", "solo trip", "roadtrip", etc.
      tag: "travel_interest",
      regex:
        /travel|trip|vacation|vacay|getaway|japan|europe|visit|holiday|roadtrip|road trip|solo trip|backpack|backpacking|flight|flights|plane ticket/,
    },
    {
      // "cop", "grab", "upgrade", "new phone", "down payment", etc.
      tag: "purchase_interest",
      regex:
        /buy|purchase|cop|cop a|grab|acquire|pick up|upgrade|afford|macbook|laptop|phone|iphone|car|tesla|whip|ride|house|home|apartment|place of my own|down payment|dp on a house/,
    },
    {
      // "broke", "in the red", "loans", "cc debt", etc.
      tag: "debt_concern",
      regex:
        /debt|loan|loans|student debt|student loans|credit card|cc debt|owe|pay off|payoff|in the red|collections|interest payments|minimum payment|min payment|maxed out|maxed/,
    },
    {
      // "stack", "stash", "rainy day", "emergency fund", etc.
      tag: "savings_discussion",
      regex:
        /save|saving up|savings|stacking|stack cash|stack bread|stash|rainy day fund|emergency fund|emergency money|safety net|cushion/,
    },
    {
      // "invest", "index funds", "crypto", "bag", "portfolio", etc.
      tag: "investment_discussion",
      regex:
        /invest|investment|investing|stocks?|stock market|etf|index fund|index funds|portfolio|brokerage|retirement|401k|ira|roth|roth ira|crypto|bitcoin|btc|eth|ethereum|bag|long term hold|lt hold/,
    },
    {
      // "budget", "broke", "spending too much", "burning cash", etc.
      tag: "budget_discussion",
      regex:
        /budget|budgeting|spending|expense|expenses|spend|spending too much|overspend|overspending|broke|burning cash|living paycheck to paycheck|paycheck to paycheck|tight on money|tight on cash|cut back|cutting back/,
    },
    {
      // "paycheck", "payday", "side hustle", "gig", "raise", etc.
      tag: "income_discussion",
      regex:
        /salary|income|earn|earning|paycheck|pay check|pay day|payday|wage|hourly|raise|bonus|side hustle|side gig|freelance|freelancing|contracting|overtime|ot pay/,
    },
  ];

  SUPERMEMORY_FINANCIAL_TAG_RULES.forEach(({ tag, regex }) => {
    if (regex.test(lower)) {
      tags.push(tag);
    }
  });

  return tags;
}

// Format intent answers into natural language context for Finny
function formatIntentAnswers(intentQ1, intentQ2, intentQ3) {
  const contextParts = [];

  // Intent Q1: Money mindset
  const mindsetMap = {
    freedom: "User views money as a tool for freedom",
    stress: "User finds money stressful",
    ignore: "User tends to ignore their finances",
    disciplined: "User is disciplined with money",
  };
  if (intentQ1 && mindsetMap[intentQ1]) {
    contextParts.push(mindsetMap[intentQ1]);
  }

  // Intent Q2: Financial stress level
  const stressMap = {
    chill: "User feels relaxed about their finances",
    tense: "User feels a bit tense about their finances",
    stressed: "User feels stressed about their finances",
    overwhelmed: "User feels overwhelmed by their finances",
  };
  if (intentQ2 && stressMap[intentQ2]) {
    contextParts.push(stressMap[intentQ2]);
  }

  // Intent Q3: Emergency readiness (reference point, not absolute truth)
  const emergencyMap = {
    yes: "User indicated they could cover a $1,000 emergency expense",
    maybe: "User is uncertain if they could cover a $1,000 emergency expense",
    no: "User indicated they cannot cover a $1,000 emergency expense (use as reference, may not be current)",
    unsure: "User is unsure about their emergency fund readiness",
  };
  if (intentQ3 && emergencyMap[intentQ3]) {
    contextParts.push(emergencyMap[intentQ3]);
  }

  return contextParts.join(". ");
}

// Load user profile data from profiles table (onboarding data)
async function loadUserProfile(userId) {
  if (!userId) {
    return {
      name: null,
      age: null,
      occupation: null,
      location: null,
      monthly_income: null,
      finny_style: "conversational",
      intent_context: "",
    };
  }

  // Check cache first
  const cached = getCachedProfile(userId);
  if (cached) {
    console.log(
      `👤 [PROFILE] Using cached profile data for user: ${userId} - finny_style: ${
        cached.finny_style || "conversational"
      }`
    );
    return cached;
  }

  try {
    console.log("👤 [PROFILE] Loading fresh profile data for user:", userId);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "first_name, last_name, age, occupation, location, monthly_income, finny_style, intent_q1, intent_q2, intent_q3"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("❌ [PROFILE] Error loading profile:", error);
      // Return defaults on error
      const defaultProfile = {
        name: null,
        age: null,
        occupation: null,
        location: null,
        monthly_income: null,
        finny_style: "conversational",
        intent_context: "",
      };
      setCachedProfile(userId, defaultProfile);
      return defaultProfile;
    }

    // Build full name
    const firstName = profile?.first_name || null;
    const lastName = profile?.last_name || null;
    const name =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || lastName || null;

    // Format intent answers into natural language context
    const intentContext = formatIntentAnswers(
      profile?.intent_q1,
      profile?.intent_q2,
      profile?.intent_q3
    );

    // Ensure finny_style defaults to "conversational" if null/undefined/empty
    const finnyStyle =
      profile?.finny_style &&
      ["conversational", "direct", "witty"].includes(profile.finny_style)
        ? profile.finny_style
        : "conversational";
    const parsedMonthlyIncome = Number(profile?.monthly_income);
    const monthlyIncome =
      Number.isFinite(parsedMonthlyIncome) && parsedMonthlyIncome > 0
        ? Math.round(parsedMonthlyIncome * 100) / 100
        : null;

    const result = {
      name,
      age: profile?.age || null,
      occupation: profile?.occupation || null,
      location: profile?.location || null,
      monthly_income: monthlyIncome,
      finny_style: finnyStyle,
      intent_context: intentContext,
      // Keep raw values for reference if needed
      intent_q1: profile?.intent_q1 || null,
      intent_q2: profile?.intent_q2 || null,
      intent_q3: profile?.intent_q3 || null,
    };

    // Cache the result
    setCachedProfile(userId, result);

    console.log(
      `👤 [PROFILE] Loaded profile for user ${userId} - finny_style: ${finnyStyle}${
        profile?.finny_style !== finnyStyle
          ? ` (normalized from: ${profile?.finny_style || "null"})`
          : ""
      }`
    );
    return result;
  } catch (error) {
    console.error("❌ [PROFILE] Error loading user profile:", error);
    const defaultProfile = {
      name: null,
      age: null,
      occupation: null,
      location: null,
      monthly_income: null,
      finny_style: "conversational",
      intent_context: "",
    };
    setCachedProfile(userId, defaultProfile);
    return defaultProfile;
  }
}

/**
 * Fetch user profile from Supermemory API v4/profile
 * @param {string} userId - User ID for container tag isolation
 * @returns {Promise<object|null>} - User profile with memories, or null if not available
 */
async function fetchSupermemoryProfile(userId) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, cannot fetch profile"
    );
    return null;
  }

  if (!userId) {
    console.warn("⚠️ [SUPERMEMORY] No userId provided, cannot fetch profile");
    return null;
  }

  try {
    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v4/profile`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ containerTag: `user_${userId}` }),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );

    // Handle 404 gracefully - profile endpoint might not exist yet
    if (response.status === 404) {
      console.log(
        `ℹ️ [SUPERMEMORY] Profile endpoint not available for user ${userId} (404)`
      );
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      // Log but don't throw - profile is optional
      console.warn(
        `⚠️ [SUPERMEMORY] Profile fetch failed: ${
          errorData.message || response.statusText
        } (${response.status})`
      );
      return null;
    }

    const result = await response.json();
    console.log(`✅ [SUPERMEMORY] Fetched profile for user ${userId}`);
    return result;
  } catch (error) {
    // Log but don't throw - profile fetch failure shouldn't break the request
    console.warn(`⚠️ [SUPERMEMORY] Error fetching profile:`, error.message);
    return null;
  }
}

/**
 * Search user memories from Supermemory using semantic search API
 * Returns relevant memories based on query (user's message)
 * @param {string} userId - User ID for container tag isolation
 * @param {string} query - Search query (user's message for semantic search)
 * @param {object} options - Optional search options
 * @param {number} options.limit - Maximum number of results (default: 15)
 * @param {number} options.threshold - Minimum relevance score (default: 0.3)
 * @returns {Promise<Array>} - Array of relevant memory documents ranked by relevance
 */
async function searchSupermemoryMemories(userId, query, options = {}) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, cannot search memories"
    );
    return [];
  }

  if (!userId) {
    console.warn("⚠️ [SUPERMEMORY] No userId provided, cannot search memories");
    return [];
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    console.warn(
      "⚠️ [SUPERMEMORY] Empty query provided, returning empty results"
    );
    return [];
  }

  const { limit = 15, threshold = 0.4 } = options;
  const now = Date.now();

  if (supermemorySearchBreaker.openUntil > now) {
    const waitMs = supermemorySearchBreaker.openUntil - now;
    console.warn(
      `⏭️ [SUPERMEMORY] Search circuit open, skipping request for ${waitMs}ms`,
    );
    return [];
  }

  for (let attempt = 0; attempt <= SUPERMEMORY_SEARCH_MAX_RETRIES; attempt++) {
    try {
    // Note: Removed metadata filters - the OR filter was matching everything (high OR medium OR low = all)
    // Semantic search + similarity threshold already provides good relevance ranking
    // If needed, we can add specific filters later (e.g., only high relevance) but for now,
    // let semantic search handle relevance and use threshold to filter low-quality results

      const response = await fetchWithTimeout(
        `${SUPERMEMORY_BASE_URL}/v4/search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: query.trim(), // User's message for semantic search
            limit: limit,
            threshold: threshold, // Minimum similarity score (0.0-1.0)
            rerank: true, // Enable reranking for better relevance
            rewriteQuery: true, // Allow query rewriting for better results
            include: {
              documents: true,
              summaries: false, // Summaries not available in v4/search, only in list endpoint
            },
            containerTag: `user_${userId}`, // v4 API uses singular containerTag
            // Removed filters - semantic search handles relevance better
          }),
        },
        SUPERMEMORY_FETCH_TIMEOUT_MS,
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after") || "60";
          console.warn(
            `⚠️ [SUPERMEMORY] Rate limit exceeded, retry after ${retryAfter}s`,
          );
          return [];
        }

        // Retry transient server errors
        if (
          response.status >= 500 &&
          attempt < SUPERMEMORY_SEARCH_MAX_RETRIES
        ) {
          const delay =
            SUPERMEMORY_SEARCH_RETRY_BASE_MS * Math.pow(2, attempt) +
            Math.round(Math.random() * 100);
          console.warn(
            `⚠️ [SUPERMEMORY] Search failed with ${response.status} (attempt ${
              attempt + 1
            }/${SUPERMEMORY_SEARCH_MAX_RETRIES + 1}), retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        console.error(
          `❌ [SUPERMEMORY] Search API error: ${
            errorData.message || errorData.error?.message || response.statusText
          } (${response.status})`,
        );
        return [];
      }

      const result = await response.json();
      // Extract memories from search results
      // Supermemory v4/search returns: { results: [...], timing, total }
      // Each result contains: { id, memory, similarity, metadata, updatedAt, documents, ... }
      const memories = result.results || [];

      if (!Array.isArray(memories)) {
        console.warn(
          `⚠️ [SUPERMEMORY] Unexpected response format, results is not an array:`,
          typeof memories,
        );
        return [];
      }

      // Log search performance metrics
      const avgSimilarity =
        memories.length > 0
          ? memories.reduce((sum, m) => sum + (m.similarity || 0), 0) /
            memories.length
          : 0;

      console.log(
        `✅ [SUPERMEMORY] Found ${
          memories.length
        } relevant memories for user ${userId} (query: "${query.substring(
          0,
          50,
        )}...", avg similarity: ${avgSimilarity.toFixed(2)}, timing: ${
          result.timing || "N/A"
        }ms)`,
      );

      supermemorySearchBreaker.consecutiveFailures = 0;
      supermemorySearchBreaker.openUntil = 0;

      return memories;
    } catch (error) {
      const isTimeout = String(error?.message || "").includes("timeout");
      const isNetwork =
        String(error?.message || "").includes("network") ||
        String(error?.message || "").includes("ECONNRESET") ||
        String(error?.message || "").includes("ETIMEDOUT");
      const canRetry =
        attempt < SUPERMEMORY_SEARCH_MAX_RETRIES && (isTimeout || isNetwork);

      if (isTimeout || isNetwork) {
        supermemorySearchBreaker.consecutiveFailures += 1;
        if (
          supermemorySearchBreaker.consecutiveFailures >=
          SUPERMEMORY_SEARCH_BREAKER_THRESHOLD
        ) {
          supermemorySearchBreaker.openUntil =
            Date.now() + SUPERMEMORY_SEARCH_BREAKER_COOLDOWN_MS;
          console.warn(
            `⚠️ [SUPERMEMORY] Opening search circuit for ${SUPERMEMORY_SEARCH_BREAKER_COOLDOWN_MS}ms after ${supermemorySearchBreaker.consecutiveFailures} consecutive failures`,
          );
        }
      }

      if (canRetry) {
        const delay =
          SUPERMEMORY_SEARCH_RETRY_BASE_MS * Math.pow(2, attempt) +
          Math.round(Math.random() * 100);
        console.warn(
          `⚠️ [SUPERMEMORY] Search failed (${error.message}) (attempt ${
            attempt + 1
          }/${SUPERMEMORY_SEARCH_MAX_RETRIES + 1}), retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error(`❌ [SUPERMEMORY] Error searching memories:`, error.message);
      return [];
    }
  }

  return [];
}

/**
 * Fetch user memories from Supermemory using search API
 * Returns all memory documents for edit/delete functionality
 * @param {string} userId - User ID for container tag isolation
 * @returns {Promise<Array>} - Array of user memories/documents
 */
async function fetchSupermemoryMemories(userId) {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(
    `📥 [SUPERMEMORY] Starting fetchSupermemoryMemories [${requestId}]`,
    {
      userId,
      apiUrl: `${SUPERMEMORY_BASE_URL}/v4/search`,
      timeoutMs: SUPERMEMORY_FETCH_TIMEOUT_MS,
      timestamp: new Date().toISOString(),
    }
  );

  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, cannot fetch memories"
    );
    return [];
  }

  if (!userId) {
    console.warn("⚠️ [SUPERMEMORY] No userId provided, cannot fetch memories");
    return [];
  }

  try {
    const requestBody = {
      q: "*", // Broad query to get all memories
      limit: 100, // Get up to 100 memories
      threshold: 0.0, // Low threshold to get all results
      rerank: false,
      rewriteQuery: false,
      containerTag: `user_${userId}`, // v4 API uses singular containerTag
      searchMode: "memories",
    };

    console.log(`📤 [SUPERMEMORY] Sending request [${requestId}]`, {
      userId,
      requestBody: {
        ...requestBody,
        q:
          requestBody.q === "*"
            ? "* (all memories)"
            : requestBody.q.substring(0, 50),
      },
      bodySize: JSON.stringify(requestBody).length,
      timestamp: new Date().toISOString(),
    });

    // Use search API with a broad query to get all user memories
    // Search for any content to retrieve all memories for the user
    const fetchStartTime = Date.now();
    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v4/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );
    const fetchDuration = Date.now() - fetchStartTime;

    console.log(`📥 [SUPERMEMORY] Received response [${requestId}]`, {
      userId,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      fetchDurationMs: fetchDuration,
      timestamp: new Date().toISOString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error(`❌ [SUPERMEMORY] API error response [${requestId}]`, {
        userId,
        status: response.status,
        statusText: response.statusText,
        errorData,
        timestamp: new Date().toISOString(),
      });
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    const parseStartTime = Date.now();
    const result = await response.json();
    const parseDuration = Date.now() - parseStartTime;
    const totalDuration = Date.now() - startTime;

    // Extract memories from search results
    // Supermemory v4/search returns: { results: [...], timing, total }
    // Each result contains: id, memory, metadata, updatedAt, documents, chunks, etc.
    const memories = result.results || result.documents || result.data || [];

    console.log(`📊 [SUPERMEMORY] Parsed response [${requestId}]`, {
      userId,
      memoriesCount: memories.length,
      totalInResult: result.total,
      apiTiming: result.timing,
      parseDurationMs: parseDuration,
      totalDurationMs: totalDuration,
      isArray: Array.isArray(memories),
      timestamp: new Date().toISOString(),
    });

    // Log first memory structure for debugging
    if (memories.length > 0) {
      console.log(
        `🔍 [SUPERMEMORY] Sample memory structure [${requestId}]:`,
        JSON.stringify(memories[0], null, 2)
      );
    }

    console.log(
      `✅ [SUPERMEMORY] Fetched ${memories.length} memories for user ${userId} [${requestId}] (total: ${totalDuration}ms)`
    );
    return Array.isArray(memories) ? memories : [];
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`❌ [SUPERMEMORY] Error fetching memories [${requestId}]`, {
      userId,
      errorMessage: error.message,
      errorName: error.name,
      totalDurationMs: totalDuration,
      errorStack: error.stack?.substring(0, 300),
      timestamp: new Date().toISOString(),
    });
    return [];
  }
}

/**
 * Fetch user memories from Supermemory using list documents API (v3/documents/list)
 * Returns documents with AI-generated summaries
 * @param {string} userId - User ID for container tag isolation
 * @param {number} limit - Maximum number of documents to return (default: 20)
 * @returns {Promise<Array>} - Array of documents with summary field
 */
async function fetchSupermemoryMemoriesList(userId, limit = 20) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, cannot fetch memories"
    );
    return [];
  }

  if (!userId) {
    console.warn("⚠️ [SUPERMEMORY] No userId provided, cannot fetch memories");
    return [];
  }

  try {
    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v3/documents/list`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          containerTags: [`user_${userId}`],
          limit: limit,
        }),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    const result = await response.json();
    // Extract documents from list response
    // Supermemory API returns: { memories: [...], pagination: {...} }
    // Each document/memory includes: id, title, status, type, summary, metadata, containerTags, createdAt, updatedAt
    const documents = result.memories || result.documents || result.data || [];

    // Log full response structure for debugging
    console.log(
      `🔍 [SUPERMEMORY] List API response structure:`,
      JSON.stringify(
        {
          hasMemories: !!result.memories,
          hasDocuments: !!result.documents,
          memoriesCount: result.memories?.length || 0,
          pagination: result.pagination,
        },
        null,
        2
      )
    );

    // Log first document structure for debugging
    if (documents.length > 0) {
      console.log(
        `🔍 [SUPERMEMORY] Sample document structure:`,
        JSON.stringify(documents[0], null, 2)
      );
    }

    console.log(
      `✅ [SUPERMEMORY] Fetched ${documents.length} documents for user ${userId}`
    );
    return Array.isArray(documents) ? documents : [];
  } catch (error) {
    console.error(
      `❌ [SUPERMEMORY] Error fetching documents list:`,
      error.message
    );
    return [];
  }
}

/**
 * Delete (forget) a memory from Supermemory using v4/memories API
 * Soft delete - memory is marked as forgotten but not permanently deleted
 * @param {string} memoryId - Memory ID to delete
 * @param {string} userId - User ID for containerTag
 * @returns {Promise<object>} - Delete result
 */
async function deleteSupermemoryMemory(memoryId, userId) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("Supermemory API key not configured");
  }

  if (!memoryId) {
    throw new Error("memoryId is required");
  }

  if (!userId) {
    throw new Error("userId is required for containerTag");
  }

  try {
    // v4/memories API: DELETE /v4/memories
    // Body contains: containerTag and memoryId to identify which memory to delete
    const requestBody = {
      containerTag: `user_${userId}`,
      id: memoryId, // API uses 'id' field to identify the memory
    };

    const url = `${SUPERMEMORY_BASE_URL}/v4/memories`;
    console.log(`🔍 [SUPERMEMORY] Forgetting (soft delete) memory at: ${url}`);
    console.log(
      `🔍 [SUPERMEMORY] Request body:`,
      JSON.stringify(requestBody, null, 2)
    );

    const response = await fetchWithTimeout(
      url,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error(`❌ [SUPERMEMORY] Delete failed:`, {
        status: response.status,
        statusText: response.statusText,
        errorData,
        url,
        memoryId,
        userId,
        // Helpful for debugging edge cases like 404
        isNotFound: response.status === 404,
      });
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    const result = await response.json();
    console.log(`✅ [SUPERMEMORY] Forgotten (soft deleted) memory ${memoryId}`);
    return { success: true, id: memoryId };
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error deleting memory:`, {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      memoryId,
      userId,
    });
    throw error;
  }
}

/**
 * Update a memory in Supermemory using v4/memories API
 * Creates a new version of the memory (original preserved with isLatest=false)
 * @param {string} memoryId - Memory ID to update
 * @param {object} updateData - Update data with content and optional metadata
 * @param {string} userId - User ID for containerTag
 * @returns {Promise<object>} - Update result
 */
async function updateSupermemoryMemory(memoryId, updateData, userId) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("Supermemory API key not configured");
  }

  if (!memoryId) {
    throw new Error("memoryId is required");
  }

  if (!updateData.content) {
    throw new Error("content is required");
  }

  if (!userId) {
    throw new Error("userId is required for containerTag");
  }

  try {
    // v4/memories API: PATCH /v4/memories
    // Body contains: containerTag, newContent, and memoryId to identify which memory to update
    const requestBody = {
      containerTag: `user_${userId}`,
      newContent: updateData.content,
      id: memoryId, // API uses 'id' field to identify the memory
    };

    const url = `${SUPERMEMORY_BASE_URL}/v4/memories`;
    console.log(`🔍 [SUPERMEMORY] Updating memory at: ${url}`);
    console.log(
      `🔍 [SUPERMEMORY] Request body:`,
      JSON.stringify(requestBody, null, 2)
    );

    const response = await fetchWithTimeout(
      url,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
      SUPERMEMORY_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error(`❌ [SUPERMEMORY] Update failed:`, {
        status: response.status,
        statusText: response.statusText,
        errorData,
        url,
        memoryId,
        userId,
      });
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    const result = await response.json();
    console.log(
      `✅ [SUPERMEMORY] Updated memory ${memoryId} (new version created)`
    );
    return result;
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error updating memory:`, error.message);
    throw error;
  }
}

/**
 * Extract response characteristics from Finny's message
 * Used to learn what users prefer in responses
 * @param {string} finnyResponse - Finny's response text
 * @param {object} messageMetadata - Additional metadata about the message
 * @returns {object} - Extracted characteristics
 */
function extractResponseCharacteristics(finnyResponse, messageMetadata = {}) {
  if (!finnyResponse || typeof finnyResponse !== "string") {
    return {};
  }

  const response = finnyResponse.toLowerCase();
  const length = finnyResponse.length;
  const wordCount = finnyResponse.split(/\s+/).length;

  // Determine response length category
  let messageLength = "medium";
  if (length < 200 || wordCount < 30) {
    messageLength = "short";
  } else if (length > 800 || wordCount > 120) {
    messageLength = "long";
  }

  // Check for examples (common patterns: "for example", "like", "such as", "imagine")
  const hasExamples =
    /for example|for instance|like when|such as|imagine|let's say|suppose/.test(
      response
    );

  // Check for action items (common patterns: "do this", "try", "set up", numbered lists)
  const hasActionItems =
    /do this|try|set up|here's what|action|step|1\.|2\.|3\.|first|second|third/.test(
      response
    );

  // Check for numbers/data (dollar amounts, percentages, dates)
  const hasNumbers = /\$[\d,]+|[\d]+%|\d+\/\d+|\d+ months?|\d+ years?/.test(
    finnyResponse
  );

  // Determine emotional tone
  let emotionalTone = "neutral";
  if (
    /great|awesome|amazing|excellent|fantastic|wonderful|love|excited/.test(
      response
    )
  ) {
    emotionalTone = "encouraging";
  } else if (
    /real|honest|truth|reality|actually|fact|numbers|data/.test(response)
  ) {
    emotionalTone = "matter_of_fact";
  } else if (
    /support|help|here for|with you|together|we'll|let's/.test(response)
  ) {
    emotionalTone = "supportive";
  }

  // Determine response style (conversational, direct, witty)
  // This will be enhanced by checking user's finny_style preference
  let responseStyle = "conversational"; // default
  if (messageMetadata.finny_style) {
    responseStyle = messageMetadata.finny_style;
  } else {
    // Try to infer from response
    if (/here's|the answer|bottom line|facts|data|numbers/.test(response)) {
      responseStyle = "direct";
    } else if (/haha|lol|funny|joke|😄|😂|😅|humor|witty/.test(response)) {
      responseStyle = "witty";
    }
  }

  // Extract topic from response (basic keyword matching)
  const topics = [];
  if (/save|saving|savings|emergency fund/.test(response)) {
    topics.push("savings");
  }
  if (/debt|loan|owe|pay off|credit card/.test(response)) {
    topics.push("debt");
  }
  if (/invest|investment|stocks|portfolio|retirement/.test(response)) {
    topics.push("investment");
  }
  if (/goal|target|plan|dream/.test(response)) {
    topics.push("goal_planning");
  }
  if (/budget|spending|expense|money management/.test(response)) {
    topics.push("budgeting");
  }
  if (topics.length === 0) {
    topics.push("general");
  }

  return {
    messageLength,
    hasExamples,
    hasActionItems,
    hasNumbers,
    emotionalTone,
    responseStyle,
    topics: topics.slice(0, 3), // Limit to top 3 topics
    wordCount,
    characterCount: length,
  };
}

function createEmptyFeedbackPatterns() {
  return {
    responseStyle: {},
    messageLength: {},
    format: {},
    tone: {},
    topics: {},
  };
}

function createEmptyFeedbackResult() {
  return {
    preferences: [],
    patterns: createEmptyFeedbackPatterns(),
    deepInsights: [],
    feedbackCount: 0,
    source: "reports",
  };
}

function normalizeFeedbackReportMetadata(report) {
  const additionalContext =
    report?.additional_context &&
    typeof report.additional_context === "object" &&
    !Array.isArray(report.additional_context)
      ? report.additional_context
      : {};
  const reportedMessageMetadata =
    report?.reported_message_metadata &&
    typeof report.reported_message_metadata === "object" &&
    !Array.isArray(report.reported_message_metadata)
      ? report.reported_message_metadata
      : {};

  return {
    ...additionalContext,
    ...reportedMessageMetadata,
  };
}

function updateTopicPatternCounts(patterns, topics, isPositive) {
  if (!Array.isArray(topics)) return;

  topics.forEach((topic) => {
    if (!topic) return;
    if (!patterns.topics[topic]) {
      patterns.topics[topic] = { positive: 0, negative: 0 };
    }
    if (isPositive) {
      patterns.topics[topic].positive += 1;
    } else {
      patterns.topics[topic].negative += 1;
    }
  });
}

function updatePatternScore(bucket, key, delta) {
  if (!bucket || !key) return;
  bucket[key] = (bucket[key] || 0) + delta;
}

function updateScalarFeedbackPatterns(patterns, characteristics, delta) {
  if (!characteristics || typeof characteristics !== "object") return;

  updatePatternScore(
    patterns.responseStyle,
    characteristics.responseStyle,
    delta
  );
  updatePatternScore(
    patterns.messageLength,
    characteristics.messageLength,
    delta
  );
  updatePatternScore(patterns.tone, characteristics.emotionalTone, delta);

  if (characteristics.hasExamples) {
    updatePatternScore(patterns.format, "examples", delta);
  }
  if (characteristics.hasActionItems) {
    updatePatternScore(patterns.format, "actionItems", delta);
  }
  if (characteristics.hasNumbers) {
    updatePatternScore(patterns.format, "numbers", delta);
  }
}

function pushUniqueFeedbackInsight(insights, seenInsights, insight) {
  if (!insight || seenInsights.has(insight)) return;
  seenInsights.add(insight);
  insights.push(insight);
}

function applyNegativeReportAdjustments(patterns, reportText) {
  if (!reportText) return;
  const reportLower = reportText.toLowerCase();

  if (/too long|lengthy|verbose|wordy/.test(reportLower)) {
    updatePatternScore(patterns.messageLength, "long", -2);
  }

  if (
    /generic|vague|not specific|not personalized|use my data|actual data|real data/.test(
      reportLower
    )
  ) {
    updatePatternScore(patterns.format, "numbers", -1);
    updatePatternScore(patterns.format, "actionItems", -1);
  }

  if (/no example|without example|needs example/.test(reportLower)) {
    updatePatternScore(patterns.format, "examples", -1);
  }

  if (
    /unhelpful|not helpful|useless|doesn't help|no help|no action|not actionable/.test(
      reportLower
    )
  ) {
    updatePatternScore(patterns.format, "actionItems", -2);
  }
}

function deriveNegativeFeedbackInsights(reportText, characteristics = {}) {
  if (!reportText) return [];

  const reportLower = reportText.toLowerCase();
  const insights = [];

  if (/too long|lengthy|verbose|wordy/.test(reportLower)) {
    insights.push("User dislikes responses that are too long.");
  }

  if (
    /generic|vague|not specific|not personalized|use my data|actual data|real data|that's your job/.test(
      reportLower
    )
  ) {
    insights.push(
      "User dislikes generic advice and expects Finny to use their real financial data."
    );
  }

  if (
    /unhelpful|not helpful|useless|doesn't help|no help|what should i do instead/.test(
      reportLower
    )
  ) {
    insights.push(
      "User wants practical, actionable guidance instead of vague advice."
    );
  }

  if (
    /wrong|incorrect|inaccurate|mistake|error|false|made up|hallucinated/.test(
      reportLower
    )
  ) {
    insights.push("User is highly sensitive to inaccurate or invented details.");
  }

  if (/tone|rude|mean|harsh|judgmental|condescending/.test(reportLower)) {
    insights.push("User wants a calm, respectful tone without judgment.");
  }

  if (/confusing|unclear|hard to understand|doesn't make sense/.test(reportLower)) {
    insights.push("User prefers clearer, simpler explanations.");
  }

  if (
    insights.length === 0 &&
    typeof characteristics.messageLength === "string" &&
    characteristics.messageLength === "long"
  ) {
    insights.push("User likely prefers more concise responses.");
  }

  return insights;
}

function derivePositiveFeedbackInsights(characteristics = {}) {
  const insights = [];

  if (characteristics.hasActionItems) {
    insights.push("User responds well to practical, actionable guidance.");
  }
  if (characteristics.hasNumbers) {
    insights.push("User finds responses with concrete numbers or data useful.");
  }
  if (characteristics.hasExamples) {
    insights.push("User appreciates answers that include examples.");
  }
  if (characteristics.responseStyle === "direct") {
    insights.push("User responds well to direct communication.");
  }

  return insights;
}

function buildFeedbackPreferences(patterns, currentTopic = null) {
  const preferences = [];

  const styleCounts = Object.entries(patterns.responseStyle)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (styleCounts.length > 0) {
    const [style, count] = styleCounts[0];
    preferences.push(
      `Response style: User prefers ${style} communication style (${count} positive feedback)`
    );
  }

  const lengthCounts = Object.entries(patterns.messageLength)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (lengthCounts.length > 0) {
    const [length, count] = lengthCounts[0];
    preferences.push(
      `Message length: User prefers ${length} responses (${count} positive feedback)`
    );
  }

  if ((patterns.format.examples || 0) > 0) {
    preferences.push(
      `Format: User appreciates responses with examples (${patterns.format.examples} positive feedback)`
    );
  }
  if ((patterns.format.actionItems || 0) > 0) {
    preferences.push(
      `Format: User values actionable responses with clear steps (${patterns.format.actionItems} positive feedback)`
    );
  }
  if ((patterns.format.numbers || 0) > 0) {
    preferences.push(
      `Format: User finds responses with numbers/data helpful (${patterns.format.numbers} positive feedback)`
    );
  }

  const toneCounts = Object.entries(patterns.tone)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (toneCounts.length > 0) {
    const [tone, count] = toneCounts[0];
    preferences.push(
      `Tone: User prefers ${tone} tone in responses (${count} positive feedback)`
    );
  }

  const topicPreferences = Object.entries(patterns.topics)
    .filter(([, counts]) => counts.positive > counts.negative)
    .map(([topic, counts]) => ({
      topic,
      strength: counts.positive - counts.negative,
    }))
    .sort((a, b) => {
      if (currentTopic) {
        const aMatches = a.topic === currentTopic ? 1 : 0;
        const bMatches = b.topic === currentTopic ? 1 : 0;
        if (aMatches !== bMatches) return bMatches - aMatches;
      }
      return b.strength - a.strength;
    })
    .slice(0, 3);

  topicPreferences.forEach(({ topic, strength }) => {
    preferences.push(
      `Topic-specific: User prefers detailed responses about ${topic} (${strength} feedback difference)`
    );
  });

  return preferences;
}

/**
 * Retrieve feedback patterns from reports to adapt responses
 * @param {string} userId - User ID
 * @param {string} currentTopic - Current conversation topic (optional)
 * @returns {Promise<object>} - Feedback patterns and preferences
 */
async function retrieveFeedbackPatterns(userId, currentTopic = null) {
  if (!userId) {
    return createEmptyFeedbackResult();
  }

  const cached = getCachedFeedbackPatterns(userId);
  if (cached) {
    console.log(
      `⚡ [FEEDBACK_CACHE] Using cached feedback patterns for user: ${userId}`
    );
    return cached;
  }

  try {
    const { data: reports, error } = await supabase
      .from("reports")
      .select(
        "report_type, report_text, reported_message_content, reported_message_metadata, additional_context, created_at, reported_message_sender"
      )
      .eq("user_id", userId)
      .or("reported_message_sender.eq.finny,reported_message_sender.is.null")
      .in("report_type", ["chat_message", "love_it"])
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(error.message);
    }

    const safeReports = Array.isArray(reports) ? reports : [];
    const patterns = createEmptyFeedbackPatterns();
    const deepInsights = [];
    const seenInsights = new Set();

    safeReports.forEach((report) => {
      const isPositive = report.report_type === "love_it";
      const delta = isPositive ? 1 : -1;
      const metadata = normalizeFeedbackReportMetadata(report);
      const finnyResponse =
        typeof report.reported_message_content === "string"
          ? report.reported_message_content
          : "";
      const reportText =
        typeof report.report_text === "string" ? report.report_text.trim() : "";

      const characteristics = extractResponseCharacteristics(
        finnyResponse,
        metadata
      );

      updateScalarFeedbackPatterns(patterns, characteristics, delta);
      updateTopicPatternCounts(
        patterns,
        characteristics.topics,
        isPositive
      );

      if (isPositive) {
        derivePositiveFeedbackInsights(characteristics).forEach((insight) => {
          pushUniqueFeedbackInsight(deepInsights, seenInsights, insight);
        });
      } else {
        applyNegativeReportAdjustments(patterns, reportText);
        deriveNegativeFeedbackInsights(reportText, characteristics).forEach(
          (insight) => {
            pushUniqueFeedbackInsight(deepInsights, seenInsights, insight);
          }
        );
      }
    });

    const preferences = buildFeedbackPreferences(patterns, currentTopic);

    console.log(
      `✅ [FEEDBACK_PATTERNS] Retrieved ${safeReports.length} reports → ${preferences.length} preferences, ${deepInsights.length} deep insights`
    );

    const result = {
      preferences,
      patterns,
      deepInsights,
      feedbackCount: safeReports.length,
      source: "reports",
    };

    setCachedFeedbackPatterns(userId, result);
    return result;
  } catch (error) {
    console.error(
      `❌ [FEEDBACK_PATTERNS] Error retrieving feedback patterns:`,
      error.message
    );
    const emptyResult = createEmptyFeedbackResult();
    setCachedFeedbackPatterns(userId, emptyResult);
    return emptyResult;
  }
}

/**
 * Build feedback context string for system prompt
 * Prioritizes deep understanding of user thinking and preferences
 * @param {object} feedbackData - Feedback patterns from retrieveFeedbackPatterns
 * @returns {string} - Formatted context string for prompt
 */
function buildFeedbackContext(feedbackData) {
  // Return null only if both preferences and deepInsights are empty
  // Deep insights are valuable even without explicit preferences
  if (
    !feedbackData ||
    (feedbackData.preferences.length === 0 &&
      (!feedbackData.deepInsights || feedbackData.deepInsights.length === 0))
  ) {
    return null;
  }

  const sections = [];

  // Deep insights section (highest priority - what user thinks/feels)
  if (feedbackData.deepInsights && feedbackData.deepInsights.length > 0) {
    sections.push("## Deep Understanding of User's Thinking:");
    feedbackData.deepInsights.forEach((insight, idx) => {
      sections.push(`${idx + 1}. ${insight}`);
    });
    sections.push(""); // Empty line
  }

  // Response preferences (what works for this user)
  if (feedbackData.preferences.length > 0) {
    sections.push("## User's Response Preferences (from feedback):");
    feedbackData.preferences.forEach((pref, idx) => {
      sections.push(`${idx + 1}. ${pref}`);
    });
    sections.push(""); // Empty line
  }

  // Instructions for adaptation
  sections.push("## Adaptation Instructions:");
  sections.push("- Prioritize these preferences when generating your response");
  sections.push("- Match the user's preferred style, length, format, and tone");
  sections.push(
    "- Pay special attention to the deep insights about what the user thinks and values"
  );
  sections.push(
    "- If preferences conflict with the current request, prioritize user preferences"
  );

  return sections.join("\n");
}

// === SUPERMEMORY DOCUMENTS CACHE FUNCTIONS ===

/**
 * Invalidate cache for user's Supermemory documents
 * Called after new memory is created to ensure fresh data on next fetch
 */
async function invalidateSupermemoryDocumentsCache(userId) {
  if (!userId) return;

  try {
    const { error } = await supabase
      .from("supermemory_documents")
      .update({ cache_invalidated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("cache_invalidated_at", null); // Only update if not already invalidated

    if (error) {
      console.warn(
        `⚠️ [CACHE] Failed to invalidate cache for user ${userId}:`,
        error.message
      );
    } else {
      console.log(
        `✅ [CACHE] Invalidated supermemory documents cache for user ${userId}`
      );
    }
  } catch (error) {
    console.warn(`⚠️ [CACHE] Error invalidating cache:`, error.message);
  }
}

/**
 * Cache Supermemory memories to database
 * Stores memories returned from v4/search endpoint
 */
async function cacheSupermemoryDocuments(userId, memories) {
  if (!userId || !Array.isArray(memories) || memories.length === 0) {
    return;
  }

  try {
    const documentsToUpsert = memories
      .map((memory) => {
        // Extract document info (v4/search returns results with documents array)
        const document = memory.documents?.[0] || {};
        const memoryId = memory.id || memory.memory_id || document.id;
        const documentId = document.id || memoryId;

        if (!memoryId || !documentId) {
          console.warn(`⚠️ [CACHE] Skipping memory without ID:`, memory);
          return null;
        }

        return {
          user_id: userId,
          memory_id: memoryId,
          memory_content: memory.memory || memory.content || null,
          document_id: documentId,
          document_title: document.title || null,
          document_summary: document.summary || null,
          metadata: memory.metadata || {},
          updated_at:
            memory.updatedAt || document.updatedAt || new Date().toISOString(),
          created_at:
            memory.createdAt || document.createdAt || new Date().toISOString(),
          synced_at: new Date().toISOString(),
          cache_invalidated_at: null, // Mark as valid after sync
        };
      })
      .filter(Boolean); // Remove null entries

    if (documentsToUpsert.length === 0) {
      return;
    }

    // Upsert documents (update if exists, insert if not)
    // Use the unique constraint on (user_id, memory_id)
    const { error } = await supabase
      .from("supermemory_documents")
      .upsert(documentsToUpsert, {
        onConflict: "user_id,memory_id", // Matches UNIQUE constraint
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(
        `❌ [CACHE] Failed to cache documents for user ${userId}:`,
        error.message
      );
    } else {
      console.log(
        `✅ [CACHE] Cached ${documentsToUpsert.length} documents for user ${userId}`
      );
    }
  } catch (error) {
    console.error(`❌ [CACHE] Error caching documents:`, error.message);
  }
}

/**
 * Get cached Supermemory documents from database
 * Returns null if cache is invalid or empty
 */
async function getCachedSupermemoryDocuments(userId) {
  if (!userId) return null;

  try {
    // Get valid cached documents (cache_invalidated_at IS NULL)
    const { data, error } = await supabase
      .from("supermemory_documents")
      .select("*")
      .eq("user_id", userId)
      .is("cache_invalidated_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn(`⚠️ [CACHE] Failed to get cached documents:`, error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // Transform DB records back to Supermemory API format
    const memories = data.map((doc) => ({
      id: doc.memory_id,
      memory: doc.memory_content,
      updatedAt: doc.updated_at,
      createdAt: doc.created_at,
      documents: [
        {
          id: doc.document_id,
          title: doc.document_title,
          summary: doc.document_summary,
          updatedAt: doc.updated_at,
          createdAt: doc.created_at,
        },
      ],
      metadata: doc.metadata || {},
    }));

    console.log(
      `✅ [CACHE] Retrieved ${memories.length} cached documents for user ${userId}`
    );
    return memories;
  } catch (error) {
    console.warn(`⚠️ [CACHE] Error getting cached documents:`, error.message);
    return null;
  }
}

/**
 * Delete cached document from database (when user deletes memory)
 */
async function deleteCachedSupermemoryDocument(userId, memoryId) {
  if (!userId || !memoryId) return;

  try {
    const { error } = await supabase
      .from("supermemory_documents")
      .delete()
      .eq("user_id", userId)
      .eq("memory_id", memoryId);

    if (error) {
      console.warn(
        `⚠️ [CACHE] Failed to delete cached document:`,
        error.message
      );
    } else {
      console.log(
        `✅ [CACHE] Deleted cached document ${memoryId} for user ${userId}`
      );
    }
  } catch (error) {
    console.warn(`⚠️ [CACHE] Error deleting cached document:`, error.message);
  }
}

/**
 * Update cached document in database (when user edits memory)
 */
async function updateCachedSupermemoryDocument(userId, memoryId, updates) {
  if (!userId || !memoryId) return;

  try {
    const updateData = {
      synced_at: new Date().toISOString(),
      cache_invalidated_at: null, // Mark as valid after update
    };

    // Update memory content if provided
    if (updates.content !== undefined) {
      updateData.memory_content = updates.content;
    }

    // Update document fields if provided
    if (updates.document_title !== undefined) {
      updateData.document_title = updates.document_title;
    }
    if (updates.document_summary !== undefined) {
      updateData.document_summary = updates.document_summary;
    }
    if (updates.updated_at !== undefined) {
      updateData.updated_at = updates.updated_at;
    }

    const { error } = await supabase
      .from("supermemory_documents")
      .update(updateData)
      .eq("user_id", userId)
      .eq("memory_id", memoryId);

    if (error) {
      console.warn(
        `⚠️ [CACHE] Failed to update cached document:`,
        error.message
      );
    } else {
      console.log(
        `✅ [CACHE] Updated cached document ${memoryId} for user ${userId}`
      );
    }
  } catch (error) {
    console.warn(`⚠️ [CACHE] Error updating cached document:`, error.message);
  }
}

// Export all functions
export {
  getSessionState,
  setSessionState,
  mergeSessionState,
  getRecentConversationTurns,
  appendConversationTurns,
  getCachedProfile,
  setCachedProfile,
  invalidateProfileCache,
  loadUserMemory,
  loadUserProfile,
  isSensitiveData,
  getExpiryDate,
  storeOnboardingMemory,
  retrieveFeedbackPatterns,
  buildFeedbackContext,
  searchSupermemoryMemories,
  fetchSupermemoryProfile,
  fetchSupermemoryMemoriesList,
  fetchSupermemoryMemories,
  deleteSupermemoryMemory,
  updateSupermemoryMemory,
  loadUserMemoryWithTimeout,
  fetchSupermemoryProfileWithTimeout,
  invalidateSupermemoryDocumentsCache,
  cacheSupermemoryDocuments,
  getCachedSupermemoryDocuments,
  deleteCachedSupermemoryDocument,
  updateCachedSupermemoryDocument,
};
