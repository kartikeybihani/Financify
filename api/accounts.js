import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { access_token } = req.body;
    const response = await client.accountsGet({ access_token });
    console.log("Accounts - " + JSON.stringify(response.data));
    res.status(200).json(response.data);
  } catch (error) {
    const plaidError = error.response?.data;
    console.log("Accounts - Plaid error:", plaidError);

    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({ requires_update_mode: true });
    }

    res.status(500).json({ error: plaidError?.error_message || error.message });
  }
}
