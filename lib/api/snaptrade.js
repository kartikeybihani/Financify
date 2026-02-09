// /lib/api/snaptrade.js
// Shared SnapTrade SDK initialization for all API routes
import { Snaptrade } from "snaptrade-typescript-sdk";
import { getEnvironment, isProduction, isSandbox } from "./env.js";

// Use centralized environment detection
const environment = getEnvironment();
const isSandboxEnv = isSandbox();

// Pick credentials based on environment
// TEMPORARY: Hardcoded test credentials for dev only (will be removed shortly)
const clientId = isSandboxEnv
  ? "FINANCIFY-TEST-NXIOI" // TEMPORARY - hardcoded for dev
  : process.env.SNAPTRADE_CLIENT_ID;

const consumerKey = isSandboxEnv
  ? "MouEkhF3nV1ySgM1HRr4CPi1TozUkqTZ3f91UN8P0hfEdyFXBp" // TEMPORARY - hardcoded for dev
  : process.env.SNAPTRADE_CONSUMER_KEY;

if (!clientId || !consumerKey) {
  const missingVars = [];
  if (!clientId) {
    missingVars.push(
      isSandboxEnv ? "SNAPTRADE_CLIENT_ID_DEV" : "SNAPTRADE_CLIENT_ID",
    );
  }
  if (!consumerKey) {
    missingVars.push(
      isSandboxEnv ? "SNAPTRADE_CONSUMER_KEY_DEV" : "SNAPTRADE_CONSUMER_KEY",
    );
  }
  throw new Error(
    `Missing SnapTrade configuration for ${environment} environment. Ensure ${missingVars.join(
      " and ",
    )} are set.`,
  );
}

// Create and export a single SnapTrade instance
export const snaptrade = new Snaptrade({
  clientId,
  consumerKey,
});

// Log environment on initialization (only in non-production to avoid log spam)
if (isSandboxEnv) {
  console.log(`🔧 SnapTrade initialized in ${environment} mode`);
}

// Export environment flag and credentials for direct API calls
export { isSandboxEnv as isSandbox, clientId, consumerKey };
