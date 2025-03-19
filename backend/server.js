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
      products: ["transactions", "auth", "identity"],
      country_codes: ["US"],
      language: "en",
      redirect_uri: "https://financify-redirect.com/oauth-complete",
      additional_consented_products: ["investments", "liabilities"], // Example: Adding credit_cards as an additional product
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

// Get accounts and balances
app.post("/api/accounts", async (req, res) => {
  const { access_token } = req.body;

  try {
    const accountsResponse = await plaidClient.accountsGet({
      access_token,
    });

    res.json({
      accounts: accountsResponse.data.accounts,
    });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    res.status(500).json({ error: error.message });
  }
});

// get institution
app.post("/api/institution", async (req, res) => {
  const { access_token } = req.body;

  try {
    const itemResponse = await plaidClient.itemGet({
      access_token,
    });

    const institutionId = itemResponse.data.item.institution_id;

    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"],
    });

    res.json({
      institution: institutionResponse.data.institution,
    });
  } catch (error) {
    console.error("Error fetching institution:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get identity information
app.post("/api/identity", async (req, res) => {
  const { access_token } = req.body;

  try {
    const identityResponse = await plaidClient.identityGet({
      access_token,
    });

    res.json({
      identity: identityResponse.data.accounts,
    });
  } catch (error) {
    console.error("Error fetching identity:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get investments
app.post("/api/investments", async (req, res) => {
  const { access_token } = req.body;

  try {
    const investmentsResponse = await plaidClient.investmentsHoldingsGet({
      access_token,
    });

    res.json({
      holdings: investmentsResponse.data.holdings,
      securities: investmentsResponse.data.securities,
      accounts: investmentsResponse.data.accounts,
    });
  } catch (error) {
    console.error("Error fetching investments:", error);
    res.status(500).json({ error: error.message });
  }
});

//   // Get liabilities
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
