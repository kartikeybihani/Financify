import { runFinnyAdvisor } from "../backend/ai/runFinnyAdvisor.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: "Missing transactions array" });
    }

    const result = await runFinnyAdvisor(transactions);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in /api/finny/nudges:", error);
    res.status(500).json({ error: "Failed to generate nudges" });
  }
}
