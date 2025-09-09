// api/finny.js
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
  const { text, user } = { text: message, user: context }; // user can include state, age if you want hints

  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b:free",
      messages: [
        {
          role: "system",
          content: `
You are Financify's intent router. Classify one user utterance into exactly one intent.
Intents:
- goal  set or modify a savings or payoff goal
- ask_personalized  question about their money that needs their data
- ask_concept_static  timeless concept explainers
- ask_fact_fresh  current year limits or numbers that change
- ask_state_rule  state specific rules or taxes
- calc_projection  what if or plan math

Rules:
- If the question asks for this year limits brackets phaseouts exemption latest or today then it is ask_fact_fresh
- If a US state is mentioned or implied choose ask_state_rule and set state
- If the user asks can I afford X or will I hit FIRE by age N choose calc_projection
- Otherwise pick the most reasonable single intent

Return JSON only per schema
Examples:
Q: "Can I hit FIRE by 35" -> calc_projection
Q: "What is the 2025 estate tax exemption" -> ask_fact_fresh
Q: "Roth vs traditional IRA difference" -> ask_concept_static
Q: "How much did I spend on Uber last month" -> ask_personalized
Q: "Set a 2000 emergency fund by March" -> goal
Q: "Is there inheritance tax in New Jersey" -> ask_state_rule state=NJ
          `.trim(),
        },
        { role: "user", content: text },
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
              },
              needs_web: {
                type: "boolean",
                description: "true if fresh facts or state rules are needed",
              },
              needs_user_data: {
                type: "boolean",
                description: "true if answer must query user DB",
              },
              needs_calc: {
                type: "boolean",
                description: "true if a calculator or projection is required",
              },
              state: {
                type: "string",
                nullable: true,
                description: "two letter US state if applicable",
              },
              entities: { type: "array", items: { type: "string" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: [
              "intent",
              "needs_web",
              "needs_user_data",
              "needs_calc",
              "confidence",
            ],
          },
        },
      },
    }),
  });

  const data = await r.json();
  console.log("🔍 [FINNY] Classification data inside handleClassify:", data);
  const content = data.choices?.[0]?.message?.content || "{}";
  console.log(
    "🔍 [FINNY] Classification response inside handleClassify:",
    content
  );
  return JSON.parse(content);
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
  // Handler for current year limits, rates, and fresh financial facts
  return {
    message: "Looking up current financial facts and limits...",
    type: "assistant",
    intent: "ask_fact_fresh",
  };
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
