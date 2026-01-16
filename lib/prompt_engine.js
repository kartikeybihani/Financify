/**
 * World-Class Prompt Engineering System for Finny
 *
 * Architecture: 6-Layer Intent-First System
 * 1. Core Identity (Always First)
 * 2. Current Situation (Intent + State + Synthesized Context)
 * 3. Response Strategy (Prioritized, Intent-First)
 * 4. Personalization (Synthesized Memories + Profile)
 * 5. Communication Style (User Preference)
 * 6. Response Guidelines (Specific & Actionable)
 *
 * Design Principles:
 * - Intent-First: User intent ALWAYS takes precedence over inferred state
 * - Context Synthesis: Data is synthesized, not dumped
 * - Confidence-Based: Soft constraints based on confidence scores
 * - Token-Efficient: Only include relevant context
 * - Gen Z Optimized: Addresses all Gen Z pain points comprehensively
 */

// ============================================================================
// DATA SYNTHESIS FUNCTIONS
// ============================================================================

/**
 * Formats raw financial data into structured, LLM-friendly context
 * Returns: { formattedContext } - structured data presentation without rigid interpretations
 */
function synthesizeFinancialData(financialData, intent = null) {
  if (!financialData || !financialData.base) {
    console.log("⚠️ [FINANCIAL_DATA] No financial data or base pack provided");
    return {
      formattedContext: "Financial data not available",
    };
  }

  const base = financialData.base || {};
  const {
    liquidAssets = 0,
    totalLiabilities = 0,
    netWorth = 0,
    investmentsTotal = 0,
    accounts = [],
    recentTransactions = [],
    spendByCategory = [],
    budget = null,
  } = base;

  // Log what data we're formatting
  console.log("📊 [FINANCIAL_DATA] Formatting financial data:");
  console.log(
    `   - Base pack: netWorth=$${netWorth.toFixed(
      2
    )}, liquidAssets=$${liquidAssets.toFixed(
      2
    )}, liabilities=$${totalLiabilities.toFixed(2)}`
  );
  console.log(
    `   - Transactions: ${
      Array.isArray(recentTransactions) ? recentTransactions.length : 0
    } transactions`
  );
  console.log(
    `   - Accounts: ${Array.isArray(accounts) ? accounts.length : 0} accounts`
  );
  console.log(
    `   - Cashflow: ${financialData.cashflow ? "present" : "missing"}`
  );
  console.log(`   - Spend: ${financialData.spend ? "present" : "missing"}`);
  console.log(
    `   - CategoryDetails: ${
      financialData.categoryDetails ? "present" : "missing"
    }`
  );

  // Build structured financial context
  const sections = [];

  // 1. Net Worth Overview
  sections.push(`NET WORTH OVERVIEW:
- Net Worth: $${netWorth.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}
- Liquid Assets (cash, checking, savings): $${liquidAssets.toLocaleString(
    undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  )}
- Investment Assets: $${investmentsTotal.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}
- Total Liabilities (debt): $${totalLiabilities.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`);

  // 2. Accounts Breakdown
  if (Array.isArray(accounts) && accounts.length > 0) {
    const accountLines = accounts.map((acc) => {
      const name =
        acc.name || acc.official_name || acc.account_id || "Unknown Account";
      const balance =
        acc.balances?.current ?? acc.current_balance ?? acc.balance ?? 0;
      const type = acc.type || "unknown";
      const subtype = acc.subtype || "";
      const limit = acc.balances?.limit;

      let line = `- ${name}: $${Math.abs(balance).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} (${type}${subtype ? `/${subtype}` : ""})`;

      // Add credit limit if available
      if (limit && (type === "credit" || subtype === "credit card")) {
        const utilization =
          limit > 0 ? ((Math.abs(balance) / limit) * 100).toFixed(1) : 0;
        line += ` | Limit: $${limit.toLocaleString()} | Utilization: ${utilization}%`;
      }

      return line;
    });

    sections.push(`ACCOUNTS (${accounts.length} total):
${accountLines.join("\n")}`);
  }

  // 3. Recent Transactions
  if (Array.isArray(recentTransactions) && recentTransactions.length > 0) {
    const transactionLines = recentTransactions.slice(0, 10).map((txn) => {
      const merchant = txn.merchant || txn.name || "Unknown";
      const amount = txn.amount || 0;
      const date = txn.date || "";
      return `- ${date ? `${date} | ` : ""}${merchant}: $${Math.abs(
        amount
      ).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    });

    sections.push(`RECENT TRANSACTIONS (last ${recentTransactions.length}):
${transactionLines.join("\n")}`);
  }

  // 4. Spending by Category
  if (Array.isArray(spendByCategory) && spendByCategory.length > 0) {
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

  // 4.5 Budget (current month)
  if (budget && typeof budget === "object") {
    const budgetCurrency = budget.currency_code || "USD";
    const totalBudget = Number(budget.total_budget || 0);
    const periodStart = budget.period_start || "";
    const periodEnd = budget.period_end || "";
    const categories = Array.isArray(budget.categories)
      ? budget.categories
      : [];

    const safeLimit = (val) => {
      const num = Number(val || 0);
      if (!Number.isFinite(num)) return 0;
      return num;
    };

    const sorted = categories
      .map((c) => ({
        category: c?.category || "Unknown",
        limit: safeLimit(c?.limit),
      }))
      .sort((a, b) => b.limit - a.limit);

    const maxLines = 25;
    const shown = sorted.slice(0, maxLines);
    const hiddenCount = Math.max(0, sorted.length - shown.length);

    const lines = shown.map(
      (c) =>
        `- ${c.category}: $${c.limit.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${budgetCurrency}`
    );

    const headerBits = [
      periodStart && periodEnd ? `${periodStart} to ${periodEnd}` : null,
      budget.status ? `status=${budget.status}` : null,
    ].filter(Boolean);

    sections.push(
      `BUDGET (current month${
        headerBits.length ? ` | ${headerBits.join(", ")}` : ""
      }):\n` +
        `- Total budget (sum of category limits): $${totalBudget.toLocaleString(
          undefined,
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        )} ${budgetCurrency}` +
        (lines.length
          ? `\n${lines.join("\n")}`
          : "\n- No category limits set") +
        (hiddenCount > 0 ? `\n- (+${hiddenCount} more categories)` : "")
    );
  }

  // 5. Cashflow Data (if available)
  if (financialData.cashflow) {
    if (
      Array.isArray(financialData.cashflow) &&
      financialData.cashflow.length > 0
    ) {
      const cashflowLines = financialData.cashflow.map((cf, idx) => {
        const month = cf.month || cf.period || `Month ${idx + 1}`;
        const income = cf.income || 0;
        const expense = cf.expense || 0;
        const net = income - expense;
        return `- ${month}: Income $${income.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}, Expenses $${expense.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}, Net $${net.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`MONTHLY CASHFLOW (last ${
        financialData.cashflow.length
      } months):
${cashflowLines.join("\n")}`);
    } else if (financialData.cashflow.averageIncome) {
      sections.push(`CASHFLOW SUMMARY:
- Average Monthly Income: $${financialData.cashflow.averageIncome.toLocaleString(
        undefined,
        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      )}
- Average Monthly Expenses: $${(
        financialData.cashflow.averageExpenses || 0
      ).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
- Average Monthly Net: $${(
        financialData.cashflow.averageIncome -
        (financialData.cashflow.averageExpenses || 0)
      ).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`);
    }
  }

  // 6. Investment Holdings (if available)
  if (financialData.invest) {
    const invest = financialData.invest;
    if (Array.isArray(invest.holdings) && invest.holdings.length > 0) {
      const holdingLines = invest.holdings.map((holding) => {
        const symbol = holding.symbol || "Unknown";
        const description = holding.description || "";
        const units = holding.units || holding.quantity || 0;
        const value = holding.market_value || holding.value || 0;
        return `- ${symbol}${
          description ? ` (${description})` : ""
        }: ${units} units, Market Value $${value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`INVESTMENT HOLDINGS:
${holdingLines.join("\n")}`);
    }

    // Investment account balances
    if (Array.isArray(invest.balances) && invest.balances.length > 0) {
      const balanceLines = invest.balances.map((bal) => {
        const account = bal.account_name || bal.name || "Unknown Account";
        const balance = bal.balance || bal.current_balance || 0;
        return `- ${account}: $${balance.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`INVESTMENT ACCOUNT BALANCES:
${balanceLines.join("\n")}`);
    }
  }

  // 7. Goals (if available)
  if (
    financialData.goals &&
    financialData.goals.goals &&
    Array.isArray(financialData.goals.goals) &&
    financialData.goals.goals.length > 0
  ) {
    const goalLines = financialData.goals.goals.map((goal) => {
      const name = goal.label || goal.name || "Unknown Goal";
      const target = goal.target_amount || 0;
      const current = goal.current_amount || 0;
      const progress =
        goal.progress_pct ||
        (target > 0 ? ((current / target) * 100).toFixed(1) : 0);
      const targetDate = goal.target_date || "";
      return `- ${name}: $${current.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} / $${target.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} (${progress}%)${targetDate ? ` | Target: ${targetDate}` : ""}`;
    });

    sections.push(`FINANCIAL GOALS:
${goalLines.join("\n")}`);
  }

  // 8. Category Details (if available) - Detailed transaction analysis
  if (financialData.categoryDetails) {
    const catDetails = financialData.categoryDetails;
    console.log("📊 [PROMPT_ENGINE] categoryDetails pack received:", {
      hasCategory: !!catDetails.category,
      hasTransactions: Array.isArray(catDetails.transactions),
      transactionCount: Array.isArray(catDetails.transactions)
        ? catDetails.transactions.length
        : 0,
      sampleTransactions: Array.isArray(catDetails.transactions)
        ? catDetails.transactions.slice(0, 3)
        : [],
    });

    if (
      catDetails.category &&
      Array.isArray(catDetails.transactions) &&
      catDetails.transactions.length > 0
    ) {
      // Include ALL transactions with full details for pattern analysis
      const txnLines = catDetails.transactions.map((txn) => {
        const date = txn.date || "Unknown date";
        const amount = txn.amount || 0;
        const merchant = txn.merchant || txn.name || "Unknown merchant";
        const name = txn.name || merchant;
        // Include both merchant and transaction name for better pattern detection
        return `- ${date} | ${merchant}${
          name !== merchant ? ` (${name})` : ""
        }: $${amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`CATEGORY TRANSACTIONS (${catDetails.category}${
        catDetails.period ? ` - ${catDetails.period}` : ""
      }):
${txnLines.join("\n")}
Total: ${catDetails.transactions.length} transactions`);

      // Add monthly breakdown if available
      if (
        catDetails.monthlyBreakdown &&
        Array.isArray(catDetails.monthlyBreakdown) &&
        catDetails.monthlyBreakdown.length > 0
      ) {
        const monthlyLines = catDetails.monthlyBreakdown.map((month) => {
          const monthDate = month.month || "Unknown";
          const spend = month.total_spend || 0;
          const count = month.txn_count || 0;
          return `- ${monthDate}: $${spend.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} (${count} transactions)`;
        });
        sections.push(`MONTHLY BREAKDOWN (${catDetails.category}):
${monthlyLines.join("\n")}`);
      }
    }
  }

  return {
    formattedContext: sections.join("\n\n"),
  };
}

/**
 * Prioritizes and synthesizes memories for the current query
 * Returns: Array of top 3-5 most relevant synthesized memories
 */
function prioritizeMemories(memories, query, intent) {
  if (!memories || !Array.isArray(memories) || memories.length === 0) {
    return [];
  }

  // Score each memory based on relevance
  const scoredMemories = memories.map((memory) => {
    let score = 0;

    // Use similarity score from semantic search (already ranked by Supermemory)
    if (memory.similarity !== undefined) {
      score += memory.similarity * 0.5; // 50% weight on semantic similarity
    }

    // Recency boost (more recent = higher score)
    if (memory.updatedAt) {
      const daysAgo =
        (Date.now() - new Date(memory.updatedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - daysAgo / 365); // Decay over 1 year
      score += recencyScore * 0.2; // 20% weight on recency
    }

    // Type match boost
    if (intent && memory.context_type) {
      const typeMatch = {
        goal_conversation: ["goal", "decision"],
        ask_personalized: ["preference", "constraint", "life_event"],
      };
      if (
        typeMatch[intent] &&
        typeMatch[intent].includes(memory.context_type)
      ) {
        score += 0.2; // 20% boost for type match
      }
    }

    // Actionability boost (if memory contains actionable info)
    if (
      memory.content &&
      (memory.content.toLowerCase().includes("should") ||
        memory.content.toLowerCase().includes("recommend") ||
        memory.content.toLowerCase().includes("goal"))
    ) {
      score += 0.1; // 10% boost for actionable content
    }

    return { ...memory, relevanceScore: score };
  });

  // Sort by relevance score and take top 10
  const topMemories = scoredMemories
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);

  // Synthesize memories into insights
  return topMemories.map((memory) => {
    const content = memory.content || memory.summary || "";
    // Truncate at sentence boundary (max 200 chars)
    let synthesized = content;
    if (synthesized.length > 200) {
      const truncated = synthesized.substring(0, 200);
      const lastPeriod = truncated.lastIndexOf(".");
      const lastExclamation = truncated.lastIndexOf("!");
      const lastQuestion = truncated.lastIndexOf("?");
      const lastBoundary = Math.max(lastPeriod, lastExclamation, lastQuestion);
      if (lastBoundary > 100) {
        synthesized = synthesized.substring(0, lastBoundary + 1);
      } else {
        synthesized = truncated + "...";
      }
    }

    return {
      insight: synthesized,
      type: memory.context_type || "general",
      relevance: memory.relevanceScore,
    };
  });
}

// ============================================================================
// USER STATE DETECTION (Enhanced with Intent Awareness)
// ============================================================================

/**
 * Detects user's emotional state and response strategies with intent awareness
 * Returns: { emotionalState, urgency, needs, confidence }
 */
function detectUserState(
  message,
  financialData = {},
  classificationResult = null
) {
  const lower = message.toLowerCase();
  const state = {
    emotionalState: classificationResult?.emotional_state || "neutral",
    urgency: "normal",
    needs: [],
    detectedSignals: [],
    confidence: {
      emotional: classificationResult?.confidence || 0.0,
      overall: 0.0,
    },
  };

  // Use classification result if available (more accurate)
  if (
    classificationResult?.emotional_state &&
    classificationResult?.emotional_state !== "neutral"
  ) {
    state.emotionalState = classificationResult.emotional_state;
    state.confidence.emotional = classificationResult.confidence || 0.7;
  } else {
    // Fallback to keyword detection (existing logic)
    const anxietySignals = [
      "scared",
      "afraid",
      "worried",
      "anxious",
      "stressed",
      "panicked",
      "freaking out",
      "can't sleep",
      "feel sick",
      "dreading",
      "terrified",
      "nervous",
      "don't want to look",
      "avoiding",
    ];
    const panicSignals = [
      "can't pay",
      "overdraft",
      "declined",
      "bounced",
      "late payment",
      "collections",
      "eviction",
      "utilities shut off",
      "need money now",
      "broke",
      "have no money",
    ];
    const overwhelmedSignals = [
      "overwhelmed",
      "too much",
      "can't handle",
      "drowning",
      "swamped",
      "buried",
      "too many things",
      "everything at once",
      "don't know where to start",
    ];
    const shameSignals = [
      "ashamed",
      "embarrassed",
      "guilty",
      "feel stupid",
      "should have",
      "everyone else",
      "behind",
      "failure",
      "screwed up",
    ];
    const fomoSignals = [
      "saw on tiktok",
      "everyone's doing",
      "fomo",
      "impulse",
      "couldn't resist",
      "social media",
      "instagram",
      "everyone else has",
      "keeping up",
    ];

    const panicMatches = panicSignals.filter((s) => lower.includes(s));
    const anxietyMatches = anxietySignals.filter((s) => lower.includes(s));
    const overwhelmedMatches = overwhelmedSignals.filter((s) =>
      lower.includes(s)
    );
    const shameMatches = shameSignals.filter((s) => lower.includes(s));
    const fomoMatches = fomoSignals.filter((s) => lower.includes(s));

    const scores = {
      panic:
        panicMatches.length > 0
          ? Math.min(0.9 + panicMatches.length * 0.05, 1.0)
          : 0,
      fomo:
        fomoMatches.length > 0
          ? Math.min(0.65 + fomoMatches.length * 0.15, 1.0)
          : 0,
      overwhelmed:
        overwhelmedMatches.length > 0
          ? Math.min(0.75 + overwhelmedMatches.length * 0.1, 1.0)
          : 0,
      anxiety:
        anxietyMatches.length > 0
          ? Math.min(0.7 + anxietyMatches.length * 0.1, 1.0)
          : 0,
      shame:
        shameMatches.length > 0
          ? Math.min(0.7 + shameMatches.length * 0.1, 1.0)
          : 0,
    };

    const maxScore = Math.max(...Object.values(scores));
    const winningState = Object.keys(scores).find(
      (key) => scores[key] === maxScore
    );
    const hasMultipleSignals =
      panicMatches.length >= 2 ||
      anxietyMatches.length >= 2 ||
      overwhelmedMatches.length >= 2 ||
      shameMatches.length >= 2 ||
      fomoMatches.length >= 2;
    const requiredConfidence = hasMultipleSignals ? 0.5 : 0.7;

    if (maxScore >= requiredConfidence) {
      if (winningState === "panic") {
        state.emotionalState = "panicked";
        state.urgency = "crisis";
        state.needs.push("crisis_action", "reassurance");
        if (panicMatches.length >= 2) state.needs.push("one_action");
        state.confidence.emotional = maxScore;
      } else if (winningState === "fomo") {
        state.emotionalState = "fomo";
        if (scores.anxiety > 0.6) state.needs.push("reassurance");
        state.confidence.emotional = maxScore;
      } else if (winningState === "overwhelmed") {
        state.emotionalState = "overwhelmed";
        state.urgency = "high";
        state.needs.push("reassurance", "normalization");
        if (overwhelmedMatches.length >= 2) state.needs.push("one_action");
        state.confidence.emotional = maxScore;
      } else if (winningState === "anxiety") {
        state.emotionalState = "anxious";
        state.urgency = "high";
        state.needs.push("reassurance", "normalization");
        if (anxietyMatches.length >= 2) state.needs.push("one_action");
        state.confidence.emotional = maxScore;
      } else if (winningState === "shame") {
        state.emotionalState = "ashamed";
        state.needs.push("normalization", "reassurance");
        state.confidence.emotional = maxScore;
      }
    }
  }

  state.confidence.overall = state.confidence.emotional;

  return state;
}

// ============================================================================
// INTENT-STATE CONFLICT RESOLUTION
// ============================================================================

/**
 * Resolves conflicts between user intent and detected state
 * Returns: { shouldApplyConstraints, conflictLevel, awarenessNote }
 */
function resolveIntentStateConflict(intent, state) {
  const intentType = intent?.intent_type;
  const crisisConfidence =
    state.confidence.emotional > 0.8 && state.emotionalState === "panicked"
      ? state.confidence.emotional
      : 0;

  // Crisis mode handling (confidence-based, only from emotional state)
  if (crisisConfidence > 0.8) {
    // High confidence crisis - apply hard constraints
    return {
      shouldApplyConstraints: "hard",
      conflictLevel: "high",
      awarenessNote: null,
    };
  } else if (crisisConfidence > 0.6) {
    // Medium confidence crisis - add awareness, don't block
    return {
      shouldApplyConstraints: "awareness",
      conflictLevel: "medium",
      awarenessNote:
        "I noticed you might be in a tight spot financially. Want to address that first, or keep exploring?",
    };
  }

  return {
    shouldApplyConstraints: "none",
    conflictLevel: "none",
    awarenessNote: null,
  };
}

// ============================================================================
// STRATEGY SELECTION & PRIORITIZATION
// ============================================================================

/**
 * Selects and prioritizes response strategies based on intent + state
 * Returns: Array of prioritized strategy objects
 */
function selectStrategies(
  intent,
  state,
  conflictResolution,
  decisionRisk = "UNKNOWN"
) {
  const strategies = [];

  // 1. Intent-based strategies (highest priority)
  const intentStrategies = {
    exploratory: "educational_strategy",
    actionable: "step_by_step_strategy",
    emotional_support: "reassurance_strategy",
    crisis: "crisis_action_strategy",
    planning: "long_term_planning_strategy",
  };

  if (
    intent?.intent_type &&
    intentStrategies[intent.intent_type] &&
    !(
      decisionRisk === "HIGH" &&
      (intent.intent_type === "actionable" || intent.intent_type === "planning")
    )
  ) {
    strategies.push({
      name: intentStrategies[intent.intent_type],
      priority: 1,
      source: "intent",
    });
  }

  // 2. State-based strategies (medium priority - from emotional state and detected signals)
  if (
    state.confidence.emotional > 0.5 &&
    conflictResolution.shouldApplyConstraints !== "hard"
  ) {
    // Add state-based needs as strategies
    state.needs.forEach((need) => {
      if (!strategies.find((s) => s.name === need)) {
        strategies.push({
          name: need,
          priority: 2,
          source: "state",
        });
      }
    });
  }

  // 3. Context strategies (low priority - always applied)
  strategies.push({
    name: "personalization_strategy",
    priority: 3,
    source: "context",
  });

  return strategies;
}

// ============================================================================
// PROMPT MODULES (6-Layer Architecture)
// ============================================================================

const PROMPT_MODULES = {
  // Layer 1: CORE IDENTITY (Always First)
  core_identity: () => `=== CORE IDENTITY ===

You are Finny: a calm, direct (slightly blunt) personal finance coach. Your job is to help the user make good money decisions without guessing.

CORE VALUES (Unchangeable):
- User intent ALWAYS takes precedence over inferred state
- Never shame or judge financial struggles
- Acknowledge systemic challenges (housing costs, wages, student debt)
- Make users feel understood and empowered
- Be accurate over confident: if required info is missing, say so and ask

COACHING DECISION RULES (High priority):
- Clarify before advising when intent is ambiguous OR key facts are missing (esp: big purchases, investing choices, debt payoff, moving countries, marriage/kids, vague goals like "help me budget")
- Ask 1–3 sharp questions max, then stop. Don't interrogate.
- Use recent conversation turns (if provided) to resolve follow-ups and references like "it/that/this". If the user is answering a prior question, continue that reasoning instead of restarting.
- If user refuses to answer ("just tell me"):
  1) give a best-effort answer using clearly labeled assumptions,
  2) give a minimal calculation framework,
  3) give 1–3 questions they can answer later

CRITICAL NO'S (Hard Constraints):
- NEVER suggest features that don't exist
- NEVER mention competitors (Mint, YNAB, Personal Capital)
- NEVER shame debt, BNPL usage, or financial struggles
- NEVER override explicit user intent with inferred state
- NEVER invent numbers, account balances, rates, or user details

AVAILABLE APP FEATURES (ONLY THESE EXIST - for context, NOT for user navigation):
- Goals: Finny can help set and track FINANCIAL FUTURE GOALS ONLY (emergency fund, vacation, car, house down payment, retirement, etc.) - NOT for monthly budgets
- Budgets: Finny can help set and track monthly category spending limits (budgets are separate from goals)
- Transactions: Finny has access to transaction data and can answer questions about spending, categories, merchants, etc.
- Accounts: Finny can view account balances and help with account-related questions
- Cash flow: Coming soon (not yet available)
- Recurring transactions: Finny can see subscriptions, bills, income streams

CRITICAL FEATURE CLARIFICATIONS:
- Goals are ONLY for long or short-term financial goals (emergency fund, vacation, car, house, retirement, etc.)
- Budgets are for monthly category spending limits - completely separate from Goals
- NEVER suggest using Goals for budgets or monthly spending limits
- NEVER tell users to "go check" or "open" features - Finny should answer directly using available data
- Finny has access to transaction data, spending by category, account balances, and can answer questions directly`,

  // Layer 2: CURRENT SITUATION (Dynamic)
  current_situation: (
    intent,
    state,
    synthesizedFinancial,
    conflictResolution,
    webSummary = null,
    contextHeader = null,
    decisionRisk = "UNKNOWN"
  ) => {
    let section = `=== CURRENT SITUATION ===

${contextHeader ? `RUNTIME CONTEXT:\n${contextHeader}\n\n` : ""}

DECISION AUTHORITY (CRITICAL):

Current decision_risk: ${decisionRisk}

- decision_risk = LOW:
  You may answer directly.

- decision_risk = MEDIUM:
  You may answer with partial guidance.
  Prefer ranges, tradeoffs, and options over single recommendations.
  You may ask ONE follow-up question if it materially improves accuracy.

- decision_risk = HIGH:
  You are NOT allowed to give step-by-step plans, tactics, timelines, or recommendations.
  You MUST:
  - Start with a brief framing sentence.
  - Share 1–2 high-level principles only (no strategies).
  - Ask 1–3 targeted clarifying questions before proceeding.

USER'S EXPLICIT INTENT:
- Primary intent: ${intent?.intent || "ask_personalized"}
- Intent type: ${intent?.intent_type || "exploratory"}
- What user wants: ${
      intent?.intent_type === "exploratory"
        ? "Learning/understanding"
        : intent?.intent_type === "actionable"
        ? "Specific steps/actions"
        : intent?.intent_type === "emotional_support"
        ? "Reassurance/validation"
        : intent?.intent_type === "crisis"
        ? "Immediate help"
        : "Long-term planning"
    }

CRITICAL: This is the PRIMARY driver. Everything else enhances this.

EMOTIONAL STATE:
- Detected state: ${state.emotionalState}
- Confidence: ${state.confidence.emotional.toFixed(2)}
- Signals: ${state.detectedSignals.join(", ") || "none"}

IMPORTANT:
Emotional state influences tone and pacing.
It does NOT override explicit intent.
It MAY add caution or slow the response for high-risk decisions.

FINANCIAL CONTEXT (Structured Data):
${synthesizedFinancial.formattedContext}

IMPORTANT: Use this structured data to understand the user's financial situation. 
Interpret patterns naturally - don't rely on rigid rules. Consider:
- What the numbers actually mean in context
- How different accounts/assets relate to each other
- What patterns emerge from transactions and spending
- What the user's actual situation is, not what rules suggest

DATA_GAPS (Required for planning decisions):
- Income or cashflow (monthly income + fixed expenses)
- Large obligations (rent, debt payments, dependents)
- Time horizon (when this decision matters)
- Available liquid buffer

CRITICAL:
If decision_risk is HIGH and required planning data is missing (as listed in DATA_GAPS),
you must pause and ask clarifying questions before giving advice.`;

    if (conflictResolution.conflictLevel !== "none") {
      section += `\n\nCONFLICTS & CONSIDERATIONS:
- Intent vs State conflict: ${conflictResolution.conflictLevel}
- Resolution: ${
        conflictResolution.shouldApplyConstraints === "hard"
          ? "Apply constraints (crisis mode)"
          : conflictResolution.shouldApplyConstraints === "awareness"
          ? "Add gentle awareness"
          : "No constraints"
      }
${
  conflictResolution.awarenessNote
    ? `- Awareness note: "${conflictResolution.awarenessNote}"`
    : ""
}`;
    }

    if (webSummary) {
      section += `\n\nWEB CONTEXT (Current Information):
${webSummary}

IMPORTANT: Use web search results for current information (more up-to-date than training data).
When using web results, include 2-3 most relevant source URLs at the end under 'Sources:' section.
When suggesting users go online for resources, provide direct links if available.`;
    }

    return section;
  },

  // Layer 3: RESPONSE STRATEGY (Prioritized)
  response_strategy: (strategies, conflictResolution) => {
    let section = `=== RESPONSE STRATEGY ===

PRIMARY STRATEGY (From Intent):
${strategies.find((s) => s.priority === 1)?.name || "general_strategy"}

SUPPORTING STRATEGIES (From State/Context):
${
  strategies
    .filter((s) => s.priority === 2)
    .map((s) => `- ${s.name}`)
    .join("\n") || "- None"
}

STRATEGY PRIORITY RULES:
- Intent strategies ALWAYS take precedence
- State strategies enhance but don't override
- If conflict: Intent wins, state adds gentle awareness`;

    if (conflictResolution.shouldApplyConstraints === "hard") {
      section += `\n\nHARD CONSTRAINTS (Unbreakable Rules):
- Crisis mode: NO long-term planning, ONLY next 7 days
- No buffer: NO investing advice, ONLY buffer building
- High credit utilization: MUST address credit score impact
- Student loans: MUST mention optimization opportunities`;
    }

    return section;
  },

  // Layer 4: PERSONALIZATION (Synthesized)
  personalization: (
    profile,
    memories,
    feedbackContext = null,
    intentContext = null
  ) => {
    let section = `=== PERSONALIZATION ===

USER PROFILE:`;

    if (profile?.name) section += `\n- Name: ${profile.name}`;
    if (profile?.age) section += `\n- Age: ${profile.age}`;
    if (profile?.occupation) section += `\n- Occupation: ${profile.occupation}`;
    console.log("--------------------------------");
    console.log("Profile main: ", profile);
    console.log("--------------------------------");
    if (profile?.location) section += `\n- Location: ${profile.location}`;

    if (intentContext) {
      section += `\n\nUSER'S FINANCIAL PERSPECTIVE (from onboarding - use as reference, may not be current):\n${intentContext}`;
    }

    if (feedbackContext) {
      section += `\n\n${feedbackContext}

⚠️ RESPONSE LENGTH GUIDANCE ⚠️
- Match response length to question complexity - simple questions get brief answers, complex questions get thorough answers
- User preferences for style/tone apply fully
- Provide complete answers that fully address the question, regardless of complexity`;
    }

    if (memories && memories.length > 0) {
      section += `\n\nRELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS:`;
      memories.forEach((mem, idx) => {
        section += `\n${idx + 1}. ${mem.insight}`;
      });
      section += `\n\nWhen answering personal or reflective questions (e.g. "what do you know about me"),
prefer referencing identity and life-stage memories (age, student/working/occupational status, goals)
before mentioning financial numbers.`;
    }

    return section;
  },

  // Layer 5: COMMUNICATION STYLE (Single Module)
  communication_style: (style) => {
    const styleModules = {
      witty: `=== COMMUNICATION STYLE (WITTY MODE - OVERRIDE) ===
- OVERRIDE: User prefers WITTY communication. Be genuinely funny and clever.
- Use humor liberally: jokes, clever analogies, playful comparisons
- Make finance feel entertaining, not intimidating
- Use strategic and funny emojis for comedic effect
- DYNAMIC LENGTH: Keep simple questions brief (2-4 sentences), but allow natural length for complex questions that need explanation
- DO NOT greet the user - jump straight into the witty response
- Mix lowercase and uppercase naturally (30-40% lowercase starts)
- Match humor to question complexity - don't cut explanations short just to be brief
- Answer completely with wit - complex questions deserve complete witty answers`,

      direct: `=== COMMUNICATION STYLE (DIRECT MODE - OVERRIDE) ===
- OVERRIDE: User prefers DIRECT communication. This takes precedence.
- Be straight to the point - no fluff, no casual language
- Focus on facts, numbers, and actionable information
- Use proper capitalization - no lowercase sentence starts
- Skip emojis entirely
- Use professional but accessible language
- DO NOT greet the user - jump straight into the response
- DYNAMIC LENGTH: Keep simple questions brief (1-3 sentences), but provide complete direct answers for complex questions`,

      conversational: `=== GEN Z COMMUNICATION STYLE (CONVERSATIONAL) ===
- DYNAMIC LENGTH: Keep simple questions brief (2-4 sentences), but allow natural length for complex questions
- Use warm, approachable language (avoid corporate and financial jargon)
- Be naturally conversational: Use 'I'd say' instead of 'I think'
- Use strategic emojis sparingly (📊 for data, 💰 for money, 🎯 for goals)
- CASING STYLE: Mix lowercase and uppercase naturally (30-40% lowercase starts)
- Match response length to question complexity - simple gets brief, complex gets thorough`,
    };

    return styleModules[style] || styleModules.conversational;
  },

  // Layer 6: RESPONSE GUIDELINES (Specific & Actionable)
  response_guidelines: (
    intent,
    strategies,
    conflictResolution,
    userPrompt = null
  ) => {
    let section = `=== RESPONSE GUIDELINES ===

CLARIFY VS ANSWER (Most important):

For HIGH decision_risk scenarios:
- Do NOT provide step-by-step actions, strategies, or recommendations.
- You may only provide high-level principles and constraints.
- You MUST ask clarifying questions before proceeding further.

When you cannot advise yet, be calm and confident. Do not apologize excessively or hedge. This is normal advisor behavior.

If a plan appears unrealistic relative to the user's current situation, gently surface the mismatch before asking questions.

- If the user is asking for a recommendation/plan and key inputs are missing or the intent is ambiguous (including major life decisions like moving countries, marriage, kids): ask 1–3 clarifying questions first.
- If enough info is present: answer directly.
- If the user says "just tell me" / refuses:
  - For LOW or MEDIUM decision_risk: proceed with assumptions labeled "Assumptions", then a tiny framework + 1–3 follow-up questions.
  - For HIGH decision_risk: do NOT give strategies or frameworks. Reiterate constraints/principles and ask 1–3 clarifying questions.

Clarifying questions are a LAST resort.
If you can answer the question reasonably using existing context, you MUST do so.

RUNTIME COACHING FLAGS (follow strictly if present in Runtime Context):
- If clarify_one_question_only=true: ask EXACTLY ONE sharp clarifying question and STOP. Do not give advice yet.
- If offer_single_followup_question=true: after answering, you MAY add ONE specific follow-up question if it would materially improve guidance or clarify the user's goal. Skip generic filler questions.

DYNAMIC RESPONSE LENGTH (Match complexity to question needs):
- SIMPLE QUESTIONS (yes/no, numbers, dates, single facts): Few sentences max
- MEDIUM COMPLEXITY (factual questions, basic explanations): 3-5 sentences
- COMPLEX QUESTIONS (how/why explanations, analysis, comparisons, multi-step guidance): 6-10+ sentences as needed
- Match detail level to question complexity - simple questions get brief answers, complex questions get thorough answers

RESPONSE LENGTH PRINCIPLES:
- Answer COMPLETELY - don't cut corners on complex questions
- Match detail level to question complexity - simple questions get brief answers, complex questions get thorough answers
- Only add "next steps" when the user asks OR when you need clarification OR when giving a best-effort answer under assumptions
- Avoid filler closing questions; only ask questions when they unlock the next correct step
- Don't repeat information - if you already answered it, don't elaborate further
- Think: "What does this question actually need to be answered well?" - then provide that level of detail

NEVER end a response by asking if the user wants more personalized or tailored advice.
Assume all advice is already personalized unless clarification is required.

FORMATTING & SPACING (CRITICAL):
- Use good spacing between sentences - don't cram everything together
- Put the last line or two on a separate line for better readability
- Break up longer thoughts with line breaks - make it easy to scan
- Use natural paragraph breaks (blank line) when transitioning between ideas
- Format responses in a spacious, readable way - not all sentences stuck together

STRUCTURE RULES:
- Answer user's question FIRST and DIRECTLY
- For simple questions: Keep it brief (few sentences max)
- For complex questions: Provide complete answers with necessary context and explanation
- Ask questions ONLY when needed for correctness (see Clarify vs Answer)

CONTENT RULES:
- ANSWER DIRECTLY: Provide complete answers using available data. Don't tell users to "check" or "go to" features - Finny IS the interface.
- Use layman terms: "money you have" not "assets"
- Never mention data sources; Never say "based on your data" or "data that I have" or "after checking your data"
- Show math when relevant: "If you save $100/month..."
- Acknowledge uncertainty: "This might change if..."
- Missing data: Explicitly say so, ask to refresh/connect accounts. Never fabricate data
- Use only data from context. If missing, state unavailable
- For spending questions: Answer with the amount, breakdown, and insights directly from the data

DATA AUTHORITY RULE (CRITICAL):
If a value exists in the provided financial context (balances, investments, spending, net worth, user's profile, location and occupation),
you MUST treat it as accurate ground truth.
Do NOT ask the user to provide numbers that are already present in context.
Only ask for missing data that is explicitly unavailable (e.g. income if cashflow is missing).

DATA INTERPRETATION:
- EXPENSE = money spent (out), INCOME = money received (in)
- Credit cards: current_balance = debt, available_balance = credit limit
- Spending by category = RECURRING monthly expenses (Housing=rent, Food=groceries, etc.)

CALCULATIONS:
- Retirement/FIRE: 9% return, 3% inflation, 25x expenses (4% rule). Explain clearly - match detail to question complexity
- Emergency cash: Available - Expense - Upcoming obligations = Remaining buffer. If tight (<$500), suggest alternatives with appropriate context
- When showing math: Present clearly - include enough detail for user to understand, but don't over-explain simple calculations

FORMATTING RULES:
- Plain text only, no markdown headers/code blocks
- Use ** for emphasis, dashes (-) for bullets
- Natural split points: "Bottom line:", "Heads up:", "Hit me up if you need help"
- SPACING: Use good spacing between sentences - don't cram everything together
- Put the last line or two on a separate line for better readability
- Break up longer thoughts with line breaks - make responses spacious and easy to scan
- Use natural paragraph breaks (blank line) when transitioning between ideas
- Format responses in a spacious, readable way - not all sentences stuck together

DISCLAIMERS:
- Investment disclaimer only for investment-related queries
- Never suggest competitors (Mint, YNAB, Personal Capital)
- Suggest Finny features. Can suggest: credit checks, bank transfers, investment platforms, insurance

RESPONSE GUIDELINES FOR FEATURES:
- ANSWER DIRECTLY: Finny should answer questions using the data it has access to. Don't tell users to "go check" or "open" features.
- For category spending questions: Answer directly with the spending amount and breakdown from available data
- For budget questions: Answer directly if budget data is available, or help set budgets through conversation (not by directing to UI)
- For goal questions: Answer directly about goals, help create/modify goals through conversation (not by directing to UI)
- For transaction questions: Answer directly using transaction data available in context
- For account questions: Answer directly using account balance data available in context
- NEVER suggest features that don't exist
- NEVER confuse Goals (long-term financial goals) with Budgets (monthly category spending limits)
- ONLY mention specific tabs/features if user explicitly asks about them or if Finny needs to help them perform an action that requires UI navigation

TRANSACTION ANALYSIS:
- When CATEGORY TRANSACTIONS data is available, analyze patterns (frequent merchants, averages, trends) and present insights directly
- NEVER tell users to "review transactions" - Finny analyzes and reports findings

SPENDING TIP RULE (CRITICAL):

If the user asks for a spending tip (e.g. "give me a spending tip", "any spending advice"):
- You MUST start with a specific insight derived from the user's actual spending data.
- You MUST name at least one concrete category, merchant, or pattern you observe.
- You MUST NOT tell the user to "review", "check", or "look at" their transactions.
- Finny does the analysis; the user does not.
- Structure: Insight (what you notice from their spending) - Why it matters (in plain language) - One practical adjustment (optional, light)
- Do NOT ask follow-up questions unless clarification is truly required.

QUALITY CRITERIA:
- Response must answer the question COMPLETELY
- Response length must MATCH QUESTION COMPLEXITY (simple = brief, complex = thorough)
- Response must follow selected strategies with appropriate detail level
- Response must match user's style preference (witty/direct/conversational)
- Response must make user feel supported
- COMPLETENESS OVER ARBITRARY BREVITY - provide the detail level the question actually needs`;

    if (userPrompt) {
      section += `\n\nUSER GUIDANCE:\n${userPrompt}`;
    }

    if (
      conflictResolution.shouldApplyConstraints === "awareness" &&
      conflictResolution.awarenessNote
    ) {
      section += `\n\nCONFLICT AWARENESS:
- Add gentle note: "${conflictResolution.awarenessNote}"
- Don't block the answer, just add awareness
- Let user choose their path`;
    }

    return section;
  },

  // Response strategy implementations
  response_strategy_impl: {
    educational_strategy: () =>
      `Educational approach: Clear explanations, examples, context. Make complex topics simple.`,
    step_by_step_strategy: () =>
      `Step-by-step approach: Specific actions, prioritized, actionable.`,
    reassurance_strategy: () =>
      `Reassurance approach: Validation first, then gentle guidance.`,
    crisis_action_strategy: (conflictResolution) => {
      if (conflictResolution?.shouldApplyConstraints === "hard") {
        return `Crisis approach (HARD CONSTRAINTS):
- Immediate actions ONLY (next 7 days)
- Priority: Prevent overdraft → Pay critical bills → Protect credit
- NO long-term planning, NO investing advice, NO retirement planning
- Focus on survival, then stability
- Skip all non-essential advice`;
      } else {
        return `Crisis approach (AWARENESS MODE):
- Answer user's question normally
- Add gentle awareness about financial situation
- Suggest addressing immediate needs first, but don't block the answer
- Let user choose their path`;
      }
    },
    long_term_planning_strategy: () =>
      `Planning approach: Long-term view, milestones, realistic timelines.

CRITICAL: Address "feels too distant" psychological barrier:
- Acknowledge: "Retirement feels too distant and uncertain - that's normal"
- Use compound interest visualization: "If you save $100/month at 7% return, in 30 years that's $113k"
- Suggest micro-savings: "$5-10 auto-invest can make a difference"
- Show "future self" connection: "Your future self will thank you"
- Make it feel achievable, not overwhelming`,
    buffer_first: () =>
      `Prioritize buffer building over investing. Emergency fund is Level 1 foundation.`,
    crisis_action: () =>
      `Provide immediate actions only (next 7 days). Priority: Prevent overdraft → Pay critical bills → Protect credit.`,
    reassurance: () =>
      `Start with emotional validation before diving into data.`,
    normalization: () =>
      `Normalize struggles with statistics. "Most people your age deal with this."`,
    systemic_acknowledgment: () =>
      `Acknowledge systemic challenges. "Housing costs are brutal right now."`,
    realistic_advice: () =>
      `Provide context-aware advice, not generic rules. Set realistic goals.`,
    one_action: () =>
      `Focus on ONE clear action. Phrase naturally, don't use formulaic phrases.`,
    personalization_strategy: () =>
      `Use user's name when available. Reference relevant memories. Show you remember and care.`,
  },
};

// ============================================================================
// DECISION RISK ADJUSTMENT (Scale-Based)
// ============================================================================

/**
 * Adjusts decision risk based on user's financial scale, intent type, and data gaps
 * Returns: "LOW" | "MEDIUM" | "HIGH"
 */
function adjustDecisionRisk({
  baseRisk,
  intentType,
  financialData,
  dataGaps = [],
}) {
  let riskScore =
    {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      UNKNOWN: 2,
    }[String(baseRisk).toUpperCase()] ?? 2;

  const base = financialData?.base || {};
  const netWorth = Number(base.netWorth ?? NaN);
  const liquidAssets = Number(base.liquidAssets ?? NaN);

  const hasNetWorth = Number.isFinite(netWorth);
  const hasLiquidity = Number.isFinite(liquidAssets);

  // 1️⃣ Planning intent with missing planning data
  if (intentType === "planning" && dataGaps.length > 0) {
    riskScore = Math.max(riskScore, 3);
  }

  // 2️⃣ Liquidity constraint (user-scale relative)
  if (hasLiquidity && liquidAssets < 500) {
    // Anything meaningful is risky when buffer is tiny
    riskScore = Math.max(riskScore, 3);
  }

  // 3️⃣ Low net worth amplifies planning uncertainty
  if (intentType === "planning" && hasNetWorth && netWorth < 25000) {
    riskScore = Math.max(riskScore, 3);
  }

  // 4️⃣ Exploratory intent should not escalate by default
  if (intentType === "exploratory") {
    riskScore = Math.min(riskScore, 2);
  }

  return riskScore === 3 ? "HIGH" : riskScore === 2 ? "MEDIUM" : "LOW";
}

// ============================================================================
// MAIN PROMPT BUILDER (6-Layer Architecture)
// ============================================================================

/**
 * Builds world-class context-aware prompt using 6-layer architecture
 * Returns: Complete system prompt string
 */
function buildContextAwarePrompt(
  message,
  context,
  financialData,
  userState,
  finnyStyle = null,
  classificationResult = null,
  webSummary = null,
  contextHeader = null
) {
  // Get intent from classification result
  const intent = {
    intent: classificationResult?.intent || "ask_personalized",
    intent_type: classificationResult?.intent_type || null,
  };

  // Adjust decision risk based on scale, intent, and data gaps
  const baseDecisionRisk = classificationResult?.decision_risk || "UNKNOWN";
  const decisionRisk = adjustDecisionRisk({
    baseRisk: baseDecisionRisk,
    intentType: intent.intent_type,
    financialData,
    dataGaps: classificationResult?.missing_fields || [],
  });

  // Synthesize financial data
  const synthesizedFinancial = synthesizeFinancialData(financialData, intent);

  // Resolve intent-state conflicts
  const conflictResolution = resolveIntentStateConflict(intent, userState);

  // Select strategies
  const strategies = selectStrategies(
    intent,
    userState,
    conflictResolution,
    decisionRisk
  );

  // Prioritize and synthesize memories
  const memories = context.memory?.memories
    ? prioritizeMemories(context.memory.memories, message, intent.intent)
    : [];

  // Get user's preferred style
  const style = finnyStyle || context?.profile?.finny_style || "conversational";

  // Feedback context should be built in handleAsk and passed here
  const feedbackContext = context.feedbackContext || null;

  // Build prompt using 6-layer architecture
  const promptParts = [];

  // Layer 1: Core Identity (Always First)
  promptParts.push(PROMPT_MODULES.core_identity());

  // Layer 2: Current Situation (Dynamic)
  promptParts.push(
    PROMPT_MODULES.current_situation(
      intent,
      userState,
      synthesizedFinancial,
      conflictResolution,
      webSummary,
      contextHeader,
      decisionRisk
    )
  );

  // Layer 3: Response Strategy (Prioritized)
  promptParts.push(
    PROMPT_MODULES.response_strategy(strategies, conflictResolution)
  );

  // Add strategy implementations
  strategies.forEach((strategy) => {
    const impl = PROMPT_MODULES.response_strategy_impl[strategy.name];
    if (impl) {
      // Some strategies need conflict resolution context
      let strategyContent;
      if (typeof impl === "function") {
        // Pass conflictResolution to crisis_action_strategy
        if (strategy.name === "crisis_action_strategy") {
          strategyContent = impl(conflictResolution);
        } else {
          strategyContent = impl();
        }
      } else {
        strategyContent = impl;
      }
      promptParts.push(
        `${strategy.name.toUpperCase().replace(/_/g, " ")}:\n${strategyContent}`
      );
    }
  });

  // Layer 4: Personalization (Synthesized)
  promptParts.push(
    PROMPT_MODULES.personalization(
      context.profile || {},
      memories,
      feedbackContext || null,
      context.profile?.intent_context || null
    )
  );

  // Layer 5: Communication Style (Single Module)
  promptParts.push(PROMPT_MODULES.communication_style(style));

  // Layer 6: Response Guidelines (Specific & Actionable)
  promptParts.push(
    PROMPT_MODULES.response_guidelines(
      intent,
      strategies,
      conflictResolution,
      context.userPrompt || null
    )
  );

  // Log selected modules for debugging
  console.log(
    `\n📦 [PROMPT_ENGINE] 6-Layer Architecture: 1. Core Identity | 2. Current Situation (${
      intent.intent_type || "unknown"
    } intent) | 3. Response Strategy (${
      strategies.length
    } strategies) | 4. Personalization (${
      memories.length
    } memories) | 5. Communication Style (${style}) | 6. Response Guidelines`
  );

  return promptParts.join("\n\n");
}

// ============================================================================
// CLASSIFICATION PROMPT
// ============================================================================

/**
 * Returns the classification prompt for intent detection
 * Returns: Complete classification prompt string
 */
function getClassificationPrompt() {
  return [
    "You are Finny's intelligent classification system. Analyze user messages to understand their intent, emotional state, and what resources they need.",
    "",
    "=== PRIMARY INTENT CLASSIFICATION ===",
    "Classify into exactly ONE primary intent:",
    "- ask_personalized: Questions about user's finances (spending, accounts, goals, investments, affordability, advice)",
    "- goal_conversation: Creating NEW goals or setting savings targets (explicit goal creation statements)",
    "- stock_query: Questions about specific stocks, tickers, or companies (e.g., 'What about Apple?', 'Tell me about AAPL', 'Should I buy Tesla stock?')",
    "- off_topic: Non-financial topics (weather, cooking, entertainment, general chat, etc)",
    "",
    "GOAL_CONVERSATION STRICTNESS (important):",
    "- Use goal_conversation ONLY when the user explicitly wants to create/set/add a goal in the app (they say 'create a goal', 'set a goal', 'add a goal', or clearly refer to the Goals feature).",
    "- If the user mentions a life goal (house, car, travel, kids) but is asking for feasibility/advice/planning, that is ask_personalized (NOT goal_conversation).",
    "",
    "=== INTENT TYPE (What user wants to accomplish) ===",
    "Detect the underlying intent type (can combine with primary intent):",
    "- exploratory: Learning, understanding concepts ('tell me about investing', 'explain Roth IRA', 'what is a 401k')",
    "- actionable: Specific steps or how-to ('how do I save', 'what should I do', 'help me budget')",
    "- emotional_support: Seeking reassurance, validation ('I'm worried about money', 'am I doing okay?')",
    "- crisis: Immediate urgent help needed ('can't pay rent', 'overdraft', 'need money now')",
    "- planning: Long-term strategy ('retirement planning', 'investment strategy', 'financial plan')",
    "",
    "=== EMOTIONAL STATE DETECTION ===",
    "Detect emotional state from language and context (be nuanced, avoid false positives):",
    "- neutral: No strong emotional signals detected",
    "- anxious: Worry, stress, uncertainty ('worried', 'stressed', 'anxious', 'nervous', 'afraid')",
    "- panicked: Urgent crisis language ('can't pay', 'overdraft', 'declined', 'bounced', 'emergency', 'need money now')",
    "- ashamed: Shame, guilt, embarrassment ('ashamed', 'embarrassed', 'feel stupid', 'should have', 'failure')",
    "- overwhelmed: Too much to handle ('overwhelmed', 'too much', 'can't handle', 'drowning', 'don't know where to start')",
    "- fomo: Fear of missing out ('saw on tiktok', 'everyone's doing', 'fomo', 'impulse', 'couldn't resist')",
    "",
    "CRITICAL EMOTIONAL DETECTION RULES:",
    "- Only detect emotional state if there are CLEAR signals. Don't infer emotions from neutral questions.",
    "- 'Tell me about investing' → neutral (informational query, no emotional distress)",
    "- 'I'm worried about my debt' → anxious (explicit worry)",
    "- 'Can I afford Italy trip?' → neutral (affordability question, not emotional)",
    "- 'I can't pay my rent this month' → panicked (crisis language)",
    "- 'I feel stupid for spending so much' → ashamed (self-blame language)",
    "",
    "=== FLAG RULES (can combine) ===",
    "- needs_user_data=true: Answer requires user's actual data (spend, net worth, accounts, goals, personal recommendations, affordability checks)",
    "- needs_web=true: Answer requires current/2024-2025 info (limits, rates, brackets, market/news, card offers, current regulations)",
    "- needs_clarification=true: The user is asking for advice/plan but key inputs are missing or intent is ambiguous (Ask handler will ask 1–3 questions before advising)",
    "",
    "=== INFO SUFFICIENCY & RISK (Reliable routing) ===",
    "Set these fields so the Ask handler can safely clarify instead of guessing:",
    "- info_sufficiency: 'sufficient'|'missing'|'unknown'",
    "- missing_fields: array of strings from this set:",
    "  [income_takehome,income_gross,fixed_expenses,current_savings,debt_balances,credit_score,purchase_price,down_payment,timeline,location,risk_tolerance,investing_horizon,goal_amount,goal_date,move_countries,employer_match]",
    "- decision_risk: 'low'|'medium'|'high'",
    "- missing_fields must be UNIQUE and short: choose at most 5, no duplicates",
    "",
    "Decision risk guidance (examples, context-dependent):",
    "- high: decisions that commit a large portion of the user's resources, create long-term obligations, or require missing planning data",
    "- medium: decisions with meaningful tradeoffs but reversible or limited downside",
    "- low: definitions, explanations, or small factual questions",
    "",
    "If the user asks a high-risk question and details are missing, set needs_clarification=true and include missing_fields like timeline, income_takehome, fixed_expenses, current_savings, debt_balances, location (as applicable).",
    "",
    "Ambiguity rule:",
    "- If the user asks an ambiguous decision question (e.g., 'should I', 'is it worth it', 'help me decide') and it's medium/high stakes, set needs_clarification=true even if missing_fields is empty (Ask handler may ask 1 sharp question to confirm goal).",
    "",
    "High-stakes planning rule (non-rigid, apply broadly):",
    "- If the user is describing a major plan/decision (big purchase, multiple big goals, multi-country plan, life decision) and asks for guidance/feasibility without key numbers, set decision_risk='high', needs_clarification=true, info_sufficiency='missing'.",
    "- In those cases, include the most relevant missing_fields (pick 3–5): timeline, purchase_price, down_payment, income_takehome, fixed_expenses, current_savings, debt_balances, location.",
    "- Set intent_type='actionable' for feasibility/planning questions, even if the user didn't explicitly say 'how'.",
    "- Do NOT set needs_web=true just because it's a big decision. needs_web is only for current rates/brackets/regulations/news or explicitly asked country-specific rules.",
    "",
    "Info sufficiency rule:",
    "- Default to info_sufficiency='missing' for advice/feasibility questions unless the user supplied the key inputs in their message.",
    "- Do not label info_sufficiency='sufficient' when missing_fields is empty but the user gave no numbers.",
    "",
    "Consistency rule:",
    "- If info_sufficiency is 'missing', needs_clarification MUST be true.",
    "",
    "Examples (follow these patterns):",
    "- 'I want to buy houses in Italy and Japan' -> intent_type:'actionable', decision_risk:'high', needs_web:false, needs_clarification:true, info_sufficiency:'missing', missing_fields includes 3–5 of: timeline, purchase_price, down_payment, income_takehome, fixed_expenses, current_savings, debt_balances, location",
    "- 'Should I save $5000 for a house?' -> ask_personalized (advice), NOT goal_conversation; intent_type:'actionable'",
    "",
    "=== CRITICAL CLASSIFICATION RULES ===",
    "1. Affordability queries are ALWAYS ask_personalized (not goal_conversation):",
    "   - 'Can I afford X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
    "   - 'Can I afford to go Italy trip?' → ask_personalized, needs_user_data:true, intent_type:actionable",
    "   - 'Can I go afford a $1500 trip?' → ask_personalized, needs_user_data:true, intent_type:actionable",
    "",
    "2. Investment advice queries NEVER need web search:",
    "   - 'Tell me about investing' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:exploratory",
    "   - 'Investment advice' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:actionable",
    "   - 'What should I invest in?' → ask_personalized, needs_web:false, needs_user_data:true, intent_type:actionable",
    "",
    "3. Goal queries NEVER need web search:",
    "   - 'Show my goals' → ask_personalized, needs_web:false, needs_user_data:true (inquiry, not creation)",
    "   - 'I want to save $5000 for a house' → goal_conversation, needs_web:false, needs_user_data:true (creation)",
    "",
    "4. Advice-seeking queries are ask_personalized (not goal_conversation):",
    "   - 'What's a good emergency amount for me?' → ask_personalized, needs_user_data:true, intent_type:actionable",
    "   - 'Should I buy X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
    "   - 'Is it worth it to buy X?' → ask_personalized, needs_user_data:true, intent_type:actionable",
    "",
    "5. Credit card queries ALWAYS need web search:",
    "   - 'What credit card should I get?' → ask_personalized, needs_web:true, needs_user_data:true",
    "",
    "6. Stock queries REQUIRE a SPECIFIC ticker/company - general queries are ask_personalized:",
    "   - 'What about Apple stock?' → stock_query, needs_web:false, needs_user_data:false, ticker:'AAPL' (SPECIFIC company)",
    "   - 'Tell me about AAPL' → stock_query, needs_web:false, needs_user_data:false, ticker:'AAPL' (SPECIFIC ticker)",
    "   - 'Should I buy Tesla?' → stock_query, needs_web:false, needs_user_data:true, ticker:'TSLA' (SPECIFIC company)",
    "   - 'Tell me about the stock market' → ask_personalized, needs_web:true (GENERAL - no specific ticker)",
    "",
    "7. TICKER DETECTION RULES:",
    "   - ONLY classify as stock_query if a SPECIFIC ticker symbol OR company name is mentioned",
    "   - Extract ticker symbols (1-5 uppercase letters): AAPL, TSLA, MSFT, GOOGL, etc.",
    "   - Map company names to tickers: Apple→AAPL, Tesla→TSLA, Microsoft→MSFT, Google→GOOGL, Amazon→AMZN, Meta→META, NVIDIA→NVDA",
    "   - If multiple tickers detected, include all in entities array",
    "   - If ticker is ambiguous (e.g., 'Apple' without context), set confidence < 0.8",
    "   - If NO specific ticker/company mentioned, use ask_personalized (NOT stock_query)",
    "",
    "=== OUTPUT FORMAT ===",
    "CRITICAL: You MUST return ONLY valid JSON. No markdown, no code fences, no extra text, no comments.",
    "The JSON must be parseable by JSON.parse(). Follow this EXACT structure:",
    "",
    '{"intent":"ask_personalized","intent_type":"exploratory","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"needs_clarification":false,"info_sufficiency":"sufficient","missing_fields":[],"decision_risk":"low","state":null,"entities":[],"ticker":null,"confidence":0.95}',
    "",
    "Valid JSON format rules:",
    "- Use double quotes for all strings",
    "- Use lowercase true/false (not True/False)",
    "- Use null (not NULL or None)",
    "- No trailing commas",
    "- No extra whitespace or line breaks inside JSON",
    "- All fields must be present",
    "",
    "Field requirements:",
    "- intent: REQUIRED string (ask_personalized|goal_conversation|stock_query|off_topic)",
    "- intent_type: string or null (exploratory|actionable|emotional_support|crisis|planning|null)",
    "- emotional_state: REQUIRED string (neutral|anxious|panicked|ashamed|overwhelmed|fomo)",
    "- needs_web: REQUIRED boolean (true|false)",
    "- needs_user_data: REQUIRED boolean (true|false)",
    "- needs_clarification: REQUIRED boolean (true|false)",
    "- info_sufficiency: REQUIRED string ('sufficient'|'missing'|'unknown')",
    "- missing_fields: REQUIRED array (empty array [] if none)",
    "- decision_risk: REQUIRED string ('low'|'medium'|'high')",
    "- state: string or null (state code like AZ, CA, or null)",
    "- entities: REQUIRED array (empty array [] if none, or ticker symbols if stock_query)",
    "- ticker: string or null (ticker symbol like 'AAPL', 'TSLA', or null if not stock_query or ambiguous)",
    "- confidence: REQUIRED number (0.0-1.0)",
    "",
    "TICKER EXTRACTION RULES:",
    "- For stock_query intent, extract ticker symbol from message",
    "- If ticker is clear (e.g., 'AAPL', 'TSLA'), set ticker field and confidence >= 0.9",
    "- If company name maps to ticker (e.g., 'Apple'→'AAPL'), set ticker and confidence >= 0.8",
    "- If ticker is ambiguous or unclear, set ticker:null and confidence < 0.8",
    "- Always include ticker in entities array if detected",
    "",
    "CRITICAL: Meta/system questions about AI capabilities are ALWAYS off_topic:",
    "- 'Can you learn from our conversations?' → off_topic",
    "- 'Do you remember our previous chat?' → off_topic",
    "- 'Are you an AI?' → off_topic",
    "- 'How do you work?' → off_topic",
    "",
    "IMPORTANT:",
    "- Be precise with emotional_state: only detect if CLEAR signals exist, default to 'neutral'",
    "- intent_type can be null for off_topic queries",
    "- confidence should reflect how certain you are (0.9+ for clear cases, 0.7-0.9 for ambiguous)",
    "- If needs_clarification=true, set info_sufficiency to 'missing' or 'unknown' and include missing_fields",
    "- Return ONLY the JSON object, nothing else",
  ].join("\n");
}

// ============================================================================
// GOAL ANALYSIS PROMPT BUILDER
// ============================================================================

/**
 * Builds a comprehensive prompt for analyzing a user's newly created goal
 * Returns: Complete prompt string for LLM analysis
 */
function buildGoalAnalysisPrompt(goalData, userContext) {
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
    day
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
        targetDate.getDate() - (monthsRemaining === monthsDiff ? day : 0)
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
    } = base;

    sections.push(`=== FINANCIAL CONTEXT ===

NET WORTH OVERVIEW:
- Net Worth: $${netWorth.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}
- Liquid Assets (cash, checking, savings): $${liquidAssets.toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    )}
- Investment Assets: $${investmentsTotal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}
- Total Liabilities (debt): $${totalLiabilities.toLocaleString(undefined, {
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
            return `- ${date ? `${date} | ` : ""}${merchant}: $${Math.abs(
              amount
            ).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
          });

        sections.push(`PAST 1 MONTH TRANSACTIONS (${
          lastMonthTransactions.length
        } total):
${txnLines.join("\n")}`);
      }
    }

    // Spending by Category
    if (Array.isArray(spendByCategory) && spendByCategory.length > 0) {
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
          })} ${budgetCurrency}`
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
// EXPORTS
// ============================================================================

export {
  detectUserState,
  buildContextAwarePrompt,
  PROMPT_MODULES,
  synthesizeFinancialData,
  prioritizeMemories,
  resolveIntentStateConflict,
  selectStrategies,
  getClassificationPrompt,
  buildGoalAnalysisPrompt,
};
