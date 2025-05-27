import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: "user-id" },
      client_name: "Financify",
      products: [
        "auth",
        "identity",
        "investments",
        "transactions",
        "liabilities",
      ],
      country_codes: ["US"],
      language: "en",
      redirect_uri: "https://financify-rose.vercel.app/oauth-complete",
      webhook: "https://financify-rose.vercel.app/api/webhook",
      // account_selection_enabled: true,
    });
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
