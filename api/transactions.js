import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { access_token } = req.body;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);

    const formattedStart = startDate.toISOString().split("T")[0];
    const formattedEnd = now.toISOString().split("T")[0];

    const transactionsResponse = await client.transactionsGet({
      access_token,
      start_date: formattedStart,
      end_date: formattedEnd,
    });

    res
      .status(200)
      .json({ transactions: transactionsResponse.data.transactions });
  } catch (error) {
    const plaidError = error.response?.data;

    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({ requires_update_mode: true });
    }

    res.status(500).json({ error: error.message });
  }
}
