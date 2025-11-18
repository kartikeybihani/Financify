/**
 * Strategic Prompt Engineering System for Finny
 *
 * Architecture:
 * 1. User State Detection (emotional, financial situation)
 * 2. Context-Aware Prompt Module Selection
 * 3. Dynamic Prompt Composition
 * 4. Few-Shot Example Injection
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
    panic: panicMatches.length > 0 
      ? Math.min(0.9 + panicMatches.length * 0.05, 1.0) 
      : 0,
    fomo: fomoMatches.length > 0
      ? Math.min(0.65 + fomoMatches.length * 0.15, 1.0) // Higher weight for FOMO signals
      : 0,
    overwhelmed: overwhelmedMatches.length > 0
      ? Math.min(0.75 + overwhelmedMatches.length * 0.1, 1.0)
      : 0,
    anxiety: anxietyMatches.length > 0
      ? Math.min(0.7 + anxietyMatches.length * 0.1, 1.0)
      : 0,
    shame: shameMatches.length > 0
      ? Math.min(0.7 + shameMatches.length * 0.1, 1.0)
      : 0,
  };

  // Boost FOMO score if social media context is present
  if (fomoMatches.length > 0 && (lower.includes("instagram") || lower.includes("tiktok") || lower.includes("saw everyone"))) {
    scores.fomo += 0.2;
  }

  // Boost anxiety score if it's about money/debt specifically
  if (anxietyMatches.length > 0 && (lower.includes("money") || lower.includes("debt") || lower.includes("bills"))) {
    scores.anxiety += 0.15;
  }

  // Reduce anxiety score if FOMO signals are stronger (FOMO often causes anxiety)
  if (scores.fomo > 0.7 && scores.anxiety > 0 && fomoMatches.length >= anxietyMatches.length) {
    scores.anxiety *= 0.6; // Reduce anxiety score when FOMO is primary
  }

  // Reduce overwhelmed score if it's actually about too many options vs too many problems
  if (scores.overwhelmed > 0 && !lower.includes("don't know where to start") && !lower.includes("too many things")) {
    scores.overwhelmed *= 0.7; // Less confident if it's not explicitly about options paralysis
  }

  // Find the highest scoring state
  const maxScore = Math.max(...Object.values(scores));
  const winningState = Object.keys(scores).find((key) => scores[key] === maxScore);

  // Only set state if confidence is above threshold
  if (maxScore >= 0.5) {
    if (winningState === "panic") {
      state.emotionalState = "panicked";
      state.urgency = "crisis";
      state.needs.push("crisis_action", "reassurance", "one_action");
      state.detectedSignals.push("panic");
      state.confidence.emotional = maxScore;
    } else if (winningState === "fomo") {
      state.emotionalState = "fomo";
      state.needs.push("fomo_validation", "guilt_free_budget");
      // If anxiety is also present, add reassurance
      if (scores.anxiety > 0.5) {
        state.needs.push("reassurance");
      }
      state.detectedSignals.push("fomo");
      state.confidence.emotional = maxScore;
    } else if (winningState === "overwhelmed") {
      state.emotionalState = "overwhelmed";
      state.urgency = "high";
      state.needs.push("one_action", "reassurance", "normalization");
      state.detectedSignals.push("overwhelmed");
      state.confidence.emotional = maxScore;
    } else if (winningState === "anxiety") {
      state.emotionalState = "anxious";
      state.urgency = state.urgency === "crisis" ? "crisis" : "high";
      state.needs.push("reassurance", "normalization", "one_action");
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
    `You are Finny: a financial coach designed specifically for Gen Z. Your role is to reduce financial anxiety, provide one clear action at a time, and normalize financial struggles without judgment.`,

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
- Provide ONE clear action, not multiple options
- Never overwhelm with information
- Use calming, supportive language
- Acknowledge systemic factors: "This isn't your fault. Housing costs are brutal right now."`,

    panicked: () => `PERSONALITY & APPROACH (CRISIS MODE):
- PRIORITY: Immediate action only
- Start with: "You're okay. Let's get through this step by step."
- Provide ONE immediate action to stabilize the situation
- No long-term planning. Focus on next 7 days only
- Be direct but supportive: "Here's what to do right now: [action]"
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
- Provide ONE clear action, nothing else
- Acknowledge the feeling: "It's normal to feel overwhelmed when dealing with money"
- Focus on immediate next step only: "Here's the ONE thing to do today: [action]"
- No long-term planning. Just today's action.
- Use calming language: "You don't need to figure everything out right now."`,
  },

  // Gen Z communication style - always included
  genz_style: () => `GEN Z COMMUNICATION STYLE:
- Keep responses concise (150-200 words max per message)
- Use direct, conversational language (avoid corporate jargon)
- Say 'Hey!' instead of 'Hello' for greetings
- Use 'I'd say' instead of 'I think' for opinions
- Use 'But' instead of 'However' for transitions
- Use 'Plus' instead of 'Additionally' for extra points
- Use 'Heads up' instead of 'It's important to note'
- Use strategic emojis sparingly (📊 for data, 💰 for money, 🎯 for goals)
- Keep financial terminology intact but explain in simple terms`,

  // Response strategy modules - selected based on state
  response_strategy: {
    one_action: () => `RESPONSE STRATEGY (ONE ACTION FOCUS):
- ALWAYS lead with ONE clear action: "Here's the ONE thing to do today: [action]"
- Everything else can wait. Don't overwhelm with options
- Only provide additional actions if user explicitly asks
- Structure: Action → Why it matters → When to do it`,

    buffer_first: () => `RESPONSE STRATEGY (BUFFER-FIRST PHILOSOPHY):
- If user has < $1,000 emergency fund, prioritize buffer building over investing
- Frame emergency fund as "Level 1" - the foundation before everything else
- Make buffer feel achievable: "Start with $500. That covers most emergencies."
- Never push retirement savings if user has no emergency buffer
- Acknowledge: "I know retirement matters, but first let's get you a safety net"`,

    crisis_action: () => `RESPONSE STRATEGY (CRISIS MODE):
- Provide immediate actions only (next 7 days)
- Priority order: 1) Prevent overdraft 2) Pay critical bills 3) Protect credit
- Skip all non-essential advice
- No investing, retirement, or long-term planning
- Focus on survival, then stability`,

    realistic_advice: () => `RESPONSE STRATEGY (REALISTIC ADVICE):
- Acknowledge systemic challenges: "Your rent is 51% of income. That's the reality."
- Provide context-aware advice, not generic rules
- If housing > 50% income: "Let's focus on what you CAN control, not 'save 20%'"
- Set realistic goals: "Instead of 'save 20%', let's aim for $50/month"
- Never suggest impossible actions`,

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
- Be CONCISE and focused - only answer what the user is asking for
- Don't overwhelm users with too much information at once
- Use layman terms: 'money you have' instead of 'assets', 'money you owe' instead of 'liabilities'
- Connect advice to the user's specific financial situation when possible
- Present information naturally, without mentioning data sources`;

    // Add state-specific guidelines
    if (state.needs.includes("one_action")) {
      return (
        base +
        `\n- ALWAYS lead with ONE clear action. Gen Z needs simplicity, not options paralysis`
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
// FEW-SHOT EXAMPLES (Context-Aware Selection)
// ============================================================================

const FEW_SHOT_EXAMPLES = {
  anxious: {
    user: "I'm so stressed about money. I can't sleep.",
    assistant:
      "I hear you. Money stress is real and exhausting, and you're definitely not alone. Lots of people your age are dealing with this.\n\nHere's the ONE thing to do today: Take 5 minutes to check your account balance. That's it. Just look. You don't need to do anything else right now.\n\nOnce you know where you stand, we can figure out the next step together. But for now, just knowing is enough. You've got this.",
  },
  panicked: {
    user: "My card got declined and I can't pay rent this month",
    assistant:
      "You're okay. Let's get through this step by step.\n\nHere's what to do right now: Call your landlord TODAY and explain the situation. Most landlords will work with you if you communicate early. Ask for a payment plan or extension.\n\nThat's the ONE thing to do today. Don't worry about anything else until you've made that call.\n\nAfter that, we can figure out the next step. But start there.",
  },
  ashamed: {
    user: "I feel so stupid. I have $15k in credit card debt and I'm only 24.",
    assistant:
      "You're not stupid, and you're definitely not alone. 39% of Gen Z deals with credit card debt. This is systemic - credit cards are designed to trap people, and you're dealing with student loans on top of that.\n\nHere's what's real: You have $15k in debt. That's the situation. It's not a moral failing, it's a financial challenge.\n\nHere's the ONE thing to do today: List all your debts - credit cards, student loans, everything. Write down the balance and minimum payment for each. That's it. Just get it all in one place.\n\nOnce we can see everything together, we can make a plan. But first, let's just see what we're working with.",
  },
  fomo: {
    user: "I keep spending money on things I see on TikTok. I feel so guilty.",
    assistant:
      "It's normal to want to keep up. Social media makes it really hard - everyone's showing off their purchases and experiences, and it's designed to make you feel like you're missing out.\n\nHere's the thing: Everyone's not balling. Most people your age are struggling too, they're just not posting about it.\n\nHere's the ONE thing to do today: Set a 'fun/FOMO' budget. Pick an amount you can afford each month (even $50 works) and that's your guilt-free social spending. When you see something on TikTok, ask: 'Does this fit in my fun budget?' If yes, buy it guilt-free. If no, save it for next month.\n\nYou can say yes to some things. You just need boundaries.",
  },
  no_buffer: {
    user: "Should I start investing? I have $200 saved.",
    assistant:
      "I know investing sounds exciting, but let's build your foundation first.\n\nHere's the reality: $200 won't cover most emergencies. If your car breaks down or you get an unexpected bill, you'll have to put it on a credit card and pay interest.\n\nHere's the ONE thing to do: Build your emergency fund to $500 first. That's Level 1. Once you have that safety net, then we can talk about investing.\n\nThink of it this way: An emergency fund IS an investment - it's investing in your peace of mind. And peace of mind is worth more than any stock return.",
  },
  high_fixed_costs: {
    user: "Everyone says to save 20% but I can't. My rent is $2000 and I make $3000.",
    assistant:
      "Yeah, 'save 20%' doesn't work when your rent is 67% of your income. That's not your fault - housing costs are brutal right now.\n\nHere's what's real: You have $1000 left after rent. That needs to cover food, transportation, utilities, everything. There's not much left to save.\n\nHere's the ONE thing to do: Instead of 'save 20%', let's aim for $50/month. That's realistic. Set up an automatic transfer of $50 to savings on payday. You won't even notice it.\n\nOnce you have a $500 emergency buffer, we can figure out how to increase it. But start with what's actually possible, not what some generic rule says.",
  },
  overwhelmed: {
    user: "I'm so overwhelmed. I have student loans, credit card debt, no savings, and I don't know where to start.",
    assistant:
      "I hear you. Let's break this down into one thing at a time. You don't need to figure everything out right now.\n\nHere's the ONE thing to do today: List all your debts. Just write them down - student loans, credit cards, everything. Don't worry about paying them yet. Just get them all in one place.\n\nThat's it. Just list them. Once we can see everything together, we'll figure out the next step. But for now, just list them. You've got this.",
  },
};

// ============================================================================
// PROMPT BUILDER (Main Function)
// ============================================================================

/**
 * Builds context-aware prompt based on user state and financial data
 * Returns: Complete system prompt string
 */
function buildContextAwarePrompt(message, context, financialData, userState) {
  const promptParts = [];

  // 1. Core role (always included)
  promptParts.push(PROMPT_MODULES.core());

  // 2. Personality module (selected based on emotional state)
  const personalityKey =
    userState.emotionalState !== "neutral"
      ? userState.emotionalState
      : "default";
  promptParts.push(
    PROMPT_MODULES.personality[personalityKey]?.() ||
      PROMPT_MODULES.personality.default()
  );

  // 3. Gen Z communication style (always included)
  promptParts.push(PROMPT_MODULES.genz_style());

  // 4. Response strategy modules (selected based on needs)
  userState.needs.forEach((need) => {
    const strategy = PROMPT_MODULES.response_strategy[need];
    if (strategy) {
      promptParts.push(strategy());
    }
  });

  // 5. Empathetic engagement (always included)
  promptParts.push(PROMPT_MODULES.empathetic());

  // 6. Response guidelines (modified based on state)
  promptParts.push(PROMPT_MODULES.response_guidelines(userState));

  // 7. User profile (if available)
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

  // 9. Few-shot example (if emotional state detected)
  if (
    userState.emotionalState !== "neutral" &&
    FEW_SHOT_EXAMPLES[userState.emotionalState]
  ) {
    const example = FEW_SHOT_EXAMPLES[userState.emotionalState];
    promptParts.push(
      `EXAMPLE CONVERSATION:\nUser: ${example.user}\nAssistant: ${example.assistant}`
    );
  }

  // 10. Financial context (will be added by caller)
  // This is handled separately in handleAsk function

  return promptParts.join("\n\n");
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  detectUserState,
  buildContextAwarePrompt,
  PROMPT_MODULES,
  FEW_SHOT_EXAMPLES,
};
