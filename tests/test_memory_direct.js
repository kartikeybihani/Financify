/**
 * Memory System Direct Test Harness
 * - Hybrid gating + validator
 * - Dry-run saves
 * - Loading, selection, summary
 *
 * Usage:
 *   node test_memory_direct.js "I am 28, live in Austin, saving $30k for a house in 3 years"
 *   FINNY_MEMORY_DRY_RUN=1 node test_memory_direct.js
 */

import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

import {
  quickExtract,
  shouldRunMemoryExtraction,
  validateMemoriesWithSmallModel,
  saveMemoryCandidates,
  loadUserMemory,
  selectRelevantMemories,
  generateMemorySummary,
} from "./api/finny.js";

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

const TEST_USER_ID =
  process.env.TEST_USER_ID || "79952f35-b607-40d6-a32e-d81386882eb7";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    message: null,
    intent: "ask_personalized",
    force: false,
    save: false,
    saveSummary: false,
    useLocalValidator: false,
    showPrompt: false,
    noGate: false,
    useLocalGate: false,
  };
  for (const a of args) {
    if (a.startsWith("--intent=")) out.intent = a.split("=")[1] || out.intent;
    else if (a === "--force") out.force = true;
    else if (a === "--save") out.save = true;
    else if (a === "--save-summary") out.saveSummary = true;
    else if (a === "--local-validator") out.useLocalValidator = true;
    else if (a === "--show-prompt") out.showPrompt = true;
    else if (a === "--no-gate") out.noGate = true;
    else if (a === "--use-local-gate") out.useLocalGate = true;
    else if (!out.message) out.message = a;
  }
  return out;
}

function cleanValue(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "unknown" || s === "n/a" || s === "na" || s === "none") return null;
  return String(v);
}

function prettyList(items) {
  return items.filter(Boolean).join(", ");
}

function sanitizeLocation(raw) {
  if (!raw) return raw;
  // strip trailing phrases likely not part of location
  let s = String(raw).trim();
  s = s.replace(/\s*(,|;).*$/g, "");
  s = s.replace(/\s+and\b[\s\S]*$/i, "");
  s = s.replace(
    /\s+(planning|plan|thinking|saving|want|to\s+buy|buy|down payment|target)\b[\s\S]*$/i,
    ""
  );
  s = s.replace(/\s+in\s+\d+\s+(years?|months?|yrs?|mos?)\b[\s\S]*$/i, "");
  // collapse spaces
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
    if (hasTimeSignal && !hasMoneySignal) continue; // likely timeframe number
    const value = parseAmount(token);
    if (value)
      candidates.push({ value, hasSuffix: /[km]$/i.test(token.trim()) });
  }
  if (candidates.length === 0) return null;
  // Prefer suffix; else largest
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
  // Handles: "I am 28", "I'm 28", "im 28"
  const m = message.toLowerCase().match(/\b(i am|i'm|im)\s*(\d{1,2})\b/);
  if (m) return parseInt(m[2], 10);
  // Fallback: any 1-2 digit number followed by 'yo' or 'years old' handled upstream
  return null;
}

function fallbackExtractCandidates(message, hints) {
  const lower = message.toLowerCase();
  const out = [];

  // Children count detection
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

  // Location from hint or pattern
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
  const hintLoc = hints.find((h) => h.key === "profile_trait.location");
  if (hintLoc)
    out.push({
      type: "profile_trait",
      key: "profile_trait.location",
      value: sanitizeLocation(hintLoc.value),
      confidence: hintLoc.confidence || 0.8,
      grounded: true,
      evidence: [hintLoc.value],
    });

  // House down payment goal
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

  // Marital/children quick from hints
  const married = hints.find(
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

  // If hints claimed goal.family.children, map to profile trait "has children" when explicit
  const hintKids = hints.find((h) => h.key === "goal.family.children");
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

  // Constraints (credit card debt) from hints
  const ccDebt = hints.find((h) => h.key === "constraint.debt.credit_card");
  if (ccDebt)
    out.push({
      type: "constraint",
      key: ccDebt.key,
      value: ccDebt.value,
      confidence: ccDebt.confidence || 0.85,
      grounded: true,
      evidence: [ccDebt.value],
    });

  // Deduplicate by type+key
  const unique = out.filter(
    (m, i, self) =>
      i === self.findIndex((x) => x.type === m.type && x.key === m.key)
  );
  return unique;
}

function toDbLikeMemories(userId, arr) {
  const now = new Date().toISOString();
  return arr.map((m) => ({
    user_id: userId,
    memory_type: m.type,
    key: m.key,
    value: String(m.value),
    confidence_score: m.confidence ?? m.confidence_score ?? 0.8,
    updated_at: now,
  }));
}

async function fetchLatestDbSummary(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("memory_summary")
    .select("summary_text, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function localPersonalSignalGate(message) {
  const m = (message || "").toLowerCase();
  if (!m) return false;
  const edu =
    /(college|university|degree|bachelor|masters|phd|cs degree|computer science|student)/i.test(
      m
    );
  const occ =
    /(run|own|operate|freelance|freelancer|founder|entrepreneur|business|work as|i'm a|i am a|engineer|nurse|teacher|designer|developer)/i.test(
      m
    );
  const imm =
    /(visa|immigration|work authorization|green card|h1b|h-1b|opt|cpt|f1|j1|asylum)/i.test(
      m
    );
  const move = /(moving to|relocating to|moved to)/i.test(m);
  const stress =
    /(stressed|anxious|worried)\s+about\s+(money|bills|debt)/i.test(m);
  return edu || occ || imm || move || stress;
}

// Local copy of validator so you can tweak prompt here
async function localValidateMemoriesWithSmallModel(
  message,
  hints,
  intent = "ask_personalized",
  opts = { showPrompt: false }
) {
  const allowedByIntent = {
    ask_personalized: new Set([
      "profile_trait.age",
      "profile_trait.location",
      "profile_trait.occupation",
      "profile_trait.family.marital_status",
      "profile_trait.family.relationship_status",
      "profile_trait.family.living_situation",
      "profile_trait.education",
      "constraint.debt.student_loans",
      "constraint.debt.credit_card",
      "goal.family.children",
      "goal.financial.house_down_payment",
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
  const allowed = allowedByIntent[intent] || allowedByIntent.ask_personalized;

  const prompt = [
    "You validate user memories. Return JSON only.",
    "Only extract durable, advisor-grade facts with evidence from the message.",
    "Include an evidence array of the exact spans that justify each memory.",
    "Reject generic interests/hobbies unless tied to financial impact.",
    "Schema: {memories:[{type,key,value,confidence,evidence:[], grounded:boolean}]}",
    "Grounded means the fact is supported by concrete signals (amount/date/age/state/role).",
    "\nINSTRUCTIONS:",
    "- For profile traits (education, occupation, marital/family, location), extract when disclosed in first person even without numbers.",
    "- Normalize concise values (e.g., 'I've a business' -> 'business owner'; 'college degree of computer science' -> 'computer science degree').",
    "- For goals and constraints, require grounded signals (amount/timeframe/state/role).",
    "- Always include evidence strings copied verbatim from the message.",
    "\nEXAMPLES (STRICT JSON):",
    '{"memories":[{"type":"profile_trait","key":"profile_trait.education","value":"computer science degree","confidence":0.9,"evidence":["college degree of computer science"]}]}',
    '{"memories":[{"type":"profile_trait","key":"profile_trait.occupation","value":"business owner","confidence":0.9,"evidence":["I\'ve a business that I\'m growing"]}]}',
    '{"memories":[{"type":"context_signal","key":"context_signal.immigration_status","value":"visa issues after graduation","confidence":0.85,"evidence":["visa issues once I graduate"]}]}',
    `Allowed keys: ${JSON.stringify(Array.from(allowed))}`,
    `Synonyms map (for the model): ${JSON.stringify(KEY_SYNONYMS, null, 2)}`,
    `Message: ${message}`,
    `Hints: ${JSON.stringify(hints)}`,
  ].join("\n");

  if (opts.showPrompt) {
    console.log("\n===== LOCAL MEMORY VALIDATOR PROMPT =====\n");
    console.log(prompt);
    console.log("\n===== END PROMPT =====\n");
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openRouterKey) {
    console.error("OPENROUTER_API_KEY is required for this validator");
    return [];
  }

  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
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
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed?.memories) ? parsed.memories : [];

  const filtered = raw.filter((m) => {
    const key = m.key || "";
    const conf = m.confidence != null ? m.confidence : m.confidence_score;
    const isProfile = key.startsWith("profile_trait.");
    let hasEvidence = Array.isArray(m.evidence) && m.evidence.length > 0;
    if (isProfile && !hasEvidence && typeof m.value === "string") {
      if (
        String(message).toLowerCase().includes(String(m.value).toLowerCase())
      ) {
        hasEvidence = true;
        m.evidence = [m.value];
      }
    }
    const grounded = isProfile
      ? hasEvidence
      : m.grounded === true || hasEvidence;
    if (!allowed.has(key)) return false;
    if (!(conf >= 0.8)) return false;
    if (!grounded) return false;
    if (!m.value || typeof m.value !== "string") return false;
    return true;
  });

  // Deduplicate by type+key
  return filtered.filter(
    (m, i, self) =>
      i === self.findIndex((x) => x.type === m.type && x.key === m.key)
  );
}
async function runSingle(
  message,
  intent = "ask_personalized",
  opts = {
    force: false,
    save: false,
    saveSummary: false,
    useLocalValidator: false,
    showPrompt: false,
    noGate: false,
    useLocalGate: false,
  }
) {
  const start = Date.now();
  const wasDryRun =
    String(process.env.FINNY_MEMORY_DRY_RUN || "").toLowerCase() === "true" ||
    process.env.FINNY_MEMORY_DRY_RUN === "1";
  if (opts.save && wasDryRun) process.env.FINNY_MEMORY_DRY_RUN = "0";

  // 1) Heuristic hints
  const hints = quickExtract(message);

  // 2) Gates
  let gated = shouldRunMemoryExtraction(message, intent);
  if (opts.useLocalGate) {
    const localGate = localPersonalSignalGate(message);
    if (!gated && localGate) gated = true;
  }
  if (opts.noGate) {
    gated = true;
  }
  if (opts.force && !gated) gated = true;

  let validated = [];
  if (gated) {
    // 3) Validator (small model)
    if (opts.useLocalValidator) {
      validated = await localValidateMemoriesWithSmallModel(
        message,
        hints,
        intent,
        { showPrompt: opts.showPrompt }
      );
    } else {
      validated = await validateMemoriesWithSmallModel(message, hints, intent);
    }
    if (validated.length === 0) {
      const fallback = fallbackExtractCandidates(message, hints);
      if (fallback.length > 0) validated = fallback;
    }
  } else {
    if (opts.useLocalValidator && localPersonalSignalGate(message)) {
      validated = await localValidateMemoriesWithSmallModel(
        message,
        hints,
        intent,
        { showPrompt: opts.showPrompt }
      );
      if (validated.length === 0) {
        const fallback = fallbackExtractCandidates(message, hints);
        if (fallback.length > 0) validated = fallback;
      }
    }
  }

  // 4) Skip DB writes for clean output

  // 5) Load memory and select relevant
  const mem = await loadUserMemory(TEST_USER_ID);
  selectRelevantMemories(mem, message, intent, {});

  // Pretty print what would be shown (filter out unknowns)
  const printable = mem.memories
    .map((m) => ({ ...m, value: cleanValue(m.value) }))
    .filter((m) => !!m.value);
  const finalMemories = [
    ...printable,
    ...toDbLikeMemories(TEST_USER_ID, validated).map((m) => ({
      memory_type: m.memory_type,
      key: m.key,
      value: m.value,
      confidence_score: m.confidence_score,
      updated_at: m.updated_at,
    })),
  ];

  // 6) Generate user-facing summary text
  let summarySource = mem.memories;
  // If we ran in dry-run mode or opted not to save, preview the summary including the newly extracted candidates
  if (!opts.save && validated.length > 0) {
    summarySource = [
      ...mem.memories,
      ...toDbLikeMemories(TEST_USER_ID, validated),
    ];
  }
  const summary = await generateMemorySummary(summarySource, TEST_USER_ID);
  // Minimal final output
  console.log(`Gate: ${gated}`);
  console.log("Extracted memories:");
  if (finalMemories.length === 0) {
    console.log("  (none)");
  } else {
    for (const m of finalMemories.slice(0, 50)) {
      console.log(
        `  - ${m.memory_type}.${m.key}: ${m.value} (conf=${
          m.confidence_score ?? "?"
        })`
      );
    }
  }
  console.log("Summary:");
  console.log(summary || "(empty)");

  // (Optional) timing for debug only — suppressed by default
}

async function main() {
  const args = parseArgs();
  if (args.message) {
    await runSingle(args.message, args.intent, {
      force: args.force,
      save: args.save,
      saveSummary: args.saveSummary,
      useLocalValidator: args.useLocalValidator,
      showPrompt: args.showPrompt,
    });
    return;
  }

  // Batch scenarios
  const scenarios = [
    {
      msg: "Which credit card should I get?",
      note: "Should be gated OFF",
    },
    {
      msg: "I'm 22 years old and have $8,000 in student loan debt.",
      note: "Age + constraint → should save",
    },
    {
      msg: "I live in Seattle and work as a nurse. Thinking of buying a house in 3 years; want to save $60,000.",
      note: "Location + occupation + goal with timeframe+amount → should save",
    },
    {
      msg: "Rent vs buy in Phoenix at 7% for me?",
      note: "Generic planning query; likely gated unless strong personal facts",
    },
    {
      msg: "I'm stressed about my credit card debt and want a plan.",
      note: "Constraint + context signal → likely save constraint",
    },
  ];

  for (const s of scenarios) {
    console.log(`\n==== ${s.note} ====`);
    await runSingle(s.msg, "ask_personalized", {
      force: false,
      save: false,
      saveSummary: false,
    });
  }
}

if (
  typeof window === "undefined" &&
  import.meta.url === `file://${process.argv[1]}`
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { runSingle };
