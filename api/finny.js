// api/finny.js
import { createClient } from "@supabase/supabase-js";
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
  saveConversationContext,
  updateConversationContext,
  getCachedMemory,
  setCachedMemory,
  invalidateMemoryCache,
  selectRelevantMemories,
  categorizeSelectedMemories,
  loadUserMemory,
  isSensitiveData,
  getExpiryDate,
  saveMemoryCandidates,
  updateMemorySummary,
  generateMemorySummary,
  validateMemoriesWithSmallModel,
} from "./memory.js";

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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// Cache TTLs for different data types (in milliseconds)
const CACHE_TTL = {
  financial_summary: 5 * 60 * 1000, // 5 minutes
  spend_data: 30 * 60 * 1000, // 30 minutes
  investments_all: 6 * 60 * 60 * 1000, // 6 hours consolidated investments
  goals_overview: 60 * 60 * 1000, // 60 minutes
  cashflow_monthly: 30 * 60 * 1000, // 30 minutes
  net_worth: 10 * 60 * 1000, // 10 minutes
  category_transactions: 30 * 60 * 1000, // 30 minutes
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

  console.log(
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
function getCachedUserData(dataType, userId, params = {}) {
  const key = generateDataCacheKey(dataType, userId, params);
  const cached = dataCache.get(key);

  if (cached && Date.now() < cached.expires_at) {
    console.log(`✅ [DATA_CACHE] Cache HIT for ${dataType} (${key})`);
    return cached.data;
  }

  if (cached) {
    console.log(`⏰ [DATA_CACHE] Cache EXPIRED for ${dataType} (${key})`);
    dataCache.delete(key);
  }

  return null;
}

// Set cached user data
function setCachedUserData(dataType, userId, data, params = {}) {
  const key = generateDataCacheKey(dataType, userId, params);
  const ttl = CACHE_TTL[dataType] || 5 * 60 * 1000; // Default 5 minutes
  const expires_at = Date.now() + ttl;

  dataCache.set(key, {
    data,
    expires_at,
    cached_at: Date.now(),
    dataType,
    userId,
    params,
  });

  const ttlMinutes = Math.round(ttl / (60 * 1000));
  console.log(
    `💾 [DATA_CACHE] Cached ${dataType} (${key}) - expires in ${ttlMinutes} minutes`
  );

  // Clean up expired entries periodically (every 50 cache writes)
  if (dataCache.size % 50 === 0) {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of dataCache.entries()) {
      if (now >= value.expires_at) {
        dataCache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 [DATA_CACHE] Cleaned up ${cleaned} expired entries`);
    }
  }
}

// Heuristic pre-pass for quick memory extraction (1ms)
function quickExtract(message) {
  const hints = [];
  const lower = message.toLowerCase();

  // Family status
  if (
    lower.includes("wife") ||
    lower.includes("husband") ||
    lower.includes("married")
  ) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.marital_status",
      value: "married",
      confidence: 0.9,
    });
  }

  if (
    lower.includes("girlfriend") ||
    lower.includes("boyfriend") ||
    lower.includes("dating")
  ) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.relationship_status",
      value: "dating",
      confidence: 0.9,
    });
  }

  // Living situation
  if (lower.includes("live with") && lower.includes("parents")) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.living_situation",
      value: "with parents",
      confidence: 0.9,
    });
  }

  if (lower.includes("roommate") || lower.includes("roommates")) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.family.living_situation",
      value: "with roommates",
      confidence: 0.9,
    });
  }

  // Financial constraints
  if (lower.includes("student loan") || lower.includes("student debt")) {
    hints.push({
      type: "constraint",
      key: "constraint.debt.student_loans",
      value: "has student loan debt",
      confidence: 0.9,
    });
  }

  if (lower.includes("credit card") && lower.includes("debt")) {
    hints.push({
      type: "constraint",
      key: "constraint.debt.credit_card",
      value: "has credit card debt",
      confidence: 0.9,
    });
  }

  // Goals
  if (
    lower.includes("kid") ||
    lower.includes("baby") ||
    lower.includes("children")
  ) {
    hints.push({
      type: "goal",
      key: "goal.family.children",
      value: "planning to have children",
      confidence: 0.9,
    });
  }

  if (
    lower.includes("house") ||
    lower.includes("home") ||
    lower.includes("buy")
  ) {
    hints.push({
      type: "goal",
      key: "goal.financial.house_down_payment",
      value: "planning to buy a house",
      confidence: 0.8,
    });
  }

  // Context signals
  if (
    lower.includes("stressed") ||
    lower.includes("worried") ||
    lower.includes("anxious")
  ) {
    hints.push({
      type: "context_signal",
      key: "context_signal.financial_stress",
      value: "experiencing financial stress",
      confidence: 0.9,
    });
  }

  // Age detection
  const ageMatch = lower.match(/(\d+)\s*(years?\s*old|yo)/);
  if (ageMatch) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.age",
      value: ageMatch[1],
      confidence: 0.95,
    });
  }

  // Location detection
  const locationMatch = lower.match(/(live in|from|based in)\s+([a-z\s]+)/i);
  if (locationMatch) {
    hints.push({
      type: "profile_trait",
      key: "profile_trait.location",
      value: locationMatch[2].trim(),
      confidence: 0.8,
    });
  }

  // Generic interest/hobby detection (let LLM handle specifics)
  const interestPatterns = [
    /(love|like|enjoy|into|passionate about|interested in)\s+([a-z\s]+)/i,
    /(hobby|hobbies)\s+(is|are)\s+([a-z\s]+)/i,
    /(i'm a|i am a)\s+([a-z\s]+)\s+(geek|nerd|enthusiast|fan)/i,
  ];

  for (const pattern of interestPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const interest = match[2] || match[3];
      if (interest && interest.length > 2 && interest.length < 20) {
        hints.push({
          type: "profile_trait",
          key: `profile_trait.interests.${interest
            .trim()
            .replace(/\s+/g, "_")}`,
          value: interest.trim(),
          confidence: 0.8,
        });
      }
    }
  }

  return hints;
}

// Goal extraction function moved to goals.js

// Goal feasibility analysis function moved to goals.js

// Goal conversation handler moved to goals.js

// Goal handler functions moved to goals.js

// Hybrid memory extraction gating — cheap pre-checks before any LLM call
function shouldRunMemoryExtraction(message, intent = "ask_personalized") {
  try {
    const m = (message || "").toLowerCase();
    if (!m) return false;

    // Block obvious non-personal requests
    const genericAdvice = [
      "which credit card",
      "best credit card",
      "what credit card",
      "rent vs buy",
      "what's the best",
      "which is better",
      "compare",
      "comparison",
      "rate",
      "rates",
      "news",
      "limit",
      "limits",
    ];
    if (genericAdvice.some((k) => m.includes(k))) return false;

    // Only allow when first-person disclosures + grounded signals appear
    const firstPerson = /\b(i|i'm|im|i am|my|we|we're|we are)\b/.test(m);
    if (!firstPerson) return false;

    // Grounded signals: age, dependents, amounts, timeframe, occupation, location, hard constraints
    const hasAge = /(\d{2})\s*(years?\s*old|yo)\b/.test(m);
    const hasDependents = /dependents?|kids?|children/.test(m);
    const hasAmount = /\$?\d{2,}(,\d{3})*(\.\d+)?/.test(m);
    const hasTimeframe =
      /(months?|years?|by\s+\d{4}|in\s+\d{4}|next\s+(year|\d+\s*years?))/i.test(
        m
      );
    const hasOccupation =
      /(work as|i am a|i'm a)\s+[a-z\s]+/.test(m) ||
      /(studying|study)\s+[a-z\s]+/.test(m);
    const hasLocation = /(live in|based in|from)\s+[a-z\s]+/.test(m);
    const hasConstraint =
      /(student loan|student debt|credit card debt|medical debt|personal loan|car loan)/.test(
        m
      );

    const groundedSignals = [
      hasAge,
      hasDependents,
      hasAmount,
      hasTimeframe,
      hasOccupation,
      hasLocation,
      hasConstraint,
    ].filter(Boolean).length;

    // Local personal-signal gate (immigration/moving/stress/education/occupation)
    if (localPersonalSignalGate(m)) return true;

    // Require at least one grounded signal, two if intent isn't explicitly goal-related
    if (intent === "goal_conversation") return groundedSignals >= 1;
    return groundedSignals >= 1;
  } catch {
    return false;
  }
}

// === Deterministic fallback extraction helpers ===
function cleanValue(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "unknown" || s === "n/a" || s === "na" || s === "none") return null;
  return String(v);
}

function sanitizeLocation(raw) {
  if (!raw) return raw;
  let s = String(raw).trim();
  s = s.replace(/\s*(,|;).*$/g, "");
  s = s.replace(/\s+and\b[\s\S]*$/i, "");
  s = s.replace(
    /\s+(planning|plan|thinking|saving|want|to\s+buy|buy|down payment|target)\b[\s\S]*$/i,
    ""
  );
  s = s.replace(/\s+in\s+\d+\s+(years?|months?|yrs?|mos?)\b[\s\S]*$/i, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

function parseAmount(raw) {
  if (!raw) return null;
  const m = raw
    .toLowerCase()
    .match(/\$?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)([km])?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (m[2] === "k") n *= 1000;
  if (m[2] === "m") n *= 1000000;
  return Math.round(n);
}

function extractAmount(message) {
  const re = /(\$?[0-9][0-9,]*(?:\.[0-9]+)?[km]?)/gi;
  const candidates = [];
  let m;
  const lower = message.toLowerCase();
  const MONEY_HINTS = [
    "$",
    "k",
    "m",
    "save",
    "saving",
    "target",
    "down payment",
    "budget",
  ];
  const TIME_HINTS = [
    "year",
    "years",
    "yr",
    "y",
    "month",
    "months",
    "mo",
    "mos",
  ];
  while ((m = re.exec(message)) !== null) {
    const token = m[1];
    const start = m.index;
    const end = start + token.length;
    const around = lower.slice(
      Math.max(0, start - 16),
      Math.min(lower.length, end + 16)
    );
    const hasMoneySignal =
      token.includes("$") ||
      /[km]$/i.test(token.trim()) ||
      MONEY_HINTS.some((h) => around.includes(h));
    const hasTimeSignal = TIME_HINTS.some((h) => around.includes(h));
    if (hasTimeSignal && !hasMoneySignal) continue;
    const value = parseAmount(token);
    if (value)
      candidates.push({ value, hasSuffix: /[km]$/i.test(token.trim()) });
  }
  if (candidates.length === 0) return null;
  const withSuffix = candidates.filter((c) => c.hasSuffix);
  if (withSuffix.length > 0) return Math.max(...withSuffix.map((c) => c.value));
  return Math.max(...candidates.map((c) => c.value));
}

function extractTimeframeYears(message) {
  const m = message.toLowerCase().match(/(\d+)\s*(years?|yrs?|y)/);
  if (m) return parseInt(m[1], 10);
  const m2 = message.toLowerCase().match(/(\d+)\s*(months?|mos?|m)/);
  if (m2) return Math.max(1, Math.round(parseInt(m2[1], 10) / 12));
  if (/next\s+year/i.test(message)) return 1;
  return null;
}

function extractAge(message) {
  const m = message.toLowerCase().match(/\b(i am|i'm|im)\s*(\d{1,2})\b/);
  if (m) return parseInt(m[2], 10);
  return null;
}

function fallbackExtractCandidates(message, hints) {
  const lower = (message || "").toLowerCase();
  const out = [];

  const kidsCountMatch = lower.match(/(\b\d+\b)\s*(kids?|children)/);
  if (kidsCountMatch) {
    const numKids = parseInt(kidsCountMatch[1], 10);
    if (!Number.isNaN(numKids)) {
      out.push({
        type: "profile_trait",
        key: "profile_trait.family.children",
        value: numKids === 1 ? "has 1 child" : `has ${numKids} children`,
        confidence: 0.9,
        grounded: true,
        evidence: [kidsCountMatch[0]],
      });
    }
  }

  const age = extractAge(message);
  if (age && age >= 13 && age <= 100) {
    out.push({
      type: "profile_trait",
      key: "profile_trait.age",
      value: String(age),
      confidence: 0.9,
      grounded: true,
      evidence: [String(age)],
    });
  }

  const locMatch = lower.match(/(live in|based in|from)\s+([a-z\s]+)/i);
  if (locMatch) {
    const loc = sanitizeLocation(locMatch[2].trim());
    if (loc && loc.length <= 40)
      out.push({
        type: "profile_trait",
        key: "profile_trait.location",
        value: loc,
        confidence: 0.85,
        grounded: true,
        evidence: [locMatch[0]],
      });
  }
  const hintLoc = (hints || []).find((h) => h.key === "profile_trait.location");
  if (hintLoc)
    out.push({
      type: "profile_trait",
      key: "profile_trait.location",
      value: sanitizeLocation(hintLoc.value),
      confidence: hintLoc.confidence || 0.8,
      grounded: true,
      evidence: [hintLoc.value],
    });

  if (/(house|home|buy a house|down payment)/i.test(message)) {
    const amount = extractAmount(message);
    const years = extractTimeframeYears(message);
    const parts = [];
    if (amount) parts.push(`target $${amount}`);
    if (years) parts.push(`in ${years} year${years > 1 ? "s" : ""}`);
    const val = parts.length ? parts.join(", ") : "planning to buy a house";
    out.push({
      type: "goal",
      key: "goal.financial.house_down_payment",
      value: val,
      confidence: 0.85,
      grounded: !!(amount || years),
      evidence: [val],
    });
  }

  const married = (hints || []).find(
    (h) => h.key === "profile_trait.family.marital_status"
  );
  if (married)
    out.push({
      type: "profile_trait",
      key: married.key,
      value: married.value,
      confidence: married.confidence || 0.85,
      grounded: true,
      evidence: [married.value],
    });

  const hintKids = (hints || []).find((h) => h.key === "goal.family.children");
  if (hintKids && !kidsCountMatch) {
    out.push({
      type: "profile_trait",
      key: "profile_trait.family.children",
      value: "has children",
      confidence: hintKids.confidence || 0.8,
      grounded: true,
      evidence: [hintKids.value],
    });
  }

  const ccDebt = (hints || []).find(
    (h) => h.key === "constraint.debt.credit_card"
  );
  if (ccDebt)
    out.push({
      type: "constraint",
      key: ccDebt.key,
      value: ccDebt.value,
      confidence: ccDebt.confidence || 0.85,
      grounded: true,
      evidence: [ccDebt.value],
    });

  const unique = out.filter(
    (m, i, self) =>
      i === self.findIndex((x) => x.type === m.type && x.key === m.key)
  );
  return unique;
}

// Local gate for additional personal signals
function localPersonalSignalGate(m) {
  try {
    const text = (m || "").toLowerCase();
    if (!text) return false;
    const edu =
      /(college|university|degree|bachelor|masters|phd|cs degree|computer science|student|studying|study)/i.test(
        text
      );
    const occ =
      /(run|own|operate|freelance|freelancer|founder|entrepreneur|business|work as|i'm a|i am a|engineer|nurse|teacher|designer|developer)/i.test(
        text
      );
    const imm =
      /(visa|immigration|work authorization|green card|h1b|h-1b|opt|cpt|f1|j1|asylum)/i.test(
        text
      );
    const move = /(moving to|relocating to|moved to)/i.test(text);
    const stress =
      /(stressed|anxious|worried)\s+about\s+(money|bills|debt)/i.test(text);
    return edu || occ || imm || move || stress;
  } catch {
    return false;
  }
}

// validateMemoriesWithSmallModel moved to memory.js
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
        console.log(
          "📝 [CONVERSATION_LOG] Logged conversation to Supabase:",
          conversationData.timestamp
        );
        return; // Success
      }
    } catch (error) {
      console.error(
        `❌ [CONVERSATION_LOG] Attempt ${attempt}/${maxRetries} failed:`,
        error.message
      );

      if (attempt === maxRetries) {
        console.error(
          "❌ [CONVERSATION_LOG] All retry attempts failed, giving up"
        );
        return; // Don't throw error - logging failure shouldn't break the API
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }
}

export default async function handler(req, res) {
  console.log("🤖 [FINNY] Request received:", req.method);

  if (req.method !== "POST") {
    console.log("❌ [FINNY] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if client wants streaming response
  const wantsStreaming = req.body.stream === true;
  if (wantsStreaming) {
    // Set SSE headers for streaming
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });
  }

  const { action, message, context, classification, ...otherParams } = req.body;
  console.log("📝 [FINNY] Action:", action);
  // Avoid logging full message/context to reduce PII exposure
  console.log("📊 [FINNY] Context provided:", context ? "Yes" : "No");

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
      console.log(
        "🔍 [CONTEXT DEBUG] First message in chat session - skipping context loading"
      );
    } else {
      conversationContext = existingContext;
      console.log(
        "🔍 [CONTEXT DEBUG] Continuing conversation - loading context"
      );
    }
  }

  // 🔍 DEBUG: Log conversation context loading
  console.log("🔍 [CONTEXT DEBUG] Loading conversation context:");
  console.log("  - Chat ID:", chatId);
  console.log("  - User ID:", finalUserId);
  console.log("  - Is first message:", isFirstMessage);
  console.log("  - Context loaded:", conversationContext ? "YES" : "NO");
  if (conversationContext) {
    console.log("  - Active topic:", conversationContext.active_topic);
    console.log(
      "  - Last entity:",
      JSON.stringify(conversationContext.last_entity)
    );
    console.log("  - Pending action:", conversationContext.pending_action);
    console.log(
      "  - Last messages count:",
      conversationContext.last_messages?.length || 0
    );
  }

  let sessionState = getSessionState(finalUserId);
  const safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    chat_id: chatId,
    profile: userProfile,
    // carry session short-term state into handlers
    session: sessionState,
    // NEW: Add conversation context
    conversationContext: conversationContext,
    conversation_context: conversationContext, // Keep both for compatibility
    // NEW: Add memory reading
    memory: await loadUserMemory(finalUserId),
  };

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
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
  console.log("🔍 [FINNY] Starting ask handler for message:", message);
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
    // 0) If this looks like a stock question, route to conversational stock handler
    if (looksLikeStockQuery(message)) {
      try {
        // Get user context for personalization
        const userId = context?.user_id;
        if (!userId) {
          console.log(
            "❌ [FINNY] No user_id for stock query, falling back to regular flow"
          );
          // Fall through to regular ask handler
        } else {
          // Load user context for stock queries
          const userMemory = await loadUserMemory(userId);
          const userProfile = context.profile || { name: null, age: null };

          // Get investment holdings if available
          const investmentHoldings = await getCachedUserData(
            "investments_all",
            userId
          );

          let stockData = null;
          let stockPlan = null;

          // Try deep query first
          if (looksLikeStockDeepQuery(message)) {
            console.log(
              "🔍 [STOCK] Deep query detected, using advanced analysis"
            );
            stockPlan = await planStockRequest(message);
            const exec = await executeStockPlan(stockPlan || {}, message);
            if (!exec.error && exec.data?.current != null) {
              stockData = exec;
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

            // Generate conversational stock response
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
                  model: OPENROUTER_MODEL,
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
            console.log(
              "🔍 [STOCK CONTEXT] Context metadata:",
              contextMetadata
            );

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
                  model: OPENROUTER_MODEL,
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

            return response;
          }
        }
      } catch (e) {
        console.log(
          "ℹ️ [FINNY] Conversational stock handler failed, falling back:",
          e?.message
        );
      }
    }

    // 1) Get user_id from context
    const userId = context?.user_id;

    if (!userId) {
      console.log("❌ [FINNY] No user_id provided in context");
      return {
        message: cleanResponseFormatting(
          "I need to know who you are to provide personalized advice. Please try again."
        ),
        type: "assistant",
      };
    }

    // 2) NEW: Use deterministic context planner
    console.log("🎯 [FINNY] Using deterministic context planner");
    const slots = extractSlots(message);
    const needs = planNeeds(slots, message);

    console.log("🎯 [FINNY] Extracted slots:", slots);
    console.log("🎯 [FINNY] Planned needs:", needs);

    // 2.1) Check if web search is needed
    let webResults = [];
    let webSummary = "";

    // Use passed classification result or fallback to keyword detection
    if (!classificationResult) {
      console.log(
        "⚠️ [FINNY] No classification result passed, using keyword fallback"
      );
    }

    // Use classification.needs_web as primary, with keyword detection as fallback
    const needsWeb =
      classificationResult?.needs_web || detectWebSearchNeeded(message, slots);

    console.log("🌍 [FINNY] Web search decision:", {
      classification_needs_web: classificationResult?.needs_web,
      keyword_fallback: detectWebSearchNeeded(message, slots),
      final_decision: needsWeb,
    });

    if (needsWeb) {
      console.log("🌍 [FINNY] Web search needed, fetching fresh data...");
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
          console.log(
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

          console.log(
            `✅ [FINNY] Combined ${searchResults.length} searches into ${webResults.length} unique results`
          );

          // Add user prompt to context for AI response
          if (enhancedData.userPrompt) {
            context.userPrompt = enhancedData.userPrompt;
            console.log(
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
          console.log("📄 [FINNY] Web summary for prompt:", webSummary);
          toolsUsed.push("brave-search");
        } else {
          console.log("⚠️ [FINNY] Web search returned no results");
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
      console.log("🔄 [FINNY] Force refresh requested, clearing cache...");
      await forceRefreshUserData(userId);
    }

    // 3) Build targeted context packs
    const { packs, gaps, contextHeader } = await buildContextPacks(
      userId,
      needs,
      slots
    );

    console.log("📦 [FINNY] Context packs built:", Object.keys(packs));
    console.log("⚠️ [FINNY] Data gaps:", gaps);

    // 4) Build focused prompt using context packs
    const system = [
      "You are Finny: a warm, encouraging, and empowering financial advisor who is blunt when needed.",
      "",
      "PERSONALITY & APPROACH:",
      "- Be warm and encouraging while maintaining professional expertise",
      "- Show enthusiasm for helping users achieve their financial goals",
      "- Be blunt and direct when users need to hear hard truths about their finances",
      "- Celebrate wins and progress, no matter how small",
      "- Use the user's name when available to create personal connection",
      "- Focus on financial empowerment and positive outcomes",
      "",
      "GEN Z COMMUNICATION STYLE:",
      "- Keep responses concise (150-200 words max per message)",
      "- Use direct, conversational language (avoid corporate jargon)",
      "- Be engaging but professional (not overly casual)",
      "- Use strategic emojis sparingly (📊 for data, 💰 for money, 🎯 for goals)",
      "- Say 'Hey!' instead of 'Hello' for greetings",
      "- Use 'I'd say' instead of 'I think' for opinions",
      "- Use 'But' instead of 'However' for transitions",
      "- Use 'Plus' instead of 'Additionally' for extra points",
      "- Use 'Heads up' instead of 'It's important to note'",
      "- End with casual but professional phrases like 'Hit me up or Let me know if you need anything' but not always.",
      "- Keep financial terminology intact (volatility, sector concentration, etc.)",
      "- Maintain professional credibility while being more engaging and casual",
      "",
      "EMPATHETIC ENGAGEMENT:",
      "- ALWAYS acknowledge and engage with personal information users share, even if not directly financial",
      "- Show genuine interest in their life, studies, career, location, hobbies, or experiences",
      "- Make connections between their personal situation and financial advice when relevant",
      "- Respond with warmth and understanding to personal details like age, location, occupation, or interests",
      "- Examples: If someone says they're a 20-year-old software engineer student in Tucson, respond with something like 'That's awesome that you're studying software engineering in Tucson! That's such a growing field with great earning potential.'",
      "- If users share non-financial information, acknowledge it warmly before transitioning to financial topics",
      "- Build rapport by showing you care about them as a person, not just their finances",
      "",
      // Smart memory context with relevance-based selection
      // Session summary (short-term conversation memory)
      // Session summary removed
      ...(context.memory?.summary
        ? [`User context: ${context.memory.summary}`]
        : []),
      ...(() => {
        // Select relevant memories based on message and intent
        const selectedMemories = selectRelevantMemories(
          context.memory,
          message,
          intent, // Use the actual intent passed to handleAsk
          context.profile
        );
        const categorized = categorizeSelectedMemories(selectedMemories);

        return [
          // Profile traits
          ...(categorized.profile_trait?.length
            ? [
                `Traits: ${categorized.profile_trait
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Constraints
          ...(categorized.constraint?.length
            ? [
                `Constraints: ${categorized.constraint
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Preferences
          ...(categorized.preference?.length
            ? [
                `Preferences: ${categorized.preference
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Future plans
          ...(categorized.future_plan?.length
            ? [
                `Future plans: ${categorized.future_plan
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Context signals
          ...(categorized.context_signal?.length
            ? [
                `Context signals: ${categorized.context_signal
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
          // Goals
          ...(categorized.goal?.length
            ? [
                `Goals: ${categorized.goal
                  .map((m) => `${m.key}: ${m.value}`)
                  .join(", ")}`,
              ]
            : []),
        ];
      })(),
      "",
      // Add web context if available
      ...(webSummary
        ? [
            "WEB CONTEXT:",
            "The following is current information from web search:",
            "",
            webSummary,
            "",
            "IMPORTANT: Use the web search results above for current information. These results are more up-to-date than training data.",
            "",
            "SOURCE INCLUSION: When using web search results, ALWAYS include 2-3 most relevant source URLs in your response. Format them as links at the end of your response under a 'Sources:' section. Choose the most authoritative and directly relevant sources. Do NOT overwhelm with too many sources - quality over quantity.",
            "",
            "LINK PROVISION: When suggesting users go online for additional resources (like checking credit scores, applying for credit cards, or accessing specific services), ALWAYS provide the direct link if you have it. This saves users time and provides immediate access to the resources you're recommending.",
            "",
            // Add user prompt if available
            ...(context.userPrompt
              ? ["USER GUIDANCE:", context.userPrompt, ""]
              : []),
          ]
        : []),
      "RESPONSE GUIDELINES:",
      "- Be CONCISE and focused - only answer what the user is asking for",
      "- Don't overwhelm users with too much information at once",
      "- ALWAYS prioritize web search results over training data for current information (rates, limits, rules, etc.)",
      "- If user asks about 'accounts', show individual account names, balances, and types from the provided account data",
      "- If user asks 'net worth' or 'what's my net worth', ALWAYS include a brief breakdown: show total plus top 2–3 contributors across assets and liabilities (e.g., cash, investments, credit card debt). Keep it concise, no long lists",
      "- If user asks about 'investments' or 'holdings', then show the detailed holdings",
      "- If user asks for 'investment advice' or 'financial advice', focus on actionable recommendations, not data dumps",
      "- Keep responses conversational and encouraging, not overwhelming",
      "- Provide actionable advice that users can implement immediately",
      "- Explain financial concepts in simple, understandable terms",
      "- Connect advice to the user's specific financial situation when possible",
      "- For general advice requests, give 2-3 key recommendations rather than comprehensive breakdowns",
      "- If required data is missing (e.g., no transactions or summary), explicitly say so and ask the user to refresh or connect accounts. Do NOT fabricate data.",
      "- When listing transactions, ONLY use transactions present in the provided context. If none exist, say you couldn't find recent transactions.",
      "- For amounts like net worth, ONLY use values from the context. If missing, state that it's unavailable.",
      "- NEVER make meta-references to data sources or summaries. Avoid phrases like 'matching the summary', 'as shown in your summary', 'according to your data', or 'based on your financial summary'.",
      "- Present information as if it's naturally known, without mentioning where you got it from or how you accessed it.",
      "",
      "RESPONSE STRUCTURE FOR BETTER MESSAGE SPLITTING:",
      "- For GOAL queries: Structure as 'Here's your current goals:' followed by all goals in bullet points in ONE cohesive message, then separate message for progress commentary",
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
      "",
      "FINANCIAL PROJECTIONS & CALCULATIONS:",
      "- When users ask about retirement, FIRE, or financial goals, perform compound growth calculations using their actual data",
      "- Use realistic assumptions: 7% annual return for investments, 3% inflation for long-term projections",
      "- For retirement projections: Target 25x annual expenses (4% rule) unless user specifies different amount",
      "- Calculate monthly savings needed to reach goals and provide specific, actionable recommendations",
      "- Show both optimistic and conservative scenarios when appropriate",
      "- Always explain the math behind your projections in simple terms",
      "- If user asks 'can I achieve X goal', provide a clear yes/no with supporting calculations",
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
      "- Always end responses by encouraging users to ask Finny about their specific financial questions",
    ].join("\n");

    // Build context from packs
    const contextLines = [contextHeader];

    if (packs.base) {
      contextLines.push("Financial Summary:");
      contextLines.push(`Net Worth: $${packs.base.netWorth}`);
      contextLines.push(`Liquid Assets: $${packs.base.liquidAssets}`);
      contextLines.push(`Investments Total: $${packs.base.investmentsTotal}`);
      contextLines.push(`Total Liabilities: $${packs.base.totalLiabilities}`);

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
      contextLines.push("Investment holdings:");
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

    if (packs.goals?.cashflow?.length > 0) {
      contextLines.push("Recent cashflow:");
      packs.goals.cashflow.forEach((cf) => {
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
    console.log("🔍 [FINNY] Context note:", contextNote);

    // 5) Parallel processing: Main response + Memory extraction
    const llmT0 = Date.now();

    // Quick heuristic pre-pass (1ms)
    const hints = quickExtract(message);

    // Parallel execution
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
          model: OPENROUTER_MODEL,
          temperature: 0.6,
          max_tokens: 1200,
          stream: false,
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
    console.log("🔍 [CONTEXT DEBUG] After LLM call:");
    console.log("  - Message:", message);
    console.log("  - Context provided:", contextNote ? "YES" : "NO");
    if (contextNote) {
      console.log(
        "  - Context content:",
        contextNote.substring(0, 200) + "..."
      );
    }
    console.log(
      "  - Conversation context loaded:",
      context?.conversationContext ? "YES" : "NO"
    );
    if (context?.conversationContext) {
      console.log(
        "  - Active topic:",
        context.conversationContext.active_topic
      );
      console.log("  - Last entity:", context.conversationContext.last_entity);
      console.log(
        "  - Pending action:",
        context.conversationContext.pending_action
      );
    }

    // Hybrid memory extraction: pre-gate + validator + deterministic fallback
    if (shouldRunMemoryExtraction(message, intent)) {
      const validated = await validateMemoriesWithSmallModel(
        message,
        hints,
        intent
      );
      let merged = validated || [];
      if (!merged || merged.length === 0) {
        const fallback = fallbackExtractCandidates(message, hints);
        if (fallback.length > 0) merged = fallback;
      } else {
        const fallback = fallbackExtractCandidates(message, hints);
        if (fallback.length > 0) {
          const seen = new Set(merged.map((m) => `${m.type}|${m.key}`));
          for (const f of fallback) {
            const k = `${f.type}|${f.key}`;
            if (!seen.has(k)) merged.push(f);
          }
        }
      }

      // Filter unknown/empty values and enforce high confidence
      memoryExtraction = (merged || [])
        .filter((m) => m && typeof m.value === "string" && cleanValue(m.value))
        .filter((m) => {
          const conf = m.confidence != null ? m.confidence : m.confidence_score;
          return conf >= 0.8;
        })
        .filter(
          (m, i, self) =>
            i === self.findIndex((x) => x.type === m.type && x.key === m.key)
        );
    } else {
      memoryExtraction = [];
      console.log("🧠 [MEMORY] Skipping extraction (gates not satisfied)");
    }

    timings.llm_ms = Date.now() - llmT0;
    toolsUsed.push({
      name: "llm",
      latency_ms: timings.llm_ms,
      cache_hit: false,
    });

    if (!resp.ok) {
      console.error("❌ [FINNY] OpenRouter API error:", resp.status);
      return {
        message: cleanResponseFormatting("I'm glitching right now—try again."),
        type: "assistant",
      };
    }

    const data = await resp.json();
    const cleanText =
      data.choices?.[0]?.message?.content ?? "I'm not sure yet. Ask me again?";

    // Save memories (skip when none)
    if (memoryExtraction.length > 0) {
      console.log(
        `🧠 [FINNY] Prepared ${memoryExtraction.length} memory candidates`
      );
      try {
        await saveMemoryCandidates(context?.user_id, memoryExtraction);
      } catch (error) {
        console.log("🧠 [FINNY] Memory save failed:", error?.message);
      }
    } else {
      console.log("🧠 [FINNY] No memories to save");
    }

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
    const conversationData = {
      user_message: redactPII(message),
      finny_response: redactPII(cleanText),
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
  if (detectOffTopic(message)) return false;

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

// Enhanced off-topic detection
function detectOffTopic(message) {
  const lower = message.toLowerCase();

  const financeTerms = [
    "credit",
    "debit",
    "card",
    "cards",
    "account",
    "accounts",
    "spend",
    "spent",
    "spending",
    "transaction",
    "transactions",
    "budget",
    "net worth",
    "invest",
    "investment",
    "investments",
    "stock",
    "stocks",
    "ira",
    "401k",
    "roth",
    "rate",
    "rates",
    "limit",
    "limits",
    "buy",
    "buying",
    "purchase",
    "house",
    "home",
    "achieve",
    "goal",
    "goals",
    "save",
    "saving",
    "afford",
    "affordable",
    "money",
    "financial",
    "finance",
    "finances",
    "wealth",
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
    "budget",
    "budgeting",
    "expense",
    "expenses",
    "cash",
    "dollar",
    "dollars",
    "cent",
    "cents",
  ];
  if (financeTerms.some((t) => lower.includes(t))) {
    return false;
  }

  // Broad weather/forecast detection
  if (lower.includes("weather") || lower.includes("forecast")) {
    return true;
  }

  // Broad off-topic indicators beyond patterns: ethics, emotions, philosophy, AI meta, culture, jokes/riddles
  const offTopicBroad = [
    // ethics & morality
    "acceptable to lie",
    "is it ok to lie",
    "is it ever acceptable",
    "ethical",
    "morality",
    "moral",
    // emotions / mental health
    "feeling really down",
    "depressed",
    "anxious",
    "anxiety",
    "sad",
    // philosophy
    "meaning of life",
    "purpose of life",
    "existential",
    // AI meta
    "surpass human intelligence",
    "are you an ai",
    "do you know that you're an ai",
    "can you learn from our previous conversations",
    // humor / riddles
    "why did the chicken cross the road",
    "riddle",
    // culture / etiquette
    "best practices for greeting",
    "etiquette",
    "cultural",
  ];
  if (offTopicBroad.some((p) => lower.includes(p))) {
    return true;
  }

  // Ambiguous generic noun: if contains "bank" without financial context keywords, treat as off-topic
  if (
    lower.includes("bank") ||
    lower.includes("loan") ||
    (lower.includes("debt") &&
      !/account|loan|interest|branch|routing|checking|savings|credit|debit/.test(
        lower
      ))
  ) {
    return false;
  }

  // Strong off-topic indicators (specific patterns)
  const offTopicPatterns = [
    // Trust/meta questions
    "can i trust you",
    "are you trustworthy",
    "can we trust",
    "is this trustworthy",
    "are you reliable",
    "can i trust this",
    "can i rely on you",

    // Weather & environment
    "what's the weather",
    "weather today",
    "weather forecast",
    "temperature today",
    "is it raining",
    "is it sunny",
    "weather like",
    "what's the weather like",

    // Cooking & food
    "recipe for",
    "cooking",
    "baking",

    // Entertainment
    "what movie",
    "watch",
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

    // General chat
    "hello",
    "hi",
    "hey",
    "how are you",
    "what's up",
    "good morning",
    "good evening",
    "joke",
    "funny",
    "laugh",
    "humor",
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
    "student",
  ];

  return offTopicPatterns.some((pattern) => lower.includes(pattern));
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
    lowerMessage.includes("spend") ||
    lowerMessage.includes("expense") ||
    lowerMessage.includes("food") ||
    lowerMessage.includes("shopping")
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
    lowerMessage.includes("bank")
  ) {
    topic = "accounts";
  } else if (
    lowerMessage.includes("invest") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("stock") ||
    lowerMessage.includes("retirement")
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
      console.log("⚠️ [FINNY] No valid needs provided, returning empty packs");
      return {
        packs,
        gaps,
        contextHeader: "CONTEXT_PACKS_INCLUDED: []\nDATA_GAPS: []",
      };
    }

    console.log(
      `🚀 [FINNY] Building context packs for needs: [${needs.join(", ")}]`
    );

    // OPTIMIZED: Create optimized fetch operations with better batching
    const fetchOperations = createOptimizedFetchOperations(
      userId,
      needs,
      slots
    );

    if (fetchOperations.length === 0) {
      console.log(
        "⚠️ [FINNY] No fetch operations needed, returning empty packs"
      );
      return {
        packs,
        gaps,
        contextHeader: "CONTEXT_PACKS_INCLUDED: []\nDATA_GAPS: []",
      };
    }

    // OPTIMIZED: Execute all operations in parallel with better error handling
    console.log(
      `🚀 [FINNY] Executing ${fetchOperations.length} optimized fetch operations in parallel...`
    );

    const results = await Promise.allSettled(
      fetchOperations.map((op) => executeFetchOperation(op))
    );

    const fetchTime = Date.now() - startTime;
    console.log(`✅ [FINNY] All fetch operations completed in ${fetchTime}ms`);

    // OPTIMIZED: Process results with better error handling and caching
    processFetchResults(results, fetchOperations, packs, gaps);
  } catch (error) {
    console.error("❌ [FINNY] Error building context packs:", error);
    // Add all needs as gaps if there's a critical error
    needs.forEach((need) => {
      if (!gaps.includes(need)) gaps.push(need);
    });
  }

  const includedPacks = Object.keys(packs);
  const contextHeader = `CONTEXT_PACKS_INCLUDED: [${includedPacks
    .map((p) => `"${p}"`)
    .join(", ")}]\nDATA_GAPS: [${gaps.map((g) => `"${g}"`).join(", ")}]`;

  return { packs, gaps, contextHeader };
}

// OPTIMIZED: Create optimized fetch operations to avoid redundancy
function createOptimizedFetchOperations(userId, needs, slots) {
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
    const cachedSummary = getCachedUserData("financial_summary", userId);

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
    const cachedSpend = getCachedUserData("spend_data", userId, {
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
    const cachedCategoryTxns = getCachedUserData(
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
    const cachedInvest = getCachedUserData("investments_all", userId);

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
    const cachedGoals = getCachedUserData("goals_overview", userId, {
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
    const cachedCashflow = getCachedUserData("cashflow_monthly", userId, {
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
      cacheOperationData(operation, processedData);
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
        case "summary_min":
          packs.base = data;
          break;
        case "spend_total":
          packs.spend = data;
          break;
        case "category_transactions":
          // This operation can serve both category_details and txns_by_category
          if (operation.servesNeeds?.includes("category_details")) {
            packs.categoryDetails = data;
          }
          if (operation.servesNeeds?.includes("txns_by_category")) {
            packs.spend = { ...packs.spend, ...data };
          }
          break;
        case "invest_holdings":
          packs.invest = data;
          break;
        case "goals_overview":
          packs.goals = data;
          break;
        case "cashflow_monthly":
          packs.cashflow = data;
          break;
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
function cacheOperationData(operation, data) {
  switch (operation.type) {
    case "summary_min":
      setCachedUserData("financial_summary", operation.userId, data);
      break;
    case "spend_total":
      setCachedUserData("spend_data", operation.userId, data, {
        period: operation.period,
      });
      break;
    case "category_transactions":
      setCachedUserData("category_transactions", operation.userId, data, {
        category: operation.category,
        period: operation.period,
      });
      break;
    case "invest_holdings":
      setCachedUserData("investments_all", operation.userId, data);
      break;
    case "goals_overview":
      setCachedUserData("goals_overview", operation.userId, data, {
        limit: 10,
      });
      break;
    case "cashflow_monthly":
      setCachedUserData("cashflow_monthly", operation.userId, data, {
        months: 3,
      });
      break;
  }
}

// Heuristic: detect clearly in-scope financial concept questions to avoid false off-topic
function financialConceptHeuristic(raw) {
  const text = (raw || "").toLowerCase();
  if (!text) return null;

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
    // Check if it's a personal financial query that needs user data
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
    ];

    const isPersonalQuery = personalFinancialPatterns.some((pattern) =>
      text.includes(pattern)
    );

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

  // 0. CONTINUATION PATTERNS (Check FIRST - highest priority)
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

  // 1. EXPLICIT goal creation patterns (high confidence)
  const explicitGoalPatterns = [
    /\b(?:create|set|add|make)\s+(?:a\s+)?(?:new\s+)?goal/i,
    /\bgoal\s+(?:for|to)\s+(?:save|buy)/i,
    /\bsave\s+\$?\d+[k]?\s+(?:for|toward)/i, // "save $5000 for"
    /\btarget\s+(?:amount|of)\s+\$?\d+/i, // "target amount $5000"
  ];

  if (explicitGoalPatterns.some((p) => p.test(message))) {
    console.log("✅ [GOAL] Explicit goal creation detected");
    return {
      intent: "goal_conversation",
      confidence: 0.95,
      reason: "explicit_creation",
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
      reason: "goal_inquiry",
    };
  }

  // 3. NOT goal creation - general financial queries
  const nonGoalPatterns = [
    /\bcan\s+i\s+afford/i, // Affordability check
    /\bshould\s+i\s+buy/i, // Purchase advice
    /\bwhat.*(?:spend|spent)/i, // Spending analysis
    /\bhow\s+much.*(?:spend|spent)/i, // Spending questions
    /\bwhere.*(?:money|spending)/i, // Transaction queries
    /\bshow.*(?:transactions|spending)/i, // Transaction display
  ];

  if (nonGoalPatterns.some((p) => p.test(message))) {
    console.log("✅ [GOAL] Non-goal financial query detected");
    return {
      intent: "ask_personalized",
      confidence: 0.9,
      reason: "non_goal_query",
    };
  }

  // Default: no strong signal, let LLM decide
  return null;
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

  // Check for off-topic LAST (after financial heuristics)
  const offTopicHeuristic = detectOffTopic(text);
  if (offTopicHeuristic) {
    console.log("✅ [FINNY] Heuristic detected off-topic query");
    const result = {
      intent: "off_topic",
      needs_web: false,
      needs_user_data: false,
      state: null,
      entities: [],
      confidence: 0.9,
      heuristic: true,
    };
    setCachedClassification(text, result);
    return result;
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
                "- ask_personalized: user’s finances (spending, accounts, goals, investments)",
                "- goal_conversation: saving/targets/feasibility conversations",
                "- off_topic: non-financial (weather, cooking, movies, sports, tech support)",
                "",
                "Flag rules (can combine):",
                "- needs_user_data=true when the answer requires the user's actual data (spend, net worth, accounts, goals, personal recommendations)",
                "- needs_web=true when the answer requires current/2024-2025 info (limits, rates, brackets, market/news, card offers)",
                "",
                "Examples:",
                '"What is the Roth IRA limit for 2025?" → {intent:"ask_personalized", needs_web:true, needs_user_data:false}',
                '"How much did I spend last month?" → {intent:"ask_personalized", needs_web:false, needs_user_data:true}',
                '"I want to save $5000 for a house" → {intent:"goal_conversation", needs_web:false, needs_user_data:true}',
                '"Which credit card should I get?" → {intent:"ask_personalized", needs_web:true, needs_user_data:true}',
                '"Rent vs buy in Phoenix at 7% for me" → {intent:"ask_personalized", needs_web:true, needs_user_data:true, state:"AZ"}',
                '"What\'s the weather?" → {intent:"off_topic", needs_web:false, needs_user_data:false}',
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
    if (detectOffTopic(message)) {
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
    "You are Finny, a warm and encouraging financial advisor.",
    "The user asked a non-financial question that's outside your scope.",
    "Respond with warmth and redirect them to relevant financial topics.",
    "Be encouraging and show enthusiasm for helping with their finances.",
    "Use their name if available, and make the redirection feel natural.",
    "Keep responses concise but engaging.",
    "You can use emojis or decorative symbols.",
    "Limit your reply to 4-6 sentences (roughly <=120 words).",
    "Finish complete sentences; avoid trailing fragments or cut-offs.",
    "Focus on financial empowerment and positive outcomes.",
    "Add spacing between sentences to make the response more readable.",
    "",
    "EMPATHETIC ENGAGEMENT:",
    "- ALWAYS acknowledge and engage with personal information users share, even if not directly financial",
    "- Show genuine interest in their life, studies, career, location, hobbies, or experiences",
    "- Respond with warmth and understanding to personal details like age, location, occupation, or interests",
    "- Examples: If someone says they're a 20-year-old software engineer student in Tucson, respond with something like 'That's awesome that you're studying software engineering in Tucson! That's such a growing field with great earning potential.'",
    "- If users share non-financial information, acknowledge it warmly before transitioning to financial topics",
    "- Build rapport by showing you care about them as a person, not just their finances",
    "- Make the transition to financial topics feel natural and connected to their personal situation",
    "",
    // Smart memory context with relevance-based selection
    ...(context.memory?.summary
      ? [`User context: ${context.memory.summary}`]
      : []),
    ...(() => {
      // Select relevant memories based on message and intent
      const selectedMemories = selectRelevantMemories(
        context.memory,
        message,
        "ask_personalized", // Default intent for classification
        context.profile
      );
      const categorized = categorizeSelectedMemories(selectedMemories);

      return [
        // Profile traits
        ...(categorized.profile_trait?.length
          ? [
              `Traits: ${categorized.profile_trait
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Constraints
        ...(categorized.constraint?.length
          ? [
              `Constraints: ${categorized.constraint
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Preferences
        ...(categorized.preference?.length
          ? [
              `Preferences: ${categorized.preference
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Future plans
        ...(categorized.future_plan?.length
          ? [
              `Future plans: ${categorized.future_plan
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Context signals
        ...(categorized.context_signal?.length
          ? [
              `Context signals: ${categorized.context_signal
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
        // Goals
        ...(categorized.goal?.length
          ? [
              `Goals: ${categorized.goal
                .map((m) => `${m.key}: ${m.value}`)
                .join(", ")}`,
            ]
          : []),
      ];
    })(),
    // Net worth context
    ...(netWorthData
      ? [
          "",
          "FINANCIAL SITUATION:",
          `Current net worth: ${netWorthData.formatted.net_worth}`,
          `Liquid assets: ${netWorthData.formatted.liquid_assets}`,
          `Investments: ${netWorthData.formatted.investments_total}`,
          `Liabilities: ${netWorthData.formatted.total_liabilities}`,
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
          temperature: 0.7,
          max_tokens: 250,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `User asked: "${message}"\n\nCategory: ${category}\n\nRedirection suggestions: ${redirectionSuggestions.join(
                ", "
              )}\n\nUser name: ${userProfile.name || "there"}${
                netWorthData
                  ? `\n\nUser's financial situation: Net worth ${netWorthData.formatted.net_worth} (${netWorthData.formatted.liquid_assets} liquid, ${netWorthData.formatted.investments_total} invested, ${netWorthData.formatted.total_liabilities} liabilities)`
                  : ""
              }${
                conversationContext?.active_topic
                  ? `\n\n--- Conversation Context ---\nActive topic: ${
                      conversationContext.active_topic
                    }${
                      conversationContext.last_entity &&
                      Object.keys(conversationContext.last_entity).length > 0
                        ? `\nLast entity: ${JSON.stringify(
                            conversationContext.last_entity
                          )}`
                        : ""
                    }${
                      conversationContext.pending_action
                        ? `\nPending action: ${conversationContext.pending_action}`
                        : ""
                    }`
                  : ""
              }\n\nUse the user's memory context, financial situation, and conversation context to make the redirection more personal and relevant to their situation.`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ||
      "I'd love to help you with your finances! What financial questions can I answer for you today?";

    // Off-topic: always run LLM-based memory extraction (no gating or heuristics)
    try {
      const validated = await validateMemoriesWithSmallModel(
        message,
        [],
        "ask_personalized"
      );

      const toSave = (validated || [])
        .filter((m) => m && typeof m.value === "string" && cleanValue(m.value))
        .filter((m) => {
          const conf = m.confidence != null ? m.confidence : m.confidence_score;
          return conf >= 0.8;
        })
        .filter(
          (m, i, self) =>
            i === self.findIndex((x) => x.type === m.type && x.key === m.key)
        );

      console.log(
        `🧠 [FINNY] Off-topic LLM memory candidates prepared: ${toSave.length}`
      );

      if (toSave.length > 0 && context?.user_id) {
        try {
          await saveMemoryCandidates(context.user_id, toSave);
        } catch (e) {
          console.log("🧠 [FINNY] Off-topic memory save failed:", e?.message);
        }
      }
    } catch (e) {
      // Non-fatal
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

// Rule-based patterns for common financial entities
const ENTITY_PATTERNS = {
  // Credit card issuers
  creditCardIssuers: [
    "chase",
    "american express",
    "amex",
    "capital one",
    "citi",
    "citi bank",
    "discover",
    "wells fargo",
    "bank of america",
    "bofa",
    "us bank",
    "usbank",
    "barclays",
    "synchrony",
    "first national",
    "pnc",
    "regions",
    "huntington",
    "bmo",
    "hsbc",
    "ally",
    "sofi",
    "upgrade",
    "credit one",
    "first premier",
    "bilt",
    "bilt rewards",
    "bilt card",
  ],

  // Credit card names
  creditCardNames: [
    "sapphire",
    "freedom",
    "unlimited",
    "preferred",
    "reserve",
    "ink",
    "gold card",
    "platinum",
    "centurion",
    "blue cash",
    "everyday",
    "venture",
    "quicksilver",
    "savor",
    "double cash",
    "custom cash",
    "discover it",
    "freedom flex",
    "cash back",
    "rewards",
    "miles",
    "travel",
    "business",
    "student",
    "secured",
    "premium",
  ],

  // Banks and financial institutions
  banks: [
    "chase",
    "bank of america",
    "wells fargo",
    "citibank",
    "us bank",
    "pnc",
    "capital one",
    "ally bank",
    "sofi",
    "discover bank",
    "american express",
    "barclays",
    "hsbc",
    "regions",
    "huntington",
    "first national",
    "synchrony",
    "upgrade",
    "bmo",
    "bmo harris",
  ],

  // Investment platforms
  investmentPlatforms: [
    "robinhood",
    "fidelity",
    "vanguard",
    "schwab",
    "charles schwab",
    "etrade",
    "ameritrade",
    "td ameritrade",
    "interactive brokers",
    "webull",
    "public",
    "m1 finance",
    "wealthfront",
    "betterment",
    "acorns",
    "stash",
    "sofi invest",
    "ally invest",
    "merrill edge",
  ],

  // Financial products
  financialProducts: [
    "credit card",
    "debit card",
    "checking account",
    "savings account",
    "cd",
    "certificate of deposit",
    "money market",
    "ira",
    "roth ira",
    "401k",
    "403b",
    "hsa",
    "health savings account",
    "brokerage account",
    "investment account",
    "trading account",
    "mutual fund",
    "etf",
    "index fund",
    "bond",
    "stock",
    "option",
    "crypto",
    "cryptocurrency",
  ],

  // Comparison words
  comparisonWords: [
    "vs",
    "versus",
    "vs.",
    "compare",
    "comparison",
    "better",
    "best",
    "which",
    "difference",
    "differences",
    "pros and cons",
    "advantages",
    "disadvantages",
    "benefits",
    "drawbacks",
    "features",
  ],

  // State codes and names (only full state names to avoid false matches)
  states: [
    "alabama",
    "alaska",
    "arizona",
    "arkansas",
    "california",
    "colorado",
    "connecticut",
    "delaware",
    "florida",
    "georgia",
    "hawaii",
    "idaho",
    "illinois",
    "indiana",
    "iowa",
    "kansas",
    "kentucky",
    "louisiana",
    "maine",
    "maryland",
    "massachusetts",
    "michigan",
    "minnesota",
    "mississippi",
    "missouri",
    "montana",
    "nebraska",
    "nevada",
    "new hampshire",
    "new jersey",
    "new mexico",
    "new york",
    "north carolina",
    "north dakota",
    "ohio",
    "oklahoma",
    "oregon",
    "pennsylvania",
    "rhode island",
    "south carolina",
    "south dakota",
    "tennessee",
    "texas",
    "utah",
    "vermont",
    "virginia",
    "washington",
    "west virginia",
    "wisconsin",
    "wyoming",
    "washington dc",
    "washington d.c.",
  ],
};

// Domain mappings for financial institutions
const DOMAIN_MAPPINGS = {
  chase: {
    primary: "chase.com",
    creditCards: "chase.com/credit-cards",
    searchPaths: [
      "/credit-cards",
      "/personal/credit-cards",
      "/business/credit-cards",
    ],
  },
  "american express": {
    primary: "americanexpress.com",
    creditCards: "americanexpress.com/us/credit-cards",
    searchPaths: ["/us/credit-cards", "/us/credit-cards/all-cards"],
  },
  amex: {
    primary: "americanexpress.com",
    creditCards: "americanexpress.com/us/credit-cards",
    searchPaths: ["/us/credit-cards", "/us/credit-cards/all-cards"],
  },
  "capital one": {
    primary: "capitalone.com",
    creditCards: "capitalone.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  citi: {
    primary: "citi.com",
    creditCards: "citi.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  discover: {
    primary: "discover.com",
    creditCards: "discover.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  "wells fargo": {
    primary: "wellsfargo.com",
    creditCards: "wellsfargo.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  "bank of america": {
    primary: "bankofamerica.com",
    creditCards: "bankofamerica.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  bilt: {
    primary: "bilt.com",
    creditCards: "bilt.com/credit-card",
    searchPaths: ["/credit-card", "/personal/credit-card"],
  },
  fidelity: {
    primary: "fidelity.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  vanguard: {
    primary: "vanguard.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  schwab: {
    primary: "schwab.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  robinhood: {
    primary: "robinhood.com",
    searchPaths: ["/investing", "/crypto", "/options"],
  },
};

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

  // Check for explicit stock-related keywords
  const stockKeywords =
    /\b(stock|stocks|ticker|share|shares|price|quote|buy|sell|valuation|pt|price target|market cap|pe ratio|earnings|dividend|analyst|recommendation|investment|invest|portfolio|trading|trader|investor)\b/;

  // Check for company names or ticker symbols
  const hasTickerSymbol = /\b[A-Z]{1,5}\b/.test(message);

  // Check for natural language patterns that indicate stock interest
  const naturalLanguagePatterns = [
    /\b(tell me about|show me|get me|what about|how is|how are)\b.*\b(stock|company|corp|inc|ltd|llc)\b/i,
    /\b(about|regarding|concerning)\b.*\b[A-Z]{1,5}\b/i,
    /\b(should i buy|is.*good|worth.*investing|add.*portfolio)\b/i,
    /\b(apple|microsoft|google|amazon|tesla|meta|nvidia|netflix|uber|airbnb|spotify|twitter|snapchat|zoom|palantir|snowflake|shopify|square|paypal|coinbase|robinhood|doordash|peloton)\b/i,
  ];

  const hasNaturalLanguage = naturalLanguagePatterns.some((pattern) =>
    pattern.test(message)
  );

  return stockKeywords.test(m) || hasTickerSymbol || hasNaturalLanguage;
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
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SMALLER_MODEL,
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
      console.error(
        `❌ [STOCK_PLANNER] HTTP Error: ${r.status} ${r.statusText}`
      );
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
  const wants = plan?.wants || [];
  const preferredTicker = plan?.ticker_candidates?.[0] || null;
  const { ticker } = preferredTicker
    ? { ticker: preferredTicker }
    : await resolveTickerForQuery(message);
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

    // NEW: Purge in-memory context caches for this user
    try {
      const keysToDelete = [];
      for (const [key, value] of dataCache.entries()) {
        if (!value || typeof key !== "string") continue;
        // Keys are of form: `${dataType}_${userId}` plus optional params suffix
        if (key.includes(`_${userId}`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((k) => dataCache.delete(k));
      if (keysToDelete.length > 0) {
        console.log(
          `🧹 [DATA_CACHE] Purged ${keysToDelete.length} in-memory entries for user ${userId}`
        );
      }
    } catch (e) {
      console.log("ℹ️ [CACHE] In-memory purge skipped:", e?.message);
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
  const cached = getCachedUserData("net_worth", userId);
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
    setCachedUserData("net_worth", userId, processedData);
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
  quickExtract,
  shouldRunMemoryExtraction,
  validateMemoriesWithSmallModel,
  selectRelevantMemories,
  loadUserMemory,
  saveMemoryCandidates,
  generateFallbackStockAnalysis,
  extractTickerFromMessage,
  generateTrainingDataStockAnalysis,
  generateMemorySummary,
  getNetWorthData,
  formatNetWorthCurrency,
};
