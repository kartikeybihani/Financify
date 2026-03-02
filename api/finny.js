// api/finny.js
import { supabase } from "../lib/api/supabase.js";
import fetch from "node-fetch";
import crypto from "crypto";
import { handleGoalConversation } from "./goals.js";
import {
  getSessionState,
  setSessionState,
  mergeSessionState,
  getRecentConversationTurns,
  appendConversationTurns,
  invalidateProfileCache,
  loadUserMemory,
  loadUserProfile,
  storeConversationMemory,
  retrieveFeedbackPatterns,
  buildFeedbackContext,
  setPrebuildContextActive,
  clearPrebuildContextActive,
  loadUserMemoryWithTimeout,
  fetchSupermemoryProfileWithTimeout,
  // saveMemoryCandidates removed - migrating to Supermemory
  // generateMemorySummary removed - migrating to Supermemory
  // validateMemoriesWithSmallModel removed - migrating to Supermemory
  // selectRelevantMemories removed - Supermemory handles relevance ranking
  // categorizeSelectedMemories removed - no longer needed with Supermemory format
} from "../lib/memoryUtils.js";
import {
  detectUserState,
  buildContextAwarePromptDetailed,
} from "../lib/prompt_engine.js";
import { buildMainAskMessages } from "../lib/llm/promptLogging.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";
import {
  logDebug,
  logInfo,
  logWarn,
  logError,
} from "../core/finny/utils/logging.js";
import { withTimeout } from "../core/finny/utils/timeout.js";
import {
  redactPII,
  cleanResponseFormatting,
} from "../core/finny/utils/formatting.js";
import {
  PRIMARY_OPENROUTER_MODEL,
  REASONING_MODEL_PAID_SCOUT,
  SMALLER_MODEL,
  STANDARD_MODEL,
  TERTIARY_MODEL,
  MEMORY_LOAD_TIMEOUT_MS,
  getOpenRouterKey,
} from "../core/finny/utils/constants/modelConfig.js";
import {
  MEMORY_CACHE_TTL,
  MEMORY_CACHE_MAX_SIZE,
} from "../core/finny/utils/constants/cacheConfig.js";
import {
  NEED_CONFIG,
  CACHE_STRATEGY,
} from "../core/finny/utils/constants/needConfig.js";
import { ClassificationService } from "../core/finny/services/ClassificationService.js";
import { ContextPlanningService } from "../core/finny/services/ContextPlanningService.js";
import { LLMService } from "../core/finny/infrastructure/llm/LLMService.js";
import { DataFetchService } from "../core/finny/services/DataFetchService.js";
import { StockAnalysisService } from "../core/finny/services/StockAnalysisService.js";
import { WebSearchService } from "../core/finny/services/WebSearchService.js";

// Utilities
function generateRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function responseHasVisibleContent(response) {
  if (!response || typeof response !== "object") return false;
  if (Array.isArray(response.message) && response.message.length > 0)
    return true;
  if (typeof response.message === "string" && response.message.trim())
    return true;
  if (typeof response.text === "string" && response.text.trim()) return true;
  if (Array.isArray(response.actions) && response.actions.length > 0)
    return true;
  return false;
}

function detectRefusalToAnswer(text) {
  if (!text || typeof text !== "string") return false;
  return /\b(just tell me|no questions|don't ask|dont ask|stop asking|whatever just answer|idk just answer)\b/i.test(
    text,
  );
}

function detectAmbiguousIntent(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();

  // A lightweight trigger for “coach should clarify goal first”.
  // Not a topic map; just catches common ambiguous decision phrasing.
  const patterns = [
    /\bshould i\b/, // "Should I buy..."
    /\bis it worth it\b/,
    /\bworth it\b/,
    /\bhelp me decide\b/,
    /\bwhat should i do\b/,
    /\bwhat do i do\b/,
    /\bdo you think i should\b/,
    /\bhow do i decide\b/,
  ];

  if (patterns.some((p) => p.test(lower))) return true;

  // Single-word “yes/no” prompts can be ambiguous in medium/high risk contexts.
  if (lower.trim() === "help") return true;

  return false;
}

function determineResponseContract(message = "", classificationResult = {}) {
  const lower = String(message).toLowerCase();
  const intent = classificationResult?.intent || "ask_personalized";
  const intentType = classificationResult?.intent_type || null;
  const decisionRisk = classificationResult?.decision_risk || "unknown";

  const affordabilityPattern =
    /\b(can i afford|can i buy|should i buy|do u think i can buy|do you think i can buy|worth buying|worth it to buy)\b/.test(
      lower,
    ) ||
    (/\b(buy|purchase)\b/.test(lower) && /\$[\d,]+/.test(lower));

  if (intent === "ask_personalized" && affordabilityPattern) {
    return "affordability_decision";
  }
  if (intent === "ask_personalized" && intentType === "factual") {
    return "factual_lookup";
  }
  if (
    decisionRisk === "high" &&
    (intentType === "actionable" || intentType === "planning")
  ) {
    return "high_stakes_planning";
  }
  if (intent === "ask_personalized" && intentType === "exploratory") {
    return "education_explainer";
  }
  return "default_coach";
}

function extractMentionedAmount(message = "") {
  const text = String(message);
  const dollarMatch = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (dollarMatch?.[1]) {
    const value = Number(dollarMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  const usdMatch = text.match(
    /\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(usd|dollars?)\b/i,
  );
  if (usdMatch?.[1]) {
    const value = Number(usdMatch[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function buildResponseContractInstructions(
  contract,
  { message = "", classificationResult = {}, packs = {}, profile = {} } = {},
) {
  const amount = extractMentionedAmount(message);
  const amountProvided = Number.isFinite(amount);
  const lines = [];

  lines.push(`RESPONSE_CONTRACT: ${contract}`);

  if (contract === "affordability_decision") {
    lines.push(
      `- Output format: Decision -> Why (max 2 bullets) -> One next step.`,
    );
    lines.push(`- Lead with the decision in the first sentence.`);
    lines.push(
      `- Financial context (if needed) must be 2-3 short bullets, not a long paragraph.`,
    );
    lines.push(
      `- Prefer purchase-impact and debt context; avoid listing net worth/investments unless directly necessary.`,
    );
    lines.push(
      `- Use only necessary money context; do NOT dump full balances or account summaries.`,
    );
    lines.push(
      `- Finny must compute affordability impact itself; do NOT ask user to evaluate impact.`,
    );
    lines.push(
      `- Assume linked accounts are the primary money context. Do NOT ask user to "check if they have enough savings" from linked balances.`,
    );
    lines.push(
      `- If uncertainty remains, ask ONLY about off-platform cash or near-term obligations not reflected in linked accounts.`,
    );
    lines.push(
      `- Ask at most ONE clarifying question, only if materially blocked.`,
    );
    lines.push(
      amountProvided
        ? `- Purchase amount is already provided (${amount}); NEVER ask for price again.`
        : `- Purchase amount is missing; ask exactly one question for price and stop.`,
    );
  } else if (contract === "factual_lookup") {
    lines.push(
      `- Output format: Direct answer first -> brief supporting math.`,
    );
    lines.push(`- No coaching questions unless answer is truly blocked.`);
  } else if (contract === "high_stakes_planning") {
    lines.push(
      `- Output format: brief framing -> 1-2 principles -> 1-3 targeted clarifying questions.`,
    );
    lines.push(`- Do not provide tactical step-by-step plan yet.`);
  } else if (contract === "education_explainer") {
    lines.push(
      `- Output format: direct explanation -> short example -> one practical takeaway.`,
    );
  } else {
    lines.push(
      `- Keep response concise, personalized, and directly actionable.`,
    );
  }

  return lines.join("\n");
}

function countQuestionMarks(text = "") {
  const matches = String(text).match(/\?/g);
  return matches ? matches.length : 0;
}

function detectAffordabilityContractIssues(message = "", responseText = "") {
  const amountProvided = Number.isFinite(extractMentionedAmount(message));
  const lower = String(responseText).toLowerCase();
  const asksForPrice =
    /\b(how much is|what('?s| is) the price|price tag|what's the price range)\b/.test(
      lower,
    );
  const asksUserToAssessImpact =
    /\b(will it impact|how will it impact|do you think it will affect)\b/.test(
      lower,
    );
  const asksUserToCheckSavings =
    /\b(check if you have enough savings|make sure you have enough savings|ensure you have enough savings|check your savings)\b/.test(
      lower,
    );
  const hedgesKnownDebt = /\b(if you have any debt|if you have debt)\b/.test(
    lower,
  );
  const tooManyQuestions = countQuestionMarks(responseText) > 1;

  return {
    amountProvided,
    asksForPrice: amountProvided && asksForPrice,
    asksUserToAssessImpact,
    asksUserToCheckSavings,
    hedgesKnownDebt,
    tooManyQuestions,
  };
}

function getAffordabilityVerdictLine(message = "", packs = {}, profile = {}) {
  const amount = extractMentionedAmount(message);
  if (!Number.isFinite(amount)) return null;

  const liquidAssets = Number(packs?.base?.liquidAssets);
  const liabilities = Number(packs?.base?.totalLiabilities);
  if (!Number.isFinite(liquidAssets)) return null;

  const remaining = liquidAssets - amount;
  let decisionLine = "This purchase is possible, but it’s not a clean yes.";

  if (remaining < 1000) {
    decisionLine = "I’d hold off right now on this purchase.";
  } else if (Number.isFinite(liabilities) && liabilities > remaining) {
    decisionLine = "I’d only buy this if you pay cash and avoid adding debt.";
  }
  return decisionLine;
}

function applyLightAffordabilityRepair(
  message = "",
  responseText = "",
  packs = {},
  profile = {},
) {
  let text = String(responseText || "").trim();
  if (!text) return text;

  const issues = detectAffordabilityContractIssues(message, text);
  const hasContractIssue =
    issues.asksForPrice ||
    issues.asksUserToAssessImpact ||
    issues.asksUserToCheckSavings ||
    issues.hedgesKnownDebt ||
    issues.tooManyQuestions;

  if (!hasContractIssue) return text;

  // 1) Remove blocked questions while preserving most of the model's original response.
  text = text
    .replace(
      /(^|\n).*(price tag|what('?s| is) the price|what's the price range|how much is).*(\n|$)/gi,
      "\n",
    )
    .replace(
      /(^|\n).*(how will it impact|will it impact your|do you think it will affect).*(\n|$)/gi,
      "\n",
    )
    .replace(
      /(^|\n).*(check if you have enough savings|make sure you have enough savings|ensure you have enough savings|check your savings).*(\n|$)/gi,
      "\n",
    )
    .replace(/(^|\n).*(if you have any debt|if you have debt).*(\n|$)/gi, "\n")
    .replace(
      /(^|\n).*(net worth.*liquid assets.*investment assets.*)(\n|$)/gi,
      "\n",
    );

  // 2) If too many questions, keep at most one question sentence.
  if (issues.tooManyQuestions) {
    const parts = text.split(/(?<=[.?!])\s+/);
    let questionKept = false;
    text = parts
      .filter((p) => {
        if (!p.includes("?")) return true;
        if (questionKept) return false;
        questionKept = true;
        return true;
      })
      .join(" ")
      .trim();
  }

  // 3) Ensure decision-first first line, but keep response body mostly intact.
  const verdict = getAffordabilityVerdictLine(message, packs, profile);
  if (verdict) {
    const startsWithDecision =
      /^(i('| a)m|i would|you can|you should|this purchase|i’d|i'd)/i.test(
        text,
      );
    if (!startsWithDecision) {
      text = `${verdict}\n\n${text}`;
    }
  }

  // 4) If we removed savings-check style language, inject one concise advisor-computed buffer line.
  if (issues.asksUserToCheckSavings) {
    const amount = extractMentionedAmount(message);
    const liquidAssets = Number(packs?.base?.liquidAssets);
    if (Number.isFinite(amount) && Number.isFinite(liquidAssets)) {
      const remaining = liquidAssets - amount;
      text = `${text}\n\n- Based on your linked balances, this would leave about $${remaining.toFixed(
        2,
      )} in liquid cash.`;
    }
  }

  // 5) Normalize verbose summary phrasing into concise bullet line.
  const amount = extractMentionedAmount(message);
  const liquidAssets = Number(packs?.base?.liquidAssets);
  if (
    Number.isFinite(amount) &&
    Number.isFinite(liquidAssets) &&
    !/cash after purchase|would leave about \$/.test(text.toLowerCase())
  ) {
    const remaining = liquidAssets - amount;
    text = `${text}\n\n- Cash after this purchase would be about $${remaining.toFixed(
      2,
    )}.`;
  }

  return cleanResponseFormatting(text);
}

function normalizeClassificationFromContext(
  classificationResult,
  packs = {},
  profile = {},
) {
  if (!classificationResult || typeof classificationResult !== "object") {
    return classificationResult;
  }

  const out = { ...classificationResult };
  const base = packs.base || {};

  const hasBaseContext =
    Number.isFinite(Number(base.netWorth)) ||
    Number.isFinite(Number(base.liquidAssets)) ||
    Number.isFinite(Number(base.totalLiabilities)) ||
    (Array.isArray(base.accounts) && base.accounts.length > 0);

  const hasSpendFromBase =
    (Array.isArray(base.spendByCategoryCurrentMonth) &&
      base.spendByCategoryCurrentMonth.length > 0) ||
    (Array.isArray(base.spendByCategoryLastMonth) &&
      base.spendByCategoryLastMonth.length > 0) ||
    (Array.isArray(base.spendByCategory) && base.spendByCategory.length > 0);

  const hasSpendFromPack =
    !!packs.spend &&
    (Number.isFinite(Number(packs.spend.total)) ||
      Number.isFinite(Number(packs.spend.count)) ||
      (Array.isArray(packs.spend.transactions) &&
        packs.spend.transactions.length > 0));

  const hasIncome = Number(profile?.monthly_income) > 0;
  const hasDebtSignal =
    Number.isFinite(Number(base.totalLiabilities)) ||
    (Array.isArray(base.accounts) &&
      base.accounts.some((acc) => acc?.type === "credit"));

  if (!Array.isArray(out.missing_fields)) out.missing_fields = [];

  out.missing_fields = out.missing_fields.filter((field) => {
    if (
      (field === "income_takehome" || field === "income_gross") &&
      hasIncome
    ) {
      return false;
    }
    if (field === "current_savings" && hasBaseContext) return false;
    if (field === "debt_balances" && hasDebtSignal) return false;
    return true;
  });

  const hasActionableContext =
    hasBaseContext || hasSpendFromBase || hasSpendFromPack || hasIncome;

  if (hasActionableContext && out.missing_fields.length === 0) {
    out.info_sufficiency = "sufficient";
    out.needs_clarification = false;
  }

  if (out.decision_risk === "unknown") {
    out.decision_risk =
      out.intent_type === "planning" || out.intent_type === "actionable"
        ? "medium"
        : "low";
  }

  if (out.intent === "ask_personalized" && out.intent_type === "factual") {
    if (out.decision_risk !== "high") out.decision_risk = "low";
    if (out.info_sufficiency === "unknown") {
      out.info_sufficiency = hasBaseContext ? "sufficient" : "unknown";
    }
    if (out.info_sufficiency === "missing") out.info_sufficiency = "unknown";
    out.needs_clarification = false;
    out.missing_fields = [];
  }

  return out;
}

function looksLikeFactualLookup(message = "") {
  const lower = String(message).toLowerCase();
  return (
    /\b(how much|how many|what is my|what's my|show me|did i spend|spent this month|spent last month)\b/.test(
      lower,
    ) && !/\b(should i|can i afford|worth it|help me decide)\b/.test(lower)
  );
}

// canonicalizeIntentType moved to service

function buildInsufficiencyState(
  message,
  classificationResult,
  packs,
  profile,
) {
  const lower = String(message || "").toLowerCase();
  const base = packs?.base || {};
  const missing_numeric_inputs = [];
  const missing_decision_context = [];

  const highRisk = classificationResult?.decision_risk === "high";

  if (highRisk) {
    if (!(Number(profile?.monthly_income) > 0)) {
      missing_numeric_inputs.push("income_takehome");
    }
    if (!Number.isFinite(Number(base.liquidAssets))) {
      missing_numeric_inputs.push("current_savings");
    }
    if (!Number.isFinite(Number(base.totalLiabilities))) {
      missing_numeric_inputs.push("debt_balances");
    }
  }

  const houseLike =
    /\b(house|home|mortgage|property|condo|real estate)\b/.test(lower) &&
    /\b(buy|purchase|afford|should)\b/.test(lower);
  if (houseLike && highRisk) {
    if (
      !/\b(investment|rental|primary|first home|vacation|luxury|live in)\b/.test(
        lower,
      )
    ) {
      missing_decision_context.push("purchase_purpose");
    }
    if (
      !/\b(in \d+ months?|by \d{4}|this year|next year|timeline)\b/.test(lower)
    ) {
      missing_decision_context.push("timeline");
    }
  }

  return {
    missing_numeric_inputs: Array.from(new Set(missing_numeric_inputs)),
    missing_decision_context: Array.from(new Set(missing_decision_context)),
  };
}

function buildHighRiskClarificationResponse(
  insufficiency,
  classificationResult,
  message,
) {
  const numeric = insufficiency?.missing_numeric_inputs || [];
  const decision = insufficiency?.missing_decision_context || [];
  const questions = [];

  if (decision.includes("purchase_purpose")) {
    questions.push(
      "Is this purchase for a primary home, investment/rental, vacation, or luxury use?",
    );
  }
  if (decision.includes("timeline")) {
    questions.push("What timeline are you targeting for this purchase?");
  }
  if (numeric.includes("income_takehome")) {
    questions.push("What is your current monthly take-home income?");
  }
  if (numeric.includes("current_savings")) {
    questions.push(
      "How much cash is available today for down payment and buffer?",
    );
  }

  const finalQuestions = questions.slice(0, 3);
  return {
    type: "assistant",
    message: cleanResponseFormatting(
      [
        "This is a high-stakes decision, so I won’t guess and give a fake-precise recommendation.",
        "",
        ...finalQuestions.map((q, idx) => `${idx + 1}. ${q}`),
      ].join("\n"),
    ),
    hideActions: true,
  };
}

function deterministicChance(seed, probability = 0.5) {
  try {
    const p = typeof probability === "number" ? probability : 0.5;
    const clamped = Math.max(0, Math.min(1, p));
    const hash = crypto
      .createHash("sha256")
      .update(String(seed || ""))
      .digest("hex");
    const first8 = parseInt(hash.slice(0, 8), 16);
    const bucket = first8 % 100;
    return bucket < Math.round(clamped * 100);
  } catch {
    return Math.random() < probability;
  }
}

function normalizePeriodFilter(periodFilter, timeRange = "current") {
  if (!periodFilter) return null;

  const now = new Date();
  const toIso = (d) => d.toISOString().split("T")[0];

  // Already structured period
  if (
    typeof periodFilter === "object" &&
    periodFilter !== null &&
    periodFilter.start &&
    periodFilter.end
  ) {
    return {
      start: periodFilter.start,
      end: periodFilter.end,
      ...(Number.isFinite(Number(periodFilter.months))
        ? { months: Number(periodFilter.months) }
        : {}),
    };
  }

  // Convert month-only objects to concrete dates
  if (
    typeof periodFilter === "object" &&
    periodFilter !== null &&
    Number.isFinite(Number(periodFilter.months))
  ) {
    const months = Number(periodFilter.months);
    const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
    return {
      start: toIso(startDate),
      end: toIso(now),
      months,
    };
  }

  // Natural language period string from classifier
  if (typeof periodFilter === "string") {
    const p = periodFilter.toLowerCase().trim();

    if (p.includes("this month") || p === "current") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toIso(first), end: toIso(now) };
    }
    if (p.includes("last month")) {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toIso(first), end: toIso(last), months: 1 };
    }
    if (p.includes("last 30") || p.includes("past 30")) {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: toIso(start), end: toIso(now), months: 1 };
    }
    const match = p.match(/(\d+)\s+months?/);
    if (match) {
      const months = Number(match[1]);
      const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
      return { start: toIso(startDate), end: toIso(now), months };
    }
  }

  // Fallback from classification time_range
  if (typeof timeRange === "string") {
    if (timeRange === "1_month") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: toIso(first), end: toIso(now), months: 1 };
    }
    if (timeRange === "3_months") {
      const first = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { start: toIso(first), end: toIso(now), months: 3 };
    }
    if (timeRange === "6_months") {
      const first = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return { start: toIso(first), end: toIso(now), months: 6 };
    }
    if (timeRange === "1_year") {
      const first = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      return { start: toIso(first), end: toIso(now), months: 12 };
    }
  }

  return null;
}

function buildDeterministicCategoryExclusionAnswer(message, basePack = {}) {
  if (!message || !basePack) return null;
  const lower = String(message).toLowerCase();
  if (
    !lower.includes("this month") ||
    (!lower.includes("besides") &&
      !lower.includes("excluding") &&
      !lower.includes("except"))
  ) {
    return null;
  }

  const categories = Array.isArray(basePack.spendByCategoryCurrentMonth)
    ? basePack.spendByCategoryCurrentMonth
    : [];
  if (categories.length === 0) return null;

  const categoryNames = categories
    .map((c) => String(c?.category || c?.name || "").toLowerCase())
    .filter(Boolean);

  const exclusionRegex =
    /\b(?:besides|excluding|except)\s+([a-z][a-z\s]{1,30})/i;
  const match = lower.match(exclusionRegex);
  if (!match) return null;

  const requested = match[1].trim();
  const excludedName =
    categoryNames.find(
      (name) => requested.includes(name) || name.includes(requested),
    ) || null;
  if (!excludedName) return null;

  const normalizedExcluded = excludedName.toLowerCase();
  const included = categories.filter(
    (c) =>
      String(c?.category || c?.name || "").toLowerCase() !== normalizedExcluded,
  );
  if (included.length === 0) return null;

  const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const includedTotal = included.reduce(
    (sum, c) => sum + asNumber(c?.total_spend ?? c?.amount),
    0,
  );
  const excludedAmount = categories.find(
    (c) =>
      String(c?.category || c?.name || "").toLowerCase() === normalizedExcluded,
  );
  const excludedTotal = asNumber(
    excludedAmount?.total_spend ?? excludedAmount?.amount,
  );

  const lines = included.map((c) => {
    const category = c?.category || c?.name || "Unknown";
    const total = asNumber(c?.total_spend ?? c?.amount);
    return `- ${category}: $${total.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  });

  const excludedDisplay =
    excludedAmount?.category || excludedAmount?.name || requested;

  return [
    `This month, excluding ${excludedDisplay}, you've spent $${includedTotal.toLocaleString(
      undefined,
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    )}.`,
    "",
    ...lines,
    "",
    `${excludedDisplay} itself is $${excludedTotal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}.`,
  ].join("\n");
}

// callWithFallback moved to service

// Classification cache - in-memory cache for classification results
const classificationCache = new Map();
const classificationService = new ClassificationService(classificationCache);
const contextPlanningService = new ContextPlanningService();
const llmService = new LLMService();
const dataFetchService = new DataFetchService();
const webSearchService = new WebSearchService();
const stockAnalysisService = new StockAnalysisService({ webSearchService });

// Memory cache - in-memory cache for memory search results (to avoid duplicate loads)
const memoryCache = new Map();

// Data cache - in-memory cache for user data with different TTLs
const dataCache = new Map();

// Persistent cache using Supabase for cross-instance sharing
async function getPersistentCache(dataType, userId, params = {}) {
  try {
    const key = generateDataCacheKey(dataType, userId, params);
    logDebug(`🔍 [PERSISTENT_CACHE] Looking for ${dataType} with key: ${key}`);

    // Use .limit(1) to handle potential duplicates and get the most recent one
    const queryPromise = supabase
      .from("context_cache")
      .select("*")
      .eq("cache_key", key)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }) // Get most recent entry first
      .limit(1);

    const queryResult = await withTimeout(queryPromise, 2500, null);
    if (!queryResult) {
      logWarn(`⏰ [PERSISTENT_CACHE] Timeout reading ${dataType} (${key})`);
      return null;
    }
    const { data, error } = queryResult;

    if (error) {
      logError(
        `❌ [PERSISTENT_CACHE] Database error for ${dataType}:`,
        error.message,
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
    console.log(
      `🔍 [PERSISTENT_CACHE] Checking expiration for ${dataType}: now=${now}, expires=${
        cacheEntry.expires_at
      }, expired=${now > cacheEntry.expires_at}`,
    );

    if (now > cacheEntry.expires_at) {
      logDebug(`⏰ [PERSISTENT_CACHE] Cache EXPIRED for ${dataType} (${key})`);
      // Clean up ALL expired entries for this key
      setImmediate(() => {
        cleanupDuplicateCacheEntries(key, userId).catch((error) => {
          logError("❌ [PERSISTENT_CACHE] Cleanup failed:", error);
        });
      });
      return null;
    }

    // If there are duplicates, clean them up in the background
    if (data.length > 1) {
      console.log(
        `🧹 [PERSISTENT_CACHE] Found ${data.length} duplicate entries, cleaning up...`,
      );
      setImmediate(() => {
        cleanupDuplicateCacheEntries(key, userId).catch((error) => {
          logError("❌ [PERSISTENT_CACHE] Cleanup failed:", error);
        });
      });
    }

    console.log(`✅ [PERSISTENT_CACHE] Cache HIT for ${dataType} (${key})`);
    return cacheEntry.cache_data;
  } catch (error) {
    logError(
      `❌ [PERSISTENT_CACHE] Error getting cache for ${dataType}:`,
      error,
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
        expires_at,
      ).toISOString()}, TTL: ${ttl}ms`,
    );

    // First, delete any existing entries with the same cache_key and user_id (best-effort)
    const deletePromise = supabase
      .from("context_cache")
      .delete()
      .eq("cache_key", key)
      .eq("user_id", userId);
    await withTimeout(deletePromise, 2500, null);

    // Then insert the new entry
    const insertPromise = supabase.from("context_cache").insert({
      cache_key: key,
      user_id: userId,
      data_type: dataType,
      cache_data: data,
      expires_at: expires_at,
      created_at: new Date().toISOString(),
    });

    const insertResult = await withTimeout(insertPromise, 2500, null);
    const error = insertResult?.error;

    if (insertResult === null) {
      logWarn(
        `⏰ [PERSISTENT_CACHE] Timeout setting cache for ${dataType} (${key})`,
      );
    } else if (error) {
      logError(
        `❌ [PERSISTENT_CACHE] Error setting cache for ${dataType}:`,
        error,
      );
    } else {
      console.log(`✅ [PERSISTENT_CACHE] Cache SET for ${dataType} (${key})`);
    }
  } catch (error) {
    logError(
      `❌ [PERSISTENT_CACHE] Error setting cache for ${dataType}:`,
      error,
    );
  }
}

// OPTIMIZED: Unified cache TTL strategy for better performance
const CACHE_TTL = {
  // Fast-changing data (50 minutes) - extended for prebuild optimization
  financial_summary: 50 * 60 * 1000, // 50 minutes
  summary_min: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  net_worth: 50 * 60 * 1000, // 50 minutes (extended for prebuild)

  // Medium-changing data (50 minutes) - extended for prebuild optimization
  spend_data: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  goals_overview: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  cashflow_monthly: 50 * 60 * 1000, // 50 minutes (extended for prebuild)

  // Slow-changing data (50-60 minutes)
  investments_all: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
  category_transactions: 50 * 60 * 1000, // 50 minutes (extended for prebuild)
};

// NEED_CONFIG and CACHE_STRATEGY now imported from constants/needConfig.js

// Generate a cache key for classification
function generateClassificationCacheKey(message) {
  return classificationService.generateCacheKey(message);
}

// Clear all heuristic cache entries - check ALL possible heuristic indicators
// clearHeuristicCacheEntries moved to service

// Get cached classification result
function getCachedClassification(message) {
  return classificationService.getCached(message);
}

// Generate a cache key for memory search (user-specific)
function generateMemoryCacheKey(userId, query) {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return null;
  }
  // Normalize the query for better cache hits
  const normalized = query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Normalize whitespace
    .substring(0, 200); // Limit length for cache key

  return `${userId}:${normalized}`;
}

// Get cached memory result
function getCachedMemory(userId, query) {
  const key = generateMemoryCacheKey(userId, query);
  if (!key) return null;

  const cached = memoryCache.get(key);

  if (cached && Date.now() < cached.expires_at) {
    logDebug(
      `✅ [MEMORY_CACHE] Cache HIT for user ${userId}, query: "${query.substring(
        0,
        50,
      )}..."`,
    );
    return cached.result;
  }

  if (cached) {
    logDebug(
      `⏰ [MEMORY_CACHE] Cache EXPIRED for user ${userId}, query: "${query.substring(
        0,
        50,
      )}..."`,
    );
    memoryCache.delete(key);
  }

  return null;
}

// Set cached memory result
function setCachedMemory(userId, query, result) {
  const key = generateMemoryCacheKey(userId, query);
  if (!key) return;

  // Enforce max size: remove oldest entries if at capacity
  if (memoryCache.size >= MEMORY_CACHE_MAX_SIZE) {
    // Delete oldest entry (first in Map iteration order)
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }

  const expires_at = Date.now() + MEMORY_CACHE_TTL;
  memoryCache.set(key, { result, expires_at });
  logDebug(
    `💾 [MEMORY_CACHE] Cached memory result for user ${userId}, query: "${query.substring(
      0,
      50,
    )}..."`,
  );

  // Clean up expired entries periodically (every 100 cache writes)
  if (memoryCache.size % 100 === 0) {
    const now = Date.now();
    for (const [key, value] of memoryCache.entries()) {
      if (now >= value.expires_at) {
        memoryCache.delete(key);
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
async function getCachedUserData(
  dataType,
  userId,
  params = {},
  silent = false,
) {
  const key = generateDataCacheKey(dataType, userId, params);

  // First check in-memory cache
  const cached = dataCache.get(key);
  if (cached && Date.now() < cached.expires_at) {
    if (!silent) {
      console.log(
        `✅ [DATA_CACHE] In-memory cache HIT for ${dataType} (${key})`,
      );
    }
    return cached.data;
  }

  if (cached) {
    if (!silent) {
      logDebug(
        `⏰ [DATA_CACHE] In-memory cache EXPIRED for ${dataType} (${key})`,
      );
    }
    dataCache.delete(key);
  }

  // Fallback to persistent cache
  if (!silent) {
    console.log(
      `🔍 [DATA_CACHE] Checking persistent cache for ${dataType} (${key})`,
    );
  }
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
  setImmediate(() => {
    setPersistentCache(dataType, userId, data, params).catch((error) => {
      logError(
        `❌ [PERSISTENT_CACHE] Background set failed for ${dataType} (${key}):`,
        error,
      );
    });
  });

  const ttlMinutes = Math.round(ttl / (60 * 1000));
  logDebug(
    `💾 [DATA_CACHE] Cached ${dataType} (${key}) - expires in ${ttlMinutes} minutes`,
  );

  // Trigger cleanup if cache is getting large
  if (dataCache.size > CACHE_STRATEGY.in_memory.max_size) {
    logDebug(`🧹 [CACHE] Cache size exceeded limit, triggering cleanup`);
    setImmediate(() => {
      cleanupInMemoryCache().catch((error) => {
        logError("❌ [CACHE] In-memory cleanup failed:", error);
      });
    });
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
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    ) {
      logWarn(
        `⚠️ [CACHE] Invalid userId format in cleanupDuplicateCacheEntries: ${userId}`,
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
          `🧹 [CACHE] Cleaned up ${entriesToDelete.length} duplicate cache entries for key: ${cacheKey}`,
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
      .lt("expires_at", Date.now())
      .select("id", { count: "exact" });

    if (error) {
      logError("❌ [CACHE] Error cleaning Supabase cache:", error);
      return 0;
    }

    logDebug(
      `🧹 [CACHE] Cleaned up ${count || 0} expired Supabase cache entries`,
    );
    return count || 0;
  } catch (error) {
    logError("❌ [CACHE] Supabase cleanup failed:", error);
    return 0;
  }
}

// Comprehensive cache cleanup (both in-memory and Supabase)

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

    // Cache invalidated silently
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
        console.log(`✅ [CACHE] ${need} already cached for user ${userId}`);
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
          `⚠️ [CACHE] Failed to pre-populate ${need} for user ${userId}`,
        );
        results.failed++;
      }
    } catch (error) {
      logError(`❌ [CACHE] Error pre-populating ${need}:`, error);
      results.failed++;
    }
  }

  logDebug(
    `📊 [CACHE] Pre-population complete - Success: ${results.success}, Failed: ${results.failed}`,
  );
  return results;
}

// Clean up existing duplicate cache entries on startup
async function cleanupExistingDuplicates() {
  try {
    // Get all cache entries and find duplicates manually
    const { data: allEntries, error } = await supabase
      .from("context_cache")
      .select("cache_key, user_id");

    if (error) {
      console.error("❌ [CACHE] Error finding duplicates:", error);
      return;
    }

    if (!allEntries || allEntries.length === 0) {
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
      (key) => duplicates[key].length > 1,
    );

    if (duplicateKeys.length > 0) {
      console.log(
        `🧹 [CACHE] Found ${duplicateKeys.length} cache keys with duplicates`,
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
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          )
        ) {
          await cleanupDuplicateCacheEntries(cacheKey, userId);
        } else {
          logWarn(`⚠️ [CACHE] Skipping cleanup for invalid userId: ${userId}`);
        }
      }

      console.log("✅ [CACHE] Existing duplicates cleaned up");
    } else {
      console.log("✅ [CACHE] No existing duplicates found");
    }
  } catch (error) {
    console.error("❌ [CACHE] Error cleaning up existing duplicates:", error);
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
// Helper function to extract base packs summary for logging
// Handles both camelCase (processSummaryData) and snake_case (raw/cached variants)
function extractBasePacksSummary(packs) {
  if (!packs || typeof packs !== "object") return null;

  // Support both packs.base and packs.summary_min (legacy/alternate pack keys)
  const base = packs.base || packs.summary_min;
  const otherPacksAvailable = Object.keys(packs).filter(
    (key) => key !== "base" && key !== "summary_min",
  );

  // When we have packs but no base (e.g. stock-only flow), still log what we had
  if (!base || typeof base !== "object") {
    return otherPacksAvailable.length > 0
      ? { base: null, otherPacksAvailable }
      : null;
  }

  const summary = {
    // Financial summary (camelCase + snake_case fallbacks)
    netWorth: base.netWorth ?? base.net_worth ?? null,
    liquidAssets: base.liquidAssets ?? base.liquid_assets ?? null,
    investmentsTotal: base.investmentsTotal ?? base.investments_total ?? null,
    totalLiabilities: base.totalLiabilities ?? base.total_liabilities ?? null,

    // Account counts and types
    accountsCount: Array.isArray(base.accounts) ? base.accounts.length : 0,
    accountTypes: Array.isArray(base.accounts)
      ? [...new Set(base.accounts.map((acc) => acc?.type).filter(Boolean))]
      : [],

    // Transaction data
    recentTransactionsCount: Array.isArray(base.recentTransactions)
      ? base.recentTransactions.length
      : 0,

    // Spending data
    spendByCategoryCount: Array.isArray(base.spendByCategory)
      ? base.spendByCategory.length
      : 0,
    spendByCategoryCurrentMonthCount: Array.isArray(
      base.spendByCategoryCurrentMonth,
    )
      ? base.spendByCategoryCurrentMonth.length
      : 0,
    spendByCategoryLastMonthCount: Array.isArray(base.spendByCategoryLastMonth)
      ? base.spendByCategoryLastMonth.length
      : 0,

    // Budget data
    hasBudget: !!base.budget,

    // Other packs available
    otherPacksAvailable,
  };

  return summary;
}

async function logConversation(conversationData) {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Insert with metrics and request_id if columns exist; fallback otherwise
      const baseRow = {
        user_id: conversationData.user_id,
        chat_id: conversationData.chat_id || null,
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
        base_packs: conversationData.base_packs || null,
        classification_details:
          conversationData.classification_result ||
          conversationData.classification_details ||
          null,
        prompt_used: conversationData.prompt_used || null,
      };

      const insertResult = await withTimeout(
        supabase.from("conversation_logs").insert([baseRow]),
        5000, // 5 second timeout
      );

      if (!insertResult) {
        throw new Error("Insert timed out");
      }

      const { error } = insertResult;

      if (error) {
        const msg = (error?.message || "").toLowerCase();
        const missingCols =
          msg.includes("column") &&
          (msg.includes("metrics") ||
            msg.includes("request_id") ||
            msg.includes("chat_id") ||
            msg.includes("base_packs") ||
            msg.includes("classification_details") ||
            msg.includes("prompt_used"));
        if (missingCols) {
          logWarn(
            `⚠️ [CONVERSATION_LOG] Insert failed (missing columns: ${error.message}). ` +
              `Falling back to insert WITHOUT base_packs/prompt_used. ` +
              `Ensure migrations add_base_packs_to_conversation_logs.sql and 20260212190000_add_prompt_used_to_conversation_logs.sql are applied.`,
          );
          const {
            metrics,
            request_id,
            chat_id,
            base_packs,
            classification_details,
            prompt_used,
            ...fallbackRow
          } = baseRow;
          const retry = await withTimeout(
            supabase.from("conversation_logs").insert([fallbackRow]),
            5000,
          );
          if (!retry) {
            throw new Error("Fallback insert timed out");
          }
          if (retry.error) {
            throw new Error(`Fallback insert failed: ${retry.error.message}`);
          } else {
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
            error.message,
          );
          return;
        }
      } else {
        return; // Success
      }
    } catch (error) {
      logError(
        `❌ [CONVERSATION_LOG] Attempt ${attempt}/${maxRetries} failed:`,
        error.message,
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

async function ensureChatSessionRecord(userId, chatId, firstMessage) {
  if (!userId || !chatId || !firstMessage) {
    return;
  }

  try {
    const insertResult = await withTimeout(
      supabase.from("chat_sessions").upsert(
        {
          id: chatId,
          user_id: userId,
          session_title: String(firstMessage).trim().slice(0, 60) || "Chat",
          first_message: String(firstMessage),
          messages: [
            {
              id: `user-${Date.now()}`,
              sender: "user",
              text: String(firstMessage),
              timestamp: Date.now(),
            },
          ],
        },
        {
          onConflict: "id",
          ignoreDuplicates: true,
        },
      ),
      5000,
      null,
    );

    if (!insertResult?.error) {
      return;
    }

    logWarn("⚠️ [CHAT_SESSION] Placeholder upsert failed:", insertResult.error);
  } catch (error) {
    logWarn("⚠️ [CHAT_SESSION] Could not ensure placeholder chat session:", error);
  }
}

// Initialize cache cleanup on server start
initializeCacheCleanup();

export default async function handler(req, res) {
  // Initialize timing tracker for entire request
  const requestStartTime = Date.now();
  const timings = {
    auth_ms: 0,
    context_loading_ms: 0,
    memory_loading_ms: 0,
    profile_loading_ms: 0,
    classification_ms: 0,
    web_search_ms: 0,
    context_packs_ms: 0,
    handler_ms: 0,
    llm_ms: 0,
    total_ms: 0,
  };

  // Parse body if raw (some platforms pass string/buffer)
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      logError("❌ [FINNY] Failed to parse body:", e?.message);
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Missing or invalid request body" });
  }

  const {
    action,
    message,
    context,
    classification: bodyClassification,
    chat_id: bodyChatId,
    ...otherParams
  } = body;

  // For prebuild_context, we'll check if all contexts are cached after we have userId
  // and suppress logs if they are. For now, we'll log normally and check later.
  let shouldSuppressLogs = false;

  // Try to check early if we have userId in context (for prebuild_context silent mode)
  if (action === "prebuild_context" && context?.user_id) {
    try {
      shouldSuppressLogs = await areAllContextsCached(context.user_id);
    } catch (error) {
      // If check fails, continue with normal logging
    }
  }

  if (!shouldSuppressLogs) {
    logInfo("🤖 [FINNY] Request received:", req.method);
  }

  if (req.method !== "POST") {
    logWarn("❌ [FINNY] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check if client wants streaming response
  const wantsStreaming = body.stream === true;

  if (!shouldSuppressLogs) {
    logInfo("📝 [FINNY] Action:", action);
    // Avoid logging full message/context to reduce PII exposure
    logInfo("📊 [FINNY] Context provided:", context ? "Yes" : "No");
  }

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  // Derive user from Supabase JWT instead of trusting client context
  let serverUserId = null;
  let userProfile = { name: null, age: null, monthly_income: null };
  const requestId = generateRequestId();
  const authStartTime = Date.now();
  let hadAuthHeader = false;
  try {
    const authHeader =
      req.headers["authorization"] || req.headers["Authorization"];
    hadAuthHeader =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ");
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;
    if (token) {
      const { data: authData, error: authError } =
        await supabase.auth.getUser(token);
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
              const metaMonthlyIncome = Number(meta.monthly_income);
              userProfile.monthly_income = Number.isFinite(metaMonthlyIncome)
                ? metaMonthlyIncome
                : null;
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
  timings.auth_ms = Date.now() - authStartTime;

  // Build safe context that overrides any client-provided user_id
  // But fall back to client-provided user_id if no JWT token is present (for testing)
  const finalUserId = serverUserId || context?.user_id;
  const chatIdRaw = bodyChatId ?? body.chat_id ?? context?.chat_id ?? null;
  const chatId = chatIdRaw || null;
  if (!chatIdRaw && !shouldSuppressLogs) {
    logWarn(`⚠️ [FINNY] chat_id missing for action=${action}`);
  }

  // Re-check with finalUserId (more secure) - always use server-verified userId when available
  if (action === "prebuild_context" && finalUserId) {
    try {
      shouldSuppressLogs = await areAllContextsCached(finalUserId);
    } catch (error) {
      // If check fails, continue with normal logging
    }
  }

  if (
    (hadAuthHeader && !serverUserId) ||
    (!hadAuthHeader && !finalUserId && action !== "classify")
  ) {
    const authMessage = "Please log in to continue.";
    if (wantsStreaming) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      });
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }
      sendStreamEvent(
        res,
        "complete",
        buildStreamFallbackResponse(authMessage),
      );
      res.end();
      return;
    }

    res.status(401).json({ message: authMessage });
    return;
  }

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
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }
  }

  // Conversation context removed.
  timings.context_loading_ms = 0;

  let sessionState = getSessionState(finalUserId);
  let effectiveClassification = bodyClassification;
  let finalAction = action;
  let safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    chat_id: chatId,
    profile: {
      name: userProfile.name,
      age: userProfile.age,
      occupation: null,
      monthly_income: userProfile.monthly_income,
      finny_style: "conversational",
      intent_context: "",
    },
    session: sessionState,
    memory: { memories: [], totalCount: 0 },
    feedbackPatterns: {
      preferences: [],
      patterns: {},
      deepInsights: [],
    },
  };

  // === FLOW STATE CHECK: Bypass classification for active goal flows ===
  const activeGoalFlow = sessionState?.goal_flow || context?.goal_flow || null;
  if (
    (action === "classify" || action === "message") &&
    activeGoalFlow &&
    activeGoalFlow.active
  ) {
    console.log(
      `🎯 [FLOW] Active goal flow detected - bypassing classification`,
    );
    finalAction = "goal_conversation";
  } else if (action === "message") {
    try {
      const classifyStartTime = Date.now();
      effectiveClassification = await handleClassify(message, safeContext);
      timings.classification_ms = Date.now() - classifyStartTime;

      if (
        effectiveClassification &&
        effectiveClassification.hasOwnProperty("heuristic") &&
        (effectiveClassification.heuristic === true ||
          effectiveClassification.heuristic === "true" ||
          effectiveClassification.heuristic === 1)
      ) {
        const key = generateClassificationCacheKey(message);
        classificationCache.delete(key);
        effectiveClassification = await handleClassify(message, safeContext);
      }

      const classifiedIntent = effectiveClassification?.intent;
      if (classifiedIntent === "stock_query") {
        finalAction = "stock_query";
      } else if (classifiedIntent === "off_topic") {
        finalAction = "off_topic";
      } else if (
        classifiedIntent === "goal_conversation" ||
        classifiedIntent === "goal"
      ) {
        finalAction = "goal_conversation";
      } else {
        finalAction = "ask";
      }
    } catch (error) {
      logError("❌ [FINNY] Message classification failed, defaulting to ask:", error);
      finalAction = "ask";
    }
  }

  // Load user profile, memory, and feedback patterns only when needed
  // OPTIMIZED: Only load for "ask" action (not needed for classify or prebuild_context)
  let userMemory = { memories: [], totalCount: 0 };
  let userProfileData = {
    name: null,
    age: null,
    occupation: null,
    monthly_income: null,
    finny_style: "conversational",
    intent_context: "",
  };
  let feedbackPatterns = {
    preferences: [],
    patterns: {},
    deepInsights: [],
  };

  // Only load memory and profile data for ask-like actions
  if (finalAction === "ask" || finalAction === "stock_query") {
    // OPTIMIZED: Load memory, profile, and feedback patterns in parallel for better performance
    const prepStartTime = Date.now();

    // Prepare memory loading promise (with cache check)
    const memoryPromise = (async () => {
      if (message) {
        // Check cache first
        const cachedMemory = getCachedMemory(finalUserId, message);
        if (cachedMemory) {
          logInfo(
            `⚡ [MEMORY_CACHE] Using cached memories for message: "${message.substring(
              0,
              50,
            )}..."`,
          );
          return cachedMemory;
        } else {
          // Load from Supermemory with 5s timeout (non-blocking) and cache the result
          const loadedMemory = await loadUserMemoryWithTimeout(
            finalUserId,
            message,
            MEMORY_LOAD_TIMEOUT_MS,
          );
          // Always cache the result (even if empty) to avoid repeated API calls for same query
          // loadUserMemoryWithTimeout always returns { memories: [], totalCount: 0 } on error/timeout, so it's safe
          if (loadedMemory && typeof loadedMemory === "object") {
            setCachedMemory(finalUserId, message, loadedMemory);
          }
          return loadedMemory;
        }
      } else {
        // No message provided, load empty memories (no Supermemory call needed)
        return { memories: [], totalCount: 0 };
      }
    })().catch((error) => {
      logError("❌ [MEMORY] Error loading memory:", error);
      return { memories: [], totalCount: 0 };
    });

    // Prepare profile and feedback loading promises
    const profilePromise = loadUserProfile(finalUserId).catch((error) => {
      logError("❌ [PROFILE] Error loading profile:", error);
      return {
        name: null,
        age: null,
        occupation: null,
        monthly_income: null,
        finny_style: "conversational",
        intent_context: "",
      };
    });

    const feedbackPromise = retrieveFeedbackPatterns(finalUserId, null).catch(
      (error) => {
        logError("❌ [FEEDBACK] Error loading feedback patterns:", error);
        return {
          preferences: [],
          patterns: {},
          deepInsights: [],
        };
      },
    );

    // Execute all three in parallel
    const [loadedMemory, profileData, feedback] = await Promise.all([
      memoryPromise,
      profilePromise,
      feedbackPromise,
    ]);

    userMemory = loadedMemory;
    userProfileData = profileData;
    feedbackPatterns = feedback;

    const prepTime = Date.now() - prepStartTime;
    timings.memory_loading_ms = prepTime; // Combined time for parallel operations
    timings.profile_loading_ms = prepTime; // Combined time for parallel operations
    logInfo(
      `⚡ [PARALLEL_PREP] Loaded memory, profile, and feedback in ${prepTime}ms (parallel)`,
    );
  } else {
    // For classify and prebuild_context: Skip memory and feedback patterns
    // Only load minimal profile if needed (but classification doesn't need user data)
    if (action === "classify") {
      // Classification doesn't need user data - skip profile loading
      timings.memory_loading_ms = 0;
      timings.profile_loading_ms = 0;
    } else {
      // prebuild_context: Skip everything
      timings.memory_loading_ms = 0;
      timings.profile_loading_ms = 0;
    }
  }

  // Merge profile data with existing userProfile (from auth metadata)
  // IMPORTANT: Profiles table is source of truth for age (user_metadata.age may be outdated)
  const enrichedProfile = {
    name: userProfile.name || userProfileData.name,
    age: userProfileData.age || userProfile.age, // Prioritize profiles table over user_metadata
    occupation: userProfileData.occupation,
    monthly_income:
      userProfileData.monthly_income ?? userProfile.monthly_income ?? null,
    finny_style: userProfileData.finny_style,
    intent_context: userProfileData.intent_context,
  };

  // === PROFILE CACHE INVALIDATION ===
  if (action === "invalidate_profile_cache") {
    // Invalidate profile cache for the authenticated user
    invalidateProfileCache(finalUserId);
    console.log(
      `✅ [CACHE] Profile cache invalidated for user: ${finalUserId}`,
    );
    return res.status(200).json({ success: true });
  }

  // === CHAT SESSION CHECK: Clear session state if new chat session ===
  const lastChatId = sessionState?.last_chat_id;
  const shouldPrePopulateCache =
    !!chatId &&
    (!lastChatId || (typeof lastChatId === "string" && lastChatId !== chatId));
  if (lastChatId && chatId && lastChatId !== chatId) {
    console.log(
      `🆕 [SESSION] New chat detected (old: ${lastChatId}, new: ${chatId}) - clearing session state`,
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

  // Keep chat start-up optimization by pre-populating the cache ONCE per chat.
  if (shouldPrePopulateCache) {
    logDebug(
      "🚀 [CACHE] Pre-populating cache for new chat session (conversation context disabled)",
    );
    setImmediate(() => {
      prePopulateUserCache(finalUserId).catch((error) => {
        logError("❌ [CACHE] Pre-population failed:", error);
      });
    });
  }

  // Log age source for debugging
  if (
    userProfile.age &&
    userProfileData.age &&
    userProfile.age !== userProfileData.age
  ) {
    logWarn(
      `⚠️ [PROFILE] Age mismatch: user_metadata.age=${userProfile.age}, profiles.age=${userProfileData.age} (using profiles.age)`,
    );
  }

  safeContext = {
    ...(context || {}),
    user_id: finalUserId,
    chat_id: chatId,
    profile: enrichedProfile,
    session: sessionState,
    memory: userMemory,
    feedbackPatterns: feedbackPatterns,
  };

  if (action === "message" && finalUserId && chatId && message) {
    setImmediate(() => {
      ensureChatSessionRecord(finalUserId, chatId, message);
    });
  }

  try {
    let response;
    const handlerStartTime = Date.now();

    switch (finalAction) {
      case "classify": {
        const classifyStartTime = Date.now();
        response = await handleClassify(message, safeContext);
        timings.classification_ms = Date.now() - classifyStartTime;

        // CRITICAL FINAL CHECK: Never return heuristic results
        if (
          response &&
          response.hasOwnProperty("heuristic") &&
          (response.heuristic === true ||
            response.heuristic === "true" ||
            response.heuristic === 1)
        ) {
          console.log(
            "🚨 [FINNY] CRITICAL: Response has heuristic flag! Blocking return and forcing fresh LLM classification.",
          );
          console.log(
            "🚨 [FINNY] Response was:",
            JSON.stringify(response, null, 2),
          );

          // Clear cache for this specific message to force fresh classification
          const key = generateClassificationCacheKey(message);
          classificationCache.delete(key);
          // Cleared cache for message, forcing fresh LLM call

          // Call handleClassify again - it will now bypass cache and call LLM
          response = await handleClassify(message, safeContext);

          // Final check on new response
          if (
            response &&
            response.hasOwnProperty("heuristic") &&
            response.heuristic
          ) {
            console.log(
              "🚨 [FINNY] CRITICAL ERROR: LLM returned heuristic! This should never happen. Removing flag.",
            );
            delete response.heuristic;
          }
        }
        break;
      }
      case "ask": {
        const askIntent =
          effectiveClassification?.intent === "stock_query"
            ? "stock_query"
            : "ask_personalized";
        response = await handleAsk(
          message,
          safeContext,
          askIntent,
          effectiveClassification,
          timings, // Pass timings object to track web search and context packs
          wantsStreaming, // Pass streaming preference
          wantsStreaming ? res : null, // Pass response object for progress updates if streaming
        );
        break;
      }
      case "stock_query": {
        response = await handleAsk(
          message,
          safeContext,
          "stock_query",
          effectiveClassification,
          timings, // Pass timings object to track web search and context packs
          wantsStreaming, // Pass streaming preference
          wantsStreaming ? res : null, // Pass response object for progress updates if streaming
        );
        break;
      }
      case "off_topic": {
        // Pass classification result to off-topic handler for logging
        const offTopicContext = {
          ...safeContext,
          classification_result: effectiveClassification,
        };
        response = await handleOffTopic(
          message,
          offTopicContext,
          wantsStreaming, // Pass streaming preference
          wantsStreaming ? res : null, // Pass response object for progress updates if streaming
        );
        break;
      }
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
              message,
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
              false,
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
          try {
            response = await handleGoalConversation(message, safeContext);
          } catch (goalError) {
            logError("❌ [GOAL] Goal conversation failed:", goalError);
            response = {
              message:
                "Sorry — I hit an issue while updating your goal. Please try again.",
              type: "assistant",
              intent: "goal_conversation",
              hideActions: true,
              goal_flow: { active: false },
            };
          }
        }

        if (!responseHasVisibleContent(response)) {
          response = {
            message:
              "Sorry — I didn't get a full reply for your goal. Please try again.",
            type: "assistant",
            intent: "goal_conversation",
            hideActions: true,
            goal_flow: { active: false },
          };
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
      case "stock_conversation": {
        const stockFlow = sessionState?.stock_flow;

        if (message === "confirm_stock") {
          if (!stockFlow?.ticker) {
            response = {
              message:
                "I couldn't find a ticker to analyze. Please tell me which stock you want.",
              type: "assistant",
            };
            break;
          }

          const stockContext = {
            ...safeContext,
            skip_stock_confirmation: true,
            stock_override: { ticker: stockFlow.ticker },
          };

          try {
            response = await handleAsk(
              stockFlow.original_message || `${stockFlow.ticker} stock`,
              stockContext,
              "ask_personalized",
              null,
              timings,
              wantsStreaming,
              wantsStreaming ? res : null, // Pass response object for progress updates if streaming
            );

            // Hide action buttons and show feedback buttons after confirmation
            // Ensure response is an object before modifying
            console.log(
              `🔍 [CONFIRM_STOCK] Response received from handleAsk:`,
              typeof response,
              response?.hideActions,
              response?.hideFeedback,
            );

            if (response && typeof response === "object") {
              // Force set these properties to ensure buttons are hidden
              response.hideActions = true; // Hide action buttons (Yes/Change Ticker)
              response.hideFeedback = false; // Show feedback buttons (thumbs up/down) for final analysis
              response.actions = []; // Clear any actions

              console.log(
                `✅ [CONFIRM_STOCK] Response flags set - hideActions: ${response.hideActions}, hideFeedback: ${response.hideFeedback}`,
              );
            } else {
              // If response is not an object, wrap it
              response = {
                message: response || "Stock analysis completed",
                type: "assistant",
                hideActions: true,
                hideFeedback: false,
                actions: [],
              };
              console.log(
                `✅ [CONFIRM_STOCK] Wrapped response with flags - hideActions: ${response.hideActions}, hideFeedback: ${response.hideFeedback}`,
              );
            }

            // Only clear state AFTER successful completion
            mergeSessionState(finalUserId, { stock_flow: null });
          } catch (error) {
            logError("❌ [STOCK] Error during stock analysis:", error);
            // Keep stock_flow state so user can retry
            response = {
              message:
                "Something went wrong analyzing the stock. Please try again.",
              type: "assistant",
              stock_candidate: { ticker: stockFlow.ticker },
              hideFeedback: true, // Hide feedback buttons for error messages
              actions: [
                {
                  label: "Retry",
                  action: "confirm_stock",
                  style: "primary",
                },
                {
                  label: "Change Ticker",
                  action: "change_stock",
                  style: "secondary",
                },
              ],
            };
          }
          break;
        }

        if (message === "update_stock_ticker") {
          const rawTicker = otherParams?.ticker || otherParams?.stock_ticker;
          if (!rawTicker || typeof rawTicker !== "string") {
            response = {
              message: "Please provide a valid ticker symbol.",
              type: "assistant",
              intent: "ask_personalized",
            };
            break;
          }
          const updatedTicker = rawTicker.toUpperCase().trim().slice(0, 5);

          if (!/^[A-Z]{1,5}$/.test(updatedTicker)) {
            response = {
              message:
                "That doesn't look like a valid ticker. Please enter 1-5 letters.",
              type: "assistant",
              intent: "ask_personalized",
              actions: [
                {
                  label: "Change Ticker",
                  action: "change_stock",
                  style: "secondary",
                },
              ],
            };
            break;
          }

          const updatedFlow = {
            active: true,
            ticker: updatedTicker,
            original_message: stockFlow?.original_message || null,
            stage: "awaiting_confirmation",
            entities: [updatedTicker],
            source: "manual",
          };

          mergeSessionState(finalUserId, { stock_flow: updatedFlow });

          // Improved confirmation message with ticker displayed
          const tickerDisplay = updatedTicker;
          const confirmationMessage = `I found **${tickerDisplay}**. Would you like me to analyze this stock?`;

          const updateResponse = {
            message: confirmationMessage,
            type: "assistant",
            intent: "ask_personalized",
            stock_candidate: { ticker: updatedTicker },
            hideFeedback: true, // Hide feedback buttons for confirmation messages
            hideActions: false, // Show action buttons initially
            actions: [
              {
                label: "Yes",
                action: "confirm_stock",
                style: "primary",
              },
              {
                label: "Change Ticker",
                action: "change_stock",
                style: "secondary",
              },
            ],
          };

          response = updateResponse;
          break;
        }

        response = {
          message:
            "I can analyze a specific stock if you share a ticker symbol.",
          type: "assistant",
        };
        break;
      }
      case "prebuild_context":
        // Set flag to suppress memory storage warnings during prebuild_context
        setPrebuildContextActive(finalUserId);
        try {
          response = await handlePrebuildContext(
            finalUserId,
            shouldSuppressLogs,
          );
        } finally {
          // Always clear the flag, even if there's an error
          clearPrebuildContextActive(finalUserId);
        }
        break;
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    timings.handler_ms = Date.now() - handlerStartTime;

    // Calculate total time until streaming starts
    timings.total_ms = Date.now() - requestStartTime;

    // Log all timings in seconds
    const formatTime = (ms) => (ms / 1000).toFixed(3);

    // Consolidated timing log (suppress if all contexts cached for prebuild_context)
    if (!shouldSuppressLogs) {
      console.log(`\n⏱️  [TIMING] Total: ${formatTime(timings.total_ms)}s`);
      console.log(
        `   └─ Handler: ${formatTime(timings.handler_ms)}s | LLM: ${formatTime(
          timings.llm_ms || 0,
        )}s | Memory: ${formatTime(
          timings.memory_loading_ms,
        )}s | Profile: ${formatTime(timings.profile_loading_ms)}s`,
      );
    }

    // Detailed breakdown only in debug mode
    logDebug("⏱️  [TIMING] Detailed breakdown:");
    logDebug(
      `   Auth: ${formatTime(timings.auth_ms)}s | Context: ${formatTime(
        timings.context_loading_ms,
      )}s`,
    );
    if (timings.classification_ms > 0) {
      logDebug(`   Classification: ${formatTime(timings.classification_ms)}s`);
    }
    if (timings.web_search_ms > 0) {
      logDebug(`   Web Search: ${formatTime(timings.web_search_ms)}s`);
    }
    if (timings.context_packs_ms > 0) {
      logDebug(`   Context Packs: ${formatTime(timings.context_packs_ms)}s`);
    }

    response = normalizeResponseEnvelope(response);

    // Handle streaming vs regular response
    if (wantsStreaming) {
      console.log("🔄 [STREAMING] Starting streaming response");

      const streamWatchdog = startStreamWatchdog(res, {
        timeoutMs: 30000,
        pingMs: 8000,
      });
      let streamCompleted = false;

      try {
        // Send progress events first
        sendStreamEvent(res, "progress", {
          status: "Processing your request...",
        });

        // Extract the text to stream from the response
        // For streaming, response.message is always a string (no backend splitting)
        let textToStream = null;
        if (typeof response.message === "string") {
          textToStream = response.message;
        } else if (typeof response.text === "string") {
          textToStream = response.text;
        } else {
          // Fallback: handle array (shouldn't happen for streaming, but just in case)
          textToStream = Array.isArray(response.message)
            ? response.message.map((m) => m.content || m).join("\n\n")
            : String(response.message || "");
        }

        if (textToStream) {
          const streamingStartTime = Date.now();
          const timeToFirstChunk = streamingStartTime - requestStartTime;
          console.log(
            `🔄 [STREAMING] Starting stream (${(
              timeToFirstChunk / 1000
            ).toFixed(3)}s to first chunk)`,
          );
          console.log(
            "🔄 [STREAMING] Streaming text:",
            textToStream.substring(0, 100) + "...",
          );
          sendStreamEvent(res, "progress", {
            status: "Generating response...",
          });
          await streamTextChunks(res, textToStream);
        } else {
          console.log(
            "⚠️ [STREAMING] No text to stream in response:",
            Object.keys(response),
          );
        }

        // Send final complete response
        sendStreamEvent(res, "complete", response);
        streamCompleted = true;
        res.end();
        console.log("✅ [STREAMING] Streaming completed");

        // Memory storage will be triggered by res.once('finish') handler set earlier
      } catch (streamError) {
        logError("❌ [STREAMING] Stream error:", streamError);
        if (!res.writableEnded) {
          sendStreamEvent(
            res,
            "complete",
            buildStreamFallbackResponse(
              "Sorry — something went wrong while streaming. Please try again.",
            ),
          );
          res.end();
        }
      } finally {
        if (streamWatchdog) clearInterval(streamWatchdog);
        if (!streamCompleted && !res.writableEnded) {
          sendStreamEvent(res, "complete", buildStreamFallbackResponse());
          res.end();
        }
      }
    } else {
      res.status(200).json(response);
    }
    if (!shouldSuppressLogs) {
      console.log("🔍 [FINNY] Response:", response);
    }
  } catch (error) {
    console.error("❌ [FINNY] Error:", error);
    if (wantsStreaming && res && !res.writableEnded) {
      sendStreamEvent(
        res,
        "complete",
        buildStreamFallbackResponse(
          "Sorry — something went wrong. Please try again.",
        ),
      );
      res.end();
      return;
    }
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
      "🔍 [ENHANCE] Detected personal investment query, fetching user holdings...",
    );

    // Fetch user's investment holdings
    const { data: holdings, error } =
      await dataFetchService.getInvestmentHoldingsDetailed(
        context.user_id,
        3000,
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
        (h) => `${h.symbol} ($${h.market_value?.toFixed(2) || "0"})`,
      ),
    );

    // Create multiple targeted search queries
    const searchQueries = topHoldings.map(
      (holding) => `${holding.symbol} latest news`,
    );

    console.log(
      `🔍 [ENHANCE] Generated ${searchQueries.length} targeted queries:`,
      searchQueries,
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
  requestTimings = null, // Optional: parent request timings object
  wantsStreaming = false, // Whether client wants streaming response
  res = null, // Response object for sending progress updates (optional)
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
    const resolvedChatId = context?.chat_id || null;

    const recordConversationTurns = (assistantText) => {
      if (!userId || !resolvedChatId) return;
      if (!assistantText) return;
      try {
        appendConversationTurns(userId, resolvedChatId, message, assistantText);
      } catch (e) {
        // Non-fatal; never break the ask flow for history.
        logDebug("⚠️ [HISTORY] Failed to record turns:", e?.message);
      }
    };

    if (!userId) {
      logWarn("❌ [FINNY] No user_id provided in context");
      return {
        message: cleanResponseFormatting(
          "I need to know who you are to provide personalized advice. Please try again.",
        ),
        type: "assistant",
      };
    }

    // 2) NEW: Use classification-based pack selection (Phase 2)
    logDebug("🎯 [FINNY] Using classification-based pack selection");

    // Get classification result if not already available
    if (!classificationResult) {
      const cachedClassification = getCachedClassification(message);
      if (cachedClassification) {
        console.log("✅ [FINNY] Retrieved classification from cache");
        classificationResult = cachedClassification;
      }
    }

    // Select data packs from classification (with keyword fallback)
    const packSelection =
      contextPlanningService.selectDataPacksFromClassification(
        classificationResult,
        message,
      );

    // Extract keyword-based slots for backward compatibility
    const keywordSlots = contextPlanningService.extractSlots(message);
    const normalizedClassificationPeriod = normalizePeriodFilter(
      packSelection.filters.period,
      classificationResult?.data_requirements?.time_range || "current",
    );

    // Classification filters ALWAYS override keyword-based slots
    const slots = {
      ...keywordSlots, // Keep for backward compat
      merchant: packSelection.filters.merchant || keywordSlots.merchant,
      category: packSelection.filters.category || keywordSlots.category,
      period: normalizedClassificationPeriod || keywordSlots.period,
      useMerchantRPC: packSelection.useMerchantRPC, // Flag for merchant RPC usage
      time_range: classificationResult?.data_requirements?.time_range || null, // Store time_range for default period creation
    };

    const needs = packSelection.needs;

    logInfo(
      "🎯 [SLOTS] Final slots (classification overrides keyword):",
      JSON.stringify(slots, null, 2),
    );
    logInfo("🎯 [FINNY] Selected needs from classification:", needs);

    // 2.1) Check if web search is needed
    let webResults = [];
    let webSummary = "";

    // Use passed classification result, or retrieve from cache, or fallback to keyword detection
    if (!classificationResult) {
      // Try to retrieve from cache
      const cachedClassification = getCachedClassification(message);
      if (cachedClassification) {
        console.log("✅ [FINNY] Retrieved classification from cache");
        classificationResult = cachedClassification;
      } else {
        console.log(
          "⚠️ [FINNY] No classification result passed and not in cache, using keyword fallback",
        );
      }
    }

    // Backward-compatible defaults for new classification fields
    if (
      classificationResult &&
      classificationResult.needs_clarification === undefined
    ) {
      classificationResult.needs_clarification = false;
    }
    if (
      classificationResult &&
      !Array.isArray(classificationResult.missing_fields)
    ) {
      classificationResult.missing_fields = [];
    }
    if (classificationResult && !classificationResult.info_sufficiency) {
      classificationResult.info_sufficiency = "unknown";
    }
    if (classificationResult && !classificationResult.decision_risk) {
      classificationResult.decision_risk = "unknown";
    }
    // Backward compatibility: Add data_requirements if missing (Phase 1)
    if (
      classificationResult &&
      classificationResult.needs_user_data === true &&
      !classificationResult.data_requirements
    ) {
      console.log(
        "⚠️ [FINNY] Classification result missing data_requirements, adding default",
      );
      classificationResult.data_requirements = {
        required_packs: ["summary_min"],
        optional_packs: [],
        filters: {},
        granularity: "summary_level",
        time_range: "current",
      };
    } else if (
      classificationResult &&
      classificationResult.needs_user_data === false
    ) {
      classificationResult.data_requirements = null;
    }

    const userRefused = detectRefusalToAnswer(message);
    const ambiguousIntent = detectAmbiguousIntent(message);

    // Note: Clarification is now handled by the LLM based on prompt engine guidelines
    // The classification info (needs_clarification, missing_fields) is passed to the LLM
    // via the classificationHeader in the prompt, allowing it to make context-aware decisions

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
            symbols,
          );

          const searchPromises = enhancedData.queries.map((query) =>
            limitedBraveSearch(query),
          );
          const searchResults = await Promise.all(searchPromises);

          // Combine and deduplicate results
          webResults = searchResults
            .flat()
            .filter(
              (result, index, self) =>
                index === self.findIndex((r) => r.url === result.url),
            );

          logInfo(
            `✅ [FINNY] Combined ${searchResults.length} searches into ${webResults.length} unique results`,
          );

          // Add user prompt to context for AI response
          if (enhancedData.userPrompt) {
            context.userPrompt = enhancedData.userPrompt;
            logDebug(
              "🔍 [FINNY] Added user prompt to context:",
              enhancedData.userPrompt,
            );
          }
        } else {
          // Fallback to original message
          webResults = await limitedBraveSearch(message);
        }

        timings.web_ms = Date.now() - webStartTime;
        // Update parent timings if provided
        if (requestTimings) {
          requestTimings.web_search_ms = timings.web_ms;
        }

        if (webResults.length > 0) {
          webSummary = webResults
            .map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n${r.snippet}`)
            .join("\n\n");

          console.log(
            `✅ [FINNY] Web search completed: ${webResults.length} results`,
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
    const contextPacksStartTime = Date.now();

    // Send progress update for data loading
    if (wantsStreaming && res && !res.writableEnded) {
      sendStreamEvent(res, "progress", { status: "Loading your accounts..." });
    }

    const { packs, gaps, contextHeader } = await buildContextPacks(
      userId,
      needs,
      slots,
    );
    const contextPacksTime = Date.now() - contextPacksStartTime;

    // Send progress update after data is loaded
    if (wantsStreaming && res && !res.writableEnded) {
      sendStreamEvent(res, "progress", {
        status: "Let me cook...",
      });
    }
    // Update parent timings if provided
    if (requestTimings) {
      requestTimings.context_packs_ms = contextPacksTime;
    }

    logInfo("📦 [FINNY] Context packs built:", Object.keys(packs));
    logInfo("⚠️ [FINNY] Data gaps:", gaps);

    classificationResult = normalizeClassificationFromContext(
      classificationResult,
      packs,
      context?.profile,
    );

    // Decision risk and info sufficiency are used for runtime coaching flags
    // passed to the LLM (not for early returns - LLM handles all clarifications)
    let decisionRisk = classificationResult?.decision_risk || "unknown";
    const infoSufficiency = classificationResult?.info_sufficiency || "unknown";

    const runtimeContract = determineResponseContract(
      message,
      classificationResult,
    );
    const amountMentioned = extractMentionedAmount(message);
    const hasLiquidContext = Number.isFinite(Number(packs?.base?.liquidAssets));
    if (
      runtimeContract === "affordability_decision" &&
      decisionRisk === "high" &&
      Number.isFinite(amountMentioned) &&
      hasLiquidContext
    ) {
      decisionRisk = "medium";
      if (classificationResult) classificationResult.decision_risk = "medium";
      logInfo(
        "🧭 [RISK] Downgraded affordability decision_risk high->medium (amount + liquid context available)",
      );
    }

    const insufficiencyState = buildInsufficiencyState(
      message,
      classificationResult,
      packs,
      context?.profile,
    );
    const hasCriticalGaps =
      insufficiencyState.missing_numeric_inputs.length > 0 ||
      insufficiencyState.missing_decision_context.length > 0;
    const shouldHardClarify = decisionRisk === "high" && hasCriticalGaps;

    if (shouldHardClarify) {
      return buildHighRiskClarificationResponse(
        insufficiencyState,
        classificationResult,
        message,
      );
    }

    // Ambiguous-intent clarification flag: passed to LLM via runtime coaching flags
    // The LLM will decide whether to ask clarification questions based on context
    const shouldClarifyAmbiguity =
      ambiguousIntent &&
      !userRefused &&
      classificationResult?.intent !== "stock_query" &&
      (decisionRisk === "high" ||
        decisionRisk === "medium" ||
        infoSufficiency === "unknown");

    // Log what user data is being fed to finny
    if (packs.base) {
      const baseData = packs.base;
      const netWorth = baseData.netWorth || 0;
      const liquidAssets = baseData.liquidAssets || 0;
      const investmentsTotal = baseData.investmentsTotal || 0;
      const totalLiabilities = baseData.totalLiabilities || 0;
      const accountsCount = Array.isArray(baseData.accounts)
        ? baseData.accounts.length
        : 0;
      const investmentAccounts = Array.isArray(baseData.accounts)
        ? baseData.accounts.filter((acc) => acc.type === "investment").length
        : 0;
      logInfo(
        `📊 [USER_DATA] Summary data: netWorth=$${netWorth.toFixed(
          2,
        )}, liquidAssets=$${liquidAssets.toFixed(
          2,
        )}, investmentsTotal=$${investmentsTotal.toFixed(
          2,
        )}, liabilities=$${totalLiabilities.toFixed(
          2,
        )}, accounts=${accountsCount} (${investmentAccounts} investment)`,
      );
      if (Array.isArray(baseData.accounts) && baseData.accounts.length > 0) {
        const accountSummary = baseData.accounts
          .map(
            (acc) =>
              `${acc.name || acc.account_id}: $${(
                acc.current_balance ||
                acc.balance ||
                0
              ).toFixed(2)} (${acc.type}/${acc.subtype || "N/A"})`,
          )
          .join(" | ");
        logInfo(`📊 [USER_DATA] Accounts: ${accountSummary}`);
      }
    }

    // Check for stock candidate - rely solely on classification
    let stockCandidate = null;
    if (
      classificationResult?.intent === "stock_query" &&
      classificationResult?.ticker
    ) {
      // Validate and normalize ticker from classification
      const ticker = String(classificationResult.ticker).toUpperCase().trim();

      // Validate ticker format (1-5 uppercase letters)
      if (/^[A-Z]{1,5}$/.test(ticker)) {
        // Use classification result if it detected a stock query with ticker
        stockCandidate = {
          ticker: ticker,
          entities: classificationResult.entities || [ticker],
          confidence: classificationResult.confidence || 0.9,
          source: "classification",
        };
        logDebug(
          "🔍 [STOCK] Using stock candidate from classification:",
          stockCandidate,
        );
      } else {
        logWarn(
          `⚠️ [STOCK] Invalid ticker format from classification: ${ticker}, skipping stock candidate`,
        );
      }
    }

    // Show confirmation prompt if we found a stock candidate and confirmation is not skipped
    if (stockCandidate && !context?.skip_stock_confirmation) {
      // Defensive check for ticker
      if (!stockCandidate.ticker) {
        logError("❌ [STOCK] stockCandidate missing ticker:", stockCandidate);
        // Fall through to regular stock query handling
      } else {
        const stockFlow = {
          active: true,
          ticker: stockCandidate.ticker,
          original_message: message,
          stage: "awaiting_confirmation",
          entities: stockCandidate.entities || [],
          source: stockCandidate.source || null,
        };
        mergeSessionState(userId, { stock_flow: stockFlow });

        // Improved confirmation message with ticker displayed
        const tickerDisplay = stockCandidate.ticker;
        const confirmationMessage = `Okay! Just wanted to confirm, you want me to analyze **${tickerDisplay}**?`;

        const confirmationResponse = {
          message: confirmationMessage,
          type: "assistant",
          intent: "ask_personalized",
          stock_candidate: { ticker: stockCandidate.ticker },
          hideFeedback: true, // Hide feedback buttons for confirmation messages - NEVER show thumbs
          hideActions: false, // Show action buttons initially, frontend will hide on click
          actions: [
            {
              label: "Yes",
              action: "confirm_stock",
              style: "primary",
            },
            {
              label: "Change Ticker",
              action: "change_stock",
              style: "secondary",
            },
          ],
        };

        return confirmationResponse;
      }
    }

    // 3.5) Check if this is a stock query after building context packs
    // Also check if we have stock_override (user confirmed ticker) - that's definitely a stock query!
    const hasStockOverride = !!context?.stock_override?.ticker;
    const isStockQuery =
      looksLikeStockQuery(message, classificationResult) || hasStockOverride;
    logDebug("🔍 [STOCK_ROUTING] Stock query detection:", {
      message,
      looksLikeStockQuery: looksLikeStockQuery(message, classificationResult),
      hasStockOverride,
      isStockQuery,
    });

    if (isStockQuery) {
      try {
        // Use the built context packs for stock queries
        logDebug("🔍 [STOCK] Using built context packs for stock analysis");
        logDebug("🔍 [STOCK] Available packs:", Object.keys(packs));

        // Get user context for personalization
        // Use cached memory from context if available, otherwise load with 5s timeout (non-blocking)
        const userMemory =
          context.memory ||
          (await loadUserMemoryWithTimeout(
            userId,
            message || null,
            MEMORY_LOAD_TIMEOUT_MS,
          ));
        const userProfile = context.profile || { name: null, age: null };

        // Get investment holdings from context packs if available
        const investmentHoldings =
          packs[NEED_CONFIG.invest_holdings.packKey] ||
          (await getCachedUserData(
            NEED_CONFIG.invest_holdings.cacheType,
            userId,
          ));

        let stockData = null;
        let stockPlan = null;
        const stockOverride = context?.stock_override?.ticker || null;

        // Deep query ALWAYS runs for stock queries (even with stockOverride)
        // stockOverride just provides the ticker, but we still want comprehensive analysis
        const willUseDeepQuery = looksLikeStockDeepQuery(message);
        const willUseOverride = !!stockOverride && !willUseDeepQuery;
        logDebug("🔍 [STOCK_ROUTING] Analysis path:", {
          stockOverride,
          willUseDeepQuery,
          willUseOverride,
        });

        // Deep analysis is default for all stock queries - ALWAYS run deep query for comprehensive analysis
        if (looksLikeStockDeepQuery(message)) {
          logDebug("🔍 [STOCK] Deep query detected, using advanced analysis");

          // Send initial progress message
          sendStockProgress(res, "🔍 Analyzing stock data...", wantsStreaming);

          // Show finance fact while planning
          if (wantsStreaming && res) {
            setTimeout(() => {
              sendStockProgress(res, getRandomFinanceFact(), wantsStreaming);
            }, 500);
          }

          // If we have stockOverride (user confirmed ticker), skip planning and create plan directly
          // This avoids unnecessary API calls and prevents hangs
          if (stockOverride) {
            console.log(
              `🔵 [STOCK] Skipping planStockRequest - using stockOverride ticker: ${stockOverride}`,
            );
            // Create a comprehensive plan with all available data types
            stockPlan = {
              ticker_candidates: [stockOverride],
              company_candidates: [],
              wants: [
                "price",
                "market_cap",
                "pe",
                "ps",
                "analyst_targets",
                "news",
                "earnings",
                "filings",
              ], // Comprehensive set of data to fetch
              horizon: null,
              needs_web: false,
            };
            console.log(
              `🔵 [STOCK] Created plan directly with ticker: ${stockOverride}`,
            );
          } else {
            // Only call planStockRequest if we don't have a confirmed ticker
            console.log(
              `🔵 [STOCK] No stockOverride, calling planStockRequest to determine ticker`,
            );
            stockPlan = await planStockRequest(message);
            logDebug("🔍 [STOCK] Stock plan result:", stockPlan);
          }

          sendStockProgress(res, "📊 Fetching market data...", wantsStreaming);
          const exec = await executeStockPlan(
            stockPlan || {},
            message,
            res,
            wantsStreaming,
          );
          logDebug("🔍 [STOCK] Execute result:", exec);

          // 🔍 DIAGNOSTIC: Log why the check might fail
          if (exec.error) {
            console.log(
              `⚠️ [STOCK] executeStockPlan returned error:`,
              exec.error,
            );
          } else if (!exec.data) {
            console.log(`⚠️ [STOCK] executeStockPlan has no data field`);
          } else if (exec.data.current == null) {
            const reason = exec.data._usingPrevCloseFallback
              ? "Using prevClose fallback (market may be closed)"
              : "Current price is null/undefined (no prevClose available)";
            console.log(
              `⚠️ [STOCK] executeStockPlan data.current is null/undefined:`,
              {
                hasData: !!exec.data,
                current: exec.data.current,
                currentType: typeof exec.data.current,
                prevClose: exec.data.prevClose,
                usingPrevCloseFallback:
                  exec.data._usingPrevCloseFallback || false,
                hasProfile: !!exec.data.profile,
                hasMetrics: !!exec.data.metrics,
                hasRecommendations: !!exec.data.recommendations,
                ticker: exec.ticker,
                reason: reason,
              },
            );
          }

          if (!exec.error && exec.data?.current != null) {
            // Flatten the structure: exec has { ticker, data: {...}, extra }
            // but buildStockDataSummary expects { ticker, current, profile, ... }
            stockData = {
              ...exec.data, // Spread all the snapshot data (current, profile, metrics, etc.)
              ticker: exec.ticker, // Ensure ticker is at top level
              planWants: exec.planWants, // Preserve plan wants for summary
              extra: exec.extra, // Preserve extra data (earnings, filings, etc.)
            };
            const priceSource = exec.data._usingPrevCloseFallback
              ? "prevClose (market closed)"
              : "current";
            console.log(
              `✅ [STOCK] Using stockData from executeStockPlan (price: ${exec.data.current}, source: ${priceSource})`,
            );
          } else {
            const reason = exec.error
              ? `Error: ${exec.error}`
              : !exec.data
                ? "No data field"
                : exec.data.current == null
                  ? "Current price is null (market may be closed or data unavailable)"
                  : "Unknown reason";
            console.log(
              `🔄 [STOCK] Stock plan check failed (${reason}), falling back to simple query or fallback`,
            );
          }
        } else if (stockOverride && !looksLikeStockDeepQuery(message)) {
          // Only use fast path if we have stockOverride AND it's not a deep query
          // Deep queries should always use the planning path above
          console.log(
            `\n🟢 [STOCK] STOCK OVERRIDE PATH (simple query): Fetching directly (ticker: ${stockOverride})`,
          );
          logDebug(
            "🔍 [STOCK] Using stockOverride, skipping planStockRequest for faster response",
          );
          const snapshot =
            await stockAnalysisService.fetchStockSnapshot(stockOverride);
          if (snapshot && !snapshot.error && snapshot.current != null) {
            stockData = {
              ...snapshot,
              ticker: stockOverride,
            };
            console.log(
              `✅ [STOCK] Using stockData from stockOverride (price: ${snapshot.current})`,
            );
            console.log(
              `📊 [STOCK] Snapshot summary: price=$${
                snapshot.current
              }, hasProfile=${!!snapshot.profile}, hasMetrics=${!!snapshot.metrics}, recsCount=${
                snapshot.recommendations?.length || 0
              }, newsCount=${snapshot.news?.length || 0}`,
            );
          } else {
            console.log(
              `⚠️ [STOCK] Stock snapshot failed for override ticker ${stockOverride}, will try simple query path`,
            );
          }
        } else {
          // Simple stock query
          console.log(
            `\n🟡 [STOCK] SIMPLE QUERY PATH: Using cached data with fallback`,
          );
          const stockResponse = await getCachedDataWithFallback(
            "stock_snapshot",
            stockOverride
              ? `override:${stockOverride}`
              : message.toLowerCase().trim(),
            async () => {
              if (stockOverride) {
                const snapshot =
                  await stockAnalysisService.fetchStockSnapshot(stockOverride);
                return {
                  ...snapshot,
                  ticker: stockOverride,
                  queryUsed: stockOverride,
                };
              }
              const { ticker, queryUsed } =
                await stockAnalysisService.resolveTickerForQuery(message);
              if (!ticker) {
                return {
                  error: "Could not resolve ticker from query",
                  queryUsed,
                };
              }
              const snapshot =
                await stockAnalysisService.fetchStockSnapshot(ticker);
              return { ...snapshot, ticker, queryUsed };
            },
            false,
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

            // Conversation context removed.
          }

          // Generate conversational stock response with context packs
          sendStockProgress(
            res,
            "🤖 Generating comprehensive analysis...",
            wantsStreaming,
          );
          // Show another finance fact while generating analysis
          if (wantsStreaming && res) {
            setTimeout(() => {
              sendStockProgress(res, getRandomFinanceFact(), wantsStreaming);
            }, 1000);
          }

          const conversationalResponse =
            await generateConversationalStockResponse(
              stockData,
              message,
              userProfile,
              userMemory,
              investmentHoldings,
              stockPlan,
            );

          // Ensure comprehensive analysis was generated (not just summary)
          const isComprehensiveAnalysis =
            conversationalResponse && conversationalResponse.length > 1000;
          if (!isComprehensiveAnalysis) {
            console.warn(
              `⚠️ [STOCK] Response appears to be summary (${
                conversationalResponse?.length || 0
              } chars), not comprehensive analysis`,
            );
          }

          const response = {
            message: cleanResponseFormatting(conversationalResponse),
            type: "assistant",
            hideActions: true, // Always hide action buttons for final stock analysis
            hideFeedback: false, // Show feedback buttons for final analysis
            actions: [], // Ensure no actions are present
            _comprehensiveAnalysis: isComprehensiveAnalysis, // Internal flag for debugging
          };

          // Log in background (non-blocking)
          setImmediate(() =>
            logConversation({
              user_message: redactPII(message),
              finny_response: redactPII(conversationalResponse),
              timestamp: new Date().toISOString(),
              user_id: context?.user_id || "unknown",
              chat_id: context?.chat_id || null,
              intent: "ask_personalized",
              entities: [stockData.ticker, stockData.profile?.name].filter(
                Boolean,
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
              base_packs: extractBasePacksSummary(packs),
              classification_details: classificationResult || null,
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
                model: PRIMARY_OPENROUTER_MODEL || STANDARD_MODEL,
                cache_hits: {},
                tokens: null,
                result: "success",
              },
            }).catch((err) =>
              console.error(
                "❌ [CONVERSATION_LOG] Background log failed:",
                err?.message,
              ),
            ),
          );

          // Store conversation memory AFTER response is sent (non-blocking)
          if (userId && conversationalResponse) {
            recordConversationTurns(conversationalResponse);

            const storeMemoryAfterResponse = () => {
              storeConversationMemory(userId, message, conversationalResponse, {
                intent: "ask_personalized",
                userName: context?.profile?.name || null,
                chat_id: context?.chat_id,
                stock_ticker: stockData.ticker,
              }).catch((error) => {
                console.error(
                  "❌ [FINNY] Failed to store stock conversation memory:",
                  error,
                );
                // Non-fatal, don't break conversation flow
              });
            };

            // For streaming: store after res.end(), for non-streaming: store after response sent
            if (wantsStreaming && res) {
              res.once("finish", storeMemoryAfterResponse);
            } else {
              setImmediate(storeMemoryAfterResponse);
            }
          }

          return response;
        } else {
          // Stock APIs failed or returned incomplete data, use fallback analysis
          const fallbackReason = stockData
            ? "Stock data exists but current price is null (market may be closed)"
            : "Stock APIs failed or returned no data";
          console.log(
            `🔄 [FALLBACK] ${fallbackReason}, using fallback analysis`,
          );
          const fallbackResponse = await generateFallbackStockAnalysis(
            stockOverride,
            message,
            userProfile,
            userMemory,
          );

          const response = {
            message: cleanResponseFormatting(fallbackResponse),
            type: "assistant",
          };

          // Log in background (non-blocking)
          setImmediate(() =>
            logConversation({
              user_message: redactPII(message),
              finny_response: redactPII(fallbackResponse),
              timestamp: new Date().toISOString(),
              user_id: context?.user_id || "unknown",
              chat_id: context?.chat_id || null,
              intent: "ask_personalized",
              entities: [],
              confidence: 0.7,
              response_time_ms: Date.now() - startTime,
              sources_used: ["fallback_analysis"],
              cached: false,
              request_id: generateRequestId(),
              base_packs: extractBasePacksSummary(packs),
              classification_details: classificationResult || null,
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
              },
              fallback_used: true,
            }).catch((err) =>
              console.error(
                "❌ [CONVERSATION_LOG] Background log failed:",
                err?.message,
              ),
            ),
          );

          // Store conversation memory AFTER response is sent (non-blocking)
          if (userId && fallbackResponse) {
            recordConversationTurns(fallbackResponse);

            const storeMemoryAfterResponse = () => {
              storeConversationMemory(userId, message, fallbackResponse, {
                intent: "ask_personalized",
                userName: context?.profile?.name || null,
                chat_id: context?.chat_id,
                fallback_used: true,
              }).catch((error) => {
                console.error(
                  "❌ [FINNY] Failed to store fallback conversation memory:",
                  error,
                );
                // Non-fatal, don't break conversation flow
              });
            };

            // For streaming: store after res.end(), for non-streaming: store after response sent
            if (wantsStreaming && res) {
              res.once("finish", storeMemoryAfterResponse);
            } else {
              setImmediate(storeMemoryAfterResponse);
            }
          }

          return response;
        }
      } catch (e) {
        console.log(
          "ℹ️ [FINNY] Conversational stock handler failed, falling back:",
          e?.message,
        );
      }
    }

    // 4) Detect user state for context-aware prompting

    const financialDataForState = {
      base: packs.base,
      spend:
        packs.spend ||
        ((Array.isArray(packs.base?.spendByCategoryCurrentMonth) &&
          packs.base.spendByCategoryCurrentMonth.length > 0) ||
        (Array.isArray(packs.base?.spendByCategoryLastMonth) &&
          packs.base.spendByCategoryLastMonth.length > 0) ||
        (Array.isArray(packs.base?.spendByCategory) &&
          packs.base.spendByCategory.length > 0)
          ? { source: "summary_min" }
          : null),
      invest: packs.invest, // Investment holdings
      goals: packs.goals, // Financial goals
      profileMonthlyIncome: context?.profile?.monthly_income || null,
      categoryDetails: packs.categoryDetails, // Category transaction details for analysis
      transactions: packs.base?.recentTransactions || [],
      accounts: packs.base?.accounts || packs.accounts || [], // Include accounts for credit utilization detection
      emptyMerchantQueries: packs.emptyMerchantQueries || [], // Empty merchant query results (explicitly queried but returned zero transactions)
    };

    logInfo(`🔍 [FINANCIAL_DATA] Building financialDataForState:`, {
      hasBase: !!packs.base,
      hasSpend: !!financialDataForState.spend,
      hasCategoryDetails: !!packs.categoryDetails,
      categoryDetailsTransactionCount:
        packs.categoryDetails?.transactions?.length || 0,
    });
    const userState = detectUserState(
      message,
      financialDataForState,
      classificationResult,
    );

    // Consolidated user state log with better formatting
    console.log(`\n🎯 [USER_STATE] Detected:`);
    console.log(
      `   └─ Emotional: ${
        userState.emotionalState
      } (confidence: ${userState.confidence.emotional.toFixed(2)}) | Urgency: ${
        userState.urgency
      }`,
    );
    if (classificationResult) {
      const classificationConfidence = Number.isFinite(
        Number(classificationResult.confidence),
      )
        ? Number(classificationResult.confidence).toFixed(2)
        : "n/a";
      console.log(
        `   └─ Classification: ${classificationResult.intent} (${
          classificationResult.intent_type || "none"
        }) | Confidence: ${classificationConfidence}`,
      );
    }
    if (userState.needs.length > 0) {
      console.log(`   └─ Needs: [${userState.needs.join(", ")}]`);
    }

    // 5) Build context-aware prompt using new prompt engine
    // Pass finny_style directly to prompt engine (now handled early in prompt)
    const finnyStyle = context.profile?.finny_style || null;

    // Build feedback context if available (for prompt engine)
    let feedbackContext = null;
    if (context.feedbackPatterns) {
      feedbackContext = buildFeedbackContext(context.feedbackPatterns);
      if (feedbackContext) {
        const { preferences, deepInsights } = context.feedbackPatterns;
        // Single consolidated log with visual formatting
        const prefList =
          preferences.length > 0
            ? preferences.map((pref, idx) => `${idx + 1}. ${pref}`).join(" | ")
            : "none";
        console.log(
          `\n📋 [ADAPTATION] Feedback Context Added: ${preferences.length} preferences, ${deepInsights.length} deep insights | ${prefList}`,
        );
      }
    }

    // Add feedback context to context object for prompt engine
    const contextWithFeedback = {
      ...context,
      feedbackContext,
    };

    // Build complete prompt using 6-layer architecture
    // Prompt engine now handles: web context, feedback patterns, memories, intent context, user prompt
    const shouldOfferCoachFollowUp =
      !userRefused &&
      (decisionRisk === "high" ||
        decisionRisk === "medium" ||
        infoSufficiency === "unknown") &&
      deterministicChance(
        `${userId}:${context?.chat_id || ""}:${message}`,
        0.5,
      );
    const responseContract = runtimeContract;
    const responseContractHeader = buildResponseContractInstructions(
      responseContract,
      {
        message,
        classificationResult,
        packs,
        profile: context?.profile || {},
      },
    );

    const coachingRuntimeFlags = [
      `COACHING_FLAGS:`,
      `- ambiguous_intent_detected: ${ambiguousIntent}`,
      `- clarify_one_question_only: ${shouldClarifyAmbiguity}`,
      `- offer_single_followup_question: ${shouldOfferCoachFollowUp}`,
      `- user_refused_to_answer: ${userRefused}`,
      `- decision_risk: ${decisionRisk}`,
      `- info_sufficiency: ${infoSufficiency}`,
      `- response_contract: ${responseContract}`,
      `- missing_numeric_inputs: [${insufficiencyState.missing_numeric_inputs.join(", ")}]`,
      `- missing_decision_context: [${insufficiencyState.missing_decision_context.join(", ")}]`,
    ].join("\n");

    const classificationHeader = classificationResult
      ? `CLASSIFICATION:\n- needs_clarification: ${
          classificationResult.needs_clarification
        }\n- info_sufficiency: ${
          classificationResult.info_sufficiency
        }\n- decision_risk: ${
          classificationResult.decision_risk
        }\n- missing_fields: ${JSON.stringify(
          classificationResult.missing_fields || [],
        )}`
      : null;

    const runtimeHeader = [
      contextHeader,
      classificationHeader,
      responseContractHeader,
      coachingRuntimeFlags,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Short-term conversation continuity: include recent turns (no extra LLM calls)
    // Now uses database for persistence across serverless instances
    const recentTurns = await getRecentConversationTurns(
      userId,
      resolvedChatId,
      {
        maxMessages: 8,
        maxChars: 6000,
      },
    );

    // Debug logging for recent turns
    if (!resolvedChatId) {
      console.log("⚠️ [RECENT_TURNS] chat_id is missing:", {
        userId,
        chat_id: resolvedChatId,
        hasContext: !!context,
      });
    } else if (recentTurns.length === 0) {
      console.log("⚠️ [RECENT_TURNS] No recent turns found:", {
        userId,
        chat_id: resolvedChatId,
        cacheKey: `${userId}:${resolvedChatId}`,
      });
    } else {
      console.log(`✅ [RECENT_TURNS] Found ${recentTurns.length} recent turns`);
    }

    // Build complete prompt using 6-layer architecture (with recent turns)
    const systemBuild = buildContextAwarePromptDetailed(
      message,
      contextWithFeedback,
      financialDataForState,
      userState,
      finnyStyle,
      classificationResult, // Pass classification result for intent-first architecture
      webSummary, // Web context
      runtimeHeader, // Context header (+ classification)
      recentTurns, // Recent conversation turns for context
    );

    const system = systemBuild.system;

    // 5) Parallel processing: Main response + Memory extraction
    const llmT0 = Date.now();

    // Build user message (financial data is already synthesized in the system prompt)
    const userMessage = message;

    // Log prompt summary
    const promptSize = Math.round(system.length / 100) / 10;
    logInfo(`📝 [PROMPT] Ready (system: ${promptSize}k chars)`);

    // Memory extraction removed - migrating to Supermemory
    let memoryExtraction = [];

    async function callMainLLM(model, options = {}) {
      const messages = buildMainAskMessages({
        system,
        recentTurns,
        userMessage,
      });
      const modelTemperature =
        responseContract === "factual_lookup" ? 0.2 : 0.35;

      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            "Content-Type": "application/json",
          },
          signal: options.signal,
          body: JSON.stringify({
            model,
            temperature: modelTemperature,
            max_tokens: 6000,
            stream: false,
            reasoning: { effort: "minimal", exclude: true }, // Disable reasoning output, only return actual response
            messages,
          }),
        },
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`OpenRouter error ${resp.status}: ${errorText}`);
      }
      return resp;
    }

    // For ask_personalized: Use reasoning model (meta-llama/llama-4-scout) as primary, STANDARD_MODEL as fallback
    const fastFirstContracts = new Set([
      "factual_lookup",
      "affordability_decision",
    ]);
    const llmModels = fastFirstContracts.has(responseContract)
      ? [
          STANDARD_MODEL,
          REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout",
          TERTIARY_MODEL,
        ]
      : [
          REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout",
          STANDARD_MODEL,
          TERTIARY_MODEL,
        ];

    let resp;
    let usedModel = llmModels[0];
    try {
      const llmResult = await llmService.callWithFallback(
        llmModels,
        callMainLLM,
        20000,
        "LLM",
      );
      resp = llmResult.result;
      usedModel = llmResult.model;
    } catch (llmError) {
      logError("❌ [FINNY] All LLM attempts failed:", llmError?.message);
      return {
        message: cleanResponseFormatting(
          "Sorry — I'm having trouble reaching the model right now. Please try again.",
        ),
        type: "assistant",
        hideActions: true,
      };
    }

    // Memory extraction removed - migrating to Supermemory for memory management
    memoryExtraction = [];

    // Measure LLM response time (single measurement, not duplicated)
    timings.llm_ms = Date.now() - llmT0;
    // Update parent timings if provided
    if (requestTimings) {
      requestTimings.llm_ms = timings.llm_ms;
    }
    toolsUsed.push({
      name: "llm",
      latency_ms: timings.llm_ms,
      cache_hit: false,
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      logError("❌ [FINNY] OpenRouter API error:", resp.status);
      logError("❌ [FINNY] Error response:", errorText);
      try {
        const errorData = JSON.parse(errorText);
        logError(
          "❌ [FINNY] Parsed error:",
          JSON.stringify(errorData, null, 2),
        );
      } catch (e) {
        logError("❌ [FINNY] Could not parse error response");
      }
      return {
        message: cleanResponseFormatting("I'm glitching right now—try again."),
        type: "assistant",
      };
    }

    const data = await resp.json();
    logInfo("✅ [LLM] Response received (status:", resp.status + ")");

    // Extract response content
    const responseMessage = data.choices?.[0]?.message || {};
    const finishReason = data.choices?.[0]?.finish_reason;
    const usage = data.usage || {};

    // Check if response was cut off due to token limits
    if (finishReason === "length" && !responseMessage.content) {
      logWarn("⚠️ [LLM] Response cut off due to token limit!");
      logWarn("⚠️ [LLM] Token usage:", {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        reasoning_tokens: usage.reasoning_tokens,
        max_tokens: 12000,
      });
      logWarn("⚠️ [LLM] Model may be using reasoning tokens despite exclusion");
    }

    let cleanText =
      responseMessage.content || "I'm not sure yet. Ask me again?";

    logInfo("📝 [LLM] Response length:", cleanText?.length || 0, "chars");
    if (usage.reasoning_tokens) {
      logInfo("🧠 [LLM] Reasoning tokens used:", usage.reasoning_tokens);
    }

    if (cleanText === "I'm not sure yet. Ask me again?") {
      logWarn("⚠️ [LLM] Using fallback response!");
      if (finishReason === "length") {
        logWarn(
          "⚠️ [LLM] Response was cut off - consider using a non-reasoning model or increasing max_tokens further",
        );
      }
    }

    // Deterministic arithmetic override for "besides/excluding <category> this month"
    // to prevent LLM math drift on category totals.
    const deterministicSpendAnswer = buildDeterministicCategoryExclusionAnswer(
      message,
      packs.base || {},
    );
    if (deterministicSpendAnswer) {
      logInfo(
        "🧮 [ARITHMETIC] Using deterministic category-exclusion spend answer",
      );
      cleanText = deterministicSpendAnswer;
    }

    let contractIssueCount = 0;
    if (responseContract === "affordability_decision") {
      const contractIssuesBeforeRepair = detectAffordabilityContractIssues(
        message,
        cleanText,
      );
      contractIssueCount = [
        contractIssuesBeforeRepair.asksForPrice,
        contractIssuesBeforeRepair.asksUserToAssessImpact,
        contractIssuesBeforeRepair.asksUserToCheckSavings,
        contractIssuesBeforeRepair.hedgesKnownDebt,
        contractIssuesBeforeRepair.tooManyQuestions,
      ].filter(Boolean).length;

      const repaired = applyLightAffordabilityRepair(
        message,
        cleanText,
        packs,
        context?.profile || {},
      );
      if (repaired && repaired !== cleanText) {
        logInfo("🧭 [CONTRACT] Applied light affordability repair");
        cleanText = repaired;
      }
    }

    // Memory saving will happen after topic detection (see below)

    // Basic response validation (log warnings, don't block)
    const validationIssues = [];
    if (contractIssueCount > 0) {
      validationIssues.push(
        `Contract issues detected (affordability): ${contractIssueCount}`,
      );
    }

    // Check 1: Intent fulfillment (basic check)
    if (classificationResult?.intent) {
      const intentKeywords = {
        ask_personalized: ["you", "your", "spend", "account", "goal", "invest"],
        goal_conversation: ["goal", "save", "target", "create"],
        off_topic: [], // Off-topic handled separately
      };
      const keywords = intentKeywords[classificationResult.intent] || [];
      const responseLower = cleanText.toLowerCase();
      const hasIntentKeywords =
        keywords.length === 0 ||
        keywords.some((k) => responseLower.includes(k));

      if (!hasIntentKeywords && classificationResult.confidence > 0.8) {
        validationIssues.push(
          `Low intent match for ${classificationResult.intent}`,
        );
      }
    }

    // Check 2: Response length (too short might be incomplete)
    if (cleanText.length < 50 && classificationResult?.intent !== "off_topic") {
      validationIssues.push("Response too short (<50 chars)");
    }

    // Check 3: Crisis mode compliance (if crisis detected)
    if (
      userState.emotionalState === "panicked" &&
      userState.confidence.emotional > 0.8
    ) {
      const hasLongTermTerms = /retirement|invest|long.term|future|years/.test(
        cleanText.toLowerCase(),
      );
      if (hasLongTermTerms) {
        validationIssues.push(
          "Crisis mode: Response mentions long-term planning (should be immediate only)",
        );
      }
    }

    // Log validation results
    if (validationIssues.length > 0) {
      logWarn("⚠️ [VALIDATION] Response validation issues:");
      validationIssues.forEach((issue, idx) => {
        logWarn(`   ${idx + 1}. ${issue}`);
      });
    } else {
      logInfo("✅ [VALIDATION] Response passed basic validation checks");
    }

    // Clean any markdown formatting from the response
    const cleanedMessage = cleanResponseFormatting(cleanText);

    // Frontend handles all message splitting with sophisticated algorithm
    // Backend always sends full message string - frontend splits intelligently
    // This ensures consistent behavior between streaming and non-streaming modes
    const response = {
      message: cleanedMessage,
      type: "assistant",
    };

    // Build prompt_used: FULL prompt sent to LLM (system with financial context, recent turns, user message)
    // system = buildContextAwarePrompt output (6-layer architecture: identity, situation, strategy, etc.)
    const promptUsed = JSON.stringify([
      { role: "system", content: system },
      ...recentTurns,
      { role: "user", content: userMessage },
    ]);

    // Log the conversation
    // Bug fix: Log cleanedMessage (actual response sent to user) instead of cleanText (raw LLM output)
    const conversationData = {
      user_message: redactPII(message),
      finny_response: redactPII(cleanedMessage),
      timestamp: new Date().toISOString(),
      user_id: context?.user_id || "unknown",
      chat_id: context?.chat_id || null,
      intent: classificationResult?.intent || "ask_personalized",
      entities: [],
      confidence: classificationResult?.confidence || 1.0,
      response_time_ms: Date.now() - startTime,
      sources_used:
        webResults.length > 0 ? [...toolsUsed, "brave-search"] : toolsUsed,
      cached: false,
      context_packs: Object.keys(packs),
      data_gaps: gaps,
      request_id: generateRequestId(),
      web_research: webResults.length > 0,
      classification_result: classificationResult,
      classification_details: classificationResult, // Alias for clarity
      validation_issues: validationIssues.length > 0 ? validationIssues : null,
      base_packs: extractBasePacksSummary(packs),
      prompt_used: promptUsed,
      metrics: {
        intent: "ask_personalized",
        latency_ms: {
          total: Date.now() - startTime,
          llm: timings.llm_ms,
          data_fetch: timings.summary_ms + timings.user_data_ms,
          web_search: timings.web_ms,
        },
        tools_used: toolsUsed,
        model: usedModel,
        cache_hits: {},
        tokens: null,
        result: gaps.length > 0 ? "degraded" : "success",
      },
    };

    // Log conversation in background - MUST NOT block or affect latency
    setImmediate(() => {
      logConversation(conversationData).catch((err) =>
        console.error(
          "❌ [CONVERSATION_LOG] Background log failed:",
          err?.message,
        ),
      );
    });

    // Store conversation memory AFTER response is sent (non-blocking)
    // Use cleanedMessage (actual response text) instead of cleanText (raw LLM output)
    const responseTextForStorage =
      cleanedMessage ||
      cleanText ||
      (Array.isArray(response.message)
        ? response.message.map((m) => m.content || m).join("\n\n")
        : response.message || "");

    if (userId && responseTextForStorage) {
      recordConversationTurns(responseTextForStorage);

      // Store memory after response is sent (for both streaming and non-streaming)
      const storeMemoryAfterResponse = () => {
        storeConversationMemory(userId, message, responseTextForStorage, {
          intent: intent,
          chat_id: context?.chat_id,
          userName: context?.profile?.name || null,
        }).catch((error) => {
          console.error(
            "❌ [FINNY] Failed to store conversation memory:",
            error,
          );
          // Non-fatal, don't break conversation flow
        });
      };

      // For streaming: store after res.end(), for non-streaming: store after response sent
      if (wantsStreaming && res) {
        // Will be called after res.end() in streaming handler
        res.once("finish", storeMemoryAfterResponse);
      } else {
        // For non-streaming, use setImmediate to ensure response is sent first
        setImmediate(storeMemoryAfterResponse);
      }
    }

    // Update handler time in parent timings if provided
    if (requestTimings) {
      requestTimings.handler_ms = Date.now() - startTime;
    }

    return response;
  } catch (error) {
    console.error("❌ [FINNY] Ask handler error:", error);
    // Update handler time even on error
    if (requestTimings) {
      requestTimings.handler_ms = Date.now() - startTime;
    }
    return {
      message: cleanResponseFormatting(
        "I'm having some technical difficulties right now. Please try again in a moment.",
      ),
      type: "assistant",
    };
  }
}

// Normalize response envelopes that wrap the actual message under `answer`
function normalizeResponseEnvelope(response) {
  if (!response || typeof response !== "object") return response;
  const answer = response.answer;
  if (!answer || typeof answer !== "object") return response;

  const normalized = { ...response };

  if (normalized.message == null && answer.message != null) {
    normalized.message = answer.message;
  }
  if (normalized.text == null && answer.text != null) {
    normalized.text = answer.text;
  }
  if (normalized.type == null && answer.type != null) {
    normalized.type = answer.type;
  }
  // isSplit flag removed - frontend handles all splitting
  if (normalized.actions == null && answer.actions != null) {
    normalized.actions = answer.actions;
  }
  if (
    normalized.hideFeedback === undefined &&
    answer.hideFeedback !== undefined
  ) {
    normalized.hideFeedback = answer.hideFeedback;
  }
  if (
    normalized.hideActions === undefined &&
    answer.hideActions !== undefined
  ) {
    normalized.hideActions = answer.hideActions;
  }
  if (normalized.stock_candidate == null && answer.stock_candidate != null) {
    normalized.stock_candidate = answer.stock_candidate;
  }
  if (normalized.stockCandidate == null && answer.stockCandidate != null) {
    normalized.stockCandidate = answer.stockCandidate;
  }

  return normalized;
}

// === RESPONSE FORMATTING ===
// cleanResponseFormatting now imported from utils/formatting.js

// === MESSAGE SPLITTING ===
// Message splitting is now handled entirely on the frontend using a sophisticated
// algorithm that respects code blocks, list contexts, and sentence boundaries.
// Backend always sends full message strings - frontend splits intelligently.

// === ENHANCED WEB SEARCH DETECTION ===
// Enhanced web search detection patterns
function detectWebSearchNeeded(message) {
  const lowerMessage = message.toLowerCase();
  // Off-topic detection removed - let classification layer handle it

  // Production-optimized web search keywords
  const webKeywords = [
    // Year indicators
    "2025",
    "2024",
    "latest",
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
    "credit card",
    "which credit card",
    "best credit card",
    "credit card should",
    "card should i",
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

    "current rates",
    "latest news",
  ];

  return webKeywords.some((keyword) => lowerMessage.includes(keyword));
}

// Enhanced off-topic detection with confidence scoring

// === CONTEXT PLANNER ===
// Deterministic context planning to fix "sometimes it works" issue

/**
 * Selects data packs from classification result (Phase 2)
 * Maps classification data_requirements to internal needs and filters
 * Returns: { needs: string[], filters: object, useMerchantRPC: boolean }
 */
// selectDataPacksFromClassification moved to service

// planNeeds moved to service

// extractSlots moved to service

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

      // Build cache params based on need type and slots
      let cacheParams = {};
      if (need === "txns_by_category" || need === "category_details") {
        // For category/merchant transactions, include category/merchant and period in cache key
        if (slots?.merchant && slots?.period && slots?.useMerchantRPC) {
          // Merchant query
          cacheParams = {
            merchant: slots.merchant,
            period: slots.period,
          };
        } else if (slots?.category && slots?.period) {
          // Category query
          cacheParams = {
            category: slots.category,
            period: slots.period,
          };
        }
      } else if (need === "spend_total" && slots?.period) {
        // For spend_total, include period in cache key
        cacheParams = { period: slots.period };
      } else if (need === "goals_overview") {
        cacheParams = { limit: 10 };
      } else if (need === "cashflow_monthly") {
        cacheParams = { months: 3 };
      }

      const cachedData = await getCachedUserData(
        cacheType,
        userId,
        cacheParams,
      );
      if (cachedData) {
        logInfo(`✅ [FINNY] Using pre-built context for: ${need}`);
        logDebug(`🔍 [FINNY] Pre-built data for ${need}:`, {
          hasData: !!cachedData,
          dataKeys: Object.keys(cachedData || {}),
          isCached: true,
          cacheParams,
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
          ", ",
        )}]\nDATA_GAPS: []`,
      };
    }

    logInfo(
      `🚀 [FINNY] Building context packs for remaining needs: [${remainingNeeds.join(
        ", ",
      )}]`,
    );

    // OPTIMIZED: Create optimized fetch operations with better batching
    const fetchOperations = await createOptimizedFetchOperations(
      userId,
      remainingNeeds,
      slots,
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
    const results = await Promise.allSettled(
      fetchOperations.map((op) => executeFetchOperation(op)),
    );

    const fetchTime = Date.now() - startTime;
    logInfo(`✅ [FINNY] All fetch operations completed in ${fetchTime}ms`);

    // OPTIMIZED: Process results with better error handling and caching
    const { emptyMerchantQueries } = processFetchResults(
      results,
      fetchOperations,
      packs,
      gaps,
    );
    // Store empty merchant queries in packs for prompt engine access
    if (emptyMerchantQueries && emptyMerchantQueries.length > 0) {
      packs.emptyMerchantQueries = emptyMerchantQueries;
    }
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
      // OPTIMIZED: Use composite RPC function to reduce network round-trips from 3 to 1
      const dateRange = getDateRange(30);
      addOperation("summary_min", {
        key: "summary_min",
        type: "summary_min",
        userId,
        cached: false,
        priority: 1,
        fetchers: [
          {
            name: "summary_min_composite",
            rpc: "get_summary_min_composite",
            params: {
              p_user_id: userId,
              p_limit: 5,
              p_start: dateRange.start,
              p_end: dateRange.end,
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

  // 3. Category/Merchant transactions operation (OPTIMIZED: Combine category_details and txns_by_category)
  // PHASE 2: Support merchant RPC when merchant filter exists
  logInfo(
    `🔍 [CATEGORY_TXNS] Checking if operation needed - category: ${
      slots?.category
    }, merchant: ${slots?.merchant}, period: ${slots?.period ? JSON.stringify(slots.period) : "undefined"}, useMerchantRPC: ${slots?.useMerchantRPC}`,
  );

  // Helper: Create default period if missing (for merchant/category queries without explicit period)
  const createDefaultPeriod = (timeRange) => {
    const now = new Date();
    let startDate, endDate, months;

    switch (timeRange) {
      case "1_month":
        months = 1;
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "3_months":
        months = 3;
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "6_months":
        months = 6;
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "1_year":
        months = 12;
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "current":
      default:
        // Default to last 30 days for "current" or unknown time_range
        months = 1;
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        );
        startDate = new Date(
          thirtyDaysAgo.getFullYear(),
          thirtyDaysAgo.getMonth(),
          1,
        );
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
    }

    return {
      months,
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    };
  };

  const needsCategoryTransactions =
    needs.includes("category_details") || needs.includes("txns_by_category");

  // Check if we need merchant-specific transactions (use merchant RPC)
  // If period is missing but merchant exists, create default period from time_range
  if (needsCategoryTransactions && slots?.useMerchantRPC && slots?.merchant) {
    let period = slots.period;

    // If no period provided, create default based on time_range from slots or default to 30 days
    if (!period) {
      const timeRange = slots.time_range || "current";
      period = createDefaultPeriod(timeRange);
      logInfo(
        `📅 [MERCHANT_TXNS] No period provided, creating default period from time_range '${timeRange}':`,
        period,
      );
    }
    const cacheKey = `merchant_transactions_${slots.merchant}_${period.start}_${period.end}`;
    logInfo(`🔍 [MERCHANT_TXNS] Checking cache with key: ${cacheKey}`);
    const cachedMerchantTxns = await getCachedUserData(
      "category_transactions", // Use same cache type
      userId,
      {
        merchant: slots.merchant,
        period: period,
      },
    );
    logInfo(
      `🔍 [MERCHANT_TXNS] Cache result: ${cachedMerchantTxns ? "HIT" : "MISS"}`,
    );

    if (cachedMerchantTxns) {
      addOperation(cacheKey, {
        key: cacheKey,
        type: "category_transactions", // Same type for processing
        userId,
        merchant: slots.merchant,
        period: period,
        cached: true,
        data: cachedMerchantTxns,
        priority: 2,
        servesNeeds: ["category_details"],
        isMerchantQuery: true,
      });
    } else {
      // Use get_transactions_by_merchant RPC for merchant-specific transaction queries
      const merchantTxnParams = {
        p_user_id: userId,
        p_merchant: slots.merchant,
        p_start: period.start,
        p_end: period.end,
      };
      logInfo(
        `🔍 [MERCHANT_TXNS] Creating RPC call to get_transactions_by_merchant with params:`,
        JSON.stringify(merchantTxnParams, null, 2),
      );
      addOperation(cacheKey, {
        key: cacheKey,
        type: "category_transactions",
        userId,
        merchant: slots.merchant,
        period: period,
        cached: false,
        priority: 2,
        servesNeeds: ["category_details"],
        isMerchantQuery: true,
        fetchers: [
          {
            name: "merchant_transactions",
            rpc: "get_transactions_by_merchant",
            params: merchantTxnParams,
          },
        ],
      });
    }
  }
  // Category transactions (existing logic)
  // If period is missing but category exists, create default period from time_range
  else if (needsCategoryTransactions && slots?.category) {
    let period = slots.period;

    // If no period provided, create default based on time_range from slots or default to 30 days
    if (!period) {
      const timeRange = slots.time_range || "current";
      period = createDefaultPeriod(timeRange);
      logInfo(
        `📅 [CATEGORY_TXNS] No period provided, creating default period from time_range '${timeRange}':`,
        period,
      );
    }

    if (period) {
      const cacheKey = `category_transactions_${slots.category}_${period.start}_${period.end}`;
      logInfo(`🔍 [CATEGORY_TXNS] Checking cache with key: ${cacheKey}`);
      const cachedCategoryTxns = await getCachedUserData(
        "category_transactions",
        userId,
        {
          category: slots.category,
          period: period,
        },
      );
      logInfo(
        `🔍 [CATEGORY_TXNS] Cache result: ${cachedCategoryTxns ? "HIT" : "MISS"}`,
      );

      if (cachedCategoryTxns) {
        // Use cached data for both category_details and txns_by_category needs
        addOperation(cacheKey, {
          key: cacheKey,
          type: "category_transactions",
          userId,
          category: slots.category,
          period: period,
          cached: true,
          data: cachedCategoryTxns,
          priority: 2,
          servesNeeds: ["category_details", "txns_by_category"], // This operation serves both needs
        });
      } else {
        // For multi-month queries, use get_spend_by_category_periods for monthly breakdown
        // For single period queries, use get_transactions_by_category for detailed transactions
        const fetchers = [];

        // Check if this is a multi-month query (use get_spend_by_category_periods for trends)
        const isMultiMonthQuery = period.months && period.months > 1;
        logInfo(
          `🔍 [CATEGORY_TXNS] Is multi-month query: ${isMultiMonthQuery}, months: ${period.months}`,
        );

        if (isMultiMonthQuery) {
          // Add monthly breakdown for multi-month queries
          fetchers.push({
            name: "category_spend_by_periods",
            rpc: "get_spend_by_category_periods",
            params: {
              p_user_id: userId,
              p_months: period.months,
            },
          });
        }

        // Always fetch detailed transactions for the period
        const categoryTxnParams = {
          p_user_id: userId,
          p_category: slots.category,
          p_start: period.start,
          p_end: period.end,
        };
        logInfo(
          `🔍 [CATEGORY_TXNS] Creating RPC call to get_transactions_by_category with params:`,
          JSON.stringify(categoryTxnParams, null, 2),
        );
        fetchers.push({
          name: "category_transactions",
          rpc: "get_transactions_by_category",
          params: categoryTxnParams,
        });

        addOperation(cacheKey, {
          key: cacheKey,
          type: "category_transactions",
          userId,
          category: slots.category,
          period: period,
          cached: false,
          priority: 2,
          servesNeeds: ["category_details", "txns_by_category"],
          fetchers,
        });
      }
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
    logInfo(
      `🔍 [RPC] Executing ${operation.fetchers.length} fetchers for operation: ${operation.key} (type: ${operation.type})`,
    );
    const fetcherPromises = operation.fetchers.map((fetcher) => {
      logInfo(
        `🔍 [RPC] Calling ${fetcher.rpc} with params:`,
        JSON.stringify(fetcher.params, null, 2),
      );
      return withTimeout(supabase.rpc(fetcher.rpc, fetcher.params), 2000, null)
        .then((result) => {
          // Preserve fetcher metadata in result for processing
          return { ...result, name: fetcher.name, rpc: fetcher.rpc };
        })
        .catch((error) => {
          logError(
            `❌ [RPC] ${fetcher.name} (${fetcher.rpc}) fetch failed:`,
            error,
          );
          logError(`❌ [RPC] Error details:`, {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
          });
          return { name: fetcher.name, rpc: fetcher.rpc, data: null, error };
        });
    });

    const results = await Promise.all(fetcherPromises);
    logInfo(
      `🔍 [RPC] All fetchers completed. Results:`,
      results.map((r, idx) => ({
        fetcher: operation.fetchers[idx]?.name,
        rpc: operation.fetchers[idx]?.rpc,
        hasData: !!r?.data,
        dataLength: Array.isArray(r?.data) ? r.data.length : r?.data ? 1 : 0,
        error: r?.error || null,
      })),
    );

    // Process results based on operation type
    logInfo(
      `🔍 [PROCESS] Processing operation ${operation.key} (type: ${operation.type}) with ${results.length} results`,
    );
    const processedData = processOperationData(operation, results);
    logInfo(
      `🔍 [PROCESS] Processed data for ${operation.key}:`,
      processedData
        ? {
            hasData: true,
            keys: Object.keys(processedData),
            dataPreview:
              operation.type === "category_transactions"
                ? {
                    category: processedData.category,
                    transactionCount: Array.isArray(processedData.transactions)
                      ? processedData.transactions.length
                      : 0,
                    period: processedData.period,
                  }
                : "See full data",
          }
        : "NULL - No data processed",
    );

    if (processedData) {
      // Cache the processed data
      await cacheOperationData(operation, processedData);
      return { success: true, data: processedData, cached: false };
    } else {
      logWarn(
        `⚠️ [PROCESS] Operation ${operation.key} returned no valid data. Results were:`,
        results,
      );
      return { success: false, error: "No valid data returned" };
    }
  } catch (error) {
    console.error(`❌ [FINNY] Operation ${operation.key} failed:`, error);
    return { success: false, error: error.message };
  }
}

// OPTIMIZED: Process fetch results with better error handling and caching
function processFetchResults(results, operations, packs, gaps) {
  // Track empty merchant queries explicitly
  const emptyMerchantQueries = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const operation = operations[i];

    if (result.status === "fulfilled" && result.value.success) {
      const { data, cached } = result.value;

      // Process data based on operation type
      switch (operation.type) {
        case "category_transactions":
          // This operation can serve both category_details and txns_by_category
          logInfo(
            `🔍 [PACKS] Setting categoryDetails pack with ${
              data?.transactions?.length || 0
            } transactions`,
          );
          if (operation.servesNeeds?.includes("category_details")) {
            packs.categoryDetails = data;
            logInfo(`✅ [PACKS] categoryDetails set (serves category_details)`);
          }
          if (operation.servesNeeds?.includes("txns_by_category")) {
            // Merge into spend pack for totals, but also keep categoryDetails for analysis
            packs.spend = { ...packs.spend, ...data };
            // Ensure categoryDetails is set for transaction analysis
            if (!packs.categoryDetails) {
              packs.categoryDetails = data;
              logInfo(
                `✅ [PACKS] categoryDetails set (serves txns_by_category)`,
              );
            }
          }
          logInfo(`🔍 [PACKS] Final categoryDetails:`, {
            hasData: !!packs.categoryDetails,
            category: packs.categoryDetails?.category,
            transactionCount: Array.isArray(packs.categoryDetails?.transactions)
              ? packs.categoryDetails.transactions.length
              : 0,
            sampleTransactionNames: Array.isArray(
              packs.categoryDetails?.transactions,
            )
              ? packs.categoryDetails.transactions
                  .slice(0, 3)
                  .map((t) => t.merchant || t.name)
              : [],
          });
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

      // CRITICAL FIX: Track empty merchant queries explicitly
      // When a merchant query returns empty (not an error, just no transactions found),
      // we need to pass this info to the prompt so the LLM can respond appropriately
      if (
        operation.type === "category_transactions" &&
        operation.isMerchantQuery &&
        operation.merchant &&
        operation.period &&
        result.status === "fulfilled" &&
        !result.value.success &&
        result.value?.error === "No valid data returned"
      ) {
        // This is an empty merchant query result (not a system error)
        // The query executed successfully but returned zero transactions
        emptyMerchantQueries.push({
          merchant: operation.merchant,
          period: operation.period,
          periodDisplay: `${operation.period.start} to ${operation.period.end}`,
        });
        logInfo(
          `📝 [EMPTY_MERCHANT] Tracked empty merchant query: ${operation.merchant} (${operation.period.start} to ${operation.period.end})`,
        );
      }

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

  // Return empty merchant queries (will be stored in packs by caller)
  return { packs, gaps, emptyMerchantQueries };
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

// OPTIMIZED: Process summary data from composite RPC call (single JSONB response)
function processSummaryData(results) {
  // Composite function returns single result with all data in JSONB format
  const compositeRes = results[0];

  if (!compositeRes?.data) {
    console.log("⚠️ [SUMMARY_DATA] No data in composite RPC response");
    return null;
  }

  // Handle both old format (array of results) and new format (single JSONB object)
  let compositeData;
  if (
    typeof compositeRes.data === "object" &&
    !Array.isArray(compositeRes.data)
  ) {
    // New composite format: single JSONB object
    compositeData = compositeRes.data;
  } else if (Array.isArray(compositeRes.data) && compositeRes.data.length > 0) {
    // Fallback: if it's an array, take first element (shouldn't happen with composite)
    compositeData = compositeRes.data[0];
  } else {
    console.log("⚠️ [SUMMARY_DATA] Invalid composite RPC response format");
    return null;
  }

  const netWorth = compositeData.net_worth || {};
  const recentTransactions = compositeData.recent_transactions || [];
  const spendByCategory = compositeData.spend_by_category || [];
  // New fields for monthly breakdown (backward compatible - will be empty array if not present)
  const spendByCategoryCurrentMonth =
    compositeData.spend_by_category_current_month || [];
  const spendByCategoryLastMonth =
    compositeData.spend_by_category_last_month || [];
  const budget = compositeData.budget || null;

  // Log raw data for debugging
  const hasNewFields =
    Array.isArray(spendByCategoryCurrentMonth) &&
    spendByCategoryCurrentMonth.length > 0;
  console.log("📊 [SUMMARY_DATA] Raw composite data from RPC:", {
    net_worth: netWorth.net_worth,
    liquid_assets: netWorth.liquid_assets,
    investments_total: netWorth.investments_total,
    total_liabilities: netWorth.total_liabilities,
    bank_accounts_count: netWorth.bank_accounts_count || 0,
    recent_transactions_count: recentTransactions.length,
    spend_categories_count: spendByCategory.length,
    spend_categories_current_month_count: Array.isArray(
      spendByCategoryCurrentMonth,
    )
      ? spendByCategoryCurrentMonth.length
      : 0,
    spend_categories_last_month_count: Array.isArray(spendByCategoryLastMonth)
      ? spendByCategoryLastMonth.length
      : 0,
    has_new_monthly_fields: hasNewFields,
    has_budget: !!budget,
  });

  // Warn if new fields are missing (likely old cache or migration not run)
  if (!hasNewFields && spendByCategory.length > 0) {
    console.log(
      "⚠️ [SUMMARY_DATA] New monthly spending fields are missing! This could mean:",
    );
    console.log("   1. SQL migration hasn't been run yet");
    console.log(
      "   2. Cache contains old data - clear cache or wait for expiration",
    );
    console.log("   3. Database function doesn't have the new fields");
  }

  return {
    netWorth: Number(netWorth.net_worth || 0),
    liquidAssets: Number(netWorth.liquid_assets || 0),
    investmentsTotal: Number(netWorth.investments_total || 0),
    totalLiabilities: Number(netWorth.total_liabilities || 0),
    recentTransactions: Array.isArray(recentTransactions)
      ? recentTransactions.slice(0, 5).map((txn) => ({
          date: txn.date,
          amount: txn.amount,
          merchant: txn.merchant || txn.name,
        }))
      : [],
    spendByCategory: Array.isArray(spendByCategory) ? spendByCategory : [],
    spendByCategoryCurrentMonth: Array.isArray(spendByCategoryCurrentMonth)
      ? spendByCategoryCurrentMonth
      : [],
    spendByCategoryLastMonth: Array.isArray(spendByCategoryLastMonth)
      ? spendByCategoryLastMonth
      : [],
    accounts: Array.isArray(netWorth.bank_accounts)
      ? netWorth.bank_accounts
      : [],
    budget,
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
  logInfo(
    `🔍 [CATEGORY_TXNS_PROCESS] Processing category transactions for operation:`,
    {
      key: operation.key,
      category: operation.category,
      merchant: operation.merchant,
      period: operation.period,
      resultsCount: results.length,
      isMerchantQuery: operation.isMerchantQuery || false,
    },
  );

  // PHASE 2: Handle merchant queries (get_transactions_by_merchant returns transactions directly)
  if (operation.isMerchantQuery) {
    const merchantRes =
      results.find((r) => r?.name === "merchant_transactions") ||
      results[results.length - 1];

    if (
      !merchantRes?.data ||
      !Array.isArray(merchantRes.data) ||
      merchantRes.data.length === 0
    ) {
      logWarn(
        `⚠️ [MERCHANT_TXNS_PROCESS] No merchant transaction data found. merchantRes:`,
        merchantRes,
      );
      return null;
    }

    // get_transactions_by_merchant already filters by merchant, so use data directly
    // CRITICAL FIX: Calculate totals separately for sent (positive) vs received (negative)
    // Amount convention: Positive = sent (outgoing), Negative = received (incoming)
    let totalSent = 0;
    let totalReceived = 0;
    let sentCount = 0;
    let receivedCount = 0;

    merchantRes.data.forEach((txn) => {
      const amount = Number(txn.amount) || 0;
      if (amount > 0) {
        // Positive = sent (outgoing)
        totalSent += amount;
        sentCount++;
      } else if (amount < 0) {
        // Negative = received (incoming)
        totalReceived += Math.abs(amount); // Store as positive for clarity
        receivedCount++;
      }
      // amount === 0 is ignored (refunds/adjustments)
    });

    // Legacy total_spend for backward compatibility (all transactions)
    // Note: This represents total activity (sent + received), not net flow
    const totalSpend = totalSent + totalReceived;

    // CRITICAL: Always include sent/received totals even if one is zero
    // This ensures bidirectional detection works correctly in prompt engine

    const result = {
      category: null, // No specific category for merchant queries
      merchant: operation.merchant,
      transactions: merchantRes.data.map((txn) => {
        const amount = Number(txn.amount) || 0;
        return {
          date: txn.date,
          amount: txn.amount, // Preserve original sign
          name: txn.name,
          merchant: txn.merchant_name || txn.name || operation.merchant,
          category: txn.category || null,
          direction: amount > 0 ? "sent" : amount < 0 ? "received" : "neutral", // Add direction metadata
        };
      }),
      total_spend: totalSpend, // Legacy: total of all transactions
      total_sent: totalSent, // NEW: only sent transactions
      total_received: totalReceived, // NEW: only received transactions
      txn_count: merchantRes.data.length,
      sent_count: sentCount,
      received_count: receivedCount,
      period: `${operation.period.start} to ${operation.period.end}`,
    };

    logInfo(
      `🔍 [MERCHANT_TXNS_PROCESS] Processed ${result.transactions.length} merchant transactions:`,
      {
        merchant: result.merchant,
        period: result.period,
        transactionCount: result.transactions.length,
        totalSpend: result.total_spend,
        totalSent: result.total_sent,
        totalReceived: result.total_received,
        sentCount: result.sent_count,
        receivedCount: result.received_count,
        sampleTransactions: result.transactions.slice(0, 5).map((t) => ({
          date: t.date,
          merchant: t.merchant,
          name: t.name,
          amount: t.amount,
          direction: t.direction,
        })),
      },
    );

    return result;
  }

  // Results can contain: [category_spend_by_periods, category_transactions] for multi-month queries
  // Or just: [category_transactions] for single period queries
  const txnRes =
    results.find((r) => r?.name === "category_transactions") ||
    results[results.length - 1];
  const periodsRes = results.find(
    (r) => r?.name === "category_spend_by_periods",
  );

  logInfo(`🔍 [CATEGORY_TXNS_PROCESS] Found transaction result:`, {
    found: !!txnRes,
    hasData: !!txnRes?.data,
    dataLength: Array.isArray(txnRes?.data)
      ? txnRes.data.length
      : txnRes?.data
        ? 1
        : 0,
    dataType: txnRes?.data ? typeof txnRes.data : "undefined",
    firstItem:
      Array.isArray(txnRes?.data) && txnRes.data.length > 0
        ? txnRes.data[0]
        : null,
  });

  if (!txnRes?.data || txnRes.data.length === 0) {
    logWarn(
      `⚠️ [CATEGORY_TXNS_PROCESS] No transaction data found. txnRes:`,
      txnRes,
    );
    return null;
  }

  const result = {
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

  logInfo(
    `🔍 [CATEGORY_TXNS_PROCESS] Processed ${result.transactions.length} transactions:`,
    {
      category: result.category,
      period: result.period,
      transactionCount: result.transactions.length,
      sampleTransactions: result.transactions.slice(0, 5).map((t) => ({
        date: t.date,
        merchant: t.merchant,
        name: t.name,
        amount: t.amount,
      })),
      allMerchants: [
        ...new Set(result.transactions.map((t) => t.merchant)),
      ].slice(0, 10),
    },
  );

  // If we have monthly breakdown data, filter it for this category and add it
  if (periodsRes?.data && Array.isArray(periodsRes.data)) {
    const categoryMonthlyData = periodsRes.data
      .filter(
        (item) =>
          item.category &&
          item.category.toLowerCase() === operation.category.toLowerCase(),
      )
      .map((item) => ({
        month: item.month,
        total_spend: item.total_spend,
        txn_count: item.txn_count,
      }));

    if (categoryMonthlyData.length > 0) {
      result.monthlyBreakdown = categoryMonthlyData;
    }
  }

  return result;
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

// Helper function to check if all contexts are cached (silently)
async function areAllContextsCached(userId) {
  const commonContexts = ["summary_min", "invest_holdings", "goals_overview"];

  for (const need of commonContexts) {
    const cacheType = NEED_CONFIG[need]?.cacheType || need;
    const cached = await getCachedUserData(cacheType, userId, {}, true); // silent = true
    if (!cached) {
      return false;
    }
  }

  const spendParams = { period: getDateRange(30) };
  const cachedSpend = await getCachedUserData(
    "spend_data",
    userId,
    spendParams,
    true,
  );
  if (!cachedSpend) {
    return false;
  }

  return true;
}

async function handlePrebuildContext(userId, silent = false) {
  const startTime = Date.now();
  const spendParams = { period: getDateRange(30) };

  try {
    // Check if context is already cached and fresh (within 50 minute TTL)
    // Skip entirely when all packs are cached - no API work needed
    const commonContexts = ["summary_min", "invest_holdings", "goals_overview"];

    const cachedContexts = {};
    let allCached = true;

    for (const need of commonContexts) {
      const cacheType = NEED_CONFIG[need]?.cacheType || need;
      const cached = await getCachedUserData(cacheType, userId, {}, silent);
      cachedContexts[need] = !!cached;
      if (!cached) {
        allCached = false;
      }
    }

    const cachedSpend = await getCachedUserData(
      "spend_data",
      userId,
      spendParams,
      silent,
    );
    cachedContexts.spend_total = !!cachedSpend;
    if (!cachedSpend) {
      allCached = false;
    }

    // If all contexts are already cached and fresh, return early
    if (allCached) {
      const totalTime = Date.now() - startTime;
      if (!silent) {
        logInfo(
          `⚡ [PREBUILD] All contexts already cached and fresh (checked in ${totalTime}ms), skipping build`,
        );
      }
      return {
        success: true,
        message: "Context already cached and fresh",
        baseContextReady: true,
        backgroundContexts: [...commonContexts, "spend_total"],
        buildTime: totalTime,
        cached: true,
      };
    }

    logInfo(
      `📦 [PREBUILD] Some contexts missing, rebuilding... (cached: ${
        Object.keys(cachedContexts)
          .filter((k) => cachedContexts[k])
          .join(", ") || "none"
      })`,
    );

    // Build base context pack first (highest priority) - only if not cached
    if (!cachedContexts.summary_min) {
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

      // Cache base context for 50 minutes
      if (basePack) {
        await setCachedUserData(
          NEED_CONFIG.summary_min.cacheType,
          userId,
          basePack,
          {
            ttl: 50 * 60 * 1000,
          },
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
    } else {
      logInfo("✅ [PREBUILD] Base context already cached, skipping build");
    }

    // Build invest, goals, spend in parallel (only if not cached)
    const backgroundBuilds = [];

    if (!cachedContexts.invest_holdings) {
      backgroundBuilds.push(
        (async () => {
          try {
            const investContext = await buildContextPacks(
              userId,
              ["invest_holdings"],
              {},
            );
            const investPack =
              investContext?.packs?.[NEED_CONFIG.invest_holdings.packKey] ||
              null;
            if (investContext && investContext.packs && investPack) {
              await setCachedUserData(
                NEED_CONFIG.invest_holdings.cacheType,
                userId,
                investPack,
                { ttl: 50 * 60 * 1000 },
              );
              logInfo("✅ [PREBUILD] Investment context cached");
            } else {
              logWarn("❌ [PREBUILD] Investment context failed to build");
            }
          } catch (error) {
            logError("❌ [PREBUILD] Investment context failed:", error);
          }
        })(),
      );
    }

    if (!cachedContexts.goals_overview) {
      backgroundBuilds.push(
        (async () => {
          try {
            const goalsContext = await buildContextPacks(
              userId,
              ["goals_overview"],
              {},
            );
            const goalsPack =
              goalsContext?.packs?.[NEED_CONFIG.goals_overview.packKey] || null;
            if (goalsContext && goalsContext.packs && goalsPack) {
              await setCachedUserData(
                NEED_CONFIG.goals_overview.cacheType,
                userId,
                goalsPack,
                { ttl: 50 * 60 * 1000 },
              );
              logInfo("✅ [PREBUILD] Goals context cached");
            } else {
              logWarn("❌ [PREBUILD] Goals context failed to build");
            }
          } catch (error) {
            logError("❌ [PREBUILD] Goals context failed:", error);
          }
        })(),
      );
    }

    if (!cachedContexts.spend_total) {
      backgroundBuilds.push(
        (async () => {
          try {
            const spendContext = await buildContextPacks(
              userId,
              ["spend_total"],
              spendParams,
            );
            const spendPack =
              spendContext?.packs?.[NEED_CONFIG.spend_total.packKey] || null;
            if (spendContext && spendContext.packs && spendPack) {
              await setCachedUserData(
                NEED_CONFIG.spend_total.cacheType,
                userId,
                spendPack,
                { ttl: 50 * 60 * 1000 },
              );
              logInfo("✅ [PREBUILD] Spend context cached");
            } else {
              logWarn("❌ [PREBUILD] Spend context failed to build");
            }
          } catch (error) {
            logError("❌ [PREBUILD] Spend context failed:", error);
          }
        })(),
      );
    }

    if (backgroundBuilds.length > 0) {
      logInfo(
        `📦 [PREBUILD] Building ${backgroundBuilds.length} context pack(s) in parallel...`,
      );
      await Promise.allSettled(backgroundBuilds);
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

// handleClassify - wrapper for ClassificationService
async function handleClassify(message, context) {
  return await classificationService.classify(message, context);
}

async function handleOffTopic(
  message,
  context,
  wantsStreaming = false,
  res = null,
) {
  console.log("🚫 [FINNY] Handling off-topic query:", message);
  const startTime = Date.now();

  // Helper to send progress updates
  const sendProgress = (status) => {
    if (wantsStreaming && res && !res.writableEnded) {
      sendStreamEvent(res, "progress", { status });
    }
  };

  const messageText =
    typeof message === "string" ? message : String(message || "");

  // Simple venting detection (same handler/prompt, but we tag the mode)
  const lower = messageText.toLowerCase();
  const ventingPatterns = [
    /\b(stressed|overwhelmed|tired|exhausted|frustrated|annoyed|upset|sad|depressed|anxious|worried)\b/i,
    /\b(having a hard time|going through|struggling|difficult|tough|rough)\b/i,
    /\b(work is|job is|boss|colleague|relationship|family|friend)\b/i,
  ];
  const hasVenting = ventingPatterns.some((pattern) => pattern.test(lower));
  const hasFinancialContext =
    /\b(money|finance|financial|budget|debt|spend|save|invest|income|salary|bill|payment|rent|mortgage|credit|loan)\b/i.test(
      lower,
    );
  const isVenting = hasVenting && !hasFinancialContext;

  const category = isVenting ? "venting" : context?.category || "general";
  const userProfile = context?.profile || {};
  const userId = context?.user_id;

  // Fetch net worth data for lightweight context
  let netWorthData = null;
  if (userId) {
    try {
      sendProgress("Loading your financess...");
      netWorthData = await getNetWorthData(userId);
      if (netWorthData) {
        console.log("📊 [OFF_TOPIC] Net worth data loaded for context");
      }
    } catch (error) {
      console.log(
        "⚠️ [OFF_TOPIC] Could not load net worth data:",
        error?.message,
      );
    }
  }

  const systemPrompt = [
    "You are Finny, a calm, intelligent money coach.",
    "",
    "CORE BEHAVIOR:",
    "- Your primary role is personal finance guidance and money coaching.",
    "- You are friendly, human, and conversational, not robotic.",
    "- You acknowledge the user as a person before steering toward finance.",
    "",
    "NON-CONFLICTING RULES:",
    "1) You must NOT provide detailed answers or factual explanations in non-finance domains (religion, physics, cooking, movies, sports, weather, games, etc.).",
    "2) You may acknowledge non-finance topics briefly, but never explain or teach them.",
    "3) You must NOT engage with sexual, unsafe, or inappropriate content. Redirect immediately.",
    "4) Every conversation should gently and naturally connect back to money or financial decisions.",
    "",
    "SMALL TALK & GREETINGS:",
    "- If the user says something like 'hi', 'how are you', or casual small talk:",
    "  • Respond naturally and briefly.",
    "  • End with a subtle, low-pressure bridge to finance.",
    "  • Example: mood, plans, money goals, or financial well-being.",
    "",
    "OFF-TOPIC (NOT EMOTIONAL):",
    "- Acknowledge in one sentence.",
    "- Do NOT provide domain facts.",
    "- Redirect to a specific finance angle.",
    "- Ask ONE clear finance-related question.",
    "- Keep total response to 2–4 sentences.",
    "",
    "EMOTIONAL / VENTING USER:",
    "- Acknowledge feelings with empathy (1–2 sentences).",
    "- Do NOT give medical or legal advice.",
    "- Gently connect emotions to money impact (stress, control, stability).",
    "- Ask ONE focused finance question to move forward.",
    "",
    "MEMORY & USER CONTEXT:",
    "- You may use stored user context to personalize advice.",
    "- If the user asks 'what do you know about me?', answer using available context both personal and financial.",
    "- Never mention the word 'memories' or imply private data access.",
    "- If context is missing, ask clarifying questions instead of assuming.",
    "",
    "STYLE GUIDELINES:",
    "- Sound like a thoughtful human money coach.",
    "- Be concise, grounded, and non-judgmental.",
    "- No lectures. No generic disclaimers. No buzzwords.",
    "",
    "RESPONSE FORMATTING:",
    "- For longer responses (3+ sentences), use line breaks to improve readability.",
    "- When your response has distinct parts (acknowledgment + question, or multiple thoughts),",
    "  separate them with two blank lines (double line break) for better chat readability.",
    "- Short responses (1-2 sentences) can remain as single paragraphs.",
    "- Format naturally like a chat message, not a dense paragraph.",
    "- Example structure for longer responses:",
    "  [Acknowledgment or first thought]",
    "",
    "",
    "  [Question or second thought]",
  ].join("\n");

  try {
    // OPTIMIZED: Load memory and profile in parallel for better performance
    let userMemory = { memories: [], totalCount: 0 };
    let userProfileForFinny = null;
    sendProgress("Brewing...");
    if (userId) {
      try {
        console.log(
          "🧠 [OFF_TOPIC] Loading user memories and profile in parallel for user:",
          userId,
        );

        // Load memory and profile in parallel with 5s timeout (non-blocking)
        // Using wrapper functions that automatically fallback to defaults on timeout
        const [loadedMemory, loadedProfile] = await Promise.all([
          loadUserMemoryWithTimeout(
            userId,
            messageText,
            MEMORY_LOAD_TIMEOUT_MS,
          ).catch((error) => {
            console.log("⚠️ [OFF_TOPIC] Error loading memory:", error?.message);
            return { memories: [], totalCount: 0 };
          }),
          fetchSupermemoryProfileWithTimeout(
            userId,
            MEMORY_LOAD_TIMEOUT_MS,
          ).catch((error) => {
            console.log(
              "⚠️ [OFF_TOPIC] Error loading profile:",
              error?.message,
            );
            return null;
          }),
        ]);

        userMemory = loadedMemory;
        userProfileForFinny = loadedProfile;
        sendProgress("Brewing about you...");
        console.log("🧠 [OFF_TOPIC] User memories:", userMemory);
      } catch (error) {
        console.log("⚠️ [OFF_TOPIC] Could not load user data:", error?.message);
        userMemory = { memories: [], totalCount: 0 };
      }
    }

    const memorySnippets = Array.isArray(userMemory?.memories)
      ? userMemory.memories
          .slice(0, 10)
          .map((m, idx) => {
            const raw = String(m?.content || "");
            const cleaned = redactPII(raw).replace(/\s+/g, " ").trim();
            const clipped =
              cleaned.length > 240 ? `${cleaned.slice(0, 240)}…` : cleaned;
            const score =
              typeof m?.similarity === "number" && Number.isFinite(m.similarity)
                ? m.similarity
                : null;
            return `- ${idx + 1})${
              score !== null ? ` (${score.toFixed(2)})` : ""
            } ${clipped}`;
          })
          .filter(Boolean)
      : [];

    console.log("🧠 [OFF_TOPIC] User profile for Finny:", userProfileForFinny);
    const userContextParts = [
      `Message: ${messageText}`,
      `Mode hint: ${isVenting ? "venting" : "general_off_topic"}`,
      userProfile?.name ? `User name: ${userProfile.name}` : null,
      typeof userProfile?.monthly_income === "number" &&
      Number.isFinite(userProfile.monthly_income) &&
      userProfile.monthly_income > 0
        ? `Monthly income: $${userProfile.monthly_income.toLocaleString(
            undefined,
            { maximumFractionDigits: 0 },
          )}`
        : null,
      userProfileForFinny?.profile
        ? `User profile:\n${
            userProfileForFinny.profile.static?.length > 0
              ? `Static: ${userProfileForFinny.profile.static.join(", ")}\n`
              : ""
          }Dynamic: ${
            Array.isArray(userProfileForFinny.profile.dynamic)
              ? userProfileForFinny.profile.dynamic.join(", ")
              : userProfileForFinny.profile.dynamic
          }`
        : null,
      userProfile?.finny_style
        ? `Finny style: ${userProfile.finny_style}`
        : null,
      netWorthData
        ? `Financial context: Net worth ${netWorthData.formatted.net_worth}, ${netWorthData.formatted.liquid_assets} cash, ${netWorthData.formatted.investments_total} invested, ${netWorthData.formatted.total_liabilities} debt`
        : null,
      memorySnippets.length > 0
        ? `Relevant memories (use them well):\n${memorySnippets.join("\n")}`
        : "Relevant memories: none",
    ].filter(Boolean);

    const userMessage = userContextParts.join("\n\n");

    // Build prompt_used for logging (full messages sent to LLM)
    const promptUsed = JSON.stringify([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ]);

    async function callMainLLM(model, options = {}) {
      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenRouterKey()}`,
            "Content-Type": "application/json",
          },
          signal: options.signal,
          body: JSON.stringify({
            model,
            temperature: 0.85,
            max_tokens: 1500,
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: userMessage,
              },
            ],
          }),
        },
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`OpenRouter error ${resp.status}: ${errorText}`);
      }
      return resp;
    }

    // Use reasoning model (meta-llama/llama-4-scout) as primary, STANDARD_MODEL as fallback
    const llmModels = [
      REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout",
      STANDARD_MODEL,
    ];

    let resp;
    let usedModel = REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout";
    try {
      const llmResult = await llmService.callWithFallback(
        llmModels,
        callMainLLM,
        20000,
        "LLM",
      );
      resp = llmResult.result;
      usedModel = llmResult.model;
    } catch (llmError) {
      console.error(
        "❌ [FINNY] All LLM attempts failed for off-topic:",
        llmError?.message,
      );
      return {
        text: "I'm a finance coach. What financial questions can I help you with?",
        type: "assistant",
        intent: "off_topic",
        category: category,
        fallback: true,
      };
    }

    const data = await resp.json();
    const content =
      data.choices?.[0]?.message?.content ||
      "I'm all about finance. What money questions can I help you with?";

    // Store conversation memory AFTER response is sent (non-blocking)
    if (userId && content) {
      const storeMemoryAfterResponse = () => {
        storeConversationMemory(userId, messageText, content, {
          intent: "off_topic",
          chat_id: context?.chat_id,
          category: category,
          userName: userProfile?.name || null,
        }).catch((error) => {
          console.error(
            "❌ [OFF_TOPIC] Failed to store conversation memory:",
            error,
          );
        });
      };

      // For streaming: store after res.end(), for non-streaming: store after response sent
      if (wantsStreaming && res) {
        res.once("finish", storeMemoryAfterResponse);
      } else {
        setImmediate(storeMemoryAfterResponse);
      }
    }

    // Log in background (non-blocking)
    setImmediate(() =>
      logConversation({
        user_message: redactPII(messageText),
        finny_response: redactPII(content),
        timestamp: new Date().toISOString(),
        user_id: userId || "unknown",
        chat_id: context?.chat_id || null,
        intent: "off_topic",
        entities: [],
        confidence: 1.0,
        response_time_ms: Date.now() - startTime,
        sources_used: [],
        cached: false,
        category: category,
        classification_details: context?.classification_result || {
          intent: "off_topic",
          confidence: 1.0,
          emotional_state: isVenting ? "venting" : "neutral",
        },
        prompt_used: promptUsed,
      }).catch((err) =>
        console.error(
          "❌ [CONVERSATION_LOG] Background log failed:",
          err?.message,
        ),
      ),
    );

    return {
      text: cleanResponseFormatting(content),
      type: "assistant",
      intent: "off_topic",
      category: category,
    };
  } catch (error) {
    console.error("❌ [FINNY] Off-topic handler error:", error);
    return {
      text: "I'm strictly a finance coach. What financial questions can I help you with?",
      type: "assistant",
      intent: "off_topic",
      category: category,
      fallback: true,
    };
  }
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
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function to send streaming events
function sendStreamEvent(res, event, data) {
  if (!res || res.writableEnded) return;
  if (event !== "ping") {
    res.__finny_last_emit = Date.now();
  }
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === "function") {
    res.flush();
  }
}

function buildStreamFallbackResponse(message) {
  return {
    message: cleanResponseFormatting(
      message ||
        "Sorry — something stalled on my side. Please try again in a moment.",
    ),
    type: "assistant",
    hideActions: true,
    hideFeedback: true,
    actions: [],
  };
}

function startStreamWatchdog(res, { timeoutMs = 30000, pingMs = 8000 } = {}) {
  const startedAt = Date.now();
  res.__finny_last_emit = startedAt;

  const intervalId = setInterval(() => {
    if (!res || res.writableEnded) {
      clearInterval(intervalId);
      return;
    }

    const lastEmit = res.__finny_last_emit || startedAt;
    const now = Date.now();
    if (now - lastEmit >= timeoutMs) {
      logWarn("⚠️ [STREAMING] Watchdog timeout; forcing complete");
      sendStreamEvent(
        res,
        "complete",
        buildStreamFallbackResponse(
          "Sorry — the response took too long. Please try again.",
        ),
      );
      res.end();
      clearInterval(intervalId);
      return;
    }

    sendStreamEvent(res, "ping", { ts: now });
  }, pingMs);

  return intervalId;
}

// Finance facts to show during stock analysis loading
const FINANCE_FACTS = [
  "💡 Did you know? The stock market has historically returned about 10% annually over the long term.",
  "📊 Fun fact: The first stock exchange was established in Amsterdam in 1602 for the Dutch East India Company.",
  "💰 Tip: Diversification is key - don't put all your eggs in one basket!",
  "📈 Interesting: The S&P 500 has had positive returns in about 75% of all years since 1926.",
  "🎯 Fact: Warren Buffett's favorite holding period is 'forever' - think long-term!",
  "💼 Did you know? The average investor underperforms the market by about 2-3% annually due to emotional trading.",
  "📉 Insight: Market corrections (10-20% drops) happen about once every 2 years on average.",
  "🚀 Fun fact: The term 'bull market' comes from bulls attacking upward, while 'bear market' comes from bears swiping downward.",
  "💎 Tip: Dollar-cost averaging can help reduce the impact of market volatility.",
  "📊 Fact: The P/E ratio (Price-to-Earnings) helps investors understand if a stock is overvalued or undervalued.",
  "🎓 Did you know? The first IPO (Initial Public Offering) was by the Dutch East India Company in 1602.",
  "💡 Insight: Compound interest is often called the 'eighth wonder of the world' - time is your best friend in investing!",
  "📈 Fact: The stock market is closed on weekends and major holidays - plan your trades accordingly.",
  "💰 Tip: Emergency funds should cover 3-6 months of expenses before you start investing heavily.",
  "🚀 Fun fact: The NASDAQ was the world's first electronic stock market when it launched in 1971.",
];

function getRandomFinanceFact() {
  return FINANCE_FACTS[Math.floor(Math.random() * FINANCE_FACTS.length)];
}

// Helper to send progress update (works for both streaming and non-streaming)
function sendStockProgress(res, message, wantsStreaming) {
  if (wantsStreaming && res && !res.writableEnded) {
    sendStreamEvent(res, "progress", { status: message });
  }
  console.log(`📊 [STOCK_PROGRESS] ${message}`);
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
      // CRITICAL: Add trailing space if there are more words coming
      // This ensures word boundaries are preserved when chunks are concatenated
      if (i < words.length - 1) {
        currentChunk += " ";
      }

      sendStreamEvent(res, "text_chunk", { text: currentChunk });
      currentChunk = "";

      // Tiny delay for smooth streaming (network latency provides natural delay)
      await delay(20 + Math.random() * 30);
    }
  }
}

async function limitedBraveSearch(query) {
  return webSearchService.limitedSearch(query);
}

// === Stocks via Finnhub ===
function looksLikeStockQuery(message, classificationResult = null) {
  // Rely solely on classification - no rigid detection
  return classificationResult?.intent === "stock_query";
}

function looksLikeStockDeepQuery(message) {
  // Deep analysis is now the default for all stock queries
  // Only check if it's actually a stock query (handled by caller)
  // This ensures all stock queries get comprehensive analysis
  return true;
}

async function planStockRequest(message) {
  return stockAnalysisService.planStockRequest(message);
}

async function executeStockPlan(
  plan,
  message,
  res = null,
  wantsStreaming = false,
) {
  return stockAnalysisService.executeStockPlan(plan, message, {
    sendProgress: (status) => sendStockProgress(res, status, wantsStreaming),
  });
}

async function generateConversationalStockResponse(
  stockData,
  userMessage,
  userProfile,
  userMemory,
  investmentHoldings,
  stockPlan = null,
) {
  // Always generate comprehensive analysis using LLM for all stock queries
  console.log(`\n🔍 [STOCK_ANALYSIS] ========================================`);
  console.log(
    `🔍 [STOCK_ANALYSIS] Generating comprehensive analysis for ${stockData.ticker}`,
  );
  console.log(`🔍 [STOCK_ANALYSIS] User message: "${userMessage}"`);
  console.log(
    `🔍 [STOCK_ANALYSIS] Stock data available: current=${
      stockData.current
    }, hasProfile=${!!stockData.profile}, hasMetrics=${!!stockData.metrics}`,
  );

  // Build the base summary with all available data
  const baseSummary = stockAnalysisService.buildStockDataSummary(
    stockData,
    stockPlan,
  );

  // Format stock data for LLM context
  const stockDataContext = {
    ticker: stockData.ticker,
    name: stockData.profile?.name || stockData.ticker,
    currentPrice: stockData.current,
    change: stockData.change,
    changePercent: stockData.changePercent,
    high: stockData.high,
    low: stockData.low,
    prevClose: stockData.prevClose,
    open: stockData.open,
    industry: stockData.profile?.finnhubIndustry,
    marketCap: stockData.profile?.marketCapitalization,
    employees: stockData.profile?.employeeTotal,
    description: stockData.profile?.description,
    peRatio:
      stockData.metrics?.peBasicExclExtraTTM || stockData.metrics?.peBasicTTM,
    psRatio: stockData.metrics?.psTTM,
    recommendations: stockData.recommendations?.[0] || null,
    news: (stockData.news || []).map((n) => {
      // Finnhub company-news API returns 'url' field which is often a Finnhub API endpoint
      // We need to check if it's an actual article URL or an API endpoint
      // Some news items may have the actual article URL, others may only have API endpoints
      let articleUrl = null;

      // Check if url exists and is not a Finnhub API endpoint
      if (n.url && typeof n.url === "string") {
        // Finnhub API endpoints typically contain '/api/news' or are finnhub.io domains
        if (
          !n.url.includes("finnhub.io/api/news") &&
          !n.url.includes("finnhub.io/api/v1") &&
          (n.url.startsWith("http://") || n.url.startsWith("https://"))
        ) {
          articleUrl = n.url;
        }
      }

      // Log for debugging if no URL found
      if (!articleUrl && n.headline) {
        console.log(
          `[STOCK_ANALYSIS] News item "${n.headline.substring(
            0,
            50,
          )}..." has no valid article URL. Available fields:`,
          Object.keys(n),
        );
      }

      return {
        ...n,
        articleUrl: articleUrl, // Store the actual article URL separately
      };
    }),
    earnings: stockData.extra?.earnings || null,
    filings: stockData.extra?.filings || null,
    insider: stockData.extra?.insider || null,
  };

  // Build comprehensive analysis prompt
  const analysisPrompt = `You are a financial analyst providing comprehensive stock analysis. Based on the following stock data for ${
    stockDataContext.ticker
  }, provide a detailed, comprehensive analysis.

Stock Data:
- Company: ${stockDataContext.name} (${stockDataContext.ticker})
- Current Price: $${stockDataContext.currentPrice || "N/A"}${
    stockDataContext.changePercent
      ? ` (${
          stockDataContext.changePercent > 0 ? "+" : ""
        }${stockDataContext.changePercent.toFixed(2)}%)`
      : ""
  }
- Industry: ${stockDataContext.industry || "N/A"}
${
  stockDataContext.marketCap
    ? `- Market Cap: $${stockDataContext.marketCap.toLocaleString()}`
    : ""
}
${
  stockDataContext.peRatio
    ? `- P/E Ratio: ${stockDataContext.peRatio.toFixed(2)}`
    : ""
}
${
  stockDataContext.psRatio
    ? `- P/S Ratio: ${stockDataContext.psRatio.toFixed(2)}`
    : ""
}
${
  stockDataContext.recommendations
    ? `- Analyst Recommendations: ${
        stockDataContext.recommendations.strongBuy || 0
      } Strong Buy, ${stockDataContext.recommendations.buy || 0} Buy, ${
        stockDataContext.recommendations.hold || 0
      } Hold, ${stockDataContext.recommendations.sell || 0} Sell, ${
        stockDataContext.recommendations.strongSell || 0
      } Strong Sell`
    : ""
}
${
  stockDataContext.description
    ? `- Company Description: ${stockDataContext.description.substring(0, 500)}`
    : ""
}
${
  stockDataContext.news && stockDataContext.news.length > 0
    ? `- Recent News (IMPORTANT: Use ONLY the article URLs provided below. If "URL not available", omit the URL entirely):
${stockDataContext.news
  .slice(0, 5)
  .map((n, idx) => {
    const articleUrl = n.articleUrl || null;
    // Only include URL if we have a valid article URL
    if (articleUrl) {
      return `  ${idx + 1}. ${n.headline} - Article URL: ${articleUrl}`;
    } else {
      return `  ${idx + 1}. ${
        n.headline
      } - URL not available (do NOT include any URL for this item)`;
    }
  })
  .join("\n")}`
    : ""
}

User Query: ${userMessage}

Provide a comprehensive, structured stock analysis using bullet points for easy reading. Format as follows:

**Current Market Position**
• Current price: $[price] ([change]%)
• Day range: $[low] - $[high]
• Brief performance note (1-2 sentences max)

**Financial Metrics**
• P/E Ratio: [value] - [brief interpretation]
• P/S Ratio: [value] - [brief interpretation]
• Other key metrics if available

**Valuation Assessment**
• Market Cap: $[value]
• Company size classification (large/mid/small cap)
• Valuation context (1-2 bullet points)

**Analyst Sentiment**
• [X] Strong Buy, [Y] Buy, [Z] Hold, [A] Sell, [B] Strong Sell
• Overall sentiment summary (2 bullet point)

**Recent Developments**
• [News headline 1] - [ONLY include URL if provided in news data above, otherwise omit URL]
• [News headline 2] - [ONLY include URL if provided in news data above, otherwise omit URL]
• [News headline 3] - [ONLY include URL if provided in news data above, otherwise omit URL]
CRITICAL: 
- Use ONLY the article URLs explicitly provided in the "Recent News" section above
- If a news item shows "URL not available", include ONLY the headline without any URL
- Format as: "Headline - https://actual-url.com" (only if URL was provided)
- Do NOT use placeholder URLs like "example.com" or "https://example.com"
- Do NOT use markdown link format [text](url)
- Do NOT use Finnhub API endpoint URLs (finnhub.io/api/news)
- Do NOT invent or guess URLs

**Investment Considerations**
• Opportunities (2-3 bullet points)
• Risks (2-3 bullet points)

**Industry Context**
• Industry: [industry name]
• Market position (1-2 bullet points)

**Summary**
• [2-3 sentence overall assessment]

CRITICAL FORMATTING REQUIREMENTS:
- Use bullet points (•) for ALL content, NOT paragraphs
- Keep each bullet point concise (1-2 sentences max)
- For news URLs: Use the ACTUAL article URLs provided in the news data above, formatted as plain URLs (e.g., https://actual-domain.com/article)
- Format news items as: "Headline - [actual URL from news data]"
- Do NOT use placeholder URLs like "example.com" or "https://example.com"
- Do NOT use markdown link format [text](url)
- Do NOT use Finnhub API endpoint URLs (finnhub.io/api/news?id=...)
- Use bold section headers (**Section Name**)
- Be data-driven and specific
- Keep total length under 2000 words but comprehensive`;

  try {
    // Check if API key is available
    if (!process.env.OPENROUTER_API_KEY) {
      console.error(
        "❌ [STOCK_ANALYSIS] OPENROUTER_API_KEY not found, falling back to summary",
      );
      console.log(
        `⚠️ [STOCK_ANALYSIS] Falling back to base summary (no API key)`,
      );
      return baseSummary;
    }

    const STOCK_ANALYSIS_MODEL = STANDARD_MODEL;

    console.log(
      `🔍 [STOCK_ANALYSIS] Calling LLM API with model: ${STOCK_ANALYSIS_MODEL}`,
    );
    const llmStartTime = Date.now();

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: STOCK_ANALYSIS_MODEL,
          temperature: 0.3,
          max_tokens: 8000, // Allow comprehensive analysis responses
          messages: [
            {
              role: "system",
              content:
                "You are a financial analyst providing comprehensive stock analysis. ALWAYS format responses using bullet points (•) for easy reading. For news URLs, use the ACTUAL article URLs provided in the user's stock data, formatted as plain URLs (e.g., https://actual-domain.com/article). Format news items as: 'Headline - [actual URL from provided news data]'. Do NOT use placeholder URLs like 'example.com'. Do NOT use markdown link format [text](url). Keep each bullet point concise (1-2 sentences max). Use bold section headers. Be specific, data-driven, and actionable.",
            },
            { role: "user", content: analysisPrompt },
          ],
        }),
      },
    );

    const llmDuration = Date.now() - llmStartTime;
    console.log(
      `🔍 [STOCK_ANALYSIS] LLM API response received in ${llmDuration}ms (status: ${response.status})`,
    );

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;

      // Check if response was truncated
      if (finishReason === "length") {
        console.warn(
          "⚠️ [STOCK_ANALYSIS] Comprehensive analysis response was truncated due to token limit",
        );
      }

      if (content && content.trim()) {
        console.log(
          `✅ [STOCK_ANALYSIS] Generated comprehensive analysis (length: ${content.length} chars, duration: ${llmDuration}ms)`,
        );
        return content;
      } else {
        console.error(
          "❌ [STOCK_ANALYSIS] LLM returned empty content. Response data:",
          JSON.stringify(data, null, 2).substring(0, 500),
        );
      }
    } else {
      const errorText = await response
        .text()
        .catch(() => "Unable to read error");
      console.error(
        `❌ [STOCK_ANALYSIS] LLM API request failed: ${response.status} ${response.statusText}`,
      );
      console.error(
        `❌ [STOCK_ANALYSIS] Error details: ${errorText.substring(0, 500)}`,
      );
    }
  } catch (error) {
    console.error("❌ [STOCK_ANALYSIS] Analysis generation failed:", error);
    console.error("❌ [STOCK_ANALYSIS] Error stack:", error.stack);
  }

  // Fallback to base summary if LLM fails
  console.log(`⚠️ [STOCK_ANALYSIS] Falling back to base summary`);
  return baseSummary;
}

// Fallback function for when stock APIs fail
async function generateFallbackStockAnalysis(
  ticker,
  userMessage,
  userProfile,
  userMemory,
) {
  return stockAnalysisService.generateFallbackStockAnalysis(
    ticker,
    userMessage,
  );
}

function generateTrainingDataStockAnalysis(ticker, userMessage) {
  return stockAnalysisService.generateTrainingDataStockAnalysis(
    ticker,
    userMessage,
  );
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
      return null;
    }

    // Cache hit
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
      `✅ [CACHE] Cached data for ${cacheKey}, size: ${dataSize} bytes`,
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
  userSpecific = false,
) {
  const cached = await getCachedData(type, identifier, userSpecific);
  if (cached) {
    return cached;
  }

  console.log(
    `🔄 [CACHE] Cache miss for ${type}_${identifier}, calling fallback`,
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
          // Failed to clear cache prefix
        }
      }
    } catch (e) {
      // Postgres cache purge skipped
    }

    // Use our new smart cache invalidation
    try {
      await invalidateUserCache(userId);
    } catch (e) {
      // Smart cache invalidation skipped
    }
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

    const { data: netWorthData, error } = await dataFetchService.getNetWorth(
      userId,
      3000,
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

    // Log raw RPC response for debugging
    // console.log(
    //   "📊 [NET_WORTH] Raw RPC response:",
    //   JSON.stringify(netWorth, null, 2)
    // );

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
          netWorth.investments_total || 0,
        ),
        total_liabilities: formatNetWorthCurrency(
          netWorth.total_liabilities || 0,
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

export {
  loadUserMemory,
  generateFallbackStockAnalysis,
  generateTrainingDataStockAnalysis,
  getNetWorthData,
  formatNetWorthCurrency,
  handleAsk,
  handleClassify,
  handleOffTopic,
};
