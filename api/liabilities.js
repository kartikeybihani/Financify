import { client } from "../app/plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { access_token } = req.body;
    const liabilitiesResponse = await client.liabilitiesGet({
      access_token,
    });
    res.status(200).json({
      liabilities: liabilitiesResponse.data.liabilities,
      accounts: liabilitiesResponse.data.accounts,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
