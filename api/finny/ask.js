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

You have access to the user's financial context:
- Accounts: ${context.accounts.length} accounts
- Investments: ${context.investments.length} investments
- Liabilities: ${context.liabilities.length} liabilities
- Goals: ${context.goals.length} active goals
- Net Worth: $${context.netWorth}
- Monthly Income: $${context.monthlyIncome}
- Monthly Expenses: $${context.monthlyExpenses}

When responding:
- Be empathetic and understanding
- Use a warm, supportive tone
- Provide practical, actionable advice
- Consider both emotional and financial aspects
- Help users think through their decisions
- Encourage healthy financial habits
- Reference their actual financial data when relevant
- Consider their existing goals when giving advice

For goal-related queries:
- If user is asking about feasibility: Help them evaluate the decision based on their current financial situation
- If user wants to set a goal: Guide them through the process while considering their existing goals
- If user is uncertain: Help them explore their motivations and concerns

Current date: ${new Date().toISOString()}
`;

  try {
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
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
