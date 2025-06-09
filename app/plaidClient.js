import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_SECRET_PROD = process.env.PLAID_SECRET_PROD;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

const config = new Configuration({
  basePath:
    PLAID_ENV === "production"
      ? PlaidEnvironments.production
      : PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET":
        PLAID_ENV === "production" ? PLAID_SECRET_PROD : PLAID_SECRET,
    },
  },
});

export const client = new PlaidApi(config);
export default client;
