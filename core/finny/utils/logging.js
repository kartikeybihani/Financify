// core/finny/utils/logging.js
// Extracted from api/finny.js lines 48-68
// Simple log level mechanism for controlling verbosity

const LOG_LEVEL =
  process.env.LOG_LEVEL || process.env.NODE_ENV === "production"
    ? "info"
    : "debug";

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const CURRENT_LOG_LEVEL =
  LOG_LEVELS[LOG_LEVEL] !== undefined ? LOG_LEVELS[LOG_LEVEL] : LOG_LEVELS.info;

export function logDebug(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.debug) console.log(...args);
}

export function logInfo(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.info) console.log(...args);
}

export function logWarn(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.warn) console.warn(...args);
}

export function logError(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.error) console.error(...args);
}

// For backward compatibility, export the constants as well
export { LOG_LEVEL, LOG_LEVELS, CURRENT_LOG_LEVEL };
