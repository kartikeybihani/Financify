export const isGoalIntent = async (input: string) => {
    const lower = input.toLowerCase();
  
    // Core phrases
    const triggers = [
      "start saving for",
      "save up for",
      "i want to get",
      "i wanna get",
      "plan for",
      "set a goal for",
      "create a fund for",
      "let's set a goal",
      "set our dream",
      "work towards",
      "i want to buy",
    ];
  
    for (const phrase of triggers) {
      if (lower.includes(phrase)) return true;
    }

    console.log("No core phrases matched, checking for fuzzy match...");
  
    // Basic fuzzy fallback (save/buy + object)
    const fuzzyMatch = lower.match(/(save|buy|get|afford)\s+(a|the)?\s?[a-z]+/);
    return fuzzyMatch !== null;
  };
  
export default isGoalIntent;
  