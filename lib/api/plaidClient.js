import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { getEnvironment, isProduction } from "./env.js";

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET_DEV = process.env.PLAID_SECRET_DEV; // Sandbox secret
const PLAID_SECRET_PROD = process.env.PLAID_SECRET_PROD; // Production secret

// Use centralized environment detection
const environment = getEnvironment();
const isProd = isProduction();

// Validate required credentials
if (!PLAID_CLIENT_ID) {
  throw new Error("Missing PLAID_CLIENT_ID environment variable");
}

if (isProd && !PLAID_SECRET_PROD) {
  throw new Error(
    "Missing PLAID_SECRET_PROD environment variable for production environment"
  );
}

if (!isProd && !PLAID_SECRET_DEV) {
  throw new Error(
    "Missing PLAID_SECRET_DEV environment variable for sandbox environment"
  );
}

const config = new Configuration({
  basePath: isProd
    ? PlaidEnvironments.production
    : PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": isProd ? PLAID_SECRET_PROD : PLAID_SECRET_DEV,
    },
  },
});

// Log environment on initialization (only in non-production to avoid log spam)
if (!isProd) {
  console.log(`🔧 Plaid initialized in ${environment} mode`);
}

export const client = new PlaidApi(config);
export default client;
