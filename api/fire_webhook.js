import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  const { access_token } = req.body;

  try {
    const response = await client.sandboxItemFireWebhook({
      access_token,
      webhook_type: "ITEM",
      webhook_code: "NEW_ACCOUNTS_AVAILABLE",
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error("❌ Error firing webhook:", error.response?.data || error);
    res.status(500).json({ error: error.message });
  }
}
