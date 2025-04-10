// ai/buildContextFromPlaid.js
export function buildContextFromPlaid(transactions) {
  const categoryTotals = {};
  let totalSpent = 0;
  let totalIncome = 0;
  const subscriptions = new Set();

  for (let tx of transactions) {
    const category = tx.category?.[0] || "Other";
    const amount = tx.amount;
    const name = tx.name.toLowerCase();

    if (amount < 0) {
      totalIncome += Math.abs(amount);
    } else {
      totalSpent += amount;
      categoryTotals[category] = (categoryTotals[category] || 0) + amount;

      // rudimentary sub detection (improve later)
      if (
        name.includes("netflix") ||
        name.includes("spotify") ||
        name.includes("hulu") ||
        name.includes("apple") ||
        name.includes("amazon") ||
        name.includes("youtube")
      ) {
        subscriptions.add(tx.name);
      }
    }
  }

  const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const topCategories = sorted.slice(0, 3);

  const netSavings = totalIncome - totalSpent;

  return `
  User spent $${totalSpent.toFixed(2)} this month.
  Top categories: ${topCategories
    .map(([cat, amt]) => `${cat} ($${amt.toFixed(2)})`)
    .join(", ")}.
  Subscriptions detected: ${Array.from(subscriptions).join(", ") || "None"}.
  Net savings: $${netSavings.toFixed(2)}.
  `;
}
