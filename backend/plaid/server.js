// server.js
import { runFinnyAdvisor } from "../ai/runFinnyAdvisor.js";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, ".env") });
dotenv.config({ path: join(__dirname, ".env.local") });
// Also load from parent directory's .env files
dotenv.config({ path: join(__dirname, "..", ".env") });
dotenv.config({ path: join(__dirname, "..", ".env.local") });
// Also load from ai directory's .env files
dotenv.config({ path: join(__dirname, "..", "ai", ".env") });
dotenv.config({ path: join(__dirname, "..", "ai", ".env.local") });

const app = express();
const PORT = 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configure Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": "6726f1c5869739001904fb8b",
      "PLAID-SECRET": "0608c4b8a83d6f7a8cc4430cb98377",
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Create a link token
app.post("/api/create_link_token", async (req, res) => {
  try {
    const tokenResponse = await plaidClient.linkTokenCreate({
      user: { client_user_id: "user-id" },
      client_name: "Finance App",
      products: ["auth", "identity", "investments", "transactions"],
      country_codes: ["US"],
      language: "en",
      redirect_uri: "https://financify-redirect.com/oauth-complete",
      additional_consented_products: ["liabilities"],
    });
    res.json(tokenResponse.data);
  } catch (error) {
    console.error("Error creating link token:", error);
    res.status(500).json({ error: error.message });
  }
});

// Exchange public token for access token
app.post("/api/exchange_public_token", async (req, res) => {
  const { public_token } = req.body;

  try {
    const tokenResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = tokenResponse.data.access_token;
    const itemId = tokenResponse.data.item_id;

    console.log("Access Token:", accessToken);
    console.log("Item ID:", itemId);

    res.json({
      access_token: accessToken,
      item_id: itemId,
      success: true,
    });
  } catch (error) {
    console.error("Error exchanging public token:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get bank account balances
app.post("/api/accounts/balance", async (req, res) => {
  const { access_token } = req.body;
  try {
    const response = await plaidClient.accountsBalanceGet({ access_token });
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get accounts
app.post("/api/accounts", async (req, res) => {
  const { access_token } = req.body;
  try {
    const accountsResponse = await plaidClient.accountsGet({ access_token });
    res.json({ accounts: accountsResponse.data.accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get institution info
app.post("/api/institution", async (req, res) => {
  const { access_token } = req.body;
  try {
    const itemResponse = await plaidClient.itemGet({ access_token });
    const institutionId = itemResponse.data.item.institution_id;
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"],
    });
    res.json({ institution: institutionResponse.data.institution });
  } catch (error) {
    console.error("Error fetching institution:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get identity info
app.post("/api/identity", async (req, res) => {
  const { access_token } = req.body;
  try {
    const identityResponse = await plaidClient.identityGet({ access_token });
    res.json({ identity: identityResponse.data.accounts });
  } catch (error) {
    console.error("Error fetching identity:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get investments holdings + transactions
app.post("/api/investments", async (req, res) => {
  const { access_token } = req.body;
  try {
    const holdingsResponse = await plaidClient.investmentsHoldingsGet({
      access_token,
    });
    const transactionsResponse = await plaidClient.investmentsTransactionsGet({
      access_token,
      start_date: "2020-01-01",
      end_date: new Date().toISOString().split("T")[0],
    });

    // console.log("Investments (from /api/investments):", holdingsResponse.data);
    // console.log("Investment Transactions:", transactionsResponse.data);

    res.json({
      holdings: holdingsResponse.data.holdings,
      securities: holdingsResponse.data.securities,
      investment_transactions:
        transactionsResponse.data.investment_transactions,
    });
  } catch (error) {
    console.error("Error fetching investments:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get liabilities
app.post("/api/liabilities", async (req, res) => {
  const { access_token } = req.body;
  try {
    const liabilitiesResponse = await plaidClient.liabilitiesGet({
      access_token,
    });
    res.json({
      liabilities: liabilitiesResponse.data.liabilities,
      accounts: liabilitiesResponse.data.accounts,
    });
  } catch (error) {
    console.error("Error fetching liabilities:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get transactions
app.post("/api/transactions", async (req, res) => {
  const { access_token } = req.body;
  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);

    const formattedStart = startDate.toISOString().split("T")[0];
    const formattedEnd = now.toISOString().split("T")[0];

    const transactionsResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: formattedStart,
      end_date: formattedEnd,
    });

    // console.log("Transactions:", transactionsResponse.data.transactions);
    console.log("Transactions loaded...");
    res.json({ transactions: transactionsResponse.data.transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get transactions with category
app.post("/api/finny/nudges", async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: "Missing transactions array" });
    }

    const result = await runFinnyAdvisor(transactions);
    res.json(result);
  } catch (error) {
    console.error("Error in /api/finny/nudges:", error);
    res.status(500).json({ error: "Failed to generate nudges" });
  }
});

// --- NEW ROUTE --- //
app.post("/api/finny/ask", async (req, res) => {
  try {
    const { transactions, accounts, investments, liabilities, message, goals } =
      req.body;

    if (!transactions || !message) {
      return res.status(400).json({ error: "Missing required data bro." });
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
    const logPath = join(__dirname, "finny-interactions.json");
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

    res.json({ nudges: result.nudges });
  } catch (error) {
    console.error("Error in /api/finny/ask:", error);
    res.status(500).json({ error: "Failed to get AI advice" });
  }
});

// server.js (or add this to routes section)
app.post("/api/finny/goal-intent", async (req, res) => {
  const { message } = req.body;
  console.log("Received goal intent message:", message);

  const systemPrompt = `
You are a helpful financial assistant. Extract the financial goal from the following user message.
Return a JSON object like this: 
{ 
  "label": string, 
  "target": number|null, 
  "timeline": { 
    "month": string|null,
    "year": number|null 
  }|null 
}

- "label" is what the goal is for, like "Vacation", "Laptop", or "Emergency Fund"
- "target" is the amount of money to be saved (in USD), or null if not specified
- "timeline" is an object with month and year, or null if not stated. Examples:
  - For "next fall": { "month": "September", "year": 2024 }
  - For "in 6 months": calculate the future date
  - For "2025": { "month": "January", "year": 2025 }
  - For "December": { "month": "December", "year": 2024 }
  - For no timeline: null

Handle relative time expressions like:
- "next summer/fall/winter/spring"
- "in X months/years"
- "by end of year"
- "next year"
- "in a couple months"

For seasonal references, use these months:
- Spring = March
- Summer = June
- Fall/Autumn = September
- Winter = December

For relative dates:
- "next month" = add 1 month to current date
- "in X months" = add X months to current date
- "next year" = add 1 year to current date
- "in a couple months" = add 2 months to current date
- "in a few months" = add 3 months to current date

Current date: ${new Date().toISOString()}

If you're not sure about a value, return null.

IMPORTANT: Always return a valid timeline object with month and year if any date information is provided in the message. For example:
- If user says "this fall", return { "month": "September", "year": 2024 }
- If user says "next spring", return { "month": "March", "year": 2025 }
- If user says "jan 2026", return { "month": "January", "year": 2026 }
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    }),
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  console.log("GPT response:", text);

  try {
    const parsed = JSON.parse(text);
    console.log("Parsed response:", parsed);

    // If we have a year but no month, default to January
    if (parsed.timeline?.year && !parsed.timeline?.month) {
      parsed.timeline.month = "January";
    }

    // If we have a month but no year, use next occurrence of that month
    if (parsed.timeline?.month && !parsed.timeline?.year) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth(); // 0-11
      const targetMonth = new Date(`${parsed.timeline.month} 1`).getMonth();
      parsed.timeline.year =
        currentMonth >= targetMonth ? currentYear + 1 : currentYear;
    }

    // Ensure we return a properly structured response
    const response = {
      label: parsed.label,
      target: parsed.target,
      timeline: parsed.timeline
        ? {
            month: parsed.timeline.month || "January",
            year: parsed.timeline.year || new Date().getFullYear(),
          }
        : null,
    };

    console.log("Final response:", response);
    return res.json(response);
  } catch (e) {
    console.error("Error parsing goal intent:", e);
    return res.json({ label: null, target: null, timeline: null });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
