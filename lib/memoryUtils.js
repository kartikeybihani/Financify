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
  const current = getSessionState(userId);
  setSessionState(userId, { ...current, ...(partial || {}) });
}

// === CONVERSATION CONTEXT FUNCTIONS (Supabase-backed) ===

// Load conversation context from Supabase
async function getConversationContext(userId, chatId) {
  if (!userId || !chatId) {
    console.log("⚠️ [CONVERSATION] Missing userId or chatId");
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("conversation_context")
      .select("*")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found - this is normal for new conversations
        return null;
      }
      console.error("❌ [CONVERSATION] Error loading context:", error);
      return null;
    }
    return {
      last_messages: data.last_messages || [],
      pending_action: data.pending_action || null,
      pending_action_payload: data.pending_action_payload || {},
      active_topic: data.active_topic || null,
      last_entity: data.last_entity || {},
    };
  } catch (e) {
    console.error("❌ [CONVERSATION] Unexpected error loading context:", e);
    return null;
  }
}

// Save/update conversation context to Supabase
async function saveConversationContext(userId, chatId, context) {
  if (!userId || !chatId) {
    console.log("⚠️ [CONVERSATION] Cannot save - missing userId or chatId");
    return;
  }

  try {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now

    const contextRow = {
      user_id: userId,
      chat_id: chatId,
      last_messages: context.last_messages || [],
      pending_action: context.pending_action || null,
      pending_action_payload: context.pending_action_payload || {},
      active_topic: context.active_topic || null,
      last_entity: context.last_entity || {},
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    };

    const { error } = await supabase
      .from("conversation_context")
      .upsert(contextRow, {
        onConflict: "chat_id",
      });

    if (error) {
      console.error("❌ [CONVERSATION] Error saving context:", error);
      return;
    }
  } catch (e) {
    console.error("❌ [CONVERSATION] Unexpected error saving context:", e);
  }
}

// Update conversation context after each exchange
async function updateConversationContext(
  userId,
  chatId,
  userMessage,
  finnyResponse,
  metadata = {}
) {
  if (!userId || !chatId) return;

  try {
    // Load existing context
    const existingContext =
      (await getConversationContext(userId, chatId)) || {};

    // Add new messages (keep last 5 exchanges = 10 messages)
    const messages = existingContext.last_messages || [];
    messages.push(
      { role: "user", text: userMessage, timestamp: Date.now() },
      { role: "assistant", text: finnyResponse, timestamp: Date.now() }
    );

    // Keep only last 10 messages (5 exchanges)
    const updatedMessages = messages.slice(-10);

    // Merge with new metadata
    const updatedContext = {
      last_messages: updatedMessages,
      pending_action:
        metadata.pending_action !== undefined
          ? metadata.pending_action
          : existingContext.pending_action,
      pending_action_payload:
        metadata.pending_action_payload ||
        existingContext.pending_action_payload ||
        {},
      active_topic: metadata.active_topic || existingContext.active_topic,
      last_entity: metadata.last_entity || existingContext.last_entity || {},
    };

    await saveConversationContext(userId, chatId, updatedContext);
  } catch (e) {
    console.error("❌ [CONVERSATION] Error updating context:", e);
  }
}

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
const SUPERMEMORY_FETCH_TIMEOUT_MS = 15000; // 15 seconds timeout for API calls (increased from 5s to handle slow API responses)

/**
 * Fetch with timeout wrapper to prevent hanging requests
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = SUPERMEMORY_FETCH_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
}

/**
 * Store a conversation memory in Supermemory
 * @param {string} userId - User ID for container tag isolation
 * @param {string} userMessage - User's message
 * @param {string} finnyResponse - Finny's response
 * @param {object} metadata - Additional metadata (optional, can include userName)
 * @returns {Promise<object>} - Supermemory API response
 */
async function storeConversationMemory(
  userId,
  userMessage,
  finnyResponse,
  metadata = {}
) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, skipping memory storage"
    );
    return null;
  }

  if (!userId) {
    console.warn(
      "⚠️ [SUPERMEMORY] No userId provided, skipping memory storage"
    );
    return null;
  }

  // Skip memory storage for prebuild_context actions
  // Check metadata for action or skip flag
  if (
    metadata?.action === "prebuild_context" ||
    metadata?.skipStorage === true ||
    metadata?.intent === "prebuild_context"
  ) {
    console.log(
      "⏭️ [SUPERMEMORY] Skipping memory storage for prebuild_context action"
    );
    return null;
  }

  // Skip if no user message (prebuild_context doesn't have user messages)
  if (!userMessage || userMessage.trim() === "") {
    console.log(
      "⏭️ [SUPERMEMORY] Skipping memory storage - no user message provided"
    );
    return null;
  }

  // Build rich memory content from conversation
  // Extract userName from metadata if provided, otherwise will use userId as fallback
  const userName = metadata?.userName || metadata?.name || null;
  const memoryContent = buildSupermemoryContent(
    userMessage,
    finnyResponse,
    userName,
    userId
  );

  // Build metadata with financial context
  const memoryMetadata = buildSupermemoryMetadata(
    userId,
    userMessage,
    finnyResponse,
    metadata
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

  // Retry configuration
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
        `✅ [SUPERMEMORY] Stored memory for user ${userId}${
          attempt > 0
            ? ` (after ${attempt} retry${attempt > 1 ? "ies" : ""})`
            : ""
        }: ${result.id || "success"}`
      );
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
        // Only log as warning for network errors (likely from previous requests)
        // to avoid cluttering logs during prebuild_context requests
        const isNetworkError =
          error.message?.includes("fetch failed") ||
          error.message?.includes("network") ||
          error.message?.includes("ECONNRESET") ||
          error.message?.includes("ETIMEDOUT");

        if (isNetworkError) {
          // Log as debug/warning for network errors (likely from async callbacks from previous requests)
          console.warn(
            `⚠️ [SUPERMEMORY] Memory storage failed${
              isLastAttempt ? ` (after ${MAX_RETRIES} retries)` : ""
            } (network error, likely from previous request):`,
            error.message
          );
        } else {
          // Log as error for other types of failures
          console.error(
            `❌ [SUPERMEMORY] Error storing memory${
              isLastAttempt ? ` (after ${MAX_RETRIES} retries)` : ""
            }:`,
            error.message
          );
        }
        // Don't throw - memory storage failures shouldn't break conversation flow
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
        `⚠️ [SUPERMEMORY] Memory storage failed (attempt ${attempt + 1}/${
          MAX_RETRIES + 1
        }), retrying in ${Math.round(delay)}ms:`,
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

  // Retry configuration (same as storeConversationMemory)
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
 * Build rich memory content from conversation
 * @param {string} userMessage - User's message
 * @param {string} finnyResponse - Finny's response
 * @param {string} userName - User's name (first_name + last_name or first_name or null)
 * @param {string} userId - User ID for fallback
 * @returns {string} - Formatted memory content
 */
function buildSupermemoryContent(
  userMessage,
  finnyResponse,
  userName = null,
  userId = null
) {
  const parts = [];

  // Use user's name if available, otherwise use "User" with ID
  const userIdentifier = userName
    ? userName
    : userId
    ? `User (${userId})`
    : "User";

  // User's message context
  parts.push(`${userIdentifier} said: "${userMessage}"`);

  // Finny's response summary (increased to 2000 characters)
  parts.push(
    `Finny responded: ${finnyResponse.substring(0, 2000)}${
      finnyResponse.length > 2000 ? "..." : ""
    }`
  );

  return parts.join("\n\n");
}

/**
 * Build metadata for memory storage
 * @param {string} userId - User ID
 * @param {string} userMessage - User's message
 * @param {string} finnyResponse - Finny's response
 * @param {object} additionalMetadata - Additional metadata to include
 * @returns {object} - Metadata object
 */
function buildSupermemoryMetadata(
  userId,
  userMessage,
  finnyResponse,
  additionalMetadata = {}
) {
  const tags = extractSupermemoryFinancialTags(userMessage);
  const contextType = determineSupermemoryContextType(userMessage);
  const financialRelevance =
    determineSupermemoryFinancialRelevance(userMessage);

  return {
    user_id: userId,
    timestamp: new Date().toISOString(),
    context_type: contextType,
    financial_relevance: financialRelevance,
    tags: tags,
    emotional_state: extractSupermemoryEmotionalState(userMessage),
    financial_impact: assessSupermemoryFinancialImpact(userMessage),
    ...additionalMetadata,
  };
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

/**
 * Determine context type from message
 * @param {string} message - User message
 * @returns {string} - Context type
 */
function determineSupermemoryContextType(message) {
  const lower = message.toLowerCase();

  if (/goal|want|plan|dream|target/.test(lower)) return "goal";
  if (/debt|loan|owe|pay off/.test(lower)) return "constraint";
  if (/job|work|salary|income|raise|promotion/.test(lower)) return "life_event";
  if (/prefer|like|don't like|hate|love/.test(lower)) return "preference";
  if (/buy|purchase|afford|can i/.test(lower)) return "decision";

  return "general";
}

/**
 * Determine financial relevance
 * @param {string} message - User message
 * @returns {string} - Relevance level (high|medium|low)
 */
function determineSupermemoryFinancialRelevance(message) {
  const lower = message.toLowerCase();
  const highRelevance =
    /money|afford|budget|save|invest|debt|income|salary|spend|expense|goal|financial/.test(
      lower
    );
  return highRelevance ? "high" : "medium";
}

/**
 * Extract emotional state from message
 * @param {string} message - User message
 * @returns {string} - Emotional state
 */
function extractSupermemoryEmotionalState(message) {
  const lower = message.toLowerCase();
  if (/stressed|worried|anxious|overwhelmed|scared|fear/.test(lower))
    return "anxious";
  if (/excited|happy|great|awesome|amazing|love/.test(lower)) return "excited";
  if (/confused|don't understand|unclear|unsure|don't know/.test(lower))
    return "confused";
  if (/confident|sure|certain|know|understand/.test(lower)) return "confident";
  return "neutral";
}

/**
 * Assess financial impact of conversation
 * @param {string} message - User message
 * @returns {string} - Impact level (high|medium|low)
 */
function assessSupermemoryFinancialImpact(message) {
  const hasAmounts = /\$[\d,]+/.test(message);
  const hasTimelines = /\d+\s*(month|year|week)/.test(message);
  const hasGoals = /goal|target|plan|want/.test(message.toLowerCase());

  if (hasAmounts && hasTimelines && hasGoals) return "high";
  if (hasAmounts || hasGoals) return "medium";
  return "low";
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
        "first_name, last_name, age, occupation, finny_style, intent_q1, intent_q2, intent_q3"
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

    const result = {
      name,
      age: profile?.age || null,
      occupation: profile?.occupation || null,
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
      `${SUPERMEMORY_BASE_URL}/v4/profile?containerTag=user_${userId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
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

  const { limit = 15, threshold = 0.3 } = options;

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

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after") || "60";
        console.warn(
          `⚠️ [SUPERMEMORY] Rate limit exceeded, retry after ${retryAfter}s`
        );
        // Return empty array - caller can retry later
        return [];
      }

      // Handle other errors
      console.error(
        `❌ [SUPERMEMORY] Search API error: ${
          errorData.message || errorData.error?.message || response.statusText
        } (${response.status})`
      );
      // Don't throw - return empty array for graceful degradation
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
        typeof memories
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
        50
      )}...", avg similarity: ${avgSimilarity.toFixed(2)}, timing: ${
        result.timing || "N/A"
      }ms)`
    );

    return memories;
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error searching memories:`, error.message);
    // Return empty array for graceful degradation
    return [];
  }
}

/**
 * Fetch user memories from Supermemory using search API
 * Returns all memory documents for edit/delete functionality
 * @param {string} userId - User ID for container tag isolation
 * @returns {Promise<Array>} - Array of user memories/documents
 */
async function fetchSupermemoryMemories(userId) {
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
    // Use search API with a broad query to get all user memories
    // Search for any content to retrieve all memories for the user
    const response = await fetchWithTimeout(
      `${SUPERMEMORY_BASE_URL}/v4/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: "*", // Broad query to get all memories
          limit: 100, // Get up to 100 memories
          threshold: 0.0, // Low threshold to get all results
          rerank: false,
          rewriteQuery: false,
          include: {
            documents: true,
            summaries: false,
          },
          containerTag: `user_${userId}`, // v4 API uses singular containerTag
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
    // Extract memories from search results
    // Supermemory v4/search returns: { results: [...], timing, total }
    // Each result contains: id, memory, metadata, updatedAt, documents, chunks, etc.
    const memories = result.results || result.documents || result.data || [];

    // Log first memory structure for debugging
    if (memories.length > 0) {
      console.log(
        `🔍 [SUPERMEMORY] Sample memory structure:`,
        JSON.stringify(memories[0], null, 2)
      );
    }

    console.log(
      `✅ [SUPERMEMORY] Fetched ${memories.length} memories for user ${userId}`
    );
    return Array.isArray(memories) ? memories : [];
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error fetching memories:`, error.message);
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
 * Delete a memory from Supermemory
 * @param {string} documentId - Document ID to delete (use document ID, not memory ID)
 * @returns {Promise<object>} - Delete result
 */
async function deleteSupermemoryMemory(documentId) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("Supermemory API key not configured");
  }

  if (!documentId) {
    throw new Error("documentId is required");
  }

  try {
    // Correct endpoint: DELETE /v3/documents/{id}
    const url = `${SUPERMEMORY_BASE_URL}/v3/documents/${documentId}`;
    console.log(`🔍 [SUPERMEMORY] Deleting document at: ${url}`);

    const response = await fetchWithTimeout(
      url,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
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
        documentId,
        // Helpful for debugging edge cases like 404
        isNotFound: response.status === 404,
      });
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    console.log(`✅ [SUPERMEMORY] Deleted document ${documentId}`);
    return { success: true, id: documentId };
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error deleting document:`, {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      documentId,
    });
    throw error;
  }
}

/**
 * Update a memory in Supermemory
 * @param {string} documentId - Document ID to update (use document ID, not memory ID)
 * @param {object} updateData - Update data with content and optional metadata
 * @returns {Promise<object>} - Update result
 */
async function updateSupermemoryMemory(documentId, updateData) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("Supermemory API key not configured");
  }

  if (!documentId) {
    throw new Error("documentId is required");
  }

  if (!updateData.content) {
    throw new Error("content is required");
  }

  try {
    // Filter out null, undefined, empty objects, and nested objects
    const cleanedMetadata = updateData.metadata
      ? Object.fromEntries(
          Object.entries(updateData.metadata).filter(([key, value]) => {
            if (value === null || value === undefined) return false;
            if (typeof value === "object" && !Array.isArray(value))
              return false;
            if (Array.isArray(value) && value.length === 0) return false;
            return true;
          })
        )
      : {};

    const requestBody = {
      content: updateData.content,
      ...(Object.keys(cleanedMetadata).length > 0 && {
        metadata: cleanedMetadata,
      }),
    };

    // Correct endpoint: PATCH /v3/documents/{id}
    const url = `${SUPERMEMORY_BASE_URL}/v3/documents/${documentId}`;
    console.log(`🔍 [SUPERMEMORY] Updating document at: ${url}`);
    console.log(
      `🔍 [SUPERMEMORY] Request body:`,
      JSON.stringify(requestBody, null, 2)
    );

    const response = await fetchWithTimeout(
      url,
      {
        method: "PATCH", // Use PATCH, not PUT
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
        documentId,
      });
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    const result = await response.json();
    console.log(`✅ [SUPERMEMORY] Updated document ${documentId}`);
    return result;
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error updating document:`, error.message);
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

/**
 * Store message feedback (like/dislike) in Supermemory
 * This learns what users prefer in Finny's responses
 * @param {string} userId - User ID for container tag isolation
 * @param {string} messageId - Message ID
 * @param {string} feedbackType - "positive" or "negative"
 * @param {string} finnyResponse - Finny's response that was liked/disliked
 * @param {string} userMessage - User's original message that prompted the response
 * @param {object} messageMetadata - Additional metadata (messageType, hasActions, hasGoalOffer, finny_style, userName, etc.)
 * @param {string} reportText - Optional report text for negative feedback
 * @returns {Promise<object>} - Supermemory API response
 */
async function storeMessageFeedback(
  userId,
  messageId,
  feedbackType,
  finnyResponse,
  userMessage,
  messageMetadata = {},
  reportText = null
) {
  if (!SUPERMEMORY_API_KEY) {
    console.warn(
      "⚠️ [SUPERMEMORY] API key not configured, skipping feedback storage"
    );
    return null;
  }

  if (!userId) {
    console.warn(
      "⚠️ [SUPERMEMORY] No userId provided, skipping feedback storage"
    );
    return null;
  }

  if (!finnyResponse || !userMessage) {
    console.warn(
      "⚠️ [SUPERMEMORY] Missing finnyResponse or userMessage, skipping feedback storage"
    );
    return null;
  }

  // Extract response characteristics
  const characteristics = extractResponseCharacteristics(
    finnyResponse,
    messageMetadata
  );

  // Get user's name from metadata if available
  const userName = messageMetadata?.userName || messageMetadata?.name || null;
  const userIdentifier = userName
    ? userName
    : userId
    ? `User (${userId})`
    : "User";

  // Build memory content
  const contentParts = [];
  if (feedbackType === "positive") {
    contentParts.push(
      `${userIdentifier} liked Finny's response about ${characteristics.topics.join(
        ", "
      )}.`
    );
    // Store full Finny response - no truncation for feedback (critical for learning)
    contentParts.push(`Finny's response was: "${finnyResponse}"`);
    contentParts.push(`${userIdentifier}'s question was: "${userMessage}"`);
  } else {
    contentParts.push(
      `${userIdentifier} disliked Finny's response about ${characteristics.topics.join(
        ", "
      )}.`
    );
    // Store full Finny response - no truncation for feedback (critical for learning)
    contentParts.push(`Finny's response was: "${finnyResponse}"`);
    if (reportText) {
      contentParts.push(`${userIdentifier} reported: "${reportText}"`);

      // Extract detailed feedback summary (1-2 lines focusing on what was disliked)
      let feedbackSummary = "";
      const reportLower = reportText.toLowerCase();

      // Extract key concerns from report text
      if (/too long|lengthy|verbose|wordy/.test(reportLower)) {
        feedbackSummary = `Feedback summary: ${userIdentifier} found the response too long or verbose. They prefer more concise, direct answers.`;
      } else if (
        /wrong|incorrect|inaccurate|mistake|error|false/.test(reportLower)
      ) {
        feedbackSummary = `Feedback summary: ${userIdentifier} reported incorrect or inaccurate information in Finny's response. Accuracy is critical for this user.`;
      } else if (
        /unhelpful|not helpful|useless|doesn't help|no help/.test(reportLower)
      ) {
        feedbackSummary = `Feedback summary: ${userIdentifier} found the response unhelpful or lacking actionable guidance. They value practical, actionable advice.`;
      } else if (
        /tone|rude|mean|harsh|judgmental|condescending/.test(reportLower)
      ) {
        feedbackSummary = `Feedback summary: ${userIdentifier} disliked the tone of the response - found it ${
          /rude|mean|harsh|judgmental/.test(reportLower)
            ? "too harsh or judgmental"
            : "inappropriate"
        }. They prefer a more supportive, non-judgmental tone.`;
      } else if (
        /confusing|unclear|hard to understand|doesn't make sense/.test(
          reportLower
        )
      ) {
        feedbackSummary = `Feedback summary: ${userIdentifier} found the response confusing or unclear. They need clearer explanations and simpler language.`;
      } else if (
        /missing|doesn't have|not included|left out/.test(reportLower)
      ) {
        feedbackSummary = `Feedback summary: ${userIdentifier} noted missing information or incomplete details in the response. They expect comprehensive answers.`;
      } else {
        // Generic but detailed summary based on report text
        const keyPoints = reportText
          .split(/[.,;]/)
          .filter((s) => s.trim().length > 10)
          .slice(0, 2);
        if (keyPoints.length > 0) {
          feedbackSummary = `Feedback summary: ${userIdentifier} expressed concern about: "${keyPoints
            .join("; ")
            .trim()}". This indicates specific aspects of Finny's response that need improvement.`;
        } else {
          feedbackSummary = `Feedback summary: ${userIdentifier} reported: "${reportText}". This feedback highlights what should be avoided or improved in future responses from Finny.`;
        }
      }

      // Add detailed feedback-focused line
      contentParts.push(feedbackSummary);
    }
    // User's message at the end for negative feedback (as requested)
    contentParts.push(`${userIdentifier}'s question was: "${userMessage}"`);
  }

  const memoryContent = contentParts.join("\n\n");

  // Build metadata
  const tags = ["response_preference", "style_learning", "feedback"];
  if (characteristics.topics.length > 0) {
    tags.push(...characteristics.topics.map((t) => `topic_${t}`));
  }
  if (feedbackType === "negative") {
    tags.push("negative_feedback");
  } else {
    tags.push("positive_feedback");
  }

  const metadata = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    memory_type: "message_feedback",
    feedback_type: feedbackType,
    message_id: messageId,
    source: "chat_feedback",
    // Response characteristics
    response_style: characteristics.responseStyle,
    message_length: characteristics.messageLength,
    has_examples: characteristics.hasExamples,
    has_action_items: characteristics.hasActionItems,
    has_numbers: characteristics.hasNumbers,
    emotional_tone: characteristics.emotionalTone,
    topics: characteristics.topics,
    // Additional context
    message_type: messageMetadata.messageType || "text",
    has_actions: messageMetadata.hasActions || false,
    has_goal_offer: messageMetadata.hasGoalOffer || false,
    tags: tags,
    financial_relevance: "medium", // Feedback is about response quality, not financial content
    context_type: "preference",
  };

  // Add reported issue for negative feedback
  if (feedbackType === "negative" && reportText) {
    // Try to categorize the issue
    const reportLower = reportText.toLowerCase();
    if (/wrong|incorrect|inaccurate|mistake|error|false/.test(reportLower)) {
      metadata.reported_issue = "inaccurate";
    } else if (/unhelpful|not helpful|useless|doesn't help/.test(reportLower)) {
      metadata.reported_issue = "unhelpful";
    } else if (/too long|too much|lengthy|verbose/.test(reportLower)) {
      metadata.reported_issue = "too_long";
    } else if (/tone|rude|mean|harsh|judgmental/.test(reportLower)) {
      metadata.reported_issue = "wrong_tone";
    } else {
      metadata.reported_issue = "other";
    }
  }

  // Filter out null, undefined, empty objects, and nested objects
  const cleanedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => {
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

  // Log what we're storing for debugging
  console.log(
    `💾 [FEEDBACK_STORAGE] Storing ${feedbackType} feedback:`,
    JSON.stringify(
      {
        memory_type: cleanedMetadata.memory_type,
        feedback_type: cleanedMetadata.feedback_type,
        tags: cleanedMetadata.tags,
        response_style: cleanedMetadata.response_style,
        message_length: cleanedMetadata.message_length,
        topics: cleanedMetadata.topics,
        contentLength: memoryContent.length,
        contentPreview: memoryContent.substring(0, 200) + "...",
      },
      null,
      2
    )
  );

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
      throw new Error(
        `Supermemory API error: ${errorData.message || response.statusText} (${
          response.status
        })`
      );
    }

    const result = await response.json();
    console.log(
      `✅ [SUPERMEMORY] Stored ${feedbackType} feedback for user ${userId}: ${
        result.id || "success"
      }`
    );
    console.log(
      `💾 [FEEDBACK_STORAGE] Storage successful - document ID: ${
        result.id || result.documentId || "unknown"
      }`
    );
    return result;
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error storing feedback:`, error.message);
    // Don't throw - feedback storage failures shouldn't break user experience
    return null;
  }
}

/**
 * Retrieve feedback patterns from Supermemory to adapt responses
 * Prioritizes deep understanding of user preferences and thinking
 * @param {string} userId - User ID for container tag isolation
 * @param {string} currentTopic - Current conversation topic (optional, for topic-specific preferences)
 * @returns {Promise<object>} - Feedback patterns and preferences
 */
async function retrieveFeedbackPatterns(userId, currentTopic = null) {
  if (!SUPERMEMORY_API_KEY || !userId) {
    return {
      preferences: [],
      patterns: {},
      deepInsights: [],
    };
  }

  // Check cache first (feedback patterns don't change frequently)
  const cached = getCachedFeedbackPatterns(userId);
  if (cached) {
    console.log(
      `⚡ [FEEDBACK_CACHE] Using cached feedback patterns for user: ${userId}`
    );
    return cached;
  }

  try {
    // Build query to find feedback memories
    // Prioritize response preferences and style learning
    let query =
      "user response preferences, feedback patterns, what user likes and dislikes in responses, communication style preferences";

    // Add topic-specific query if provided
    if (currentTopic) {
      query += `, preferences for ${currentTopic} topics`;
    }

    // Search for feedback-related memories
    // Use very low threshold (0.1) to ensure we catch all feedback memories,
    // then filter by metadata since semantic search might not match feedback content well
    const feedbackMemories = await searchSupermemoryMemories(userId, query, {
      limit: 50, // Get more memories to filter through
      threshold: 0.1, // Very low threshold to catch all feedback memories
    });

    // Search results summary (detailed filtering logs below)

    // Count UNKNOWN metadata issues (only log summary, not details)
    const unknownCount = feedbackMemories.filter((mem) => {
      let metadata = mem.metadata || {};
      if (
        (!metadata || Object.keys(metadata).length === 0) &&
        Array.isArray(mem.documents) &&
        mem.documents.length > 0
      ) {
        metadata = mem.documents[0].metadata || {};
      }
      return (metadata.memory_type || "unknown") === "unknown";
    }).length;

    if (unknownCount > 0) {
      console.log(
        `⚠️ [FEEDBACK_PATTERNS] ${unknownCount}/${feedbackMemories.length} memories have missing metadata`
      );
    }

    // Filter for feedback memories specifically
    // Check both metadata AND content as fallback (metadata might be empty or in documents)
    const feedbackOnly = feedbackMemories
      .map((m) => {
        // Try to get metadata from multiple locations
        let metadata = m.metadata || {};

        // Check if metadata is in documents array (Supermemory v4 might nest it there)
        if (
          (!metadata || Object.keys(metadata).length === 0) &&
          Array.isArray(m.documents) &&
          m.documents.length > 0
        ) {
          metadata = m.documents[0].metadata || {};
        }

        return { ...m, metadata }; // Normalize metadata location
      })
      .filter((m) => {
        const metadata = m.metadata || {};
        const content = (m.memory || m.content || "").toLowerCase();

        // Primary check: metadata fields
        const hasMetadataMatch =
          metadata.memory_type === "message_feedback" ||
          (Array.isArray(metadata.tags) &&
            (metadata.tags.includes("response_preference") ||
              metadata.tags.includes("style_learning") ||
              metadata.tags.includes("feedback")));

        // Fallback check: content keywords (in case metadata is missing)
        const hasContentMatch =
          content.includes("liked finny's response") ||
          content.includes("disliked finny's response") ||
          (content.includes("liked") && content.includes("response")) ||
          (content.includes("disliked") && content.includes("response")) ||
          (content.includes("feedback") &&
            (content.includes("positive") || content.includes("negative")));

        return hasMetadataMatch || hasContentMatch;
      });

    // Summary log only - details not needed unless filtering fails
    if (feedbackOnly.length === 0 && feedbackMemories.length > 0) {
      console.log(
        `⚠️ [FEEDBACK_PATTERNS] Filtered ${feedbackMemories.length} memories → 0 feedback memories found`
      );
    } else {
      console.log(
        `🔍 [FEEDBACK_PATTERNS] Filtered ${feedbackMemories.length} → ${feedbackOnly.length} feedback memories`
      );
    }

    // Use results from first search only (removed second broader search for performance)
    // If no feedback found, return empty - no need for expensive fallback search
    const finalFeedbackOnly = feedbackOnly;

    // Extract patterns and preferences
    const preferences = [];
    const patterns = {
      responseStyle: {},
      messageLength: {},
      format: {},
      tone: {},
      topics: {},
    };
    const deepInsights = [];

    finalFeedbackOnly.forEach((memory) => {
      // Ensure we have metadata (might have been normalized in filter step)
      let metadata = memory.metadata || {};

      // Double-check documents array if metadata still empty
      if (
        (!metadata || Object.keys(metadata).length === 0) &&
        Array.isArray(memory.documents) &&
        memory.documents.length > 0
      ) {
        metadata = memory.documents[0].metadata || {};
      }

      // v4/search returns 'memory' field, not 'content'
      const content = memory.memory || memory.content || "";
      const feedbackType = metadata.feedback_type;

      // Log metadata access for debugging
      if (!feedbackType && content.toLowerCase().includes("feedback")) {
        console.log(
          `⚠️ [FEEDBACK_PATTERNS] Memory has feedback content but no feedback_type in metadata:`,
          {
            metadataKeys: Object.keys(metadata),
            metadata: metadata,
            contentPreview: content.substring(0, 200),
          }
        );
      }

      // Extract positive preferences
      if (feedbackType === "positive") {
        // Response style preference
        if (metadata.response_style) {
          patterns.responseStyle[metadata.response_style] =
            (patterns.responseStyle[metadata.response_style] || 0) + 1;
        }

        // Message length preference
        if (metadata.message_length) {
          patterns.messageLength[metadata.message_length] =
            (patterns.messageLength[metadata.message_length] || 0) + 1;
        }

        // Format preferences
        if (metadata.has_examples) {
          patterns.format.examples = (patterns.format.examples || 0) + 1;
        }
        if (metadata.has_action_items) {
          patterns.format.actionItems = (patterns.format.actionItems || 0) + 1;
        }
        if (metadata.has_numbers) {
          patterns.format.numbers = (patterns.format.numbers || 0) + 1;
        }

        // Tone preference
        if (metadata.emotional_tone) {
          patterns.tone[metadata.emotional_tone] =
            (patterns.tone[metadata.emotional_tone] || 0) + 1;
        }

        // Topic-specific preferences
        if (metadata.topics && Array.isArray(metadata.topics)) {
          metadata.topics.forEach((topic) => {
            if (!patterns.topics[topic]) {
              patterns.topics[topic] = { positive: 0, negative: 0 };
            }
            patterns.topics[topic].positive =
              (patterns.topics[topic].positive || 0) + 1;
          });
        }

        // Deep insights from positive feedback
        if (content.includes("liked")) {
          // Extract what specifically they liked
          const likedMatch = content.match(/liked.*?about\s+([^.]+)/i);
          if (likedMatch) {
            deepInsights.push({
              type: "preference",
              insight: `User appreciates responses about: ${likedMatch[1]}`,
              confidence: "high",
            });
          }
        }
      }

      // Extract negative preferences (what to avoid)
      if (feedbackType === "negative") {
        const reportedIssue = metadata.reported_issue;

        // Track what user dislikes
        if (reportedIssue === "too_long") {
          patterns.messageLength.long = (patterns.messageLength.long || 0) - 1;
          deepInsights.push({
            type: "avoid",
            insight: "User dislikes responses that are too long",
            confidence: "high",
          });
        }

        if (reportedIssue === "unhelpful") {
          deepInsights.push({
            type: "avoid",
            insight: "User values actionable, helpful responses",
            confidence: "high",
          });
        }

        if (reportedIssue === "wrong_tone") {
          if (metadata.emotional_tone) {
            patterns.tone[metadata.emotional_tone] =
              (patterns.tone[metadata.emotional_tone] || 0) - 1;
          }
          deepInsights.push({
            type: "avoid",
            insight: `User dislikes ${
              metadata.emotional_tone || "certain"
            } tone in responses`,
            confidence: "high",
          });
        }

        // Extract from report text for deeper understanding
        if (content.includes("reported:")) {
          const reportMatch = content.match(/reported:\s*"([^"]+)"/i);
          if (reportMatch) {
            const reportText = reportMatch[1].toLowerCase();

            // Deep understanding extraction
            if (
              reportText.includes("don't like") ||
              reportText.includes("dislike")
            ) {
              deepInsights.push({
                type: "preference",
                insight: `User expressed: "${reportMatch[1]}" - important to understand their specific concern`,
                confidence: "very_high",
              });
            }

            // Extract specific dislikes
            if (
              reportText.includes("too long") ||
              reportText.includes("lengthy")
            ) {
              patterns.messageLength.long =
                (patterns.messageLength.long || 0) - 2;
            }
            if (
              reportText.includes("no example") ||
              reportText.includes("without example")
            ) {
              patterns.format.examples = (patterns.format.examples || 0) - 1;
            }
            if (
              reportText.includes("no action") ||
              reportText.includes("not helpful")
            ) {
              patterns.format.actionItems =
                (patterns.format.actionItems || 0) - 1;
            }
          }
        }

        // Topic-specific negative feedback
        if (metadata.topics && Array.isArray(metadata.topics)) {
          metadata.topics.forEach((topic) => {
            if (!patterns.topics[topic]) {
              patterns.topics[topic] = { positive: 0, negative: 0 };
            }
            patterns.topics[topic].negative =
              (patterns.topics[topic].negative || 0) + 1;
          });
        }
      }
    });

    // Build preference strings from patterns
    // Response style
    const styleCounts = Object.entries(patterns.responseStyle);
    if (styleCounts.length > 0) {
      const topStyle = styleCounts.sort((a, b) => b[1] - a[1])[0];
      if (topStyle[1] > 0) {
        preferences.push(
          `Response style: User prefers ${topStyle[0]} communication style (${topStyle[1]} positive feedback)`
        );
      }
    }

    // Message length
    const lengthCounts = Object.entries(patterns.messageLength);
    if (lengthCounts.length > 0) {
      const topLength = lengthCounts
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0];
      if (topLength) {
        preferences.push(
          `Message length: User prefers ${topLength[0]} responses (${topLength[1]} positive feedback)`
        );
      }
    }

    // Format preferences
    if (patterns.format.examples > 0) {
      preferences.push(
        `Format: User appreciates responses with examples (${patterns.format.examples} positive feedback)`
      );
    }
    if (patterns.format.actionItems > 0) {
      preferences.push(
        `Format: User values actionable responses with clear steps (${patterns.format.actionItems} positive feedback)`
      );
    }
    if (patterns.format.numbers > 0) {
      preferences.push(
        `Format: User finds responses with numbers/data helpful (${patterns.format.numbers} positive feedback)`
      );
    }

    // Tone preferences
    const toneCounts = Object.entries(patterns.tone);
    if (toneCounts.length > 0) {
      const topTone = toneCounts
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])[0];
      if (topTone) {
        preferences.push(
          `Tone: User prefers ${topTone[0]} tone in responses (${topTone[1]} positive feedback)`
        );
      }
    }

    // Topic-specific preferences
    // Filter for topics where positive feedback outweighs negative
    const topicPreferences = Object.entries(patterns.topics)
      .filter(([_, counts]) => counts.positive > counts.negative)
      .map(([topic, counts]) => ({
        topic,
        preference: "prefers", // Always "prefers" since filter ensures positive > negative
        strength: Math.abs(counts.positive - counts.negative),
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3); // Top 3 topic preferences

    topicPreferences.forEach(({ topic, preference, strength }) => {
      preferences.push(
        `Topic-specific: User ${preference} detailed responses about ${topic} (${strength} feedback difference)`
      );
    });

    // Deep insights (prioritize high confidence)
    const highConfidenceInsights = deepInsights
      .filter((i) => i.confidence === "very_high" || i.confidence === "high")
      .map((i) => i.insight);

    // Summary only - detailed logging happens where preferences are used (in finny.js)
    console.log(
      `✅ [FEEDBACK_PATTERNS] Retrieved ${finalFeedbackOnly.length} feedback memories → ${preferences.length} preferences, ${highConfidenceInsights.length} deep insights`
    );

    const result = {
      preferences,
      patterns,
      deepInsights: highConfidenceInsights,
      feedbackCount: finalFeedbackOnly.length,
    };

    // Cache the result (even if empty) to avoid repeated expensive searches
    setCachedFeedbackPatterns(userId, result);

    return result;
  } catch (error) {
    console.error(
      `❌ [FEEDBACK_PATTERNS] Error retrieving feedback patterns:`,
      error.message
    );
    // Cache empty result on error to prevent repeated failures
    const emptyResult = {
      preferences: [],
      patterns: {},
      deepInsights: [],
    };
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

// Export all functions
export {
  getSessionState,
  setSessionState,
  mergeSessionState,
  getConversationContext,
  saveConversationContext,
  updateConversationContext,
  getCachedProfile,
  setCachedProfile,
  invalidateProfileCache,
  loadUserMemory,
  loadUserProfile,
  isSensitiveData,
  getExpiryDate,
  storeConversationMemory,
  storeOnboardingMemory,
  storeMessageFeedback,
  retrieveFeedbackPatterns,
  buildFeedbackContext,
  searchSupermemoryMemories,
  fetchSupermemoryProfile,
  fetchSupermemoryMemoriesList,
  fetchSupermemoryMemories,
  deleteSupermemoryMemory,
  updateSupermemoryMemory,
};
