// /lib/api/env.js
// Centralized environment detection and configuration
// Uses Vercel's environment system for automatic environment detection
//
// NOTE: VERCEL_ENV must be enabled in Vercel Dashboard:
// Settings → Environment Variables → "Automatically expose System Environment Variables"
// If not enabled, falls back to explicit env vars or NODE_ENV

/**
 * Get the current environment
 * Priority:
 * 1. Explicit env var (PLAID_ENV, SNAPTRADE_ENVIRONMENT) - manual override
 * 2. Vercel environment (VERCEL_ENV) - automatic if enabled in Vercel settings
 * 3. Node environment (NODE_ENV) - fallback
 * 4. Default to sandbox for safety
 */
export function getEnvironment() {
  // Check for explicit environment override (for manual testing)
  const plaidEnv = process.env.PLAID_ENV;
  const snaptradeEnv = process.env.SNAPTRADE_ENVIRONMENT_DEV;

  // Vercel provides VERCEL_ENV: "production" | "preview" | "development"
  // NOTE: Must be enabled in Vercel Dashboard → Settings → Environment Variables
  const vercelEnv = process.env.VERCEL_ENV;

  // Node environment
  const nodeEnv = process.env.NODE_ENV;

  // Determine environment
  // Priority: explicit > vercel > node > default
  if (plaidEnv) {
    return plaidEnv === "production" ? "production" : "sandbox";
  }

  if (snaptradeEnv) {
    return snaptradeEnv === "production" ? "production" : "sandbox";
  }

  if (vercelEnv === "production") {
    return "production";
  }

  // Preview and development deployments use sandbox
  if (vercelEnv === "preview" || vercelEnv === "development") {
    return "sandbox";
  }

  // Node env fallback
  if (nodeEnv === "production") {
    return "production";
  }

  // Default to sandbox for safety
  return "sandbox";
}

/**
 * Check if we're in production environment
 */
export function isProduction() {
  return getEnvironment() === "production";
}

/**
 * Check if we're in sandbox/development environment
 */
export function isSandbox() {
  return getEnvironment() === "sandbox";
}

/**
 * Get environment name for logging
 */
export function getEnvironmentName() {
  const env = getEnvironment();
  const vercelEnv = process.env.VERCEL_ENV;
  const source = vercelEnv
    ? `Vercel:${vercelEnv}`
    : process.env.NODE_ENV || "unknown";
  return `${env} (${source})`;
}
