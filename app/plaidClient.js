import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const config = new Configuration({
  // basePath: PlaidEnvironments.sandbox,
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET_PROD,
    },
  },
});

export const client = new PlaidApi(config);
