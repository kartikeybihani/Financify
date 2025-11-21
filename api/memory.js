// api/memory.js
import { supabase } from "../lib/api/supabase.js";

// KEY_SYNONYMS constant (copied from src/constants/keySynonyms.ts)
const KEY_SYNONYMS = {
  // === PROFILE TRAITS ===
  "profile_trait.age": {
    synonyms: ["age", "years old", "turning", "birthday", "young", "old"],
    examples: ["I'm 25", "turning 30", "young professional", "fresh grad"],
  },

  "profile_trait.location": {
    synonyms: [
      "live in",
      "from",
      "based in",
      "located",
      "city",
      "state",
      "moved to",
    ],
    examples: [
      "I live in Austin",
      "from California",
      "based in NYC",
      "moved to Seattle",
    ],
  },

  "profile_trait.occupation": {
    synonyms: [
      "work as",
      "job",
      "career",
      "profession",
      "engineer",
      "teacher",
      "nurse",
      "manager",
      "developer",
      "consultant",
      "freelancer",
      "entrepreneur",
      "ai engineer",
      "data scientist",
      "machine learning",
      "tech lead",
    ],
    examples: [
      "I'm a software engineer",
      "work in marketing",
      "freelance designer",
      "startup founder",
      "ai engineer",
      "data scientist",
    ],
  },

  "profile_trait.education": {
    synonyms: [
      "graduated",
      "degree",
      "college",
      "university",
      "masters",
      "phd",
      "studying",
      "student",
      "dropout",
    ],
    examples: [
      "graduated from UCLA",
      "have a business degree",
      "studying computer science",
      "college dropout",
    ],
  },

  "profile_trait.family.marital_status": {
    synonyms: [
      "married",
      "wife",
      "husband",
      "spouse",
      "partner",
      "single",
      "divorced",
      "widowed",
      "engaged",
      "dating",
      "relationship",
    ],
    examples: [
      "my wife",
      "husband and I",
      "married to",
      "single",
      "in a relationship",
      "my partner",
    ],
  },

  "profile_trait.family.relationship_status": {
    synonyms: [
      "girlfriend",
      "boyfriend",
      "dating",
      "seeing someone",
      "exclusive",
      "casual",
      "long distance",
      "living together",
    ],
    examples: [
      "my girlfriend",
      "dating someone",
      "seeing this person",
      "long distance relationship",
    ],
  },

  "profile_trait.family.children": {
    synonyms: [
      "kids",
      "children",
      "baby",
      "babies",
      "toddler",
      "teenager",
      "son",
      "daughter",
      "parent",
      "mom",
      "dad",
    ],
    examples: [
      "have kids",
      "my son",
      "parent of two",
      "expecting a baby",
      "new mom",
    ],
  },

  "profile_trait.family.living_situation": {
    synonyms: [
      "live with",
      "roommate",
      "roommates",
      "parents",
      "alone",
      "by myself",
      "with friends",
      "renting",
      "owning",
      "apartment",
      "house",
    ],
    examples: [
      "live with my parents",
      "have roommates",
      "live alone",
      "renting an apartment",
      "own my house",
    ],
  },

  // === CONSTRAINTS ===
  "constraint.income.household_type": {
    synonyms: [
      "single income",
      "dual income",
      "unemployed",
      "jobless",
      "between jobs",
      "part time",
      "full time",
      "freelance",
      "gig work",
    ],
    examples: [
      "only I work",
      "both of us work",
      "lost my job",
      "between jobs",
      "part time job",
    ],
  },

  "constraint.income.salary_range": {
    synonyms: [
      "make",
      "earn",
      "salary",
      "income",
      "pay",
      "wage",
      "hourly",
      "annual",
      "six figures",
      "minimum wage",
    ],
    examples: [
      "make $50k",
      "earn six figures",
      "minimum wage job",
      "hourly worker",
      "annual salary",
    ],
  },

  "constraint.debt.student_loans": {
    synonyms: [
      "student loans",
      "student debt",
      "college debt",
      "education loans",
      "federal loans",
      "private loans",
      "paying off loans",
    ],
    examples: [
      "have student loans",
      "student debt",
      "paying off college",
      "federal student loans",
    ],
  },

  "constraint.debt.credit_card": {
    synonyms: [
      "credit card debt",
      "credit cards",
      "high interest",
      "paying minimum",
      "credit score",
      "debt",
    ],
    examples: [
      "credit card debt",
      "high interest debt",
      "paying minimums",
      "bad credit",
    ],
  },

  "constraint.debt.other": {
    synonyms: [
      "car loan",
      "auto loan",
      "mortgage",
      "personal loan",
      "medical debt",
      "hospital bills",
    ],
    examples: ["car payment", "mortgage", "medical bills", "personal loan"],
  },

  "constraint.family_obligation.parents_support": {
    synonyms: [
      "support my parents",
      "help my parents",
      "parents need help",
      "taking care of parents",
      "family support",
      "send money home",
    ],
    examples: [
      "helping my parents",
      "supporting my family",
      "send money home",
      "taking care of parents",
    ],
  },

  "constraint.family_obligation.siblings": {
    synonyms: [
      "help my siblings",
      "support my brother",
      "sister needs help",
      "family member",
      "relative",
    ],
    examples: [
      "helping my brother",
      "supporting my sister",
      "family member needs help",
    ],
  },

  "constraint.health.medical": {
    synonyms: [
      "medical bills",
      "health insurance",
      "doctor visits",
      "prescription",
      "therapy",
      "mental health",
    ],
    examples: [
      "medical expenses",
      "health insurance costs",
      "therapy bills",
      "prescription costs",
    ],
  },

  // === GOALS ===
  // Goal synonyms moved to goals.js

  // === PREFERENCES ===
  "preference.risk_tolerance": {
    synonyms: [
      "risk",
      "conservative",
      "aggressive",
      "safe",
      "risky",
      "cautious",
      "bold",
    ],
    examples: [
      "I'm conservative with money",
      "take risks",
      "play it safe",
      "aggressive investor",
    ],
  },

  "preference.spending.lifestyle": {
    synonyms: [
      "frugal",
      "cheap",
      "splurge",
      "treat myself",
      "budget",
      "save money",
      "spend money",
    ],
    examples: [
      "I'm frugal",
      "like to splurge",
      "budget everything",
      "treat myself",
    ],
  },

  "preference.investment.style": {
    synonyms: [
      "hands on",
      "hands off",
      "set it and forget it",
      "active",
      "passive",
      "diy",
      "robo advisor",
    ],
    examples: [
      "hands on investor",
      "set and forget",
      "diy investing",
      "robo advisor",
    ],
  },

  // === CONTEXT SIGNALS ===
  "context_signal.life_event.job_change": {
    synonyms: [
      "new job",
      "started",
      "got hired",
      "first day",
      "promotion",
      "laid off",
      "fired",
    ],
    examples: [
      "started new job",
      "got promoted",
      "laid off",
      "first day at work",
    ],
  },

  "context_signal.life_event.moving": {
    synonyms: [
      "moved",
      "relocated",
      "new apartment",
      "new house",
      "packing",
      "unpacking",
    ],
    examples: ["just moved", "new apartment", "relocated to", "packing up"],
  },

  "context_signal.life_event.relationship": {
    synonyms: [
      "broke up",
      "got together",
      "moved in",
      "engaged",
      "married",
      "divorced",
    ],
    examples: [
      "broke up with",
      "started dating",
      "moved in together",
      "got engaged",
    ],
  },

  "context_signal.life_event.family": {
    synonyms: [
      "pregnant",
      "had a baby",
      "family member died",
      "parents divorced",
      "sibling got married",
    ],
    examples: [
      "expecting a baby",
      "had a baby",
      "family member passed",
      "parents divorced",
    ],
  },

  "context_signal.financial_stress": {
    synonyms: [
      "stressed",
      "worried",
      "anxious",
      "overwhelmed",
      "drowning",
      "struggling",
      "can't afford",
    ],
    examples: [
      "stressed about money",
      "worried about bills",
      "can't afford",
      "struggling financially",
    ],
  },

  "context_signal.financial_win": {
    synonyms: [
      "got a raise",
      "bonus",
      "tax refund",
      "sold something",
      "inheritance",
      "lottery",
    ],
    examples: ["got a raise", "tax refund", "sold my car", "inherited money"],
  },
};

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

async function saveMemoryCandidates(userId, candidates) {
  if (!userId || !candidates.length) {
    console.log("🧠 [FINNY] No userId or candidates to save:", {
      userId,
      candidatesLength: candidates?.length,
    });
    return;
  }

  try {
    let savedCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Preload existing user memories for duplicate checking and cooldown
    let existingMemories = [];
    try {
      const { data: existing } = await supabase
        .from("user_memories")
        .select("memory_type, key, value, updated_at")
        .eq("user_id", userId)
        .or("expires_at.is.null,expires_at.gt.now()");
      existingMemories = Array.isArray(existing) ? existing : [];
    } catch (e) {}

    const COOLDOWN_DAYS = 30;
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    for (const candidate of candidates) {
      // Map memory types to database format (support both old and new categories)
      const memoryTypeMap = {
        trait: "profile_trait",
        constraint: "constraint",
        preference: "preference",
        future_plan: "future_plan",
        // New hybrid categories
        profile_trait: "profile_trait",
        constraint: "constraint",
        goal: "goal",
        preference: "preference",
        context_signal: "context_signal",
      };

      const memoryType = memoryTypeMap[candidate.type] || candidate.type;

      // Redact sensitive data
      const redactedValue = redactPII(candidate.value);

      // Skip if redacted or sensitive
      if (
        redactedValue !== candidate.value ||
        isSensitiveData(candidate.value)
      ) {
        skippedCount++;
        continue;
      }

      // Skip duplicate (same type+key+value) and enforce cooldown for overwrites
      const existing = existingMemories.find(
        (m) => m.memory_type === memoryType && m.key === candidate.key
      );
      if (existing) {
        const sameValue = String(existing.value) === String(redactedValue);
        const recent =
          existing.updated_at &&
          Date.now() - new Date(existing.updated_at).getTime() < cooldownMs;
        if (sameValue || recent) {
          skippedCount++;
          continue;
        }
      }

      // Upsert memory
      const memoryData = {
        user_id: userId,
        memory_type: memoryType,
        key: candidate.key,
        value: redactedValue,
        confidence_score: candidate.confidence_score || candidate.confidence,
        expires_at: getExpiryDate(memoryType),
      };

      try {
        const { error } = await supabase
          .from("user_memories")
          .upsert(memoryData, {
            onConflict: "user_id,memory_type,key",
          });
        if (error) throw error;
        savedCount++;
        console.log(`🧠 [FINNY] Saved memory: ${memoryType}:${candidate.key}`);
      } catch (supabaseError) {
        console.error(
          `🧠 [FINNY] Upsert failed for ${candidate.key}:`,
          supabaseError
        );
        errors.push(`Upsert failed: ${supabaseError.message}`);

        // Try fallback insert
        try {
          const { error: insertError } = await supabase
            .from("user_memories")
            .insert(memoryData);

          if (insertError) {
            throw insertError;
          }

          savedCount++;
          console.log(
            `🧠 [FINNY] Saved memory via insert: ${memoryType}:${candidate.key}`
          );
        } catch (fallbackError) {
          console.error(
            `🧠 [FINNY] Fallback insert failed for ${candidate.key}:`,
            fallbackError
          );
          errors.push(`Fallback insert failed: ${fallbackError.message}`);
        }
      }
    }

    console.log(
      `🧠 [FINNY] Memory save summary: ${savedCount} saved, ${skippedCount} skipped, ${errors.length} errors`
    );
    if (errors.length > 0) {
      console.error("🧠 [FINNY] Memory save errors:", errors);
    }

    // Update memory summary
    try {
      await updateMemorySummary(userId);
      console.log("🧠 [FINNY] Memory summary updated successfully");
    } catch (summaryError) {
      console.error(
        "🧠 [FINNY] Failed to update memory summary:",
        summaryError
      );
    }

    // Invalidate memory cache since we've added new memories
    invalidateMemoryCache(userId);
    console.log("🧠 [MEMORY] Cache invalidated for user:", userId);
  } catch (error) {
    console.error("🧠 [FINNY] Critical error in saveMemoryCandidates:", error);
  }
}

async function updateMemorySummary(userId) {
  try {
    const { data: memories, error: memoriesError } = await supabase
      .from("user_memories")
      .select("memory_type, key, value")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (memoriesError) {
      throw memoriesError;
    }

    if (!memories?.length) {
      console.log("🧠 [FINNY] No memories found for summary update");
      return;
    }

    const summary = await generateMemorySummary(memories, userId);

    // Only create a new summary if there's actually new information
    if (summary === null) {
      console.log(
        "🧠 [FINNY] No new information to summarize, keeping existing summary"
      );
      return;
    }

    // Insert new memory summary row (instead of updating existing)
    const { error: summaryError } = await supabase
      .from("memory_summary")
      .insert({
        user_id: userId,
        summary_text: summary,
        memory_count: memories.length,
        created_at: new Date().toISOString(),
      });

    if (summaryError) {
      throw summaryError;
    }

    console.log(
      `🧠 [FINNY] Created new memory summary with ${memories.length} memories`
    );
  } catch (error) {
    console.error("🧠 [FINNY] Error creating memory summary:", error);
    throw error; // Re-throw so the caller can handle it
  }
}

async function generateMemorySummary(memories, userId) {
  if (!memories || memories.length === 0) {
    return "I haven't learned much about you yet. Keep chatting so I can better understand your finances and goals.";
  }

  // Get the most recent summary to avoid repeating information
  let previousSummary = "";
  try {
    const { data: recentSummary } = await supabase
      .from("memory_summary")
      .select("summary_text")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    previousSummary = recentSummary?.summary_text || "";
  } catch (error) {
    // No previous summary exists, that's fine
  }

  // Group by memory type
  const grouped = memories.reduce((acc, memory) => {
    if (!acc[memory.memory_type]) acc[memory.memory_type] = [];
    acc[memory.memory_type].push(memory);
    return acc;
  }, {});

  const newInfo = [];

  // Check for new goals
  if (grouped.goal && grouped.goal.length > 0) {
    const goalTexts = grouped.goal.map((m) => m.value);
    const newGoals = goalTexts.filter(
      (goal) => !previousSummary.toLowerCase().includes(goal.toLowerCase())
    );
    if (newGoals.length > 0) {
      newInfo.push(`New goals: ${newGoals.join(", ")}`);
    }
  }

  // Check for new preferences
  if (grouped.preference && grouped.preference.length > 0) {
    const preferenceTexts = grouped.preference.map((m) => m.value);
    const newPreferences = preferenceTexts.filter(
      (pref) => !previousSummary.toLowerCase().includes(pref.toLowerCase())
    );
    if (newPreferences.length > 0) {
      newInfo.push(`Preferences: ${newPreferences.slice(0, 3).join(", ")}`);
    }
  }

  // Check for new constraints
  if (grouped.constraint && grouped.constraint.length > 0) {
    const constraintTexts = grouped.constraint.map((m) => m.value);
    const newConstraints = constraintTexts.filter(
      (constraint) =>
        !previousSummary.toLowerCase().includes(constraint.toLowerCase())
    );
    if (newConstraints.length > 0) {
      newInfo.push(`New constraints: ${newConstraints.join(", ")}`);
    }
  }

  // Check for new profile traits (only significant ones)
  if (grouped.profile_trait && grouped.profile_trait.length > 0) {
    const significantTraits = [];
    grouped.profile_trait.forEach((m) => {
      const key = m.key.replace("profile_trait.", "");
      const value = m.value;

      // Only include significant traits that aren't already mentioned
      if (
        (key === "age" ||
          key === "location" ||
          key === "occupation" ||
          key === "education" ||
          key.startsWith("family.") ||
          key.startsWith("lifestyle.")) &&
        !previousSummary.toLowerCase().includes(value.toLowerCase())
      ) {
        significantTraits.push(value);
      }
    });

    if (significantTraits.length > 0) {
      // Format profile traits more conversationally
      const profileInfo = {};
      grouped.profile_trait.forEach((m) => {
        const key = m.key.replace("profile_trait.", "");
        const value = m.value;

        if (!previousSummary.toLowerCase().includes(value.toLowerCase())) {
          if (key === "age") profileInfo.age = value;
          else if (key === "occupation") profileInfo.occupation = value;
          else if (key === "location") profileInfo.location = value;
          else if (key === "education") profileInfo.education = value;
          else if (key.startsWith("family.") || key.startsWith("lifestyle.")) {
            profileInfo.other = profileInfo.other || [];
            profileInfo.other.push(value);
          }
        }
      });

      const profileParts = [];
      if (profileInfo.age && profileInfo.occupation) {
        profileParts.push(
          `${profileInfo.age}-year-old ${profileInfo.occupation}`
        );
      } else if (profileInfo.age) {
        profileParts.push(`${profileInfo.age} years old`);
      } else if (profileInfo.occupation) {
        profileParts.push(`works as a ${profileInfo.occupation}`);
      }

      if (profileInfo.location) {
        profileParts.push(`from ${profileInfo.location}`);
      }

      if (profileInfo.education) {
        profileParts.push(`with ${profileInfo.education}`);
      }

      if (profileInfo.other && profileInfo.other.length > 0) {
        profileParts.push(...profileInfo.other);
      }

      if (profileParts.length > 0) {
        newInfo.push(`Profile: ${profileParts.join(", ")}`);
      }
    }
  }

  // Check for new context signals
  if (grouped.context_signal && grouped.context_signal.length > 0) {
    const contextTexts = grouped.context_signal.map((m) => m.value);
    const newContext = contextTexts.filter(
      (context) =>
        !previousSummary.toLowerCase().includes(context.toLowerCase())
    );
    if (newContext.length > 0) {
      newInfo.push(`Context: ${newContext.slice(0, 2).join(", ")}`);
    }
  }

  // If no new information, don't create any summary update
  if (newInfo.length === 0) {
    if (previousSummary) {
      // Keep the existing summary unchanged - don't create generic updates
      return null; // Signal to not create a new summary entry
    } else {
      // First summary - create a conversational overview
      const profileParts = [];
      const otherInfo = [];

      if (grouped.profile_trait && grouped.profile_trait.length > 0) {
        const profileInfo = {};
        grouped.profile_trait.forEach((m) => {
          const key = m.key.replace("profile_trait.", "");
          if (key === "age") profileInfo.age = m.value;
          else if (key === "occupation") profileInfo.occupation = m.value;
          else if (key === "location") profileInfo.location = m.value;
          else if (key === "education") profileInfo.education = m.value;
        });

        // Build conversational profile description
        if (profileInfo.age && profileInfo.occupation) {
          profileParts.push(
            `${profileInfo.age}-year-old ${profileInfo.occupation}`
          );
        } else if (profileInfo.age) {
          profileParts.push(`${profileInfo.age} years old`);
        } else if (profileInfo.occupation) {
          profileParts.push(`works as a ${profileInfo.occupation}`);
        }

        if (profileInfo.location) {
          profileParts.push(`from ${profileInfo.location}`);
        }

        if (profileInfo.education) {
          profileParts.push(`with ${profileInfo.education}`);
        }
      }

      if (grouped.goal && grouped.goal.length > 0) {
        otherInfo.push(`Goals: ${grouped.goal.map((m) => m.value).join(", ")}`);
      }

      if (grouped.constraint && grouped.constraint.length > 0) {
        otherInfo.push(
          `Constraints: ${grouped.constraint.map((m) => m.value).join(", ")}`
        );
      }

      if (grouped.context_signal && grouped.context_signal.length > 0) {
        otherInfo.push(
          `Context: ${grouped.context_signal.map((m) => m.value).join(", ")}`
        );
      }

      const parts = [];
      if (profileParts.length > 0) {
        parts.push(profileParts.join(", "));
      }
      if (otherInfo.length > 0) {
        parts.push(otherInfo.join(". "));
      }

      return parts.length > 0
        ? parts.join(". ") + "."
        : "Getting to know you better through our conversations.";
    }
  }

  const sentence = newInfo.join(". ") + ".";
  return sentence.length > 220 ? sentence.slice(0, 217) + "..." : sentence;
}

// LLM validator with strict schema + postfilters (whitelist + thresholds)
async function validateMemoriesWithSmallModel(
  message,
  hints,
  intent = "ask_personalized"
) {
  const allowedByIntent = {
    ask_personalized: new Set([
      // profile
      "profile_trait.age",
      "profile_trait.location",
      "profile_trait.occupation",
      "profile_trait.education",
      "profile_trait.family.marital_status",
      "profile_trait.family.relationship_status",
      "profile_trait.family.living_situation",
      // constraints
      "constraint.debt.student_loans",
      "constraint.debt.credit_card",
      // goals
      "goal.family.children",
      "goal.financial.house_down_payment",
      // context
      "context_signal.financial_stress",
      "context_signal.immigration_status",
    ]),
    goal_conversation: new Set([
      "goal.family.children",
      "goal.financial.house_down_payment",
      "constraint.debt.student_loans",
      "constraint.debt.credit_card",
      "profile_trait.location",
      "profile_trait.occupation",
      "profile_trait.education",
    ]),
  };

  // Use KEY_SYNONYMS to guide extraction, but keep an intent gate for safety
  const intentAllowed =
    allowedByIntent[intent] || allowedByIntent.ask_personalized;
  const synonymKeys = new Set(Object.keys(KEY_SYNONYMS || {}));
  const allowed = new Set([...(intentAllowed || []), ...synonymKeys]);

  try {
    const prompt = [
      // Compact, token-efficient rules
      "Return ONLY JSON: {memories:[{type,key,value,confidence,evidence:[],grounded:true|false}]}.",
      "Extract durable facts useful to a financial advisor.",
      "Grounded = explicit span in text for age/date/amount/state/role/education.",
      "Normalize values (e.g., age '20' not '20 years old').",
      "Rules:",
      "- 'I'm 20' / 'I'm a 20 year old' / '20 yo' → profile_trait.age='20' (evidence span).",
      "- 'studying X' / 'major in X' → profile_trait.education='studying X' (span).",
      "- If studying implies student, add profile_trait.occupation='student' (evidence span contains 'studying'/'student').",
      "- 'I work as' / 'I'm a <profession>' → profile_trait.occupation='<profession>'.",
      "Confidence ∈ [0.8,1.0] only when explicit. If unsure, omit.",
      "No hobbies unless financially relevant.",
      'Example→ Input: I\'m a 20 year old studying cs and finance. Output: {"memories":[{"type":"profile_trait","key":"profile_trait.age","value":"20","confidence":0.95,"evidence":["20 year old"],"grounded":true},{"type":"profile_trait","key":"profile_trait.education","value":"studying cs and finance","confidence":0.9,"evidence":["studying cs and finance"],"grounded":true},{"type":"profile_trait","key":"profile_trait.occupation","value":"student","confidence":0.85,"evidence":["studying"],"grounded":true}]}',
      `Message: ${message}`,
    ].join("\n");

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-8b-instruct:free",
        temperature: 0.0,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return ONLY valid JSON per schema." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) return [];
    const data = await r.json();
    let content = data.choices?.[0]?.message?.content || "";
    if (content.startsWith("```"))
      content = content.replace(/^```json?\s*|\s*```$/g, "");
    const parsed = JSON.parse(content);
    const raw = Array.isArray(parsed?.memories) ? parsed.memories : [];

    // Merge with hints, then filter
    const merged = [...hints, ...raw];
    const filtered = merged.filter((m) => {
      const key = m.key || "";
      const conf = m.confidence != null ? m.confidence : m.confidence_score;
      const grounded =
        m.grounded === true ||
        (Array.isArray(m.evidence) && m.evidence.length > 0);
      if (!allowed.has(key)) return false;
      if (!(conf >= 0.8)) return false;
      if (!grounded) return false;
      if (!m.value || typeof m.value !== "string") return false;
      return true;
    });

    console.log("🔍 [FINNY] Filtered memories:", filtered);

    // Deduplicate by type+key
    const unique = filtered.filter(
      (m, i, self) =>
        i === self.findIndex((x) => x.type === m.type && x.key === m.key)
    );
    return unique;
  } catch {
    return [];
  }
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
  saveMemoryCandidates,
  updateMemorySummary,
  generateMemorySummary,
  validateMemoriesWithSmallModel,
};
