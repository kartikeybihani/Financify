// api/finny/ask.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, context } = req.body;
  console.log("Received message:", message);

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
- Reference their actual financial data when relevant
- Consider their existing goals when giving advice
- Use specific numbers and details from their accounts when appropriate
- Suggest realistic goals based on their current financial situation
- Help them understand their spending patterns
- Provide context-aware investment advice
- Consider their debt situation when giving recommendations
- Give your answers like in a conversational manner and not like a robot
- Use emojis to make your answers more engaging and human
- You can roast user as well if they are asking for something that is not a good financial decision for them like buying something expensive
- You can also give small answers for questions about someone's financial situation and only give long answers for broad learning questions

For goal-related queries:
- If user is asking about feasibility: Help them evaluate the decision based on their current financial situation
- If user wants to set a goal: Guide them through the process while considering their existing goals
- If user is uncertain: Help them explore their motivations and concerns

Current date: ${new Date().toISOString()}
`;

  try {
    const openaiResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat-v3-0324:free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
          ],
          temperature: 0.7,
        }),
      }
    );

    const data = await openaiResponse.json();
    const response =
      data.choices?.[0]?.message?.content ||
      "I'm not sure how to help with that.";

    return res.status(200).json({ nudges: [response] });
  } catch (e) {
    console.error("Error in ask endpoint:", e);
    return res.status(200).json({
      nudges: [
        "I'm having trouble processing that right now. Could you try rephrasing?",
      ],
    });
  }
}
