import { client } from "./plaidClient.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { access_token } = req.body;
    const itemResponse = await client.itemGet({ access_token });
    const institutionId = itemResponse.data.item.institution_id;
    const institutionResponse = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"],
    });
    res.status(200).json({ institution: institutionResponse.data.institution });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
