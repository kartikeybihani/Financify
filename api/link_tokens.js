import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, access_token } = req.body;

  try {
    let response;

    if (mode === "update" && access_token) {
      // Update mode - for existing items
      response = await client.linkTokenCreate({
        user: { client_user_id: "user-id" },
        client_name: "Financify",
        country_codes: ["US"],
        language: "en",
        redirect_uri: "https://financify-redirect.com/oauth-complete",
        webhook: "https://financify-rose.vercel.app/api/webhook",
        access_token,
        account_selection_enabled: true,
      });

      res.status(200).json({ link_token: response.data.link_token });
    } else {
      // Create mode - for new items
      response = await client.linkTokenCreate({
        user: { client_user_id: "user-id" },
        client_name: "Financify",
        products: ["auth"],
        required_if_supported_products: [],
        optional_products: ["investments", "liabilities", "transactions"],
        additional_consented_products: [],
        country_codes: ["US"],
        language: "en",
        redirect_uri: "https://financify-redirect.com/oauth-complete",
        webhook: "https://financify-rose.vercel.app/api/webhook",
        // account_selection_enabled: true,
      });
      res.status(200).json(response.data);
    }
  } catch (error) {
    const plaidError = error.response?.data;
    console.error("Link Token Error:", plaidError);
    res.status(500).json({ error: plaidError?.error_message || error.message });
  }
}
