// api/memory.js
import { supabase } from "../lib/api/supabase.js";

// API Route Handler for Supermemory Profile (GET /api/memory)
// Also handles DELETE and PUT for memory operations
export default async function handler(req, res) {
  // Debug logging
  console.log(`🔍 [MEMORY_API] Request received:`, {
    method: req.method,
    url: req.url,
    query: req.query,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });

  // Derive user from Supabase JWT instead of trusting client context
  let serverUserId = null;

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
    }
  }

  if (!serverUserId) {
    console.log(`⚠️ [MEMORY_API] Unauthorized - no userId`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log(`✅ [MEMORY_API] Authenticated user: ${serverUserId}`);

  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).json({});
  }

  // Handle different HTTP methods
  const method = req.method?.toUpperCase() || req.method;
  console.log(`🔍 [MEMORY_API] Processing ${method} request`);

  if (method === "GET") {
    try {
      // Fetch profile and memories from Supermemory
      // Profile is optional - if it fails, we still return memories
      const [profile, memories] = await Promise.allSettled([
        fetchSupermemoryProfile(serverUserId),
        fetchSupermemoryMemories(serverUserId),
      ]);

      // Extract results, handling failures gracefully
      const profileResult =
        profile.status === "fulfilled" ? profile.value : null;
      const memoriesResult =
        memories.status === "fulfilled" ? memories.value : [];

      return res.status(200).json({
        profile: profileResult || null,
        memories: Array.isArray(memoriesResult) ? memoriesResult : [],
      });
    } catch (error) {
      console.error("❌ [SUPERMEMORY_PROFILE] Error:", error);
      return res.status(500).json({
        error: "Failed to fetch Supermemory profile",
        message: error.message,
      });
    }
  } else if (method === "DELETE") {
    // Delete a memory by ID
    try {
      const { memoryId } = req.query;
      console.log(`🔍 [MEMORY_API] DELETE request - memoryId: ${memoryId}`);

      if (!memoryId) {
        console.log(`⚠️ [MEMORY_API] DELETE - memoryId missing`);
        return res.status(400).json({ error: "memoryId is required" });
      }

      const result = await deleteSupermemoryMemory(memoryId);
      console.log(`✅ [MEMORY_API] DELETE success for ${memoryId}`);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      console.error("❌ [SUPERMEMORY_DELETE] Error:", error);
      return res.status(500).json({
        error: "Failed to delete memory",
        message: error.message,
      });
    }
  } else if (method === "PUT") {
    // Update a memory by ID
    try {
      const { memoryId, content, metadata } = req.body;
      console.log(
        `🔍 [MEMORY_API] PUT request - memoryId: ${memoryId}, content length: ${
          content?.length || 0
        }`
      );

      if (!memoryId) {
        console.log(`⚠️ [MEMORY_API] PUT - memoryId missing`);
        return res.status(400).json({ error: "memoryId is required" });
      }
      if (!content) {
        console.log(`⚠️ [MEMORY_API] PUT - content missing`);
        return res.status(400).json({ error: "content is required" });
      }

      const result = await updateSupermemoryMemory(memoryId, {
        content,
        metadata: metadata || {},
      });
      console.log(`✅ [MEMORY_API] PUT success for ${memoryId}`);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      console.error("❌ [SUPERMEMORY_UPDATE] Error:", error);
      return res.status(500).json({
        error: "Failed to update memory",
        message: error.message,
      });
    }
  } else {
    console.log(`⚠️ [MEMORY_API] Method not allowed: ${method}`);
    return res.status(405).json({
      error: "Method not allowed",
      receivedMethod: method,
      allowedMethods: ["GET", "DELETE", "PUT"],
    });
  }
}

// KEY_SYNONYMS removed - migrating to Supermemory for memory management

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

// Smart memory selection for optimal context building
function selectRelevantMemories(memoryData, message, intent, userProfile) {
  if (!memoryData?.memories?.length) return [];

  const lowerMessage = message.toLowerCase();

  // Define memory importance weights by type
  const memoryTypeWeights = {
    profile_trait: 0.9, // High - personal characteristics are always relevant
    constraint: 0.95, // Very high - financial constraints are critical
    preference: 0.85, // High - user preferences matter for advice
    future_plan: 0.8, // High - future plans affect current decisions
    goal: 0.9, // Very high - current goals are essential
    context_signal: 0.7, // Medium - situational context
  };

  // Intent-based memory type priorities
  const intentPriorities = {
    ask_personalized: [
      "constraint",
      "goal",
      "profile_trait",
      "preference",
      "future_plan",
      "context_signal",
    ],
    goal_conversation: [
      "goal",
      "constraint",
      "future_plan",
      "profile_trait",
      "preference",
    ],
    off_topic: ["profile_trait", "preference"],
  };

  // Dynamic memory limits based on query complexity
  const getMemoryLimit = () => {
    // High complexity indicators
    const highComplexityKeywords = [
      "advice",
      "recommend",
      "should i",
      "help me",
      "what do you think",
      "financial plan",
      "investment",
      "retirement",
      "budget",
      "debt",
      "goal",
      "save",
      "spend",
      "afford",
      "risk",
    ];

    // Medium complexity indicators
    const mediumComplexityKeywords = [
      "how much",
      "when",
      "where",
      "which",
      "compare",
      "difference",
    ];

    const hasHighComplexity = highComplexityKeywords.some((keyword) =>
      lowerMessage.includes(keyword)
    );
    const hasMediumComplexity = mediumComplexityKeywords.some((keyword) =>
      lowerMessage.includes(keyword)
    );

    if (hasHighComplexity) return 12; // Comprehensive context for complex queries
    if (hasMediumComplexity) return 8; // Good context for medium queries
    return 5; // Basic context for simple queries
  };

  // Score memories based on relevance
  const scoreMemory = (memory) => {
    let score = 0;

    // Base score from memory type weight
    score += memoryTypeWeights[memory.memory_type] || 0.5;

    // Confidence score boost
    score += (memory.confidence_score || 0.7) * 0.3;

    // Recency boost (newer memories are more relevant)
    const daysSinceUpdate =
      (Date.now() - new Date(memory.updated_at).getTime()) /
      (1000 * 60 * 60 * 24);
    score += Math.max(0, 0.2 - daysSinceUpdate / 30); // Decay over 30 days

    // Keyword relevance boost
    const memoryText = `${memory.key} ${memory.value}`.toLowerCase();
    const messageWords = lowerMessage.split(/\s+/);
    const relevanceMatches = messageWords.filter(
      (word) => word.length > 3 && memoryText.includes(word)
    ).length;
    score += relevanceMatches * 0.1;

    // Intent-based priority boost
    const intentPriority =
      intentPriorities[intent] || intentPriorities["ask_personalized"];
    const typePriority = intentPriority.indexOf(memory.memory_type);
    if (typePriority !== -1) {
      score += (intentPriority.length - typePriority) * 0.1;
    }

    return score;
  };

  // Score and sort all memories
  const scoredMemories = memoryData.memories
    .map((memory) => ({
      ...memory,
      relevanceScore: scoreMemory(memory),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Apply dynamic limit
  const limit = getMemoryLimit();
  const selectedMemories = scoredMemories.slice(0, limit);

  // Ensure we have at least one memory from each important type if available
  const importantTypes =
    intentPriorities[intent] || intentPriorities["ask_personalized"];
  const finalMemories = [];
  const usedTypes = new Set();

  // First pass: Add top-scored memories
  selectedMemories.forEach((memory) => {
    if (finalMemories.length < limit) {
      finalMemories.push(memory);
      usedTypes.add(memory.memory_type);
    }
  });

  // Second pass: Ensure coverage of important types
  importantTypes.forEach((type) => {
    if (!usedTypes.has(type) && finalMemories.length < limit) {
      const typeMemory = memoryData.memories.find(
        (m) => m.memory_type === type
      );
      if (typeMemory) {
        finalMemories.push({
          ...typeMemory,
          relevanceScore: scoreMemory(typeMemory),
        });
        usedTypes.add(type);
      }
    }
  });

  console.log(
    `🧠 [MEMORY] Selected ${finalMemories.length} memories for intent "${intent}" (limit: ${limit})`
  );
  console.log(`🧠 [MEMORY] Memory types included:`, Array.from(usedTypes));

  return finalMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Helper function to categorize selected memories for context building
function categorizeSelectedMemories(selectedMemories) {
  const categorized = {
    profile_trait: [],
    constraint: [],
    preference: [],
    future_plan: [],
    context_signal: [],
    goal: [],
  };

  selectedMemories.forEach((memory) => {
    if (categorized[memory.memory_type]) {
      categorized[memory.memory_type].push(memory);
    }
  });

  return categorized;
}

async function loadUserMemory(userId) {
  if (!userId) return { summary: "", memories: [] };

  // Check cache first
  const cached = getCachedMemory(userId);
  if (cached) {
    console.log("🧠 [MEMORY] Using cached memory data for user:", userId);
    return cached;
  }

  try {
    console.log("🧠 [MEMORY] Loading fresh memory data for user:", userId);

    // Get ALL memory summaries (not just the most recent)
    const { data: summaries } = await supabase
      .from("memory_summary")
      .select("summary_text, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Get all non-expired memories with higher limit and confidence filtering
    const { data: memories } = await supabase
      .from("user_memories")
      .select("memory_type, key, value, confidence_score, updated_at")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .gte("confidence_score", 0.7) // Only include high-confidence memories
      .order("updated_at", { ascending: false })
      .limit(20); // Increased limit for better context

    // Combine all summaries into one comprehensive summary
    const combinedSummary =
      summaries
        ?.map((s) => s.summary_text)
        .filter(Boolean)
        .join(" ") || "";

    // Categorize memories by type for better context building
    const categorizedMemories = {
      profile_trait: [],
      constraint: [],
      preference: [],
      future_plan: [],
      context_signal: [],
      goal: [],
    };

    memories?.forEach((memory) => {
      if (categorizedMemories[memory.memory_type]) {
        categorizedMemories[memory.memory_type].push(memory);
      }
    });

    const result = {
      summary: combinedSummary,
      memories: memories || [],
      categorized: categorizedMemories,
      totalCount: memories?.length || 0,
    };

    // Cache the result
    setCachedMemory(userId, result);

    console.log(
      `🧠 [MEMORY] Loaded ${result.totalCount} memories for user ${userId}`
    );
    return result;
  } catch (error) {
    console.error("❌ [MEMORY] Error loading user memory:", error);
    return { summary: "", memories: [], categorized: {}, totalCount: 0 };
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

// saveMemoryCandidates removed - migrating to Supermemory for memory storage

// updateMemorySummary and generateMemorySummary removed - Supermemory handles summarization automatically

// validateMemoriesWithSmallModel removed - migrating to Supermemory for memory extraction and management

// === SUPERMEMORY INTEGRATION ===

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const SUPERMEMORY_BASE_URL = "https://api.supermemory.ai";

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
    const response = await fetch(`${SUPERMEMORY_BASE_URL}/v3/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

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
    `Finny responded: ${finnyResponse.substring(0, 500)}${
      finnyResponse.length > 500 ? "..." : ""
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

  // Goal-related
  if (/want|goal|plan|dream|target|save for/.test(lower)) {
    tags.push("goal_mentioned");
  }

  // Travel
  if (/travel|trip|vacation|japan|europe|visit|holiday/.test(lower)) {
    tags.push("travel_interest");
  }

  // Major purchases
  if (
    /buy|purchase|afford|macbook|laptop|car|house|home|apartment/.test(lower)
  ) {
    tags.push("purchase_interest");
  }

  // Debt concerns
  if (/debt|loan|credit card|owe|pay off|payoff/.test(lower)) {
    tags.push("debt_concern");
  }

  // Savings
  if (/save|savings|emergency fund|emergency/.test(lower)) {
    tags.push("savings_discussion");
  }

  // Investment
  if (
    /invest|investment|stock|portfolio|retirement|401k|ira|roth/.test(lower)
  ) {
    tags.push("investment_discussion");
  }

  // Budget/spending
  if (/budget|spending|expense|spend|cost/.test(lower)) {
    tags.push("budget_discussion");
  }

  // Income
  if (/salary|income|earn|paycheck|raise|bonus/.test(lower)) {
    tags.push("income_discussion");
  }

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
    const response = await fetch(
      `${SUPERMEMORY_BASE_URL}/v4/profile?containerTag=user_${userId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
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
 * Fetch user memories from Supermemory using search API
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
    const response = await fetch(`${SUPERMEMORY_BASE_URL}/v4/search`, {
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
    });

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
    // Extract documents from search results
    // Supermemory v4/search returns: { documents: [...], ... }
    const memories = result.documents || result.results || result.data || [];

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
 * Delete a memory from Supermemory
 * @param {string} memoryId - Memory ID to delete
 * @returns {Promise<object>} - Delete result
 */
async function deleteSupermemoryMemory(memoryId) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("Supermemory API key not configured");
  }

  if (!memoryId) {
    throw new Error("memoryId is required");
  }

  try {
    const response = await fetch(
      `${SUPERMEMORY_BASE_URL}/v3/memories/${memoryId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
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

    console.log(`✅ [SUPERMEMORY] Deleted memory ${memoryId}`);
    return { success: true, id: memoryId };
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error deleting memory:`, error.message);
    throw error;
  }
}

/**
 * Update a memory in Supermemory
 * @param {string} memoryId - Memory ID to update
 * @param {object} updateData - Update data with content and optional metadata
 * @returns {Promise<object>} - Update result
 */
async function updateSupermemoryMemory(memoryId, updateData) {
  if (!SUPERMEMORY_API_KEY) {
    throw new Error("Supermemory API key not configured");
  }

  if (!memoryId) {
    throw new Error("memoryId is required");
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

    const response = await fetch(
      `${SUPERMEMORY_BASE_URL}/v3/memories/${memoryId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SUPERMEMORY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
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
    console.log(`✅ [SUPERMEMORY] Updated memory ${memoryId}`);
    return result;
  } catch (error) {
    console.error(`❌ [SUPERMEMORY] Error updating memory:`, error.message);
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
  getCachedMemory,
  setCachedMemory,
  invalidateMemoryCache,
  getCachedProfile,
  setCachedProfile,
  invalidateProfileCache,
  selectRelevantMemories,
  categorizeSelectedMemories,
  loadUserMemory,
  loadUserProfile,
  isSensitiveData,
  getExpiryDate,
  storeConversationMemory,
  fetchSupermemoryProfile,
  fetchSupermemoryMemories,
  // saveMemoryCandidates removed - migrating to Supermemory
  // updateMemorySummary removed - Supermemory handles summarization
  // generateMemorySummary removed - Supermemory handles summarization
  // validateMemoriesWithSmallModel removed - migrating to Supermemory
};
