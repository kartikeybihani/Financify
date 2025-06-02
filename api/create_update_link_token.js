// /api/create_update_link_token.js
import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { access_token } = req.body;

  try {
    const response = await client.linkTokenCreate({
      user: { client_user_id: "user-id" },
      client_name: "Financify",
      country_codes: ["US"],
      language: "en",
      redirect_uri: "https://financify-rose.vercel.app/oauth-complete",
      webhook: "https://financify-rose.vercel.app/api/webhook",
      access_token,
      account_selection_enabled: true,
    });

    res.status(200).json({ link_token: response.data.link_token });
  } catch (error) {
    const plaidError = error.response?.data;
    console.error("Update Mode Token Error:", plaidError);
    res.status(500).json({ error: plaidError?.error_message || error.message });
  }
}
