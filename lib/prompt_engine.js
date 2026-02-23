/**
 * Prompt engine - re-exports from lib/prompts.
 * @deprecated Import from "./prompts" or "./prompts/index.js" instead.
 */

export {
  detectUserState,
  buildContextAwarePrompt,
  buildContextAwarePromptDetailed,
  PROMPT_MODULES,
  synthesizeFinancialData,
  prioritizeMemories,
  resolveIntentStateConflict,
  selectStrategies,
  getClassificationPrompt,
  buildGoalAnalysisPrompt,
  buildOnboardingEarlyInsightsPrompt,
  buildAccountCompletenessPrompt,
  buildBudgetGenerationPrompt,
  buildCategoryMappingPrompt,
  buildRecurringAnalysisPrompt,
} from "./prompts/index.js";
