export const isGoalIntent = async (input: string) => {
    const lower = input.toLowerCase();
    let confidence = 0;
  
    // Strong negative indicators (immediate rejection)
    const strongNegativeIndicators = [
      "should i",
      "can i",
      "could i",
      "what if",
      "is it possible",
      "check",
      "afford",
      "possible",
      "worth it",
      "good idea",
      "smart to",
      "advice",
      "recommend",
      "suggestion",
      "worth",
      "expensive",
      "cost",
      "price",
      "budget",
      "affordable",
    ];
  
    // Check for strong negative indicators first
    for (const phrase of strongNegativeIndicators) {
      if (lower.includes(phrase)) {
        // Check if it's a genuine question about feasibility
        if (lower.includes("?") || lower.includes("but")) {
          return { isGoal: false, confidence: 0.9 };
        }
      }
    }
  
    // Strong goal-setting indicators
    const strongGoalSetters = [
      "start saving for",
      "save up for",
      "saving towards",
      "set a goal for",
      "create a fund for",
      "let's set a goal",
      "set our dream",
      "make a goal",
      "help me save",
      "want to save",
      "need to save",
      "set up a goal",
      "set up a fund",
    ];
  
    // Check for strong goal-setting phrases
    for (const phrase of strongGoalSetters) {
      if (lower.includes(phrase)) {
        confidence += 0.8;
      }
    }
  
    // Moderate goal indicators
    const moderateGoalSetters = [
      "i want to get",
      "i wanna get",
      "plan for",
      "work towards",
      "i want to buy",
      "i wanna buy",
      "save for",
      "saving for",
      "goal to",
      "target to",
    ];
  
    for (const phrase of moderateGoalSetters) {
      if (lower.includes(phrase)) {
        confidence += 0.5;
      }
    }
  
    // Future-oriented context
    const futureContext = [
      "future",
      "eventually",
      "someday",
      "one day",
      "later",
      "next",
      "coming",
      "upcoming",
    ];
  
    let hasFutureContext = false;
    for (const phrase of futureContext) {
      if (lower.includes(phrase)) {
        hasFutureContext = true;
        confidence += 0.3;
        break;
      }
    }
  
    // Financial context
    const financialContext = [
      "save",
      "money",
      "fund",
      "budget",
      "cost",
      "price",
      "amount",
      "dollars",
      "$",
    ];
  
    let hasFinancialContext = false;
    for (const phrase of financialContext) {
      if (lower.includes(phrase)) {
        hasFinancialContext = true;
        confidence += 0.2;
        break;
      }
    }
  
    // Decision-making indicators (reduce confidence)
    const decisionIndicators = [
      "but",
      "however",
      "though",
      "although",
      "if",
      "maybe",
      "perhaps",
      "possibly",
      "considering",
      "thinking about",
    ];
  
    for (const phrase of decisionIndicators) {
      if (lower.includes(phrase)) {
        confidence *= 0.7;
      }
    }
  
    // Normalize confidence to 0-1 range
    confidence = Math.min(Math.max(confidence, 0), 1);
  
    return {
      isGoal: confidence >= 0.6,
      confidence,
      context: {
        hasFutureContext,
        hasFinancialContext,
      },
    };
  };
  
export default isGoalIntent;
  