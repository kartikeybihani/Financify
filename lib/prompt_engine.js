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
 * Synthesizes raw financial data into contextual summaries
 * Returns: { summary, keyNumbers, trends, constraints, confidence }
 */
function synthesizeFinancialData(financialData, intent = null) {
  if (!financialData || !financialData.base) {
    return {
      summary: "Financial data not available",
      keyNumbers: {},
      trends: "unknown",
      constraints: [],
      confidence: 0.0,
    };
  }

  const {
    liquidAssets = 0,
    totalLiabilities = 0,
    netWorth = 0,
  } = financialData.base;

  // Extract cashflow data
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  let cashflowConfidence = 0.0;

  if (financialData.cashflow) {
    if (
      Array.isArray(financialData.cashflow) &&
      financialData.cashflow.length > 0
    ) {
      const totals = financialData.cashflow.reduce(
        (acc, cf) => ({
          income: acc.income + (cf.income || 0),
          expense: acc.expense + (cf.expense || 0),
        }),
        { income: 0, expense: 0 }
      );
      const length = financialData.cashflow.length;
      if (length > 0) {
        monthlyIncome = totals.income / length;
        monthlyExpenses = totals.expense / length;
        cashflowConfidence = Math.min(0.5 + length * 0.1, 1.0);
      }
    } else if (financialData.cashflow.averageIncome) {
      monthlyIncome = financialData.cashflow.averageIncome;
      monthlyExpenses = financialData.cashflow.averageExpenses || 0;
      cashflowConfidence = 0.8;
    }
  }

  // Extract housing cost
  let housingCost = 0;
  if (financialData.spend) {
    if (financialData.spend.housing) {
      housingCost = financialData.spend.housing;
    } else if (Array.isArray(financialData.spend.categoryBreakdown)) {
      const housingCategory = financialData.spend.categoryBreakdown.find(
        (cat) =>
          cat.category?.toLowerCase().includes("housing") ||
          cat.category?.toLowerCase().includes("rent")
      );
      if (housingCategory) {
        housingCost = housingCategory.total_spend || 0;
      }
    }
  }

  // Detect student loans from transactions
  let studentLoanPayments = 0;
  let studentLoanDetected = false;
  if (financialData.transactions && Array.isArray(financialData.transactions)) {
    const studentLoanKeywords = [
      "student loan",
      "navient",
      "nelnet",
      "great lakes",
      "mohela",
      "fedloan",
      "sallie mae",
      "department of education",
    ];
    const studentLoanTxns = financialData.transactions.filter((txn) =>
      studentLoanKeywords.some(
        (keyword) =>
          txn?.merchant?.toLowerCase().includes(keyword) ||
          txn?.name?.toLowerCase().includes(keyword)
      )
    );
    if (studentLoanTxns.length > 0) {
      studentLoanDetected = true;
      studentLoanPayments = studentLoanTxns.reduce(
        (sum, txn) => sum + Math.abs(txn.amount || 0),
        0
      );
    }
  }

  // Detect credit card utilization
  let creditUtilization = null;
  let highCreditUtilization = false;
  if (financialData.accounts && Array.isArray(financialData.accounts)) {
    const creditCards = financialData.accounts.filter(
      (acc) => acc.type === "credit" || acc.subtype === "credit card"
    );
    if (creditCards.length > 0) {
      const totalCreditLimit = creditCards.reduce(
        (sum, card) => sum + (card.balances?.limit || 0),
        0
      );
      const totalBalance = creditCards.reduce(
        (sum, card) => sum + Math.abs(card.balances?.current || 0),
        0
      );
      if (totalCreditLimit > 0) {
        creditUtilization = (totalBalance / totalCreditLimit) * 100;
        highCreditUtilization = creditUtilization > 30; // 30% threshold
      }
    }
  }

  // Detect income volatility (side hustles, multiple income sources)
  let incomeVolatile = false;
  if (
    Array.isArray(financialData.cashflow) &&
    financialData.cashflow.length >= 3
  ) {
    const incomes = financialData.cashflow.map((cf) => cf.income || 0);
    const avgIncome = incomes.reduce((a, b) => a + b, 0) / incomes.length;
    const variance =
      incomes.reduce((sum, inc) => sum + Math.pow(inc - avgIncome, 2), 0) /
      incomes.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgIncome > 0 ? stdDev / avgIncome : 0;
    // If income varies by more than 15%, consider it volatile
    incomeVolatile = coefficientOfVariation > 0.15;
  }

  // Build synthesized summary
  const constraints = [];
  let summary = "";

  // Crisis detection
  if (liquidAssets < 0 || netWorth < -1000) {
    summary = `You're in a financial crisis. You have negative cash ($${Math.abs(
      liquidAssets
    ).toLocaleString()}) or negative net worth ($${Math.abs(
      netWorth
    ).toLocaleString()}).`;
    constraints.push("Immediate crisis - focus on survival");
  }
  // Paycheck-to-paycheck
  else if (
    monthlyIncome > 0 &&
    Math.abs(monthlyIncome - monthlyExpenses) < 200
  ) {
    summary = `You're living paycheck-to-paycheck. You have about $${Math.abs(
      monthlyIncome - monthlyExpenses
    ).toLocaleString()} left each month after expenses.`;
    constraints.push("Limited monthly surplus");
  }
  // High fixed costs
  else if (
    monthlyIncome > 0 &&
    housingCost > 0 &&
    housingCost / monthlyIncome > 0.5
  ) {
    const housingPercent = Math.round((housingCost / monthlyIncome) * 100);
    summary = `Your rent/housing costs are ${housingPercent}% of your income ($${housingCost.toLocaleString()}/month). This is tight but manageable.`;
    constraints.push(`High housing costs (${housingPercent}% of income)`);
  }
  // No buffer
  else if (liquidAssets !== undefined && liquidAssets < 1000) {
    summary = `You have $${liquidAssets.toLocaleString()} in cash. This is tight—you're building your buffer.`;
    constraints.push("No emergency buffer yet");
  }
  // Stable
  else {
    summary = `You have $${liquidAssets.toLocaleString()} in cash and $${netWorth.toLocaleString()} net worth.`;
  }

  // Add debt context
  if (totalLiabilities > 0) {
    summary += ` You have $${totalLiabilities.toLocaleString()} in debt.`;
    if (studentLoanDetected) {
      summary += ` This includes student loans (detected $${studentLoanPayments.toLocaleString()}/month in payments).`;
      constraints.push("Student loan burden");
    }
    if (highCreditUtilization) {
      summary += ` Your credit card utilization is ${creditUtilization.toFixed(
        0
      )}% (above 30% threshold).`;
      constraints.push("High credit utilization");
    }
  }

  // Add income volatility
  if (incomeVolatile) {
    summary += ` Your income varies month-to-month (side hustles or gig work detected).`;
    constraints.push("Income volatility");
  }

  // Add monthly context
  if (monthlyIncome > 0) {
    const monthlySurplus = monthlyIncome - monthlyExpenses;
    if (monthlySurplus > 0) {
      summary += ` You're saving about $${monthlySurplus.toLocaleString()}/month.`;
    } else if (monthlySurplus < 0) {
      summary += ` You're spending about $${Math.abs(
        monthlySurplus
      ).toLocaleString()}/month more than you earn.`;
      constraints.push("Negative cash flow");
    }
  }

  // Determine trends (simplified - would need historical data for real trends)
  const trends = "stable"; // Could be "improving" | "worsening" | "stable"

  return {
    summary,
    keyNumbers: {
      liquidAssets,
      netWorth,
      totalDebt: totalLiabilities,
      monthlyIncome,
      monthlyExpenses,
      housingCost,
      studentLoanPayments,
      creditUtilization,
    },
    trends,
    constraints,
    confidence: Math.max(cashflowConfidence, 0.7),
    flags: {
      studentLoanDetected,
      highCreditUtilization,
      incomeVolatile,
    },
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

CRITICAL NO'S (Hard Constraints):
- NEVER suggest features that don't exist (only: Budgets, Transactions, Goals, Accounts, Insights tabs)
- NEVER mention competitors (Mint, YNAB, Personal Capital)
- NEVER shame debt, BNPL usage, or financial struggles
- NEVER override explicit user intent with inferred state`,

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

FINANCIAL CONTEXT (Synthesized):
${synthesizedFinancial.summary}

Key Constraints:
${
  synthesizedFinancial.constraints.length > 0
    ? synthesizedFinancial.constraints.map((c) => `- ${c}`).join("\n")
    : "- None detected"
}`;

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

    if (contextHeader) {
      section += `\n\nCONTEXT INFORMATION:
${contextHeader}`;
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
      section += `\n\n${feedbackContext}`;
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
- Keep responses concise but pack in the humor
- DO NOT greet the user - jump straight into the witty response
- Mix lowercase and uppercase naturally (30-40% lowercase starts)`,

      direct: `=== COMMUNICATION STYLE (DIRECT MODE - OVERRIDE) ===
- OVERRIDE: User prefers DIRECT communication. This takes precedence.
- Be straight to the point - no fluff, no casual language
- Focus on facts, numbers, and actionable information
- Use proper capitalization - no lowercase sentence starts
- Skip emojis entirely
- Use professional but accessible language
- DO NOT greet the user - jump straight into the response
- Keep responses concise and data-focused`,

      conversational: `=== GEN Z COMMUNICATION STYLE (CONVERSATIONAL) ===
- Keep responses concise and friendly - like texting a friend
- Use warm, approachable language (avoid corporate jargon)
- DO NOT greet the user - skip greetings entirely
- Be naturally conversational: Use 'I'd say' instead of 'I think'
- Use strategic emojis sparingly (📊 for data, 💰 for money, 🎯 for goals)
- CASING STYLE: Mix lowercase and uppercase naturally (30-40% lowercase starts)`,
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

STRUCTURE RULES:
- Answer user's question FIRST
- Then provide context/explanation
- Then suggest actions (if applicable)
- End with next steps or open question

CONTENT RULES:
- Use layman terms: "money you have" not "assets"
- Never mention data sources: Don't say "based on your data"
- Show math when relevant: "If you save $100/month..."
- Acknowledge uncertainty: "This might change if..."
- Missing data: Explicitly say so, ask to refresh/connect accounts. Never fabricate data
- Use only data from context. If missing, state unavailable

DATA INTERPRETATION:
- EXPENSE = money spent (out), INCOME = money received (in)
- Credit cards: current_balance = debt, available_balance = credit limit
- Spending by category = RECURRING monthly expenses (Housing=rent, Food=groceries, etc.)

CALCULATIONS:
- Retirement/FIRE: 7% return, 3% inflation, 25x expenses (4% rule). Show optimistic/conservative scenarios. Explain math simply
- Emergency cash: Available - Expense - Upcoming obligations = Remaining buffer. If tight (<$500), suggest alternatives

FORMATTING RULES:
- Plain text only, no markdown headers/code blocks
- Use ** for emphasis, dashes (-) for bullets
- Natural split points: "Bottom line:", "Heads up:", "Hit me up if you need help"

DISCLAIMERS:
- Investment disclaimer only for investment-related queries
- Never suggest competitors (Mint, YNAB, Personal Capital)
- Suggest Finny features. Can suggest: credit checks, bank transfers, investment platforms, insurance

QUALITY CRITERIA:
- Response must answer the question
- Response must follow selected strategies
- Response must match user's style preference
- Response must make user feel supported`;

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
  console.log(`\n📦 [PROMPT_ENGINE] 6-Layer Architecture:`);
  console.log(`   1. Core Identity`);
  console.log(
    `   2. Current Situation (${intent.intent_type || "unknown"} intent)`
  );
  console.log(`   3. Response Strategy (${strategies.length} strategies)`);
  console.log(`   4. Personalization (${memories.length} memories)`);
  console.log(`   5. Communication Style (${style})`);
  console.log(`   6. Response Guidelines`);

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
