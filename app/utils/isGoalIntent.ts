export const isGoalIntent = async (input: string) => {
    const lower = input.toLowerCase();
  
    // Negative indicators (if these are present, it's likely not a goal setup)
    const negativeIndicators = [
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
    ];
  
    // Check for negative indicators first
    for (const phrase of negativeIndicators) {
      if (lower.includes(phrase)) return false;
    }
  
    // Core goal-setting phrases (stronger indicators)
    const goalSetters = [
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
    ];
  
    // Check for explicit goal-setting phrases
    for (const phrase of goalSetters) {
      if (lower.includes(phrase)) return true;
    }
  
    // Secondary phrases (weaker indicators, only count if no negative indicators)
    const secondaryPhrases = [
      "i want to get",
      "i wanna get",
      "plan for",
      "work towards",
      "i want to buy",
      "i wanna buy",
    ];
  
    // Only check secondary phrases if there's a clear savings/future context
    for (const phrase of secondaryPhrases) {
      if (lower.includes(phrase)) {
        // Look for savings/future context
        const hasSavingsContext = lower.includes("save") || 
                                 lower.includes("future") || 
                                 lower.includes("eventually") ||
                                 lower.includes("someday") ||
                                 lower.includes("one day");
        
        if (hasSavingsContext) return true;
      }
    }
  
    return false;
  };
  
export default isGoalIntent;
  