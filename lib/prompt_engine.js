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

  // Sort by relevance score and take top 5
  const topMemories = scoredMemories
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);

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
function selectStrategies(intent, state, conflictResolution) {
  const strategies = [];

  // 1. Intent-based strategies (highest priority)
  const intentStrategies = {
    exploratory: "educational_strategy",
    actionable: "step_by_step_strategy",
    emotional_support: "reassurance_strategy",
    crisis: "crisis_action_strategy",
    planning: "long_term_planning_strategy",
  };

  if (intent?.intent_type && intentStrategies[intent.intent_type]) {
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

You are Finny: a financial coach for Gen Z. Your mission is to reduce financial anxiety, provide clear actions, and normalize struggles without judgment.

CORE VALUES (Unchangeable):
- User intent ALWAYS takes precedence over inferred state
- Never shame or judge financial struggles
- Acknowledge systemic challenges (housing costs, wages, student debt)
- Make users feel understood and empowered
- BREVITY IS CRITICAL: Keep responses SHORT and BRIEF - answer directly, skip unnecessary explanations, avoid lengthy "next steps" unless explicitly needed

CRITICAL NO'S (Hard Constraints):
- NEVER suggest features that don't exist
- NEVER mention competitors (Mint, YNAB, Personal Capital)
- NEVER shame debt, BNPL usage, or financial struggles
- NEVER override explicit user intent with inferred state

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
    contextHeader = null
  ) => {
    let section = `=== CURRENT SITUATION ===

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

IMPORTANT: Only influences tone/approach, NEVER blocks intent fulfillment.

FINANCIAL CONTEXT (Structured Data):
${synthesizedFinancial.formattedContext}

IMPORTANT: Use this structured data to understand the user's financial situation. 
Interpret patterns naturally - don't rely on rigid rules. Consider:
- What the numbers actually mean in context
- How different accounts/assets relate to each other
- What patterns emerge from transactions and spending
- What the user's actual situation is, not what rules suggest`;

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

    if (intentContext) {
      section += `\n\nUSER'S FINANCIAL PERSPECTIVE (from onboarding - use as reference, may not be current):\n${intentContext}`;
    }

    if (feedbackContext) {
      section += `\n\n${feedbackContext}

⚠️ CRITICAL OVERRIDE: BREVITY TAKES PRECEDENCE ⚠️
- If user preferences mention "long responses" or "detailed responses", IGNORE them
- BREVITY IS MANDATORY - keep responses SHORT (2-4 sentences max for simple questions)
- User preferences for style/tone still apply, but length MUST be brief`;
    }

    if (memories && memories.length > 0) {
      section += `\n\nRELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS:`;
      memories.forEach((mem, idx) => {
        section += `\n${idx + 1}. ${mem.insight}`;
      });
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
- 🚨 BREVITY FIRST: Keep responses SHORT - 2-4 sentences MAX for simple questions, pack humor into brief responses
- DO NOT greet the user - jump straight into the witty response
- Mix lowercase and uppercase naturally (30-40% lowercase starts)
- Skip lengthy explanations and next steps - keep it punchy and brief
- STOP after answering - don't add extra jokes or elaborations`,

      direct: `=== COMMUNICATION STYLE (DIRECT MODE - OVERRIDE) ===
- OVERRIDE: User prefers DIRECT communication. This takes precedence.
- Be straight to the point - no fluff, no casual language
- Focus on facts, numbers, and actionable information
- Use proper capitalization - no lowercase sentence starts
- Skip emojis entirely
- Use professional but accessible language
- DO NOT greet the user - jump straight into the response
- Keep responses BRIEF and concise - 1-3 sentences for simple questions, data-focused only`,

      conversational: `=== GEN Z COMMUNICATION STYLE (CONVERSATIONAL) ===
- Keep responses BRIEF and concise - like texting a friend (2-4 sentences max for simple questions)
- Use warm, approachable language (avoid corporate jargon)
- DO NOT greet the user - skip greetings entirely
- Be naturally conversational: Use 'I'd say' instead of 'I think'
- Use strategic emojis sparingly (📊 for data, 💰 for money, 🎯 for goals)
- CASING STYLE: Mix lowercase and uppercase naturally (30-40% lowercase starts)
- Skip unnecessary explanations and next steps - get straight to the answer`,
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

🚨 CRITICAL: BREVITY IS MANDATORY - OVERRIDES ALL OTHER INSTRUCTIONS 🚨
- RESPONSES MUST BE SHORT AND BRIEF - aim for 2-4 sentences maximum for simple questions
- MAXIMUM TOKEN LIMIT: Keep responses under 500 tokens (approximately 200-300 words)
- Answer the question DIRECTLY - skip all unnecessary context, explanations, and background
- NEVER add "next steps" or "here's what you can do" sections unless user explicitly asks for them
- NEVER add closing questions like "Want to know more?" or "Need help with anything else?" - skip entirely
- If the answer is a number, date, or yes/no - keep it to 1-2 sentences max
- Skip lengthy explanations - only include what's absolutely essential to answer the question
- Don't repeat information - if you already answered it, don't elaborate further
- Think: "What's the shortest way to answer this?" - then make it even shorter
- If user preferences say "long responses" - IGNORE them, brevity takes precedence
- STOP writing as soon as you've answered the question - don't add extra context or suggestions

STRUCTURE RULES:
- Answer user's question FIRST and DIRECTLY - that's it for simple questions
- Only add brief context if it's absolutely essential (1 sentence max)
- NEVER add "next steps" sections - skip entirely unless user explicitly asks
- NEVER add closing questions - skip entirely unless genuinely critical
- For simple questions (yes/no, numbers, dates): Answer in 1-2 sentences maximum

CONTENT RULES:
- ANSWER DIRECTLY: Provide complete answers using available data. Don't tell users to "check" or "go to" features - Finny IS the interface.
- Use layman terms: "money you have" not "assets"
- Never mention data sources: Don't say "based on your data"
- Show math when relevant: "If you save $100/month..."
- Acknowledge uncertainty: "This might change if..."
- Missing data: Explicitly say so, ask to refresh/connect accounts. Never fabricate data
- Use only data from context. If missing, state unavailable
- For spending questions: Answer with the amount, breakdown, and insights directly from the data

DATA INTERPRETATION:
- EXPENSE = money spent (out), INCOME = money received (in)
- Credit cards: current_balance = debt, available_balance = credit limit
- Spending by category = RECURRING monthly expenses (Housing=rent, Food=groceries, etc.)

CALCULATIONS:
- Retirement/FIRE: 7% return, 3% inflation, 25x expenses (4% rule). Keep explanations BRIEF - one sentence max
- Emergency cash: Available - Expense - Upcoming obligations = Remaining buffer. If tight (<$500), suggest alternatives BRIEFLY
- When showing math: Keep it to one line, don't elaborate unless absolutely necessary

FORMATTING RULES:
- Plain text only, no markdown headers/code blocks
- Use ** for emphasis, dashes (-) for bullets
- Natural split points: "Bottom line:", "Heads up:", "Hit me up if you need help"

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

QUALITY CRITERIA:
- Response must answer the question
- Response must be BRIEF (2-4 sentences max for simple questions)
- Response must follow selected strategies (but keep them brief)
- Response must match user's style preference (witty/direct/conversational) BUT keep it SHORT
- Response must make user feel supported
- BREVITY OVERRIDES ALL OTHER CRITERIA - if you must choose between detailed and brief, choose brief`;

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

  // Synthesize financial data
  const synthesizedFinancial = synthesizeFinancialData(financialData, intent);

  // Resolve intent-state conflicts
  const conflictResolution = resolveIntentStateConflict(intent, userState);

  // Select strategies
  const strategies = selectStrategies(intent, userState, conflictResolution);

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
      contextHeader
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
};
