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
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("❌ [FINNY] Error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function handleAsk(message, context) {
  const systemPrompt = `
You are Finny, a financial psychologist and planning expert. Your role is to:
1. Understand the user's financial goals and concerns
2. Provide empathetic, practical advice
3. Help users make informed financial decisions
4. Guide users through goal-setting when appropriate

You have access to the user's complete financial context:

ACCOUNTS:
${context.accounts
  .map(
    (acc) =>
      `- ${acc.name.replace(/[^\w\s]/g, "")} (${acc.type}/${acc.subtype})
  Balance: $${acc.balance}
  Available: $${acc.available}
  Institution: ${acc.institution.replace(/[^\w\s]/g, "")}`
  )
  .join("\n")}

INVESTMENTS:
${context.investments
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
${context.liabilities
  .map(
    (liab) =>
      `- ${liab.name.replace(/[^\w\s]/g, "")} (${liab.type})
  Balance: $${liab.balance}
  APR: ${liab.apr}%
  Minimum Payment: $${liab.minimum_payment}`
  )
  .join("\n")}

RECENT TRANSACTIONS:
${context.transactions
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
${context.goals
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
- Net Worth: $${context.summary.netWorth}
- Monthly Income: $${context.summary.monthlyIncome}
- Monthly Expenses: $${context.summary.monthlyExpenses}
- Total Assets: $${context.summary.totalAssets}
- Total Liabilities: $${context.summary.totalLiabilities}
- Total Investments: $${context.summary.totalInvestments}

When responding:
- Be empathetic and understanding
- Use a warm, supportive tone
- Provide practical, actionable advice
- Consider both emotional and financial aspects
- Help users think through their decisions
- Encourage healthy financial habits
`;

  // This would integrate with your AI service (OpenAI, etc.)
  // For now, returning a placeholder response
  return {
    message: `Hi! I'm Finny, your financial companion. I can see your financial situation and I'm here to help with "${message}". Let me analyze your data and provide personalized advice.`,
    type: "assistant",
  };
}

async function handleClassify(message, context) {
  // Classification logic would go here
  return {
    intent: "general_question",
    confidence: 0.85,
    suggested_actions: ["provide_advice", "show_relevant_data"],
  };
}

async function handleGoal(message, context, params) {
  // Goal-related logic would go here
  return {
    goal_type: "savings",
    suggested_target: 5000,
    timeline: "6 months",
    action_items: ["Set up automatic transfers", "Review spending habits"],
  };
}
