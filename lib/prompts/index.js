/**
 * Prompt engine - centralized exports for all prompt types.
 *
 * Structure:
 * - finny: Main chat prompts (6-layer architecture)
 * - classification: Intent/emotional-state detection
 * - goals: Goal analysis prompts
 * - onboarding: Early insights, account completeness
 * - budget: Budget generation, category mapping
 * - recurring: Recurring transaction analysis
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
} from "./finny/index.js";

export { getClassificationPrompt } from "./classification/index.js";
export { buildGoalAnalysisPrompt } from "./goals/index.js";
export {
  buildOnboardingEarlyInsightsPrompt,
  buildAccountCompletenessPrompt,
} from "./onboarding/index.js";
export {
  buildBudgetGenerationPrompt,
  buildCategoryMappingPrompt,
} from "./budget/index.js";
export { buildRecurringAnalysisPrompt } from "./recurring/index.js";
