// core/finny/utils/constants/modelConfig.js
// Extracted from api/finny.js lines 831-855
// Centralized OpenRouter model selection and configuration

// Centralized OpenRouter model selection for Finny's main responses.
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "meta-llama/llama-4-scout";

// Classification models - for intent detection and message classification
export const CLASSIFICATION_MODEL =
  process.env.CLASSIFICATION_MODEL_PAID || "openai/gpt-4.1-nano";
export const CLASSIFICATION_FALLBACK_MODEL = OPENROUTER_MODEL;

// Small free model for lightweight helper tasks.
export const LIGHTWEIGHT_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

// Standard Finny model and fallback chain.
export const STANDARD_MODEL = OPENROUTER_MODEL;

// Tertiary model for resilience
export const TERTIARY_MODEL = "mistralai/mistral-small-3.1-24b-instruct";

// Memory loading timeout
export const MEMORY_LOAD_TIMEOUT_MS = Math.max(
  Number(process.env.FINNY_MEMORY_TIMEOUT_MS || 5200),
  1000,
);

/**
 * Get the OpenRouter API key from environment
 * @returns {string} The API key
 */
export function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY;
}
