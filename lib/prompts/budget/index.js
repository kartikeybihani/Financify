/**
 * Budget-related prompts: generation and category mapping.
 */

const LOCALE_EN_US = "en-US";

/** Format number for prompt (consistent locale) */
const fmt = (n) => Number(n).toLocaleString(LOCALE_EN_US);

/** Categories to exclude from budget context - not real spending (e.g. credit card payments, account moves) */
const EXCLUDED_CATEGORY_LOWERCASE = new Set([
  "internal_transfer",
  "credit card payment",
]);

export function buildBudgetGenerationPrompt({
  userProfile,
  transactions,
  income,
  savingsAmount,
}) {
  const { age, occupation, location, first_name } = userProfile || {};

  // Exclude internal transfers and similar - they are not real spending to budget for (case-insensitive)
  const resolveCategory = (tx) =>
    tx.new_category || tx.top_category || tx.category || "Other";
  const budgetableTransactions = (transactions || []).filter(
    (tx) =>
      !EXCLUDED_CATEGORY_LOWERCASE.has(
        (resolveCategory(tx) || "").toLowerCase().trim(),
      ),
  );

  // Format transactions for context (all budgetable transactions from last 3 months)
  const transactionSummary = budgetableTransactions
    .map((tx) => {
      const category =
        tx.new_category || tx.top_category || tx.category || "Other";
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = tx.date || "";
      const merchant = tx.merchant_name || tx.name || "Unknown";
      return `- ${date} | ${merchant} | $${amount.toFixed(2)} | ${category}`;
    })
    .join("\n");

  // Calculate spending by category (total over 3 months)
  const categorySpending = {};
  const categoryTransactionCounts = {};
  budgetableTransactions.forEach((tx) => {
    const category =
      tx.new_category || tx.top_category || tx.category || "Other";
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    if (amount > 0) {
      categorySpending[category] = (categorySpending[category] || 0) + amount;
      categoryTransactionCounts[category] =
        (categoryTransactionCounts[category] || 0) + 1;
    }
  });

  // Calculate monthly averages (divide 3-month totals by 3)
  const monthlyAverages = {};
  Object.keys(categorySpending).forEach((cat) => {
    monthlyAverages[cat] = Math.round((categorySpending[cat] / 3) * 100) / 100;
  });

  // Format spending analysis for prompt
  const spendingAnalysis = Object.keys(categorySpending)
    .sort((a, b) => categorySpending[b] - categorySpending[a])
    .map((cat) => {
      const total3Months = categorySpending[cat];
      const monthlyAvg = monthlyAverages[cat];
      const txCount = categoryTransactionCounts[cat];
      return `- ${cat}: $${total3Months.toFixed(
        2,
      )} total over 3 months ($${monthlyAvg.toFixed(
        2,
      )}/month avg, ${txCount} transactions)`;
    })
    .join("\n");

  // Get all unique existing category names from transactions
  const existingCategories = Object.keys(categorySpending).sort();
  const categorySummary =
    existingCategories.length > 0
      ? existingCategories.map((cat) => `- ${cat}`).join("\n")
      : "";

  const userContext = [];
  if (first_name) userContext.push(`Name: ${first_name}`);
  if (age) userContext.push(`Age: ${age}`);
  if (occupation) userContext.push(`Occupation: ${occupation}`);
  if (location) userContext.push(`Location: ${location}`);

  const totalBudget = income; // Total budget equals full income
  // Must match API: when user omits or enters 0 for savings, default to 2% of income
  const effectiveSavings =
    savingsAmount != null && Number(savingsAmount) > 0
      ? Number(savingsAmount)
      : Math.round(income * 0.02);

  // Location-based cost of living guidance
  const locationGuidance = location
    ? `\n- Location: ${location} - Account for cost of living differences. Smaller cities, college towns, and less expensive areas should have lower budgets for housing, transportation, entertainment, and dining. Adjust category limits accordingly.`
    : "";

  const prompt = `You are Finny, a financial coach. Create a monthly budget by distributing the user's income across spending categories.

═══ RULE 0: INCOME CEILING (OVERRIDES EVERYTHING) ═══
The SUM of ALL category limits MUST equal EXACTLY $${fmt(totalBudget)}. Never exceed it.
- If transaction patterns, location, or any other factor would push the total over $${fmt(totalBudget)}, reduce discretionary categories (Entertainment, Shopping, Travel, Other, Personal Care) until the total equals exactly $${fmt(totalBudget)}.
- This rule has priority over realistic housing for HCOL areas, over matching past spending, and over all other guidance below. No exceptions.

═══ USER CONTEXT ═══
${
  userContext.length > 0
    ? userContext.join("\n")
    : "No profile information available"
}${locationGuidance}

INCOME & CONSTRAINTS:
- Monthly Income (total to allocate): $${fmt(income)}
- Savings goal (first category, fixed): $${fmt(effectiveSavings)}
- Total budget ceiling: $${fmt(totalBudget)} (MUST match exactly)

RECENT TRANSACTIONS (last 3 months, excludes internal transfers):
${transactionSummary || "No transaction history available"}

SPENDING BY CATEGORY (monthly averages from above):
${spendingAnalysis || "No spending data available"}

EXISTING CATEGORY NAMES (use these exact names):
${categorySummary || "No existing categories found"}
${
  existingCategories.length > 0
    ? `
═══ MANDATORY: INCLUDE ALL TRANSACTION CATEGORIES ═══
EVERY category listed above MUST appear as a budget category with a non-zero limit. This is NOT optional.
- Loans, Education, Travel, Services, or ANY category from EXISTING CATEGORY NAMES—even with only 1–2 transactions—MUST get its own budget line with an appropriate limit (use monthly avg from SPENDING BY CATEGORY above, or a reasonable minimum like $25–50 if avg is low).
- Never consolidate these into "Other". Never omit them.`
    : `
No transaction history: create a standard budget from income, profile, and location. Use common categories: Savings, Food, Housing, Transportation, Entertainment, Personal Care, Other.`
}

═══ ALLOCATION LOGIC ═══
1. Reserve $${fmt(effectiveSavings)} for "Savings" (first category).
2. Be encouraging: suggest lower limits for discretionary categories where the user overspends (Entertainment, Shopping, Travel), but factor in actual spending—limits should feel achievable, not punitive.
3. Use SPENDING BY CATEGORY and user profile/location as guidance—stay within the $${fmt(totalBudget)} ceiling.
4. If totals would exceed $${fmt(totalBudget)}, scale down discretionary first, then Savings only if needed.
5. All limits = whole numbers. Compute Other last: Other = $${fmt(totalBudget)} − (sum of all other limits).

CATEGORY RULES:
- MANDATORY: Every category from EXISTING CATEGORY NAMES above MUST be included with a non-zero limit.
- Use EXACT names from EXISTING CATEGORY NAMES; "Savings" first, "Other" last.
- One emoji per category (simple ones like 🍴 🏠 🚗). All limits = whole numbers only (no decimals).
- Other = $${fmt(totalBudget)} minus sum of all others (e.g. others=2000 → Other=1000). Never create "INTERNAL_TRANSFER" or "Credit Card Payment".

Return ONLY valid JSON. All "limit" values must be integers:
{"categories":[{"name":"Savings","icon":"💰","limit":250},{"name":"Food","icon":"🍴","limit":500},...,{"name":"Other","icon":"📝","limit":350}]}

BEFORE RETURNING—verify:
✓ All limits are integers; Savings first, Other last
✓ SUM = exactly $${fmt(totalBudget)}; Other = remainder
✓ Every EXISTING CATEGORY NAME included with non-zero limit

Return ONLY the JSON object. No markdown, no explanation.`;

  return prompt;
}

/**
 * Builds a prompt for AI-powered category mapping
 * Maps transaction categories (from Plaid) to user's budget categories
 *
 * @param {Array<{top_category: string, sub_category: string}>} transactionCategories - Transaction categories from last 4 months
 * @param {Array<{id: string, name: string}>} budgetCategories - User's budget categories
 * @returns {string} - Formatted prompt for LLM
 */
export function buildCategoryMappingPrompt(
  transactionCategories,
  budgetCategories,
) {
  // Format transaction categories
  const transactionLines = transactionCategories.map(
    (cat) => `- ${cat.top_category} | ${cat.sub_category || "N/A"}`,
  );

  // Format budget categories
  const budgetLines = budgetCategories.map((cat) => `- ${cat.name}`);

  const prompt = `You are Finny, a financial coach helping users map their transaction categories to budget categories.

TRANSACTION CATEGORIES (from bank/plaid):
${
  transactionLines.length > 0
    ? transactionLines.join("\n")
    : "No transaction categories found"
}

BUDGET CATEGORIES (user created):
${
  budgetLines.length > 0 ? budgetLines.join("\n") : "No budget categories found"
}

TASK:
Map each transaction category to the most appropriate budget category.
- Use semantic matching (e.g., "Food" → "Food" or "Dining Out")
- If no good match exists, return null (will go to "Other")
- New budget categories (like "Content Creation", "Social Activities") should only be matched if transaction category clearly fits
- Income transactions (top_category = "Income") should return null (they don't go to budget categories)
- Internal transfers should return null (they don't go to budget categories)

Return ONLY valid JSON:
{
  "mappings": {
    "Food|Drink Restaurant": "Food",
    "Income|Earned": null,
    "Other|Investment And Retirement Funds": "Other",
    "Food|Groceries": "Groceries",
    ...
  }
}

The key format is: "top_category|sub_category" → budget category name (or null)

Return ONLY the JSON object, no other text.`;

  return prompt;
}
