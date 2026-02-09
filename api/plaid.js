// /api/plaid.js
import { client } from "../lib/api/plaidClient.js";
import { supabase } from "../lib/api/supabase.js";
import {
  snaptrade,
  isSandbox,
  clientId,
  consumerKey,
} from "../lib/api/snaptrade.js";
import {
  verifyItemOwnership,
  verifyUserAuthorization,
} from "../lib/api/auth.js";
import {
  checkRateLimit,
  formatRetryAfterSeconds,
} from "../lib/api/rateLimiter.js";

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
    // 1. Verify user owns this item (authorization check)
    const {
      authorized,
      userId: actualUserId,
      error: authError,
    } = await verifyItemOwnership(req, item_id);

    if (!authorized) {
      return res.status(authError?.includes("Unauthorized") ? 401 : 403).json({
        error: authError || "Access denied",
      });
    }

    const plaidRateLimit = await checkRateLimit(req, {
      scope: "plaid",
      userId: actualUserId,
      limit: 60,
      windowMs: 60 * 1000,
    });

    if (!plaidRateLimit.allowed) {
      const retryAfter = formatRetryAfterSeconds(plaidRateLimit.retryAfterMs);
      if (retryAfter > 0) {
        res.setHeader("Retry-After", retryAfter);
      }
      return res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
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
        // Get cursor for this item (already have user_id from auth check)
        // Fetch user_id and cursor together in one query for efficiency
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
    let { userId, userSecret, accountId, user_id } = params;

    // For modes that require Supabase user authorization
    const requiresAuth = [
      "snaptrade_store_credentials",
      "snaptrade_sync",
      "snaptrade_refresh",
      "snaptrade_check_status",
      "snaptrade_get_connection_details",
      "snaptrade_recalculate",
      "snaptrade_remove_brokerage",
    ];

    let supabaseUserId = user_id || null;

    if (requiresAuth.includes(mode)) {
      // If not provided, derive Supabase user_id from accountId
      if (!supabaseUserId && accountId) {
        try {
          const { data: accountOwner } = await supabase
            .from("snaptrade_connections")
            .select("user_id")
            .eq("account_id", accountId)
            .single();

          if (accountOwner?.user_id) {
            supabaseUserId = accountOwner.user_id;
          }
        } catch (lookupError) {
          console.warn(
            "⚠️ Unable to derive Supabase user_id from accountId:",
            lookupError.message
          );
        }
      }

      if (!supabaseUserId) {
        return res.status(400).json({
          error:
            "Missing user_id (Supabase user ID required for this SnapTrade operation)",
        });
      }

      const { authorized, error: authError } = await verifyUserAuthorization(
        req,
        supabaseUserId
      );

      if (!authorized) {
        return res
          .status(authError?.includes("Unauthorized") ? 401 : 403)
          .json({
            error: authError || "Access denied",
          });
      }
    }

    const snaptradeRateLimit = await checkRateLimit(req, {
      scope: "snaptrade",
      userId: supabaseUserId,
      limit: 30,
      windowMs: 60 * 1000,
    });

    if (!snaptradeRateLimit.allowed) {
      const retryAfter = formatRetryAfterSeconds(
        snaptradeRateLimit.retryAfterMs
      );
      if (retryAfter > 0) {
        res.setHeader("Retry-After", retryAfter);
      }
      return res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
    }

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
          return res.status(400).json({
            error:
              "Missing required parameters (userId, userSecret, accountId)",
          });
        }
        return await handleSnapTradeStoreCredentials(
          res,
          params,
          supabaseUserId
        );

      case "snaptrade_sync":
        if (!accountId) {
          return res.status(400).json({
            error: "Missing accountId",
          });
        }
        return await handleSnapTradeSync(res, supabaseUserId, accountId);

      case "snaptrade_refresh":
        if (!accountId) {
          return res.status(400).json({
            error: "Missing accountId",
          });
        }
        return await handleSnapTradeRefresh(res, supabaseUserId, accountId);

      case "snaptrade_check_status":
        if (!accountId) {
          return res.status(400).json({
            error: "Missing accountId",
          });
        }
        return await handleSnapTradeCheckStatus(res, supabaseUserId, accountId);

      case "snaptrade_get_connection_details":
        if (!accountId) {
          return res.status(400).json({
            error: "Missing accountId",
          });
        }
        return await handleSnapTradeGetConnectionDetails(
          res,
          supabaseUserId,
          accountId
        );

      case "snaptrade_recalculate":
        if (!accountId) {
          return res.status(400).json({
            error: "Missing accountId",
          });
        }
        return await handleSnapTradeRecalculate(res, supabaseUserId, accountId);

      case "snaptrade_remove_brokerage":
        if (!accountId) {
          return res.status(400).json({
            error: "Missing accountId",
          });
        }
        return await handleSnapTradeRemoveBrokerage(res, supabaseUserId, accountId);

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
  // Use shared SnapTrade credentials
  const SNAPTRADE_CLIENT_ID = clientId;
  const SNAPTRADE_CONSUMER_KEY = consumerKey;

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
    console.log(
      "🔄 Recalculating portfolio metrics from database holdings and options..."
    );

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

    // Get all active options for this account from the database
    const { data: options, error: optionsError } = await supabase
      .from("investment_options")
      .select("*")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_active", true);

    if (optionsError) {
      console.error(
        "❌ Error fetching options for recalculation:",
        optionsError
      );
      // Continue even if options fetch fails
    }

    if (
      (!holdings || holdings.length === 0) &&
      (!options || options.length === 0)
    ) {
      console.log("ℹ️ No holdings or options found for recalculation");
      return;
    }

    // Calculate totals from database holdings
    let totalHoldingsValue = 0;
    let totalDayChange = 0;
    let totalUnrealizedPL = 0;

    holdings?.forEach((holding) => {
      const marketValue = holding.market_value || 0;
      const dayChange = holding.day_change || 0;
      const unrealizedPL = holding.unrealized_pl || 0;

      totalHoldingsValue += marketValue;
      totalDayChange += dayChange;
      totalUnrealizedPL += unrealizedPL;
    });

    // Calculate totals from database options
    options?.forEach((option) => {
      const marketValue = option.market_value || 0;
      const dayChange = option.day_change || 0;
      const unrealizedPL = option.unrealized_pl || 0;

      totalHoldingsValue += marketValue;
      totalDayChange += dayChange;
      totalUnrealizedPL += unrealizedPL;
    });

    // CRITICAL: Get existing balance to preserve total_value (includes cash only, no buying_power)
    // The balance sync sets total_value from accountTotalValue (API), which is more accurate
    // We should NOT overwrite it with sum of holdings (which doesn't include cash)
    const { data: existingBalance } = await supabase
      .from("investment_balances")
      .select("total_value, cash")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      .eq("is_current", true)
      .single();

    // Use existing total_value from balance sync (includes cash), or calculate from holdings + cash only
    const totalPortfolioValue =
      existingBalance?.total_value ||
      totalHoldingsValue + (existingBalance?.cash || 0);

    // Calculate percentages
    const dayChangePercent =
      totalPortfolioValue > 0
        ? (totalDayChange / totalPortfolioValue) * 100
        : 0;
    const totalChangePercent =
      totalPortfolioValue > 0
        ? (totalUnrealizedPL / totalPortfolioValue) * 100
        : 0;

    // Use cash from existingBalance (already fetched above)
    const cashAmount = existingBalance?.cash || 0;

    console.log("📊 Database-calculated portfolio metrics:", {
      holdingsCount: holdings?.length || 0,
      optionsCount: options?.length || 0,
      totalHoldingsValue: totalHoldingsValue.toFixed(2),
      cashAmount: cashAmount.toFixed(2),
      totalPortfolioValue: totalPortfolioValue.toFixed(2),
      note: "totalPortfolioValue preserved from balance sync (cash only, no buying_power)",
      totalDayChange: totalDayChange.toFixed(2),
      dayChangePercent: dayChangePercent.toFixed(2),
      totalUnrealizedPL: totalUnrealizedPL.toFixed(2),
      totalChangePercent: totalChangePercent.toFixed(2),
    });

    // Update investment_balances with recalculated totals but preserve critical fields
    // CRITICAL:
    // - Don't overwrite day_change/day_change_percent (calculated from account totals in balance sync)
    // - Don't overwrite total_value if it exists (balance sync sets it from API accountTotalValue, includes cash)
    // - Only update total_change and total_change_percent from holdings
    const updateData = {
      total_change: totalUnrealizedPL,
      total_change_percent: totalChangePercent,
      // NOTE: day_change and day_change_percent are NOT updated here - they're calculated from account totals
      // NOTE: total_value is preserved from balance sync (cash only from API)
      last_updated: new Date().toISOString(),
    };

    // Only update total_value if it wasn't set by balance sync (fallback for edge cases)
    if (!existingBalance?.total_value) {
      updateData.total_value = totalPortfolioValue;
    }

    const { error: updateError } = await supabase
      .from("investment_balances")
      .update(updateData)
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

async function handleSnapTradeRecalculate(res, userId, accountId) {
  try {
    console.log("🔄 Recalculating investment balances for:", {
      userId,
      accountId,
    });

    // Get the snaptrade_user_id from the connection
    const { data: connection, error: connErr } = await supabase
      .from("snaptrade_connections")
      .select("snaptrade_user_id")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .eq("is_active", true)
      .single();

    if (connErr || !connection) {
      console.error("SnapTrade connection lookup error:", connErr);
      return res.status(404).json({ error: "SnapTrade connection not found" });
    }

    // Recalculate portfolio metrics from active holdings and options
    await recalculatePortfolioMetricsFromDatabase(
      userId,
      connection.snaptrade_user_id,
      accountId
    );

    return res.status(200).json({
      success: true,
      message: "Investment balances recalculated successfully",
    });
  } catch (error) {
    console.error("❌ Error recalculating balances:", error);
    return res.status(500).json({
      error: error.message || "Failed to recalculate balances",
    });
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

async function handleSnapTradeStoreCredentials(res, params, supabaseUserId) {
  try {
    const {
      userId: snaptradeUserId,
      accountId,
      userSecret,
      ...metadata
    } = params;

    console.log("🔄 Storing SnapTrade credentials directly in database...");

    // Store directly in Supabase database
    const { data: connection, error } = await supabase
      .from("snaptrade_connections")
      .upsert(
        {
          user_id: supabaseUserId, // Supabase user_id (already verified via auth)
          snaptrade_user_id: snaptradeUserId, // SnapTrade userId
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
    // CRITICAL: Also filter by user_id to ensure user can only sync their own accounts
    const { data: connection, error: connErr } = await supabase
      .from("snaptrade_connections")
      .select(
        "user_id, snaptrade_user_id, user_secret, connection_status, is_active, connection_id"
      )
      .eq("user_id", userId) // CRITICAL: Security check - ensure user owns this account
      .eq("account_id", accountId)
      .single();

    if (connErr || !connection) {
      console.error("SnapTrade connection lookup error:", connErr);
      if (connErr?.code === "PGRST116") {
        throw new Error("SnapTrade connection not found for this user");
      }
      throw new Error("SnapTrade connection not found");
    }

    // CRITICAL: Additional security check
    if (connection.user_id !== userId) {
      console.error(
        "❌ Security violation: User attempting to sync another user's account"
      );
      throw new Error("Unauthorized: Cannot sync this account");
    }

    // Check if connection is disabled in DB
    if (
      !connection.is_active ||
      connection.connection_status === "disabled" ||
      connection.connection_status === "error"
    ) {
      return res.status(402).json({
        error: "Connection is disabled",
        code: "CONNECTION_DISABLED",
        message:
          "Your investment account connection has been disabled. Please reconnect your account to continue.",
        requiresReconnect: true,
      });
    }

    // Try to actually sync - this will fail if connection is disabled in SnapTrade
    // We'll catch the error and update the DB accordingly

    console.log("🔄 Found SnapTrade connection:", {
      user_id: connection.user_id,
      snaptrade_user_id: connection.snaptrade_user_id,
    });

    // Use shared SnapTrade SDK instance

    // Track sync operations for error reporting
    const syncErrors = [];
    let balancesSynced = false;
    let holdingsSynced = false;

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
      const balanceResponseFull = balanceResponse.data || balanceResponse;

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

        // holdingsResponse structure: { account: {...}, positions: [...], balances: [...], total_value: {...} }
        // OR: { data: { account: {...}, positions: [...], ... } }
        // OR: { data: [...] } (just positions array)
        const holdingsResponseData = holdingsResponse?.data || holdingsResponse;
        const holdingsData = Array.isArray(holdingsResponseData)
          ? holdingsResponseData
          : holdingsResponseData?.positions || holdingsResponseData?.data || [];

        console.log(
          `📊 Got ${
            holdingsData ? holdingsData.length : 0
          } holdings for performance calculation`
        );

        // CRITICAL: Extract TOTAL account value (holdings + cash) from account.balance.total
        // Check both balanceResponse and holdingsResponse for account info
        // Priority: holdingsResponse.account (most reliable), then balanceResponse.account
        const accountTotalFromHoldings =
          holdingsResponse?.account?.balance?.total?.amount ||
          holdingsResponse?.account?.balance?.total?.value ||
          holdingsResponseData?.account?.balance?.total?.amount ||
          holdingsResponseData?.account?.balance?.total?.value ||
          null;

        const accountTotalFromBalance =
          balanceResponse?.account?.balance?.total?.amount ||
          balanceResponse?.account?.balance?.total?.value ||
          balanceResponseFull?.account?.balance?.total?.amount ||
          balanceResponseFull?.account?.balance?.total?.value ||
          null;

        const accountTotalValue =
          accountTotalFromHoldings || accountTotalFromBalance;

        // Get existing balance to read previous_total_value before updating
        // CRITICAL: Also fetch cash to reconstruct previous_total_value if needed (no buying_power)
        // Use maybeSingle() instead of single() to handle case when no balance exists yet (first connection)
        const { data: existingBalance, error: existingBalanceError } = await supabase
          .from("investment_balances")
          .select(
            "day_change, day_change_percent, total_change, total_change_percent, previous_total_value, total_value, last_updated, cash"
          )
          .eq("user_id", connection.user_id)
          .eq("snaptrade_user_id", connection.snaptrade_user_id)
          .eq("account_id", accountId)
          .eq("is_current", true)
          .maybeSingle();
        
        // Log if there's an error (but don't fail - maybeSingle returns null if not found, which is OK)
        if (existingBalanceError && existingBalanceError.code !== "PGRST116") {
          console.warn("⚠️ Error fetching existing balance (non-critical):", existingBalanceError);
        }

        // Get previous portfolio total value - use day-boundary logic like holdings
        // Only update previous_total_value when rolling to a new calendar day (UTC)
        const existingLastUpdated = existingBalance?.last_updated;
        const now = new Date();
        const todayUTC = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        );
        const isSameCalendarDayUTC = (dateStr) => {
          if (!dateStr) return false;
          const d = new Date(dateStr);
          const dayUTC = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate()
          );
          return dayUTC === todayUTC;
        };
        const sameDay = isSameCalendarDayUTC(existingLastUpdated);

        // Use previous_total_value as baseline if same day, otherwise use total_value or null
        const previousTotalValue =
          existingBalance &&
          sameDay &&
          existingBalance.previous_total_value != null
            ? existingBalance.previous_total_value
            : existingBalance?.previous_total_value ??
              existingBalance?.total_value ??
              null;

        // Cash-equivalent symbols (avoid double-counting: broker "cash" often = SPAXX/sweep in holdings)
        const cashEqSymbols = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];
        const isCashEquivalent = (h) => {
          // Extract symbol string from nested structure: holding.symbol.symbol.symbol or holding.symbol.symbol.raw_symbol
          const sym = (
            h.symbol?.symbol?.symbol ||
            h.symbol?.symbol?.raw_symbol ||
            h.symbol ||
            ""
          ).toString().toUpperCase();
          
          // Extract security_type from nested structure: holding.symbol.symbol.type.description
          const st = (
            h.symbol?.symbol?.type?.description ||
            h.security_type?.description ||
            h.security_type ||
            ""
          ).toString().toLowerCase();
          
          // Extract description from nested structure: holding.symbol.symbol.description
          const desc = (
            h.symbol?.symbol?.description ||
            h.description ||
            ""
          ).toString().toLowerCase();
          
          if (cashEqSymbols.includes(sym)) return true;
          if (
            st.includes("money market") ||
            st.includes("cash") ||
            desc.includes("money market") ||
            desc.includes("cash equivalent")
          )
            return true;
          return false;
        };

        // Calculate portfolio performance metrics
        let totalUnrealizedPL = existingBalance?.total_change || 0;
        let totalHoldingsValue = 0;
        let cashEquivalentInHoldings = 0;

        if (
          holdingsData &&
          Array.isArray(holdingsData) &&
          holdingsData.length > 0
        ) {
          totalUnrealizedPL = 0;
          totalHoldingsValue = 0;

          holdingsData.forEach((holding) => {
            // Calculate market_value from units * price if not provided directly
            const marketValue =
              holding.market_value ||
              (holding.units && holding.price
                ? holding.units * holding.price
                : 0);
            const unrealizedPL = holding.open_pnl || holding.unrealized_pl || 0;
            totalUnrealizedPL += unrealizedPL;
            totalHoldingsValue += marketValue;
            if (isCashEquivalent(holding))
              cashEquivalentInHoldings += marketValue;
          });
        }

        // Calculate total account value (holdings + cash only, no buying_power)
        // Avoid double-counting: broker "cash" often = SPAXX/sweep (already in holdings)
        const totalCash = balanceData.reduce((sum, b) => {
          const cash =
            typeof b.cash === "number" ? b.cash : parseFloat(b.cash || 0);
          return sum + cash;
        }, 0);
        const cashToAdd = Math.max(0, totalCash - cashEquivalentInHoldings);
        const ourCalculatedTotal = totalHoldingsValue + cashToAdd;
        let totalValue = 0;

        // First priority: Use account.balance.total.amount (total account value including cash)
        if (accountTotalValue && accountTotalValue > 0) {
          // Safeguard: if API total looks doubled (e.g. cash = SPAXX counted twice), use our total
          if (
            ourCalculatedTotal > 0 &&
            accountTotalValue > ourCalculatedTotal * 1.05
          ) {
            totalValue = ourCalculatedTotal;
            console.log(
              `✅ Using our total (API total looked doubled): $${totalValue.toFixed(
                2
              )}`
            );
          } else {
            totalValue = accountTotalValue;
            console.log(
              `✅ Using account total value (holdings + cash): $${totalValue.toFixed(
                2
              )}`
            );
          }
        } else {
          // Fallback: holdings + cash minus cash-equivalent holdings to avoid double-count
          totalValue = ourCalculatedTotal;
          console.log(`⚠️ Fallback calculation:`, {
            totalHoldingsValue: totalHoldingsValue.toFixed(2),
            totalCash: totalCash.toFixed(2),
            cashEquivalentInHoldings: cashEquivalentInHoldings.toFixed(2),
            cashToAdd: cashToAdd.toFixed(2),
            totalValue: totalValue.toFixed(2),
            balanceDataSample: balanceData[0]
              ? {
                  cash: balanceData[0].cash,
                  cashType: typeof balanceData[0].cash,
                }
              : "no balance data",
          });
        }

        // Calculate day_change using TOTAL account value (holdings + cash only)
        // CRITICAL: previous_total_value must include cash from start of day (no buying_power)
        let computedDayChange = null;
        let dayChangePercent = null;

        // CRITICAL: previous_total_value must use same no-double-count logic (cash - cashEquivalentInHoldings)
        // If previous_total_value exists but seems incomplete (holdings-only), reconstruct it
        // by adding only the non-double-counted cash (avoid adding cash that's already SPAXX in holdings)
        let adjustedPreviousTotalValue = previousTotalValue;
        if (previousTotalValue !== null && existingBalance) {
          const previousCash = parseFloat(existingBalance.cash || 0) || 0;
          const previousCashToAdd = Math.max(
            0,
            previousCash - cashEquivalentInHoldings
          );

          // Reconstruct: previous_total_value = previous holdings total + cash not already in holdings
          const reconstructedPrevious = previousTotalValue + previousCashToAdd;
          const diffOriginal = Math.abs(previousTotalValue - totalValue);
          const diffReconstructed = Math.abs(
            reconstructedPrevious - totalValue
          );

          // Use reconstructed value if:
          // 1. There's significant cash to add (> $1)
          // 2. Reconstructed is closer to current total (or original is way off)
          // 3. Reconstructed makes sense (not negative, reasonable)
          if (
            previousCashToAdd > 1 &&
            (diffReconstructed < diffOriginal * 0.9 ||
              diffOriginal > totalValue * 0.1) &&
            reconstructedPrevious > 0 &&
            reconstructedPrevious <= totalValue * 1.5 // Sanity check: not way too high
          ) {
            adjustedPreviousTotalValue = reconstructedPrevious;
            console.log(
              "🔧 Reconstructed previous_total_value (no double-count):",
              {
                original_previous_total_value: previousTotalValue.toFixed(2),
                previous_cash_to_add: previousCashToAdd.toFixed(2),
                reconstructed_previous_total_value:
                  adjustedPreviousTotalValue.toFixed(2),
                current_total_value: totalValue.toFixed(2),
                reason:
                  "previous_total_value was missing cash (no SPAXX double-count)",
              }
            );
          } else if (previousCashToAdd > 1) {
            console.log("⚠️ previous_total_value reconstruction check:", {
              original: previousTotalValue.toFixed(2),
              previous_cash_to_add: previousCashToAdd.toFixed(2),
              reconstructed: reconstructedPrevious.toFixed(2),
              current_total: totalValue.toFixed(2),
              diff_original: diffOriginal.toFixed(2),
              diff_reconstructed: diffReconstructed.toFixed(2),
              reason:
                "reconstruction didn't improve accuracy or failed sanity checks",
            });
          }
        }

        console.log("🔍 Day change calculation:", {
          previousTotalValue: previousTotalValue,
          adjustedPreviousTotalValue: adjustedPreviousTotalValue,
          totalValue: totalValue,
          sameDay: sameDay,
          existingLastUpdated: existingLastUpdated,
          existingBalancePrevious: existingBalance?.previous_total_value,
          existingBalanceTotal: existingBalance?.total_value,
          existingCash: existingBalance?.cash,
        });

        // CRITICAL: Preserve day_change if total_value hasn't changed (prevents overwriting with 0 on repeated syncs)
        const EPSILON = 0.01; // Small threshold for floating point comparison
        const existingTotalValue = existingBalance?.total_value;
        const isTotalValueUnchanged =
          existingTotalValue != null &&
          Math.abs(totalValue - existingTotalValue) < EPSILON;

        if (
          adjustedPreviousTotalValue !== null &&
          adjustedPreviousTotalValue !== undefined &&
          totalValue > 0
        ) {
          // Only compute new day_change if total_value actually changed
          if (isTotalValueUnchanged) {
            // Data unchanged: preserve existing day_change values
            computedDayChange = existingBalance?.day_change ?? null;
            dayChangePercent = existingBalance?.day_change_percent ?? null;
            console.log(
              `🔄 Total value unchanged (${totalValue.toFixed(
                2
              )}), preserving day_change: $${(computedDayChange || 0).toFixed(
                2
              )} (${(dayChangePercent || 0).toFixed(2)}%)`
            );
          } else {
            // Data changed: calculate new day_change
            computedDayChange = totalValue - adjustedPreviousTotalValue;
            dayChangePercent =
              adjustedPreviousTotalValue !== 0
                ? (computedDayChange / adjustedPreviousTotalValue) * 100
                : 0;
            console.log(
              `✅ Calculated day_change: $${computedDayChange.toFixed(
                2
              )} (${dayChangePercent.toFixed(2)}%)`
            );
          }
        } else {
          // No previous value, preserve existing or set to null
          computedDayChange = existingBalance?.day_change ?? null;
          dayChangePercent = existingBalance?.day_change_percent ?? null;
          console.log(
            `⚠️ No previous value for day_change calculation. Using existing: $${
              computedDayChange || 0
            }`
          );
        }
        const totalChangePercent =
          holdingsData && Array.isArray(holdingsData) && holdingsData.length > 0
            ? totalHoldingsValue > 0
              ? (totalUnrealizedPL / totalHoldingsValue) * 100
              : 0
            : existingBalance?.total_change_percent || 0;

        const safe = (v) =>
          v != null && typeof v === "number" ? v.toFixed(2) : String(v);
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
            totalHoldingsValue: safe(totalHoldingsValue),
            totalAccountValue: safe(totalValue),
            totalDayChange: safe(computedDayChange),
            dayChangePercent: safe(dayChangePercent),
            totalUnrealizedPL: safe(totalUnrealizedPL),
            totalChangePercent: safe(totalChangePercent),
          }
        );

        const balanceRows = balanceData.map((balance) => ({
          user_id: connection.user_id,
          snaptrade_user_id: connection.snaptrade_user_id,
          account_id: accountId,
          currency_code: balance.currency?.code || "USD",
          cash: balance.cash || 0,
          buying_power: balance.buying_power || 0,
          day_change: computedDayChange,
          day_change_percent: dayChangePercent,
          total_change: totalUnrealizedPL,
          total_change_percent: totalChangePercent,
          total_value: totalValue,
          // CRITICAL: previous_total_value includes cash only (no buying_power)
          // Only update previous_total_value when rolling to a new day (same logic as holdings)
          // When a new day starts, set previous_total_value to PREVIOUS day's total_value (preserve baseline)
          previous_total_value: !existingBalance
            ? totalValue // First sync: establish baseline
            : sameDay
            ? existingBalance.previous_total_value ??
              existingBalance.total_value ??
              totalValue // Same day: preserve baseline
            : existingBalance.total_value ?? totalValue, // New day: use previous day's total_value as new baseline
          is_current: true,
          last_updated: new Date().toISOString(),
          provider: "snaptrade",
        }));

        // Upsert: Check if row exists first, then update or insert
        // (Partial unique indexes can't be used directly in onConflict)
        const balanceRow = balanceRows[0];
        if (!balanceRow) {
          console.error("❌ No balance row to upsert");
        } else {
          console.log("🔍 Checking for existing balance row...", {
            user_id: connection.user_id,
            snaptrade_user_id: connection.snaptrade_user_id,
            account_id: accountId,
            currency_code: balanceRow.currency_code,
            provider: "snaptrade",
          });

          // CRITICAL: Check for existing row WITHOUT is_current filter
          // The unique constraint is on (user_id, snaptrade_user_id, account_id, currency_code)
          // regardless of is_current value, so we need to find any existing row
          const { data: existingBalanceRow, error: checkError } = await supabase
            .from("investment_balances")
            .select("id, day_change, day_change_percent, is_current")
            .eq("user_id", connection.user_id)
            .eq("snaptrade_user_id", connection.snaptrade_user_id)
            .eq("account_id", accountId)
            .eq("currency_code", balanceRow.currency_code)
            .eq("provider", "snaptrade")
            .maybeSingle();

          if (checkError) {
            console.error(
              "❌ Error checking for existing balance:",
              checkError
            );
          }

          // Set all other balances for this account to is_current: false
          // This ensures only one current balance exists per account
          await supabase
            .from("investment_balances")
            .update({ is_current: false })
            .eq("user_id", connection.user_id)
            .eq("snaptrade_user_id", connection.snaptrade_user_id)
            .eq("account_id", accountId)
            .eq("provider", "snaptrade");

          let balanceErr = null;
          if (existingBalanceRow?.id) {
            // Update existing row (regardless of is_current value)
            console.log("📝 Updating existing balance row:", {
              id: existingBalanceRow.id,
              was_current: existingBalanceRow.is_current,
              new_day_change: balanceRow.day_change,
              new_day_change_percent: balanceRow.day_change_percent,
              new_total_value: balanceRow.total_value,
            });
            const { error: updateErr } = await supabase
              .from("investment_balances")
              .update(balanceRow)
              .eq("id", existingBalanceRow.id);
            balanceErr = updateErr;
          } else {
            // Insert new row
            console.log("➕ Inserting new balance row:", {
              day_change: balanceRow.day_change,
              day_change_percent: balanceRow.day_change_percent,
              total_value: balanceRow.total_value,
            });
            const { error: insertErr } = await supabase
              .from("investment_balances")
              .insert(balanceRow);
            balanceErr = insertErr;
          }

          if (balanceErr) {
            console.error("❌ Balance upsert error:", balanceErr);
          } else {
            console.log(
              "✅ Balance upserted successfully (insert or update) with day_change:",
              balanceRow.day_change,
              `(${balanceRow.day_change_percent}%)`
            );
          }
        }

        // NOTE: Recalculation moved to AFTER holdings sync to ensure accuracy
        // We need holdings to be synced first so recalculation uses fresh data
        balancesSynced = true;
      } else {
        console.log("ℹ️ No balance data to sync");
        balancesSynced = true; // No data is not an error
      }
    } catch (error) {
      console.error("❌ Error syncing balances:", error);
      syncErrors.push(`Balance sync failed: ${error.message}`);
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

      const holdingsData = holdingsResponse?.data || {};
      console.log(
        "📈 Holdings data received:",
        JSON.stringify(holdingsData, null, 2)
      );

      // CRITICAL: Handle different response structures
      // Holdings can be in positions array, or holdingsData itself might be an array
      let positions = [];
      if (Array.isArray(holdingsData)) {
        positions = holdingsData;
      } else if (
        holdingsData.positions &&
        Array.isArray(holdingsData.positions)
      ) {
        positions = holdingsData.positions;
      } else if (
        holdingsData.holdings &&
        Array.isArray(holdingsData.holdings)
      ) {
        positions = holdingsData.holdings;
      }
      if (positions && positions.length > 0) {
        // Get existing holdings to read previous_market_value and last_updated (for same-day check)
        // CRITICAL: Also fetch price to detect if it changed during the day
        const { data: existingHoldings } = await supabase
          .from("investment_holdings")
          .select(
            "symbol_id, symbol, previous_market_value, market_value, last_updated, price"
          )
          .eq("user_id", connection.user_id)
          .eq("snaptrade_user_id", connection.snaptrade_user_id)
          .eq("account_id", accountId)
          .eq("is_active", true);

        const now = new Date();
        const todayUTC = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        );

        const isSameCalendarDayUTC = (dateStr) => {
          if (!dateStr) return false;
          const d = new Date(dateStr);
          const dayUTC = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate()
          );
          return dayUTC === todayUTC;
        };

        // Process holdings with day change calculation using previous_market_value
        console.log("🔍 Calculating daily performance changes...");
        const holdingsRows = positions
          .filter((holding) => holding && (holding.symbol || holding.symbol_id)) // CRITICAL: Filter out invalid holdings
          .map((holding) => {
            // CRITICAL: Extract symbol_id correctly from SnapTrade API structure
            // API structure: holding.symbol.id (position symbol ID) or holding.symbol.symbol.id (universal symbol ID)
            // We need to check BOTH to match existing holdings in database
            let symbolId = null;
            let universalSymbolId = null;
            let symbolObj = null;

            if (holding.symbol?.id) {
              // Primary: Use position symbol ID (holding.symbol.id)
              symbolId = holding.symbol.id;
              symbolObj = holding.symbol.symbol || holding.symbol;
              // Also extract universal symbol ID for matching
              universalSymbolId = holding.symbol.symbol?.id || null;
            } else if (holding.symbol?.symbol?.id) {
              // Fallback: Use universal symbol ID if position ID not available
              symbolId = holding.symbol.symbol.id;
              universalSymbolId = holding.symbol.symbol.id;
              symbolObj = holding.symbol.symbol;
            } else if (holding.symbol_id) {
              // Fallback: Direct symbol_id field
              symbolId = holding.symbol_id;
              symbolObj = holding.symbol;
            }

            // Extract symbol string
            const symbolString =
              symbolObj?.symbol ||
              symbolObj?.raw_symbol ||
              holding.ticker ||
              null;

            if (!symbolId) {
              console.warn(
                "⚠️ Warning: Could not extract symbol_id for holding:",
                symbolString || "unknown"
              );
            }

            const currentMarketValue =
              holding.units && holding.price
                ? holding.units * holding.price
                : null;

            // Find existing holding: match by symbol_id OR universal symbol ID OR symbol string
            const existingHolding = existingHoldings?.find(
              (eh) =>
                eh.symbol_id === symbolId ||
                eh.symbol_id === universalSymbolId ||
                (symbolString && eh.symbol === symbolString)
            );

            // CRITICAL: If we found an existing holding by symbol string but symbol_id doesn't match,
            // use the existing symbol_id from database to ensure upsert updates the correct row
            const finalSymbolId = existingHolding?.symbol_id || symbolId;

            // Day baseline logic:
            // - First sync ever: previous_market_value = current_market_value, day_change = 0
            // - New day: preserve previous day's baseline, calculate day_change vs previous day's end value
            // - Same day: preserve baseline, calculate day_change vs start of day
            const existingLastUpdated = existingHolding?.last_updated;
            const sameDay = isSameCalendarDayUTC(existingLastUpdated);
            const isFirstSyncEver = !existingHolding;

            // Get the baseline value (previous_market_value if exists, otherwise market_value as fallback)
            const dayBaseline =
              existingHolding?.previous_market_value ??
              existingHolding?.market_value ??
              null;

            // For day_change calculation:
            // - First sync ever: no change (0)
            // - New day: use previous day's baseline (preserve last day_change calculation)
            // - Same day: use start-of-day baseline
            const previousMarketValue = isFirstSyncEver
              ? null // First sync: no baseline yet
              : sameDay && dayBaseline != null
              ? dayBaseline // Same day: use start-of-day baseline
              : dayBaseline != null
              ? dayBaseline // New day: use previous day's baseline (preserve last calculation)
              : null;

            // For storage:
            // - First sync ever: set to current value (new baseline)
            // - New day: preserve previous baseline (don't reset)
            // - Same day: preserve baseline
            const previousMarketValueForStorage = isFirstSyncEver
              ? currentMarketValue // First sync: set new baseline
              : dayBaseline != null
              ? dayBaseline // Preserve existing baseline (same day OR new day)
              : currentMarketValue; // Fallback: use current value

            // Calculate day_change and day_change_percent
            let dayChange = null;
            let dayChangePercent = null;

            // CRITICAL: Preserve day_change if market_value hasn't changed (prevents overwriting with 0 on repeated syncs)
            const EPSILON = 0.01; // Small threshold for floating point comparison
            const existingMarketValue = existingHolding?.market_value;
            const isMarketValueUnchanged =
              existingMarketValue != null &&
              Number.isFinite(existingMarketValue) &&
              Number.isFinite(currentMarketValue) &&
              Math.abs(currentMarketValue - existingMarketValue) < EPSILON;

            if (isFirstSyncEver) {
              // First sync ever: no change
              dayChange = 0;
              dayChangePercent = 0;
            } else if (isMarketValueUnchanged) {
              // Market value unchanged: preserve existing day_change values
              dayChange = existingHolding?.day_change ?? null;
              dayChangePercent = existingHolding?.day_change_percent ?? null;
            } else if (
              previousMarketValue !== null &&
              previousMarketValue !== undefined &&
              currentMarketValue !== null &&
              Number.isFinite(currentMarketValue) &&
              Number.isFinite(previousMarketValue)
            ) {
              // Calculate change vs baseline (works for both same day and new day)
              dayChange = currentMarketValue - previousMarketValue;
              dayChangePercent =
                previousMarketValue !== 0
                  ? (dayChange / previousMarketValue) * 100
                  : 0;
            } else if (existingHolding?.day_change != null) {
              // New day but no baseline: preserve last known day_change
              dayChange = existingHolding.day_change;
              dayChangePercent = existingHolding.day_change_percent ?? 0;
            }

            // Enhanced logging for debugging day_change calculation
            if (isFirstSyncEver) {
              console.log(`➕ First sync for ${symbolString}:`, {
                current_market_value: currentMarketValue?.toFixed(2),
                day_change: "0.00",
                reason: "first sync ever - no baseline",
                price: holding.price,
                units: holding.units,
              });
            } else if (existingHolding) {
              if (isMarketValueUnchanged) {
                console.log(
                  `🔄 Market value unchanged for ${symbolString}, preserving day_change:`,
                  {
                    existing_market_value: existingMarketValue?.toFixed(2),
                    current_market_value: currentMarketValue?.toFixed(2),
                    preserved_day_change: dayChange?.toFixed(2),
                    preserved_day_change_percent:
                      dayChangePercent?.toFixed(2) + "%",
                  }
                );
              } else if (sameDay && dayChange !== null) {
                console.log(`💰 Day change for ${symbolString} (same day):`, {
                  previous_market_value: dayBaseline?.toFixed(2),
                  current_market_value: currentMarketValue?.toFixed(2),
                  day_change: dayChange?.toFixed(2),
                  day_change_percent: dayChangePercent?.toFixed(2) + "%",
                  same_day: sameDay,
                  previous_price: existingHolding.price,
                  current_price: holding.price,
                });
              } else if (!sameDay && dayChange !== null) {
                console.log(`📅 Day change for ${symbolString} (new day):`, {
                  previous_market_value: dayBaseline?.toFixed(2),
                  current_market_value: currentMarketValue?.toFixed(2),
                  day_change: dayChange?.toFixed(2),
                  day_change_percent: dayChangePercent?.toFixed(2) + "%",
                  reason:
                    "new day - using previous day's baseline (preserving last day_change)",
                  previous_price: existingHolding.price,
                  current_price: holding.price,
                });
              } else if (
                dayChange !== null &&
                existingHolding.day_change != null
              ) {
                console.log(`➡️ Preserved day_change for ${symbolString}:`, {
                  preserved_day_change: dayChange?.toFixed(2),
                  reason: "no baseline available, using last known value",
                });
              } else {
                console.log(
                  `⚠️ Cannot calculate day_change for ${symbolString}:`,
                  {
                    previous_market_value: dayBaseline,
                    current_market_value: currentMarketValue,
                    same_day: sameDay,
                    reason:
                      dayBaseline == null ? "no baseline" : "missing data",
                  }
                );
              }
            }

            return {
              user_id: connection.user_id,
              snaptrade_user_id: connection.snaptrade_user_id,
              account_id: accountId,
              symbol_id: finalSymbolId,
              symbol: symbolString,
              description: symbolObj?.description || null,
              currency_code: holding.currency?.code || "USD",
              exchange_code: symbolObj?.exchange?.code || null,
              exchange_name: symbolObj?.exchange?.name || null,
              security_type: symbolObj?.type?.description || null,
              units: holding.units || 0,
              price: holding.price,
              market_value: currentMarketValue,
              previous_market_value: previousMarketValueForStorage,
              average_purchase_price: holding.average_purchase_price,
              total_cost_basis:
                holding.units && holding.average_purchase_price
                  ? holding.units * holding.average_purchase_price
                  : null,
              unrealized_pl: holding.open_pnl,
              day_change: dayChange,
              day_change_percent: dayChangePercent,
              is_active: true,
              last_updated: new Date().toISOString(),
            };
          })
          .filter((h) => h.symbol_id !== null); // CRITICAL: Filter out holdings without valid symbol_id

        // CRITICAL: Double-check connection is still active before upserting
        // This prevents reactivating holdings for deleted accounts
        const { data: connectionCheck } = await supabase
          .from("snaptrade_connections")
          .select("is_active, connection_status")
          .eq("user_id", connection.user_id)
          .eq("account_id", accountId)
          .single();

        if (
          !connectionCheck ||
          !connectionCheck.is_active ||
          connectionCheck.connection_status === "disabled"
        ) {
          console.log("⚠️ Connection is inactive - skipping holdings upsert to prevent reactivation");
          // Skip holdings upsert - connection was deleted
          holdingsSynced = true;
        } else {
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
          } catch (holdingsUpsertErr) {
            console.error("❌ Error during holdings upsert:", holdingsUpsertErr);
            throw holdingsUpsertErr;
          }

          // CRITICAL: Mark holdings as inactive if they're no longer in the API response
          // This handles the case where stocks are sold
          // SAFETY: Only run this AFTER successful upsert and only if we have valid symbol_ids
          // Also check connection is still active before marking holdings inactive
          const { data: connectionCheck2 } = await supabase
            .from("snaptrade_connections")
            .select("is_active, connection_status")
            .eq("user_id", connection.user_id)
            .eq("account_id", accountId)
            .single();

          if (
            connectionCheck2 &&
            connectionCheck2.is_active &&
            connectionCheck2.connection_status !== "disabled" &&
            holdingsRows.length > 0
          ) {
            // CRITICAL: Wait a moment for upsert to fully commit to database
            await new Promise((resolve) => setTimeout(resolve, 500));

            console.log("🔄 Checking for sold holdings to mark as inactive...");

            // Get all symbol identifiers from the API response (these are the ACTIVE holdings)
            // We need to match by BOTH symbol_id AND symbol string to handle ID mismatches
            const activeSymbolIds = new Set(
              holdingsRows
                .map((h) => h.symbol_id)
                .filter((id) => id !== null && id !== undefined && id !== "")
            );
            const activeSymbols = new Set(
              holdingsRows
                .map((h) => h.symbol)
                .filter((s) => s !== null && s !== undefined && s !== "")
            );

            console.log(
              `📊 Found ${activeSymbolIds.size} active holdings in API response (by ID):`,
              Array.from(activeSymbolIds).slice(0, 5).join(", ") +
                (activeSymbolIds.size > 5 ? "..." : "")
            );
            console.log(
              `📊 Found ${activeSymbols.size} active holdings in API response (by symbol):`,
              Array.from(activeSymbols).slice(0, 5).join(", ") +
                (activeSymbols.size > 5 ? "..." : "")
            );

            // SAFETY CHECK: Don't proceed if we have no valid identifiers
            if (activeSymbolIds.size === 0 && activeSymbols.size === 0) {
              console.error(
                "❌ CRITICAL: No valid symbol_ids or symbols found in API response - skipping deactivation to prevent data loss"
              );
              console.log(
                "🔍 Debug - holdingsRows sample:",
                JSON.stringify(holdingsRows.slice(0, 2), null, 2)
              );
            } else {
              // Get all currently active holdings from database (AFTER upsert)
              const { data: allActiveHoldings, error: fetchError } =
                await supabase
                  .from("investment_holdings")
                  .select("symbol_id, symbol")
                  .eq("user_id", connection.user_id)
                  .eq("snaptrade_user_id", connection.snaptrade_user_id)
                  .eq("account_id", accountId)
                  .eq("is_active", true);

              if (fetchError) {
                console.error("❌ Error fetching active holdings:", fetchError);
                console.error("⚠️ SKIPPING deactivation to prevent data loss");
              } else if (allActiveHoldings && allActiveHoldings.length > 0) {
                console.log(
                  `📊 Found ${allActiveHoldings.length} active holdings in database`
                );

                // Find holdings that are in DB but NOT in API response (sold stocks)
                // Match by BOTH symbol_id AND symbol string to handle ID mismatches
                const soldHoldings = allActiveHoldings.filter((h) => {
                  if (!h.symbol_id && !h.symbol) return false;

                  // Check if holding exists in API by symbol_id OR symbol string
                  const existsById =
                    h.symbol_id && activeSymbolIds.has(h.symbol_id);
                  const existsBySymbol =
                    h.symbol && activeSymbols.has(h.symbol);

                  // If it exists by either identifier, it's NOT sold
                  return !existsById && !existsBySymbol;
                });

                // SAFETY CHECK: Don't deactivate if it would affect ALL holdings
                if (
                  soldHoldings.length === allActiveHoldings.length &&
                  activeSymbolIds.size > 0
                ) {
                  console.error(
                    "❌ CRITICAL SAFETY CHECK FAILED: Would deactivate ALL holdings!"
                  );
                  console.error("🔍 Debug info:", {
                    activeSymbolIdsCount: activeSymbolIds.size,
                    activeSymbolIdsSample: Array.from(activeSymbolIds).slice(
                      0,
                      3
                    ),
                    dbHoldingsCount: allActiveHoldings.length,
                    dbHoldingsSample: allActiveHoldings
                      .slice(0, 3)
                      .map((h) => ({
                        symbol: h.symbol,
                        symbol_id: h.symbol_id,
                      })),
                  });
                  console.error(
                    "⚠️ ABORTING deactivation to prevent data loss - symbol_id mismatch detected"
                  );
                } else if (soldHoldings.length > 0) {
                  console.log(
                    `🔴 Found ${soldHoldings.length} sold holdings to deactivate:`,
                    soldHoldings
                      .map((h) => `${h.symbol} (${h.symbol_id})`)
                      .join(", ")
                  );

                  const soldSymbolIds = soldHoldings
                    .map((h) => h.symbol_id)
                    .filter((id) => id);
                  const { error: deactivateError } = await supabase
                    .from("investment_holdings")
                    .update({
                      is_active: false,
                      last_updated: new Date().toISOString(),
                    })
                    .eq("user_id", connection.user_id)
                    .eq("snaptrade_user_id", connection.snaptrade_user_id)
                    .eq("account_id", accountId)
                    .in("symbol_id", soldSymbolIds);

                  if (deactivateError) {
                    console.error(
                      "❌ Error marking sold holdings as inactive:",
                      deactivateError
                    );
                  } else {
                    console.log(
                      `✅ Successfully marked ${soldSymbolIds.length} sold holdings as inactive`
                    );
                  }
                } else {
                  console.log(
                    "✅ No sold holdings found - all holdings are still active"
                  );
                }
              } else {
                console.log(
                  "ℹ️ No active holdings found in database to compare"
                );
              }
            }
          } else {
            console.log("⚠️ Connection is inactive - skipping holdings deactivation check");
          }
          // SAFETY: Removed automatic deactivation when holdingsRows.length === 0
          // This could happen if API returns empty array temporarily - better to preserve existing data
          holdingsSynced = true;
        }
      } else {
        console.log("ℹ️ No holdings data to sync");
        // SAFETY: Don't automatically mark all holdings as inactive if positions array is empty
        // This could be a temporary API issue - better to leave holdings as-is
        console.log(
          "⚠️ No positions found in API response - keeping existing holdings active (may be temporary API issue)"
        );
        holdingsSynced = true; // No data is not an error
      }
    } catch (error) {
      console.error("❌ Error syncing holdings:", error);
      syncErrors.push(`Holdings sync failed: ${error.message}`);
    }

    // Final recalculation from database holdings to ensure accuracy
    console.log("🔄 Final recalculation of portfolio metrics from database...");
    await recalculatePortfolioMetricsFromDatabase(
      connection.user_id,
      connection.snaptrade_user_id,
      accountId
    );

    // CRITICAL: Only update last_synced_at if sync completed successfully
    // This ensures we don't mark stale data as "fresh" if sync failed
    const { error: updateError } = await supabase
      .from("snaptrade_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("snaptrade_user_id", connection.snaptrade_user_id)
      .eq("account_id", accountId);

    if (updateError) {
      console.error(
        "⚠️ Failed to update last_synced_at (but sync completed):",
        updateError
      );
      // Don't fail the whole sync if timestamp update fails
    } else {
      console.log("✅ Updated last_synced_at timestamp");
    }

    // Return appropriate status based on sync results
    if (syncErrors.length > 0) {
      console.warn(
        `⚠️ SnapTrade sync completed with ${syncErrors.length} error(s):`,
        syncErrors
      );
      return res.status(200).json({
        success: true,
        message: "Investments synced with warnings",
        warnings: syncErrors,
        balancesSynced,
        holdingsSynced,
      });
    }

    console.log("✅ SnapTrade sync completed successfully");
    return res.status(200).json({
      success: true,
      message: "Investments synced successfully",
      balancesSynced,
      holdingsSynced,
    });
  } catch (error) {
    console.error("❌ SnapTrade sync error:", error);

    // CRITICAL: Don't update last_synced_at on error - data is still stale
    // This ensures auto-sync will retry next time

    // Check if this is a 402 error (disabled connection)
    if (error.status === 402 || error.response?.status === 402) {
      console.log(
        "🔴 Sync failed due to disabled connection, updating database..."
      );

      // Update database to mark connection as disabled
      try {
        const { data: connection } = await supabase
          .from("snaptrade_connections")
          .select("user_id")
          .eq("account_id", accountId)
          .single();

        if (connection) {
          await supabase
            .from("snaptrade_connections")
            .update({
              is_active: false,
              connection_status: "disabled",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", connection.user_id)
            .eq("account_id", accountId);
        }
      } catch (dbError) {
        console.error("❌ Failed to update connection status:", dbError);
      }

      return res.status(402).json({
        error: "Connection is disabled",
        code: "CONNECTION_DISABLED",
        message:
          "Your investment account connection has been disabled. Please reconnect your account to continue.",
        requiresReconnect: true,
      });
    }

    throw error;
  }
}

async function handleSnapTradeRefresh(res, userId, accountId) {
  try {
    console.log("🔄 Starting SnapTrade manual refresh for:", {
      userId,
      accountId,
    });

    // Get connection details including connection_id and status
    const { data: connection, error: connErr } = await supabase
      .from("snaptrade_connections")
      .select(
        "user_id, snaptrade_user_id, user_secret, connection_id, connection_status, is_active"
      )
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .single();

    if (connErr || !connection) {
      console.error("SnapTrade connection lookup error:", connErr);
      throw new Error("SnapTrade connection not found");
    }

    if (!connection.connection_id) {
      throw new Error(
        "Connection ID (authorization_id) not found. Please reconnect your account."
      );
    }

    // Use shared SnapTrade SDK instance

    // STEP 1: Check actual connection status from SnapTrade API before attempting refresh
    console.log("🔍 Checking connection status from SnapTrade API...");
    try {
      const connectionDetailsResponse =
        await snaptrade.connections.detailBrokerageAuthorization({
          authorizationId: connection.connection_id,
          userId: connection.snaptrade_user_id,
          userSecret: connection.user_secret,
        });

      const connectionDetails = connectionDetailsResponse.data;
      console.log("📊 Connection details from SnapTrade:", {
        disabled: connectionDetails.disabled,
        disabled_date: connectionDetails.disabled_date,
        connection_id: connection.connection_id,
      });

      // If connection is disabled in SnapTrade, update our DB and return error
      if (connectionDetails.disabled === true) {
        console.log(
          "🔴 Connection is disabled in SnapTrade, updating database..."
        );

        // Update our database to reflect disabled status
        await supabase
          .from("snaptrade_connections")
          .update({
            is_active: false,
            connection_status: "disabled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("account_id", accountId);

        console.log("✅ Database updated with disabled status");

        return res.status(402).json({
          error: "Connection is disabled",
          code: "CONNECTION_DISABLED",
          message:
            "Your investment account connection has been disabled. Please reconnect your account to continue.",
          requiresReconnect: true,
          connectionId: connection.connection_id,
          disabledDate: connectionDetails.disabled_date,
        });
      }

      console.log("✅ Connection is active, proceeding with refresh...");
    } catch (statusCheckError) {
      console.error("⚠️ Error checking connection status:", statusCheckError);

      // Check if this is a 402 error (disabled connection)
      if (
        statusCheckError.status === 402 ||
        statusCheckError.response?.status === 402
      ) {
        console.log(
          "🔴 Connection is disabled (detected via 402 error), updating database..."
        );

        // Update database to reflect disabled status
        await supabase
          .from("snaptrade_connections")
          .update({
            is_active: false,
            connection_status: "disabled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("account_id", accountId);

        return res.status(402).json({
          error: "Connection is disabled",
          code: "CONNECTION_DISABLED",
          message:
            "Your investment account connection has been disabled. Please reconnect your account to continue.",
          requiresReconnect: true,
          connectionId: connection.connection_id,
        });
      }

      // For other errors during status check, log but continue with refresh attempt
      console.warn(
        "⚠️ Could not verify connection status, attempting refresh anyway..."
      );
    }

    // STEP 2: Also check our database status (in case webhook already updated it)
    if (
      !connection.is_active ||
      connection.connection_status === "disabled" ||
      connection.connection_status === "error"
    ) {
      return res.status(402).json({
        error: "Connection is disabled",
        code: "CONNECTION_DISABLED",
        message:
          "Your investment account connection has been disabled. Please reconnect your account to continue.",
        requiresReconnect: true,
        connectionId: connection.connection_id,
      });
    }

    // STEP 3: Attempt refresh
    console.log(
      `🔄 Calling SnapTrade refresh for authorization: ${connection.connection_id}`
    );
    const refreshResponse =
      await snaptrade.connections.refreshBrokerageAuthorization({
        authorizationId: connection.connection_id,
        userId: connection.snaptrade_user_id,
        userSecret: connection.user_secret,
      });

    console.log(
      "✅ SnapTrade refresh triggered successfully:",
      refreshResponse.data
    );

    return res.status(200).json({
      success: true,
      message: "Refresh triggered successfully. Data will update shortly.",
      detail: refreshResponse.data?.detail,
    });
  } catch (error) {
    console.error("❌ SnapTrade refresh error:", error);

    // Check if this is a 402 error indicating disabled connection
    if (error.status === 402 || error.response?.status === 402) {
      console.log(
        "🔴 Detected disabled connection via 402 error, updating database..."
      );

      // Update database to mark connection as disabled
      try {
        await supabase
          .from("snaptrade_connections")
          .update({
            is_active: false,
            connection_status: "disabled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("account_id", accountId);

        console.log("✅ Database updated with disabled status");
      } catch (dbError) {
        console.error(
          "❌ Failed to update database with disabled status:",
          dbError
        );
      }

      return res.status(402).json({
        error: "Connection is disabled",
        code: "CONNECTION_DISABLED",
        message:
          "Your investment account connection has been disabled. Please reconnect your account to continue.",
        requiresReconnect: true,
      });
    }

    return res.status(500).json({
      error: error.message || "Failed to trigger refresh",
    });
  }
}

async function handleSnapTradeCheckStatus(res, userId, accountId) {
  try {
    console.log("🔍 Checking SnapTrade connection status:", {
      userId,
      accountId,
    });

    // Get connection from DB
    const { data: connection, error: connErr } = await supabase
      .from("snaptrade_connections")
      .select(
        "user_id, snaptrade_user_id, user_secret, connection_id, connection_status, is_active, account_id"
      )
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .single();

    if (connErr || !connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    // Try to fetch accounts - if this fails, connection is likely disabled
    let actualStatus = "active";
    let isActuallyActive = true;

    try {
      // Use shared SnapTrade SDK instance

      // Try to list accounts - this will fail if connection is disabled
      await snaptrade.accountInformation.listUserAccounts({
        userId: connection.snaptrade_user_id,
        userSecret: connection.user_secret,
      });

      console.log("✅ Connection is active in SnapTrade");
    } catch (apiError) {
      console.log("🔴 Connection check failed:", apiError.message);

      // Check if error indicates disabled connection
      if (
        apiError.message?.includes("disabled") ||
        apiError.status === 402 ||
        apiError.response?.status === 402 ||
        apiError.code === 3003
      ) {
        actualStatus = "disabled";
        isActuallyActive = false;
        console.log("🔴 Connection is disabled in SnapTrade");
      } else {
        // Some other error - don't change status
        console.log(
          "⚠️ Connection check error (not disabled):",
          apiError.message
        );
      }
    }

    // Update DB if status differs
    const statusChanged =
      connection.is_active !== isActuallyActive ||
      connection.connection_status !== actualStatus;

    if (statusChanged) {
      console.log("🔄 Updating connection status in DB:", {
        old: {
          is_active: connection.is_active,
          status: connection.connection_status,
        },
        new: { is_active: isActuallyActive, status: actualStatus },
      });

      await supabase
        .from("snaptrade_connections")
        .update({
          is_active: isActuallyActive,
          connection_status: actualStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("account_id", accountId);

      console.log("✅ Connection status updated in DB");
    }

    return res.status(200).json({
      success: true,
      dbStatus: {
        is_active: connection.is_active,
        connection_status: connection.connection_status,
      },
      actualStatus: {
        is_active: isActuallyActive,
        connection_status: actualStatus,
      },
      statusChanged,
      message: statusChanged
        ? "Connection status updated"
        : "Connection status matches",
    });
  } catch (error) {
    console.error("❌ Error checking connection status:", error);
    return res.status(500).json({
      error: error.message || "Failed to check connection status",
    });
  }
}

async function handleSnapTradeGetConnectionDetails(res, userId, accountId) {
  try {
    console.log("🔍 Getting SnapTrade connection details:", {
      userId,
      accountId,
    });

    // Get connection from DB
    const { data: connection, error: connErr } = await supabase
      .from("snaptrade_connections")
      .select(
        "user_id, snaptrade_user_id, user_secret, connection_id, connection_status, is_active"
      )
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .single();

    if (connErr || !connection) {
      return res.status(404).json({ error: "Connection not found" });
    }

    if (!connection.connection_id) {
      return res.status(400).json({
        error: "Connection ID not found",
        message: "Please reconnect your account to continue.",
      });
    }

    // Use shared SnapTrade SDK instance

    try {
      // Fetch connection details from SnapTrade API
      const connectionDetailsResponse =
        await snaptrade.connections.detailBrokerageAuthorization({
          authorizationId: connection.connection_id,
          userId: connection.snaptrade_user_id,
          userSecret: connection.user_secret,
        });

      const connectionDetails = connectionDetailsResponse.data;
      console.log("📊 Connection details from SnapTrade:", {
        disabled: connectionDetails.disabled,
        disabled_date: connectionDetails.disabled_date,
        name: connectionDetails.name,
        type: connectionDetails.type,
      });

      // Update database if status differs
      if (connectionDetails.disabled !== !connection.is_active) {
        console.log("🔄 Updating database with SnapTrade status...");
        await supabase
          .from("snaptrade_connections")
          .update({
            is_active: !connectionDetails.disabled,
            connection_status: connectionDetails.disabled
              ? "disabled"
              : "active",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("account_id", accountId);

        console.log("✅ Database updated");
      }

      // If disabled, return 402
      if (connectionDetails.disabled) {
        return res.status(402).json({
          error: "Connection is disabled",
          code: "CONNECTION_DISABLED",
          message:
            "Your investment account connection has been disabled. Please reconnect your account to continue.",
          requiresReconnect: true,
          connectionId: connection.connection_id,
          disabled: true,
          disabledDate: connectionDetails.disabled_date,
          details: connectionDetails,
        });
      }

      return res.status(200).json({
        success: true,
        disabled: false,
        connectionId: connection.connection_id,
        details: connectionDetails,
      });
    } catch (apiError) {
      console.error("❌ Error fetching connection details:", apiError);

      // Check if this is a 402 error (disabled connection)
      if (apiError.status === 402 || apiError.response?.status === 402) {
        console.log("🔴 Connection is disabled (detected via 402 error)");

        // Update database
        await supabase
          .from("snaptrade_connections")
          .update({
            is_active: false,
            connection_status: "disabled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("account_id", accountId);

        return res.status(402).json({
          error: "Connection is disabled",
          code: "CONNECTION_DISABLED",
          message:
            "Your investment account connection has been disabled. Please reconnect your account to continue.",
          requiresReconnect: true,
          connectionId: connection.connection_id,
          disabled: true,
        });
      }

      throw apiError;
    }
  } catch (error) {
    console.error("❌ Error getting connection details:", error);
    return res.status(500).json({
      error: error.message || "Failed to get connection details",
    });
  }
}

async function handleSnapTradeRemoveBrokerage(res, userId, accountId) {
  try {
    console.log("🗑️ Removing SnapTrade brokerage authorization:", {
      userId,
      accountId,
    });

    // Get connection from DB
    const { data: connection, error: connErr } = await supabase
      .from("snaptrade_connections")
      .select(
        "user_id, snaptrade_user_id, user_secret, connection_id, connection_status, is_active"
      )
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .single();

    if (connErr || !connection) {
      console.error("SnapTrade connection lookup error:", connErr);
      return res.status(404).json({ error: "SnapTrade connection not found" });
    }

    // CRITICAL: Additional security check
    if (connection.user_id !== userId) {
      console.error(
        "❌ Security violation: User attempting to remove another user's account"
      );
      return res.status(403).json({
        error: "Unauthorized: Cannot remove this account",
      });
    }

    // Check if connection_id exists
    if (!connection.connection_id) {
      return res.status(400).json({
        error: "Connection ID not found",
        message: "Cannot remove account without connection ID. Please reconnect your account first.",
      });
    }

    // Use shared SnapTrade SDK instance to remove brokerage authorization
    try {
      const removeResponse = await snaptrade.connections.removeBrokerageAuthorization(
        {
          authorizationId: connection.connection_id,
          userId: connection.snaptrade_user_id,
          userSecret: connection.user_secret,
        }
      );

      console.log("✅ Brokerage authorization removed from SnapTrade:", removeResponse.data);

      // CRITICAL: Delete all investment data BEFORE marking connection as inactive
      // This prevents sync operations from reactivating deleted holdings
      console.log("🗑️ Cleaning up investment data for account:", accountId);
      
      // Delete investment holdings
      try {
        const { error: holdingsDeleteError } = await supabase
          .from("investment_holdings")
          .delete()
          .eq("user_id", userId)
          .eq("account_id", accountId);

        if (holdingsDeleteError) {
          console.warn("⚠️ Failed to delete investment holdings:", holdingsDeleteError);
        } else {
          console.log("✅ Investment holdings deleted");
        }
      } catch (holdingsErr) {
        console.warn("⚠️ Error deleting investment holdings:", holdingsErr);
      }

      // Delete investment balances
      try {
        const { error: balancesDeleteError } = await supabase
          .from("investment_balances")
          .delete()
          .eq("user_id", userId)
          .eq("account_id", accountId);

        if (balancesDeleteError) {
          console.warn("⚠️ Failed to delete investment balances:", balancesDeleteError);
        } else {
          console.log("✅ Investment balances deleted");
        }
      } catch (balancesErr) {
        console.warn("⚠️ Error deleting investment balances:", balancesErr);
      }

      // Delete investment options
      try {
        const { error: optionsDeleteError } = await supabase
          .from("investment_options")
          .delete()
          .eq("user_id", userId)
          .eq("account_id", accountId);

        if (optionsDeleteError) {
          console.warn("⚠️ Failed to delete investment options:", optionsDeleteError);
        } else {
          console.log("✅ Investment options deleted");
        }
      } catch (optionsErr) {
        console.warn("⚠️ Error deleting investment options:", optionsErr);
      }

      // Update database to mark connection as inactive/deleted
      const { error: updateError } = await supabase
        .from("snaptrade_connections")
        .update({
          is_active: false,
          connection_status: "disabled",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("account_id", accountId);

      if (updateError) {
        console.error("⚠️ Failed to update database after removal:", updateError);
        // Don't fail the request - the removal was successful on SnapTrade side
      } else {
        console.log("✅ Database updated - connection marked as removed");
      }

      // Also delete the investment account from the accounts table if it exists
      try {
        const { error: accountDeleteError } = await supabase
          .from("accounts")
          .delete()
          .eq("account_id", accountId);

        if (accountDeleteError) {
          console.warn("⚠️ Failed to delete account from accounts table:", accountDeleteError);
          // Don't fail - this is a cleanup operation
        } else {
          console.log("✅ Investment account removed from accounts table");
        }
      } catch (accountDeleteErr) {
        console.warn("⚠️ Error deleting account from accounts table:", accountDeleteErr);
        // Continue anyway
      }

      return res.status(200).json({
        success: true,
        message: "Investment account removed successfully",
        data: removeResponse.data,
      });
    } catch (apiError) {
      console.error("❌ Error removing brokerage authorization:", apiError);

      // Check if it's a 404 (already removed) or other error
      if (apiError.status === 404 || apiError.response?.status === 404) {
        console.log("ℹ️ Connection already removed from SnapTrade, cleaning up database...");
        
        // CRITICAL: Delete all investment data even if already removed from SnapTrade
        console.log("🗑️ Cleaning up investment data for account:", accountId);
        
        // Delete investment holdings
        try {
          await supabase
            .from("investment_holdings")
            .delete()
            .eq("user_id", userId)
            .eq("account_id", accountId);
          console.log("✅ Investment holdings deleted");
        } catch (holdingsErr) {
          console.warn("⚠️ Error deleting investment holdings:", holdingsErr);
        }

        // Delete investment balances
        try {
          await supabase
            .from("investment_balances")
            .delete()
            .eq("user_id", userId)
            .eq("account_id", accountId);
          console.log("✅ Investment balances deleted");
        } catch (balancesErr) {
          console.warn("⚠️ Error deleting investment balances:", balancesErr);
        }

        // Delete investment options
        try {
          await supabase
            .from("investment_options")
            .delete()
            .eq("user_id", userId)
            .eq("account_id", accountId);
          console.log("✅ Investment options deleted");
        } catch (optionsErr) {
          console.warn("⚠️ Error deleting investment options:", optionsErr);
        }

        // Delete account from accounts table
        try {
          await supabase
            .from("accounts")
            .delete()
            .eq("account_id", accountId);
          console.log("✅ Investment account removed from accounts table");
        } catch (accountErr) {
          console.warn("⚠️ Error deleting account:", accountErr);
        }
        
        // Update database anyway since it's already removed on SnapTrade side
        await supabase
          .from("snaptrade_connections")
          .update({
            is_active: false,
            connection_status: "disabled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .eq("account_id", accountId);

        return res.status(200).json({
          success: true,
          message: "Investment account was already removed",
        });
      }

      throw apiError;
    }
  } catch (error) {
    console.error("❌ Error removing brokerage authorization:", error);
    return res.status(500).json({
      error: error.message || "Failed to remove brokerage authorization",
    });
  }
}
