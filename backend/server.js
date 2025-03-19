// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");

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
      "PLAID-CLIENT-ID": "client_id",
      "PLAID-SECRET": "secret_id",
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
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
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

    // In a real app, you would store these tokens securely
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

// Get transactions
app.post("/api/transactions", async (req, res) => {
  const { access_token } = req.body;

  try {
    // Get current date and 30 days ago
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);

    const formattedStartDate = startDate.toISOString().split("T")[0];
    const formattedEndDate = now.toISOString().split("T")[0];

    const transactionsResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: formattedStartDate,
      end_date: formattedEndDate,
    });

    const transactions = transactionsResponse.data.transactions;
    console.log("Transactions:", transactions);

    res.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// To run this server:
// 1. Save this file as server.js
// 2. Run: npm init -y
// 3. Run: npm install express cors body-parser plaid
// 4. Set environment variables:
//    - export PLAID_CLIENT_ID='your_client_id'
//    - export PLAID_SECRET='your_secret'
// 5. Run: node server.js
