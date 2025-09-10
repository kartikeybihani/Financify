// api/finny.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Facts pipeline types and constants
const DEFAULT_TTLS = {
  ira_limit: 15552000, // 180d
  "401k_limit": 15552000,
  estate_exemption: 15552000,
  gift_exclusion: 15552000,

  // Chase cards
  card_chase_sapphire_preferred: 2592000, // 30d
  card_chase_sapphire_reserve: 2592000,
  card_chase_sapphire_general: 2592000,
  card_chase_ultimate_rewards: 2592000,
  card_chase_freedom_unlimited: 2592000,
  card_chase_freedom_flex: 2592000,
  card_chase_freedom_general: 2592000,
  card_chase_general: 2592000,

  // Amex cards
  card_amex_platinum: 2592000,
  card_amex_gold: 2592000,
  card_amex_green: 2592000,
  card_amex_blue_cash: 2592000,
  card_amex_delta: 2592000,
  card_amex_hilton: 2592000,
  card_amex_marriott: 2592000,
  card_amex_general: 2592000,

  // Other
  card_bilt_partners: 2592000,
  card_comparison: 1209600, // 14d - shorter for comparisons
  card_general: 2592000,
  generic: 1209600, // 14d
};

const ALLOWLIST = [
  "https://www.irs.gov",
  "https://www.chase.com",
  "https://creditcards.chase.com",
  "https://account.chase.com",
  "https://www.biltrewards.com",
  "https://www.americanexpress.com",
  "https://www.americanexpress.com/us/credit-cards",
];

// Enhanced source mapping with multiple URLs for comprehensive coverage
const SOURCE_MAPPING = {
  // Chase cards - multiple sources for comprehensive coverage
  card_chase_sapphire_preferred: [
    "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
    "https://account.chase.com/sapphire/preferred/benefits",
  ],
  card_chase_sapphire_reserve: [
    "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
    "https://account.chase.com/sapphire/reserve/benefits",
  ],
  card_chase_sapphire_general: [
    "https://creditcards.chase.com/rewards-credit-cards/sapphire",
    "https://account.chase.com/sapphire",
  ],
  card_chase_ultimate_rewards: [
    "https://creditcards.chase.com/ultimate-rewards",
    "https://www.chase.com/personal/credit-cards/education/basics/how-chase-ultimate-rewards-works",
  ],
  card_chase_freedom_unlimited: [
    "https://creditcards.chase.com/cash-back-credit-cards/freedom-unlimited",
  ],
  card_chase_freedom_flex: [
    "https://creditcards.chase.com/cash-back-credit-cards/freedom-flex",
  ],
  card_chase_freedom_general: [
    "https://creditcards.chase.com/cash-back-credit-cards/freedom",
  ],
  card_chase_general: ["https://creditcards.chase.com/"],

  // Amex cards - comprehensive coverage
  card_amex_platinum: [
    "https://www.americanexpress.com/us/credit-cards/card/platinum",
    "https://www.americanexpress.com/us/credit-cards/card/platinum/benefits",
  ],
  card_amex_gold: [
    "https://www.americanexpress.com/us/credit-cards/card/gold-card",
    "https://www.americanexpress.com/us/credit-cards/card/gold-card/benefits",
  ],
  card_amex_green: [
    "https://www.americanexpress.com/us/credit-cards/card/green-card",
  ],
  card_amex_blue_cash: [
    "https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred",
  ],
  card_amex_delta: [
    "https://www.americanexpress.com/us/credit-cards/category/delta-skymiles",
  ],
  card_amex_hilton: [
    "https://www.americanexpress.com/us/credit-cards/category/hilton-honors",
  ],
  card_amex_marriott: [
    "https://www.americanexpress.com/us/credit-cards/category/marriott-bonvoy",
  ],
  card_amex_general: ["https://www.americanexpress.com/us/credit-cards/"],

  // Other cards
  card_bilt_partners: [
    "https://www.biltrewards.com/rewards/travel",
    "https://www.biltrewards.com/credit-card",
  ],
  card_comparison: [
    "https://creditcards.chase.com/",
    "https://www.americanexpress.com/us/credit-cards/",
  ],
  card_general: ["https://creditcards.chase.com/"],

  // Tax and retirement limits
  ira_limit_2025: [
    "https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits",
  ],
  "401k_limit_2025": [
    "https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits",
  ],
  estate_exemption_2025: [
    "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025",
  ],
  gift_exclusion_2025: [
    "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025",
  ],
};

// Helper functions for facts pipeline
function inferTopic(text, entities) {
  const t = `${text} ${(entities || []).join(" ")}`.toLowerCase();
  const m = t.match(/(20\d{2})/);
  const year = m ? parseInt(m[1], 10) : new Date().getFullYear();

  // Credit card comparisons - check FIRST (more lenient)
  // Only trigger comparison if explicitly asking to compare two specific cards
  if (
    ((t.includes("vs") || t.includes("versus") || t.includes("compare")) &&
      t.includes("chase") &&
      (t.includes("amex") || t.includes("bilt"))) ||
    (t.includes("amex") && (t.includes("chase") || t.includes("bilt"))) ||
    (t.includes("bilt") && (t.includes("chase") || t.includes("amex")))
  ) {
    return { kind: "card_comparison", year: null };
  }

  // Tax and retirement limits
  if (t.includes("estate")) return { kind: "estate_exemption", year };
  if (t.includes("gift")) return { kind: "gift_exclusion", year };
  if (t.includes("401k") || t.includes("401(k)"))
    return { kind: "401k_limit", year };
  if (t.includes("ira")) return { kind: "ira_limit", year };

  // Bilt rewards - check before other cards
  if (t.includes("bilt")) return { kind: "card_bilt_partners", year: null };

  // Chase cards - much more specific
  if (t.includes("chase")) {
    // Specific Chase cards first
    if (t.includes("sapphire preferred"))
      return { kind: "card_chase_sapphire_preferred", year: null };
    if (t.includes("sapphire reserve"))
      return { kind: "card_chase_sapphire_reserve", year: null };
    if (t.includes("sapphire"))
      return { kind: "card_chase_sapphire_general", year: null };
    if (
      t.includes("ultimate rewards") ||
      (t.includes("ultimate") && t.includes("rewards"))
    )
      return { kind: "card_chase_ultimate_rewards", year: null };
    if (t.includes("freedom unlimited"))
      return { kind: "card_chase_freedom_unlimited", year: null };
    if (t.includes("freedom flex"))
      return { kind: "card_chase_freedom_flex", year: null };
    if (t.includes("freedom"))
      return { kind: "card_chase_freedom_general", year: null };

    // General Chase cards - more inclusive
    if (
      t.includes("card") ||
      t.includes("credit") ||
      t.includes("benefit") ||
      t.includes("rewards") ||
      t.includes("chase")
    ) {
      return { kind: "card_chase_general", year: null };
    }
  }

  // Amex cards - much more specific
  if (t.includes("amex") || t.includes("american express")) {
    if (t.includes("platinum"))
      return { kind: "card_amex_platinum", year: null };
    if (t.includes("gold")) return { kind: "card_amex_gold", year: null };
    if (t.includes("green")) return { kind: "card_amex_green", year: null };
    if (t.includes("blue cash"))
      return { kind: "card_amex_blue_cash", year: null };
    if (t.includes("delta")) return { kind: "card_amex_delta", year: null };
    if (t.includes("hilton")) return { kind: "card_amex_hilton", year: null };
    if (t.includes("marriott"))
      return { kind: "card_amex_marriott", year: null };
    return { kind: "card_amex_general", year: null };
  }

  // General credit cards
  if (
    t.includes("credit card") ||
    t.includes("card benefit") ||
    t.includes("rewards")
  )
    return { kind: "card_general", year: null };

  return { kind: "generic", year: m ? parseInt(m[1], 10) : null };
}

function keyFor(kind, year) {
  return year ? `${kind}_${year}` : `${kind}`;
}

function sourceFor(kind, year) {
  const k = keyFor(kind, year || undefined);
  const urls = SOURCE_MAPPING[k];
  // Return the first URL from the array, or null if not found
  return urls ? urls[0] : null;
}

function sourcesFor(kind, year) {
  const k = keyFor(kind, year || undefined);
  return SOURCE_MAPPING[k] || [];
}

function isAllowed(url) {
  try {
    const u = new URL(url);
    return ALLOWLIST.some((d) => u.origin.startsWith(d));
  } catch {
    return false;
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
  console.log("📝 [FINNY] Message received:", message);
  console.log("📊 [FINNY] Context provided:", context ? "Yes" : "No");

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  try {
    let response;

    switch (action) {
      case "ask":
        response = await handleAsk(message, context);
        break;
      case "classify":
        response = await handleClassify(message, context);
        break;
      case "goal":
        response = await handleGoal(message, context, otherParams);
        break;
      case "ask_personalized":
        response = await handleAskPersonalized(message, context);
        break;
      case "ask_concept_static":
        response = await handleAskConceptStatic(message, context);
        break;
      case "ask_fact_fresh":
        response = await handleAskFactFresh(message, context);
        break;
      case "ask_state_rule":
        response = await handleAskStateRule(message, context);
        break;
      case "calc_projection":
        response = await handleCalcProjection(message, context);
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
  console.log("🔍 [FINNY] Starting classification for message:", message);

  // First classify the intent
  try {
    const classification = await handleClassify(message, context);
    console.log("🎯 [FINNY] Classification result:", classification);

    // Route to appropriate handler based on intent
    switch (classification.intent) {
      case "goal":
        return await handleGoal(message, context);
      case "ask_personalized":
        return await handleAskPersonalized(message, context);
      case "ask_concept_static":
        return await handleAskConceptStatic(message, context);
      case "ask_fact_fresh":
        return await handleAskFactFresh(message, context);
      case "ask_state_rule":
        return await handleAskStateRule(message, context);
      case "calc_projection":
        return await handleCalcProjection(message, context);
      default:
        // Fallback to original ask handler
        break;
    }
  } catch (error) {
    console.error("❌ [FINNY] Classification failed, using fallback:", error);
    // Continue to original ask handler as fallback
  }

  // Original ask handler logic as fallback
  console.log("🔄 [FINNY] Using fallback ask handler");

  // Provide default values if context is undefined or incomplete
  const safeContext = {
    accounts: context?.accounts || [],
    investments: context?.investments || [],
    liabilities: context?.liabilities || [],
    transactions: context?.transactions || [],
    goals: context?.goals || [],
    summary: context?.summary || {
      netWorth: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      totalInvestments: 0,
    },
  };

  const systemPrompt = `
You are Finny, a financial psychologist and planning expert. Your role is to:
1. Understand the user's financial goals and concerns
2. Provide empathetic, practical advice
3. Help users make informed financial decisions
4. Guide users through goal-setting when appropriate

You have access to the user's complete financial context:

ACCOUNTS:
${safeContext.accounts
  .map(
    (acc) =>
      `- ${acc.name.replace(/[^\w\s]/g, "")} (${acc.type}/${acc.subtype})
  Balance: $${acc.balance}
  Available: $${acc.available}
  Institution: ${acc.institution.replace(/[^\w\s]/g, "")}`
  )
  .join("\n")}

INVESTMENTS:
${safeContext.investments
  .map(
    (inv) =>
      `- ${inv.name.replace(/[^\w\s]/g, "")} (${inv.type})
  Balance: $${inv.balance}
  Quantity: ${inv.quantity}
  Value: $${inv.value}
  Cost Basis: $${inv.cost_basis}`
  )
  .join("\n")}

LIABILITIES:
${safeContext.liabilities
  .map(
    (liab) =>
      `- ${liab.name.replace(/[^\w\s]/g, "")} (${liab.type})
  Balance: $${liab.balance}
  APR: ${liab.apr}%
  Minimum Payment: $${liab.minimum_payment}`
  )
  .join("\n")}

RECENT TRANSACTIONS:
${safeContext.transactions
  .slice(0, 5)
  .map(
    (txn) =>
      `- ${txn.date}: $${txn.amount} at ${(
        txn.merchant || txn.description
      ).replace(/[^\w\s]/g, "")}
  Category: ${
    Array.isArray(txn.category) ? txn.category.join(", ") : "Uncategorized"
  }
  Account: ${txn.account.replace(/[^\w\s]/g, "")}`
  )
  .join("\n")}

ACTIVE GOALS:
${safeContext.goals
  .map(
    (goal) =>
      `- ${goal.label.replace(/[^\w\s]/g, "")}
  Target: $${goal.target}
  Progress: ${goal.progress}%
  Timeline: ${goal.timeline?.month || "Unknown"} ${
        goal.timeline?.year || new Date().getFullYear()
      }
  Description: ${goal.description.replace(/[^\w\s]/g, "")}`
  )
  .join("\n")}

FINANCIAL SUMMARY:
- Net Worth: $${safeContext.summary.netWorth}
- Monthly Income: $${safeContext.summary.monthlyIncome}
- Monthly Expenses: $${safeContext.summary.monthlyExpenses}
- Total Assets: $${safeContext.summary.totalAssets}
- Total Liabilities: $${safeContext.summary.totalLiabilities}
- Total Investments: $${safeContext.summary.totalInvestments}

When responding:
- Be empathetic and understanding
- Use a warm, supportive tone
- Provide practical, actionable advice
- Consider both emotional and financial aspects
- Help users think through their decisions
- Encourage healthy financial habits
`;

  // Call OpenRouter API for AI response
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://financify-rose.vercel.app",
          "X-Title": "Financify - Personal Finance Assistant",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: message,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "❌ [FINNY] OpenRouter API error:",
        response.status,
        response.statusText
      );
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage =
      data.choices?.[0]?.message?.content ||
      "I'm having trouble generating a response right now. Please try again.";

    return {
      message: aiMessage,
      type: "assistant",
    };
  } catch (error) {
    console.error("❌ [FINNY] AI integration error:", error);
    return {
      message:
        "I'm having some technical difficulties right now. Please try again in a moment.",
      type: "assistant",
    };
  }
}

async function handleClassify(message, context) {
  console.log(
    "🔍 [FINNY] Starting classification in handleClassify for message:",
    message
  );

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

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "You are Financify's intent router.",
              "Classify one user message into exactly one intent.",
              "Intents:",
              "- goal  set or modify a savings or payoff goal",
              "- ask_personalized  question about the user's money that needs their data",
              "- ask_concept_static  timeless concept explainers",
              "- ask_fact_fresh  current year numbers or facts that change",
              "- ask_state_rule  state specific rules or taxes",
              "- calc_projection  what if or plan math",
              "",
              "Rules:",
              "- If message asks for this year current latest updated 2025 etc then ask_fact_fresh",
              "- If asking about specific financial products (cards, banks, rates, benefits, offers) that change over time then ask_fact_fresh",
              "- If comparing specific products/services by name (e.g., 'Chase vs Amex', 'Vanguard vs Fidelity') then ask_fact_fresh",
              "- If a US state is mentioned choose ask_state_rule and set state",
              "- If affordability or FIRE by age or projection choose calc_projection",
              "- If it clearly sets a goal choose goal",
              "- If it needs the user's actual data choose ask_personalized",
              "- Otherwise choose ask_concept_static",
              "",
              "Sample inputs and expected intent:",
              '"Set a 2000 emergency fund by March" → goal',
              '"How much did I spend on Uber last month" or "How are you" or "Whats up" or "Am I normal?" → ask_personalized',
              '"Difference between Roth and traditional IRA" → ask_concept_static',
              '"What is the 2025 estate tax exemption" → ask_fact_fresh',
              '"Which card has better benefits Chase Rewards or Bolt?" → ask_fact_fresh',
              '"Does New Jersey have inheritance tax" → ask_state_rule with state NJ',
              '"Can I hit FIRE by 35" → calc_projection',
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
                    "goal",
                    "ask_personalized",
                    "ask_concept_static",
                    "ask_fact_fresh",
                    "ask_state_rule",
                    "calc_projection",
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

    return out;
  } catch (e) {
    console.error("❌ [FINNY] Classification error:", e?.message);
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

async function handleGoal(message, context, params) {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://financify-rose.vercel.app",
          "X-Title": "Financify - Personal Finance Assistant",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a financial goal extraction assistant. Extract goal information from the user's message.

Respond with ONLY a JSON object in this exact format:
{
  "label": "string or null",
  "target": number or null,
  "timeline": {"month": "string", "year": "string"} or null
}

Examples:
- "Save $5000 for vacation by December 2024" → {"label": "vacation", "target": 5000, "timeline": {"month": "December", "year": "2024"}}
- "I want to save for a car" → {"label": "car", "target": null, "timeline": null}
- "Set aside $200" → {"label": null, "target": 200, "timeline": null}`,
            },
            {
              role: "user",
              content: message,
            },
          ],
          temperature: 0.1,
          max_tokens: 150,
        }),
      }
    );

    if (!response.ok) {
      console.error("❌ [FINNY] Goal API error:", response.status);
      throw new Error(`Goal API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    try {
      const parsed = JSON.parse(aiResponse);
      return {
        label: parsed.label,
        target: parsed.target,
        timeline: parsed.timeline,
      };
    } catch (parseError) {
      console.error("❌ [FINNY] Failed to parse goal response:", aiResponse);
      throw parseError;
    }
  } catch (error) {
    console.error("❌ [FINNY] Goal extraction error:", error);
    // Fallback to basic goal structure
    return {
      label: null,
      target: null,
      timeline: null,
    };
  }
}

async function handleAskPersonalized(message, context) {
  // Handler for questions about user's personal financial data
  return {
    message: "Handling personalized question about your financial data...",
    type: "assistant",
    intent: "ask_personalized",
  };
}

async function handleAskConceptStatic(message, context) {
  // Handler for timeless financial concept explanations
  return {
    message: "Explaining financial concepts...",
    type: "assistant",
    intent: "ask_concept_static",
  };
}

async function handleAskFactFresh(message, context) {
  console.log("🔍 [FINNY] Starting facts lookup for:", message);

  try {
    const { text, entities } = {
      text: message,
      entities: context?.entities || [],
    };
    if (!text) {
      return {
        message: "I need a question to look up facts for you.",
        type: "assistant",
        intent: "ask_fact_fresh",
      };
    }

    const { kind, year } = inferTopic(text, entities);
    const key = keyFor(kind, year);
    const ttl = DEFAULT_TTLS[kind];

    // 1) Check cache first with enhanced validation
    const { data: cached } = await supabase
      .from("facts_cache")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (cached) {
      const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      const ttl = cached.ttl_seconds || DEFAULT_TTLS[kind] || 1209600; // Default 14 days

      if (age < ttl) {
        console.log(
          "✅ [FINNY] Found cached fact:",
          key,
          `(age: ${Math.round(age / 3600)}h, ttl: ${Math.round(ttl / 3600)}h)`
        );

        // Validate cached data structure
        if (
          cached.value_json &&
          cached.value_json.label &&
          cached.value_json.explanation
        ) {
          const v = cached.value_json.value;
          const label = cached.value_json.label;
          const explanation = cached.value_json.explanation;
          const src = cached.source_url;

          // Create comprehensive cached response
          let responseMessage = `${label}: ${
            typeof v === "number" ? `$${v.toLocaleString()}` : v
          }`;

          if (
            explanation &&
            explanation.length > 10 &&
            !explanation.toLowerCase().includes("not found")
          ) {
            responseMessage += `\n\n${explanation}`;
          }

          responseMessage += `\n\nSource: ${src}`;

          return {
            message: responseMessage,
            type: "assistant",
            intent: "ask_fact_fresh",
            cached: true,
          };
        } else {
          console.log(
            "⚠️ [FINNY] Cached data structure invalid, refreshing:",
            key
          );
        }
      } else {
        console.log(
          "⏰ [FINNY] Cached fact expired:",
          key,
          `(age: ${Math.round(age / 3600)}h, ttl: ${Math.round(ttl / 3600)}h)`
        );
      }
    }

    // 2) Handle comparisons specially
    if (kind === "card_comparison") {
      console.log("🔄 [FINNY] Handling card comparison request");
      return await handleCardComparison(text, entities);
    }

    // 2) Get source URLs - with comprehensive coverage
    let urls = sourcesFor(kind, year);
    if (urls.length === 0) {
      console.log(
        "🔍 [FINNY] No known sources for:",
        key,
        "- attempting fallback search"
      );

      // Fallback: construct reasonable URLs based on the topic
      if (kind.startsWith("card_chase")) {
        urls = ["https://creditcards.chase.com/"];
      } else if (kind.startsWith("card_amex")) {
        urls = ["https://www.americanexpress.com/us/credit-cards/"];
      } else if (kind.startsWith("card_bilt")) {
        urls = ["https://www.biltrewards.com/rewards/travel"];
      } else if (kind.includes("limit") && year) {
        urls = ["https://www.irs.gov/retirement-plans"];
      } else {
        console.log("❌ [FINNY] No fallback sources available for:", key);
        return {
          message:
            "I couldn't verify that from an official source yet. Want me to try a broader search?",
          type: "assistant",
          intent: "ask_fact_fresh",
          error: "NO_KNOWN_SOURCE",
        };
      }

      console.log("✅ [FINNY] Using fallback sources:", urls);
    }

    // Filter to only allowed URLs
    const allowedUrls = urls.filter((url) => isAllowed(url));
    if (allowedUrls.length === 0) {
      console.log("❌ [FINNY] No allowed sources found for:", urls);
      return {
        message: "I can't access those sources for security reasons.",
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "SOURCE_NOT_ALLOWED",
      };
    }

    // 3) Fetch multiple pages for comprehensive coverage (max 3 pages)
    console.log(
      `🔄 [FINNY] Fetching ${Math.min(
        allowedUrls.length,
        3
      )} pages for comprehensive coverage`
    );
    const fetchPromises = allowedUrls.slice(0, 3).map(async (url, index) => {
      try {
        console.log(`🔄 [FINNY] Fetching page ${index + 1}:`, url);
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; FinancifyBot/1.0)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        console.log(
          `🔍 [FINNY] Page ${index + 1} fetch status:`,
          response.status
        );

        if (!response.ok) {
          console.log(
            `⚠️ [FINNY] Page ${index + 1} fetch failed:`,
            response.status
          );
          return null;
        }

        const html = await response.text();
        console.log(
          `🔍 [FINNY] Page ${index + 1} content length:`,
          html.length
        );
        return { url, html, index: index + 1 };
      } catch (error) {
        console.error(`❌ [FINNY] Failed to fetch page ${index + 1}:`, error);
        return null;
      }
    });

    const pageResults = (await Promise.all(fetchPromises)).filter(Boolean);

    if (pageResults.length === 0) {
      console.log("❌ [FINNY] Failed to fetch any pages");
      return {
        message:
          "I couldn't retrieve the information from the official sources right now. Please try again later.",
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "FETCH_FAILED",
      };
    }

    console.log(`✅ [FINNY] Successfully fetched ${pageResults.length} pages`);

    // Combine all page content for comprehensive extraction
    const combinedContent = pageResults
      .map(
        (page) =>
          `=== PAGE ${page.index}: ${page.url} ===\n${page.html.slice(
            0,
            50000
          )}`
      )
      .join("\n\n");

    // 4) Extract fact using structured outputs
    console.log("🤖 [FINNY] Extracting fact with AI...");
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `You are a comprehensive financial information extractor. Extract detailed, actionable information from official web pages and return as JSON.

CRITICAL: Provide COMPREHENSIVE, DETAILED responses. Users want thorough information, not brief summaries.

For credit cards, provide COMPREHENSIVE details including:
- Annual fee (exact amount and when charged)
- All rewards rates (categories, multipliers, and earning caps)
- Sign-up bonus (points/cash amount, spending requirement, time limit)
- Key premium benefits (lounge access, travel credits, insurance coverage)
- Point redemption values and transfer partners
- Notable perks and protections
- Foreign transaction fees
- Credit score requirements
- Authorized user benefits

For card comparisons, highlight key differentiators between products with specific details.

For tax/retirement limits:
- Exact contribution limits and income thresholds
- Catch-up contribution rules and age requirements
- Phase-out ranges and income limits
- Effective dates and inflation adjustments
- Roth vs Traditional differences

For estate tax questions:
- Exact exemption amounts
- Tax rates and brackets
- State-specific rules if applicable
- Effective dates and changes

Make your explanation DETAILED and PRACTICAL - users want comprehensive information with specific dollar amounts, percentages, and actionable details. Write 4-6 sentences minimum.`,
          },
          {
            role: "user",
            content: `Question: ${text}
Card Type: ${kind}

Combined Page Content from ${pageResults.length} sources:
${combinedContent.slice(0, 150000)}

Extract comprehensive information to fully answer the question. Use information from all available sources to provide the most complete and accurate answer. Focus on providing detailed, actionable information that would be genuinely helpful to someone researching this topic.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "financial_fact_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: {
                  type: "string",
                  description: "Clear, specific title for the information",
                },
                value: {
                  type: ["string", "number"],
                  description: "Primary key fact or amount",
                },
                unit: {
                  type: ["string", "null"],
                  description: "Unit if applicable or null",
                },
                explanation: {
                  type: "string",
                  description:
                    "COMPREHENSIVE 4-6 sentence explanation with specific details, amounts, practical implications, and context. Include specific numbers, benefits, requirements, and actionable information.",
                },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                  description: "Confidence level in the extracted information",
                },
                source_title: {
                  type: ["string", "null"],
                  description: "Page title or null",
                },
              },
              required: ["label", "value", "explanation", "confidence", "unit"],
            },
          },
        },
      }),
    });

    const data = await resp.json();
    console.log("🔍 [FINNY] AI response status:", resp.status);
    console.log("🔍 [FINNY] AI response data:", JSON.stringify(data, null, 2));

    if (!resp.ok) {
      console.log("❌ [FINNY] OpenRouter API error:", data);
      throw new Error(
        `OpenRouter API error: ${resp.status} - ${JSON.stringify(data)}`
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [FINNY] Extraction failed - no content in response");
      console.log("❌ [FINNY] Full response:", JSON.stringify(data, null, 2));

      // Try to provide a helpful fallback based on the query
      let fallbackMessage =
        "I couldn't extract the information from the source page. ";

      if (text.toLowerCase().includes("chase")) {
        fallbackMessage +=
          "For the most up-to-date Chase credit card benefits and information, please visit https://creditcards.chase.com/ directly.";
      } else if (
        text.toLowerCase().includes("amex") ||
        text.toLowerCase().includes("american express")
      ) {
        fallbackMessage +=
          "For the most up-to-date American Express card benefits and information, please visit https://www.americanexpress.com/us/credit-cards/ directly.";
      } else if (text.toLowerCase().includes("bilt")) {
        fallbackMessage +=
          "For the most up-to-date Bilt Rewards information, please visit https://www.biltrewards.com/ directly.";
      } else {
        fallbackMessage +=
          "Please try again or visit the official source directly.";
      }

      return {
        message: fallbackMessage,
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "EXTRACTION_FAILED",
      };
    }

    console.log("✅ [FINNY] AI extraction content:", content);

    let value_json;
    try {
      value_json = JSON.parse(content);
      console.log("✅ [FINNY] Parsed JSON:", value_json);

      // Validate required fields
      if (!value_json.label || !value_json.explanation) {
        console.log("❌ [FINNY] Missing required fields in extracted data");
        throw new Error("Missing required fields");
      }
    } catch (parseError) {
      console.log("❌ [FINNY] JSON parse error:", parseError.message);
      console.log("❌ [FINNY] Raw content:", content);

      // Try to extract useful information from the raw content
      let fallbackResponse =
        "I found information about your question on the official source, but had trouble formatting it properly. ";

      // Try to extract key information from the content
      if (
        content.includes("$") ||
        content.includes("percent") ||
        content.includes("%")
      ) {
        fallbackResponse += "Here are the key details I found: ";

        // Extract dollar amounts
        const dollarMatches = content.match(/\$[\d,]+/g);
        if (dollarMatches) {
          fallbackResponse += `Key amounts: ${dollarMatches
            .slice(0, 3)
            .join(", ")}. `;
        }

        // Extract percentages
        const percentMatches = content.match(/\d+(\.\d+)?%/g);
        if (percentMatches) {
          fallbackResponse += `Key rates: ${percentMatches
            .slice(0, 3)
            .join(", ")}. `;
        }
      }

      // Special handling for different types of queries
      if (
        text.toLowerCase().includes("chase") &&
        text.toLowerCase().includes("benefit")
      ) {
        fallbackResponse =
          "I found Chase credit card information on the official source. Chase offers several credit cards with different benefits including travel rewards, cash back, and premium perks. ";
        fallbackResponse +=
          "For the most current and detailed information about Chase card benefits, please visit https://creditcards.chase.com/ directly.";
      } else if (text.toLowerCase().includes("estate tax")) {
        fallbackResponse =
          "I found the 2025 estate tax exemption information on the official IRS source. ";
        const exemptionMatch = content.match(/\$[\d,]+/);
        if (exemptionMatch) {
          fallbackResponse += `The federal estate tax exemption for 2025 is ${exemptionMatch[0]}. This means estates valued below this amount are not subject to federal estate taxes. `;
        }
        fallbackResponse +=
          "For complete details and any recent updates, please visit the official IRS website.";
      } else if (
        text.toLowerCase().includes("amex") ||
        text.toLowerCase().includes("american express")
      ) {
        fallbackResponse =
          "I found American Express card information on the official source. Amex offers premium credit cards with travel benefits, dining rewards, and exclusive perks. ";
        fallbackResponse +=
          "For the most current information, please visit https://www.americanexpress.com/us/credit-cards/ directly.";
      } else if (text.toLowerCase().includes("bilt")) {
        fallbackResponse =
          "I found Bilt Rewards information on the official source. Bilt offers a unique credit card that allows you to earn points on rent payments. ";
        fallbackResponse +=
          "For the most current information, please visit https://www.biltrewards.com/ directly.";
      } else {
        fallbackResponse += `For complete and up-to-date details, please visit: ${
          pageResults[0]?.url || "the official source"
        }`;
      }

      return {
        message: fallbackResponse,
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "JSON_PARSE_FAILED",
      };
    }

    // 5) Cache the result with enhanced validation
    const cacheData = {
      key,
      value_json,
      source_url: pageResults[0].url, // Use primary source URL
      source_title: value_json.source_title || null,
      fetched_at: new Date().toISOString(),
      ttl_seconds: ttl || DEFAULT_TTLS[kind] || 1209600, // Default 14 days
      content_hash: Buffer.from(combinedContent.slice(0, 1000))
        .toString("base64")
        .slice(0, 50), // Content fingerprint
      sources_count: pageResults.length, // Track how many sources were used
    };

    await supabase.from("facts_cache").upsert(cacheData);
    console.log("✅ [FINNY] Cached result with enhanced metadata:", {
      key,
      ttl_hours: Math.round((cacheData.ttl_seconds || 1209600) / 3600),
      sources_count: cacheData.sources_count,
      content_hash: cacheData.content_hash,
    });

    console.log("✅ [FINNY] Fact extracted and cached:", key);
    const v = value_json.value;
    const label = value_json.label;
    const explanation = value_json.explanation;

    // Create a more comprehensive response
    let responseMessage = `${label}: ${
      typeof v === "number" ? `$${v.toLocaleString()}` : v
    }`;

    // Add explanation if it's informative and different from the label
    if (
      explanation &&
      explanation.length > 10 &&
      !explanation.toLowerCase().includes("not found")
    ) {
      responseMessage += `\n\n${explanation}`;
    }

    responseMessage += `\n\nSource: ${pageResults[0].url}`;

    return {
      message: responseMessage,
      type: "assistant",
      intent: "ask_fact_fresh",
      cached: false,
    };
  } catch (error) {
    console.error("❌ [FINNY] Facts lookup error:", error);
    return {
      message:
        "I'm having trouble looking up that information right now. Please try again later.",
      type: "assistant",
      intent: "ask_fact_fresh",
      error: error.message,
    };
  }
}

async function handleAskStateRule(message, context) {
  // Handler for state-specific tax rules and regulations
  return {
    message: "Researching state-specific financial rules...",
    type: "assistant",
    intent: "ask_state_rule",
  };
}

async function handleCalcProjection(message, context) {
  // Handler for financial calculations and projections
  return {
    message: "Calculating financial projections...",
    type: "assistant",
    intent: "calc_projection",
  };
}

async function handleCardComparison(text, entities) {
  console.log("🔍 [FINNY] Starting comprehensive card comparison for:", text);

  try {
    // Extract card names from the query with better detection
    const cardTypes = [];
    const lowerText = text.toLowerCase();

    // Chase cards - more comprehensive detection
    if (
      lowerText.includes("chase sapphire preferred") ||
      lowerText.includes("csp")
    ) {
      cardTypes.push({
        kind: "card_chase_sapphire_preferred",
        name: "Chase Sapphire Preferred",
        searchTerms: ["sapphire preferred", "csp"],
      });
    } else if (
      lowerText.includes("chase sapphire reserve") ||
      lowerText.includes("csr")
    ) {
      cardTypes.push({
        kind: "card_chase_sapphire_reserve",
        name: "Chase Sapphire Reserve",
        searchTerms: ["sapphire reserve", "csr"],
      });
    } else if (lowerText.includes("chase sapphire")) {
      cardTypes.push({
        kind: "card_chase_sapphire_general",
        name: "Chase Sapphire",
        searchTerms: ["sapphire"],
      });
    }

    if (
      lowerText.includes("chase ultimate") ||
      lowerText.includes("ultimate rewards")
    ) {
      cardTypes.push({
        kind: "card_chase_ultimate_rewards",
        name: "Chase Ultimate Rewards",
        searchTerms: ["ultimate rewards"],
      });
    }

    // Amex cards - more comprehensive detection
    if (
      lowerText.includes("amex platinum") ||
      lowerText.includes("platinum card") ||
      lowerText.includes("american express platinum")
    ) {
      cardTypes.push({
        kind: "card_amex_platinum",
        name: "American Express Platinum Card",
        searchTerms: ["platinum card", "amex platinum"],
      });
    }
    if (
      lowerText.includes("amex gold") ||
      lowerText.includes("american express gold")
    ) {
      cardTypes.push({
        kind: "card_amex_gold",
        name: "American Express Gold Card",
        searchTerms: ["gold card", "amex gold"],
      });
    }

    // Bilt - more comprehensive detection
    if (lowerText.includes("bilt") || lowerText.includes("bilt rewards")) {
      cardTypes.push({
        kind: "card_bilt_partners",
        name: "Bilt Rewards Card",
        searchTerms: ["bilt rewards", "bilt card"],
      });
    }

    if (cardTypes.length === 0) {
      // If no specific cards identified, try to handle as general query
      if (text.toLowerCase().includes("chase")) {
        return await handleAskFactFresh(
          "Chase credit card benefits and features",
          entities
        );
      } else if (
        text.toLowerCase().includes("amex") ||
        text.toLowerCase().includes("american express")
      ) {
        return await handleAskFactFresh(
          "American Express credit card benefits and features",
          entities
        );
      } else if (text.toLowerCase().includes("bilt")) {
        return await handleAskFactFresh(
          "Bilt Rewards card benefits and features",
          entities
        );
      }

      return {
        message:
          "I couldn't identify specific cards to compare. Please mention the specific card names you'd like me to compare (e.g., 'Chase Sapphire Preferred vs Amex Platinum').",
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "NO_CARDS_IDENTIFIED",
      };
    }

    if (cardTypes.length === 1) {
      // Single card mentioned, get detailed info about it
      const card = cardTypes[0];
      return await handleAskFactFresh(
        card.name + " benefits and features",
        entities
      );
    }

    // Multiple cards - create comprehensive comparison
    console.log(
      `🔄 [FINNY] Comparing ${cardTypes.length} cards:`,
      cardTypes.map((c) => c.name)
    );

    const comparisonPromises = cardTypes.slice(0, 3).map(async (card) => {
      try {
        const url = sourceFor(card.kind, null);
        if (!url) {
          console.log(`❌ [FINNY] No URL found for ${card.name}`);
          return null;
        }

        console.log(`🔄 [FINNY] Fetching data for ${card.name} from ${url}`);
        const response = await fetch(url);
        const html = await response.text();

        // Extract comprehensive info for this card using structured outputs
        const resp = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini",
              temperature: 0.1,
              messages: [
                {
                  role: "system",
                  content: `Extract comprehensive comparison data for this credit card. Focus on key differentiators: annual fee, rewards rates, sign-up bonus, key benefits, transfer partners, and unique perks. Provide detailed, actionable information.`,
                },
                {
                  role: "user",
                  content: `Card: ${card.name}\n\nPage Content: ${html.slice(
                    0,
                    80000
                  )}\n\nExtract comprehensive comparison data including annual fee, rewards rates, sign-up bonus, key benefits, and unique features.`,
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "card_comparison_data",
                  strict: true,
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      annual_fee: {
                        type: "string",
                        description: "Annual fee amount and details",
                      },
                      rewards_rates: {
                        type: "string",
                        description:
                          "Detailed rewards earning rates by category",
                      },
                      signup_bonus: {
                        type: "string",
                        description:
                          "Sign-up bonus details including amount and requirements",
                      },
                      key_benefits: {
                        type: "string",
                        description: "Key premium benefits and perks",
                      },
                      transfer_partners: {
                        type: "string",
                        description: "Transfer partners and redemption options",
                      },
                      unique_features: {
                        type: "string",
                        description:
                          "Unique features that differentiate this card",
                      },
                    },
                    required: [
                      "annual_fee",
                      "rewards_rates",
                      "signup_bonus",
                      "key_benefits",
                    ],
                  },
                },
              },
            }),
          }
        );

        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const cardInfo = JSON.parse(content);
          return {
            name: card.name,
            info: cardInfo,
            url: url,
          };
        }
        return null;
      } catch (error) {
        console.error(`❌ [FINNY] Failed to get info for ${card.name}:`, error);
        return null;
      }
    });

    const cardInfos = (await Promise.all(comparisonPromises)).filter(Boolean);

    if (cardInfos.length === 0) {
      return {
        message:
          "I couldn't retrieve comparison information for those cards right now. Please try asking about each card individually.",
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "COMPARISON_FAILED",
      };
    }

    // Create comprehensive comparison response
    let comparisonMessage = `## Credit Card Comparison: ${cardInfos
      .map((c) => c.name)
      .join(" vs ")}\n\n`;

    cardInfos.forEach((card, index) => {
      comparisonMessage += `### ${card.name}\n\n`;
      comparisonMessage += `**Annual Fee:** ${card.info.annual_fee}\n\n`;
      comparisonMessage += `**Rewards Rates:** ${card.info.rewards_rates}\n\n`;
      comparisonMessage += `**Sign-up Bonus:** ${card.info.signup_bonus}\n\n`;
      comparisonMessage += `**Key Benefits:** ${card.info.key_benefits}\n\n`;

      if (card.info.transfer_partners) {
        comparisonMessage += `**Transfer Partners:** ${card.info.transfer_partners}\n\n`;
      }

      if (card.info.unique_features) {
        comparisonMessage += `**Unique Features:** ${card.info.unique_features}\n\n`;
      }

      comparisonMessage += `**Source:** ${card.url}\n\n`;
      comparisonMessage += "---\n\n";
    });

    // Add comparison summary
    comparisonMessage += `## Key Differences Summary\n\n`;
    comparisonMessage += `**Best for Travel:** ${
      cardInfos.find(
        (c) =>
          c.name.toLowerCase().includes("platinum") ||
          c.name.toLowerCase().includes("reserve")
      )?.name || "Consider your travel frequency"
    }\n\n`;
    comparisonMessage += `**Best Value:** ${
      cardInfos.find(
        (c) =>
          c.info.annual_fee?.includes("$0") ||
          c.info.annual_fee?.includes("No fee")
      )?.name || "Depends on your spending patterns"
    }\n\n`;
    comparisonMessage += `**Best for Everyday Spending:** Consider which card's bonus categories match your spending habits\n\n`;
    comparisonMessage += `**Recommendation:** Choose based on your spending patterns, travel frequency, and which benefits you'll actually use. The card with the highest annual fee isn't always the best value if you don't use the premium benefits.`;

    return {
      message: comparisonMessage,
      type: "assistant",
      intent: "ask_fact_fresh",
      cached: false,
    };
  } catch (error) {
    console.error("❌ [FINNY] Card comparison error:", error);
    return {
      message:
        "I'm having trouble comparing those cards right now. Please try asking about each card individually for detailed information.",
      type: "assistant",
      intent: "ask_fact_fresh",
      error: error.message,
    };
  }
}
