// core/finny/infrastructure/llm/LLMService.js
// LLM service with model fallback and timeout handling
// Extracted from api/finny.js lines 749-784

import { withTimeout } from '../../utils/timeout.js';
import { logWarn } from '../../utils/logging.js';

/**
 * LLMService handles calls to LLM providers with automatic fallback and timeout
 */
export class LLMService {
  /**
   * Call an LLM with fallback to alternative models on failure
   * 
   * @param {string[]} models - Array of model names to try in order
   * @param {Function} callFn - Function that makes the actual API call. 
   *                            Signature: (model, options) => Promise<response>
   * @param {number} timeoutMs - Timeout in milliseconds for each model attempt
   * @param {string} label - Label for logging (e.g., "LLM", "Classification")
   * @returns {Promise<{result: any, model: string}>} The result and which model succeeded
   * @throws {Error} If all models fail, throws error with modelsTried property
   */
  async callWithFallback(models, callFn, timeoutMs, label = "LLM") {
    let lastErr = null;
    const tried = [];

    for (const model of models) {
      if (!model) continue;
      tried.push(model);
      
      try {
        const controller = new AbortController();
        const callPromise = Promise.resolve()
          .then(() => callFn(model, { signal: controller.signal }))
          .catch((err) => {
            if (controller.signal.aborted || err?.name === "AbortError") {
              return { __aborted: true };
            }
            throw err;
          });
          
        const result = await withTimeout(
          callPromise,
          timeoutMs,
          { __timeout: true },
          () => controller.abort(),
        );
        
        if (result && (result.__timeout || result.__aborted)) {
          throw new Error(`${label} timeout after ${timeoutMs}ms`);
        }
        
        return { result, model };
      } catch (err) {
        lastErr = err;
        logWarn(`⚠️ [FINNY] ${label} failed for model ${model}:`, err?.message);
      }
    }

    const error = lastErr || new Error(`${label} failed for all models`);
    error.modelsTried = tried;
    throw error;
  }
}
