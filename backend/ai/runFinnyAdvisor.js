// ai/runFinnyAdvisor.js
import { getFinnySuggestions } from "./getFinnySuggestions.js";
import { buildFullFinancialProfile } from "./buildFullFinancialProfile.js";

export async function runFinnyAdvisor({
  transactions,
  accounts = [],
  investments = {},
  liabilities = [],
  message,
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

  let fullContext = `
User asked: "${message || "a financial question"}"

Tone: ${sentiment.toUpperCase()}

---
📊 Financial Summary:
${spendingSummary}

${metricsBlock}

🏦 Bank Accounts:
${accountSummary}

📈 Investments:
${investmentSummary}

💳 Liabilities:
${liabilitySummary}
---

Please help the user make sense of their current financial life.
If they are overspending or falling behind, be kind and uplifting—but direct.
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

  const nudges = await getFinnySuggestions(fullContext);
  return { context: fullContext, nudges };
}
