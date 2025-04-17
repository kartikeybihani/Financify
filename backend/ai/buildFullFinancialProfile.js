// ai/buildFullFinancialProfile.js

export function buildFullFinancialProfile(
  transactions,
  accounts = [],
  investments = {},
  liabilities = []
) {
  const categoryTotals = {};
  let totalSpent = 0;
  let totalIncome = 0;
  const subscriptions = new Set();
  const recurring = {};

  for (let tx of transactions || []) {
    const category = tx.category?.[0] || "Other";
    const amount = tx.amount;
    const name = tx.name.toLowerCase();
    const date = new Date(tx.date);
    const monthKey = `${name}-${date.getDate()}`;

    if (amount < 0) {
      totalIncome += Math.abs(amount);
    } else {
      totalSpent += amount;
      categoryTotals[category] = (categoryTotals[category] || 0) + amount;

      // Detect subscriptions
      if (name.match(/netflix|spotify|hulu|apple|amazon|youtube/)) {
        subscriptions.add(tx.name);
      }

      // Track likely recurring
      recurring[monthKey] = (recurring[monthKey] || 0) + 1;
    }
  }

  const recurringSuspects = Object.keys(recurring).filter(
    (k) => recurring[k] > 1
  );
  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const netSavings = totalIncome - totalSpent;

  // Basic tone marker
  let tone = "neutral";
  if (netSavings < -200) tone = "stressed";
  else if (netSavings > 200) tone = "optimistic";

  // Build readable summary
  const summaryText = `
  User earned approx. $${totalIncome.toFixed(
    2
  )} this month and spent $${totalSpent.toFixed(2)}.
  Top spending categories: ${topCategories
    .map(([cat, amt]) => `${cat} ($${amt.toFixed(2)})`)
    .join(", ")}.
  Recurring transactions detected: ${recurringSuspects.length}.
  Subscriptions: ${Array.from(subscriptions).join(", ") || "None"}.
  Net savings: $${netSavings.toFixed(2)}.
  `;

  return {
    summaryText: summaryText.trim(),
    keyMetrics: {
      totalIncome,
      totalSpent,
      netSavings,
      topCategories,
      subscriptionCount: subscriptions.size,
      recurringCount: recurringSuspects.length,
    },
    sentiment: tone,
  };
}
