// api/finny.js
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import crypto from "crypto";
import { handleGoalConversation } from "./goals.js";
import { braveSearch } from "../lib/websearch/brave.js";

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
    const hasOccupation = /(work as|i am a|i'm a)\s+[a-z\s]+/.test(m);
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
    return groundedSignals >= 2;
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
      /(college|university|degree|bachelor|masters|phd|cs degree|computer science|student)/i.test(
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
      "You validate user memories. Return JSON only.",
      "Only extract durable, advisor-grade facts with evidence from the message.",
      "Include an evidence array of the exact spans that justify each memory.",
      "Reject generic interests/hobbies unless tied to financial impact.",
      "Schema: {memories:[{type,key,value,confidence,evidence:[], grounded:boolean}]}",
      "Grounded means the fact is supported by concrete signals (amount/date/age/state/role).",
      // Provide synonyms map to improve key normalization/mapping
      `Synonyms map: ${JSON.stringify(KEY_SYNONYMS, null, 2)}`,
      `Allowed keys: ${JSON.stringify(Array.from(allowed))}`,
      `Message: ${message}`,
      `Hints: ${JSON.stringify(hints)}`,
    ].join("\n");

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SMALLER_MODEL,
        temperature: 0.1,
        max_tokens: 600,
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
  const sessionState = getSessionState(finalUserId);
  const safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    profile: userProfile,
    // carry session short-term state into handlers
    session: sessionState,
    // NEW: Add memory reading
    memory: await loadUserMemory(finalUserId),
  };

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  try {
    let response;

    switch (action) {
      case "classify":
        response = await handleClassify(message, safeContext);
        break;
      case "ask":
        response = await handleAsk(
          message,
          safeContext,
          "ask_personalized",
          classification
        );
        break;
      case "off_topic":
        response = await handleOffTopic(message, safeContext);
        break;
      case "goal_conversation": {
        // If there's active goal_flow in session, pass it in context
        if (safeContext?.session?.goal_flow) {
          safeContext.goal_flow = safeContext.session.goal_flow;
        }
        response = await handleGoalConversation(message, safeContext);
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

    res.status(200).json(response);
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
  classificationResult = null
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
              content: `User: ${message}\n\nContext:\n${contextNote}`,
            },
          ],
        }),
      }),
    ]);

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

    const response = {
      message: cleanedMessage,
      type: "assistant",
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

    // Session summary update removed

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
    lower.includes("bank") &&
    !/account|loan|interest|branch|routing|checking|savings|credit|debit/.test(
      lower
    )
  ) {
    return true;
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
    "how to cook",
    "recipe for",
    "cooking",
    "baking",
    "kitchen",
    "meal prep",
    "what to eat",
    "restaurant",
    "food",
    "dinner",
    "lunch",
    "breakfast",

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

    // Sports
    "football",
    "soccer",
    "basketball",
    "baseball",
    "tennis",
    "golf",
    "sports",
    "game",
    "team",
    "player",
    "score",
    "match",
    "tournament",
    "championship",

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

    // Travel & geography
    "travel",
    "vacation",
    "trip",
    "hotel",
    "flight",
    "airport",
    "passport",
    "country",
    "city",
    "capital",
    "geography",
    "map",
    "location",

    // Health & medical
    "doctor",
    "hospital",
    "medicine",
    "sick",
    "illness",
    "health",
    "medical",
    "pain",
    "ache",
    "symptoms",
    "diagnosis",
    "treatment",
    "therapy",
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

  try {
    // Create array of fetch promises based on needs
    const fetchPromises = [];
    const fetchMetadata = [];

    // 1. Financial summary fetch promise
    if (needs.includes("summary_min")) {
      // Check cache first
      const cachedSummary = getCachedUserData("financial_summary", userId);

      if (cachedSummary) {
        fetchPromises.push(Promise.resolve(cachedSummary));
        fetchMetadata.push({ type: "summary_min", userId, cached: true });
      } else {
        // Parallel RPCs for base pack: net worth, recent txns, category spend (last 30d)
        fetchPromises.push(
          (async () => {
            const now = new Date();
            const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const p_start = past.toISOString().split("T")[0];
            const p_end = now.toISOString().split("T")[0];

            const [netWorthRes, recentRes, spendCatRes] = await Promise.all([
              withTimeout(
                supabase.rpc("get_net_worth", { p_user_id: userId }),
                2000,
                null
              ).catch(() => null),
              withTimeout(
                supabase.rpc("get_recent_transactions", {
                  p_user_id: userId,
                  p_limit: 5,
                }),
                2000,
                null
              ).catch(() => null),
              withTimeout(
                supabase.rpc("get_spend_by_category", {
                  p_user_id: userId,
                  p_start,
                  p_end,
                }),
                2000,
                null
              ).catch(() => null),
            ]);

            const net = netWorthRes?.data?.[0] || null;
            const recent = Array.isArray(recentRes?.data) ? recentRes.data : [];
            const spendCats = Array.isArray(spendCatRes?.data)
              ? spendCatRes.data
              : [];

            if (!net) return null;

            const processedData = {
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
              accounts: Array.isArray(net.bank_accounts)
                ? net.bank_accounts
                : [],
            };

            return processedData;
          })()
        );
        fetchMetadata.push({ type: "summary_min", userId, cached: false });
      }
    }

    // 2. Spend data fetch promise
    if (needs.includes("spend_total") && slots.period) {
      // Check cache first
      const cachedSpend = getCachedUserData("spend_data", userId, {
        period: slots.period,
      });

      if (cachedSpend) {
        // Use cached data
        fetchPromises.push(Promise.resolve(cachedSpend));
        fetchMetadata.push({
          type: "spend_total",
          userId,
          period: slots.period,
          cached: true,
        });
      } else {
        // Fetch fresh data
        fetchPromises.push(
          withTimeout(
            supabase.rpc("get_spend_summary", {
              p_user_id: userId,
              p_start: slots.period.start,
              p_end: slots.period.end,
            }),
            2000,
            null
          ).catch((error) => {
            console.error("❌ [FINNY] Spend summary fetch failed:", error);
            return null;
          })
        );
        fetchMetadata.push({
          type: "spend_total",
          userId,
          period: slots.period,
          cached: false,
        });
      }
    }

    // 3. Category transactions fetch promise (detailed)
    if (slots.category && slots.period) {
      // Check cache first
      const cachedCategoryTxns = getCachedUserData(
        "category_transactions",
        userId,
        {
          category: slots.category,
          period: slots.period,
        }
      );

      if (cachedCategoryTxns) {
        // Use cached data
        fetchPromises.push(Promise.resolve(cachedCategoryTxns));
        fetchMetadata.push({
          type: "category_details",
          userId,
          category: slots.category,
          period: slots.period,
          cached: true,
        });
      } else {
        // Fetch fresh data
        fetchPromises.push(
          withTimeout(
            supabase.rpc("get_transactions_by_category", {
              p_user_id: userId,
              p_category: slots.category,
              p_start: slots.period.start,
              p_end: slots.period.end,
            }),
            2000,
            null
          ).catch((error) => {
            console.error(
              "❌ [FINNY] Category transactions fetch failed:",
              error
            );
            return null;
          })
        );
        fetchMetadata.push({
          type: "category_details",
          userId,
          category: slots.category,
          period: slots.period,
          cached: false,
        });
      }
    }

    // 4. Transactions by category fetch promise (for spend pack)
    if (needs.includes("txns_by_category") && slots.category && slots.period) {
      // Check cache first (reuse category_transactions cache)
      const cachedTxns = getCachedUserData("category_transactions", userId, {
        category: slots.category,
        period: slots.period,
      });

      if (cachedTxns) {
        // Use cached data
        fetchPromises.push(Promise.resolve(cachedTxns));
        fetchMetadata.push({
          type: "txns_by_category",
          userId,
          category: slots.category,
          period: slots.period,
          cached: true,
        });
      } else {
        // Fetch fresh data
        fetchPromises.push(
          withTimeout(
            supabase.rpc("get_transactions_by_category", {
              p_user_id: userId,
              p_category: slots.category,
              p_start: slots.period.start,
              p_end: slots.period.end,
            }),
            2000,
            null
          ).catch((error) => {
            console.error(
              "❌ [FINNY] Transactions by category fetch failed:",
              error
            );
            return null;
          })
        );
        fetchMetadata.push({
          type: "txns_by_category",
          userId,
          category: slots.category,
          period: slots.period,
          cached: false,
        });
      }
    }

    // 5. Investment holdings fetch promise
    if (needs.includes("invest_holdings")) {
      // Check cache first (consolidated investments)
      const cachedInvest = getCachedUserData("investments_all", userId);

      if (cachedInvest) {
        fetchPromises.push(Promise.resolve(cachedInvest));
        fetchMetadata.push({ type: "invest_holdings", userId, cached: true });
      } else {
        fetchPromises.push(
          withTimeout(
            supabase.rpc("get_investment_overview", {
              p_user_id: userId,
            }),
            2000,
            null
          ).catch((error) => {
            console.error(
              "❌ [FINNY] Investment overview fetch failed:",
              error
            );
            return null;
          })
        );
        fetchMetadata.push({ type: "invest_holdings", userId, cached: false });
      }
    }

    // 6. Goals overview fetch promise
    if (needs.includes("goals_overview")) {
      // Check cache first
      const cachedGoals = getCachedUserData("goals_overview", userId, {
        limit: 10,
      });

      if (cachedGoals) {
        // Use cached data
        fetchPromises.push(Promise.resolve(cachedGoals));
        fetchMetadata.push({ type: "goals_overview", userId, cached: true });
      } else {
        // Fetch fresh data
        fetchPromises.push(
          withTimeout(
            supabase.rpc("get_goals_overview", {
              p_user_id: userId,
              p_limit: 10,
            }),
            2000,
            null
          ).catch((error) => {
            console.error("❌ [FINNY] Goals overview fetch failed:", error);
            return null;
          })
        );
        fetchMetadata.push({ type: "goals_overview", userId, cached: false });
      }
    }

    // 7. Cashflow monthly fetch promise
    if (needs.includes("cashflow_monthly")) {
      // Check cache first
      const cachedCashflow = getCachedUserData("cashflow_monthly", userId, {
        months: 3,
      });

      if (cachedCashflow) {
        // Use cached data
        fetchPromises.push(Promise.resolve(cachedCashflow));
        fetchMetadata.push({ type: "cashflow_monthly", userId, cached: true });
      } else {
        // Fetch fresh data
        fetchPromises.push(
          withTimeout(
            supabase.rpc("get_cashflow_monthly", {
              p_user_id: userId,
              p_months: 3,
            }),
            2000,
            null
          ).catch((error) => {
            console.error("❌ [FINNY] Cashflow monthly fetch failed:", error);
            return null;
          })
        );
        fetchMetadata.push({ type: "cashflow_monthly", userId, cached: false });
      }
    }

    // Execute all fetches in parallel
    console.log(
      `🚀 [FINNY] Executing ${fetchPromises.length} data fetches in parallel...`
    );
    const startTime = Date.now();

    const results = await Promise.allSettled(fetchPromises);
    const fetchTime = Date.now() - startTime;

    console.log(`✅ [FINNY] All data fetches completed in ${fetchTime}ms`);

    // Process results and build packs
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const metadata = fetchMetadata[i];

      if (result.status === "fulfilled" && result.value !== null) {
        const data = result.value;

        switch (metadata.type) {
          case "summary_min":
            if (metadata.cached) {
              packs.base = data;
            } else if (data) {
              packs.base = data;
              setCachedUserData("financial_summary", metadata.userId, data);
            } else {
              gaps.push("summary_min");
            }
            break;

          case "spend_total":
            if (metadata.cached) {
              // Data is already processed from cache
              packs.spend = data;
            } else if (data?.data) {
              const processedData = {
                total: data.data.total_spend || 0,
                count: data.data.txn_count || 0,
                period: `${metadata.period.start} to ${metadata.period.end}`,
              };
              packs.spend = processedData;

              // Cache the processed data
              setCachedUserData("spend_data", metadata.userId, processedData, {
                period: metadata.period,
              });
            } else {
              gaps.push("spend_total");
            }
            break;

          case "category_details":
            if (metadata.cached) {
              // Data is already processed from cache
              packs.categoryDetails = data;
            } else if (data?.data && data.data.length > 0) {
              const processedData = {
                category: metadata.category,
                transactions: data.data.map((txn) => ({
                  date: txn.date,
                  amount: txn.amount,
                  name: txn.name,
                  merchant: txn.merchant_name || txn.name,
                  category: txn.category,
                })),
                period: `${metadata.period.start} to ${metadata.period.end}`,
              };
              packs.categoryDetails = processedData;

              // Cache the processed data
              setCachedUserData(
                "category_transactions",
                metadata.userId,
                processedData,
                {
                  category: metadata.category,
                  period: metadata.period,
                }
              );
            }
            break;

          case "txns_by_category":
            if (metadata.cached) {
              // Data is already processed from cache
              packs.spend = data;
            } else if (data?.data) {
              const processedData = {
                ...packs.spend,
                category: metadata.category,
                transactions: (data.data || []).slice(0, 20).map((txn) => ({
                  date: txn.date,
                  amount: txn.amount,
                  merchant: txn.merchant_name || txn.name,
                })),
              };
              packs.spend = processedData;

              // Cache the processed data
              setCachedUserData(
                "category_transactions",
                metadata.userId,
                processedData,
                {
                  category: metadata.category,
                  period: metadata.period,
                }
              );
            } else {
              gaps.push("txns_by_category");
            }
            break;

          case "invest_holdings":
            if (metadata.cached) {
              packs.invest = data;
            } else if (data?.data) {
              // data.data is jsonb: { holdings: [], balances: [], options: [] }
              const payload = data.data || {};
              const processedData = {
                holdings: Array.isArray(payload.holdings)
                  ? payload.holdings.map((h) => ({
                      symbol: h.symbol,
                      description: h.description,
                      units: h.units,
                      market_value: h.market_value,
                    }))
                  : [],
                balances: Array.isArray(payload.balances)
                  ? payload.balances
                  : [],
                options: Array.isArray(payload.options) ? payload.options : [],
              };
              packs.invest = processedData;
              setCachedUserData(
                "investments_all",
                metadata.userId,
                processedData
              );
            } else {
              gaps.push("invest_holdings");
            }
            break;

          case "goals_overview":
            if (metadata.cached) {
              // Data is already processed from cache
              packs.goals = data;
            } else if (data?.data) {
              const processedData = {
                goals: (data.data || []).map((goal) => ({
                  label: goal.label,
                  current_amount: goal.current_amount,
                  target_amount: goal.target_amount,
                  progress_pct: goal.progress_pct,
                  target_date: goal.target_date,
                })),
              };
              packs.goals = processedData;

              // Cache the processed data
              setCachedUserData(
                "goals_overview",
                metadata.userId,
                processedData,
                {
                  limit: 10,
                }
              );
            } else {
              gaps.push("goals_overview");
            }
            break;

          case "cashflow_monthly":
            if (metadata.cached) {
              // Data is already processed from cache
              packs.goals = data;
            } else if (data?.data) {
              const processedData = {
                ...packs.goals,
                cashflow: (data.data || []).map((cf) => ({
                  month: cf.month,
                  income: cf.income,
                  expense: cf.expense,
                  net: cf.net,
                })),
              };
              packs.goals = processedData;

              // Cache the processed data
              setCachedUserData(
                "cashflow_monthly",
                metadata.userId,
                processedData,
                { months: 3 }
              );
            } else {
              gaps.push("cashflow_monthly");
            }
            break;
        }
      } else {
        // Handle failed promises
        console.error(
          `❌ [FINNY] Fetch failed for ${metadata.type}:`,
          result.reason
        );
        gaps.push(metadata.type);
      }
    }
  } catch (error) {
    console.error("Error building context packs:", error);
  }

  const includedPacks = Object.keys(packs);
  const contextHeader = `CONTEXT_PACKS_INCLUDED: [${includedPacks
    .map((p) => `"${p}"`)
    .join(", ")}]\nDATA_GAPS: [${gaps.map((g) => `"${g}"`).join(", ")}]`;

  return { packs, gaps, contextHeader };
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

async function handleClassify(message, context) {
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
    console.log(
      `⚡ [FINNY] Using cached classification result (${
        Date.now() - startTime
      }ms)`
    );
    return cachedResult;
  }

  // Check for off-topic first (highest priority)
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

  // Positive heuristic for common financial concept questions (with combined flags)
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
          max_tokens: 300, // Allow slightly longer responses for stability
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
    } catch (parseError) {
      console.log("❌ [FINNY] JSON parse error, trying to fix incomplete JSON");
      console.log("❌ [FINNY] Raw content was:", cleanContent);

      // Try to extract intent from malformed JSON
      const intentMatch = cleanContent.match(/"intent"\s*:\s*"([^"]+)"/);
      const needsWebMatch = cleanContent.match(
        /"needs_web"\s*:\s*(true|false)/
      );
      const needsUserDataMatch = cleanContent.match(
        /"needs_user_data"\s*:\s*(true|false)/
      );
      const confidenceMatch = cleanContent.match(
        /"confidence"\s*:\s*([0-9.]+)/
      );

      if (intentMatch) {
        console.log("✅ [FINNY] Extracted intent from malformed JSON");
        out = {
          intent: intentMatch[1],
          needs_web: needsWebMatch ? needsWebMatch[1] === "true" : false,
          needs_user_data: needsUserDataMatch
            ? needsUserDataMatch[1] === "true"
            : false,
          state: null,
          entities: [],
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8,
          malformed_json: true,
        };
      } else {
        // Try to extract from the weird format we're seeing
        const weirdIntentMatch = cleanContent.match(/ask_personalized/);
        const weirdNeedsWebMatch = cleanContent.match(/false/);
        const weirdNeedsUserDataMatch = cleanContent.match(/true/);
        const weirdConfidenceMatch = cleanContent.match(/0\.95/);

        if (weirdIntentMatch) {
          console.log("✅ [FINNY] Extracted from weird malformed JSON format");
          out = {
            intent: "ask_personalized",
            needs_web: weirdNeedsWebMatch ? false : false,
            needs_user_data: weirdNeedsUserDataMatch ? true : false,
            state: null,
            entities: [],
            confidence: weirdConfidenceMatch ? 0.95 : 0.8,
            malformed_json: true,
          };
        } else {
          throw new Error("Malformed JSON response");
        }
      }
    }
    console.log("🔍 [FINNY] Parsed classification result:", out);

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

    // 3. Goal conversation detection
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes("save") &&
      (lowerMessage.includes("goal") ||
        lowerMessage.includes("target") ||
        lowerMessage.includes("plan") ||
        lowerMessage.includes("want"))
    ) {
      console.log("✅ [FINNY] Using goal conversation heuristic fallback");
      return {
        intent: "goal_conversation",
        needs_web: false,
        needs_user_data: true,
        state: null,
        entities: [],
        confidence: 0.8,
        fallback: true,
        timeout_fallback: e?.message?.includes("timeout") || false,
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

async function handleOffTopic(message, context) {
  console.log("🚫 [FINNY] Handling off-topic query:", message);
  const startTime = Date.now();

  const category = context?.category || "general";
  const userProfile = context?.profile || {};

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
              )}\n\nUser name: ${
                userProfile.name || "there"
              }\n\nUse the user's memory context to make the redirection more personal and relevant to their situation.`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ||
      "I'd love to help you with your finances! What financial questions can I answer for you today?";

    // Off-topic: also run gated memory extraction/saving if strong personal facts are present
    try {
      const hints = quickExtract(message);
      if (shouldRunMemoryExtraction(message, "ask_personalized")) {
        const validated = await validateMemoriesWithSmallModel(
          message,
          hints,
          "ask_personalized"
        );
        let merged = validated || [];
        const fallback = fallbackExtractCandidates(message, hints);
        if (!merged || merged.length === 0) {
          if (fallback.length > 0) merged = fallback;
        } else if (fallback.length > 0) {
          const seen = new Set(merged.map((m) => `${m.type}|${m.key}`));
          for (const f of fallback) {
            const k = `${f.type}|${f.key}`;
            if (!seen.has(k)) merged.push(f);
          }
        }

        const toSave = (merged || [])
          .filter(
            (m) => m && typeof m.value === "string" && cleanValue(m.value)
          )
          .filter((m) => {
            const conf =
              m.confidence != null ? m.confidence : m.confidence_score;
            return conf >= 0.8;
          })
          .filter(
            (m, i, self) =>
              i === self.findIndex((x) => x.type === m.type && x.key === m.key)
          );

        if (toSave.length > 0 && context?.user_id) {
          try {
            await saveMemoryCandidates(context.user_id, toSave);
          } catch (e) {
            console.log("🧠 [FINNY] Off-topic memory save failed:", e?.message);
          }
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
  return (
    /\b(stock|stocks|ticker|share|price|quote|buy|sell|valuation|pt|price target)\b/.test(
      m
    ) || /\b[A-Z]{1,5}\b/.test(message)
  );
}

function looksLikeStockDeepQuery(message) {
  const m = message.toLowerCase();
  return (
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
    m.includes("52-week")
  );
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
        model: OPENROUTER_MODEL,
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
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

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

function formatPlannedStockResponse(exec) {
  const d = exec.data;
  const wants = new Set(exec.planWants || []);
  let out = buildStockDataSummary(d, { wants: exec.planWants });
  const lines = [];

  // Append requested items succinctly
  if (wants.has("market_cap") && d.profile?.marketCapitalization != null) {
    lines.push(
      `Market cap: $${Number(d.profile.marketCapitalization).toLocaleString()}`
    );
  }
  if (wants.has("volume") && d.metrics?.volume) {
    lines.push(`Volume: ${Number(d.metrics.volume).toLocaleString()}`);
  }
  if (wants.has("52w")) {
    const hi = d.metrics?.["52WeekHigh"];
    const lo = d.metrics?.["52WeekLow"];
    if (hi || lo)
      lines.push(
        `52-week range: ${lo ? `$${Number(lo).toFixed(2)}` : "?"} - ${
          hi ? `$${Number(hi).toFixed(2)}` : "?"
        }`
      );
  }
  if (wants.has("dividend")) {
    const y = d.metrics?.dividendYieldIndicatedAnnual;
    const dps = d.metrics?.dividendPerShareTTM;
    if (y || dps)
      lines.push(
        `Dividend: ${dps ? `$${Number(dps).toFixed(2)} TTM` : "n/a"}${
          y ? ` (${Number(y * 100).toFixed(2)}% yield)` : ""
        }`
      );
  }
  if (
    wants.has("earnings") &&
    Array.isArray(exec.extra?.earnings) &&
    exec.extra.earnings.length > 0
  ) {
    const e = exec.extra.earnings[0];
    const eps = e?.epsActual != null ? e.epsActual : e?.eps ? e.eps : null;
    const surprise =
      e?.epsSurprisePercent != null
        ? `${Number(e.epsSurprisePercent).toFixed(1)}%`
        : null;
    lines.push(
      `Recent earnings: EPS ${eps != null ? eps : "n/a"}${
        surprise ? ` (surprise ${surprise})` : ""
      }`
    );
  }
  if (
    wants.has("filings") &&
    Array.isArray(exec.extra?.filings) &&
    exec.extra.filings.length > 0
  ) {
    const f = exec.extra.filings
      .slice(0, 2)
      .map((x) => x.form)
      .join(", ");
    lines.push(`Recent filings: ${f}`);
  }
  if (
    wants.has("insider") &&
    Array.isArray(exec.extra?.insider?.data) &&
    exec.extra.insider.data.length > 0
  ) {
    const t = exec.extra.insider.data.slice(0, 2);
    lines.push(
      `Insider trades: ${t
        .map(
          (x) =>
            `${x.name || "Insider"} ${
              x.change >= 0 ? "bought" : "sold"
            } ${Math.abs(x.change)} shares`
        )
        .join("; ")}`
    );
  }

  if (lines.length > 0) {
    out += "\n\nMore details:\n- " + lines.join("\n- ");
  }
  return out;
}

async function resolveTickerForQuery(message) {
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) return { ticker: null, queryUsed: null };

  // Heuristic: if an explicit 1-5 letter uppercase word present, try it first
  const explicit = (message.match(/\b[A-Z]{1,5}\b/g) || []).find(
    (t) => t !== "USD" && t !== "ETF"
  );
  if (explicit) {
    const prof = await fetchJson(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(
        explicit
      )}&token=${apiKey}`
    );
    if (prof && (prof.ticker || prof.ticker === explicit)) {
      return { ticker: explicit, queryUsed: explicit };
    }
  }

  // Name-based lookup using search endpoint
  const cleaned = message.replace(/\?|\./g, " ").trim();
  const search = await fetchJson(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(
      cleaned
    )}&token=${apiKey}`
  );
  const best = Array.isArray(search?.result)
    ? search.result.find(
        (r) =>
          r.type === "Common Stock" || r.type === "ETF" || r.type === "Equity"
      ) || search.result[0]
    : null;
  const symbol = best?.symbol || null;
  return { ticker: symbol, queryUsed: cleaned };
}

async function fetchStockSnapshot(ticker) {
  const apiKey =
    process.env.FINHUB_API_KEY ||
    process.env.FINNHUB_API_KEY ||
    process.env.EXPO_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) return { error: "Missing FINNHUB API key" };

  const [quote, profile, recs, priceTarget, metrics, news] = await Promise.all([
    fetchJson(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${apiKey}`
    ),
    fetchJson(
      `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`
    ),
    // last 5 company news items within ~30 days
    (() => {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const from = past.toISOString().slice(0, 10);
      const to = now.toISOString().slice(0, 10);
      return fetchJson(
        `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${apiKey}`
      );
    })(),
  ]);

  return {
    current: quote?.c ?? null,
    change: quote?.d ?? null,
    changePercent: quote?.dp ?? null,
    high: quote?.h ?? null,
    low: quote?.l ?? null,
    prevClose: quote?.pc ?? null,
    open: quote?.o ?? null,
    ts: quote?.t ? new Date(quote.t * 1000).toISOString() : null,
    profile: profile || null,
    recommendations: recs || [],
    priceTarget: priceTarget || null,
    metrics: metrics?.metric || null,
    news: Array.isArray(news) ? news.slice(0, 5) : [],
  };
}

// Deprecated: replaced by buildStockDataSummary
function formatStockResponse(data) {
  const name = data.profile?.name || data.ticker || "Stock";
  const cur =
    data.current != null ? `$${Number(data.current).toFixed(2)}` : "n/a";
  const dp =
    data.changePercent != null
      ? `${Number(data.changePercent).toFixed(2)}%`
      : "n/a";
  const pt = data.priceTarget?.targetMean
    ? `$${Number(data.priceTarget.targetMean).toFixed(2)}`
    : null;

  let recLine = "";
  if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
    const latest = data.recommendations[0];
    const totals = [
      latest?.strongBuy || 0,
      latest?.buy || 0,
      latest?.hold || 0,
      latest?.sell || 0,
      latest?.strongSell || 0,
    ];
    const sum = totals.reduce((a, b) => a + b, 0) || 1;
    recLine = `Analyst mix (latest ${latest?.period || ""}): Buy ${(
      (100 * (totals[0] + totals[1])) /
      sum
    ).toFixed(0)}%, Hold ${((100 * totals[2]) / sum).toFixed(0)}%, Sell ${(
      (100 * (totals[3] + totals[4])) /
      sum
    ).toFixed(0)}%`;
  }

  let out = `${name} (${data.ticker}) — Snapshot\n\n`;
  out += `Price: ${cur} (${dp} today)\n`;
  if (pt) out += `Price target (mean): ${pt}\n`;
  if (recLine) out += `${recLine}\n`;
  if (data.profile?.finnhubIndustry)
    out += `\nIndustry: ${data.profile.finnhubIndustry}\n`;
  if (data.profile?.weburl) out += `Website: ${data.profile.weburl}\n`;
  // Add a couple of basic metrics if available
  const pe = data.metrics?.peBasicExclExtraTTM || data.metrics?.peBasicTTM;
  const ps = data.metrics?.psTTM;
  if (pe || ps) {
    const ratioParts = [];
    if (pe) ratioParts.push(`P/E ${Number(pe).toFixed(1)}`);
    if (ps) ratioParts.push(`P/S ${Number(ps).toFixed(1)}`);
    if (ratioParts.length > 0) {
      out += `\nKey ratios (TTM): ${ratioParts.join(", ")}\n`;
      // add a blank line
      out += "\n\n";
    }
  }
  // Add latest headlines
  if (Array.isArray(data.news) && data.news.length > 0) {
    out += "\n";
    out += "\nRecent headlines:\n";
    for (const n of data.news.slice(0, 3)) {
      if (n.headline) out += `- ${n.headline}\n`;
    }
  }
  if (data.ts) out += `\nAs of ${new Date(data.ts).toLocaleString()}`;
  return out;
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

function buildStockDataSummary(stockData, stockPlan = null) {
  const name = stockData.profile?.name || stockData.ticker || "Stock";
  const cur =
    stockData.current != null
      ? `$${Number(stockData.current).toFixed(2)}`
      : "n/a";
  const dp =
    stockData.changePercent != null
      ? `${Number(stockData.changePercent).toFixed(2)}%`
      : "n/a";
  const pt = stockData.priceTarget?.targetMean
    ? `$${Number(stockData.priceTarget.targetMean).toFixed(2)}`
    : null;

  let summary = `${name} (${stockData.ticker})\n`;
  summary += "\n";
  summary += `\nCurrent price: ${cur} (${dp} today)\n`;

  if (pt) summary += `\nAnalyst price target: ${pt}\n`;

  // Analyst recommendations
  if (
    Array.isArray(stockData.recommendations) &&
    stockData.recommendations.length > 0
  ) {
    const latest = stockData.recommendations[0];
    const totals = [
      latest?.strongBuy || 0,
      latest?.buy || 0,
      latest?.hold || 0,
      latest?.sell || 0,
      latest?.strongSell || 0,
    ];
    const sum = totals.reduce((a, b) => a + b, 0) || 1;
    const buyPct = ((100 * (totals[0] + totals[1])) / sum).toFixed(0);
    const holdPct = ((100 * totals[2]) / sum).toFixed(0);
    const sellPct = ((100 * (totals[3] + totals[4])) / sum).toFixed(0);
    summary += "\n";
    summary += `Analyst sentiment: ${buyPct}% Buy, ${holdPct}% Hold, ${sellPct}% Sell\n`;
  }

  if (stockData.profile?.finnhubIndustry) {
    summary += "\n";
    summary += `Industry: ${stockData.profile.finnhubIndustry}\n`;
  }

  // Key metrics
  const pe =
    stockData.metrics?.peBasicExclExtraTTM || stockData.metrics?.peBasicTTM;
  const ps = stockData.metrics?.psTTM;
  if (pe || ps) {
    summary += "\nKey ratios: ";
    if (pe) summary += `P/E ${Number(pe).toFixed(1)}`;
    if (pe && ps) summary += ", ";
    if (ps) summary += `P/S ${Number(ps).toFixed(1)}`;
    summary += "\n";
  }

  // Additional data from stock plan
  if (stockPlan?.wants) {
    const wants = new Set(stockPlan.wants || []);
    if (
      wants.has("market_cap") &&
      stockData.profile?.marketCapitalization != null
    ) {
      summary += `Market cap: $${Number(
        stockData.profile.marketCapitalization
      ).toLocaleString()}\n`;
    }
    if (wants.has("52w")) {
      const hi = stockData.metrics?.["52WeekHigh"];
      const lo = stockData.metrics?.["52WeekLow"];
      if (hi || lo) {
        summary += `52-week range: ${
          lo ? `$${Number(lo).toFixed(2)}` : "?"
        } - ${hi ? `$${Number(hi).toFixed(2)}` : "?"}\n`;
      }
    }
    if (wants.has("dividend")) {
      const y = stockData.metrics?.dividendYieldIndicatedAnnual;
      const dps = stockData.metrics?.dividendPerShareTTM;
      if (y || dps) {
        summary += `Dividend: ${
          dps ? `$${Number(dps).toFixed(2)} TTM` : "n/a"
        }${y ? ` (${Number(y * 100).toFixed(2)}% yield)` : ""}\n`;
      }
    }
  }

  // Recent news
  if (Array.isArray(stockData.news) && stockData.news.length > 0) {
    summary += "\n";
    summary += "Recent headlines:\n";
    stockData.news.slice(0, 2).forEach((n) => {
      if (n.headline) summary += `- ${n.headline}\n`;
    });
  }

  if (stockData.ts) {
    summary += "\n";
    summary += `Data as of ${new Date(stockData.ts).toLocaleString()}`;
  }

  return summary;
}

async function fetchJson(url) {
  const r = await withTimeout(fetch(url), 10000, null);
  if (!r) return null;
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch {
    return null;
  }
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

// === MEMORY MANAGEMENT FUNCTIONS ===

// In-memory cache for user memories
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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

// Named exports for testing
export {
  quickExtract,
  shouldRunMemoryExtraction,
  validateMemoriesWithSmallModel,
  selectRelevantMemories,
  loadUserMemory,
  saveMemoryCandidates,
  generateMemorySummary,
};
