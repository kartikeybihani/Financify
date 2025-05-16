import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { access_token } = req.body;
    const identityResponse = await client.identityGet({ access_token });
    res.status(200).json({ identity: identityResponse.data.accounts });
  } catch (error) {
    const plaidError = error.response?.data;

    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({ requires_update_mode: true });
    }
    res.status(500).json({ error: error.message });
  }
}
