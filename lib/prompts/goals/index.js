/**
 * Goal analysis prompts for Finny.
 */

/**
 * Builds a comprehensive prompt for analyzing a user's newly created goal
 * Returns: Complete prompt string for LLM analysis
 */
export function buildGoalAnalysisPrompt(goalData, userContext) {
  const {
    goal,
    userProfile,
    memories = [],
    financialData,
    currentGoals = [],
    currentBudget = null,
  } = userContext;

  // Get today's date for context
  const today = new Date();
  // Use local date components to avoid timezone issues
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // getMonth() returns 0-11
  const day = today.getDate();
  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
  const todayFormatted = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Calculate months remaining until goal date
  let monthsRemaining = null;
  if (goal.target_date) {
    try {
      const targetDate = new Date(goal.target_date);
      const monthsDiff =
        (targetDate.getFullYear() - year) * 12 +
        (targetDate.getMonth() + 1 - month);
      // Adjust if target day is before today's day in the target month
      if (targetDate.getDate() < day) {
        monthsRemaining = Math.max(0, monthsDiff - 1);
      } else {
        monthsRemaining = Math.max(0, monthsDiff);
      }
      // Convert to approximate decimal (e.g., 7.5 months)
      const daysInMonth = new Date(year, month, 0).getDate();
      const daysRemaining = Math.max(
        0,
        targetDate.getDate() - (monthsRemaining === monthsDiff ? day : 0),
      );
      monthsRemaining = monthsRemaining + daysRemaining / daysInMonth;
    } catch (e) {
      // If date parsing fails, leave monthsRemaining as null
    }
  }

  // Extract first name only
  const firstName = userProfile?.name ? userProfile.name.split(" ")[0] : null;

  const sections = [];

  // 1. Core Identity & Role (Advisor Authority)
  sections.push(`=== CORE IDENTITY ===

You are Finny: a calm, direct (slightly blunt) personal finance coach. Your job is to analyze this newly created goal and provide personalized, actionable insights to the user. 
You act as a professional advisor who handles analysis, calculations, and recommendations automatically - the user doesn't need to do the work themselves.

ADVISOR AUTHORITY (CRITICAL):
- You ARE the advisor - you analyze transactions, spending patterns, and budgets automatically
- You DO the work - you identify cutback opportunities, calculate savings potential, and provide specific recommendations
- You DON'T ask users to "review" or "check" their data - you analyze it and report findings
- You DON'T delegate analysis to the user - you perform it yourself as their advisor
- Think of yourself as a financial advisor who has already done the analysis and is presenting findings

Your job is to analyze this newly created goal and provide personalized, actionable insights to the user. You have full access to their financial data and should use it proactively to give them a complete analysis.

CORE VALUES:
- Never shame or judge financial struggles
- Acknowledge systemic challenges (housing costs, wages, student debt)
- Be encouraging but realistic
- Match the user's conversation style preference
- Provide specific, actionable advice based on their actual financial situation
- Act as a pure advisor: analyze, calculate, and recommend - don't ask users to do the analysis`);

  // 2. Goal Details
  sections.push(`=== GOAL DETAILS ===

The user just created this goal:

Goal Name: ${goal.label || "N/A"}
Target Amount: $${(goal.target_amount || 0).toLocaleString()}
Current Amount: $${(goal.current_amount || 0).toLocaleString()}
Target Date: ${goal.target_date || "N/A"}
Category: ${goal.category || "other"}
${goal.note ? `Note: ${goal.note}` : ""}

Progress: ${
    goal.target_amount > 0
      ? ((goal.current_amount / goal.target_amount) * 100).toFixed(1)
      : 0
  }%

Today's Date: ${todayFormatted} (${todayStr})
Target Date: ${goal.target_date || "N/A"}${
    monthsRemaining !== null
      ? ` (${monthsRemaining.toFixed(1)} months from today)`
      : ""
  }`);

  // 3. User Profile & Personalization
  sections.push(`=== USER PROFILE ===

${firstName ? `Name: ${firstName}` : ""}
${userProfile?.age ? `Age: ${userProfile.age}` : ""}
${userProfile?.occupation ? `Occupation: ${userProfile.occupation}` : ""}
${userProfile?.location ? `Location: ${userProfile.location}` : ""}
Conversation Style: ${userProfile?.finny_style || "conversational"}

IMPORTANT: Match your response tone to their conversation style preference:
- conversational: Warm, approachable, Gen Z friendly
- direct: Straight to the point, no fluff
- witty: Genuinely very funny and clever`);

  // 4. Relevant Memories
  if (memories && memories.length > 0) {
    const memoryText = memories
      .slice(0, 15)
      .map((mem, idx) => `${idx + 1}. ${mem.insight || mem.content || mem}`)
      .join("\n");
    sections.push(`=== RELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS ===

${memoryText}

Use these memories to provide personalized insights and show you remember their context.`);
  }

  // 5. Financial Context
  if (financialData) {
    const base = financialData.base || {};
    const {
      liquidAssets = 0,
      totalLiabilities = 0,
      netWorth = 0,
      investmentsTotal = 0,
      accounts = [],
      recentTransactions = [],
      spendByCategory = [],
      spendByCategoryCurrentMonth = [],
      spendByCategoryLastMonth = [],
    } = base;

    sections.push(`=== FINANCIAL CONTEXT ===

NET WORTH OVERVIEW:
- Net Worth: $${netWorth.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}
- Liquid Assets (cash, checking, savings): $${liquidAssets.toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    )}
- Investment Assets: $${investmentsTotal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}
- Total Debt: $${totalLiabilities.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`);

    // Recent Transactions (last month)
    if (Array.isArray(recentTransactions) && recentTransactions.length > 0) {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const lastMonthTransactions = recentTransactions.filter((txn) => {
        const txnDate = new Date(txn.date || txn.inserted_at);
        return txnDate >= oneMonthAgo;
      });

      if (lastMonthTransactions.length > 0) {
        const txnLines = lastMonthTransactions
          .slice(0, 50) // Limit to 50 transactions
          .map((txn) => {
            const merchant = txn.merchant_name || txn.name || "Unknown";
            const amount = txn.amount || 0;
            const date = txn.date || "";
            // Plaid convention: positive = expense (debit), negative = income (credit)
            const isIncome = amount < 0;
            const amountDisplay = isIncome
              ? `+$${Math.abs(amount).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} (Income/credits/refunds)`
              : `-$${Math.abs(amount).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} (Expenses)`;
            return `- ${date ? `${date} | ` : ""}${merchant}: ${amountDisplay}`;
          });

        sections.push(`PAST 1 MONTH TRANSACTIONS (${
          lastMonthTransactions.length
        } total):
NOTE: Positive amounts are Income/credits/refunds, negative amounts are Expenses.
${txnLines.join("\n")}`);
      }
    }

    // Spending by Category - Current Month and Last Complete Month
    // Helper function to format month name (e.g., "January 2026")
    const formatMonthYear = (date) => {
      const d = new Date(date);
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    };

    const now = new Date();
    const currentMonthName = formatMonthYear(now);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthName = formatMonthYear(lastMonth);

    // Current Month Spending
    if (
      Array.isArray(spendByCategoryCurrentMonth) &&
      spendByCategoryCurrentMonth.length > 0
    ) {
      const categoryLines = spendByCategoryCurrentMonth.map((cat) => {
        const category = cat.category || cat.name || "Unknown";
        const total = cat.total_spend || cat.amount || 0;
        return `- ${category}: $${total.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`SPENDING BY CATEGORY - CURRENT MONTH (${currentMonthName}):
${categoryLines.join("\n")}`);
    }

    // Last Complete Month Spending
    if (
      Array.isArray(spendByCategoryLastMonth) &&
      spendByCategoryLastMonth.length > 0
    ) {
      const categoryLines = spendByCategoryLastMonth.map((cat) => {
        const category = cat.category || cat.name || "Unknown";
        const total = cat.total_spend || cat.amount || 0;
        return `- ${category}: $${total.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`SPENDING BY CATEGORY - LAST COMPLETE MONTH (${lastMonthName}):
${categoryLines.join("\n")}`);
    }

    // Backward compatibility: If new fields don't exist but old field does, use old field
    if (
      (!Array.isArray(spendByCategoryCurrentMonth) ||
        spendByCategoryCurrentMonth.length === 0) &&
      (!Array.isArray(spendByCategoryLastMonth) ||
        spendByCategoryLastMonth.length === 0) &&
      Array.isArray(spendByCategory) &&
      spendByCategory.length > 0
    ) {
      const categoryLines = spendByCategory.map((cat) => {
        const category = cat.category || cat.name || "Unknown";
        const total = cat.total_spend || cat.amount || 0;
        return `- ${category}: $${total.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`SPENDING BY CATEGORY (last 30 days):
${categoryLines.join("\n")}`);
    }
  }

  // 6. Current Budget
  if (currentBudget) {
    const budgetCurrency = currentBudget.currency_code || "USD";
    const totalBudget = Number(currentBudget.total_budget || 0);
    const categories = Array.isArray(currentBudget.categories)
      ? currentBudget.categories
      : [];

    if (categories.length > 0) {
      const budgetLines = categories.slice(0, 25).map(
        (c) =>
          `- ${c.category || c.label || "Unknown"}: $${(
            c.limit ||
            c.limit_amount ||
            0
          ).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${budgetCurrency}`,
      );

      sections.push(`CURRENT BUDGET:
- Total budget: $${totalBudget.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${budgetCurrency}
${budgetLines.join("\n")}`);
    }
  }

  // 7. Current Goals
  if (currentGoals && currentGoals.length > 0) {
    const goalLines = currentGoals.map((g) => {
      const name = g.label || g.name || "Unknown Goal";
      const target = g.target_amount || 0;
      const current = g.current_amount || 0;
      const progress =
        g.progress_pct ||
        (target > 0 ? ((current / target) * 100).toFixed(1) : 0);
      const targetDate = g.target_date || "";
      return `- ${name}: $${current.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} / $${target.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} (${progress}%)${targetDate ? ` | Target: ${targetDate}` : ""}`;
    });

    sections.push(`CURRENT GOALS ON THE PLAN (excluding the one being analyzed):
${goalLines.join("\n")}`);
  }

  // 8. Analysis Instructions
  sections.push(`=== ANALYSIS INSTRUCTIONS ===

Analyze this goal and provide personalized insights. Your response should:

1. FEASIBILITY ASSESSMENT:
   - Calculate monthly savings needed to reach the goal
   - Assess if the timeline is realistic given their financial situation
   - Consider their current spending patterns and budget
   - Evaluate if this conflicts with existing goals

2. AUTOMATED TRANSACTION ANALYSIS (CRITICAL):
   - YOU MUST analyze their transactions automatically - do NOT ask them to review their budget
   - Identify specific areas where they can realistically cut back. Few examples: 
     * Easy cuts: Eating out, entertainment subscriptions, impulse purchases, unused subscriptions
     * Medium cuts: Shopping for non-essentials, travel expenses, luxury items
     * Hard cuts: Groceries (only if clearly excessive), rent (suggest roommate if overpaying significantly)
   - Be specific: reference actual transaction amounts and merchants when relevant
   - Calculate potential monthly savings from identified cutbacks
   - Frame it as "I analyzed your transactions and found..." not "you should review..."

3. PERSONALIZED INSIGHTS:
   - Reference their actual financial data (net worth, spending, transactions)
   - Consider their conversation style preference (${
     userProfile?.finny_style || "conversational"
   })
   - Reference relevant memories if applicable
   - Acknowledge their specific situation (age, occupation, location if available)

4. ACTIONABLE ADVICE:
   - Provide specific, practical steps they can take
   - Suggest adjustments if the goal seems unrealistic
   - Highlight potential conflicts with existing goals
   - Offer encouragement while being realistic
   - For savings accounts: If they have savings accounts, say "add the money to your existing savings account". If not, say "consider opening a dedicated savings account for this goal"

5. TONE & STYLE:
   - Match their conversation style preference: ${
     userProfile?.finny_style || "conversational"
   }
   - Be VERY conversational - talk like a friend, not a robotic financial advisor
   - Be encouraging but honest and direct
   - Use their first name if available: ${firstName || "user"}
   - Keep it personal and relatable
   - If the goal requires significant sacrifice, acknowledge it bluntly: "This will require some real sacrifice if you're serious about it"
   - If the goal seems nearly impossible, suggest delaying: "This timeline might be too tight - could you push the date back?"
   - Be warm and human, not clinical or formal

6. RESPONSE FORMAT:
   - Start with 1-2 introductory lines that acknowledge the user in a thoughtful, cool, or witty way (match their conversation style)
   - Examples: "Love that you're thinking ahead with this one." / "This is a solid goal - let's make it happen." / "Alright, time to get strategic about this."
   - Then transition naturally to "Hey [name]!" - NO title line like "Goal Analysis: ..."
   - Write naturally, as if you're having a conversation with a friend
   - Use bullet points for actionable items and key findings (fewer long paragraphs)
   - Use hyphens (-) for bullet points, NOT asterisks (*) or (+) or other symbols
   - Be thorough but concise (aim for slightly shorter than typical)
   - Use good spacing between sections, but don't add unnecessary blank lines
   - Use emojis sparingly (only if conversational style)
   - For section titles, use double asterisks like **Title** (NOT markdown headers like ### Title)
   - After section titles, go DIRECTLY into the content - NO subtitles or explanatory phrases like "Let's break down the numbers:" or "To make this goal more achievable, consider the following:"
   - Section titles should be followed immediately by the actual content (bullets or paragraphs)
   - No markdown headers (###) or code blocks
   - Flow naturally from one thought to the next without excessive spacing

CRITICAL RULES:
- Base all calculations on their ACTUAL financial data provided
- Don't make assumptions about income if not provided
- Be realistic about timelines and feasibility
- Acknowledge if the goal is ambitious but achievable
- If the goal requires significant sacrifice, be blunt about it
- If the goal seems nearly impossible, suggest delaying the target date
- Warn if there are conflicts with existing goals
- Provide encouragement appropriate to their situation
- NEVER ask the user to review their budget - you analyze it for them
- Be specific about transaction analysis findings, not generic`);

  return sections.join("\n\n");
}

// ============================================================================
// ONBOARDING EARLY INSIGHTS (EXACT PROMPT FROM tests/basic.js)
// ============================================================================
