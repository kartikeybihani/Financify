// ai/runFinnyAdvisor.js
import { getFinnySuggestions } from "./getFinnySuggestions.js";
import { buildFullFinancialProfile } from "./buildFullFinancialProfile.js";

export async function runFinnyAdvisor({
  transactions,
  accounts = [],
  investments = {},
  liabilities = [],
  message,
  goals = [],
}) {
  const {
    summaryText: spendingSummary,
    keyMetrics,
    sentiment,
  } = buildFullFinancialProfile(
    transactions,
    accounts,
    investments,
    liabilities
  );

  const metricsBlock = `
📌 Key Metrics:
- Total Income: $${keyMetrics.totalIncome.toFixed(2)}
- Total Spent: $${keyMetrics.totalSpent.toFixed(2)}
- Net Savings: $${keyMetrics.netSavings.toFixed(2)}
- Top Categories: ${keyMetrics.topCategories
    .map(([cat, amt]) => `${cat} ($${amt.toFixed(2)})`)
    .join(", ")}
- Subscriptions: ${keyMetrics.subscriptionCount}
- Recurring Payments: ${keyMetrics.recurringCount}
`;

  const accountSummary = accounts.length
    ? accounts.map((a) => `${a.name}: $${a.balances?.current || 0}`).join("\n")
    : "No accounts linked.";

  const investmentSummary = investments?.holdings?.length
    ? investments.holdings
        .map(
          (h) =>
            `$${h.institution_value || 0} in ${
              h.symbol || h.security_id || "Unknown"
            }`
        )
        .join("\n")
    : "No investments.";

  const liabilitySummary = liabilities.length
    ? liabilities
        .map((l) => `${l.type || "Loan"}: $${l.amount || 0}`)
        .join("\n")
    : "No liabilities.";

  // Format goals summary
  const goalsSummary = goals.length
    ? goals
        .map(
          (goal) =>
            `- ${goal.label} (Target: ${goal.year})\n  ${
              goal.description || "No description provided"
            }`
        )
        .join("\n")
    : "No financial goals set.";

  let fullContext = `
User asked: "${message || "a financial question"}"

Tone: ${sentiment.toUpperCase()}

---
📊 Financial Summary:
${spendingSummary}

${metricsBlock}

🎯 Financial Goals:
${goalsSummary}

🏦 Bank Accounts:
${accountSummary}

📈 Investments:
${investmentSummary}

💳 Liabilities:
${liabilitySummary}
---

Please help the user make sense of their current financial life and goals.
If they ask about goals, provide specific advice related to their timeline and targets.
If they are overspending or falling behind on goals, be kind and uplifting—but direct.
If they're doing well, celebrate and motivate them to go further.
Always speak with care, clarity but be encouraging at all times.
`;

  // Add specific instructions for metric-related questions
  if (
    message &&
    message.toLowerCase().match(/how much|balance|ratio|net worth|total/i)
  ) {
    fullContext +=
      "\n\nAnswer concisely. Give numbers first. Avoid emotional commentary unless user asks for help.\nHighlight any dollar amounts.";
  }

  // Add specific instructions for goal-related questions
  if (
    message &&
    message.toLowerCase().match(/goal|target|timeline|plan|saving for/i)
  ) {
    fullContext +=
      "\n\nFocus on their specific goals and timeline. Give actionable advice to help reach their targets.\nIf no goals are set, encourage setting some.";
  }

  const nudges = await getFinnySuggestions(fullContext);
  return { context: fullContext, nudges };
}
