// /api/plaid.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";
import { Snaptrade } from "snaptrade-typescript-sdk";

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

  // Fail fast if credentials are not configured
  if (!SNAPTRADE_CLIENT_ID || !SNAPTRADE_CONSUMER_KEY) {
    throw new Error(
      "SnapTrade credentials missing: ensure SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY are set"
    );
  }

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
      Accept: "application/json",
      "Content-Type": "application/json",
      // Header names must match SnapTrade expectations
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

// Helper function to recalculate portfolio metrics from database holdings
async function recalculatePortfolioMetricsFromDatabase(
  userId,
  snaptradeUserId,
  accountId
) {
  try {
    console.log("🔄 Recalculating portfolio metrics from database holdings...");

    // Get all active holdings for this account from the database
    const { data: holdings, error: holdingsError } = await supabase
      .from("investment_holdings")
      .select("*")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_active", true);

    if (holdingsError) {
      console.error(
        "❌ Error fetching holdings for recalculation:",
        holdingsError
      );
      return;
    }

    if (!holdings || holdings.length === 0) {
      console.log("ℹ️ No holdings found for recalculation");
      return;
    }

    // Calculate totals from database holdings
    let totalValue = 0;
    let totalDayChange = 0;
    let totalUnrealizedPL = 0;

    holdings.forEach((holding) => {
      const marketValue = holding.market_value || 0;
      const dayChange = holding.day_change || 0;
      const unrealizedPL = holding.unrealized_pl || 0;

      totalValue += marketValue;
      totalDayChange += dayChange;
      totalUnrealizedPL += unrealizedPL;
    });

    // Get cash balance from investment_balances
    const { data: balanceData, error: balanceError } = await supabase
      .from("investment_balances")
      .select("cash")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_current", true)
      .single();

    const cashAmount = balanceData?.cash || 0;
    const totalPortfolioValue = totalValue + cashAmount;

    // Calculate percentages
    const dayChangePercent =
      totalPortfolioValue > 0
        ? (totalDayChange / totalPortfolioValue) * 100
        : 0;
    const totalChangePercent =
      totalPortfolioValue > 0
        ? (totalUnrealizedPL / totalPortfolioValue) * 100
        : 0;

    console.log("📊 Database-calculated portfolio metrics:", {
      holdingsCount: holdings.length,
      totalValue: totalValue.toFixed(2),
      cashAmount: cashAmount.toFixed(2),
      totalPortfolioValue: totalPortfolioValue.toFixed(2),
      totalDayChange: totalDayChange.toFixed(2),
      dayChangePercent: dayChangePercent.toFixed(2),
      totalUnrealizedPL: totalUnrealizedPL.toFixed(2),
      totalChangePercent: totalChangePercent.toFixed(2),
    });

    // Update investment_balances with recalculated totals but preserve previously computed day_change metrics
    const { error: updateError } = await supabase
      .from("investment_balances")
      .update({
        total_value: totalPortfolioValue,
        total_change: totalUnrealizedPL,
        total_change_percent: totalChangePercent,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_current", true);

    if (updateError) {
      console.error(
        "❌ Error updating balance with recalculated metrics:",
        updateError
      );
    } else {
      console.log(
        "✅ Portfolio metrics recalculated and updated from database holdings"
      );
    }
  } catch (error) {
    console.error(
      "❌ Error in recalculatePortfolioMetricsFromDatabase:",
      error
    );
  }
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

    console.log("🔄 Storing SnapTrade credentials directly in database...");

    // Store directly in Supabase database
    const { data: connection, error } = await supabase
      .from("snaptrade_connections")
      .upsert(
        {
          user_id: userId,
          snaptrade_user_id: snaptradeUserId,
          account_id: accountId,
          user_secret: userSecret,
          brokerage_name: metadata.brokerage_name || "Unknown",
          account_name: metadata.account_name || "Investment Account",
          account_type: metadata.account_type || "investment",
          is_active: true,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,snaptrade_user_id,account_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Database error storing SnapTrade credentials:", error);
      throw new Error(
        error.message || "Failed to store SnapTrade credentials in database"
      );
    }

    console.log("✅ SnapTrade credentials stored directly in database");
    return res.status(200).json({
      success: true,
      connection,
      message: "Credentials stored successfully",
    });
  } catch (error) {
    console.error("❌ Failed to store SnapTrade credentials:", error);
    throw error;
  }
}

async function handleSnapTradeSync(res, userId, accountId) {
  try {
    console.log("🔄 Starting SnapTrade sync for:", { userId, accountId });

    // Get the snaptrade_user_id and user_secret from the database connection
    const { data: connection, error: connErr } = await supabase
      .from("snaptrade_connections")
      .select("user_id, snaptrade_user_id, user_secret")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .single();

    if (connErr || !connection) {
      console.error("SnapTrade connection lookup error:", connErr);
      throw new Error("SnapTrade connection not found");
    }

    console.log("🔄 Found SnapTrade connection:", {
      user_id: connection.user_id,
      snaptrade_user_id: connection.snaptrade_user_id,
    });

    // Import SnapTrade SDK (same as plaid_management.js)

    const isSandbox = process.env.SNAPTRADE_ENVIRONMENT === "sandbox";

    const snaptrade = new Snaptrade({
      clientId: isSandbox
        ? process.env.SNAPTRADE_CLIENT_ID_DEV
        : process.env.SNAPTRADE_CLIENT_ID,
      consumerKey: isSandbox
        ? process.env.SNAPTRADE_CONSUMER_KEY_DEV
        : process.env.SNAPTRADE_CONSUMER_KEY,
    });

    // Sync Account Balances
    console.log("💰 Syncing account balances...");
    try {
      const balanceResponse =
        await snaptrade.accountInformation.getUserAccountBalance({
          accountId: accountId,
          userId: connection.snaptrade_user_id,
          userSecret: connection.user_secret,
        });

      const balanceData = balanceResponse.data;
      console.log(
        "💰 Balance data received:",
        JSON.stringify(balanceData, null, 2)
      );

      if (balanceData && Array.isArray(balanceData) && balanceData.length > 0) {
        // Get current holdings to calculate performance metrics
        const holdingsResponse =
          await snaptrade.accountInformation.getUserHoldings({
            accountId: accountId,
            userId: connection.snaptrade_user_id,
            userSecret: connection.user_secret,
          });

        const holdingsData = holdingsResponse?.data || [];
        console.log(
          `📊 Got ${
            holdingsData ? holdingsData.length : 0
          } holdings for performance calculation`
        );

        // Extract total_value from holdings response if available
        const apiTotalValue =
          holdingsData?.total_value?.value || holdingsData?.total_value;

        // Get existing balance and previous portfolio value from DB before overwriting holdings
        const { data: existingBalance } = await supabase
          .from("investment_balances")
          .select(
            "day_change, day_change_percent, total_change, total_change_percent, last_updated"
          )
          .eq("user_id", connection.user_id)
          .eq("snaptrade_user_id", connection.snaptrade_user_id)
          .eq("account_id", accountId)
          .eq("is_current", true)
          .single();

        // Previous portfolio total value (from last synced holdings snapshot)
        let previousPortfolioValue = 0;
        try {
          const { data: prevHoldings } = await supabase
            .from("investment_holdings")
            .select("market_value")
            .eq("user_id", connection.user_id)
            .eq("snaptrade_user_id", connection.snaptrade_user_id)
            .eq("account_id", accountId)
            .eq("is_active", true);
          previousPortfolioValue = (prevHoldings || []).reduce(
            (sum, row) => sum + (row.market_value || 0),
            0
          );
        } catch (_) {
          previousPortfolioValue = 0;
        }

        // Calculate portfolio performance metrics
        let totalUnrealizedPL = existingBalance?.total_change || 0;
        let totalPortfolioValue = 0;

        if (
          holdingsData &&
          Array.isArray(holdingsData) &&
          holdingsData.length > 0
        ) {
          totalUnrealizedPL = 0;
          totalPortfolioValue = 0;

          holdingsData.forEach((holding) => {
            const marketValue = holding.market_value || 0;
            const unrealizedPL = holding.unrealized_pl || 0;
            totalUnrealizedPL += unrealizedPL;
            totalPortfolioValue += marketValue;
          });
        }

        // Calculate total portfolio value - prioritize API total_value, then fallback to calculations
        let totalValue = 0;

        // First priority: Use total_value from holdings API response
        if (apiTotalValue && apiTotalValue > 0) {
          totalValue = apiTotalValue;
          console.log(`✅ Using API total_value: $${totalValue.toFixed(2)}`);
        } else if (
          balanceData[0]?.total_equity &&
          balanceData[0].total_equity > 0
        ) {
          totalValue = balanceData[0].total_equity;
          console.log(
            `✅ Using balance total_equity: $${totalValue.toFixed(2)}`
          );
        } else {
          // Fallback to sum of all stocks' market_value
          totalValue = totalPortfolioValue;
          console.log(
            `⚠️ Fallback calculation: sum of all stocks' market_value = $${totalValue.toFixed(
              2
            )}`
          );
        }

        // Compute today's absolute change using securities-only values on both sides
        // Use sum of holdings market_value (totalPortfolioValue) vs previousPortfolioValue for apples-to-apples
        const computedDayChange =
          holdingsData && Array.isArray(holdingsData) && holdingsData.length > 0
            ? (totalPortfolioValue || 0) - (previousPortfolioValue || 0)
            : existingBalance?.day_change || 0;

        // Calculate percentages: use previous total as denominator for today % when available
        const dayChangePercent =
          holdingsData && Array.isArray(holdingsData) && holdingsData.length > 0
            ? previousPortfolioValue > 0
              ? (computedDayChange / previousPortfolioValue) * 100
              : 0
            : existingBalance?.day_change_percent || 0;
        const totalChangePercent =
          holdingsData && Array.isArray(holdingsData) && holdingsData.length > 0
            ? totalPortfolioValue > 0
              ? (totalUnrealizedPL / totalPortfolioValue) * 100
              : 0
            : existingBalance?.total_change_percent || 0;

        console.log(
          `📈 Portfolio metrics ${
            holdingsData &&
            Array.isArray(holdingsData) &&
            holdingsData.length > 0
              ? "calculated from holdings"
              : "preserved from existing data"
          }:`,
          {
            holdingsCount: holdingsData?.length || 0,
            totalPortfolioValue: totalPortfolioValue.toFixed(2),
            totalValue: totalValue.toFixed(2),
            totalDayChange: computedDayChange.toFixed(2),
            dayChangePercent: dayChangePercent.toFixed(2),
            totalUnrealizedPL: totalUnrealizedPL.toFixed(2),
            totalChangePercent: totalChangePercent.toFixed(2),
          }
        );

        const balanceRows = balanceData.map((balance) => ({
          user_id: connection.user_id,
          snaptrade_user_id: connection.snaptrade_user_id,
          account_id: accountId,
          currency_code: balance.currency?.code || "USD",
          cash: balance.cash || 0,
          buying_power: balance.buying_power || 0,
          total_equity:
            balance.total_equity || totalValue || totalPortfolioValue || 0,
          total_margin_used: 0,
          total_margin_available: 0,
          // New performance columns
          day_change: computedDayChange,
          day_change_percent: dayChangePercent,
          total_change: totalUnrealizedPL,
          total_change_percent: totalChangePercent,
          // New total value column
          total_value: totalValue,
          is_current: true,
          last_updated: new Date().toISOString(),
        }));

        // Update existing current balance row instead of creating new ones
        const { error: balanceErr } = await supabase
          .from("investment_balances")
          .update(balanceRows[0]) // Update with the first (and only) balance row
          .eq("user_id", connection.user_id)
          .eq("snaptrade_user_id", connection.snaptrade_user_id)
          .eq("account_id", accountId)
          .eq("is_current", true);

        if (balanceErr) {
          console.error("❌ Balance update error:", balanceErr);
        } else {
          console.log(
            "✅ Balance updated successfully with new performance metrics"
          );
        }

        // After updating balances, recalculate from database holdings to ensure accuracy
        await recalculatePortfolioMetricsFromDatabase(
          connection.user_id,
          connection.snaptrade_user_id,
          accountId
        );
      } else {
        console.log("ℹ️ No balance data to sync");
      }
    } catch (error) {
      console.error("❌ Error syncing balances:", error);
    }

    // Sync Holdings
    console.log("📈 Syncing investment holdings...");
    try {
      const holdingsResponse =
        await snaptrade.accountInformation.getUserHoldings({
          accountId: accountId,
          userId: connection.snaptrade_user_id,
          userSecret: connection.user_secret,
        });

      const holdingsData = holdingsResponse.data;
      console.log(
        "📈 Holdings data received:",
        JSON.stringify(holdingsData, null, 2)
      );

      // Holdings are in the positions array
      const positions = holdingsData.positions || [];
      if (positions && positions.length > 0) {
        // Process holdings with dynamic day change calculation
        console.log("🔍 Calculating daily performance changes...");
        const holdingsRows = await Promise.all(
          positions.map(async (holding) => {
            const symbol = holding.symbol?.symbol || holding.symbol;

            const currentMarketValue =
              holding.units && holding.price
                ? holding.units * holding.price
                : null;

            let dayChange = null;
            let dayChangePercent = null;

            // First, check if we have existing day_change data to preserve
            try {
              const { data: existingHolding } = await supabase
                .from("investment_holdings")
                .select("day_change, day_change_percent")
                .eq("snaptrade_user_id", connection.snaptrade_user_id)
                .eq("account_id", accountId)
                .eq("symbol_id", symbol.id)
                .eq("is_active", true)
                .single();

              if (
                existingHolding?.day_change !== null &&
                existingHolding?.day_change !== undefined
              ) {
                console.log(
                  `💾 Preserving existing day_change for ${symbol.symbol}: $${existingHolding.day_change}`
                );
                dayChange = existingHolding.day_change;
                dayChangePercent = existingHolding.day_change_percent;
              }
            } catch (preserveError) {
              console.log(
                `ℹ️ No existing day_change data for ${symbol.symbol}, will calculate new`
              );
            }

            // Calculate day change dynamically since SnapTrade day_change is always null
            // Only calculate if we don't have existing data to preserve
            if (dayChange === null && currentMarketValue && symbol?.id) {
              try {
                console.log(
                  `🔍 Analyzing ${symbol.symbol}: currentMarketValue = $${currentMarketValue}`
                );

                // Get previous market value by checking for yesterday's data
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayISO = yesterday.toISOString().split("T")[0];

                console.log(
                  `📅 Looking for historical data before: ${yesterdayISO}T23:59:59`
                );

                // Look for previous day's snapshot - try multiple strategies for better coverage
                let { data: previousHoldings, error: prevError } =
                  await supabase
                    .from("investment_holdings")
                    .select("price, market_value, last_updated, units")
                    .eq("snaptrade_user_id", connection.snaptrade_user_id)
                    .eq("account_id", accountId)
                    .eq("symbol_id", symbol.id)
                    .eq("is_active", true)
                    .lte("last_updated", yesterdayISO + "T23:59:59")
                    .gte("last_updated", yesterdayISO + "T00:00:00")
                    .order("last_updated", { ascending: false })
                    .limit(1);

                console.log(`📊 Yesterday query result for ${symbol.symbol}:`, {
                  found: previousHoldings?.length || 0,
                  error: prevError?.message || null,
                });

                // If no data for yesterday, try up to 7 days before for weekends/holidays
                if (
                  (!prevError &&
                    (!previousHoldings || previousHoldings.length === 0)) ||
                  prevError
                ) {
                  console.log(
                    `🔍 No yesterday's data for ${symbol.symbol}, trying previous days...`
                  );

                  // Try multiple days back up to a week
                  for (let daysBack = 1; daysBack <= 7; daysBack++) {
                    const beforeDate = new Date(yesterday);
                    beforeDate.setDate(beforeDate.getDate() - daysBack);
                    const dayBefore = beforeDate.toISOString().split("T")[0];

                    const beforeResult = await supabase
                      .from("investment_holdings")
                      .select("price, market_value, last_updated, units")
                      .eq("snaptrade_user_id", connection.snaptrade_user_id)
                      .eq("account_id", accountId)
                      .eq("symbol_id", symbol.id)
                      .eq("is_active", true)
                      .lte("last_updated", dayBefore + "T23:59:59")
                      .order("last_updated", { ascending: false })
                      .limit(1);

                    if (
                      !beforeResult.error &&
                      beforeResult.data &&
                      beforeResult.data.length > 0
                    ) {
                      previousHoldings = beforeResult.data;
                      prevError = null;
                      console.log(
                        `📊 Using ${dayBefore} data for ${
                          symbol.symbol
                        } (${daysBack} day${daysBack > 1 ? "s" : ""} back)`
                      );
                      break;
                    }
                  }
                }

                if (
                  !prevError &&
                  previousHoldings &&
                  previousHoldings.length > 0
                ) {
                  const prevHolding = previousHoldings[0];

                  console.log(`📈 Previous data found for ${symbol.symbol}:`, {
                    price: prevHolding.price,
                    marketValue: prevHolding.market_value,
                    units: prevHolding.units,
                    lastUpdated: prevHolding.last_updated,
                  });

                  // Standard market value comparison (preferred)
                  if (prevHolding.market_value && currentMarketValue) {
                    dayChange = currentMarketValue - prevHolding.market_value;
                    dayChangePercent =
                      prevHolding.market_value > 0
                        ? (dayChange / prevHolding.market_value) * 100
                        : null;
                    console.log(
                      `💰 Market Value Comparison for ${symbol.symbol}: ${
                        prevHolding.market_value
                      } → ${currentMarketValue} = $${dayChange.toFixed(2)} ${
                        dayChange >= 0 ? "📈" : "📉"
                      }`
                    );
                  }
                  // Fallback to price-based calculation if market_value comparison fails
                  else if (
                    prevHolding.price &&
                    holding.price &&
                    holding.units > 0
                  ) {
                    // Calculate price change and apply to current units
                    const priceChange = holding.price - prevHolding.price;
                    dayChange = priceChange * holding.units;
                    dayChangePercent =
                      prevHolding.price > 0
                        ? (priceChange / prevHolding.price) * 100
                        : null;
                    console.log(
                      `📊 Price Comparison for ${symbol.symbol}: ${
                        prevHolding.price
                      } → ${holding.price} × ${
                        holding.units
                      } = $${dayChange.toFixed(2)}`
                    );
                  }
                } else {
                  console.log(
                    `ℹ️ No previous data found for ${symbol.symbol} - first day tracking`
                  );
                  dayChange = null;
                  dayChangePercent = null;
                }
              } catch (calcError) {
                console.log(
                  `⚠️ Could not calculate day change for ${symbol.symbol}:`,
                  calcError.message
                );
                dayChange = null;
                dayChangePercent = null;
              }
            }

            return {
              user_id: connection.user_id,
              snaptrade_user_id: connection.snaptrade_user_id,
              account_id: accountId,
              symbol_id: symbol?.id,
              symbol: symbol?.symbol,
              raw_symbol: symbol?.raw_symbol,
              description: symbol?.description,
              currency_code: holding.currency?.code || "USD",
              exchange_code: symbol?.exchange?.code,
              exchange_name: symbol?.exchange?.name,
              security_type: symbol?.type?.description,
              units: holding.units || 0,
              price: holding.price,
              market_value: currentMarketValue,
              average_purchase_price: holding.average_purchase_price,
              total_cost_basis:
                holding.units && holding.average_purchase_price
                  ? holding.units * holding.average_purchase_price
                  : null,
              unrealized_pl: holding.open_pnl,
              realized_pl: 0,
              day_change: dayChange,
              day_change_percent: dayChangePercent,
              is_active: true,
              last_updated: new Date().toISOString(),
            };
          })
        );

        // Use upsert to handle existing holdings properly
        try {
          const { error: holdingsErr } = await supabase
            .from("investment_holdings")
            .upsert(holdingsRows, {
              onConflict: "snaptrade_user_id,account_id,symbol_id",
              ignoreDuplicates: false,
            });

          if (holdingsErr) {
            console.error("❌ Holdings upsert error:", holdingsErr);
            // If upsert fails due to constraint, try individual inserts with error handling
            console.log("🔄 Attempting individual holdings inserts...");
            for (const holding of holdingsRows) {
              try {
                const { error: insertErr } = await supabase
                  .from("investment_holdings")
                  .upsert(holding, {
                    onConflict: "snaptrade_user_id,account_id,symbol_id",
                    ignoreDuplicates: false,
                  });
                if (insertErr) {
                  console.error(
                    `❌ Failed to upsert holding ${holding.symbol}:`,
                    insertErr
                  );
                }
              } catch (individualErr) {
                console.error(
                  `❌ Individual holding upsert failed for ${holding.symbol}:`,
                  individualErr
                );
              }
            }
          } else {
            console.log(
              "✅ Holdings synced successfully:",
              holdingsRows.length
            );
          }
        } catch (upsertError) {
          console.error(
            "❌ Critical error during holdings upsert:",
            upsertError
          );
          // Continue with sync even if holdings fail
        }
      } else {
        console.log("ℹ️ No holdings data to sync");
      }
    } catch (error) {
      console.error("❌ Error syncing holdings:", error);
    }

    // Final recalculation from database holdings to ensure accuracy
    console.log("🔄 Final recalculation of portfolio metrics from database...");
    await recalculatePortfolioMetricsFromDatabase(
      connection.user_id,
      connection.snaptrade_user_id,
      accountId
    );

    // Update last_synced_at timestamp
    await supabase
      .from("snaptrade_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("snaptrade_user_id", connection.snaptrade_user_id)
      .eq("account_id", accountId);

    console.log("✅ SnapTrade sync completed successfully");
    return res.status(200).json({
      success: true,
      message: "Investments synced successfully",
    });
  } catch (error) {
    console.error("❌ SnapTrade sync error:", error);
    throw error;
  }
}
