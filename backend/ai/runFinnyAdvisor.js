import { getFinnySuggestions } from "./getFinnySuggestions.js";
import { buildContextFromPlaid } from "./buildContextFromPlaid.js";

export async function runFinnyAdvisor({
  transactions,
  accounts,
  investments,
  liabilities,
  message,
}) {
  const spendingContext = buildContextFromPlaid(transactions);
  const accountSummary =
    accounts
      ?.map((a) => `${a.name}: $${a.balances?.current || 0}`)
      .join("\n") || "No accounts linked.";
  const investmentSummary =
    investments?.holdings?.length > 0
      ? investments.holdings
          .map(
            (h) =>
              `${h.institution_value || 0} in ${
                h.symbol || h.security_id || "Unknown"
              }`
          )
          .join("\n")
      : "No investments.";
  const liabilitySummary =
    liabilities?.length > 0
      ? liabilities
          .map((l) => `${l.type || "Loan"}: $${l.amount || 0}`)
          .join("\n")
      : "No liabilities.";

  const fullContext = `
User asked: "${message || "a financial question"}"

---
🔍 Spending Summary:
${spendingContext}

🏦 Bank Accounts:
${accountSummary}

📈 Investments:
${investmentSummary}

💳 Liabilities:
${liabilitySummary}
---

Please help the user make sense of their current financial life, and provide clear, supportive coaching suggestions if needed.`;

  const nudges = await getFinnySuggestions(fullContext);
  return { context: fullContext, nudges };
}
