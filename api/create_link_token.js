import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const config = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

const client = new PlaidApi(config);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: "user-id" },
      client_name: "Financify",
      products: ["auth", "transactions"],
      country_codes: ["US"],
      language: "en",
      redirect_uri: "https://financify-rose.vercel.app/oauth-complete",
    });
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
