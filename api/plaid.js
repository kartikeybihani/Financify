// /api/plaid.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL, // server-side env var with fallback
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY // server-side env var with fallback
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { endpoint, item_id, user_id, mode, ...otherParams } = req.body;

  // Handle SnapTrade modes (don't require item_id)
  if (mode && mode.startsWith("snaptrade_")) {
    return handleSnapTradeRequest(req, res, mode, otherParams);
  }

  if (!endpoint || !item_id) {
    return res.status(400).json({
      error: "Missing required parameters: endpoint and item_id",
    });
  }

  try {
    // 1. Look up user_id if not provided
    let actualUserId = user_id;
    if (!actualUserId) {
      const { data: item, error: userErr } = await supabase
        .from("user_items")
        .select("user_id")
        .eq("item_id", item_id)
        .single();

      if (userErr || !item) {
        return res.status(404).json({ error: "Item not found" });
      }
      actualUserId = item.user_id;
    }

    // 2. Get access_token from Vault
    const { data: access_token, error: tokenError } = await supabase.rpc(
      "secure_get_plaid_token",
      { p_item_id: item_id, p_user_id: actualUserId }
    );

    if (tokenError || !access_token) {
      console.error("Error retrieving Plaid token from Vault:", tokenError);
      return res.status(404).json({ error: "Access token not found" });
    }

    let response;

    switch (endpoint) {
      case "accounts":
        response = await client.accountsGet({ access_token });
        console.log("Accounts - " + JSON.stringify(response.data));
        break;

      case "transactions_sync":
        // Get cursor for this item
        const { data: itemData, error: cursorErr } = await supabase
          .from("user_items")
          .select("transactions_cursor")
          .eq("item_id", item_id)
          .single();

        if (cursorErr) throw new Error("Failed to get cursor");

        let cursor = itemData.transactions_cursor || null;
        let added = [],
          modified = [],
          removed = [];
        let hasMore = true;

        // Pull all pages
        while (hasMore) {
          const syncResponse = await client.transactionsSync({
            access_token,
            cursor,
            count: 500,
          });

          added.push(...syncResponse.data.added);
          modified.push(...syncResponse.data.modified);
          removed.push(...syncResponse.data.removed);

          hasMore = syncResponse.data.has_more;
          cursor = syncResponse.data.next_cursor;
        }

        // Save the new cursor
        await supabase
          .from("user_items")
          .update({ transactions_cursor: cursor })
          .eq("item_id", item_id);

        response = { data: { added, modified, removed } };
        break;

      case "investments":
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

        response = {
          data: {
            holdings: holdingsResponse.data.holdings,
            securities: holdingsResponse.data.securities,
            investment_transactions:
              transactionsResponse.data.investment_transactions,
          },
        };
        break;

      case "liabilities":
        response = await client.liabilitiesGet({ access_token });
        response.data = {
          liabilities: response.data.liabilities,
          accounts: response.data.accounts,
        };
        break;

      case "identity":
        response = await client.identityGet({ access_token });
        response.data = { identity: response.data.accounts };
        break;

      case "institution":
        const itemResponse = await client.itemGet({ access_token });
        const institutionId = itemResponse.data.item.institution_id;
        response = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: ["US"],
        });
        response.data = { institution: response.data.institution };
        break;

      default:
        return res.status(400).json({ error: "Invalid endpoint" });
    }

    res.status(200).json(response.data);
  } catch (error) {
    console.error(`${endpoint} error:`, error);
    const plaidError = error.response?.data;
    console.log(`${endpoint} - Plaid error:`, plaidError);

    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({ requires_update_mode: true });
    }

    res.status(500).json({ error: plaidError?.error_message || error.message });
  }
}

// SnapTrade handler function
async function handleSnapTradeRequest(req, res, mode, params) {
  try {
    const { userId, userSecret, accountId } = params;

    switch (mode) {
      case "snaptrade_register":
        return await handleSnapTradeRegister(res);

      case "snaptrade_accounts":
        if (!userId || !userSecret) {
          return res
            .status(400)
            .json({ error: "Missing userId or userSecret" });
        }
        return await handleSnapTradeAccounts(res, userId, userSecret);

      case "snaptrade_holdings":
        if (!userId || !userSecret || !accountId) {
          return res
            .status(400)
            .json({ error: "Missing userId, userSecret, or accountId" });
        }
        return await handleSnapTradeHoldings(
          res,
          userId,
          userSecret,
          accountId
        );

      case "snaptrade_options":
        if (!userId || !userSecret || !accountId) {
          return res
            .status(400)
            .json({ error: "Missing userId, userSecret, or accountId" });
        }
        return await handleSnapTradeOptions(res, userId, userSecret, accountId);

      case "snaptrade_balances":
        if (!userId || !userSecret || !accountId) {
          return res
            .status(400)
            .json({ error: "Missing userId, userSecret, or accountId" });
        }
        return await handleSnapTradeBalances(
          res,
          userId,
          userSecret,
          accountId
        );

      case "snaptrade_store_credentials":
        if (!userId || !userSecret || !accountId) {
          return res.status(400).json({ error: "Missing required parameters" });
        }
        return await handleSnapTradeStoreCredentials(res, params);

      case "snaptrade_sync":
        if (!userId || !accountId) {
          return res.status(400).json({ error: "Missing userId or accountId" });
        }
        return await handleSnapTradeSync(res, userId, accountId);

      default:
        return res.status(400).json({ error: "Invalid SnapTrade mode" });
    }
  } catch (error) {
    console.error(`SnapTrade ${mode} error:`, error);
    return res.status(500).json({ error: error.message });
  }
}

// SnapTrade API helper functions
async function callSnapTradeAPI(endpoint, params) {
  const SNAPTRADE_BASE_URL = "https://api.snaptrade.com/api/v1";
  const SNAPTRADE_CLIENT_ID = process.env.SNAPTRADE_CLIENT_ID;
  const SNAPTRADE_CONSUMER_KEY = process.env.SNAPTRADE_CONSUMER_KEY;

  const url = new URL(`${SNAPTRADE_BASE_URL}${endpoint}`);

  // Add query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value.toString());
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      clientId: SNAPTRADE_CLIENT_ID,
      consumerKey: SNAPTRADE_CONSUMER_KEY,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`SnapTrade API error: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}

// SnapTrade mode handlers
async function handleSnapTradeRegister(res) {
  // This would typically call your Supabase function to register a new user
  // For now, return a placeholder response
  return res.status(200).json({
    message:
      "SnapTrade registration endpoint - implement with your registration logic",
  });
}

async function handleSnapTradeAccounts(res, userId, userSecret) {
  try {
    const accounts = await callSnapTradeAPI("/accounts", {
      userId,
      userSecret,
    });

    return res.status(200).json({ accounts });
  } catch (error) {
    throw error;
  }
}

async function handleSnapTradeHoldings(res, userId, userSecret, accountId) {
  try {
    const holdings = await callSnapTradeAPI(
      `/accounts/${accountId}/positions`,
      {
        userId,
        userSecret,
      }
    );

    return res.status(200).json({ holdings });
  } catch (error) {
    throw error;
  }
}

async function handleSnapTradeOptions(res, userId, userSecret, accountId) {
  try {
    const options = await callSnapTradeAPI(`/accounts/${accountId}/options`, {
      userId,
      userSecret,
    });

    return res.status(200).json({ options });
  } catch (error) {
    throw error;
  }
}

async function handleSnapTradeBalances(res, userId, userSecret, accountId) {
  try {
    const balances = await callSnapTradeAPI(`/accounts/${accountId}/balances`, {
      userId,
      userSecret,
    });

    return res.status(200).json({ balances });
  } catch (error) {
    throw error;
  }
}

async function handleSnapTradeStoreCredentials(res, params) {
  try {
    const { userId, snaptradeUserId, accountId, userSecret, ...metadata } =
      params;

    // Call your Supabase function to store credentials
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/store-snaptrade-credentials`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          snaptrade_user_id: snaptradeUserId,
          account_id: accountId,
          user_secret: userSecret,
          ...metadata,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to store credentials");
    }

    return res.status(200).json(data);
  } catch (error) {
    throw error;
  }
}

async function handleSnapTradeSync(res, userId, accountId) {
  try {
    // Call your Supabase function to sync investments
    const response = await fetch(
      `${process.env.SUPABASE_URL}/functions/v1/sync-investments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          snaptrade_user_id: userId, // Assuming same as user_id for now
          account_id: accountId,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to sync investments");
    }

    return res.status(200).json(data);
  } catch (error) {
    throw error;
  }
}
