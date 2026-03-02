// core/finny/utils/constants/modelConfig.js
// Extracted from api/finny.js lines 831-855
// Centralized OpenRouter model selection and configuration

// Centralized OpenRouter model selection. Prefer paid model if provided.
// Default to a widely available Grok model to avoid invalid ID errors.
export const OPENROUTER_PAID_MODEL = process.env.OPENROUTER_PAID_MODEL;
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "meta-llama/llama-4-scout";
export const PRIMARY_OPENROUTER_MODEL =
  OPENROUTER_PAID_MODEL || OPENROUTER_MODEL;

// Classification models - for intent detection and message classification
// openai/gpt-oss-20b (paid) and meta-llama/llama-4-scout
export const CLASSIFICATION_MODEL_PAID =
  process.env.CLASSIFICATION_MODEL_PAID ||
  OPENROUTER_PAID_MODEL ||
  "openai/gpt-oss-20b";
export const CLASSIFICATION_MODEL_FREE =
  process.env.CLASSIFICATION_MODEL_FREE ||
  OPENROUTER_MODEL ||
  "meta-llama/llama-4-scout";

// Reasoning model for ask_personalized queries
// meta-llama/llama-4-scout
export const REASONING_MODEL_PAID_SCOUT =
  process.env.REASONING_MODEL_PAID_SCOUT || "meta-llama/llama-4-scout";

// Memory extraction model - small, fast, free
export const SMALLER_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

// Standard non-free model to fallback to when the free model fails
export const STANDARD_MODEL = "meta-llama/llama-3.2-3b-instruct";

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
