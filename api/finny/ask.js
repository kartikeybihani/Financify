// api/finny/ask.js

import { runFinnyAdvisor } from "../../backend/ai/runFinnyAdvisor.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      transactions = [],
      accounts = [],
      investments = [],
      liabilities = [],
      message,
      goals = [],
    } = req.body;

    if (!message || !Array.isArray(transactions)) {
      return res.status(400).json({ error: "Missing required data." });
    }

    const result = await runFinnyAdvisor({
      transactions,
      accounts,
      investments,
      liabilities,
      message,
      goals,
    });

    res.status(200).json({ nudges: result.nudges });
  } catch (error) {
    console.error("Error in /api/finny/ask:", error);
    res.status(500).json({ error: "Failed to get AI advice" });
  }
}
