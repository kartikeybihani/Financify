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
        console.log(
          `💬 [CONVERSATION] No context found for chat_id: ${chatId}`
        );
        return null;
      }
      console.error("❌ [CONVERSATION] Error loading context:", error);
      return null;
    }

    console.log(`✅ [CONVERSATION] Context loaded for chat_id: ${chatId}`);
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

    console.log(`✅ [CONVERSATION] Context saved for chat_id: ${chatId}`);
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

  // 🔍 DEBUG: Log context update
  console.log("🔍 [CONTEXT UPDATE DEBUG] Updating conversation context:");
  console.log("  - User ID:", userId);
  console.log("  - Chat ID:", chatId);
  console.log("  - Message:", userMessage);
  console.log("  - Metadata:", JSON.stringify(metadata));

  try {
    // Load existing context
    const existingContext =
      (await getConversationContext(userId, chatId)) || {};

    console.log("  - Existing context loaded:", existingContext ? "YES" : "NO");
    if (existingContext) {
      console.log("  - Existing active topic:", existingContext.active_topic);
      console.log(
        "  - Existing last entity:",
        JSON.stringify(existingContext.last_entity)
      );
    }

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

    console.log("  - Final updated context:");
    console.log("    - Active topic:", updatedContext.active_topic);
    console.log(
      "    - Last entity:",
      JSON.stringify(updatedContext.last_entity)
    );
    console.log("    - Pending action:", updatedContext.pending_action);
    console.log(
      "    - Messages count:",
      updatedContext.last_messages?.length || 0
    );

    await saveConversationContext(userId, chatId, updatedContext);
    console.log("✅ [CONTEXT UPDATE] Context saved successfully");
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
const SUPERMEMORY_FETCH_TIMEOUT_MS = 5000; // 5 seconds timeout for API calls

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
 * @param {object} metadata - Additional metadata (optional)
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

  // Build rich memory content from conversation
  const memoryContent = buildSupermemoryContent(userMessage, finnyResponse);

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
      `✅ [SUPERMEMORY] Stored memory for user ${userId}: ${
        result.id || "success"
      }`
    );
    return result;
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error storing memory:`, error.message);
    // Don't throw - memory storage failures shouldn't break conversation flow
    return null;
  }
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
      `✅ [SUPERMEMORY] Stored onboarding memory for user ${userId}: ${
        result.id || "success"
      }`
    );
    return result;
  } catch (error) {
    console.error(
      `❌ [SUPERMEMORY] Error storing onboarding memory:`,
      error.message
    );
    // Don't throw - memory storage failures shouldn't break onboarding flow
    return null;
  }
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
 * @returns {string} - Formatted memory content
 */
function buildSupermemoryContent(userMessage, finnyResponse) {
  const parts = [];

  // User's message context
  parts.push(`User said: "${userMessage}"`);

  // Finny's response summary
  parts.push(
    `Finny responded: ${finnyResponse.substring(0, 1300)}${
      finnyResponse.length > 1300 ? "..." : ""
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
    console.log("👤 [PROFILE] Using cached profile data for user:", userId);
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

    const result = {
      name,
      age: profile?.age || null,
      occupation: profile?.occupation || null,
      finny_style: profile?.finny_style || "conversational",
      intent_context: intentContext,
      // Keep raw values for reference if needed
      intent_q1: profile?.intent_q1 || null,
      intent_q2: profile?.intent_q2 || null,
      intent_q3: profile?.intent_q3 || null,
    };

    // Cache the result
    setCachedProfile(userId, result);

    console.log(`👤 [PROFILE] Loaded profile for user ${userId}`);
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
  searchSupermemoryMemories,
  fetchSupermemoryProfile,
  fetchSupermemoryMemoriesList,
  fetchSupermemoryMemories,
  deleteSupermemoryMemory,
  updateSupermemoryMemory,
};
