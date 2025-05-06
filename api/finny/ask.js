import { runFinnyAdvisor } from "../backend/ai/runFinnyAdvisor.js";
import fs from "fs";
import { join } from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { transactions, accounts, investments, liabilities, message, goals } =
      req.body;

    console.log("Transactions:", transactions);
    console.log("Message:", message);
    console.log("Accounts:", accounts);
    console.log("Investments:", investments);
    console.log("Liabilities:", liabilities);
    console.log("Goals:", goals);
    if (!transactions || !message) {
      return res.status(400).json({ error: "Missing required data bruhhh." });
    }

    const result = await runFinnyAdvisor({
      transactions,
      accounts,
      investments,
      liabilities,
      message,
      goals,
    });

    // Save interaction to disk for now (simulate memory layer)
    const logPath = join(process.cwd(), "finny-interactions.json");
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      context: result.context,
      nudges: result.nudges,
    };
    const logs = fs.existsSync(logPath)
      ? JSON.parse(fs.readFileSync(logPath))
      : [];
    logs.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    res.status(200).json({ nudges: result.nudges });
  } catch (error) {
    console.error("Error in /api/finny/ask:", error);
    res.status(500).json({ error: "Failed to get AI advice" });
  }
}
