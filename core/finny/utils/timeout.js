// core/finny/utils/timeout.js
// Extracted from api/finny.js lines 79-103
// Utility for racing a promise against a timeout

/**
 * Races a promise against a timeout
 * @param {Promise} promise - The promise to race
 * @param {number} ms - Timeout in milliseconds
 * @param {*} onTimeoutValue - Value to return if timeout occurs (default: null)
 * @param {Function} onTimeout - Optional callback to execute on timeout
 * @returns {Promise} The result of the promise or onTimeoutValue if timeout
 */
export async function withTimeout(
  promise,
  ms,
  onTimeoutValue = null,
  onTimeout = null,
) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      if (typeof onTimeout === "function") {
        try {
          onTimeout();
        } catch {
          // Ignore timeout handler errors.
        }
      }
      resolve(onTimeoutValue);
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}
