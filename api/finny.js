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
  card_chase_ur_value: 2592000, // 30d
  card_bilt_partners: 2592000,
  generic: 1209600, // 14d
};

const ALLOWLIST = [
  "https://www.irs.gov",
  "https://www.chase.com",
  "https://www.biltrewards.com",
];

// Helper functions for facts pipeline
function inferTopic(text, entities) {
  const t = `${text} ${(entities || []).join(" ")}`.toLowerCase();
  const m = t.match(/(20\d{2})/);
  const year = m ? parseInt(m[1], 10) : new Date().getFullYear();
  if (t.includes("estate")) return { kind: "estate_exemption", year };
  if (t.includes("gift")) return { kind: "gift_exclusion", year };
  if (t.includes("401k") || t.includes("401(k)"))
    return { kind: "401k_limit", year };
  if (t.includes("ira")) return { kind: "ira_limit", year };
  if (t.includes("ultimate rewards"))
    return { kind: "card_chase_ur_value", year: null };
  if (t.includes("bilt")) return { kind: "card_bilt_partners", year: null };
  return { kind: "generic", year: m ? parseInt(m[1], 10) : null };
}

function keyFor(kind, year) {
  return year ? `${kind}_${year}` : `${kind}`;
}

function sourceFor(kind, year) {
  const k = keyFor(kind, year || undefined);
  const map = {
    ira_limit_2025: "https://www.irs.gov/retirement-plans",
    "401k_limit_2025": "https://www.irs.gov/retirement-plans",
    estate_exemption_2025:
      "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025",
    gift_exclusion_2025:
      "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025",
    card_chase_ur_value:
      "https://www.chase.com/personal/credit-cards/education/basics/how-chase-ultimate-rewards-works",
    card_bilt_partners: "https://www.biltrewards.com/rewards/travel",
  };
  return map[k] || null;
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
              "",
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

    // 1) Check cache first
    const { data: cached } = await supabase
      .from("facts_cache")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (cached) {
      const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      if (age < cached.ttl_seconds) {
        console.log("✅ [FINNY] Found cached fact:", key);
        const v = cached.value_json.value;
        const label = cached.value_json.label;
        const src = cached.source_url;
        return {
          message: `${label}: ${
            typeof v === "number" ? `$${v.toLocaleString()}` : v
          }. Source: ${src}`,
          type: "assistant",
          intent: "ask_fact_fresh",
          cached: true,
        };
      }
    }

    // 2) Get source URL
    let url = sourceFor(kind, year);
    if (!url) {
      console.log("❌ [FINNY] No known source for:", key);
      return {
        message:
          "I couldn't verify that from an official source yet. Want me to try a broader search?",
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "NO_KNOWN_SOURCE",
      };
    }

    if (!isAllowed(url)) {
      console.log("❌ [FINNY] Source not allowed:", url);
      return {
        message: "I can't access that source for security reasons.",
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "SOURCE_NOT_ALLOWED",
      };
    }

    // 3) Fetch page content
    console.log("🔄 [FINNY] Fetching page:", url);
    const html = await fetch(url).then((r) => r.text());

    // 4) Extract fact using structured outputs
    console.log("🤖 [FINNY] Extracting fact with AI...");
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b:free",
        temperature: 0.0,
        messages: [
          {
            role: "system",
            content: `You extract one fact (label + value) from a provided official web page.
Allowed kinds: ira_limit, 401k_limit, estate_exemption, gift_exclusion, card_chase_ur_value, card_bilt_partners.
Use only the provided page content.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              kind,
              year,
              page: html.slice(0, 120000),
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fact_extract",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                value: { type: ["number", "string", "null"] },
                unit: { type: ["string", "null"] },
                explanation: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                source_title: { type: ["string", "null"] },
              },
              required: ["label", "value", "explanation", "confidence"],
            },
          },
        },
      }),
    });

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("❌ [FINNY] Extraction failed");
      return {
        message: "I couldn't extract the information from the source page.",
        type: "assistant",
        intent: "ask_fact_fresh",
        error: "EXTRACTION_FAILED",
      };
    }

    const value_json = JSON.parse(content);

    // 5) Cache the result
    await supabase.from("facts_cache").upsert({
      key,
      value_json,
      source_url: url,
      source_title: value_json.source_title || null,
      fetched_at: new Date().toISOString(),
      ttl_seconds: ttl,
    });

    console.log("✅ [FINNY] Fact extracted and cached:", key);
    const v = value_json.value;
    const label = value_json.label;
    return {
      message: `${label}: ${
        typeof v === "number" ? `$${v.toLocaleString()}` : v
      }. Source: ${url}`,
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
