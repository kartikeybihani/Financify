// api/goals.js
import { supabase } from "../lib/api/supabase.js";
import fetch from "node-fetch";
import crypto from "crypto";

// Utilities
function generateRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

function redactPII(text) {
  if (!text) return text;
  // Redact email addresses
  text = text.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    "[EMAIL]"
  );
  // Redact phone numbers
  text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE]");
  // Redact SSN-like patterns
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
  return text;
}

function withTimeout(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs)
    ),
  ]);
}

function logConversation(logData) {
  // Async logging - don't block the response
  setImmediate(async () => {
    try {
      await supabase.from("conversation_logs").insert([logData]);
    } catch (error) {
      console.error("❌ [LOGGING] Failed to log conversation:", error);
    }
  });
}

// Memory extraction model - small, fast, free
// Use env var if available, otherwise fallback to free model
const MEMORY_EXTRACTION_MODEL = "meta-llama/llama-3.3-8b-instruct:free";

// =====================
// GOAL CONSTANTS
// =====================

// Goal category keywords for classification
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

// =====================
// GOAL UTILITY FUNCTIONS
// =====================

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

  // Use original text - typo handling is now done at the flow level
  let normalizedText = text.toLowerCase();

  // Patterns like "by Dec", "by December 15", "by 12/31/2025", "by December 2025", "next month", "in 6 weeks"
  const byDate = normalizedText.match(
    /\bby\s+([a-zA-Z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|[a-zA-Z]+\s+\d{4}|[a-zA-Z]+)\b/i
  );
  const onDate = normalizedText.match(
    /\b(on|by)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/i
  );
  const monthOnly = normalizedText.match(
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

  // Handle "next" + seasonal terms and years
  const nextSeason = normalizedText.match(
    /\bnext\s+(spring|summer|fall|autumn|winter|year)\b/i
  );
  const nextMonthPattern = normalizedText.match(
    /\bnext\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  const nextYear = /\bnext\s+year\b/i.test(normalizedText);
  const inYear = normalizedText.match(/\bin\s+(\d{4})\b/i);

  let d = null;
  if (onDate && onDate[2]) {
    d = new Date(onDate[2]);
  } else if (byDate && byDate[1]) {
    // Try direct parsing first
    d = new Date(byDate[1]);
    if (isNaN(d.getTime())) {
      // Try with current year
      d = new Date(`${byDate[1]} ${now.getFullYear()}`);
      if (isNaN(d.getTime())) {
        // Try with next year if current year has passed
        d = new Date(`${byDate[1]} ${now.getFullYear() + 1}`);
      }
    }
  } else if (monthOnly && monthOnly[1]) {
    const monthName = monthOnly[1];
    const monthMap = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const monthNum = monthMap[monthName.toLowerCase()];
    if (monthNum !== undefined) {
      d = new Date(now.getFullYear(), monthNum);
      if (d < now) d = new Date(now.getFullYear() + 1, monthNum);
    }
  } else if (nextMonth) {
    d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (inWeeks && inWeeks[1]) {
    d = new Date(
      now.getTime() + parseInt(inWeeks[1]) * 7 * 24 * 60 * 60 * 1000
    );
  } else if (inMonths && inMonths[1]) {
    d = new Date(
      now.getFullYear(),
      now.getMonth() + parseInt(inMonths[1]),
      now.getDate()
    );
  } else if (bareMonths && bareMonths[1]) {
    d = new Date(
      now.getFullYear(),
      now.getMonth() + parseInt(bareMonths[1]),
      now.getDate()
    );
  } else if (
    ddMonthYYYY &&
    ddMonthYYYY[1] &&
    ddMonthYYYY[2] &&
    ddMonthYYYY[3]
  ) {
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const monthNum = monthMap[ddMonthYYYY[2].toLowerCase()];
    if (monthNum !== undefined) {
      d = new Date(
        parseInt(ddMonthYYYY[3]),
        monthNum,
        parseInt(ddMonthYYYY[1])
      );
    }
  } else if (monthYYYY && monthYYYY[1] && monthYYYY[2]) {
    const monthMap = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const monthNum = monthMap[monthYYYY[1].toLowerCase()];
    if (monthNum !== undefined) {
      d = new Date(parseInt(monthYYYY[2]), monthNum, 1);
    }
  } else if (
    standaloneMonthYYYY &&
    standaloneMonthYYYY[1] &&
    standaloneMonthYYYY[2]
  ) {
    const monthMap = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const monthNum = monthMap[standaloneMonthYYYY[1].toLowerCase()];
    if (monthNum !== undefined) {
      d = new Date(parseInt(standaloneMonthYYYY[2]), monthNum, 1);
    }
  } else if (
    standaloneDdMonthYYYY &&
    standaloneDdMonthYYYY[1] &&
    standaloneDdMonthYYYY[2] &&
    standaloneDdMonthYYYY[3]
  ) {
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const monthNum = monthMap[standaloneDdMonthYYYY[2].toLowerCase()];
    if (monthNum !== undefined) {
      d = new Date(
        parseInt(standaloneDdMonthYYYY[3]),
        monthNum,
        parseInt(standaloneDdMonthYYYY[1])
      );
    }
  } else if (standaloneMonthOnly && standaloneMonthOnly[1]) {
    const monthName = standaloneMonthOnly[1];
    const monthMap = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const monthNum = monthMap[monthName.toLowerCase()];
    if (monthNum !== undefined) {
      d = new Date(now.getFullYear(), monthNum);
      if (d < now) d = new Date(now.getFullYear() + 1, monthNum);
    }
  }

  // Handle seasonal terms and "next" patterns
  // Check if d is null/undefined OR an invalid date object
  if (!d || isNaN(d.getTime())) {
    if (nextYear) {
      d = new Date(now.getFullYear() + 1, 0, 1); // January 1st of next year
    } else if (nextSeason && nextSeason[1]) {
      const season = nextSeason[1].toLowerCase();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-based (Oct = 9)

      // Define seasonal mid dates
      const seasonalDates = {
        spring: { month: 3, day: 15 }, // Mid-April
        summer: { month: 6, day: 15 }, // Mid-July
        fall: { month: 9, day: 15 }, // Mid-October
        autumn: { month: 9, day: 15 }, // Mid-October
        winter: { month: 0, day: 15 }, // Mid-January
      };

      const seasonDate = seasonalDates[season];
      let targetYear = currentYear;

      // "next" season always means the next occurrence
      // Since it's currently October 2025 and user says "next summer"
      // Target should be summer 2026 (mid-July 2026)
      // Always increment to next year when "next" is used
      targetYear = currentYear + 1;

      d = new Date(targetYear, seasonDate.month, seasonDate.day);
    } else if (nextMonthPattern && nextMonthPattern[1]) {
      const monthName = nextMonthPattern[1].toLowerCase();
      const monthMap = {
        jan: 0,
        january: 0,
        feb: 1,
        february: 1,
        mar: 2,
        march: 2,
        apr: 3,
        april: 3,
        may: 4,
        jun: 5,
        june: 5,
        jul: 6,
        july: 6,
        aug: 7,
        august: 7,
        sep: 8,
        sept: 8,
        september: 8,
        oct: 9,
        october: 9,
        nov: 10,
        november: 10,
        dec: 11,
        december: 11,
      };
      const monthNum = monthMap[monthName];
      if (monthNum !== undefined) {
        let targetYear = now.getFullYear();
        let targetMonth = monthNum;

        // If the month has passed this year, target next year
        if (now.getMonth() >= targetMonth) {
          targetYear = now.getFullYear() + 1;
        }

        d = new Date(targetYear, targetMonth, 1);
      }
    } else if (inYear && inYear[1]) {
      d = new Date(parseInt(inYear[1]), 0, 1);
    }
  }

  if (d && !isNaN(d.getTime())) {
    // Ensure the date is in the future
    if (d < now) {
      d = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
    }
    return d.toISOString().split("T")[0]; // Return YYYY-MM-DD format
  }
  return null;
}

function extractLabel(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  const m =
    t.match(/goal\s+for\s+(.*?)(?:\s+for|\s+by|\s+in|\s+on|\s*\$|\s*\d|$)/i) ||
    t.match(/add\s+a?\s*goal\s*(?:for|to)?\s*(.*)/i) ||
    t.match(
      /i\s*want\s*to\s*(?:add|set)\s*(?:a\s*)?goal\s*(?:for|to)?\s*(.*)/i
    );
  const raw = m && m[1] ? m[1].trim() : t;
  return raw.replace(/^[,\s:-]+|[,\s:-]+$/g, "").slice(0, 60) || null;
}

// =====================
// GOAL CORE FUNCTIONS
// =====================

// Goal extraction using small model
async function extractGoalIntent(message, context) {
  try {
    const userGoals = context?.goals || [];
    const userIncome = context?.summary?.netWorth || 0;
    const userSpending = context?.transactions?.spendByCategory || [];
    const activeGoalFlow = context?.goal_flow;

    // If there's an active goal flow, this message is likely continuing the goal conversation
    const isContinuingGoalFlow = activeGoalFlow && activeGoalFlow.active;

    // Check for goal-related keywords
    const goalKeywords = [
      "goal",
      "save",
      "saving",
      "target",
      "amount",
      "date",
      "timeline",
      "budget",
      "vacation",
      "trip",
      "car",
      "house",
      "emergency",
      "fund",
      "retirement",
      "summer",
      "winter",
      "spring",
      "fall",
      "next year",
      "month",
      "dollar",
      "money",
      "reach",
      "achieve",
      "plan",
    ];

    const hasGoalKeywords = goalKeywords.some((keyword) =>
      message.toLowerCase().includes(keyword)
    );

    const extractionPrompt = `
Analyze this message for goal-related intent and extract information:

User message: "${message}"
User context: 
- Current goals: ${JSON.stringify(
      userGoals.map((g) => ({
        label: g.label,
        amount: g.target_amount,
        date: g.target_date,
      }))
    )}
- Net worth: $${userIncome}
- Recent spending categories: ${JSON.stringify(userSpending.slice(0, 5))}
- Active goal flow: ${
      isContinuingGoalFlow ? "YES - user is continuing goal setup" : "NO"
    }
- Has goal keywords: ${hasGoalKeywords ? "YES" : "NO"}

Return ONLY valid JSON (no markdown, no code blocks, no explanations). Do not wrap in \`\`\`json\`\`\` blocks:
{
  "intent": "goal_create|goal_advice|goal_question|goal_manage|not_goal",
  "confidence": 0.0-1.0,
  "extracted": {
    "label": "extracted goal name or null",
    "target_amount": number or null,
    "target_date": "YYYY-MM-DD" or null,
    "category": "emergency_fund|vacation|car|house_down_payment|education|retirement|wedding|debt_payoff|investment|other" or null,
    "goal_id": "for edit/delete operations" or null
  },
  "needs_advice": true/false,
  "needs_encouragement": true/false,
  "context_hints": ["relevant user context strings"]
}

RULES:
1. If there's an active goal flow OR message mentions saving, goals, targets, aspirations → goal intent (high confidence)
2. If message contains time references (next year, summer, months) during goal flow → likely goal_create
3. Extract amounts in dollars (e.g., "$5000", "5k", "five thousand")
4. Extract dates (e.g., "by March", "in 6 months", "next year", "2025-12-31") - handle typos like "summaer"
5. Guess category from goal name if not specified
6. Set needs_advice=true if asking for financial advice about goals
7. Set needs_encouragement=true if user seems uncertain or needs motivation
8. IMPORTANT: If active goal flow exists, classify as goal_create with high confidence unless clearly unrelated
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
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: extractionPrompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = errorText;
      }
      console.error("❌ [GOAL EXTRACTION] OpenRouter error details:", {
        status: response.status,
        statusText: response.statusText,
        error: errorDetails,
      });
      throw new Error(
        `OpenRouter error ${response.status}: ${JSON.stringify(errorDetails)}`
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("No content in response");
    }

    // Strip markdown code blocks if present
    let cleanContent = content;
    if (content.startsWith("```") && content.endsWith("```")) {
      cleanContent = content.slice(3, -3).trim();
    }
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }

    const result = JSON.parse(cleanContent);
    console.log("🎯 [GOAL EXTRACTION] Result:", result);
    return result;
  } catch (error) {
    console.error("❌ [GOAL EXTRACTION] Error:", error);
    return {
      intent: "not_goal",
      confidence: 0.0,
      extracted: {
        label: null,
        target_amount: null,
        target_date: null,
        category: null,
        goal_id: null,
      },
      needs_advice: false,
      needs_encouragement: false,
      context_hints: [],
    };
  }
}

// Goal feasibility analysis with financial advisor tone
async function analyzeGoalFeasibility(goalData, userContext) {
  try {
    const userGoals = userContext?.goals || [];
    const netWorth = userContext?.summary?.netWorth || 0;
    const monthlySpending = userContext?.transactions?.spendByCategory || [];
    const totalMonthlySpend = monthlySpending.reduce(
      (sum, cat) => sum + (cat.total_spend || 0),
      0
    );
    const estimatedMonthlyIncome = totalMonthlySpend * 1.2; // Rough estimate

    const analysisPrompt = `
You are a Gen Z financial advisor analyzing a goal for a user. Be encouraging, relatable, and practical.

Goal data: ${JSON.stringify(goalData)}
User context:
- Net worth: $${netWorth}
- Estimated monthly income: $${estimatedMonthlyIncome}
- Current goals: ${JSON.stringify(
      userGoals.map((g) => ({
        label: g.label,
        amount: g.target_amount,
        date: g.target_date,
      }))
    )}
- Monthly spending: $${totalMonthlySpend}

Return ONLY valid JSON (no markdown, no code blocks, no explanations). Do not wrap in \`\`\`json\`\`\` blocks:
{
  "feasibility": "high|medium|low",
  "monthly_savings_needed": number,
  "percentage_of_income": number,
  "timeline_realistic": true/false,
  "conflicts_with_existing": ["list of conflicting goals"],
  "advice": "practical advice string",
  "encouragement": "motivational message string",
  "suggestions": ["alternative approaches"],
  "red_flags": ["any concerns"],
  "tone": "supportive|concerned|excited"
}

RULES:
1. Be a Gen Z financial advisor - use emojis, be relatable, not just numbers
2. If monthly savings > 50% of income, mark as low feasibility
3. If conflicts with existing goals, mention them
4. Give practical, actionable advice
5. Be encouraging but realistic
6. Consider the user's financial situation
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
          temperature: 0.3,
          messages: [
            {
              role: "user",
              content: analysisPrompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = errorText;
      }
      console.error("❌ [GOAL ANALYSIS] OpenRouter error details:", {
        status: response.status,
        statusText: response.statusText,
        error: errorDetails,
      });
      throw new Error(
        `OpenRouter error ${response.status}: ${JSON.stringify(errorDetails)}`
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("No content in response");
    }

    // Strip markdown code blocks if present
    let cleanContent = content;
    if (content.startsWith("```") && content.endsWith("```")) {
      cleanContent = content.slice(3, -3).trim();
    }
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7).trim();
    }

    const result = JSON.parse(cleanContent);
    console.log("📊 [GOAL ANALYSIS] Result:", result);
    return result;
  } catch (error) {
    console.error("❌ [GOAL ANALYSIS] Error:", error);
    return {
      feasibility: "medium",
      monthly_savings_needed: 0,
      percentage_of_income: 0,
      timeline_realistic: true,
      conflicts_with_existing: [],
      advice: "This looks like a solid goal! Let's make it happen.",
      encouragement: "You've got this! Every goal starts with a decision.",
      suggestions: [],
      red_flags: [],
      tone: "supportive",
    };
  }
}

// =====================
// GOAL CONVERSATION HANDLERS
// =====================

// Conversational goal handler with goal_flow parameter
async function handleGoalConversation(message, context) {
  const startTime = Date.now();
  const userId = context?.user_id;

  if (!userId) {
    return {
      message: "Please log in to work with your goals! 🔐",
      type: "assistant",
      intent: "goal_conversation",
    };
  }

  try {
    // Deterministic list-goals guard
    const m = (message || "").toLowerCase();
    const wantsList =
      /\b(what are|show|list|see)\b.*\b(my|current)\b.*\b(goal|goals)\b/.test(
        m
      ) || /\b(my goals|current goals|goals overview)\b/.test(m);

    if (wantsList) {
      // Ensure goals are loaded in context if missing
      if (!Array.isArray(context?.goals)) {
        try {
          const { data } = await supabase.rpc("get_goals_overview", {
            p_user_id: userId,
            p_limit: 10,
          });
          context.goals = (data || []).map((g) => ({
            label: g.label,
            current_amount: g.current_amount,
            target_amount: g.target_amount,
            progress_pct: g.progress_pct,
            target_date: g.target_date,
          }));
        } catch {}
      }
      return await handleGoalQuestion(
        { intent: "goal_question" },
        context,
        message
      );
    }

    // 1. Extract goal intent with small model
    const extraction = await extractGoalIntent(message, context);

    if (extraction.intent === "not_goal" || extraction.confidence < 0.5) {
      return {
        message:
          "I'm not sure what you're asking about goals. Could you clarify? 🤔",
        type: "assistant",
        intent: "goal_conversation",
      };
    }

    // Short-circuit affirmations for active flow
    const flow = context?.goal_flow;
    if (flow && flow.active) {
      const yes = /\b(yes|yep|yeah|create|go ahead|confirm)\b/i.test(message);
      const no = /\b(no|cancel|stop|nevermind)\b/i.test(message);
      if (no) {
        return {
          message: "No problem — I canceled the goal setup.",
          type: "assistant",
          intent: "goal_conversation",
          goal_flow: { ...flow, active: false },
        };
      }
      if (yes && flow.action === "create") {
        // proceed with existing slots
        const analysis = await analyzeGoalFeasibility(flow.slots, context);
        return await createGoalFromSlots(flow.slots, context, analysis);
      }
      // Otherwise, continue normal branching
    }

    // 2. Handle different goal intents
    switch (extraction.intent) {
      case "goal_create":
        return await handleGoalCreation(extraction, context, message);

      case "goal_advice":
        return await handleGoalAdvice(extraction, context, message);

      case "goal_question":
        return await handleGoalQuestion(extraction, context, message);

      case "goal_manage":
        return await handleGoalManagement(extraction, context, message);

      default:
        return {
          message:
            "I'm not sure how to help with that goal request. Can you be more specific? 🤷‍♀️",
          type: "assistant",
          intent: "goal_conversation",
        };
    }
  } catch (error) {
    console.error("❌ [GOAL CONVERSATION] Error:", error);
    return {
      message:
        "Sorry, I hit a snag while processing your goal request. Try again? 🔄",
      type: "assistant",
      intent: "goal_conversation",
    };
  }
}

// Handle goal creation with conversation flow
async function handleGoalCreation(extraction, context, message) {
  const priorFlow = context?.goal_flow || {};
  const priorSlots = priorFlow.slots || {};

  // Get data from conversation context if available (e.g., from affordability check)
  const conversationEntity = context?.conversation_context?.last_entity;
  const conversationTopic = context?.conversation_context?.active_topic;

  // Only use context if it's relevant to goal creation
  // e.g., if we were discussing a specific item (Rolex, MacBook) for affordability
  const isRelevantContext =
    conversationTopic === "budget_planning" &&
    conversationEntity?.type === "purchase" &&
    conversationEntity?.value;

  const contextLabel = isRelevantContext ? conversationEntity?.value : null;
  const contextAmount = isRelevantContext ? conversationEntity?.amount : null;

  // Merge extracted data with prior slots and conversation context
  const slots = {
    label:
      priorSlots.label || extraction.extracted.label || contextLabel || null,
    target_amount:
      priorSlots.target_amount ||
      extraction.extracted.target_amount ||
      contextAmount ||
      null,
    target_date:
      priorSlots.target_date || extraction.extracted.target_date || null,
    category: priorSlots.category || extraction.extracted.category || null,
  };

  // Auto-categorize if we have a label but no category
  if (slots.label && !slots.category) {
    slots.category = guessGoalCategory(slots.label);
  }

  console.log(`🎯 [GOAL] Creating goal with slots:`, {
    label: slots.label,
    amount: slots.target_amount,
    from_context: contextLabel || contextAmount ? true : false,
  });

  // Check what's missing
  const missing = [];
  if (!slots.label) missing.push("label");
  if (!slots.target_amount) missing.push("target_amount");
  if (!slots.target_date) missing.push("target_date");
  if (!slots.category) missing.push("category");

  // If we have all the data, analyze feasibility and create goal
  if (missing.length === 0) {
    const analysis = await analyzeGoalFeasibility(slots, context);

    // Check for conflicts with existing goals
    if (analysis.conflicts_with_existing.length > 0) {
      return {
        message: `⚠️ Heads up! This goal might conflict with your existing goals: ${analysis.conflicts_with_existing.join(
          ", "
        )}. ${analysis.advice}`,
        type: "assistant",
        intent: "goal_conversation",
        goal_flow: {
          action: "create",
          slots: slots,
          stage: "conflict_warning",
          active: true,
        },
        actions: [
          {
            label: "Continue Anyway",
            action: "create_anyway",
            style: "primary",
          },
          {
            label: "Modify Goal",
            action: "modify",
            style: "secondary",
          },
          {
            label: "Cancel Goal",
            action: "cancel_goal",
            style: "secondary",
          },
        ],
      };
    }

    // If feasibility is low, warn user
    if (analysis.feasibility === "low") {
      return {
        message: `🚨 ${analysis.encouragement} But I'm a bit concerned - you'd need to save $${analysis.monthly_savings_needed}/month (${analysis.percentage_of_income}% of your income). ${analysis.advice}`,
        type: "assistant",
        intent: "goal_conversation",
        goal_flow: {
          action: "create",
          slots: slots,
          stage: "feasibility_warning",
          active: true,
        },
        actions: [
          {
            label: "Create Goal",
            action: "create_anyway",
            style: "primary",
          },
          {
            label: "Adjust Timeline",
            action: "modify",
            style: "secondary",
          },
          {
            label: "Cancel Goal",
            action: "cancel_goal",
            style: "secondary",
          },
        ],
      };
    }

    // All good - create the goal
    return await createGoalFromSlots(slots, context, analysis);
  }

  // Missing information - ask for it intelligently
  const goalName = slots.label || "goal";

  // Build smart prompt based on what's missing
  let promptMessage = "";
  let needsAmount = missing.includes("target_amount");
  let needsDate = missing.includes("target_date");
  let needsLabel = missing.includes("label");
  let needsCategory = missing.includes("category");

  if (missing.length === 1) {
    // Only one thing missing - ask specifically
    if (needsLabel) {
      promptMessage =
        "🎯 What should we call this goal? (e.g., Emergency fund, Dream vacation, New car)";
    } else if (needsAmount) {
      promptMessage = `💰 How much do you want to save for your ${goalName}? (e.g., $5000)`;
    } else if (needsDate) {
      promptMessage = `⏰ When do you want to reach your ${goalName}? (e.g., by January 2026 or in 2 years)`;
    } else if (needsCategory) {
      promptMessage =
        "📂 Which category fits best? (emergency_fund, vacation, car, house_down_payment, education, retirement, wedding, debt_payoff, investment, other)";
    }
  } else if (missing.length === 2) {
    // Two things missing - ask for both together
    if (needsAmount && needsDate) {
      promptMessage = `💰⏰ How much do you want to save for your ${goalName} and when do you want to reach it? (e.g., $5000 by summer 2025)`;
    } else if (needsLabel && needsAmount) {
      promptMessage =
        "🎯💰 What should we call this goal and how much do you want to save? (e.g., Hawaii vacation for $5000)";
    } else if (needsLabel && needsDate) {
      promptMessage =
        "🎯⏰ What should we call this goal and when do you want to reach it? (e.g., Hawaii vacation by summer 2025)";
    } else if (needsAmount && needsCategory) {
      promptMessage = `💰📂 How much do you want to save for your ${goalName} and what category? (e.g., $5000 for vacation)`;
    } else if (needsDate && needsCategory) {
      promptMessage = `⏰📂 When do you want to reach your ${goalName} and what category? (e.g., by summer 2025 for vacation)`;
    } else if (needsLabel && needsCategory) {
      promptMessage =
        "🎯📂 What should we call this goal and what category? (e.g., Hawaii vacation)";
    }
  } else if (missing.length >= 3) {
    // Multiple things missing - ask for the most important ones
    if (needsAmount && needsDate) {
      promptMessage = `💰⏰ How much do you want to save for your ${goalName} and when do you want to reach it? (e.g., $5000 by summer 2025)`;
    } else {
      promptMessage = `🎯💰⏰ Tell me more about your goal: what should we call it, how much do you want to save, and when? (e.g., Hawaii vacation for $5000 by summer 2025)`;
    }
  }

  // Add skip button if only category is missing (optional field)
  const actions = [];
  if (missing.length === 1 && needsCategory) {
    actions.push({
      label: "Skip Category",
      action: "skip_category",
      style: "secondary",
    });
  }

  // Always add start over and cancel buttons
  actions.push(
    {
      label: "Start Over",
      action: "start_over_goal",
      style: "secondary",
    },
    {
      label: "Cancel Goal",
      action: "cancel_goal",
      style: "secondary",
    }
  );

  return {
    message: promptMessage,
    type: "assistant",
    intent: "goal_conversation",
    goal_flow: {
      action: "create",
      slots: slots,
      stage: "collecting",
      active: true,
    },
    actions: actions,
  };
}

// Handle goal advice requests
async function handleGoalAdvice(extraction, context, message) {
  if (extraction.extracted.target_amount && extraction.extracted.target_date) {
    const analysis = await analyzeGoalFeasibility(
      extraction.extracted,
      context
    );

    let response = `${analysis.encouragement} `;

    if (analysis.feasibility === "high") {
      response += `This goal looks totally doable! You'd need to save about $${analysis.monthly_savings_needed}/month. ${analysis.advice}`;
    } else if (analysis.feasibility === "medium") {
      response += `This is ambitious but possible! You'd need $${analysis.monthly_savings_needed}/month (${analysis.percentage_of_income}% of your income). ${analysis.advice}`;
    } else {
      response += `This is a stretch goal - you'd need $${analysis.monthly_savings_needed}/month. ${analysis.advice}`;
    }

    if (analysis.suggestions.length > 0) {
      response += `\n\n💡 Here are some alternatives: ${analysis.suggestions.join(
        ", "
      )}`;
    }

    return {
      message: response,
      type: "assistant",
      intent: "goal_conversation",
      goal_flow: {
        action: "advice",
        slots: extraction.extracted,
        stage: "completed",
        active: false,
      },
      actions: [
        {
          label: "Create This Goal",
          action: "create_from_advice",
          style: "primary",
        },
      ],
    };
  }

  return {
    message:
      "I'd love to help with goal advice! Could you tell me more about what you're trying to save for and by when? 🤔",
    type: "assistant",
    intent: "goal_conversation",
  };
}

// Handle goal questions
async function handleGoalQuestion(extraction, context, message) {
  const userGoals = context?.goals || [];

  if (userGoals.length === 0) {
    return {
      message:
        "You don't have any goals set up yet! Want to create your first one? 🎯",
      type: "assistant",
      intent: "goal_conversation",
      actions: [
        {
          label: "Create Goal",
          action: "create_new",
          style: "primary",
        },
      ],
    };
  }

  // Simple goal listing
  let response = "Here are your current goals: 📋\n\n";
  userGoals.forEach((goal, index) => {
    const progress = (
      ((goal.current_amount || 0) / goal.target_amount) *
      100
    ).toFixed(1);
    response += `${index + 1}. **${goal.label}**: $${
      goal.current_amount || 0
    } / $${goal.target_amount} (${progress}%) - Due ${goal.target_date}\n`;
  });

  response += "\nWant to add a new goal or modify an existing one? 🚀";

  return {
    message: response,
    type: "assistant",
    intent: "goal_conversation",
    actions: [
      {
        label: "Add New Goal",
        action: "create_new",
        style: "primary",
      },
      {
        label: "View Details",
        action: "view_details",
        style: "secondary",
      },
    ],
  };
}

// Handle goal management (edit/delete)
async function handleGoalManagement(extraction, context, message) {
  // This would handle editing/deleting existing goals
  // For now, return a simple response
  return {
    message: "I can help you manage your goals! What would you like to do? ✏️",
    type: "assistant",
    intent: "goal_conversation",
    actions: [
      {
        label: "Edit Goal",
        action: "edit_goal",
        style: "primary",
      },
      {
        label: "Delete Goal",
        action: "delete_goal",
        style: "secondary",
      },
    ],
  };
}

// Create goal from slots
async function createGoalFromSlots(
  slots,
  context,
  analysis,
  showConfirmation = true
) {
  const userId = context?.user_id;

  // If we need to show confirmation first
  if (showConfirmation) {
    const targetDate = new Date(slots.target_date);
    const formattedDate = targetDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const monthlySavings = analysis?.monthly_savings_needed || 0;
    const feasibility = analysis?.feasibility || "unknown";

    let confirmationMessage = `🎯 **Goal Confirmation**\n\n`;
    confirmationMessage += `Here's what I'm about to create for you:\n\n`;
    confirmationMessage += `📋 **Goal Details:**\n`;
    confirmationMessage += `• **Name:** ${slots.label}\n`;
    confirmationMessage += `• **Target Amount:** $${Number(
      slots.target_amount
    ).toLocaleString()}\n`;
    confirmationMessage += `• **Target Date:** ${formattedDate}\n`;
    confirmationMessage += `• **Category:** ${slots.category}\n\n`;

    if (monthlySavings > 0) {
      confirmationMessage += `💰 **Monthly Savings Needed:** $${monthlySavings.toLocaleString()}\n\n`;
    }

    if (feasibility === "high") {
      confirmationMessage += `✅ **Feasibility:** This looks totally doable!\n\n`;
    } else if (feasibility === "medium") {
      confirmationMessage += `⚠️ **Feasibility:** This is ambitious but possible!\n\n`;
    } else if (feasibility === "low") {
      confirmationMessage += `🚨 **Feasibility:** This is a stretch goal - consider adjusting your timeline.\n\n`;
    }

    confirmationMessage += `Does this look good to you?`;

    return {
      message: confirmationMessage,
      type: "assistant",
      intent: "goal_conversation",
      goal_flow: {
        action: "confirm_create",
        slots: slots,
        stage: "confirmation",
        active: true,
        analysis: analysis,
      },
      actions: [
        {
          label: "✅ Confirm Goal",
          action: "confirm_create_goal",
          style: "primary",
        },
        {
          label: "❌ Cancel",
          action: "cancel_goal",
          style: "secondary",
        },
      ],
    };
  }

  // Actually create the goal (called when user confirms)
  const goalRow = {
    user_id: userId,
    label: String(slots.label),
    description: null,
    note: null,
    target_amount: Math.round(Number(slots.target_amount)),
    current_amount: 0,
    target_date: String(slots.target_date),
    category: String(slots.category || "other"),
    status: "active",
  };

  try {
    const { data, error } = await supabase
      .from("goals")
      .insert([goalRow])
      .select()
      .single();

    if (error) {
      console.error("❌ [GOAL] Insert failed:", error);
      return {
        message:
          "I couldn't save that goal right now. Please try again shortly. 😅",
        type: "assistant",
        intent: "goal_conversation",
        goal_flow: { active: false },
      };
    }

    // Store goal creation memory in Supermemory (non-blocking)
    if (data && userId) {
      setImmediate(async () => {
        try {
          const { storeGoalCreationMemory } = await import(
            "../lib/memoryUtils.js"
          );
          await storeGoalCreationMemory(
            userId,
            {
              id: data.id,
              label: data.label,
              target_amount: data.target_amount,
              current_amount: data.current_amount,
              target_date: data.target_date,
              category: data.category,
              note: data.note,
            },
            "chat",
            {
              chat_id: context?.chat_id,
              analysis: analysis,
              goal_flow_stage: "completed",
            }
          );
        } catch (error) {
          console.error("❌ [GOAL MEMORY] Failed to store goal memory:", error);
          // Don't throw - memory storage failures shouldn't break goal creation
        }
      });
    }

    const niceAmt = `$${Number(goalRow.target_amount).toLocaleString()}`;
    const response = `🎉 ${analysis.encouragement} Your "${goalRow.label}" goal is all set for ${niceAmt} by ${goalRow.target_date}!\n\n${analysis.advice}`;

    return {
      message: response,
      type: "assistant",
      intent: "goal_conversation",
      goal: data,
      goal_flow: {
        action: "create",
        slots: slots,
        stage: "completed",
        active: false,
      },
    };
  } catch (e) {
    console.error("❌ [GOAL] Unexpected error:", e);
    return {
      message: "Hit an error while saving your goal. Please try again. 🔄",
      type: "assistant",
      intent: "goal_conversation",
      goal_flow: { active: false },
    };
  }
}

// =====================
// LEGACY GOAL HANDLER (for backward compatibility)
// =====================

// Legacy goal handler (original implementation)
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
  if (lbl) {
    const trimmedLabel = lbl.replace(/\s{2,}/g, " ").trim();
    // Capitalize first letter of goal label
    extracted.label =
      trimmedLabel.charAt(0).toUpperCase() + trimmedLabel.slice(1);
  }
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

// =====================
// EXPORTS
// =====================

export {
  // Core functions
  handleGoalConversation,
  handleGoal,

  // Utility functions
  extractGoalIntent,
  analyzeGoalFeasibility,
  guessGoalCategory,
  parseCurrencyAmount,
  parseTargetDate,
  extractLabel,

  // Handler functions
  handleGoalCreation,
  handleGoalAdvice,
  handleGoalQuestion,
  handleGoalManagement,
  createGoalFromSlots,

  // Constants
  GOAL_CATEGORY_KEYWORDS,

  // Utilities
  generateRequestId,
  redactPII,
  withTimeout,
  logConversation,
  supabase,
  MEMORY_EXTRACTION_MODEL,
};
