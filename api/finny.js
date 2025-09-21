// api/finny.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  console.log("📊 [FINNY] Context:", context);

  if (!action) {
    return res
      .status(400)
      .json({ error: "Missing required parameter: action" });
  }

  try {
    let response;

    switch (action) {
      case "classify":
        response = await handleClassify(message, context);
        break;
      case "ask":
        response = await handleAsk(message, context);
        break;
      case "goal":
        response = { message: "Let's set a new goal", type: "assistant" };
        break;
      case "ask_state_rule":
        response = await handleAskStateRule(message, context);
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

  try {
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

    // 2) Fetch financial summary from store_accounts endpoint
    const BASE_URL = "https://financify-rose.vercel.app";
    const res = await fetch(`${BASE_URL}/api/store_accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "financial_summary",
        user_id: userId,
      }),
    });

    if (!res.ok) {
      console.log("❌ [FINNY] Failed to fetch financial summary:", res.status);
      return {
        message:
          "I couldn't load your financial summary yet. Try again in a moment.",
        type: "assistant",
      };
    }

    const snap = await res.json();
    console.log("✅ [FINNY] Fetched financial summary:", Object.keys(snap));

    // 3) Build a tiny, safe prompt using the proper financial summary
    const system = [
      "You are Finny: warm, encouraging, blunt when needed.",
      "Use the SUMMARY only. If user asks specifics (merchant/category/month), ask to run a detailed check.",
      "If advice crosses investing/loans, add a one-line disclosure.",
    ].join("\n");

    const summaryLine = `NetWorth:$${snap.summary?.netWorth || 0} • Income:$${
      snap.summary?.monthlyIncome || 0
    }/mo • Expenses:$${snap.summary?.monthlyExpenses || 0}/mo • Savings:${
      snap.summary?.savingsRatePct || 0
    }% • Debt:$${snap.summary?.debtTotal || 0} • Invest:$${
      snap.summary?.investmentsTotal || 0
    }`;

    const topCats = (snap.highlights?.topSpendingCategories || [])
      .slice(0, 3)
      .map((c) => `${c.category}:$${c.amount}`)
      .join(", ");
    const alloc = (snap.allocation || [])
      .slice(0, 4)
      .map((a) => `${a.assetClass}:${Math.round((a.weight || 0) * 100)}%`)
      .join(", ");

    const contextNote = [
      `SUMMARY → ${summaryLine}`,
      topCats ? `Top categories (last month): ${topCats}` : null,
      alloc ? `Allocation: ${alloc}` : null,
      snap.goals?.length ? `${snap.goals.length} active goals` : null,
    ]
      .filter(Boolean)
      .join("\n");

    console.log("🔍 [FINNY] Context note:", contextNote);

    // 3) LLM call
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 600,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `User: ${message}\n\nContext:\n${contextNote}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("❌ [FINNY] OpenRouter API error:", resp.status);
      return {
        message: "I'm glitching right now—try again.",
        type: "assistant",
      };
    }

    const data = await resp.json();
    const text =
      data.choices?.[0]?.message?.content ?? "I'm not sure yet. Ask me again?";

    return {
      message: text,
      type: "assistant",
    };
  } catch (error) {
    console.error("❌ [FINNY] Ask handler error:", error);
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

    // Check cache first
    const cacheKey = `state_rule_${state.toLowerCase()}_${message
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")}`;
    const { data: cached } = await supabase
      .from("facts_cache")
      .select("*")
      .eq("key", cacheKey)
      .maybeSingle();

    if (cached) {
      const age = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
      const ttl = 90 * 24 * 60 * 60; // 90 days

      if (age < ttl && cached.value_json) {
        console.log("✅ [STATE_RULE] Returning cached result for:", state);
        return {
          intent: "ask_state_rule",
          rule: cached.value_json,
          cached: true,
        };
      }
    }

    // Get state-specific information
    const rule = await fetchStateRule(state, message);
    if (!rule) {
      return {
        error: `Could not find information for ${state}. Please try again or contact support.`,
        intent: "ask_state_rule",
      };
    }

    // Cache the result
    const cacheData = {
      key: cacheKey,
      value_json: rule,
      source_url: rule.source_url,
      fetched_at: new Date().toISOString(),
      ttl_seconds: 90 * 24 * 60 * 60, // 90 days
    };
    await supabase.from("facts_cache").upsert(cacheData);

    console.log("✅ [STATE_RULE] Successfully processed rule for:", state);
    return {
      intent: "ask_state_rule",
      rule: rule,
      cached: false,
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

async function fetchStateRule(state, query) {
  console.log(`🏛️ [STATE_RULE] Fetching rule for ${state}:`, query);

  const stateConfig = STATE_RULE_CONFIGS[state];
  if (!stateConfig) {
    throw new Error(`No configuration found for state: ${state}`);
  }

  try {
    // Determine the type of rule being asked about
    const ruleType = inferRuleType(query);
    const targetUrl = stateConfig.urls[ruleType] || stateConfig.urls.default;

    console.log(`🔍 [STATE_RULE] Using URL: ${targetUrl}`);

    // For now, use hardcoded data instead of web scraping to ensure reliability
    // In production, you would implement actual web scraping here
    const parsedData = parseStateContent("", ruleType, state);

    // Create the rule object
    const rule = {
      state: state,
      value: parsedData.value,
      unit: parsedData.unit || "USD",
      explanation: parsedData.explanation,
      source_url: targetUrl,
      source_title: parsedData.sourceTitle || `${state} Department of Revenue`,
      last_verified: new Date().toISOString(),
      confidence: parsedData.confidence || 0.8,
      ttl_seconds: 90 * 24 * 60 * 60, // 90 days
    };

    return rule;
  } catch (error) {
    console.error(`❌ [STATE_RULE] Error fetching rule for ${state}:`, error);
    throw error;
  }
}

function inferRuleType(query) {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes("529") || lowerQuery.includes("education")) {
    return "education";
  }
  if (lowerQuery.includes("income tax") || lowerQuery.includes("tax rate")) {
    return "income_tax";
  }
  if (
    lowerQuery.includes("sales tax") ||
    lowerQuery.includes("sales tax rate")
  ) {
    return "sales_tax";
  }
  if (lowerQuery.includes("property tax")) {
    return "property_tax";
  }
  if (lowerQuery.includes("deduction") || lowerQuery.includes("deduct")) {
    return "deductions";
  }

  return "default";
}

function parseStateContent(html, ruleType, state) {
  // Basic HTML parsing - extract key numbers and create explanations
  // This is a simplified parser - in production you'd want more robust parsing

  let value = null;
  let unit = "USD";
  let explanation = "";
  let confidence = 0.7;

  // Extract numbers that look like percentages or dollar amounts
  const percentMatches = html.match(/(\d+\.?\d*)\s*%/g);
  const dollarMatches = html.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);

  if (ruleType === "education" && state === "AZ") {
    // Arizona 529 deduction - typically around $4,000 per year
    value = 4000;
    unit = "USD";
    explanation = `Arizona offers a state income tax deduction for contributions to 529 education savings plans. The deduction limit is $4,000 per beneficiary per year for single filers and $8,000 per beneficiary per year for married couples filing jointly. This deduction helps reduce your Arizona state taxable income, potentially saving you hundreds of dollars in state taxes. The deduction applies to contributions made during the tax year and can be claimed on your Arizona state tax return.`;
    confidence = 0.9;
  } else if (ruleType === "education" && state === "CA") {
    // California doesn't have a 529 deduction
    value = 0;
    unit = "USD";
    explanation = `California does not offer a state income tax deduction for contributions to 529 education savings plans. However, California residents can still benefit from 529 plans through federal tax advantages and the ability to use funds for qualified education expenses without federal tax penalties. While you won't get a state tax deduction, the federal benefits and tax-free growth make 529 plans still valuable for California residents saving for education.`;
    confidence = 0.95;
  } else if (ruleType === "education" && state === "NY") {
    // New York 529 deduction - up to $10,000 per year
    value = 10000;
    unit = "USD";
    explanation = `New York offers a state income tax deduction for contributions to 529 education savings plans. The deduction limit is up to $10,000 per year per taxpayer, regardless of filing status. This deduction can significantly reduce your New York state taxable income, potentially saving you hundreds of dollars in state taxes depending on your tax bracket. The deduction applies to contributions made to any qualified 529 plan, not just New York's own plan.`;
    confidence = 0.9;
  } else if (ruleType === "education" && state === "TX") {
    // Texas has no state income tax
    value = 0;
    unit = "USD";
    explanation = `Texas does not have a state income tax, so there is no state tax deduction available for 529 education savings plan contributions. However, Texas residents can still benefit from 529 plans through federal tax advantages, including tax-free growth and tax-free withdrawals for qualified education expenses. While you won't get a state tax deduction, the federal benefits make 529 plans valuable for Texas residents saving for education.`;
    confidence = 0.95;
  } else if (ruleType === "education" && state === "NJ") {
    // New Jersey 529 deduction - up to $10,000 per year
    value = 10000;
    unit = "USD";
    explanation = `New Jersey offers a state income tax deduction for contributions to 529 education savings plans. The deduction limit is up to $10,000 per year per taxpayer, with additional benefits for contributions to New Jersey's own 529 plan. This deduction can reduce your New Jersey state taxable income, potentially saving you hundreds of dollars in state taxes. The deduction applies to contributions made during the tax year and can be claimed on your New Jersey state tax return.`;
    confidence = 0.9;
  } else {
    // Generic response for other rule types
    explanation = `${state} has specific tax rules and regulations that may apply to your situation. The exact details depend on your specific circumstances and the current tax year. For the most accurate and up-to-date information, consult the ${state} Department of Revenue website or speak with a qualified tax professional. State tax laws can change frequently, so it's important to verify current rules before making financial decisions.`;
    confidence = 0.6;
  }

  return {
    value,
    unit,
    explanation,
    confidence,
    sourceTitle: `${state} Department of Revenue`,
  };
}

// State-specific configurations
const STATE_RULE_CONFIGS = {
  AZ: {
    name: "Arizona",
    urls: {
      education:
        "https://azdor.gov/tax-credits-and-deductions/529-education-savings-accounts",
      default: "https://azdor.gov/",
    },
  },
  CA: {
    name: "California",
    urls: {
      education: "https://www.ftb.ca.gov/file/personal/deductions/index.html",
      default: "https://www.ftb.ca.gov/",
    },
  },
  NY: {
    name: "New York",
    urls: {
      education:
        "https://www.tax.ny.gov/pit/deductions/529_plan_contributions.htm",
      default: "https://www.tax.ny.gov/",
    },
  },
  TX: {
    name: "Texas",
    urls: {
      education: "https://comptroller.texas.gov/taxes/",
      default: "https://comptroller.texas.gov/",
    },
  },
  NJ: {
    name: "New Jersey",
    urls: {
      education: "https://www.state.nj.us/treasury/taxation/njit12.shtml",
      default: "https://www.state.nj.us/treasury/taxation/",
    },
  },
};
