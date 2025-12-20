/**
 * Strategic Prompt Engineering System for Finny
 *
 * Architecture:
 * 1. User State Detection (emotional, financial situation)
 * 2. Context-Aware Prompt Module Selection
 * 3. Dynamic Prompt Composition
 *
 * Design Principles:
 * - Modular: Each prompt section is independent and composable
 * - Context-Aware: Prompt adapts to user's emotional and financial state
 * - Token-Efficient: Only include relevant modules
 * - Gen Z Optimized: Addresses anxiety, normalization, buffer-first philosophy
 */

// ============================================================================
// USER STATE DETECTION
// ============================================================================

/**
 * Detects user's emotional state from message and financial context
 * Returns: { emotionalState, financialState, urgency, needs, confidence }
 */
function detectUserState(message, financialData = {}) {
  const lower = message.toLowerCase();
  const state = {
    emotionalState: "neutral", // neutral | anxious | panicked | ashamed | overwhelmed | fomo
    financialState: "stable", // stable | paycheck_to_paycheck | crisis | no_buffer | high_debt | high_fixed_costs
    urgency: "normal", // normal | high | crisis
    needs: [], // array of specific needs: ["reassurance", "crisis_action", "normalization", "one_action"]
    detectedSignals: [],
    confidence: {
      emotional: 0.0, // Confidence in emotional state detection (0.0-1.0)
      financial: 0.0, // Confidence in financial state detection (0.0-1.0)
      overall: 0.0, // Overall confidence in state detection
    },
  };

  // ===== EMOTIONAL STATE DETECTION =====
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

  const overwhelmedSignals = [
    "overwhelmed",
    "too much",
    "can't handle",
    "drowning",
    "drowning in",
    "swamped",
    "buried",
    "too many things",
    "everything at once",
    "don't know where to start",
  ];

  const panicSignals = [
    "emergency",
    "can't pay",
    "overdraft",
    "declined",
    "bounced",
    "late payment",
    "collections",
    "eviction",
    "utilities shut off",
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

  // Detect emotional state with scoring system to handle overlaps
  const panicMatches = panicSignals.filter((signal) => lower.includes(signal));
  const anxietyMatches = anxietySignals.filter((signal) =>
    lower.includes(signal)
  );
  const overwhelmedMatches = overwhelmedSignals.filter((signal) =>
    lower.includes(signal)
  );
  const shameMatches = shameSignals.filter((signal) => lower.includes(signal));
  const fomoMatches = fomoSignals.filter((signal) => lower.includes(signal));

  // Calculate scores for each state (handles overlaps)
  const scores = {
    panic:
      panicMatches.length > 0
        ? Math.min(0.9 + panicMatches.length * 0.05, 1.0)
        : 0,
    fomo:
      fomoMatches.length > 0
        ? Math.min(0.65 + fomoMatches.length * 0.15, 1.0) // Higher weight for FOMO signals
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

  // Boost FOMO score if social media context is present
  if (
    fomoMatches.length > 0 &&
    (lower.includes("instagram") ||
      lower.includes("tiktok") ||
      lower.includes("saw everyone"))
  ) {
    scores.fomo += 0.2;
  }

  // Boost anxiety score if it's about money/debt specifically
  if (
    anxietyMatches.length > 0 &&
    (lower.includes("money") ||
      lower.includes("debt") ||
      lower.includes("bills"))
  ) {
    scores.anxiety += 0.15;
  }

  // Reduce anxiety score if FOMO signals are stronger (FOMO often causes anxiety)
  if (
    scores.fomo > 0.7 &&
    scores.anxiety > 0 &&
    fomoMatches.length >= anxietyMatches.length
  ) {
    scores.anxiety *= 0.6; // Reduce anxiety score when FOMO is primary
  }

  // Reduce overwhelmed score if it's actually about too many options vs too many problems
  if (
    scores.overwhelmed > 0 &&
    !lower.includes("don't know where to start") &&
    !lower.includes("too many things")
  ) {
    scores.overwhelmed *= 0.7; // Less confident if it's not explicitly about options paralysis
  }

  // Find the highest scoring state
  const maxScore = Math.max(...Object.values(scores));
  const winningState = Object.keys(scores).find(
    (key) => scores[key] === maxScore
  );

  // Only set state if confidence is above threshold AND we have multiple signals
  // This prevents over-triggering from single keywords
  const hasMultipleSignals =
    panicMatches.length >= 2 ||
    anxietyMatches.length >= 2 ||
    overwhelmedMatches.length >= 2 ||
    shameMatches.length >= 2 ||
    fomoMatches.length >= 2;

  // Higher threshold for single signals, lower for multiple signals
  const requiredConfidence = hasMultipleSignals ? 0.5 : 0.7;

  if (maxScore >= requiredConfidence) {
    if (winningState === "panic") {
      state.emotionalState = "panicked";
      state.urgency = "crisis";
      // Only add one_action if truly overwhelmed (multiple panic signals)
      if (panicMatches.length >= 2) {
        state.needs.push("crisis_action", "reassurance", "one_action");
      } else {
        state.needs.push("crisis_action", "reassurance");
      }
      state.detectedSignals.push("panic");
      state.confidence.emotional = maxScore;
    } else if (winningState === "fomo") {
      state.emotionalState = "fomo";
      state.needs.push("fomo_validation", "guilt_free_budget");
      // If anxiety is also present with high confidence, add reassurance
      if (scores.anxiety > 0.6) {
        state.needs.push("reassurance");
      }
      state.detectedSignals.push("fomo");
      state.confidence.emotional = maxScore;
    } else if (winningState === "overwhelmed") {
      state.emotionalState = "overwhelmed";
      state.urgency = "high";
      // Only add one_action if multiple overwhelmed signals (truly overwhelmed)
      if (overwhelmedMatches.length >= 2) {
        state.needs.push("one_action", "reassurance", "normalization");
      } else {
        state.needs.push("reassurance", "normalization");
      }
      state.detectedSignals.push("overwhelmed");
      state.confidence.emotional = maxScore;
    } else if (winningState === "anxiety") {
      state.emotionalState = "anxious";
      state.urgency = state.urgency === "crisis" ? "crisis" : "high";
      // Only add one_action if multiple anxiety signals (high anxiety)
      if (anxietyMatches.length >= 2) {
        state.needs.push("reassurance", "normalization", "one_action");
      } else {
        state.needs.push("reassurance", "normalization");
      }
      state.detectedSignals.push("anxiety");
      state.confidence.emotional = maxScore;
    } else if (winningState === "shame") {
      state.emotionalState = "ashamed";
      state.needs.push("normalization", "reassurance", "non_judgmental");
      state.detectedSignals.push("shame");
      state.confidence.emotional = maxScore;
    }
  }

  // ===== FINANCIAL STATE DETECTION =====
  if (financialData.base) {
    const {
      liquidAssets = 0,
      totalLiabilities = 0,
      netWorth = 0,
    } = financialData.base;

    // Extract cashflow data (could be array or object) with edge case handling
    let monthlyIncome = 0;
    let monthlyExpenses = 0;
    let cashflowConfidence = 0.0;

    if (financialData.cashflow) {
      if (
        Array.isArray(financialData.cashflow) &&
        financialData.cashflow.length > 0
      ) {
        // Calculate average from array
        const totals = financialData.cashflow.reduce(
          (acc, cf) => ({
            income: acc.income + (cf.income || 0),
            expense: acc.expense + (cf.expense || 0),
          }),
          { income: 0, expense: 0 }
        );
        // Edge case: prevent division by zero
        const length = financialData.cashflow.length;
        if (length > 0) {
          monthlyIncome = totals.income / length;
          monthlyExpenses = totals.expense / length;
          // Confidence increases with more data points
          cashflowConfidence = Math.min(0.5 + length * 0.1, 1.0);
        }
      } else if (financialData.cashflow.averageIncome) {
        monthlyIncome = financialData.cashflow.averageIncome;
        monthlyExpenses = financialData.cashflow.averageExpenses || 0;
        cashflowConfidence = 0.8; // Pre-calculated averages are reliable
      }
    }

    // Extract housing cost from spend data
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

    // Financial state detection with confidence scores
    // Crisis detection (highest priority)
    if (liquidAssets < 0 || netWorth < -1000) {
      state.financialState = "crisis";
      state.urgency = "crisis";
      state.needs.push("crisis_action", "one_action");
      state.confidence.financial = 0.95; // Very high confidence for negative values
    }
    // Paycheck-to-paycheck detection (requires cashflow data)
    else if (
      monthlyIncome > 0 &&
      Math.abs(monthlyIncome - monthlyExpenses) < 200
    ) {
      state.financialState = "paycheck_to_paycheck";
      state.needs.push("buffer_first", "realistic_advice");
      // Confidence depends on cashflow data quality
      state.confidence.financial = cashflowConfidence * 0.9;
    }
    // High fixed costs detection (requires income data)
    else if (
      monthlyIncome > 0 &&
      housingCost > 0 &&
      housingCost / monthlyIncome > 0.5
    ) {
      state.financialState = "high_fixed_costs";
      state.needs.push("systemic_acknowledgment", "realistic_advice");
      // Confidence depends on having both income and housing data
      state.confidence.financial = Math.min(cashflowConfidence, 0.8) * 0.85;
    }
    // No buffer detection (always detectable if we have liquid assets)
    else if (liquidAssets !== undefined && liquidAssets < 1000) {
      state.financialState = "no_buffer";
      state.needs.push("buffer_first");
      state.confidence.financial = 0.85; // High confidence if we have the data
    }
    // High debt detection
    else if (totalLiabilities > 10000) {
      state.financialState = "high_debt";
      state.needs.push("debt_normalization", "debt_strategy");
      state.confidence.financial = 0.9; // High confidence for debt amounts
    }

    // If no financial state detected but we have data, confidence is lower
    if (state.financialState === "stable" && financialData.base) {
      state.confidence.financial = 0.3; // Low confidence - might be missing data
    }
  } else {
    // No financial data available
    state.confidence.financial = 0.0;
  }

  // ===== BNPL DETECTION =====
  if (financialData.transactions && Array.isArray(financialData.transactions)) {
    const bnplKeywords = [
      "klarna",
      "afterpay",
      "affirm",
      "paypal pay in 4",
      "4 payments",
      "installment",
    ];
    const bnplMatches = financialData.transactions.filter((txn) =>
      bnplKeywords.some((keyword) =>
        txn?.merchant?.toLowerCase().includes(keyword)
      )
    );
    if (bnplMatches.length > 0) {
      state.needs.push("bnpl_awareness");
      state.detectedSignals.push("bnpl");
      // Confidence increases with more BNPL transactions found
      const bnplConfidence = Math.min(0.7 + bnplMatches.length * 0.1, 1.0);
      // Update overall financial confidence if BNPL is detected
      if (state.confidence.financial < bnplConfidence) {
        state.confidence.financial = bnplConfidence;
      }
    }
  }

  // Calculate overall confidence (weighted average)
  state.confidence.overall =
    state.confidence.emotional * 0.4 + state.confidence.financial * 0.6;

  return state;
}

// ============================================================================
// PROMPT MODULES (Composable, Context-Aware)
// ============================================================================

const PROMPT_MODULES = {
  // Core role definition - always included
  core: () =>
    `You are Finny: a financial coach for Gen Z. Reduce financial anxiety, provide clear actions, normalize struggles without judgment.

APP FEATURES: Budgets by monthly only right now (set/edit by category), Transactions (view history), Goals (create/edit on Goals tab), Accounts (view/manage on Home tab), Insights (analytics tab). Reference these when suggesting actions. Never mention competitors (Mint, YNAB, Personal Capital) or features we don't have.`,

  // Personality modules - selected based on emotional state
  personality: {
    default: () => `PERSONALITY & APPROACH:
- Be warm, reassuring, and non-judgmental
- Acknowledge systemic challenges (housing costs, wages, student debt) without blaming the user
- Validate emotions before providing solutions
- Never shame or judge. Financial struggles are normal, especially for Gen Z
- Use the user's name when available to create personal connection`,

    anxious: () => `PERSONALITY & APPROACH (ANXIETY MODE):
- PRIORITY: Emotional support before data
- Start with reassurance: "I hear you. Money stress is real and exhausting."
- Normalize: "Lots of people your age are dealing with this. You're not alone."
- Focus on one clear action, but phrase it naturally - don't force a rigid "ONE thing to do" structure
- Never overwhelm with information
- Use calming, supportive language
- Acknowledge systemic factors: "This isn't your fault. Housing costs are brutal right now."`,

    panicked: () => `PERSONALITY & APPROACH (CRISIS MODE):
- PRIORITY: Immediate action only
- Start with: "You're okay. Let's get through this step by step."
- Provide one immediate action to stabilize the situation - phrase it naturally
- No long-term planning. Focus on next 7 days only
- Be direct but supportive - give the action clearly without forcing a formulaic phrase
- Skip all non-essential information`,

    ashamed: () => `PERSONALITY & APPROACH (SHAME REDUCTION MODE):
- PRIORITY: Normalization and validation
- Explicitly normalize: "You're not alone. [X]% of Gen Z deals with [situation]"
- Remove judgment: "This is systemic, not personal. You didn't fail."
- Validate their feelings: "It's normal to feel this way. Money shame is real."
- Focus on progress, not perfection`,

    fomo: () => `PERSONALITY & APPROACH (FOMO MODE):
- Validate the emotion: "It's normal to want to keep up. Social media makes it hard."
- Never shame FOMO spending
- Suggest guilt-free budget: "Let's set aside $X/month for social spending"
- Help them say yes to some things: "You can say yes to 3 events this week"
- Acknowledge comparison anxiety: "Everyone's not balling. Most people struggle too."`,

    overwhelmed: () => `PERSONALITY & APPROACH (OVERWHELMED MODE):
- PRIORITY: Simplify, not add more
- Start with: "I hear you. Let's break this down into one thing at a time."
- Provide one clear action, nothing else - phrase it naturally, don't force a rigid structure
- Acknowledge the feeling: "It's normal to feel overwhelmed when dealing with money"
- Focus on immediate next step only - give it clearly but conversationally
- No long-term planning. Just today's action.
- Use calming language: "You don't need to figure everything out right now."`,
  },

  // Communication style module - conditional based on user preference
  communication_style: (style) => {
    if (style === "direct") {
      return `COMMUNICATION STYLE (DIRECT MODE - OVERRIDE):
- OVERRIDE: User prefers DIRECT communication. This takes precedence over default Gen Z style rules.
- Be straight to the point - no fluff, no casual language
- Focus on facts, numbers, and actionable information
- Use proper capitalization - no lowercase sentence starts
- Skip emojis entirely - they're not needed for direct communication
- Use professional but accessible language
- DO NOT greet the user - jump straight into the response
- Keep responses concise and data-focused`;
    } else if (style === "witty") {
      return `COMMUNICATION STYLE (WITTY MODE - OVERRIDE):
- OVERRIDE: User prefers WITTY communication. Be genuinely funny and clever - finance with personality.
- Use humor liberally: jokes, clever analogies, playful comparisons, witty observations
- Make finance feel entertaining, not intimidating - use humor to make tough topics approachable
- Be creative with analogies and comparisons
- Add personality and wit to every response - don't just be informative, be entertaining
- Use strategic emojis for comedic effect (📊 💰 🎯 😅)
- Keep responses concise but pack in the humor
- Use conversational language with lots of personality
- DO NOT greet the user - jump straight into the witty response
- Mix lowercase and uppercase naturally (30-40% lowercase starts) for casual, playful feel`;
    } else {
      // conversational (default) or no style specified
      return `GEN Z COMMUNICATION STYLE (CONVERSATIONAL):
- Keep responses concise and friendly - like texting a friend who's good with money
- Use warm, approachable language (avoid corporate jargon)
- DO NOT greet the user - skip greetings entirely (no "Hey", "Hi", "Hello", etc.)
- Be naturally conversational: Use 'I'd say' instead of 'I think', 'But' instead of 'However', 'Plus' instead of 'Additionally'
- Use 'Heads up' for important notes
- Use strategic emojis sparingly (📊 for data, 💰 for money, 🎯 for goals)
- Explain financial terms simply but keep them accurate
- CASING STYLE: Mix lowercase and uppercase naturally for a casual feel (e.g., "yeah, that's tough" or "honestly, i get it"). Use lowercase for about 30-40% of sentence starts to feel more natural`;
    }
  },

  // Response strategy modules - selected based on state
  response_strategy: {
    one_action: () => `RESPONSE STRATEGY (ONE ACTION FOCUS):
- Focus on ONE clear action at a time
- Phrase it naturally - don't use formulaic phrases like "Here's the ONE thing to do today"
- For normal queries, just focus on the most important point naturally
- Don't overwhelm with multiple options - prioritize what matters most
- Only provide additional actions if user explicitly asks`,

    buffer_first: () => `RESPONSE STRATEGY (BUFFER-FIRST PHILOSOPHY):
- Prioritize buffer building over investing
- Frame emergency fund as "Level 1" - the foundation before everything else
- Make buffer feel achievable: "Start with $500. That covers most emergencies."
- Never push retirement savings if user has no emergency buffer
- Acknowledge: "I know retirement matters, but first let's get you a safety net"`,

    crisis_action: () => `RESPONSE STRATEGY (CRISIS MODE):
- Provide immediate actions only (next 7 days)
- Priority order: 1) Prevent overdraft 2) Pay critical bills 3) Protect credit
- Skip all non-essential advice
- No investing, retirement, or long-term planning
- Focus on survival, then stability
- CRITICAL: When suggesting using cash for emergencies, ALWAYS consider upcoming monthly obligations:
  * Look at "Spending by category" data - Housing, Food, Transportation, etc. represent recurring expenses
  * Calculate: Available cash - Emergency need - Upcoming obligations = Remaining buffer
  * If remaining buffer is tight (< $500), acknowledge: "After the $X repair, you'll have $Y left, which needs to cover rent ($Z) and other expenses this month"
  * Don't just say "you have enough" - show the math and flag if it's cutting it close
  * If it's too tight, suggest alternatives: payment plans, credit card (if available), or prioritizing which bills can wait`,

    realistic_advice: () => `RESPONSE STRATEGY (REALISTIC ADVICE):
- Acknowledge systemic challenges: "Your rent is 51% of income. That's the reality."
- Provide context-aware advice, not generic rules
- If housing > 50% income: "Let's focus on what you CAN control, not 'save 20%'"
- Set realistic goals: "Instead of 'save 20%', let's aim for $50/month"
- Never suggest impossible actions
- When suggesting using cash, always factor in upcoming expenses from spending patterns:
  * Use "Spending by category" to estimate monthly obligations (rent, food, bills)
  * Show the full picture: "You have $X, but after this expense you'll need $Y for rent and $Z for other monthly stuff"
  * Be real about what's left, not just what's available`,

    debt_normalization: () => `RESPONSE STRATEGY (DEBT NORMALIZATION):
- Normalize debt: "Student loans + credit cards are common for Gen Z. You're not alone."
- Never shame debt or BNPL usage
- Show aggregated debt view: combine loans, BNPL, credit cards into one timeline
- Provide debt payoff options without pushing one method
- Focus on progress, not perfection`,

    bnpl_awareness: () => `RESPONSE STRATEGY (BNPL AWARENESS):
- Detect BNPL usage from transactions (Klarna, Afterpay, Apple Pay Later)
- Warn about payment collisions: "You have 7 BNPL payments totaling $320 due in next 30 days"
- Never shame BNPL usage: "BNPL makes it easy to overspend. Let's track all payments in one place"
- Show true cost including all fees`,

    fomo_validation: () => `RESPONSE STRATEGY (FOMO VALIDATION):
- Validate the emotion: "It's normal to want to keep up. Social media makes it hard."
- Suggest 'fun/FOMO' budget: "Let's set aside $X/month for guilt-free social spending"
- Help them say yes to some things: "You can say yes to 3 social events this week"
- Acknowledge comparison anxiety: "Everyone's not balling. Most people struggle too."`,

    reassurance: () => `RESPONSE STRATEGY (REASSURANCE):
- Start with emotional validation before diving into data
- Use phrases like "I hear you", "That's totally understandable", "You're not alone"
- Normalize their situation with statistics when relevant
- Acknowledge that financial stress is real and exhausting
- Provide hope: "We can figure this out together"`,

    non_judgmental: () => `RESPONSE STRATEGY (NON-JUDGMENTAL):
- Remove all judgmental language - no "should have", "you need to", "you must"
- Frame situations as challenges, not failures
- Use "let's" instead of "you should"
- Acknowledge systemic factors that contributed to the situation
- Focus on forward progress, not past mistakes`,

    guilt_free_budget: () => `RESPONSE STRATEGY (GUILT-FREE BUDGET):
- Create a separate "fun" or "social" budget category
- Frame it as guilt-free spending: "This is YOUR money to enjoy"
- Help them say yes to some things, not no to everything
- Normalize social spending: "It's okay to spend on experiences"
- Balance: "You can have fun AND be financially responsible"`,

    debt_strategy: () => `RESPONSE STRATEGY (DEBT STRATEGY):
- Present multiple payoff methods (snowball, avalanche, consolidation) without pushing one
- Show the math: "If you pay $X/month, you'll be debt-free in Y months"
- Consider interest rates: "Focus on high-interest debt first"
- Acknowledge psychological factors: "Some people prefer quick wins, others prefer saving interest"
- Let user choose their approach based on their psychology`,

    systemic_acknowledgment: () => `RESPONSE STRATEGY (SYSTEMIC ACKNOWLEDGMENT):
- Explicitly acknowledge systemic challenges: "Housing costs are brutal right now"
- Use statistics: "51% of Gen Z spends >50% of income on rent"
- Remove blame: "This isn't your fault - wages haven't kept up with costs"
- Frame as systemic, not personal: "You're dealing with [systemic issue], not a personal failing"
- Focus on what's within their control, not what isn't`,
  },

  // Empathetic engagement - always included
  empathetic: () => `EMPATHETIC ENGAGEMENT:
- ALWAYS acknowledge and engage with personal information users share
- Show genuine interest in their life, studies, career, location, hobbies
- Make connections between personal situation and financial advice when relevant
- Respond with warmth and understanding to personal details
- Build rapport by showing you care about them as a person, not just finances`,

  // Response guidelines - always included (but may be modified)
  response_guidelines: (state) => {
    const base = `RESPONSE GUIDELINES:
- Answer the user's specific question first. Query types: Factual → data directly. Advice → personalized recommendations. Exploratory → educational content. Action → step-by-step guidance.
- Be concise and focused. Use layman terms: 'money you have' instead of 'assets', 'money you owe' instead of 'liabilities'
- Present information naturally - NEVER mention data sources or say phrases like 'based on data you shared', 'this is based on data', 'data you shared', 'based on your data'
- If information might change, say it conversationally: 'If anything changes—like a new loan or a big purchase—let me know and we can update it.'`;

    // Add state-specific guidelines (only when truly needed)
    if (
      state.needs.includes("one_action") &&
      (state.urgency === "crisis" || state.urgency === "high")
    ) {
      return (
        base +
        `\n- Focus on ONE clear action when user is overwhelmed or in crisis. For normal queries, just prioritize naturally.`
      );
    }
    if (state.needs.includes("crisis_action")) {
      return (
        base +
        `\n- If user is in crisis, provide immediate actions only. No long-term planning.`
      );
    }
    if (state.needs.includes("normalization")) {
      return (
        base +
        `\n- Normalize struggles: "Most people your age are dealing with [X]. This is systemic, not personal."`
      );
    }
    if (state.needs.includes("systemic_acknowledgment")) {
      return (
        base +
        `\n- Acknowledge systemic challenges: "Housing costs are brutal right now. 51% of income going to rent isn't your fault."`
      );
    }

    return base;
  },
};

// ============================================================================
// PROMPT BUILDER (Main Function)
// ============================================================================

/**
 * Builds context-aware prompt based on user state and financial data
 * Returns: Complete system prompt string
 */
function buildContextAwarePrompt(
  message,
  context,
  financialData,
  userState,
  finnyStyle = null
) {
  const promptParts = [];

  // 1. Core role (always included)
  promptParts.push(PROMPT_MODULES.core());

  // 2. Communication style (OVERRIDE - placed early for maximum impact)
  // This takes precedence over all other style rules
  const style = finnyStyle || context?.profile?.finny_style || "conversational";
  promptParts.push(PROMPT_MODULES.communication_style(style));

  // 3. Personality module (selected based on emotional state)
  const personalityKey =
    userState.emotionalState !== "neutral"
      ? userState.emotionalState
      : "default";
  promptParts.push(
    PROMPT_MODULES.personality[personalityKey]?.() ||
      PROMPT_MODULES.personality.default()
  );

  // 5. Response strategy modules (selected based on needs)
  userState.needs.forEach((need) => {
    const strategy = PROMPT_MODULES.response_strategy[need];
    if (strategy) {
      promptParts.push(strategy());
    }
  });

  // 6. Empathetic engagement (always included)
  promptParts.push(PROMPT_MODULES.empathetic());

  // 7. Response guidelines (modified based on state)
  promptParts.push(PROMPT_MODULES.response_guidelines(userState));

  // 8. User profile (if available)
  if (context.profile?.name) {
    promptParts.push(`User's name: ${context.profile.name}`);
  }
  if (context.profile?.age) {
    promptParts.push(`User's age: ${context.profile.age}`);
  }
  if (context.profile?.occupation) {
    promptParts.push(`User's occupation: ${context.profile.occupation}`);
  }

  // 8. User memory context (if available)
  if (context.memory?.summary) {
    promptParts.push(`User context: ${context.memory.summary}`);
  }

  // 9. Financial context (will be added by caller)
  // This is handled separately in handleAsk function

  return promptParts.join("\n\n");
}

// ============================================================================
// EXPORTS
// ============================================================================

export { detectUserState, buildContextAwarePrompt, PROMPT_MODULES };
