// api/finny.js
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ||
  "openai/gpt-oss-20b:free" ||
  "openai/gpt-4o-mini:free" ||
  "x-ai/grok-4-fast:free";

// Memory extraction model - small, fast, free
const MEMORY_EXTRACTION_MODEL = "meta-llama/llama-3.3-8b-instruct:free";

// Fixed top-level memory types (5 categories)
const MEMORY_TYPES = {
  profile_trait: "Personal characteristics, demographics, identity",
  constraint: "Financial limitations, obligations, barriers",
  goal: "Future plans, aspirations, targets, dreams",
  preference: "Choices, priorities, risk tolerance, values",
  context_signal: "Life events, situational info, temporary states",
};

// Comprehensive synonyms map for 18-35 US users
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
  "goal.financial.emergency_fund": {
    synonyms: [
      "emergency fund",
      "savings",
      "rainy day fund",
      "safety net",
      "cushion",
      "backup money",
    ],
    examples: [
      "build an emergency fund",
      "save for emergencies",
      "rainy day savings",
      "safety net",
    ],
  },

  "goal.financial.house_down_payment": {
    synonyms: [
      "down payment",
      "buy a house",
      "home purchase",
      "first home",
      "starter home",
      "house hunting",
    ],
    examples: [
      "save for a house",
      "down payment",
      "buying a home",
      "first time buyer",
    ],
  },

  "goal.financial.debt_payoff": {
    synonyms: [
      "pay off debt",
      "debt free",
      "eliminate debt",
      "debt payoff",
      "get out of debt",
    ],
    examples: [
      "pay off my loans",
      "become debt free",
      "eliminate credit card debt",
    ],
  },

  "goal.financial.retirement": {
    synonyms: [
      "retirement",
      "401k",
      "roth ira",
      "retirement savings",
      "pension",
      "retire early",
      "fire",
    ],
    examples: [
      "save for retirement",
      "max out 401k",
      "retire early",
      "financial independence",
    ],
  },

  "goal.financial.investment": {
    synonyms: [
      "invest",
      "investment",
      "stocks",
      "crypto",
      "portfolio",
      "wealth building",
      "passive income",
    ],
    examples: [
      "start investing",
      "build wealth",
      "stock market",
      "cryptocurrency",
      "passive income",
    ],
  },

  "goal.career.job_change": {
    synonyms: [
      "new job",
      "career change",
      "switch jobs",
      "better job",
      "promotion",
      "raise",
      "quit",
    ],
    examples: [
      "find a new job",
      "career change",
      "get promoted",
      "quit my job",
    ],
  },

  "goal.career.education": {
    synonyms: [
      "go back to school",
      "masters degree",
      "certification",
      "learn new skills",
      "online course",
    ],
    examples: [
      "get my masters",
      "learn coding",
      "online course",
      "certification program",
    ],
  },

  "goal.family.marriage": {
    synonyms: [
      "get married",
      "wedding",
      "propose",
      "engagement",
      "marriage",
      "tie the knot",
    ],
    examples: [
      "planning to get married",
      "save for wedding",
      "propose soon",
      "engagement ring",
    ],
  },

  "goal.family.children": {
    synonyms: [
      "have kids",
      "start a family",
      "baby",
      "pregnant",
      "family planning",
      "kids",
      "children",
    ],
    examples: [
      "want to have kids",
      "start a family",
      "planning for a baby",
      "family planning",
    ],
  },

  "goal.lifestyle.travel": {
    synonyms: [
      "travel",
      "vacation",
      "trip",
      "backpacking",
      "europe",
      "travel the world",
      "sabbatical",
    ],
    examples: ["travel more", "europe trip", "backpacking", "travel the world"],
  },

  "goal.lifestyle.moving": {
    synonyms: [
      "move",
      "relocate",
      "new city",
      "move out",
      "get my own place",
      "apartment",
      "house",
    ],
    examples: [
      "move to a new city",
      "get my own place",
      "move out of parents",
      "relocate",
    ],
  },

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

// Memory extraction using small model (parallel processing)
async function extractMemoriesWithSmallModel(message, hints) {
  try {
    const extractionPrompt = `
Extract user information and map to these exact keys:
${JSON.stringify(KEY_SYNONYMS, null, 2)}

User message: "${message}"
Pre-detected hints: ${JSON.stringify(hints)}

Return ONLY valid JSON (no markdown, no code blocks, no explanations):
{"memories": [
  {"type": "profile_trait", "key": "profile_trait.family.marital_status", "value": "married", "confidence": 0.9}
]}

RULES:
1. Use the provided keys when possible
2. For interests, hobbies, or traits not in the list, create new keys using this pattern:
   - profile_trait.interests.{interest_name} (e.g., "profile_trait.interests.art", "profile_trait.interests.soccer")
   - profile_trait.hobbies.{hobby_name} (e.g., "profile_trait.hobbies.pottery", "profile_trait.hobbies.dancing")
   - profile_trait.skills.{skill_name} (e.g., "profile_trait.skills.cooking", "profile_trait.skills.photography")
3. For unmapped information, use context_signal.unmapped
4. Only extract information with confidence >= 0.7
`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MEMORY_EXTRACTION_MODEL,
          temperature: 0.1, // Low for consistent extraction
          max_tokens: 500, // Small response
          messages: [
            {
              role: "system",
              content:
                "You are a memory extraction specialist. Return only valid JSON.",
            },
            { role: "user", content: extractionPrompt },
          ],
        }),
      }
    );

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.log("🧠 [MEMORY] No content from extraction model");
      return hints; // Fallback to hints
    }

    try {
      // Clean the content to handle markdown code blocks
      let cleanContent = content.trim();

      // Remove markdown code blocks if present
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent
          .replace(/^```\s*/, "")
          .replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleanContent);
      const extractedMemories = parsed.memories || [];

      // Combine hints with extracted memories
      const allMemories = [...hints, ...extractedMemories];

      // Filter by confidence and remove duplicates
      const uniqueMemories = allMemories.filter(
        (memory, index, self) =>
          memory.confidence >= 0.7 &&
          index ===
            self.findIndex(
              (m) => m.key === memory.key && m.type === memory.type
            )
      );

      console.log(
        `🧠 [MEMORY] Extracted ${uniqueMemories.length} memories (${hints.length} hints + ${extractedMemories.length} extracted)`
      );
      return uniqueMemories;
    } catch (parseError) {
      console.log("🧠 [MEMORY] JSON parse error:", parseError);
      console.log("🧠 [MEMORY] Raw content that failed to parse:", content);
      console.log("🧠 [MEMORY] Cleaned content:", cleanContent);
      return hints; // Fallback to hints
    }
  } catch (error) {
    console.error("🧠 [MEMORY] Extraction error:", error);
    return hints; // Fallback to hints
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

  const { action, message, context, ...otherParams } = req.body;
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
  const safeContext = {
    ...(context || {}),
    user_id: serverUserId || null,
    profile: userProfile,
    // NEW: Add memory reading
    memory: await loadUserMemory(serverUserId),
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
        response = await handleAsk(message, safeContext);
        break;
      case "ask_state_rule":
        response = await handleAskStateRule(message, safeContext);
        break;
      case "ask_fact_fresh":
        response = await handleAskFactFresh(message, safeContext);
        break;
      case "off_topic":
        response = await handleOffTopic(message, safeContext);
        break;
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

async function handleAsk(message, context) {
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
    // 0) If this looks like a stock question, route to Finnhub fast-path regardless of classifier
    if (looksLikeStockQuery(message)) {
      try {
        if (looksLikeStockDeepQuery(message)) {
          const plan = await planStockRequest(message);
          const exec = await executeStockPlan(plan || {}, message);
          if (!exec.error && exec.data?.current != null) {
            const formatted = formatPlannedStockResponse(exec);
            const response = { message: formatted, type: "assistant" };
            setImmediate(() =>
              logConversation({
                user_message: redactPII(message),
                finny_response: redactPII(formatted),
                timestamp: new Date().toISOString(),
                user_id: context?.user_id || "unknown",
                intent: "ask_fact_fresh",
                entities: [exec.ticker].filter(Boolean),
                confidence: 0.95,
                response_time_ms: Date.now() - startTime,
                sources_used: [
                  "finnhub:quote",
                  "finnhub:profile2",
                  "finnhub:recommendation",
                  "finnhub:price-target",
                  "finnhub:metric",
                  plan?.wants?.includes("earnings") ? "finnhub:earnings" : null,
                  plan?.wants?.includes("filings") ? "finnhub:filings" : null,
                  plan?.wants?.includes("insider") ? "finnhub:insider" : null,
                ].filter(Boolean),
                cached: false,
                request_id: generateRequestId(),
                metrics: {
                  intent: "ask_fact_fresh",
                  latency_ms: { total: Date.now() - startTime },
                },
              })
            );
            return response;
          }
        }

        const stockResponse = await getCachedDataWithFallback(
          "stock_snapshot",
          message.toLowerCase().trim(),
          async () => {
            const { ticker, queryUsed } = await resolveTickerForQuery(message);
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
          const formatted = formatStockResponse(data);
          const response = {
            message: formatted,
            type: "assistant",
          };

          // Log
          setImmediate(() =>
            logConversation({
              user_message: redactPII(message),
              finny_response: redactPII(formatted),
              timestamp: new Date().toISOString(),
              user_id: context?.user_id || "unknown",
              intent: "ask_fact_fresh",
              entities: [data.ticker, data.profile?.name].filter(Boolean),
              confidence: 0.95,
              response_time_ms: Date.now() - startTime,
              sources_used: [
                "finnhub:quote",
                "finnhub:profile2",
                "finnhub:recommendation",
                data.priceTarget ? "finnhub:price-target" : null,
              ].filter(Boolean),
              cached: !!stockResponse?.cachedAt,
              request_id: generateRequestId(),
              metrics: {
                intent: "ask_fact_fresh",
                latency_ms: { total: Date.now() - startTime },
                tools_used: [
                  {
                    name: "finnhub",
                    latency_ms: Date.now() - startTime,
                    cache_hit: !!stockResponse?.cachedAt,
                  },
                ],
                model: null,
                cache_hits: { finnhub: !!stockResponse?.cachedAt },
                tokens: null,
                result: "success",
              },
            })
          );

          return response;
        }
      } catch (e) {
        console.log(
          "ℹ️ [FINNY] Stock fast-path failed, falling back:",
          e?.message
        );
      }
    }

    // 1) Get user_id from context
    const userId = context?.user_id;

    if (!userId) {
      console.log("❌ [FINNY] No user_id provided in context");
      return {
        message:
          "I need to know who you are to provide personalized advice. Please try again.",
        type: "assistant",
      };
    }

    // 2) NEW: Use deterministic context planner
    console.log("🎯 [FINNY] Using deterministic context planner");
    const slots = extractSlots(message);
    const needs = planNeeds(slots, message);

    console.log("🎯 [FINNY] Extracted slots:", slots);
    console.log("🎯 [FINNY] Planned needs:", needs);

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
      // NEW: Add memory context
      ...(context.memory?.summary
        ? [`User context: ${context.memory.summary}`]
        : []),
      ...(context.memory?.memories?.length
        ? [
            `Traits: ${context.memory.memories
              .filter((m) => m.memory_type === "profile_trait")
              .map((m) => `${m.key}: ${m.value}`)
              .join(", ")}`,
            `Constraints: ${context.memory.memories
              .filter((m) => m.memory_type === "constraint")
              .map((m) => `${m.key}: ${m.value}`)
              .join(", ")}`,
            `Preferences: ${context.memory.memories
              .filter((m) => m.memory_type === "preference")
              .map((m) => `${m.key}: ${m.value}`)
              .join(", ")}`,
            `Future plans: ${context.memory.memories
              .filter((m) => m.memory_type === "future_plan")
              .map((m) => `${m.key}: ${m.value}`)
              .join(", ")}`,
          ]
        : []),
      "",
      "RESPONSE GUIDELINES:",
      "- Be CONCISE and focused - only answer what the user is asking for",
      "- Don't overwhelm users with too much information at once",
      "- If user asks about 'accounts', show account balances and types, NOT individual holdings",
      "- If user asks about 'investments' or 'holdings', then show the detailed holdings",
      "- Keep responses conversational and encouraging, not overwhelming",
      "- Provide actionable advice that users can implement immediately",
      "- Explain financial concepts in simple, understandable terms",
      "- Connect advice to the user's specific financial situation when possible",
      "- If required data is missing (e.g., no transactions or summary), explicitly say so and ask the user to refresh or connect accounts. Do NOT fabricate data.",
      "- When listing transactions, ONLY use transactions present in the provided context. If none exist, say you couldn't find recent transactions.",
      "- For amounts like net worth, ONLY use values from the context. If missing, state that it's unavailable.",
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
    console.log("⚡ [MEMORY] Quick hints:", hints);

    // Parallel execution
    const [resp, memoryExtraction] = await Promise.all([
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

      // Memory extraction (small model)
      extractMemoriesWithSmallModel(message, hints),
    ]);

    timings.llm_ms = Date.now() - llmT0;
    toolsUsed.push({
      name: "llm",
      latency_ms: timings.llm_ms,
      cache_hit: false,
    });

    if (!resp.ok) {
      console.error("❌ [FINNY] OpenRouter API error:", resp.status);
      return {
        message: "I'm glitching right now—try again.",
        type: "assistant",
      };
    }

    const data = await resp.json();
    const cleanText =
      data.choices?.[0]?.message?.content ?? "I'm not sure yet. Ask me again?";

    // Background memory save (non-blocking)
    if (memoryExtraction.length > 0) {
      console.log(
        `🧠 [FINNY] Saving ${memoryExtraction.length} memories in background:`,
        memoryExtraction
      );
      setImmediate(async () => {
        try {
          await saveMemoryCandidates(context?.user_id, memoryExtraction);
          console.log("🧠 [FINNY] Memory save completed successfully");
        } catch (error) {
          console.error("🧠 [FINNY] Memory save failed:", error);
        }
      });
    } else {
      console.log("🧠 [FINNY] No memories to save");
    }

    const response = {
      message:
        gaps.length > 0
          ? `${cleanText}\n\n(Using available data - some data may be incomplete.)`
          : cleanText,
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
      sources_used: [],
      cached: false,
      context_packs: Object.keys(packs),
      data_gaps: gaps,
      request_id: generateRequestId(),
      metrics: {
        intent: "ask_personalized",
        latency_ms: {
          total: Date.now() - startTime,
          llm: timings.llm_ms,
          data_fetch: timings.summary_ms + timings.user_data_ms,
        },
        tools_used: toolsUsed,
        model: OPENROUTER_MODEL,
        cache_hits: {},
        tokens: null,
        result: gaps.length > 0 ? "degraded" : "success",
      },
    };

    // Log conversation asynchronously (don't wait for it)
    setImmediate(() => logConversation(conversationData));

    return response;
  } catch (error) {
    console.error("❌ [FINNY] Ask handler error:", error);
    return {
      message:
        "I'm having some technical difficulties right now. Please try again in a moment.",
      type: "assistant",
    };
  }
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
    // Always fetch financial summary first
    if (needs.includes("summary_min")) {
      const summaryRes = await fetch(
        `${process.env.APP_BASE_URL}/api/store_accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "financial_summary",
            user_id: userId,
          }),
        }
      );

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        packs.base = {
          netWorth: summaryData.summary?.netWorth || 0,
          liquidAssets: summaryData.summary?.liquidAssets || 0,
          investmentsTotal: summaryData.summary?.investmentsTotal || 0,
          totalLiabilities: summaryData.summary?.totalLiabilities || 0,
          recentTransactions: (summaryData.transactions?.recent || [])
            .slice(0, 5)
            .map((txn) => ({
              date: txn.date,
              amount: txn.amount,
              merchant: txn.merchant || txn.name,
            })),
          spendByCategory: summaryData.transactions?.spendByCategory || [],
        };
      } else {
        gaps.push("summary_min");
      }
    }

    // Fetch spend data if needed
    if (needs.includes("spend_total") && slots.period) {
      try {
        const spendRes = await withTimeout(
          supabase.rpc("get_spend_summary", {
            p_user_id: userId,
            p_start: slots.period.start,
            p_end: slots.period.end,
          }),
          2000,
          null
        );

        if (spendRes?.data) {
          packs.spend = {
            total: spendRes.data.total_spend || 0,
            count: spendRes.data.txn_count || 0,
            period: `${slots.period.start} to ${slots.period.end}`,
          };
        } else {
          gaps.push("spend_total");
        }
      } catch (error) {
        console.error("❌ [FINNY] Spend summary fetch failed:", error);
        gaps.push("spend_total");
      }
    }

    // Fetch detailed transactions for specific categories when user asks about them
    if (slots.category && slots.period) {
      try {
        const categoryTxnsRes = await withTimeout(
          supabase.rpc("get_transactions_by_category", {
            p_user_id: userId,
            p_category: slots.category,
            p_start: slots.period.start,
            p_end: slots.period.end,
          }),
          2000,
          null
        );

        if (categoryTxnsRes?.data && categoryTxnsRes.data.length > 0) {
          packs.categoryDetails = {
            category: slots.category,
            transactions: categoryTxnsRes.data.map((txn) => ({
              date: txn.date,
              amount: txn.amount,
              name: txn.name,
              merchant: txn.merchant_name || txn.name,
              category: txn.category,
            })),
            period: `${slots.period.start} to ${slots.period.end}`,
          };
        }
      } catch (error) {
        console.error("❌ [FINNY] Category transactions fetch failed:", error);
        // Don't add to gaps - this is optional detail data
      }
    }

    // Fetch transactions by category if needed
    if (needs.includes("txns_by_category") && slots.category && slots.period) {
      try {
        const txnRes = await withTimeout(
          supabase.rpc("get_transactions_by_category", {
            p_user_id: userId,
            p_category: slots.category,
            p_start: slots.period.start,
            p_end: slots.period.end,
          }),
          2000,
          null
        );

        if (txnRes?.data) {
          packs.spend = {
            ...packs.spend,
            category: slots.category,
            transactions: (txnRes.data || []).slice(0, 20).map((txn) => ({
              date: txn.date,
              amount: txn.amount,
              merchant: txn.merchant_name || txn.name,
            })),
          };
        } else {
          gaps.push("txns_by_category");
        }
      } catch (error) {
        console.error(
          "❌ [FINNY] Transactions by category fetch failed:",
          error
        );
        gaps.push("txns_by_category");
      }
    }

    // Fetch investment holdings if needed
    if (needs.includes("invest_holdings")) {
      try {
        const holdingsRes = await withTimeout(
          supabase.rpc("get_investment_holdings_detailed", {
            p_user_id: userId,
          }),
          2000,
          null
        );

        if (holdingsRes?.data) {
          packs.invest = {
            holdings: (holdingsRes.data || []).map((holding) => ({
              symbol: holding.symbol,
              description: holding.description,
              units: holding.units,
              market_value: holding.market_value,
            })),
          };
        } else {
          gaps.push("invest_holdings");
        }
      } catch (error) {
        console.error("❌ [FINNY] Investment holdings fetch failed:", error);
        gaps.push("invest_holdings");
      }
    }

    // Fetch goals if needed
    if (needs.includes("goals_overview")) {
      try {
        const goalsRes = await withTimeout(
          supabase.rpc("get_goals_overview", {
            p_user_id: userId,
            p_limit: 10,
          }),
          2000,
          null
        );

        if (goalsRes?.data) {
          packs.goals = {
            goals: (goalsRes.data || []).map((goal) => ({
              label: goal.label,
              current_amount: goal.current_amount,
              target_amount: goal.target_amount,
              progress_pct: goal.progress_pct,
              target_date: goal.target_date,
            })),
          };
        } else {
          gaps.push("goals_overview");
        }
      } catch (error) {
        console.error("❌ [FINNY] Goals overview fetch failed:", error);
        gaps.push("goals_overview");
      }
    }

    // Fetch cashflow if needed
    if (needs.includes("cashflow_monthly")) {
      try {
        const cashflowRes = await withTimeout(
          supabase.rpc("get_cashflow_monthly", {
            p_user_id: userId,
            p_months: 3,
          }),
          2000,
          null
        );

        if (cashflowRes?.data) {
          packs.goals = {
            ...packs.goals,
            cashflow: (cashflowRes.data || []).map((cf) => ({
              month: cf.month,
              income: cf.income,
              expense: cf.expense,
              net: cf.net,
            })),
          };
        } else {
          gaps.push("cashflow_monthly");
        }
      } catch (error) {
        console.error("❌ [FINNY] Cashflow monthly fetch failed:", error);
        gaps.push("cashflow_monthly");
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

// Smart context creation based on the question type
function createSmartContext(message, snap) {
  const lowerMessage = message.toLowerCase();
  const context = [];

  // Profile enrichment
  if (snap.profile) {
    if (snap.profile.name) context.push(`Name: ${snap.profile.name}`);
    if (snap.profile.age) context.push(`Age: ${snap.profile.age}`);
  }

  // Net worth related questions
  if (lowerMessage.includes("net worth") || lowerMessage.includes("networth")) {
    context.push(`Net Worth: $${snap.summary.netWorth}`);
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
  }

  // Investment related questions
  if (
    lowerMessage.includes("invest") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("stock") ||
    lowerMessage.includes("fund")
  ) {
    context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
    context.push(`Investment Cash: $${snap.summary.investmentCash}`);
    if (snap.meta?.investmentsAsOf) {
      context.push(`Data as of: ${snap.meta.investmentsAsOf}`);
    }
  }

  // Investment holdings questions - only show detailed holdings if specifically asked
  if (
    lowerMessage.includes("holdings") ||
    lowerMessage.includes("stocks") ||
    lowerMessage.includes("shares") ||
    lowerMessage.includes("equity") ||
    lowerMessage.includes("portfolio") ||
    lowerMessage.includes("investment") ||
    lowerMessage.includes("what stocks") ||
    lowerMessage.includes("what shares")
  ) {
    if (snap.holdings && snap.holdings.length > 0) {
      context.push("Your investment holdings:");
      snap.holdings.forEach((holding) => {
        context.push(
          `${holding.symbol} (${holding.description}): ${
            holding.units
          } shares, $${holding.market_value.toFixed(2)}`
        );
      });

      const totalHoldingsValue = snap.holdings.reduce(
        (sum, holding) => sum + (holding.market_value || 0),
        0
      );
      context.push(`Total holdings value: $${totalHoldingsValue.toFixed(2)}`);
    }
  }

  // Cash/liquid assets questions
  if (
    lowerMessage.includes("cash") ||
    lowerMessage.includes("liquid") ||
    lowerMessage.includes("checking") ||
    lowerMessage.includes("savings")
  ) {
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Investment Cash: $${snap.summary.investmentCash}`);

    // Add bank account details
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      const liquidAccounts = snap.bankAccounts.filter((account) => {
        const type = (account.type || "").toLowerCase();
        const subtype = (account.subtype || "").toLowerCase();
        return (
          type === "depository" ||
          subtype.includes("checking") ||
          subtype.includes("savings")
        );
      });
      if (liquidAccounts.length > 0) {
        context.push("Bank accounts (liquid):");
        liquidAccounts.forEach((account) => {
          const available =
            account.available_balance ?? account.current_balance ?? 0;
          context.push(
            `${account.institution_name} ${account.name} (${
              account.mask || "****"
            }): $${Number(available).toFixed(2)}`
          );
        });
      }
    }
  }

  // Debt/liability questions
  if (
    lowerMessage.includes("debt") ||
    lowerMessage.includes("liability") ||
    lowerMessage.includes("owe") ||
    lowerMessage.includes("credit card")
  ) {
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
    context.push(`Net Worth: $${snap.summary.netWorth}`);

    // Add credit card details if available
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      const creditCards = snap.bankAccounts.filter(
        (account) =>
          account.type?.toLowerCase().includes("credit") ||
          account.name?.toLowerCase().includes("credit") ||
          account.subtype?.toLowerCase().includes("credit")
      );

      if (creditCards.length > 0) {
        context.push("Credit cards:");
        creditCards.forEach((card) => {
          // For credit cards: current_balance is debt, available_balance is credit limit
          const debt = card.current_balance || 0;
          const creditLimit = card.available_balance || 0;
          const availableCredit = creditLimit - debt;
          context.push(
            `${card.institution_name} ${card.name} (${
              card.mask || "****"
            }): Debt $${debt.toFixed(2)}, Credit Limit $${creditLimit.toFixed(
              2
            )}, Available Credit $${availableCredit.toFixed(2)}`
          );
        });
      }
    }
  }

  // Transaction related questions
  if (
    lowerMessage.includes("spend") ||
    lowerMessage.includes("spent") ||
    lowerMessage.includes("expense") ||
    lowerMessage.includes("transaction") ||
    lowerMessage.includes("purchase") ||
    lowerMessage.includes("bought")
  ) {
    // Add recent transactions
    if (snap.transactions?.recent?.length > 0) {
      context.push("Recent transactions:");
      snap.transactions.recent.slice(0, 10).forEach((txn) => {
        const amount = Math.abs(txn.amount);
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        context.push(
          `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
            txn.merchant || txn.name
          }`
        );
      });
    }

    // Add spend by category
    if (snap.transactions?.spendByCategory?.length > 0) {
      context.push("This month's spending by category:");
      snap.transactions.spendByCategory.slice(0, 10).forEach((cat) => {
        context.push(
          `${cat.category}: $${cat.total_spend.toFixed(2)} (${
            cat.txn_count
          } transactions)`
        );
      });
    }
  }

  // Include account overview for account-related questions
  if (
    lowerMessage.includes("account") ||
    lowerMessage.includes("balance") ||
    lowerMessage.includes("bank") ||
    lowerMessage.includes("credit")
  ) {
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      context.push("Your accounts:");
      snap.bankAccounts.forEach((account) => {
        const balance = account.current_balance || 0;
        const available = account.available_balance || 0;
        const accountType = account.type || "unknown";
        const subtype = account.subtype || "";

        if (accountType.toLowerCase().includes("credit")) {
          // For credit cards: current_balance is debt, available_balance is credit limit
          const debt = balance;
          const creditLimit = available;
          const availableCredit = creditLimit - debt;
          context.push(
            `${account.institution_name} ${account.name} (${
              account.mask || "****"
            }): $${accountType} - Debt: $${debt.toFixed(
              2
            )}, Credit Limit: $${creditLimit.toFixed(
              2
            )}, Available Credit: $${availableCredit.toFixed(2)}`
          );
        } else {
          // For regular accounts
          context.push(
            `${account.institution_name} ${account.name} (${
              account.mask || "****"
            }): $${accountType} ${
              subtype ? `(${subtype})` : ""
            } - Balance: $${balance.toFixed(2)}`
          );
        }
      });
    }
  }

  // Cashflow questions
  if (
    lowerMessage.includes("income") ||
    lowerMessage.includes("cashflow") ||
    lowerMessage.includes("monthly") ||
    lowerMessage.includes("earn")
  ) {
    if (snap.transactions?.cashflow?.length > 0) {
      context.push("Recent monthly cashflow:");
      snap.transactions.cashflow.slice(0, 3).forEach((cf) => {
        context.push(
          `${cf.month}: Income $${cf.income.toFixed(
            2
          )}, Expenses $${cf.expense.toFixed(2)}, Net $${cf.net.toFixed(2)}`
        );
      });
    }
  }

  // Bills/subscriptions questions
  if (
    lowerMessage.includes("bill") ||
    lowerMessage.includes("subscription") ||
    lowerMessage.includes("recurring") ||
    lowerMessage.includes("payment") ||
    lowerMessage.includes("due")
  ) {
    if (snap.recurring?.active?.length > 0) {
      context.push("Active recurring payments:");
      snap.recurring.active.forEach((stream) => {
        if (stream.flow_type === "outflow") {
          context.push(
            `${stream.merchant_name}: $${stream.average_amount.toFixed(2)} ${
              stream.frequency
            }`
          );
        }
      });
    }

    if (snap.recurring?.upcoming?.length > 0) {
      context.push("Upcoming bills:");
      snap.recurring.upcoming
        .filter((bill) => bill.flow_type === "outflow" && bill.next_date)
        .slice(0, 5)
        .forEach((bill) => {
          context.push(
            `${bill.merchant_name}: $${bill.average_amount.toFixed(2)} due ${
              bill.next_date
            }`
          );
        });
    }
  }

  // Goals questions
  if (
    lowerMessage.includes("goal") ||
    lowerMessage.includes("save") ||
    lowerMessage.includes("target") ||
    lowerMessage.includes("progress")
  ) {
    if (snap.goals?.length > 0) {
      context.push("Current goals:");
      const now = new Date();
      const nowUTC = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      );
      const msPerDay = 24 * 60 * 60 * 1000;
      snap.goals.forEach((goal) => {
        let timeLeft = "";
        if (goal.target_date) {
          const due = new Date(goal.target_date);
          if (!isNaN(due.getTime())) {
            const dueUTC = Date.UTC(
              due.getUTCFullYear(),
              due.getUTCMonth(),
              due.getUTCDate()
            );
            const days = Math.max(0, Math.ceil((dueUTC - nowUTC) / msPerDay));
            const months = Math.floor(days / 30);
            const remDays = days - months * 30;
            timeLeft = ` — Time until due: ${months} months ${remDays} days`;
          }
        }
        context.push(
          `${goal.label}: $${goal.current_amount.toFixed(
            2
          )} / $${goal.target_amount.toFixed(2)} (${
            goal.progress_pct
          }%) - Due ${goal.target_date}${timeLeft}`
        );
      });
    }
  }

  // Enhanced merchant or category-specific queries
  if (snap.enhanced?.data) {
    const enhanced = snap.enhanced;

    if (enhanced.type === "merchant") {
      context.push(
        `Enhanced data for ${enhanced.merchant} (${enhanced.timePeriod}):`
      );
    } else if (enhanced.type === "category") {
      context.push(
        `Enhanced data for ${enhanced.category} (${enhanced.timePeriod}):`
      );
    }

    context.push(
      `Total spent: $${enhanced.data.total_spend?.toFixed(2) || "0.00"}`
    );
    context.push(`Number of transactions: ${enhanced.data.txn_count || 0}`);

    if (enhanced.data.transactions && enhanced.data.transactions.length > 0) {
      context.push("Individual transactions:");
      enhanced.data.transactions.slice(0, 10).forEach((txn) => {
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        context.push(
          `${txn.date}: ${sign}$${Math.abs(txn.amount).toFixed(
            2
          )} (${transactionType}) - ${txn.name}`
        );
      });
    }
  }

  // Only include financial summary for specific questions
  if (
    lowerMessage.includes("net worth") ||
    lowerMessage.includes("summary") ||
    lowerMessage.includes("overview") ||
    lowerMessage.includes("financial position")
  ) {
    if (snap.summary && typeof snap.summary.netWorth !== "undefined") {
      context.push("Financial Summary:");
      context.push(`Net Worth: $${snap.summary.netWorth}`);
      context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
      context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
      context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
    } else {
      context.push("Net worth summary is not available right now.");
    }
  }

  // Only include recent transactions for specific questions
  if (
    lowerMessage.includes("recent") ||
    lowerMessage.includes("transactions") ||
    lowerMessage.includes("activity") ||
    lowerMessage.includes("spending")
  ) {
    const hasSpecificData =
      !!snap.enhanced ||
      !!snap.transactions?.periodSummary ||
      (Array.isArray(snap.transactions?.spendByMonth) &&
        snap.transactions.spendByMonth.length > 0) ||
      (Array.isArray(snap.transactions?.spendByCategory) &&
        snap.transactions.spendByCategory.length > 0);

    if (
      Array.isArray(snap.transactions?.recent) &&
      snap.transactions.recent.length > 0
    ) {
      context.push("Recent Activity (last 5 transactions):");
      snap.transactions.recent.slice(0, 5).forEach((txn) => {
        const amount = Math.abs(txn.amount);
        const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
        const sign = txn.amount < 0 ? "-" : "+";
        context.push(
          `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
            txn.merchant || txn.name
          }`
        );
      });
    } else if (!hasSpecificData) {
      context.push("No recent transactions found in your linked accounts.");
    }
  }

  // Web research data for financial products
  if (snap.webResearch?.success && snap.webResearch.results) {
    const research = snap.webResearch.results;

    context.push("Current financial product information:");
    context.push(
      `Sources researched: ${research.summary.successfulSources}/${research.summary.totalSources}`
    );

    if (research.products && research.products.length > 0) {
      context.push("Product details:");
      research.products.forEach((product, index) => {
        context.push(`${index + 1}. ${product.title}`);
        if (product.metrics.apr && product.metrics.apr.length > 0) {
          const avgApr =
            product.metrics.apr.reduce((sum, val) => sum + val, 0) /
            product.metrics.apr.length;
          context.push(`   APR: ${avgApr.toFixed(2)}%`);
        }
        if (product.metrics.annualFee && product.metrics.annualFee.length > 0) {
          const avgFee =
            product.metrics.annualFee.reduce((sum, val) => sum + val, 0) /
            product.metrics.annualFee.length;
          context.push(`   Annual Fee: $${avgFee.toFixed(2)}`);
        }
        if (product.benefits && product.benefits.length > 0) {
          context.push(
            `   Key Benefits: ${product.benefits.slice(0, 3).join(", ")}`
          );
        }
      });
    }

    if (research.comparisons && research.comparisons.length > 0) {
      context.push("Product comparisons:");
      research.comparisons.forEach((comparison) => {
        context.push(
          `${comparison.product1} vs ${comparison.product2}: ${comparison.winner} wins`
        );
      });
    }

    if (research.keyMetrics && research.keyMetrics.averages) {
      context.push("Market averages:");
      if (research.keyMetrics.averages.apr) {
        context.push(
          `Average APR: ${research.keyMetrics.averages.apr.toFixed(2)}%`
        );
      }
      if (research.keyMetrics.averages.annualFee) {
        context.push(
          `Average Annual Fee: $${research.keyMetrics.averages.annualFee.toFixed(
            2
          )}`
        );
      }
    }
  }

  // Category specific questions
  if (
    lowerMessage.includes("food") ||
    lowerMessage.includes("restaurant") ||
    lowerMessage.includes("groceries") ||
    lowerMessage.includes("entertainment") ||
    lowerMessage.includes("transport") ||
    lowerMessage.includes("uber") ||
    lowerMessage.includes("gas") ||
    lowerMessage.includes("shopping")
  ) {
    if (snap.transactions?.spendByCategory?.length > 0) {
      const relevantCategories = snap.transactions.spendByCategory.filter(
        (cat) =>
          lowerMessage.includes(cat.category.toLowerCase()) ||
          cat.category.toLowerCase().includes(lowerMessage.split(" ")[0])
      );

      if (relevantCategories.length > 0) {
        context.push("Spending in relevant categories:");
        relevantCategories.forEach((cat) => {
          context.push(
            `${cat.category}: $${cat.total_spend.toFixed(2)} this month`
          );
        });
      }
    }
  }

  // Credit card specific questions
  if (
    lowerMessage.includes("credit card") ||
    lowerMessage.includes("credit cards") ||
    lowerMessage.includes("available credit") ||
    lowerMessage.includes("credit limit")
  ) {
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      const creditCards = snap.bankAccounts.filter(
        (account) =>
          account.type?.toLowerCase().includes("credit") ||
          account.name?.toLowerCase().includes("credit") ||
          account.subtype?.toLowerCase().includes("credit")
      );

      if (creditCards.length > 0) {
        context.push("Your credit cards:");
        creditCards.forEach((card) => {
          // For credit cards: current_balance is debt, available_balance is credit limit
          const debt = card.current_balance || 0;
          const creditLimit = card.available_balance || 0;
          const availableCredit = creditLimit - debt;
          context.push(
            `${card.institution_name} ${card.name} (${
              card.mask || "****"
            }): Debt $${debt.toFixed(2)}, Credit Limit $${creditLimit.toFixed(
              2
            )}, Available Credit $${availableCredit.toFixed(2)}`
          );
        });

        // Calculate total available credit
        const totalAvailableCredit = creditCards.reduce((sum, card) => {
          const debt = card.current_balance || 0;
          const creditLimit = card.available_balance || 0;
          return sum + (creditLimit - debt);
        }, 0);
        context.push(
          `Total Available Credit: $${totalAvailableCredit.toFixed(2)}`
        );
      } else {
        context.push("No credit cards found in your account data.");
      }
    }
  }

  // Bank-specific questions
  if (snap.bankAccounts && snap.bankAccounts.length > 0) {
    const bankNames = snap.bankAccounts
      .map((acc) => acc.institution_name?.toLowerCase())
      .filter(Boolean);
    const hasBankQuery = bankNames.some((bankName) =>
      lowerMessage.includes(bankName)
    );

    if (hasBankQuery) {
      const mentionedBank = bankNames.find((bankName) =>
        lowerMessage.includes(bankName)
      );
      if (mentionedBank) {
        const bankAccounts = snap.bankAccounts.filter(
          (acc) => acc.institution_name?.toLowerCase() === mentionedBank
        );

        context.push(`Accounts at ${mentionedBank}:`);
        bankAccounts.forEach((account) => {
          const balance =
            account.current_balance || account.available_balance || 0;
          context.push(
            `${account.name} (${account.mask || "****"}): $${balance.toFixed(
              2
            )}`
          );
        });

        const totalAtBank = bankAccounts.reduce(
          (sum, acc) =>
            sum + (acc.current_balance || acc.available_balance || 0),
          0
        );
        context.push(`Total at ${mentionedBank}: $${totalAtBank.toFixed(2)}`);
      }
    }
  }

  // General financial health questions
  if (
    lowerMessage.includes("how am i doing") ||
    lowerMessage.includes("financial health") ||
    lowerMessage.includes("overview") ||
    lowerMessage.includes("summary") ||
    lowerMessage.includes("status")
  ) {
    // For general questions, provide comprehensive data
    context.push(`Net Worth: $${snap.summary.netWorth}`);
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Investments Total: $${snap.summary.investmentsTotal}`);
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);
    context.push(`Investment Cash: $${snap.summary.investmentCash}`);

    // Add bank account summary
    if (snap.bankAccounts && snap.bankAccounts.length > 0) {
      context.push("Bank accounts:");
      snap.bankAccounts.forEach((account) => {
        const balance =
          account.current_balance || account.available_balance || 0;
        context.push(
          `${account.institution_name} ${account.name}: $${balance.toFixed(2)}`
        );
      });
    }

    // Add top spending categories
    if (snap.transactions?.spendByCategory?.length > 0) {
      context.push("Top spending categories this month:");
      snap.transactions.spendByCategory.slice(0, 3).forEach((cat) => {
        context.push(`${cat.category}: $${cat.total_spend.toFixed(2)}`);
      });
    }

    // Add active goals
    if (snap.goals?.length > 0) {
      context.push("Active goals:");
      snap.goals.slice(0, 3).forEach((goal) => {
        context.push(`${goal.label}: ${goal.progress_pct}% complete`);
      });
    }
  }

  // Rent vs buy questions
  if (
    lowerMessage.includes("rent vs buy") ||
    lowerMessage.includes("rent or buy") ||
    lowerMessage.includes("renting vs buying") ||
    lowerMessage.includes("home buying") ||
    lowerMessage.includes("buy a house") ||
    lowerMessage.includes("buy a home")
  ) {
    // Add user's financial capacity
    context.push(`Net Worth: $${snap.summary.netWorth}`);
    context.push(`Liquid Assets: $${snap.summary.liquidAssets}`);
    context.push(`Total Liabilities: $${snap.summary.totalLiabilities}`);

    // Add market data if available
    if (snap.market) {
      const market = snap.market;
      context.push(`Market Data for ${market.location}:`);
      context.push(
        `Median Home Price: $${market.median_home_price.toLocaleString()}`
      );
      context.push(
        `Median Rent: $${market.median_rent.toLocaleString()}/month`
      );
      context.push(`Current Mortgage Rate: ${market.mortgage_rate}%`);
      context.push(`Price-to-Rent Ratio: ${market.price_to_rent_ratio}`);
      context.push(`Market Trend: ${market.market_trend}`);
    }

    // Add recent cashflow for affordability analysis
    if (snap.transactions?.cashflow?.length > 0) {
      const latestCashflow = snap.transactions.cashflow[0];
      context.push(
        `Recent Monthly Cashflow: Income $${latestCashflow.income.toFixed(
          2
        )}, Expenses $${latestCashflow.expense.toFixed(
          2
        )}, Net $${latestCashflow.net.toFixed(2)}`
      );
    }
  }

  // If no specific context was created, provide minimal data
  if (context.length === 0) {
    context.push(`Net Worth: $${snap.summary.netWorth}`);
  }

  // Period-only spend summaries and trends (if present)
  if (
    lowerMessage.includes("spend") ||
    lowerMessage.includes("spent") ||
    lowerMessage.includes("spending") ||
    lowerMessage.includes("biggest") ||
    lowerMessage.includes("largest")
  ) {
    // Period summary (e.g., last month)
    if (snap.transactions?.periodSummary) {
      const ps = snap.transactions.periodSummary;
      context.push(
        `Selected period total spent: $${Number(ps.total_spend || 0).toFixed(
          2
        )} (${ps.txn_count || 0} transactions)`
      );
    }

    // Last 3 months trend
    if (
      Array.isArray(snap.transactions?.spendByMonth) &&
      snap.transactions.spendByMonth.length > 0
    ) {
      const trend = snap.transactions.spendByMonth
        .slice(0, 3)
        .map((m) => `${m.month}: $${Number(m.total_spend).toFixed(2)}`)
        .join(", ");
      context.push(`Recent trend (last months): ${trend}`);
    }

    // Top categories for the selected period
    if (
      Array.isArray(snap.transactions?.spendByCategory) &&
      snap.transactions.spendByCategory.length > 0
    ) {
      const topCats = snap.transactions.spendByCategory
        .slice(0, 3)
        .map((c) => `${c.category}: $${Number(c.total_spend).toFixed(2)}`)
        .join(", ");
      context.push(`Top categories this period: ${topCats}`);
    }

    // For "biggest transactions" queries, show recent transactions sorted by amount
    if (lowerMessage.includes("biggest") || lowerMessage.includes("largest")) {
      if (
        Array.isArray(snap.transactions?.recent) &&
        snap.transactions.recent.length > 0
      ) {
        const sortedByAmount = [...snap.transactions.recent]
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
          .slice(0, 5);

        context.push("Largest transactions (by amount):");
        sortedByAmount.forEach((txn) => {
          const amount = Math.abs(txn.amount);
          const transactionType = txn.amount < 0 ? "INCOME" : "EXPENSE";
          const sign = txn.amount < 0 ? "-" : "+";
          context.push(
            `${txn.date}: ${sign}$${amount.toFixed(2)} (${transactionType}) - ${
              txn.merchant || txn.name
            }`
          );
        });
      }
    }
  }

  return context.join("\n");
}

// Detect if the message is asking about a specific merchant or category
function detectMerchantQuery(message) {
  const lowerMessage = message.toLowerCase();

  // Common merchant names and patterns
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
    "apple",
    "google",
    "gas station",
    "restaurant",
    "coffee",
    "grocery",
    "groceries",
    "pharmacy",
  ];

  // Category patterns (expanded)
  const categoryPatterns = [
    "food",
    "groceries",
    "transportation",
    "shopping",
    "entertainment",
    "travel",
    "loans",
    "income",
    "personal care",
    "other",
  ];

  // Time period patterns (static)
  const timePatterns = [
    "this month",
    "last month",
    "this week",
    "last week",
    "today",
    "yesterday",
    "this year",
    "last year",
  ];

  // Dynamic last N months
  const nMonthsMatch = lowerMessage.match(/last\s+(\d+)\s+months?/);
  const dynamicPeriod = nMonthsMatch
    ? `last_${parseInt(nMonthsMatch[1], 10)}_months`
    : null;

  // Check if message contains merchant/category
  const hasMerchant = merchantPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );
  const hasCategory = categoryPatterns.some((pattern) =>
    lowerMessage.includes(pattern)
  );
  const hasTimePeriod =
    timePatterns.some((pattern) => lowerMessage.includes(pattern)) ||
    !!dynamicPeriod;

  // Default to "last month" if no time period specified but category/merchant detected
  const timePeriod =
    dynamicPeriod ||
    timePatterns.find((pattern) => lowerMessage.includes(pattern)) ||
    (hasCategory || hasMerchant ? "last month" : null);

  if (timePeriod) {
    if (hasMerchant) {
      // Extract merchant name
      const merchant = merchantPatterns.find((pattern) =>
        lowerMessage.includes(pattern)
      );

      return {
        type: "merchant",
        merchant: merchant,
        timePeriod: timePeriod,
        originalMessage: message,
      };
    } else if (hasCategory) {
      // Extract category name
      const category = categoryPatterns.find((pattern) =>
        lowerMessage.includes(pattern)
      );

      // Detect exclusion like "non-food"
      const exclude = /non[-\s]?food/.test(lowerMessage)
        ? ["food", "groceries"]
        : [];

      return {
        type: "category",
        category: category,
        exclude,
        timePeriod: timePeriod,
        originalMessage: message,
      };
    }
  }

  return null;
}

// Fetch enhanced merchant or category data using the new RPC functions
async function fetchEnhancedMerchantData(userId, query) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
    );

    // Calculate date range based on time period
    const dateRange = calculateDateRange(query.timePeriod);

    if (query.type === "merchant") {
      console.log(
        "🔍 [FINNY] Fetching merchant data for:",
        query.merchant,
        "Date range:",
        dateRange
      );

      // Fetch merchant-specific spending data
      const { data: merchantData, error: merchantError } = await supabase.rpc(
        "get_spending_by_merchant",
        {
          p_user_id: userId,
          p_merchant_name: query.merchant,
          p_start: dateRange.start,
          p_end: dateRange.end,
        }
      );

      if (merchantError) {
        console.error("Error fetching merchant data:", merchantError);
        return null;
      }

      console.log("🔍 [FINNY] Merchant data result:", merchantData);

      return {
        type: "merchant",
        merchant: query.merchant,
        timePeriod: query.timePeriod,
        dateRange: dateRange,
        data: merchantData?.[0] || null,
      };
    } else if (query.type === "category") {
      // Fetch category-specific transaction data
      const { data: categoryData, error: categoryError } = await supabase.rpc(
        "get_transactions_by_category",
        {
          p_user_id: userId,
          p_category: query.category,
          p_start: dateRange.start,
          p_end: dateRange.end,
        }
      );

      if (categoryError) {
        console.error("Error fetching category data:", categoryError);
        return null;
      }

      // Calculate total and count from the transactions
      const totalSpend = categoryData.reduce(
        (sum, txn) => sum + parseFloat(txn.amount),
        0
      );
      const txnCount = categoryData.length;

      return {
        type: "category",
        category: query.category,
        timePeriod: query.timePeriod,
        dateRange: dateRange,
        data: {
          total_spend: totalSpend,
          txn_count: txnCount,
          transactions: categoryData.map((txn) => ({
            id: txn.id,
            date: txn.date,
            amount: parseFloat(txn.amount),
            name: txn.name,
            merchant_name: txn.merchant_name,
            category: txn.category,
            top_category: txn.top_category,
            sub_category: txn.sub_category,
          })),
        },
      };
    }

    return null;
  } catch (error) {
    console.error("Error in fetchEnhancedMerchantData:", error);
    return null;
  }
}

// Calculate date range based on time period
function calculateDateRange(timePeriod) {
  const now = new Date();
  let start, end;

  // Dynamic: last_N_months
  const dynMatch =
    typeof timePeriod === "string" && timePeriod.match(/^last_(\d+)_months$/);
  if (dynMatch) {
    const n = Math.max(1, parseInt(dynMatch[1], 10));
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    start = new Date(firstOfThisMonth);
    start.setMonth(start.getMonth() - n);
    end = now;
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  }

  switch (timePeriod) {
    case "this month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
      break;
    case "last month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case "this week":
      const dayOfWeek = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      end = now;
      break;
    case "last week":
      const lastWeekEnd = new Date(now);
      lastWeekEnd.setDate(now.getDate() - now.getDay());
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 7);
      start = lastWeekStart;
      end = lastWeekEnd;
      break;
    case "today":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = now;
      break;
    case "yesterday":
      start = new Date(now);
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "this year":
      start = new Date(now.getFullYear(), 0, 1);
      end = now;
      break;
    case "last year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear() - 1, 11, 31);
      break;
    default:
      // Default to this month
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
  }

  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

// Detect time-period-only spending queries
function detectTimePeriodOnly(message) {
  const lower = message.toLowerCase();
  const spendTerms = ["spend", "spending", "spent", "transactions"]; // include transactions
  const mentionsSpend = spendTerms.some((t) => lower.includes(t));
  if (!mentionsSpend) return null;

  // Parse "last N months"
  const nMonths = lower.match(/last\s+(\d+)\s+months?/);
  if (nMonths) {
    const n = parseInt(nMonths[1], 10);
    if (!isNaN(n) && n > 0) {
      return { key: `last_${n}_months`, timePeriod: `last_${n}_months` };
    }
  }

  const timeTerms = [
    "this month",
    "last month",
    "this week",
    "last week",
    "today",
    "yesterday",
    "this year",
    "last year",
  ];

  const key = timeTerms.find((t) => lower.includes(t));
  if (!key) return null;
  return { key, timePeriod: key };
}

// Fetch summarized period spend data using new RPCs
async function fetchPeriodSpendData(userId, periodQuery) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log("🔍 [FINNY] fetchPeriodSpendData called with:", periodQuery);

    // Handle last 3 months specially via monthly RPCs
    if (periodQuery.key === "last_3_months") {
      console.log("🔍 [FINNY] Fetching last 3 months data");
      const { data: byMonth, error: byMonthErr } = await supabase.rpc(
        "get_spend_by_month",
        { p_user_id: userId, p_months: 3 }
      );
      if (byMonthErr) {
        console.error("❌ [FINNY] get_spend_by_month error:", byMonthErr);
        throw byMonthErr;
      }

      const { data: byCatPeriods, error: byCatErr } = await supabase.rpc(
        "get_spend_by_category_periods",
        { p_user_id: userId, p_months: 3 }
      );
      if (byCatErr) {
        console.error(
          "❌ [FINNY] get_spend_by_category_periods error:",
          byCatErr
        );
        throw byCatErr;
      }

      return {
        spendByMonth: byMonth || [],
        spendByCategoryPeriods: byCatPeriods || [],
      };
    }

    // Else single-period summary via date range
    const { start, end } = calculateDateRange(periodQuery.timePeriod);
    console.log("🔍 [FINNY] Fetching period data for:", { start, end });

    // Try new RPCs first, fallback to existing ones if they don't exist
    let summary, byCat;

    try {
      const { data: summaryData, error: sumErr } = await supabase.rpc(
        "get_spend_summary",
        { p_user_id: userId, p_start: start, p_end: end }
      );
      if (sumErr) {
        console.warn(
          "⚠️ [FINNY] get_spend_summary not available, using fallback"
        );
        summary = null;
      } else {
        summary = summaryData;
      }
    } catch (e) {
      console.warn(
        "⚠️ [FINNY] get_spend_summary RPC not found, using fallback"
      );
      summary = null;
    }

    try {
      const { data: byCatData, error: catErr } = await supabase.rpc(
        "get_spend_by_category",
        { p_user_id: userId, p_start: start, p_end: end }
      );
      if (catErr) {
        console.warn(
          "⚠️ [FINNY] get_spend_by_category not available, using fallback"
        );
        byCat = null;
      } else {
        byCat = byCatData;
      }
    } catch (e) {
      console.warn(
        "⚠️ [FINNY] get_spend_by_category RPC not found, using fallback"
      );
      byCat = null;
    }

    // Fallback: use existing RPCs if new ones don't exist
    if (!summary || !byCat) {
      console.log("🔄 [FINNY] Using fallback RPCs for period data");
      try {
        const { data: fallbackSummary } = await supabase.rpc(
          "get_cashflow_monthly",
          { p_user_id: userId, p_months: 1 }
        );
        if (fallbackSummary && fallbackSummary.length > 0) {
          const lastMonth = fallbackSummary[0];
          summary = [{ total_spend: lastMonth.expense || 0, txn_count: 0 }];
        }
      } catch (e) {
        console.warn("⚠️ [FINNY] Fallback RPC also failed:", e.message);
      }
    }

    const result = {
      periodSummary: (summary && summary[0]) || {
        total_spend: 0,
        txn_count: 0,
      },
      spendByCategoryPeriods: [],
      spendByMonth: [],
      spendByCategory: byCat || [],
      dateRange: { start, end },
    };

    console.log("🔍 [FINNY] fetchPeriodSpendData result:", result);
    return result;
  } catch (e) {
    console.error("❌ [FINNY] fetchPeriodSpendData error:", e?.message);
    console.error("❌ [FINNY] Full error:", e);
    // Return empty structure instead of null to avoid cache issues
    return {
      periodSummary: { total_spend: 0, txn_count: 0 },
      spendByCategoryPeriods: [],
      spendByMonth: [],
      spendByCategory: [],
      dateRange: { start: null, end: null },
      error: e?.message || "Unknown error",
    };
  }
}

// Pre-classification filtering for obvious non-financial queries
function isObviousNonFinancial(message) {
  const lowerMessage = message.toLowerCase().trim();

  // Finance override: if message mentions common financial terms, skip off-topic filter
  const financeTerms = [
    "spend",
    "spent",
    "spending",
    "transaction",
    "transactions",
    "budget",
    "savings",
    "income",
    "expense",
    "expenses",
    "category",
    "categories",
    "food",
    "travel",
    "groceries",
    "rent",
    "uber",
  ];
  if (financeTerms.some((t) => lowerMessage.includes(t))) {
    return { isOffTopic: false };
  }

  // Weather queries
  if (
    lowerMessage.includes("weather") ||
    lowerMessage.includes("temperature") ||
    lowerMessage.includes("rain") ||
    lowerMessage.includes("sunny") ||
    lowerMessage.includes("forecast")
  ) {
    return { isOffTopic: true, category: "weather" };
  }

  // General greetings and small talk
  if (
    lowerMessage.match(
      /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what's up|how's it going|what's the vibe|how's the vibe|what's good|how are things|how's everything)$/
    )
  ) {
    return { isOffTopic: true, category: "greeting" };
  }

  // Casual conversation and vibe check
  if (
    lowerMessage.includes("vibe") ||
    lowerMessage.includes("what's good") ||
    lowerMessage.includes("how are things") ||
    lowerMessage.includes("how's everything") ||
    lowerMessage.includes("how's it going") ||
    lowerMessage.includes("what's happening") ||
    lowerMessage.includes("how's your day")
  ) {
    return { isOffTopic: true, category: "greeting" };
  }

  // Non-financial questions
  if (
    lowerMessage.includes("recipe") ||
    lowerMessage.includes("cooking") ||
    lowerMessage.includes("movie") ||
    lowerMessage.includes("travel guide")
  ) {
    return { isOffTopic: true, category: "lifestyle" };
  }

  // Technical support (non-financial)
  if (
    lowerMessage.includes("how to use") ||
    lowerMessage.includes("app not working") ||
    lowerMessage.includes("bug") ||
    lowerMessage.includes("error") ||
    lowerMessage.includes("login") ||
    lowerMessage.includes("password")
  ) {
    return { isOffTopic: true, category: "technical" };
  }

  // Philosophical or general questions
  if (
    lowerMessage.includes("meaning of life") ||
    lowerMessage.includes("purpose") ||
    lowerMessage.includes("love") ||
    lowerMessage.includes("happiness")
  ) {
    return { isOffTopic: true, category: "philosophy" };
  }

  return { isOffTopic: false };
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
    // Classify generic concept questions as in-scope, not needing user data or web
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: false,
      needs_calc: false,
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
      needs_calc: false,
      state: null,
      entities: [],
      confidence: 0.1,
      fallback: true,
    };
  }

  // Pre-filter for obvious non-financial queries
  const preFilter = isObviousNonFinancial(text);
  if (preFilter.isOffTopic) {
    console.log(
      "🚫 [FINNY] Pre-filtered as non-financial query:",
      preFilter.category
    );
    return {
      intent: "off_topic",
      needs_web: false,
      needs_user_data: false,
      needs_calc: false,
      state: null,
      entities: [],
      confidence: 0.9,
      category: preFilter.category,
      preFiltered: true,
    };
  }

  // Positive heuristic for common financial concept questions
  const heuristic = financialConceptHeuristic(text);
  if (heuristic) {
    console.log(
      "✅ [FINNY] Heuristic classified as financial concept in-scope"
    );
    // Log lightweight classification
    setImmediate(() =>
      logConversation({
        user_message: message,
        finny_response: `Heuristic classification: ${heuristic.intent} (confidence: ${heuristic.confidence})`,
        timestamp: new Date().toISOString(),
        user_id: context?.user_id || "unknown",
        intent: "classify",
        entities: heuristic.entities,
        confidence: heuristic.confidence,
        response_time_ms: Date.now() - startTime,
        sources_used: [],
        cached: false,
        classification_result: heuristic,
      })
    );
    return heuristic;
  }

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You are Financify's intent router with strict financial scope boundaries.",
              "Classify one user message into exactly one intent.",
              "Intents:",
              "- ask_personalized  question about the user's money that needs their data",
              "- ask_fact_fresh  current year numbers or facts that change",
              "- ask_state_rule  state specific rules or taxes",
              "- calc_projection  what if or plan math",
              "- off_topic  non-financial queries that should be redirected",
              "",
              "Rules:",
              "- **SCOPE BOUNDARIES**: Only handle financial topics. Non-financial queries (weather, recipes, movies, sports, general chat, technical support) should be classified as `off_topic`.",
              "- **Intents are primary; flags can combine.** Return exactly one `intent`, but `needs_user_data`, `needs_calc`, and `needs_web` may be **true** together.",
              "- **OFF-TOPIC DETECTION**: If message is clearly non-financial (weather, cooking, entertainment, sports, general greetings, technical issues), use `intent=off_topic`.",
              "- **CONCEPT EXPLANATIONS ARE IN-SCOPE**: General finance concepts (e.g., 'difference between credit and debit card') are financial. Do not mark them off_topic.",
              "- If message asks for this year current latest updated 2025 etc then ask_fact_fresh",
              "- If asking about specific financial products (cards, banks, rates, benefits, offers) that change over time then ask_fact_fresh",
              "- If comparing specific products/services by name (e.g., 'Chase vs Amex', 'Vanguard vs Fidelity') then ask_fact_fresh",
              "- If the message compares **named** products (e.g., 'Chase Sapphire vs Amex Gold'), set `intent=ask_fact_fresh`, `needs_web=true`, `needs_user_data=false`.",
              "- If the message mentions a **US state** by name or postal code and asks about **rules/benefits/taxes**, set `intent=ask_state_rule`, `needs_web=true`, and fill `state` (use `user_hint_state` only if no state in text).",
              "- If the message asks 'rent vs buy in <city/state>' → `ask_personalized` (needs_web=true, needs_user_data=true) - this is a personal financial decision requiring user data.",
              "- If the message asks about **BNPL reporting/risks** or **current APRs** → `ask_fact_fresh` (needs_web).",
              "- If affordability, FIRE, retirement planning, or financial projections choose ask_personalized (set needs_calc=true)",
              "- If it needs the user's actual data choose ask_personalized",
              "- If purely personal (spend, net worth, goals) → `ask_personalized` (needs_user_data=true, needs_web=false).",
              "- If ambiguous but potentially financial, choose ask_personalized",
              "- **DEFAULT TO FINANCIAL**: When in doubt between financial and non-financial, prefer financial intent.",
              "",
              "Sample inputs and expected intent:",
              '"Set a 2000 emergency fund by March" → ask_personalized',
              '"How much did I spend on Uber last month" → ask_personalized',
              '"How are you" or "What\'s up" or "Am I normal?" → ask_personalized (financial wellness)',
              '"What\'s the weather like?" → off_topic',
              '"How do I cook pasta?" → off_topic',
              '"What movie should I watch?" → off_topic',
              '"Difference between Roth and traditional IRA" → ask_personalized',
              '"Difference between credit and debit card?" → ask_personalized, needs_user_data:false, needs_web:false',
              '"What is the 2025 estate tax exemption" → ask_fact_fresh',
              '"Which card has better benefits Chase Rewards or Bolt?" → ask_fact_fresh',
              '"Which card is better for groceries, Amex Gold or SavorOne?" → ask_fact_fresh, needs_web:true, entities:["Amex Gold","SavorOne"]',
              '"Rent vs buy in Phoenix at 7%" → ask_personalized, needs_web:true, needs_user_data:true, state:"AZ"',
              '"Is BNPL hurting my credit?" → ask_fact_fresh, needs_web:true, entities:["BNPL"]',
              '"Does New Jersey have inheritance tax" → ask_state_rule with state NJ',
              '"Can I hit FIRE by 35" → ask_personalized, needs_calc:true',
              '"Can I retire by 45" → ask_personalized, needs_calc:true',
              '"Will I have enough to retire" → ask_personalized, needs_calc:true',
              '"Can I achieve my financial goals" → ask_personalized, needs_calc:true',
              "Return JSON only. No extra text.",
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
          type: "json_schema",
          json_schema: {
            name: "financify_intent",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                intent: {
                  type: "string",
                  enum: [
                    "ask_personalized",
                    "ask_fact_fresh",
                    "ask_state_rule",
                    "off_topic",
                  ],
                  description: "Single best intent",
                },
                needs_web: {
                  type: "boolean",
                  description: "True if fresh facts or state rules are needed",
                },
                needs_user_data: {
                  type: "boolean",
                  description: "True if answer needs user DB data",
                },
                needs_calc: {
                  type: "boolean",
                  description: "True if a calculator or projection is required",
                },
                state: {
                  type: ["string", "null"],
                  description: "Two letter US state if applicable",
                  pattern: "^[A-Z]{2}$",
                },
                entities: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key entities or topics",
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: [
                "intent",
                "needs_web",
                "needs_user_data",
                "needs_calc",
                "state",
                "entities",
                "confidence",
              ],
            },
          },
        },
      }),
    });

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

    const out = JSON.parse(content);
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

    // Log conversation asynchronously
    setImmediate(() => logConversation(conversationData));

    return out;
  } catch (e) {
    console.error("❌ [FINNY] Classification error:", e?.message);
    // Heuristic fallback if available
    const heuristic = financialConceptHeuristic(message);
    if (heuristic) {
      return heuristic;
    }
    return {
      intent: "ask_personalized",
      needs_web: false,
      needs_user_data: true,
      needs_calc: false,
      state: null,
      entities: [],
      confidence: 0.1,
      fallback: true,
    };
  }
}

async function handleOffTopic(message, context) {
  console.log("🚫 [FINNY] Handling off-topic query:", message);

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
    "Focus on financial empowerment and positive outcomes.",
    "",
    // Add memory context
    ...(context.memory?.summary
      ? [`User context: ${context.memory.summary}`]
      : []),
    ...(context.memory?.memories?.length
      ? [
          `Traits: ${context.memory.memories
            .filter((m) => m.memory_type === "profile_trait")
            .map((m) => `${m.key}: ${m.value}`)
            .join(", ")}`,
          `Constraints: ${context.memory.memories
            .filter((m) => m.memory_type === "constraint")
            .map((m) => `${m.key}: ${m.value}`)
            .join(", ")}`,
          `Preferences: ${context.memory.memories
            .filter((m) => m.memory_type === "preference")
            .map((m) => `${m.key}: ${m.value}`)
            .join(", ")}`,
          `Future plans: ${context.memory.memories
            .filter((m) => m.memory_type === "future_plan")
            .map((m) => `${m.key}: ${m.value}`)
            .join(", ")}`,
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
          model: OPENROUTER_MODEL,
          temperature: 0.7,
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

    // Log the off-topic interaction
    const conversationData = {
      user_message: message,
      finny_response: content,
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "off_topic",
      entities: [],
      confidence: 1.0,
      response_time_ms: Date.now(),
      sources_used: [],
      cached: false,
      category: category,
      redirection_suggestions: redirectionSuggestions,
    };

    // Log conversation asynchronously
    setImmediate(() => logConversation(conversationData));

    return {
      text: content,
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
      text: fallbackResponse,
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

async function handleAskStateRule(message, context) {
  console.log("🏛️ [STATE_RULE] Processing state rule query:", message);

  try {
    // Extract state from message
    const state = extractStateFromMessage(message);
    if (!state) {
      return {
        error:
          "Could not identify state from message. Please specify a state (AZ, CA, NY, TX, NJ).",
        intent: "ask_state_rule",
      };
    }

    // Call the cleaned up facts-and-rules endpoint
    const BASE_URL = process.env.APP_BASE_URL;
    const res = await fetch(`${BASE_URL}/api/facts-and-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "state.rule",
        state: state,
        query: message,
      }),
    });

    if (!res.ok) {
      console.log("❌ [STATE_RULE] Failed to fetch state rule:", res.status);
      return {
        error: "Failed to fetch state rule. Please try again.",
        intent: "ask_state_rule",
      };
    }

    const data = await res.json();

    // If upstream failed or returned fallback, synthesize a safe rule object
    if (data.error || data.fallback || data.not_available) {
      const safeRule = {
        topic: data.topic || "state_rule",
        state: state,
        effective_year: new Date().getFullYear(),
        rule_summary:
          data.message ||
          "Up-to-date details are unavailable right now. Ask a specific question (e.g., standard deduction amount), and I'll fetch it.",
        key_numbers: Array.isArray(data.key_numbers) ? data.key_numbers : [],
        source_title: data.source_title || "Official State Source",
        source_url: data.source_url || null,
        updated_at: data.updated_at || new Date().toISOString(),
        cached: data.cached || false,
        fallback: true,
      };

      // LLM fallback: produce a user-friendly summary if we don't have specifics
      const llmText = await llmStateRuleAnswer(message, state);
      if (llmText) {
        safeRule.rule_summary = llmText;
      }
      const formatted = llmText || formatStateRuleResponse(safeRule, message);
      return {
        intent: "ask_state_rule",
        rule: safeRule,
        cached: !!safeRule.cached,
        message: formatted,
      };
    }

    // Build a richer, user-friendly message for valid data
    const formatted = formatStateRuleResponse(data, message);

    return {
      intent: "ask_state_rule",
      rule: data,
      cached: data.cached || false,
      message: formatted,
    };
  } catch (error) {
    console.error("❌ [STATE_RULE] Error processing state rule:", error);
    return {
      error: "Failed to process state rule query. Please try again.",
      intent: "ask_state_rule",
    };
  }
}

function extractStateFromMessage(message) {
  const lowerMessage = message.toLowerCase();

  // State mappings
  const stateMap = {
    arizona: "AZ",
    az: "AZ",
    california: "CA",
    ca: "CA",
    "new york": "NY",
    ny: "NY",
    texas: "TX",
    tx: "TX",
    "new jersey": "NJ",
    nj: "NJ",
  };

  // Check for state names
  for (const [key, value] of Object.entries(stateMap)) {
    if (lowerMessage.includes(key)) {
      return value;
    }
  }

  return null;
}

async function handleAskFactFresh(message, context) {
  console.log("🌐 [FACT_FRESH] Processing fact fresh query:", message);
  const startTime = Date.now();

  try {
    // If the query sounds like general advice (not a specific product), prefer LLM guidance over comparison
    if (looksLikeGeneralAdvice(message)) {
      const advice = await llmFallbackFacts(message);
      return {
        intent: "ask_fact_fresh",
        message: advice || "Here's practical guidance for your question:",
        cached: false,
      };
    }

    // Fast-path: handle stock/company queries via Finnhub if detected
    if (looksLikeStockQuery(message)) {
      const stockResponse = await getCachedDataWithFallback(
        "stock_snapshot",
        message.toLowerCase().trim(),
        async () => {
          const { ticker, queryUsed } = await resolveTickerForQuery(message);
          if (!ticker) {
            return { error: "Could not resolve ticker from query", queryUsed };
          }
          const snapshot = await fetchStockSnapshot(ticker);
          return { ...snapshot, ticker, queryUsed };
        },
        false
      );

      const data = stockResponse?.data || stockResponse;
      if (data && !data.error && data.current) {
        const formatted = formatStockResponse(data);
        const response = {
          intent: "ask_fact_fresh",
          fact: { topic: "stock_snapshot", ...data },
          cached: !!stockResponse?.cachedAt,
          message: formatted,
        };

        setImmediate(() =>
          logConversation({
            user_message: message,
            finny_response: response.message,
            timestamp: new Date().toISOString(),
            user_id: context?.user_id || "unknown",
            intent: "ask_fact_fresh",
            entities: [data.ticker, data.profile?.name].filter(Boolean),
            confidence: 0.95,
            response_time_ms: Date.now() - startTime,
            sources_used: [
              "finnhub:quote",
              "finnhub:profile2",
              "finnhub:recommendation",
              data.priceTarget ? "finnhub:price-target" : null,
            ].filter(Boolean),
            cached: !!stockResponse?.cachedAt,
            topic: "stock_snapshot",
          })
        );

        return response;
      }
    }

    // Call the cleaned up facts-and-rules endpoint
    const BASE_URL = process.env.APP_BASE_URL;
    const res = await fetch(`${BASE_URL}/api/facts-and-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "facts.get",
        query: message,
      }),
    });

    if (!res.ok) {
      console.log("❌ [FACT_FRESH] Failed to fetch facts:", res.status);
      const llmText = await llmFallbackFacts(message);
      return {
        intent: "ask_fact_fresh",
        fallback: true,
        message:
          llmText ||
          "I couldn't fetch live data right now, but here's what I can tell you:",
      };
    }

    const data = await res.json();

    if (data.error || data.fallback) {
      const llmText = await llmFallbackFacts(message);
      return {
        intent: "ask_fact_fresh",
        fallback: true,
        message:
          llmText ||
          "I couldn't fetch live data right now, but here's what I can tell you:",
      };
    }

    // Delegate final wording to LLM for a user-first answer
    const llmMsg = await llmFallbackFacts(message);
    const response = {
      intent: "ask_fact_fresh",
      fact: data,
      cached: data.cached || false,
      message: llmMsg || undefined,
    };

    // Log the conversation
    const conversationData = {
      user_message: message,
      finny_response: response.message || JSON.stringify(response.fact),
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      intent: "ask_fact_fresh",
      entities: [],
      confidence: 0.9,
      response_time_ms: Date.now() - startTime,
      sources_used: data.sources || [],
      cached: data.cached || false,
      topic: data.topic,
    };

    // Log conversation asynchronously
    setImmediate(() => logConversation(conversationData));

    return response;
  } catch (error) {
    console.error("❌ [FACT_FRESH] Error processing fact fresh:", error);
    const llmText = await llmFallbackFacts(message);
    return {
      intent: "ask_fact_fresh",
      fallback: true,
      message:
        llmText ||
        "I couldn't fetch live data right now, but here's what I can tell you:",
    };
  }
}

// Format product comparison response
// Removed product comparison formatter in favor of LLM summarization

// Format state rule responses (e.g., tax brackets, deductions) into a friendly summary
function formatStateRuleResponse(rule, originalQuery) {
  try {
    if (!rule || typeof rule !== "object") {
      return "Couldn't load state details right now.";
    }

    const state = rule.state || "State";
    const topic = rule.topic || "state_rule";
    const year = rule.effective_year || new Date().getFullYear();
    const title =
      topic === "state_income_tax_brackets"
        ? `STATE INCOME TAX — ${state}`
        : topic === "state_529_deduction_or_credit"
        ? `STATE 529 DEDUCTION/CREDIT — ${state}`
        : `STATE RULE — ${state}`;

    let out = `**${title} (${year})**\n\n`;

    if (rule.rule_summary) {
      out += `${rule.rule_summary}\n\n`;
    }

    // Key numbers table-ish bullets if present
    if (Array.isArray(rule.key_numbers) && rule.key_numbers.length > 0) {
      out += "**Key numbers:**\n";
      for (const kn of rule.key_numbers) {
        const label = kn.label?.replace(/_/g, " ") || "value";
        const unit = kn.unit ? ` ${kn.unit}` : "";
        out += `- ${label}: ${formatNumber(kn.value)}${unit}\n`;
      }
      out += "\n";
    }

    // If response is generic, guide the user with clarifying options
    const looksGeneric =
      topic === "state_income_tax_brackets" &&
      (!rule.key_numbers || rule.key_numbers.length === 0);

    if (looksGeneric) {
      out += "**Did you mean one of these?**\n";
      out += "- Standard deduction amount\n";
      out += "- 529 plan contribution deduction/credit limits\n";
      out += "- Itemized deduction caps or phase-outs\n";
      out += "- Retirement income exclusions (pensions, Social Security)\n";
      out += "- Child/Dependent credits and eligibility\n\n";
      out +=
        "Reply with the specific deduction or credit, and I'll pull the exact limits for " +
        `${state} (${year}).\n\n`;
    }

    if (rule.source_title || rule.updated_at) {
      const dateStr = rule.updated_at || new Date().toISOString().split("T")[0];
      out += `*Source: ${
        rule.source_title || "Official state site"
      } (${dateStr})*`;
      if (rule.source_url) {
        out += `\n${rule.source_url}`;
      }
    }

    return out;
  } catch (e) {
    return "Couldn't format the state rule details right now.";
  }
}

// === LLM fallbacks ===
async function llmFallbackFacts(message) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: [
              "You are Finny, a warm and precise financial advisor specializing in current financial facts and information.",
              "",
              "PERSONALITY & APPROACH:",
              "- Be warm and encouraging while providing accurate, up-to-date information",
              "- Show enthusiasm for helping users stay informed about current financial trends",
              "- Be precise and factual in your responses",
              "- Use the user's name when available",
              "",
              "SCOPE BOUNDARIES:",
              "- ONLY discuss current financial facts, rates, limits, and market information",
              "- Stay focused on actionable, current information users can use",
              "- Redirect non-financial questions to financial topics",
              "",
              "RESPONSE GUIDELINES:",
              "- If live data is unavailable, give a concise, helpful answer based on general knowledge",
              "- Include definitions, typical ranges, and decision factors when relevant",
              "- Do not invent exact current numbers - be transparent about data limitations",
              "- Provide actionable insights based on current information",
              "- Explain financial concepts in simple terms",
              "- Connect current facts to user's potential financial impact",
            ].join("\n"),
          },
          { role: "user", content: message },
        ],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (_) {
    return null;
  }
}

async function llmStateRuleAnswer(message, state) {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: [
              "You are Finny, a warm and knowledgeable financial advisor specializing in state-specific rules and taxes.",
              "",
              "PERSONALITY & APPROACH:",
              "- Be warm and encouraging while providing accurate information",
              "- Show enthusiasm for helping users understand complex state rules",
              "- Be direct and clear when explaining tax implications",
              "- Use the user's name when available",
              "",
              "SCOPE BOUNDARIES:",
              "- ONLY discuss state-specific financial rules, taxes, and benefits",
              "- Stay focused on actionable information users can use",
              "- Redirect non-financial questions to financial topics",
              "",
              "RESPONSE GUIDELINES:",
              "- If specific current-year numbers are unavailable, provide a clear overview of the rule for the state, typical limits, and how to check the official source",
              "- Avoid fabricating exact numbers - be transparent about data limitations",
              "- Provide actionable next steps for users",
              "- Explain complex rules in simple terms",
              "- Connect rules to the user's potential financial impact",
            ].join("\n"),
          },
          {
            role: "user",
            content: `Question: ${message}\nState: ${state}`,
          },
        ],
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (_) {
    return null;
  }
}

function looksLikeGeneralAdvice(message) {
  const m = message.toLowerCase();
  const adviceWords = [
    "best",
    "good",
    "recommend",
    "advice",
    "tips",
    "how to choose",
    "for students",
    "for student",
    "for beginners",
    "young adult",
  ];
  const isAdvice = adviceWords.some((w) => m.includes(w));
  const productWords = ["credit card", "credit cards", "card"];
  const mentionsCards = productWords.some((w) => m.includes(w));
  return isAdvice && mentionsCards;
}

// Deprecated: merged into llmFallbackFacts routing for general advice

function formatNumber(value) {
  if (typeof value !== "number") return String(value ?? "");
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// =====================
// GOALS: Slot-filling
// =====================

const GOAL_CATEGORY_KEYWORDS = [
  { key: "emergency_fund", words: ["emergency", "rainy", "safety"] },
  { key: "vacation", words: ["vacation", "trip", "travel", "holiday"] },
  { key: "car", words: ["car", "auto", "vehicle"] },
  {
    key: "house_down_payment",
    words: ["house", "home", "down payment", "mortgage"],
  },
  {
    key: "education",
    words: ["school", "tuition", "education", "college", "university"],
  },
  { key: "retirement", words: ["retirement", "retire", "401k", "ira"] },
  { key: "wedding", words: ["wedding", "marriage"] },
  { key: "debt_payoff", words: ["debt", "loan", "payoff", "credit card"] },
  { key: "investment", words: ["invest", "portfolio", "stock", "bond"] },
  { key: "other", words: [] },
];

function guessGoalCategory(label) {
  const m = (label || "").toLowerCase();
  for (const entry of GOAL_CATEGORY_KEYWORDS) {
    if (entry.words.some((w) => m.includes(w))) return entry.key;
  }
  // domain-specific tweak: phones/gadgets → treat as emergency_fund or other
  if (/phone|iphone|android|pixel|device|gadget/.test(m))
    return "emergency_fund";
  return "other";
}

function parseCurrencyAmount(text) {
  if (!text) return null;
  // capture $1,234.56 or 1234 or 1.2k
  const dollarMatch = text.match(/\$\s*([0-9,.]+)(?:\s*\b)/i);
  if (dollarMatch) {
    const val = Number(dollarMatch[1].replace(/,/g, ""));
    return isFinite(val) && val > 0 ? val : null;
  }
  const kMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*k\b/i);
  if (kMatch) {
    const val = Number(kMatch[1]) * 1000;
    return isFinite(val) && val > 0 ? val : null;
  }
  const numMatch = text.match(/\b([0-9]{2,})(?:\.[0-9]+)?\b/);
  if (numMatch) {
    const val = Number(numMatch[1]);
    return isFinite(val) && val > 0 ? val : null;
  }
  return null;
}

function parseTargetDate(text) {
  if (!text) return null;
  const now = new Date();
  // Patterns like "by Dec", "by December 15", "by 12/31/2025", "by December 2025", "next month", "in 6 weeks"
  const byDate = text.match(
    /\bby\s+([a-zA-Z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|[a-zA-Z]+\s+\d{4}|[a-zA-Z]+)\b/i
  );
  const onDate = text.match(
    /\b(on|by)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/i
  );
  const monthOnly = text.match(
    /\bby\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  const nextMonth = /\bnext\s+month\b/i.test(text);
  const inWeeks = text.match(/\bin\s+(\d{1,2})\s+weeks?\b/i);
  const inMonths = text.match(/\bin\s+(\d{1,2})\s+months?\b/i);
  const bareMonths = text.match(/\b(\d{1,2})\s+months?\b/i);
  const ddMonthYYYY = text.match(
    /\bby\s+(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?\b/i
  );
  const monthYYYY = text.match(
    /\bby\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/i
  );
  // NEW: Standalone month-year patterns (without "by" prefix)
  const standaloneMonthYYYY = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i
  );
  const standaloneDdMonthYYYY = text.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/i
  );
  const standaloneMonthOnly = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );

  let d = null;
  if (onDate && onDate[2]) {
    d = new Date(onDate[2]);
  } else if (byDate && byDate[1]) {
    // Try direct parsing first
    d = new Date(byDate[1]);
    if (isNaN(d.getTime())) {
      // try MM/DD parsing
      d = new Date(byDate[1].replace(/-/g, "/"));
    }
    // If still invalid, check if it's a "Month YYYY" format like "December 2025"
    if (isNaN(d.getTime())) {
      const monthYearMatch = byDate[1].match(/^([a-zA-Z]+)\s+(\d{4})$/i);
      if (monthYearMatch) {
        const monStr = monthYearMatch[1].toLowerCase().slice(0, 3);
        const year = Number(monthYearMatch[2]);
        const monthIdx = [
          "jan",
          "feb",
          "mar",
          "apr",
          "may",
          "jun",
          "jul",
          "aug",
          "sep",
          "oct",
          "nov",
          "dec",
        ].indexOf(monStr);
        if (monthIdx >= 0) d = new Date(year, monthIdx, 1);
      }
    }
  } else if (ddMonthYYYY) {
    const day = Number(ddMonthYYYY[1]);
    const monStr = ddMonthYYYY[2].toLowerCase().slice(0, 3);
    const year = ddMonthYYYY[3] ? Number(ddMonthYYYY[3]) : now.getFullYear();
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, day);
  } else if (monthYYYY) {
    const monStr = monthYYYY[1].toLowerCase().slice(0, 3);
    const year = Number(monthYYYY[2]);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, 1);
  } else if (standaloneMonthYYYY) {
    // Handle "December 2025", "Dec 2025", etc.
    const monStr = standaloneMonthYYYY[1].toLowerCase().slice(0, 3);
    const year = Number(standaloneMonthYYYY[2]);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, 1);
  } else if (standaloneDdMonthYYYY) {
    // Handle "15 December 2025", "15 Dec 2025", etc.
    const day = Number(standaloneDdMonthYYYY[1]);
    const monStr = standaloneDdMonthYYYY[2].toLowerCase().slice(0, 3);
    const year = Number(standaloneDdMonthYYYY[3]);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monStr);
    if (monthIdx >= 0) d = new Date(year, monthIdx, day);
  } else if (monthOnly && monthOnly[1]) {
    const monthStr = monthOnly[1].toLowerCase().slice(0, 3);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monthStr);
    if (monthIdx >= 0) {
      d = new Date(now.getFullYear(), monthIdx, 1);
      if (d < now) d = new Date(now.getFullYear() + 1, monthIdx, 1);
    }
  } else if (standaloneMonthOnly && standaloneMonthOnly[1]) {
    // Handle standalone "December", "Dec", etc. (without "by")
    const monthStr = standaloneMonthOnly[1].toLowerCase().slice(0, 3);
    const monthIdx = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monthStr);
    if (monthIdx >= 0) {
      d = new Date(now.getFullYear(), monthIdx, 1);
      if (d < now) d = new Date(now.getFullYear() + 1, monthIdx, 1);
    }
  } else if (nextMonth) {
    d = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  } else if (inWeeks) {
    const weeks = Number(inWeeks[1]);
    d = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  } else if (inMonths) {
    const months = Number(inMonths[1]);
    d = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  } else if (bareMonths) {
    const months = Number(bareMonths[1]);
    d = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
  }

  if (d && !isNaN(d.getTime())) {
    // ensure in the future
    const dMid = new Date(d);
    dMid.setHours(0, 0, 0, 0);
    const nowMid = new Date();
    nowMid.setHours(0, 0, 0, 0);
    if (dMid <= nowMid) {
      // bump by one month as a safe default
      d = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }
    return d.toISOString().split("T")[0];
  }
  return null;
}

function extractLabel(text, amount, dateStr) {
  let t = (text || "").trim();
  // remove amount and date hints to isolate a label-ish phrase
  t = t.replace(/\$[0-9,.]+/g, "");
  t = t.replace(/\bin\s+\d+\s+(weeks?|months?)\b/gi, "");
  t = t.replace(/\bby\b[^.]+/gi, "");
  t = t.replace(/\bfor\b/gi, "");
  // pick concise label
  const m =
    t.match(/add\s+a?\s*goal\s*(?:for|to)?\s*(.*)/i) ||
    t.match(
      /i\s*want\s*to\s*(?:add|set)\s*(?:a\s*)?goal\s*(?:for|to)?\s*(.*)/i
    );
  const raw = m && m[1] ? m[1].trim() : t;
  return raw.replace(/^[,\s:-]+|[,\s:-]+$/g, "").slice(0, 60) || null;
}

async function handleGoal(message, context) {
  const startTime = Date.now();
  const userId = context?.user_id;
  if (!userId) {
    return {
      message: "Please log in to create a goal.",
      type: "assistant",
      intent: "goal",
    };
  }

  // Pull prior flow state if any
  const priorFlow = (context && context.goal_flow) || {};
  const priorSlots = priorFlow.slots || {};

  // Extract from current message
  const extracted = {
    target_amount: parseCurrencyAmount(message),
    target_date: parseTargetDate(message),
    label: null,
    category: null,
  };

  // Improve label parsing to avoid echoing the whole sentence
  const labelFromFor = message.match(
    /\bgoal\b.*?\bfor\b\s+([^$\d\n]+?)(?:\s+for|\s+by|\s+in|\s+on|\s*\$|\s*\d|$)/i
  );
  const labelAlt = message.match(
    /\bfor\b\s+([^$\d\n]+?)(?:\s+by|\s+in|\s+on|\s*\$|\s*\d|$)/i
  );
  // Handle "Create a [ITEM] goal" pattern
  const labelFromCreatePattern = message.match(
    /(?:create|set|add)\s+(?:a\s+)?([^$\d\n]+?)\s+goal(?:\s+of|\s+for|\s|$)/i
  );
  const lbl =
    (labelFromFor && labelFromFor[1]) ||
    (labelAlt && labelAlt[1]) ||
    (labelFromCreatePattern && labelFromCreatePattern[1]) ||
    extractLabel(message);
  if (lbl) extracted.label = lbl.replace(/\s{2,}/g, " ").trim();
  if (extracted.label) extracted.category = guessGoalCategory(extracted.label);

  // Merge with prior
  const slots = {
    label: priorSlots.label || extracted.label || null,
    target_amount: priorSlots.target_amount || extracted.target_amount || null,
    target_date: priorSlots.target_date || extracted.target_date || null,
    category:
      priorSlots.category ||
      extracted.category ||
      (priorSlots.label ? guessGoalCategory(priorSlots.label) : null) ||
      null,
  };

  // Missing management
  const missing = [];
  if (!slots.label) missing.push("label");
  if (!slots.target_amount) missing.push("target_amount");
  if (!slots.target_date) missing.push("target_date");
  if (!slots.category) missing.push("category");

  if (missing.length > 0) {
    const prettyLabel = String(slots.label || "this goal")
      .replace(/^(create|set|add)\b.*$/i, "")
      .trim();
    const base = prettyLabel.length > 0 ? prettyLabel : "this goal";
    // Add encouraging first message if this is the very first prompt
    const isFirstPrompt =
      missing.length === Object.keys(slots).filter((k) => !slots[k]).length;
    let encouragingPrefix = "";
    if (isFirstPrompt && missing[0] === "label") {
      encouragingPrefix = "🎯 Let's set up a new goal together! ";
    } else if (isFirstPrompt) {
      encouragingPrefix = "Great start! ";
    }

    const prompts = {
      label: `${encouragingPrefix}What should I call this goal? (e.g., Emergency fund, Dream vacation)`,
      target_amount: `Perfect! 💰 How much do you want to save for your ${base} goal? (e.g., $500)`,
      target_date: `Awesome! ⏰ When would you like to hit your ${base} goal? (e.g., by Dec 15 or in 3 months)`,
      category:
        "Great! Which category fits best? (emergency_fund, vacation, car, other)",
    };
    const nextKey = missing[0];
    return {
      intent: "goal",
      message: prompts[nextKey],
      missing: [nextKey],
      flow: { active: true, slots },
    };
  }

  // All slots captured → confirmation stage then insert
  const isConfirmStage = (priorFlow && priorFlow.stage) === "confirm";
  const wantsConfirm =
    /\b(confirm|yes|create|looks good|go ahead|save)\b/i.test(message);
  const wantsCancel = /\b(cancel|stop|nevermind|no)\b/i.test(message);

  // If in confirm stage and user canceled
  if (isConfirmStage && wantsCancel) {
    return {
      intent: "goal",
      message: "No problem — I canceled the goal setup.",
      flow: { active: false },
    };
  }

  // If in confirm stage and user confirmed → proceed to insert
  if (isConfirmStage && wantsConfirm) {
    // Skip to insertion logic
  } else if (
    isConfirmStage &&
    !wantsConfirm &&
    !wantsCancel &&
    (extracted.target_amount ||
      extracted.target_date ||
      extracted.label ||
      extracted.category)
  ) {
    // User is in confirm stage and sent edits (amount/date/label/category), apply and re-confirm
    const updatedSlots = {
      ...slots,
      target_amount: extracted.target_amount || slots.target_amount,
      target_date: extracted.target_date || slots.target_date,
      label: extracted.label || slots.label,
      category: extracted.category || slots.category,
    };
    const prettyLabel2 = String(updatedSlots.label);
    const niceAmt2 = `$${Number(updatedSlots.target_amount).toLocaleString()}`;
    const confirmText2 = `**Goal Summary:**
• **Name:** ${prettyLabel2}
• **Amount:** ${niceAmt2}
• **Due:** ${updatedSlots.target_date}
• **Category:** ${
      updatedSlots.category || guessGoalCategory(updatedSlots.label)
    }

Ready to create this goal?`;
    return {
      intent: "goal",
      message: confirmText2,
      type: "action",
      actions: [
        {
          label: "Cancel",
          action: "cancel",
          style: "secondary",
        },
        {
          label: "Confirm ✨",
          action: "confirm",
          style: "primary",
        },
      ],
      flow: { active: true, stage: "confirm", slots: updatedSlots },
    };
  }

  if (!isConfirmStage && !wantsConfirm) {
    const prettyLabel = String(slots.label);
    const niceAmt = `$${Number(slots.target_amount).toLocaleString()}`;
    const confirmText = `**Goal Summary:**
• **Name:** ${prettyLabel}
• **Amount:** ${niceAmt}
• **Due:** ${slots.target_date}
• **Category:** ${slots.category || guessGoalCategory(slots.label)}

Ready to create this goal?`;
    return {
      intent: "goal",
      message: confirmText,
      type: "action",
      actions: [
        {
          label: "Cancel",
          action: "cancel",
          style: "secondary",
        },
        {
          label: "Confirm ✨",
          action: "confirm",
          style: "primary",
        },
      ],
      flow: { active: true, stage: "confirm", slots },
    };
  }

  // If in confirm stage and user confirmed or provided confirm keyword → insert
  if (!isConfirmStage || wantsConfirm) {
    // proceed to insert
  }

  // All slots captured → insert
  const goalRow = {
    user_id: userId,
    label: String(slots.label),
    description: null,
    note: null,
    target_amount: Math.round(Number(slots.target_amount)),
    current_amount: 0,
    target_date: String(slots.target_date),
    category: String(slots.category || guessGoalCategory(slots.label)),
    status: "active",
  };

  try {
    const insertT0 = Date.now();
    const { data, error } = await supabase
      .from("goals")
      .insert([goalRow])
      .select()
      .single();
    const latency = Date.now() - insertT0;

    if (error) {
      console.error("❌ [GOAL] Insert failed:", error);
      return {
        intent: "goal",
        message:
          "I couldn't save that goal right now. Please try again shortly.",
      };
    }

    // Log asynchronously
    setImmediate(() =>
      logConversation({
        user_message: redactPII(message),
        finny_response: `Goal created: ${goalRow.label}`,
        timestamp: new Date().toISOString(),
        user_id: userId,
        intent: "goal",
        entities: [
          goalRow.label,
          String(goalRow.target_amount),
          goalRow.target_date,
          goalRow.category,
        ],
        confidence: 1.0,
        response_time_ms: Date.now() - startTime,
        sources_used: ["supabase:goals.insert"],
        cached: false,
        request_id: generateRequestId(),
        metrics: { intent: "goal", latency_ms: { insert: latency } },
      })
    );

    const niceAmt = `$${Number(goalRow.target_amount).toLocaleString()}`;
    return {
      intent: "goal",
      message: `🎉 Amazing! Your "${goalRow.label}" goal is all set for ${niceAmt} by ${goalRow.target_date}!

You're officially on your financial journey now. This is such a great step forward - every goal starts with a decision, and you just made yours! 🌟`,
      goal: data,
      flow: { active: false },
    };
  } catch (e) {
    console.error("❌ [GOAL] Unexpected error:", e);
    return {
      intent: "goal",
      message: "Hit an error while saving your goal. Please try again.",
    };
  }
}

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

// Entity extraction functions
function extractEntitiesRuleBased(message) {
  const lowerMessage = message.toLowerCase();
  const entities = {
    creditCardIssuers: [],
    creditCardNames: [],
    banks: [],
    investmentPlatforms: [],
    financialProducts: [],
    comparisonWords: [],
    states: [],
    rawEntities: [],
  };

  // Extract each type of entity
  for (const [category, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerMessage.includes(pattern)) {
        // Special handling for states - only match if there's context
        if (category === "states") {
          const stateContext = [
            "tax",
            "rule",
            "benefit",
            "in",
            "state",
            "law",
            "regulation",
          ];
          const hasStateContext = stateContext.some((ctx) =>
            lowerMessage.includes(ctx)
          );

          if (hasStateContext || pattern.length > 2) {
            entities[category].push(pattern);
            entities.rawEntities.push(pattern);
          }
        } else {
          entities[category].push(pattern);
          entities.rawEntities.push(pattern);
        }
      }
    }
  }

  // Remove duplicates
  for (const category in entities) {
    if (Array.isArray(entities[category])) {
      entities[category] = [...new Set(entities[category])];
    }
  }
  entities.rawEntities = [...new Set(entities.rawEntities)];

  return entities;
}

async function extractEntitiesLLM(message, entities) {
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
          temperature: 0.1,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: [
                "You are a financial entity extractor. Extract relevant financial entities from user queries.",
                "Focus on: credit card issuers, card names, banks, investment platforms, financial products, states.",
                "Return only valid JSON with the extracted entities.",
                "",
                "Example input: 'Chase Sapphire vs Amex Gold'",
                "Example output: {",
                '  "creditCardIssuers": ["chase", "amex"],',
                '  "creditCardNames": ["sapphire", "gold"],',
                '  "comparisonWords": ["vs"],',
                '  "rawEntities": ["chase", "sapphire", "amex", "gold", "vs"]',
                "}",
              ].join("\n"),
            },
            {
              role: "user",
              content: `Extract entities from: "${message}"`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "entity_extraction",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  creditCardIssuers: {
                    type: "array",
                    items: { type: "string" },
                  },
                  creditCardNames: { type: "array", items: { type: "string" } },
                  banks: { type: "array", items: { type: "string" } },
                  investmentPlatforms: {
                    type: "array",
                    items: { type: "string" },
                  },
                  financialProducts: {
                    type: "array",
                    items: { type: "string" },
                  },
                  comparisonWords: { type: "array", items: { type: "string" } },
                  states: { type: "array", items: { type: "string" } },
                  rawEntities: { type: "array", items: { type: "string" } },
                },
                required: [
                  "creditCardIssuers",
                  "creditCardNames",
                  "banks",
                  "investmentPlatforms",
                  "financialProducts",
                  "comparisonWords",
                  "states",
                  "rawEntities",
                ],
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("❌ [ENTITY_EXTRACTOR] LLM API error:", response.status);
      return entities;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return entities;
    }

    const llmEntities = JSON.parse(content);

    // Merge LLM results with rule-based results
    const mergedEntities = {
      creditCardIssuers: [
        ...new Set([
          ...entities.creditCardIssuers,
          ...llmEntities.creditCardIssuers,
        ]),
      ],
      creditCardNames: [
        ...new Set([
          ...entities.creditCardNames,
          ...llmEntities.creditCardNames,
        ]),
      ],
      banks: [...new Set([...entities.banks, ...llmEntities.banks])],
      investmentPlatforms: [
        ...new Set([
          ...entities.investmentPlatforms,
          ...llmEntities.investmentPlatforms,
        ]),
      ],
      financialProducts: [
        ...new Set([
          ...entities.financialProducts,
          ...llmEntities.financialProducts,
        ]),
      ],
      comparisonWords: [
        ...new Set([
          ...entities.comparisonWords,
          ...llmEntities.comparisonWords,
        ]),
      ],
      states: [...new Set([...entities.states, ...llmEntities.states])],
      rawEntities: [
        ...new Set([...entities.rawEntities, ...llmEntities.rawEntities]),
      ],
    };

    return mergedEntities;
  } catch (error) {
    console.error("❌ [ENTITY_EXTRACTOR] LLM extraction error:", error);
    return entities;
  }
}

async function extractEntities(message) {
  console.log("🔍 [ENTITY_EXTRACTOR] Extracting entities from:", message);

  const ruleBasedEntities = extractEntitiesRuleBased(message);
  console.log("🔍 [ENTITY_EXTRACTOR] Rule-based entities:", ruleBasedEntities);

  const shouldUseLLM =
    ruleBasedEntities.rawEntities.length < 2 ||
    message.toLowerCase().includes("vs") ||
    message.toLowerCase().includes("compare") ||
    message.toLowerCase().includes("which");

  if (shouldUseLLM) {
    console.log("🔍 [ENTITY_EXTRACTOR] Using LLM fallback");
    const finalEntities = await extractEntitiesLLM(message, ruleBasedEntities);
    console.log("🔍 [ENTITY_EXTRACTOR] Final entities:", finalEntities);
    return finalEntities;
  }

  return ruleBasedEntities;
}

function determineIntent(entities, message) {
  const lowerMessage = message.toLowerCase();

  if (
    entities.comparisonWords.length > 0 ||
    lowerMessage.includes("vs") ||
    lowerMessage.includes("compare") ||
    lowerMessage.includes("which")
  ) {
    return {
      intent: "ask_personalized",
      needs_web: true,
      needs_user_data: true,
      reasoning: "Comparison query requires user data + web research",
    };
  }

  if (
    entities.creditCardIssuers.length > 0 ||
    entities.creditCardNames.length > 0
  ) {
    return {
      intent: "ask_personalized",
      needs_web: true,
      needs_user_data: true,
      reasoning: "Specific product query requires user data + web research",
    };
  }

  if (
    entities.states.length > 0 &&
    (lowerMessage.includes("tax") ||
      lowerMessage.includes("rule") ||
      lowerMessage.includes("benefit"))
  ) {
    return {
      intent: "ask_state_rule",
      needs_web: true,
      needs_user_data: false,
      reasoning: "State-specific rule query",
    };
  }

  if (
    lowerMessage.includes("2025") ||
    lowerMessage.includes("current") ||
    lowerMessage.includes("latest")
  ) {
    return {
      intent: "ask_fact_fresh",
      needs_web: true,
      needs_user_data: false,
      reasoning: "Current year facts query",
    };
  }

  return {
    intent: "ask_personalized",
    needs_web: false,
    needs_user_data: true,
    reasoning: "Default to personalized query",
  };
}

// Domain mapping functions
function getDomainMapping(entity) {
  const lowerEntity = entity.toLowerCase();
  return DOMAIN_MAPPINGS[lowerEntity] || null;
}

function getRelevantDomains(entities) {
  const domains = new Set();

  for (const entity of entities.rawEntities) {
    const mapping = getDomainMapping(entity);
    if (mapping) {
      domains.add(mapping.primary);
    }
  }

  if (domains.size === 0) {
    domains.add("consumerfinance.gov");
    domains.add("nerdwallet.com");
  }

  return Array.from(domains);
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
    const plan = JSON.parse(content);
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
  let out = formatStockResponse(d);
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

  let out = `**${name} (${data.ticker}) — Snapshot**\n\n`;
  out += `- Price: ${cur} (${dp} today)\n`;
  if (pt) out += `- Street price target (mean): ${pt}\n`;
  if (recLine) out += `- ${recLine}\n`;
  if (data.profile?.finnhubIndustry)
    out += `- Industry: ${data.profile.finnhubIndustry}\n`;
  if (data.profile?.weburl) out += `- Website: ${data.profile.weburl}\n`;
  // Add a couple of basic metrics if available
  const pe = data.metrics?.peBasicExclExtraTTM || data.metrics?.peBasicTTM;
  const ps = data.metrics?.psTTM;
  if (pe || ps) {
    out += "\nKey ratios (TTM):\n";
    if (pe) out += `- P/E: ${Number(pe).toFixed(1)}\n`;
    if (ps) out += `- P/S: ${Number(ps).toFixed(1)}\n`;
  }
  // Add latest headlines
  if (Array.isArray(data.news) && data.news.length > 0) {
    out += "\nRecent headlines:\n";
    for (const n of data.news.slice(0, 3)) {
      if (n.headline) out += `- ${n.headline}\n`;
    }
  }
  if (data.ts) out += `\n*As of ${new Date(data.ts).toLocaleString()}*`;
  out += `\n\nThis is informational, not investment advice.`;
  return out;
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

function buildSearchUrls(domain, entity, searchPaths = []) {
  const urls = [];

  const mapping = getDomainMapping(entity);
  if (mapping) {
    mapping.searchPaths.forEach((path) => {
      urls.push(`https://${mapping.primary}${path}`);
    });
  } else {
    searchPaths.forEach((path) => {
      urls.push(`https://${domain}${path}`);
    });
  }

  if (urls.length === 0) {
    urls.push(`https://${domain}`);
  }

  return urls;
}

function getSearchStrategy(entities, message) {
  const lowerMessage = message.toLowerCase();

  const isComparison =
    entities.comparisonWords.length > 0 ||
    lowerMessage.includes("vs") ||
    lowerMessage.includes("compare");

  const domains = getRelevantDomains(entities);

  const searchUrls = [];
  for (const domain of domains) {
    const urls = buildSearchUrls(domain, entities.rawEntities[0] || "", []);
    searchUrls.push(...urls);
  }

  return {
    isComparison,
    domains,
    searchUrls,
    strategy: isComparison ? "comparison" : "product_info",
  };
}

// Web scraping functions
async function rateLimitedFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      url,
      options: {
        ...options,
        timeout: RATE_LIMITS.timeout,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FinancifyBot/1.0)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          ...options.headers,
        },
      },
      resolve,
      reject,
      retries: 0,
    };

    requestQueue.push(request);
    processQueue();
  });
}

async function processQueue() {
  if (
    activeRequests >= RATE_LIMITS.maxConcurrent ||
    requestQueue.length === 0
  ) {
    return;
  }

  const request = requestQueue.shift();
  activeRequests++;

  try {
    const result = await executeRequest(request);
    request.resolve(result);
  } catch (error) {
    if (request.retries < RATE_LIMITS.maxRetries) {
      request.retries++;
      requestQueue.unshift(request);
    } else {
      request.reject(error);
    }
  } finally {
    activeRequests--;
    setTimeout(() => processQueue(), RATE_LIMITS.delayBetweenRequests);
  }
}

async function executeRequest(request) {
  const { url, options } = request;

  console.log(`🌐 [WEB_SCRAPER] Fetching: ${url}`);

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  return {
    url,
    html,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function extractDataFromHTML(html, url, entityType = "credit_card") {
  const $ = cheerio.load(html);
  const extractedData = {
    url,
    entityType,
    title: $("title").text().trim(),
    description: $('meta[name="description"]').attr("content") || "",
    extractedAt: new Date().toISOString(),
    data: {},
  };

  switch (entityType) {
    case "credit_card":
      extractedData.data = extractCreditCardData($);
      break;
    case "bank":
      extractedData.data = extractBankData($);
      break;
    case "investment":
      extractedData.data = extractInvestmentData($);
      break;
    default:
      extractedData.data = extractGenericData($);
  }

  return extractedData;
}

function extractCreditCardData($) {
  const data = {
    apr: [],
    annualFee: [],
    rewards: [],
    benefits: [],
    features: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();
    const aprMatch = text.match(/(\d+\.?\d*)\s*%\s*APR/i);
    if (aprMatch) {
      data.apr.push({
        value: parseFloat(aprMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }

    const feeMatch = text.match(/\$(\d+)\s*annual\s*fee/i);
    if (feeMatch) {
      data.annualFee.push({
        value: parseFloat(feeMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }

    if (
      text.toLowerCase().includes("rewards") ||
      text.toLowerCase().includes("cash back")
    ) {
      data.rewards.push({
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }
  });

  $(
    '.benefits, .features, .perks, [class*="benefit"], [class*="feature"]'
  ).each((i, element) => {
    const benefitText = $(element).text().trim();
    if (benefitText) {
      data.benefits.push(benefitText);
    }
  });

  return data;
}

function extractBankData($) {
  const data = {
    interestRates: [],
    fees: [],
    features: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();
    const rateMatch = text.match(/(\d+\.?\d*)\s*%\s*APY/i);
    if (rateMatch) {
      data.interestRates.push({
        value: parseFloat(rateMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }
  });

  return data;
}

function extractInvestmentData($) {
  const data = {
    fees: [],
    features: [],
    accountTypes: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();
    const feeMatch = text.match(/\$(\d+\.?\d*)\s*per\s*trade/i);
    if (feeMatch) {
      data.fees.push({
        value: parseFloat(feeMatch[1]),
        text: text.trim(),
        context: $(element).parent().text().trim(),
      });
    }
  });

  return data;
}

function extractGenericData($) {
  const data = {
    keyNumbers: [],
    features: [],
    benefits: [],
  };

  $("*").each((i, element) => {
    const text = $(element).text();

    const rateMatch = text.match(/(\d+\.?\d*)\s*%/);
    if (rateMatch) {
      data.keyNumbers.push({
        type: "percentage",
        value: parseFloat(rateMatch[1]),
        text: text.trim(),
      });
    }

    const dollarMatch = text.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (dollarMatch) {
      data.keyNumbers.push({
        type: "dollar",
        value: parseFloat(dollarMatch[1].replace(/,/g, "")),
        text: text.trim(),
      });
    }
  });

  return data;
}

async function scrapeMultipleUrls(urls, entityType = "credit_card") {
  console.log(`🌐 [WEB_SCRAPER] Starting scrape of ${urls.length} URLs`);

  const results = [];
  const errors = [];

  for (const url of urls) {
    try {
      const response = await rateLimitedFetch(url);
      const extractedData = extractDataFromHTML(response.html, url, entityType);
      results.push(extractedData);
      console.log(`✅ [WEB_SCRAPER] Successfully scraped: ${url}`);
    } catch (error) {
      console.error(`❌ [WEB_SCRAPER] Failed to scrape ${url}:`, error.message);
      errors.push({ url, error: error.message });
    }
  }

  return {
    results,
    errors,
    successCount: results.length,
    errorCount: errors.length,
  };
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
async function clearUserCache(userId) {
  try {
    console.log(`🗑️ [CACHE] Clearing all cache for user: ${userId}`);

    // Clear user-specific cache entries
    const { error } = await supabase
      .from("web_scrape_cache")
      .delete()
      .eq("user_specific", true)
      .like("cache_key", `%_${userId}`);

    if (error) {
      console.error("❌ [CACHE] Error clearing user cache:", error);
      return false;
    }

    console.log(`✅ [CACHE] Cleared cache for user: ${userId}`);
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in clearUserCache:", error);
    return false;
  }
}

async function clearCacheByType(type, identifier = null) {
  try {
    console.log(
      `🗑️ [CACHE] Clearing cache for type: ${type}, identifier: ${identifier}`
    );

    let query = supabase
      .from("web_scrape_cache")
      .delete()
      .eq("data_type", type);

    if (identifier) {
      query = query.like("cache_key", `%_${identifier}`);
    }

    const { error } = await query;

    if (error) {
      console.error("❌ [CACHE] Error clearing cache by type:", error);
      return false;
    }

    console.log(`✅ [CACHE] Cleared cache for type: ${type}`);
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in clearCacheByType:", error);
    return false;
  }
}

async function forceRefreshUserData(userId) {
  try {
    console.log(`🔄 [CACHE] Force refreshing user data for: ${userId}`);

    // Clear user summary cache specifically
    await clearCacheByType("user_summary", userId);

    // Clear enhanced merchant cache for this user
    await clearCacheByType("enhanced_merchant", userId);

    console.log(`✅ [CACHE] Force refresh completed for user: ${userId}`);
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in forceRefreshUserData:", error);
    return false;
  }
}

// Deduplication function for web research
async function deduplicatedWebResearch(message, userId = null) {
  const cacheKey = `web_research_${message.toLowerCase().trim()}`;

  // Check if request is already pending
  if (pendingRequests.has(cacheKey)) {
    console.log(
      "🔄 [WEB_RESEARCH] Request already pending, waiting for result"
    );
    return await pendingRequests.get(cacheKey);
  }

  // Create new request promise
  const requestPromise = researchFinancialProducts(message, userId);
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Clean up pending request
    pendingRequests.delete(cacheKey);
  }
}

// Main web research function
async function researchFinancialProducts(message, userId = null) {
  console.log("🔍 [WEB_RESEARCH] Starting research for:", message);

  try {
    const entities = await extractEntities(message);
    console.log("🔍 [WEB_RESEARCH] Extracted entities:", entities);

    const intent = determineIntent(entities, message);
    console.log("🔍 [WEB_RESEARCH] Determined intent:", intent);

    const searchStrategy = getSearchStrategy(entities, message);
    console.log("🔍 [WEB_RESEARCH] Search strategy:", searchStrategy);

    const researchResults = await researchDomains(
      searchStrategy,
      entities,
      userId
    );
    const combinedResults = combineResearchResults(
      researchResults,
      entities,
      intent
    );

    return {
      success: true,
      entities,
      intent,
      searchStrategy,
      results: combinedResults,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ [WEB_RESEARCH] Research failed:", error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function researchDomains(searchStrategy, entities, userId) {
  const results = [];

  for (const url of searchStrategy.searchUrls) {
    try {
      const entityType = determineEntityType(entities, url);

      const cachedResult = await getCachedDataWithFallback(
        entityType,
        url,
        async () => {
          console.log(`🌐 [WEB_RESEARCH] Scraping ${url}`);
          return await scrapeMultipleUrls([url], entityType);
        },
        false
      );

      if (cachedResult && cachedResult.data.results.length > 0) {
        results.push({
          url,
          entityType,
          data: cachedResult.data.results[0],
          source: cachedResult.source,
          cachedAt: cachedResult.cachedAt,
        });
      }
    } catch (error) {
      console.error(`❌ [WEB_RESEARCH] Failed to research ${url}:`, error);
      results.push({
        url,
        error: error.message,
        failed: true,
      });
    }
  }

  return results;
}

function determineEntityType(entities, url) {
  if (
    entities.creditCardIssuers.length > 0 ||
    entities.creditCardNames.length > 0
  ) {
    return "creditCard";
  }
  if (entities.banks.length > 0) {
    return "bank";
  }
  if (entities.investmentPlatforms.length > 0) {
    return "investment";
  }
  return "generic";
}

function combineResearchResults(researchResults, entities, intent) {
  const combined = {
    summary: {
      totalSources: researchResults.length,
      successfulSources: researchResults.filter((r) => !r.failed).length,
      failedSources: researchResults.filter((r) => r.failed).length,
    },
    products: [],
    comparisons: [],
    keyMetrics: {},
    recommendations: [],
  };

  for (const result of researchResults) {
    if (result.failed) continue;

    const product = {
      source: result.url,
      title: result.data.title,
      description: result.data.description,
      metrics: extractKeyMetrics(result.data.data),
      benefits: extractBenefits(result.data.data),
      features: extractFeatures(result.data.data),
    };

    combined.products.push(product);
  }

  if (intent.intent === "ask_personalized" && intent.needs_web) {
    combined.comparisons = generateComparisons(combined.products, entities);
  }

  combined.keyMetrics = extractKeyMetricsAcrossProducts(combined.products);

  return combined;
}

function extractKeyMetrics(data) {
  const metrics = {};

  if (data.apr && data.apr.length > 0) {
    metrics.apr = data.apr.map((apr) => apr.value);
  }

  if (data.annualFee && data.annualFee.length > 0) {
    metrics.annualFee = data.annualFee.map((fee) => fee.value);
  }

  if (data.interestRates && data.interestRates.length > 0) {
    metrics.interestRates = data.interestRates.map((rate) => rate.value);
  }

  if (data.fees && data.fees.length > 0) {
    metrics.fees = data.fees.map((fee) => fee.value);
  }

  return metrics;
}

function extractBenefits(data) {
  const benefits = [];

  if (data.benefits && data.benefits.length > 0) {
    benefits.push(...data.benefits);
  }

  if (data.rewards && data.rewards.length > 0) {
    benefits.push(...data.rewards.map((r) => r.text));
  }

  return benefits;
}

function extractFeatures(data) {
  const features = [];

  if (data.features && data.features.length > 0) {
    features.push(...data.features);
  }

  if (data.keyNumbers && data.keyNumbers.length > 0) {
    features.push(...data.keyNumbers.map((kn) => kn.text));
  }

  return features;
}

function generateComparisons(products, entities) {
  const comparisons = [];

  if (products.length < 2) {
    return comparisons;
  }

  // Optional capping to reduce O(n^2) blowup
  const options = (entities && entities.comparisonOptions) || {};
  const envTopN = parseInt(process.env.FINNY_COMPARISON_TOP_N || "", 10);
  const envMaxPairs = parseInt(
    process.env.FINNY_COMPARISON_MAX_PAIRS || "",
    10
  );
  const topN = Number.isFinite(options.topN)
    ? options.topN
    : Number.isFinite(envTopN)
    ? envTopN
    : undefined;
  const maxPairs = Number.isFinite(options.maxPairs)
    ? options.maxPairs
    : Number.isFinite(envMaxPairs)
    ? envMaxPairs
    : undefined;

  let workingProducts = products;
  if (topN && products.length > topN) {
    // Rank products by a simple composite of key metrics.
    // Lower APR and Annual Fee are better; higher Interest Rates are better.
    // We convert to a score where lower is better: apr + annualFee - interestRates
    const scored = products.map((p) => {
      const aprAvg =
        Array.isArray(p.metrics?.apr) && p.metrics.apr.length
          ? p.metrics.apr.reduce((s, v) => s + v, 0) / p.metrics.apr.length
          : undefined;
      const feeAvg =
        Array.isArray(p.metrics?.annualFee) && p.metrics.annualFee.length
          ? p.metrics.annualFee.reduce((s, v) => s + v, 0) /
            p.metrics.annualFee.length
          : undefined;
      const irAvg =
        Array.isArray(p.metrics?.interestRates) &&
        p.metrics.interestRates.length
          ? p.metrics.interestRates.reduce((s, v) => s + v, 0) /
            p.metrics.interestRates.length
          : undefined;

      const parts = [];
      if (typeof aprAvg === "number") parts.push(aprAvg);
      if (typeof feeAvg === "number") parts.push(feeAvg);
      if (typeof irAvg === "number") parts.push(-irAvg); // invert so higher IR helps lower score

      const score = parts.length
        ? parts.reduce((s, v) => s + v, 0) / parts.length
        : Number.POSITIVE_INFINITY; // deprioritize when no metrics

      return { product: p, score };
    });

    scored.sort((a, b) => a.score - b.score);
    workingProducts = scored.slice(0, topN).map((s) => s.product);
  }

  let pairCount = 0;
  for (let i = 0; i < workingProducts.length; i++) {
    for (let j = i + 1; j < workingProducts.length; j++) {
      if (typeof maxPairs === "number" && pairCount >= maxPairs) {
        return comparisons;
      }
      const product1 = workingProducts[i];
      const product2 = workingProducts[j];
      pairCount++;

      const comparison = {
        product1: product1.title,
        product2: product2.title,
        metrics: {
          apr: compareMetrics(
            product1.metrics.apr,
            product2.metrics.apr,
            "lower"
          ),
          annualFee: compareMetrics(
            product1.metrics.annualFee,
            product2.metrics.annualFee,
            "lower"
          ),
          interestRates: compareMetrics(
            product1.metrics.interestRates,
            product2.metrics.interestRates,
            "higher"
          ),
        },
        winner: determineWinner(product1, product2),
      };

      comparisons.push(comparison);
    }
  }

  return comparisons;
}

function compareMetrics(metrics1, metrics2, betterDirection) {
  if (
    !metrics1 ||
    !metrics2 ||
    metrics1.length === 0 ||
    metrics2.length === 0
  ) {
    return { result: "insufficient_data" };
  }

  const avg1 = metrics1.reduce((sum, val) => sum + val, 0) / metrics1.length;
  const avg2 = metrics2.reduce((sum, val) => sum + val, 0) / metrics2.length;

  if (betterDirection === "lower") {
    return {
      result:
        avg1 < avg2
          ? "product1_better"
          : avg2 < avg1
          ? "product2_better"
          : "tie",
      product1: avg1,
      product2: avg2,
    };
  } else {
    return {
      result:
        avg1 > avg2
          ? "product1_better"
          : avg2 > avg1
          ? "product2_better"
          : "tie",
      product1: avg1,
      product2: avg2,
    };
  }
}

function determineWinner(product1, product2) {
  let score1 = 0;
  let score2 = 0;

  if (product1.metrics.apr && product2.metrics.apr) {
    const aprComparison = compareMetrics(
      product1.metrics.apr,
      product2.metrics.apr,
      "lower"
    );
    if (aprComparison.result === "product1_better") score1++;
    else if (aprComparison.result === "product2_better") score2++;
  }

  if (product1.metrics.annualFee && product2.metrics.annualFee) {
    const feeComparison = compareMetrics(
      product1.metrics.annualFee,
      product2.metrics.annualFee,
      "lower"
    );
    if (feeComparison.result === "product1_better") score1++;
    else if (feeComparison.result === "product2_better") score2++;
  }

  if (score1 > score2) return "product1";
  if (score2 > score1) return "product2";
  return "tie";
}

function extractKeyMetricsAcrossProducts(products) {
  const metrics = {
    apr: [],
    annualFee: [],
    interestRates: [],
    fees: [],
  };

  for (const product of products) {
    if (product.metrics.apr) metrics.apr.push(...product.metrics.apr);
    if (product.metrics.annualFee)
      metrics.annualFee.push(...product.metrics.annualFee);
    if (product.metrics.interestRates)
      metrics.interestRates.push(...product.metrics.interestRates);
    if (product.metrics.fees) metrics.fees.push(...product.metrics.fees);
  }

  const averages = {};
  for (const [key, values] of Object.entries(metrics)) {
    if (values.length > 0) {
      averages[key] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
  }

  return {
    ranges: metrics,
    averages,
  };
}

// === MEMORY MANAGEMENT FUNCTIONS ===

async function loadUserMemory(userId) {
  if (!userId) return { summary: "", memories: [] };

  try {
    // Get memory summary
    const { data: summary } = await supabase
      .from("memory_summary")
      .select("summary_text")
      .eq("user_id", userId)
      .single();

    // Get top 3 freshest non-expired memories
    const { data: memories } = await supabase
      .from("user_memories")
      .select("memory_type, key, value, confidence_score")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("updated_at", { ascending: false })
      .limit(3);

    const result = {
      summary: summary?.summary_text || "",
      memories: memories || [],
    };

    if (result.summary || result.memories.length > 0) {
      console.log(`🧠 [FINNY] Loaded memory for user ${userId}:`, {
        summary: result.summary,
        memoryCount: result.memories.length,
        memories: result.memories.map(
          (m) => `${m.memory_type}.${m.key}: ${m.value}`
        ),
      });
    }

    return result;
  } catch (error) {
    console.error("Memory load failed:", error);
    return { summary: "", memories: [] };
  }
}

function extractMemoryCandidates(text) {
  const candidates = [];

  // Look for memory_candidates JSON object in response
  const jsonMatch = text.match(
    /\{\s*"memory_candidates"\s*:\s*\[(.*?)\]\s*\}/s
  );
  if (jsonMatch) {
    try {
      const candidatesText = `{"memory_candidates":[${jsonMatch[1]}]}`;
      const parsed = JSON.parse(candidatesText);
      return parsed.memory_candidates.filter((c) => c.confidence_score >= 0.7);
    } catch (e) {
      console.log("Memory extraction failed:", e);
    }
  }

  // Fallback: look for simple array format
  const arrayMatch = text.match(/memory_candidates[:\s]*\[(.*?)\]/s);
  if (arrayMatch) {
    try {
      const candidatesText = `[${arrayMatch[1]}]`;
      const parsed = JSON.parse(candidatesText);
      return parsed.filter((c) => c.confidence_score >= 0.7);
    } catch (e) {
      console.log("Memory extraction failed:", e);
    }
  }

  return candidates;
}

function removeMemoryCandidatesFromText(text) {
  // Remove JSON object format memory candidates
  let cleanText = text.replace(
    /\{\s*"memory_candidates"\s*:\s*\[.*?\]\s*\}/s,
    ""
  );

  // Remove simple array format memory candidates
  cleanText = cleanText.replace(/memory_candidates[:\s]*\[.*?\]/s, "");

  // Remove any leftover JSON code blocks
  cleanText = cleanText.replace(/```json\s*```/g, "");
  cleanText = cleanText.replace(/```json.*?```/gs, "");
  cleanText = cleanText.replace(/```\s*```/g, "");
  cleanText = cleanText.replace(/```.*?```/gs, "");

  // Clean up any trailing whitespace or newlines
  cleanText = cleanText.trim();

  return cleanText;
}

async function saveMemoryCandidates(userId, candidates) {
  if (!userId || !candidates.length) {
    console.log("🧠 [FINNY] No userId or candidates to save:", {
      userId,
      candidatesLength: candidates?.length,
    });
    return;
  }

  console.log(
    `🧠 [FINNY] Starting to save ${candidates.length} memories for user ${userId}`
  );

  try {
    let savedCount = 0;
    let skippedCount = 0;

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
        console.log(
          `🧠 [FINNY] Skipping sensitive memory: ${candidate.key} = ${candidate.value}`
        );
        skippedCount++;
        continue;
      }

      // Upsert memory
      const { error } = await supabase.from("user_memories").upsert(
        {
          user_id: userId,
          memory_type: memoryType,
          key: candidate.key,
          value: redactedValue,
          confidence_score: candidate.confidence_score || candidate.confidence,
          expires_at: getExpiryDate(memoryType),
        },
        {
          onConflict: "user_id,memory_type,key",
        }
      );

      if (error) {
        console.error(
          `🧠 [FINNY] Failed to save memory ${candidate.key}:`,
          error
        );
      } else {
        console.log(
          `🧠 [FINNY] ✅ Saved memory: ${memoryType}.${
            candidate.key
          } = "${redactedValue}" (confidence: ${
            candidate.confidence_score || candidate.confidence
          })`
        );
        savedCount++;
      }
    }

    console.log(
      `🧠 [FINNY] Memory save complete: ${savedCount} saved, ${skippedCount} skipped`
    );

    // Update memory summary
    await updateMemorySummary(userId);
  } catch (error) {
    console.error("Memory save failed:", error);
  }
}

function isSensitiveData(value) {
  const sensitivePatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
    /\b\d{9,}\b/, // Long numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
  ];

  return sensitivePatterns.some((pattern) => pattern.test(value));
}

function getExpiryDate(memoryType) {
  const now = new Date();
  const expiryDays = {
    profile_trait: 365, // 1 year
    constraint: 180, // 6 months
    preference: 90, // 3 months
    future_plan: 180, // 6 months
  };

  const days = expiryDays[memoryType] || 90;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function updateMemorySummary(userId) {
  try {
    const { data: memories } = await supabase
      .from("user_memories")
      .select("memory_type, key, value")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (!memories?.length) return;

    const summary = generateMemorySummary(memories);

    await supabase.from("memory_summary").upsert({
      user_id: userId,
      summary_text: summary,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Memory summary update failed:", error);
  }
}

function generateMemorySummary(memories) {
  if (!memories || memories.length === 0) {
    return "No user information available.";
  }

  // Group by memory type
  const grouped = memories.reduce((acc, memory) => {
    if (!acc[memory.memory_type]) acc[memory.memory_type] = [];
    acc[memory.memory_type].push(memory);
    return acc;
  }, {});

  const parts = [];

  // Profile traits (most important - show first)
  if (grouped.profile_trait && grouped.profile_trait.length > 0) {
    const traits = grouped.profile_trait
      .map((m) => `${m.key.replace("profile_trait.", "")}: ${m.value}`)
      .join(", ");
    parts.push(`Profile: ${traits}`);
  }

  // Goals (future plans)
  if (grouped.goal && grouped.goal.length > 0) {
    const goals = grouped.goal
      .map((m) => `${m.key.replace("goal.", "")}: ${m.value}`)
      .join(", ");
    parts.push(`Future plans: ${goals}`);
  }

  // Constraints (limitations)
  if (grouped.constraint && grouped.constraint.length > 0) {
    const constraints = grouped.constraint
      .map((m) => `${m.key.replace("constraint.", "")}: ${m.value}`)
      .join(", ");
    parts.push(`Constraints: ${constraints}`);
  }

  // Preferences (choices/priorities)
  if (grouped.preference && grouped.preference.length > 0) {
    const preferences = grouped.preference
      .map((m) => `${m.key.replace("preference.", "")}: ${m.value}`)
      .join(", ");
    parts.push(`Preferences: ${preferences}`);
  }

  // Context signals (life events/situations)
  if (grouped.context_signal && grouped.context_signal.length > 0) {
    const signals = grouped.context_signal
      .map((m) => `${m.key.replace("context_signal.", "")}: ${m.value}`)
      .join(", ");
    parts.push(`Recent context: ${signals}`);
  }

  return parts.length > 0 ? parts.join(". ") : "No user information available.";
}
