// /lib/api/snaptrade.js
// Shared SnapTrade SDK initialization for all API routes
import { Snaptrade } from "snaptrade-typescript-sdk";

// Pick credentials based on environment
const isSandbox = process.env.SNAPTRADE_ENVIRONMENT === "sandbox";

const clientId = isSandbox
  ? process.env.SNAPTRADE_CLIENT_ID_DEV
  : process.env.SNAPTRADE_CLIENT_ID;

const consumerKey = isSandbox
  ? process.env.SNAPTRADE_CONSUMER_KEY_DEV
  : process.env.SNAPTRADE_CONSUMER_KEY;

if (!clientId || !consumerKey) {
  throw new Error(
    "Missing SnapTrade configuration. Ensure SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY are set."
  );
}

// Create and export a single SnapTrade instance
export const snaptrade = new Snaptrade({
  clientId,
  consumerKey,
});

// Export environment flag and credentials for direct API calls
export { isSandbox, clientId, consumerKey };
