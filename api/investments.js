import { client } from "./plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { access_token } = req.body;
    const holdingsResponse = await client.investmentsHoldingsGet({
      access_token,
    });

    const transactionsResponse = await client.investmentsTransactionsGet({
      access_token,
      start_date: "2020-01-01",
      end_date: new Date().toISOString().split("T")[0],
    });

    console.log(
      "Investment Transactions:",
      transactionsResponse.data.investment_transactions
    );

    res.status(200).json({
      holdings: holdingsResponse.data.holdings,
      securities: holdingsResponse.data.securities,
      investment_transactions:
        transactionsResponse.data.investment_transactions,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
