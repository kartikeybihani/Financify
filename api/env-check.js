// Simple endpoint to check which environment is being used
// Useful for testing environment configuration

import { getEnvironment, getEnvironmentName } from "../lib/api/env.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const environment = getEnvironment();
  const environmentName = getEnvironmentName();
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  
  // Check which credentials are being used (without exposing secrets)
  const hasPlaidProd = !!process.env.PLAID_SECRET_PROD;
  const hasPlaidDev = !!process.env.PLAID_SECRET_DEV;
  const hasSnaptradeProd = !!process.env.SNAPTRADE_CLIENT_ID;
  const hasSnaptradeDev = !!process.env.SNAPTRADE_CLIENT_ID_DEV;

  return res.status(200).json({
    environment,
    environmentName,
    detected: {
      vercelEnv: vercelEnv || "not set",
      nodeEnv: nodeEnv || "not set",
      explicitPlaidEnv: process.env.PLAID_ENV || "not set",
      explicitSnaptradeEnv: process.env.SNAPTRADE_ENVIRONMENT || "not set",
    },
    credentials: {
      plaid: {
        hasProduction: hasPlaidProd,
        hasSandbox: hasPlaidDev,
        clientId: !!process.env.PLAID_CLIENT_ID,
      },
      snaptrade: {
        hasProduction: hasSnaptradeProd,
        hasSandbox: hasSnaptradeDev,
      },
    },
    message: `Currently using ${environment} environment`,
  });
}
