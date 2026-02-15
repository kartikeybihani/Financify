/**
 * Budget-related prompts: generation and category mapping.
 */

export function buildBudgetGenerationPrompt({
  userProfile,
  transactions,
  income,
  savingsAmount,
}) {
  const { age, occupation, location, first_name } = userProfile || {};

  // Format transactions for context (all transactions from last 3 months)
  const transactionSummary = transactions
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
  transactions.forEach((tx) => {
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
  const effectiveSavings = savingsAmount != null ? Number(savingsAmount) : 0; // 0 when user didn't set monthly savings

  // Location-based cost of living guidance
  const locationGuidance = location
    ? `\n- Location: ${location} - Account for cost of living differences. Smaller cities, college towns, and less expensive areas should have lower budgets for housing, transportation, entertainment, and dining. Adjust category limits accordingly.`
    : "";

  const prompt = `You are Finny, a financial coach helping users create personalized monthly budgets.

USER PROFILE:
${
  userContext.length > 0
    ? userContext.join("\n")
    : "No profile information available"
}${locationGuidance}

FINANCIAL CONTEXT:
- Monthly Income: $${income.toLocaleString()}
- Monthly Savings Goal: $${effectiveSavings.toLocaleString()}
- TOTAL BUDGET (must equal full income): $${totalBudget.toLocaleString()}
- ⚠️ HARD RULE: Total budget MUST NEVER exceed monthly income ($${income.toLocaleString()}). If category limits would exceed it, reduce discretionary categories first—see STEP 3. ABSOLUTE and NON-NEGOTIABLE.
- ⚠️ HARD RULE: Never create a category in budget like "INTERNAL_TRANSFER" or "Credit Card Payment", since it is a special case for internal transfers like credit card payments.

RECENT TRANSACTIONS (last 3 months):
${transactionSummary || "No transaction history available"}

SPENDING ANALYSIS (calculated from transactions above):
${spendingAnalysis || "No spending data available"}

EXISTING CATEGORY NAMES FROM TRANSACTIONS:
${categorySummary || "No existing categories found"}
${
  existingCategories.length > 0
    ? `
IMPORTANT: If the list above includes categories with any spending (e.g. Loans, Education, Travel, Services), you MUST include them as separate budget categories. Do not consolidate Loans, Education, or Travel into "Other" if they appear in transaction data with non-trivial amounts.`
    : ""
}

CRITICAL ANALYSIS STEPS - FOLLOW THESE EXACTLY:

STEP 1: ANALYZE TRANSACTION SPENDING PATTERNS
- Carefully review the "SPENDING ANALYSIS" section above
- For each category, note the monthly average spending amount
- Identify recurring expenses (e.g., housing payments that appear monthly)
- For categories with large single transactions (like housing at $5,850), use that amount as the monthly budget
- For categories with multiple smaller transactions, use the monthly average as a baseline

STEP 2: CALCULATE CATEGORY BUDGET LIMITS
- Start with actual spending patterns from transactions (monthly averages)
- For essential recurring expenses (Housing, Transportation, etc.), use the ACTUAL transaction amounts as the baseline
- Adjust amounts slightly upward (5-15%) for categories where improvement is possible, but keep them realistic
- For categories with no transaction history, estimate based on user profile, location, and income
- Ensure all amounts are realistic monthly budgets. If totals would exceed income, reduce discretionary categories first (STEP 3)—never exceed income.

STEP 3: ENSURE TOTAL BUDGET MATCHES CONSTRAINT (NEVER EXCEED INCOME)
- ⚠️ HARD RULE: The SUM of ALL category limits (including "Savings") MUST NEVER EXCEED $${totalBudget.toLocaleString()} (monthly income). No exception—transactions or spending analysis cannot justify going over. This is ABSOLUTE and NON-NEGOTIABLE.
- CRITICAL: SUM of all limits MUST equal EXACTLY $${totalBudget.toLocaleString()} (the full monthly income).
- If the sum would exceed $${totalBudget.toLocaleString()}, you MUST reduce limits in this order: (1) discretionary first—Entertainment, Shopping, Dining out, Travel, Other, Personal Care, etc.; (2) then Savings; (3) only as a last resort, fixed expenses (Housing, Transportation, Utilities). Never reduce fixed essentials before cutting discretionary. Total must end exactly at $${totalBudget.toLocaleString()}.
- If the sum is less than $${totalBudget.toLocaleString()}, adjust the "Other" category limit to make up the difference.
- DOUBLE-CHECK: Add up all limits before returning—the total MUST be exactly $${totalBudget.toLocaleString()}.

STEP 4: VALIDATE BEFORE RETURNING
- Review the VALIDATION CHECKLIST below before returning your response

TASK:
Create a personalized monthly budget following the steps above. Key requirements:
- ALWAYS include "Savings" as the FIRST category with limit = $${effectiveSavings.toLocaleString()}
- ALWAYS include essential categories: Groceries, Food, Housing, Transportation, Personal Care, Other, Travel, Phone, Health, Shopping, Entertainment (match to existing transaction category names if they exist)
- Use ACTUAL transaction spending patterns as foundation. Total must never exceed income (HARD RULE); if over, reduce discretionary first (STEP 3).
- For recurring large expenses, use ACTUAL amounts if they fit within income; otherwise reduce other categories (discretionary first) so total stays within income.
- Account for user's lifestyle, occupation, age, and LOCATION${
    age ? ` (age ${age})` : ""
  }${occupation ? ` (${occupation})` : ""}${location ? ` (${location})` : ""}
- Use existing category names from transactions (match exactly) - see CATEGORY NAMING RULES below
- Include 8-15 categories with appropriate emojis

CATEGORY NAMING RULES:
- CRITICAL: Use the EXACT category names from "EXISTING CATEGORY NAMES FROM TRANSACTIONS" above
- Match capitalization, spacing, and punctuation exactly (e.g., if transactions show "Personal Care", use "Personal Care" not "Personal care" or "PersonalCare")
- Only add new categories if absolutely necessary, and follow the same naming patterns as existing ones
- Examples: If transactions show "Housing", use "Housing". If transactions show "Food", use "Food". If transactions show "Home", use "Home".

BUDGET ALLOCATION GUIDELINES:
- REQUIRED ESSENTIAL CATEGORIES (always include, match to transaction category names): Groceries/Food, Housing, Personal Care, Entertainment, Transportation
- Additional categories to consider: Utilities, Insurance, Auto, Pets etc.
- If user is a student: focus on essentials, education, minimal entertainment
- If user is in 20s-30s: include housing, transportation, social activities, career development
- If user has car/auto expenses: include auto maintenance, gas, insurance
- LOCATION MATTERS: Account for cost of living based on location. Smaller cities, college towns, and less expensive areas should have lower budgets for housing, transportation, entertainment, and dining compared to major metropolitan areas.
- If no transaction history: create a standard budget based on income, user profile, and location

Return ONLY valid JSON in this exact format:
{
  "categories": [
    {
      "name": "Savings",
      "icon": "💰",
      "limit": ${effectiveSavings}
    },
    {
      "name": "Groceries",
      "icon": "🛒",
      "limit": 500
    },
    {
      "name": "Housing",
      "icon": "🏠",
      "limit": 1500
    }
  ]
}

FINAL REQUIREMENTS:
- Return 8-15 categories (including "Savings" as FIRST and "Other" as LAST)
- Total of all category limits MUST equal exactly $${totalBudget.toLocaleString()} (never exceed - see HARD RULE above)
- Category names: Use EXACT names from transactions (match capitalization/spacing), max 13 characters
- "Other" must have an appropriate limit (not 0) - typically 5-15% of remaining budget after savings
- Use single emoji per category

VALIDATION CHECKLIST BEFORE RETURNING:
✓ "Savings" is included as a category (limit = $${effectiveSavings.toLocaleString()})
✓ "Other" is LAST category (with appropriate limit, not 0)
✓ Total of all limits = exactly $${totalBudget.toLocaleString()} (never exceeds income)
✓ 8-15 categories total, all with emoji icons
✓ Category names match transactions exactly (max 13 chars, except "Savings")

Return ONLY the JSON object, no other text.`;

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
