// app/utils/snaptrade.ts
import AppStorage from '@/src/utils/storage/storage';
import { supabase } from '@/src/lib/supabase/supabase';
import logger from '@/src/utils/core/logger';
import { authenticatedFetch } from '@/src/utils/auth/authToken';
import { API_BASE_URL } from '@/src/utils/core/apiUrl';

const BASE_URL = API_BASE_URL;

type ParsedApiResponse = {
  data: any;
  rawText: string;
  contentType: string;
};

const parseApiResponse = async (
  res: Response,
  context: string,
): Promise<ParsedApiResponse> => {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const rawText = await res.text();

  if (!rawText) {
    return { data: {}, rawText: "", contentType };
  }

  if (contentType.includes("application/json")) {
    try {
      return { data: JSON.parse(rawText), rawText, contentType };
    } catch (parseError: any) {
      logger.error(`❌ ${context}: malformed JSON response`, {
        status: res.status,
        contentType,
        preview: rawText.slice(0, 200),
        parseError: parseError?.message,
      });
      throw new Error(
        `${context}: server returned malformed JSON (HTTP ${res.status})`,
      );
    }
  }

  // Some proxies omit content-type even when body is JSON.
  try {
    return { data: JSON.parse(rawText), rawText, contentType };
  } catch {
    return { data: null, rawText, contentType };
  }
};

const buildApiError = (
  res: Response,
  data: any,
  rawText: string,
  fallbackMessage: string,
): Error => {
  const jsonMessage =
    data && typeof data === "object"
      ? data.message || data.error || data.detail
      : null;
  const snippet = rawText?.trim()?.slice(0, 200) || "";
  const isHtml = snippet.startsWith("<");
  const message =
    jsonMessage ||
    (isHtml
      ? `Server returned HTML instead of JSON (HTTP ${res.status}). Please try again.`
      : snippet || fallbackMessage);

  const apiError: any = new Error(message);
  apiError.statusCode = res.status;
  apiError.rawResponse = snippet;

  if (data && typeof data === "object") {
    if (data.code) apiError.code = data.code;
    if (data.requiresReconnect !== undefined) {
      apiError.requiresReconnect = data.requiresReconnect;
    }
    if (data.connectionId) apiError.connectionId = data.connectionId;
  }

  return apiError;
};

// Storage keys for SnapTrade credentials
const SNAPTRADE_CREDENTIALS_KEY = 'snaptrade_credentials';
const SNAPTRADE_CREDENTIALS_VALIDITY_KEY = 'snaptrade_credentials_validity';

// === Storage Helper Functions ===
const getSnaptradeCredentials = async () => {
  try {
    const credentials = AppStorage.getItemSync(SNAPTRADE_CREDENTIALS_KEY);
    return credentials ? JSON.parse(credentials) : null;
  } catch (error) {
    logger.error('Error getting SnapTrade credentials:', error);
    return null;
  }
};

const setSnaptradeCredentials = async (credentials: any) => {
  try {
    // Store only non-sensitive metadata in AsyncStorage
    const safeCredentials = {
      userId: credentials.userId,
      accountId: credentials.accountId,
      // DO NOT store userSecret in AsyncStorage - it's stored securely in Vault
    };
    
    AppStorage.setItemSync(SNAPTRADE_CREDENTIALS_KEY, JSON.stringify(safeCredentials));
    // Set validity timestamp (24 hours from now)
    const validityTimestamp = Date.now() + (24 * 60 * 60 * 1000);
    AppStorage.setItemSync(SNAPTRADE_CREDENTIALS_VALIDITY_KEY, validityTimestamp.toString());
    
    logger.info("🔄 Storing SnapTrade credentials (userSecret excluded for security):", safeCredentials);
  } catch (error) {
    logger.error('Error setting SnapTrade credentials:', error);
  }
};

const clearSnaptradeCredentials = async () => {
  try {
    AppStorage.removeItemSync(SNAPTRADE_CREDENTIALS_KEY);
    AppStorage.removeItemSync(SNAPTRADE_CREDENTIALS_VALIDITY_KEY);
  } catch (error) {
    logger.error('Error clearing SnapTrade credentials:', error);
  }
};

const areSnaptradeCredentialsValid = async (): Promise<boolean> => {
  try {
    const validityTimestamp = AppStorage.getItemSync(SNAPTRADE_CREDENTIALS_VALIDITY_KEY);
    if (!validityTimestamp) return false;
    
    const validity = parseInt(validityTimestamp);
    const now = Date.now();
    
    if (now > validity) {
      // Credentials expired, clear them
      await clearSnaptradeCredentials();
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Error checking SnapTrade credentials validity:', error);
    return false;
  }
};

// === Call SnapTrade API ===
const callSnapTradeAPI = async (mode: string, params: any = {}) => {
  try {
    logger.info(`🔄 Calling SnapTrade API with mode: ${mode}`, params);
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid_management`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: mode,
        ...params
      }),
    });
    
    const { data, rawText } = await parseApiResponse(
      res,
      `SnapTrade API (${mode})`,
    );
    if (!res.ok) {
      throw buildApiError(
        res,
        data,
        rawText,
        `Failed to call SnapTrade API with mode: ${mode}`,
      );
    }
    
    logger.info(`✅ SnapTrade API call successful for mode: ${mode}`, data);
    return data;
  } catch (error) {
    logger.error(`❌ SnapTrade API call failed for mode: ${mode}:`, error);
    throw error;
  }
};

// === Handle SnapTrade Register ===
const handleSnapTradeRegister = async (userId: string) => {
  try {
    logger.info("🔄 Registering SnapTrade user:", userId);
    
    const response = await callSnapTradeAPI("snaptrade", { user_id: userId });
    
    logger.info("✅ SnapTrade user registered successfully:", response);
    return response;
  } catch (error) {
    logger.error("❌ Failed to register SnapTrade user:", error);
    throw error;
  }
};

// === Handle SnapTrade Login ===
export const handleSnapTradeLogin = async (
  userId: string, 
  userSecret: string, 
  broker?: string,
  reconnect?: string // Add reconnect parameter
) => {
  try {
    logger.info("🔄 Logging in SnapTrade user:", userId, 
      broker ? `with broker: ${broker}` : "",
      reconnect ? `reconnecting: ${reconnect}` : ""
    );
    
    const params: any = { 
      userId: userId, 
      userSecret: userSecret 
    };
    
    // Add broker parameter if provided
    if (broker) {
      params.broker = broker;
    }
    
    // Add reconnect parameter if provided (for fixing disabled connections)
    if (reconnect) {
      params.reconnect = reconnect; // connection_id/authorization_id
    }
    
    const response = await callSnapTradeAPI("snaptrade", params);
    
    logger.info("✅ SnapTrade user logged in successfully:", response);
    return response;
  } catch (error) {
    logger.error("❌ Failed to login SnapTrade user:", error);
    throw error;
  }
};

// === Reconnect SnapTrade Connection (Fix Disabled Connection) ===
export const reconnectSnaptradeConnection = async (
  userId: string,
  userSecret: string,
  connectionId: string
) => {
  try {
    logger.info("🔧 Reconnecting SnapTrade connection:", { userId, connectionId });
    
    // Call login with reconnect parameter
    const response = await handleSnapTradeLogin(userId, userSecret, undefined, connectionId);
    
    logger.info("✅ SnapTrade reconnect initiated successfully");
    return response;
  } catch (error) {
    logger.error("❌ Failed to reconnect SnapTrade connection:", error);
    throw error;
  }
};

// === Register SnapTrade User ===
export const registerSnaptradeUser = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) {
    logger.error("❌ Authentication error in registerSnaptradeUser:", authError);
    throw new Error(`Authentication failed: ${authError.message}`);
  }
  
  if (!user?.id) {
    logger.error("❌ No authenticated user found in registerSnaptradeUser");
    throw new Error("User not authenticated. Please log in and try again.");
  }
  
  // Generate a new unique user ID for each SnapTrade registration
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const snaptradeUserId = `financify-${user.id}-${timestamp}-${randomSuffix}`;
  
  logger.info("🆔 Generated new SnapTrade user ID:", snaptradeUserId);
  
  return await handleSnapTradeRegister(snaptradeUserId);
};

// === Fetch SnapTrade Accounts ===
export const fetchSnaptradeAccounts = async (userId: string, userSecret: string) => {
  const res = await authenticatedFetch(`${BASE_URL}/api/plaid_management`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      mode: "snaptrade_accounts", 
      userId: userId,
      userSecret: userSecret 
    }),
  });
  const { data, rawText } = await parseApiResponse(
    res,
    "Fetch SnapTrade accounts",
  );
  if (!res.ok) {
    throw buildApiError(
      res,
      data,
      rawText,
      "Failed to fetch SnapTrade accounts",
    );
  }
  
  logger.info("✅ SnapTrade accounts fetched successfully: ", data);
  return data.accounts;
};

// === Get Stored SnapTrade Credentials ===
const getStoredSnaptradeCredentials = async () => {
  try {
    const credentials = await getSnaptradeCredentials();
    if (!credentials) {
      logger.info("ℹ️ No stored SnapTrade credentials found");
      return null;
    }
    
    // Check if credentials are still valid
    const isValid = await areSnaptradeCredentialsValid();
    if (!isValid) {
      logger.info("⚠️ Stored SnapTrade credentials have expired");
      await clearSnaptradeCredentials();
      return null;
    }
    
    logger.info("✅ Valid SnapTrade credentials found in storage");
    return credentials;
  } catch (error) {
    logger.error("❌ Failed to get stored SnapTrade credentials:", error);
    return null;
  }
};

// === Get SnapTrade Credentials with Database Fallback ===
export const getSnaptradeCredentialsWithFallback = async () => {
  try {
    logger.info("🔄 Getting SnapTrade credentials with fallback...");
    
    // Step 1: Try to get from AsyncStorage first
    logger.info("📱 Step 1: Checking AsyncStorage for credentials...");
    let credentials = await getStoredSnaptradeCredentials();
    
    if (credentials) {
      logger.info("✅ Step 1 SUCCESS: Using credentials from AsyncStorage");
      return credentials;
    }
    
    logger.info("❌ Step 1 FAILED: No valid credentials in AsyncStorage");
    
    // Step 2: Fallback to database
    logger.info("🗄️ Step 2: Checking Supabase database for credentials...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.error("❌ Step 2 FAILED: User not authenticated");
      return null;
    }
    
    // Note: We don't filter by is_active because we need credentials even for disabled connections
    // (to enable reconnection). The credentials (userId, accountId) are the same regardless of status.
    const { data: connections, error } = await supabase
      .from("snaptrade_connections")
      .select("snaptrade_user_id, account_id")
      .eq("user_id", user.id)
      // Removed .eq("is_active", true) - we need credentials even for disabled connections
      .order("last_synced_at", { ascending: false })
      .limit(1);
    
    if (error) {
      logger.error("❌ Step 2 FAILED: Error fetching credentials from database:", error);
      return null;
    }
    
    if (connections && connections.length > 0) {
      const connection = connections[0];
      credentials = {
        userId: connection.snaptrade_user_id,
        accountId: connection.account_id
      };
      
      // Store in AsyncStorage for future use (without userSecret for security)
      logger.info("💾 Caching credentials from database to AsyncStorage...");
      await setSnaptradeCredentials(credentials);
      logger.info("✅ Step 2 SUCCESS: Retrieved and cached credentials from database");
      return credentials;
    }
    
    logger.info("❌ Step 2 FAILED: No SnapTrade connections found in database");
    return null;
  } catch (error) {
    logger.error("❌ CRITICAL ERROR: Failed to get SnapTrade credentials with fallback:", error);
    return null;
  }
};

// === Refresh Expired Credentials ===
const refreshExpiredCredentials = async () => {
  try {
    logger.info("🔄 Refreshing expired credentials...");
    
    // Clear expired credentials from storage
    await clearSnaptradeCredentials();
    
    // Get fresh credentials from database
    const credentials = await getSnaptradeCredentialsWithFallback();
    
    if (credentials) {
      logger.info("✅ Successfully refreshed credentials from database");
      return credentials;
    } else {
      logger.warn("⚠️ No valid credentials found in database after refresh");
      return null;
    }
  } catch (error) {
    logger.error("❌ Failed to refresh expired credentials:", error);
    return null;
  }
};

// === Get SnapTrade UserSecret from Database ===
export const getSnaptradeUserSecretFromDB = async (userId: string, snaptradeUserId: string, accountId: string) => {
  try {
    logger.info("🔑 Retrieving userSecret from database...");
    
    // Note: We don't filter by is_active because we need userSecret even for disabled connections
    // (to enable reconnection). The userSecret is still valid even if the connection is disabled.
    const { data: connection, error } = await supabase
      .from("snaptrade_connections")
      .select("user_secret")
      .eq("user_id", userId)
      .eq("snaptrade_user_id", snaptradeUserId)
      .eq("account_id", accountId)
      // Removed .eq("is_active", true) - we need userSecret even for disabled connections
      .single();
    
    if (error || !connection?.user_secret) {
      logger.error("Error retrieving SnapTrade userSecret from database:", error);
      throw new Error(error?.message || "UserSecret not found in database");
    }
    
    logger.info("✅ UserSecret retrieved from database successfully");
    return connection.user_secret;
  } catch (error) {
    logger.error("❌ Failed to retrieve userSecret from database:", error);
    throw error;
  }
};

// === Clear SnapTrade Connection ===
export const clearSnaptradeConnection = async (): Promise<void> => {
  try {
    await clearSnaptradeCredentials();
    logger.info("✅ SnapTrade connection cleared");
  } catch (error) {
    logger.error("❌ Failed to clear SnapTrade connection:", error);
    throw error;
  }
};

// === Store SnapTrade Credentials Directly in Database ===
export const storeSnaptradeCredentials = async (
  userId: string,
  snaptradeUserId: string,
  accountId: string,
  userSecret: string,
  metadata?: any
) => {
  try {
    logger.info("🔄 Storing SnapTrade credentials directly in database...");
    
    // Extract connection_id from metadata (should be brokerage_authorization from account response)
    // The account response includes brokerage_authorization which is the connection_id
    let connectionId = metadata?.connection_id || metadata?.brokerage_authorization;
    
    if (!connectionId) {
      logger.warn("⚠️ No connection_id provided in metadata - will store without it");
      // Continue without connection_id - it can be updated later from webhook
    } else {
      logger.info("✅ Using connection_id from account response:", connectionId);
    }
    
    // Store directly in Supabase database
    const { data: connection, error } = await supabase
      .from("snaptrade_connections")
      .upsert({
        user_id: userId,
        snaptrade_user_id: snaptradeUserId,
        account_id: accountId,
        user_secret: userSecret,
        connection_id: connectionId || null, // Store connection_id if available
        brokerage_name: metadata?.brokerage_name || "Unknown",
        account_name: metadata?.account_name || "Investment Account",
        account_type: metadata?.account_type || "investment",
        is_active: true,
        connection_status: "active",
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id,snaptrade_user_id,account_id"
      })
      .select()
      .single();
    
    if (error) {
      logger.error("Database error storing SnapTrade credentials:", error);
      throw new Error(error.message || "Failed to store SnapTrade credentials in database");
    }
    
    // Also store locally for quick access (without userSecret for security)
    await setSnaptradeCredentials({
      userId: snaptradeUserId,
      accountId: accountId
      // Note: userSecret excluded from local storage for security
    });
    
    logger.info("✅ SnapTrade credentials stored directly in database");
    
    // Automatically populate investment account in main accounts table
    try {
      await populateInvestmentAccountsInDB();
      logger.info("✅ Investment account automatically populated in main accounts table");
    } catch (populateError) {
      logger.error("⚠️ Failed to automatically populate investment account (continuing anyway):", populateError);
      // Don't fail the whole operation if population fails
    }
    
    return { success: true, connection };
  } catch (error) {
    logger.error("❌ Failed to store SnapTrade credentials:", error);
    throw error;
  }
};

// === Check SnapTrade Connection Status ===
export const checkSnaptradeConnectionStatus = async (_userId: string, accountId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_check_status", 
        userId: user.id,
        accountId: accountId
      }),
    });
    
    const { data, rawText } = await parseApiResponse(
      res,
      "Check SnapTrade connection status",
    );
    if (!res.ok) {
      throw buildApiError(
        res,
        data,
        rawText,
        "Failed to check connection status",
      );
    }
    return data;
  } catch (error) {
    logger.error("❌ Failed to check connection status:", error);
    throw error;
  }
};

// === Get Connection Details from SnapTrade API ===
export const getSnaptradeConnectionDetails = async (_userId: string, accountId: string) => {
  try {
    logger.debug("🔍 Getting connection details from SnapTrade API...");
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_get_connection_details", 
        userId: user.id,
        accountId: accountId
      }),
    });
    
    const { data, rawText } = await parseApiResponse(
      res,
      "Get SnapTrade connection details",
    );
    
    // Handle 402 error (disabled connection)
    if (res.status === 402) {
      logger.warn("🔴 Connection is disabled:", data);
      return {
        disabled: true,
        requiresReconnect: true,
        connectionId: data?.connectionId,
        message:
          data?.message ||
          "Your investment account connection has been disabled. Please reconnect your account to continue.",
      };
    }
    
    if (!res.ok) {
      throw buildApiError(
        res,
        data,
        rawText,
        "Failed to get connection details",
      );
    }
    
    logger.info("✅ Connection details retrieved:", data);
    return data;
  } catch (error) {
    logger.error("❌ Failed to get connection details:", error);
    throw error;
  }
};

// === Sync SnapTrade Investments ===
export const syncSnaptradeInvestments = async (userId: string, accountId: string) => {
  try {
    logger.info("🔄 Syncing SnapTrade investments...");
    
    // First try to get credentials with fallback
    let credentials = await getSnaptradeCredentialsWithFallback();
    if (!credentials) {
      logger.warn("⚠️ No valid credentials found, attempting to refresh...");
      // Try to refresh expired credentials
      credentials = await refreshExpiredCredentials();
      if (!credentials) {
        throw new Error("No valid SnapTrade credentials found and refresh failed");
      }
    }
    
    logger.info("🔑 Using credentials for sync:", { 
      userId: credentials.userId, 
      accountId: credentials.accountId 
    });
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_sync", 
        userId: userId,
        accountId: accountId
      }),
    });
    const { data, rawText } = await parseApiResponse(
      res,
      "Sync SnapTrade investments",
    );
    if (!res.ok) {
      throw buildApiError(
        res,
        data,
        rawText,
        "Failed to sync SnapTrade investments",
      );
    }
    
    logger.info("✅ SnapTrade investments synced successfully");
    return data;
  } catch (error) {
    logger.error("❌ Failed to sync SnapTrade investments:", error);
    throw error;
  }
};

// === Recalculate Investment Balances from Active Holdings ===
export const recalculateInvestmentBalances = async (userId: string, accountId: string) => {
  try {
    logger.info("🔄 Recalculating investment balances from active holdings...");
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_recalculate", 
        userId: userId,
        accountId: accountId
      }),
    });
    const { data, rawText } = await parseApiResponse(
      res,
      "Recalculate investment balances",
    );
    if (!res.ok) {
      throw buildApiError(res, data, rawText, "Failed to recalculate balances");
    }
    
    logger.info("✅ Investment balances recalculated successfully");
    return data;
  } catch (error) {
    logger.error("❌ Failed to recalculate investment balances:", error);
    throw error;
  }
};

// === Remove SnapTrade Brokerage Authorization ===
export const removeSnaptradeBrokerage = async (userId: string, accountId: string) => {
  try {
    logger.info("🗑️ Removing SnapTrade brokerage authorization...");
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_remove_brokerage", 
        userId: userId,
        accountId: accountId
      }),
    });
    const { data, rawText } = await parseApiResponse(
      res,
      "Remove SnapTrade brokerage authorization",
    );
    if (!res.ok) {
      throw buildApiError(
        res,
        data,
        rawText,
        "Failed to remove brokerage authorization",
      );
    }
    
    logger.info("✅ SnapTrade brokerage authorization removed successfully");
    return data;
  } catch (error) {
    logger.error("❌ Failed to remove SnapTrade brokerage authorization:", error);
    throw error;
  }
};

// === Refresh SnapTrade Investments (Paid Endpoint) ===
export const refreshSnaptradeInvestments = async (userId: string, accountId: string) => {
  try {
    logger.info("🔄 Refreshing SnapTrade investments (paid endpoint)...");
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_refresh", 
        userId: userId,
        accountId: accountId
      }),
    });
    const { data, rawText } = await parseApiResponse(
      res,
      "Refresh SnapTrade investments",
    );
    
    // Check for 402 error (disabled connection)
    if (res.status === 402) {
      logger.error("🔴 Connection is disabled (402 error):", data);
      
      // Create a special error object with requiresReconnect flag
      const disabledError: any = new Error(
        data?.message || "Connection is disabled. Please reconnect your account.",
      );
      disabledError.code = data?.code || "CONNECTION_DISABLED";
      disabledError.requiresReconnect = data?.requiresReconnect || true;
      disabledError.connectionId = data?.connectionId;
      disabledError.statusCode = 402;
      
      throw disabledError;
    }
    
    if (!res.ok) {
      throw buildApiError(
        res,
        data,
        rawText,
        "Failed to refresh SnapTrade investments",
      );
    }
    
    logger.info("✅ SnapTrade investments refresh triggered successfully");
    return { success: true, ...data };
  } catch (error) {
    logger.error("❌ Failed to refresh SnapTrade investments:", error);
    throw error;
  }
};

// === Get SnapTrade Data from Database ===
export const getSnaptradeHoldingsFromDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return []; // Graceful: don't throw during logout race

    const { data, error } = await supabase
      .from("investment_holdings")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("market_value", { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    logger.error("❌ Failed to get SnapTrade holdings from DB:", error);
    throw error;
  }
};

export const getSnaptradeOptionsFromDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return []; // Graceful: don't throw during logout race

    const { data, error } = await supabase
      .from("investment_options")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("market_value", { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    logger.error("❌ Failed to get SnapTrade options from DB:", error);
    throw error;
  }
};

export const getSnaptradeBalancesFromDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return []; // Graceful: don't throw during logout race

    const { data, error } = await supabase
      .from("investment_balances")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_current", true)
      .order("last_updated", { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    logger.error("❌ Failed to get SnapTrade balances from DB:", error);
    throw error;
  }
};

// Get all investment connections (both Plaid and SnapTrade)
export const getAllInvestmentConnectionsFromDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return []; // Graceful: don't throw during logout race

    // Fetch both providers in parallel.
    const [
      { data: snaptradeConnections, error: snaptradeError },
      { data: plaidItems, error: plaidError },
    ] = await Promise.all([
      supabase
        .from("snaptrade_connections")
        .select("*")
        .eq("user_id", user.id)
        .order("last_synced_at", { ascending: false }),
      supabase
        .from("user_items")
        .select("item_id, institution_name, last_synced_at")
        .eq("user_id", user.id),
    ]);

    if (snaptradeError) {
      logger.error("Error fetching SnapTrade connections:", snaptradeError);
    }
    if (plaidError) {
      logger.error("Error fetching Plaid items:", plaidError);
    }

    // Build Plaid investment connections in bulk (avoid per-item N+1 queries).
    const plaidConnections: any[] = [];
    const validPlaidItemIds =
      plaidItems
        ?.map((item) => item.item_id)
        .filter((itemId): itemId is string => Boolean(itemId)) || [];

    if (validPlaidItemIds.length > 0) {
      const [
        { data: investmentAccounts, error: investmentAccountsError },
        { data: holdings, error: holdingsError },
      ] = await Promise.all([
        supabase
          .from("accounts")
          .select("item_id")
          .in("item_id", validPlaidItemIds)
          .eq("type", "investment"),
        supabase
          .from("investment_holdings")
          .select("item_id")
          .eq("user_id", user.id)
          .in("item_id", validPlaidItemIds)
          .eq("provider", "plaid")
          .eq("is_active", true),
      ]);

      if (investmentAccountsError) {
        logger.error(
          "Error fetching Plaid investment accounts in bulk:",
          investmentAccountsError,
        );
      }
      if (holdingsError) {
        logger.error("Error fetching Plaid holdings in bulk:", holdingsError);
      }

      const itemIdsWithInvestmentAccounts = new Set<string>(
        (investmentAccounts || [])
          .map((account: any) => account.item_id)
          .filter(Boolean),
      );
      const itemIdsWithHoldings = new Set<string>(
        (holdings || []).map((holding: any) => holding.item_id).filter(Boolean),
      );

      for (const item of plaidItems || []) {
        if (
          item.item_id &&
          itemIdsWithInvestmentAccounts.has(item.item_id) &&
          itemIdsWithHoldings.has(item.item_id)
        ) {
          plaidConnections.push({
            account_id: `plaid-${item.item_id}`, // Synthetic account_id for Plaid
            brokerage_name: item.institution_name || "Plaid Institution",
            account_name: `${item.institution_name || "Investment"} Account`,
            last_synced_at: item.last_synced_at,
            connection_status: "active",
            is_active: true,
            provider: "plaid",
            item_id: item.item_id,
          });
        }
      }
    }

    // Combine both providers
    const allConnections = [
      ...(snaptradeConnections?.map((c: any) => ({ ...c, provider: "snaptrade" })) || []),
      ...plaidConnections,
    ].sort((a, b) => {
      // Sort by last_synced_at (most recent first)
      const aTime = a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0;
      const bTime = b.last_synced_at ? new Date(b.last_synced_at).getTime() : 0;
      return bTime - aTime;
    });

    return allConnections;
  } catch (error) {
    logger.error("❌ Failed to get all investment connections from DB:", error);
    throw error;
  }
};

export const getSnaptradeConnectionsFromDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return []; // Graceful: don't throw during logout race

    // Don't filter by is_active - we need to see disabled connections too
    const { data, error } = await supabase
      .from("snaptrade_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("last_synced_at", { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    logger.error("❌ Failed to get SnapTrade connections from DB:", error);
    throw error;
  }
};

// === Populate Investment Accounts in Main Accounts Table ===
// Throttle: API allows 5 calls/min. Prevent thundering herd from multiple mount points.
const POPULATE_THROTTLE_MS = 15_000; // 15s min between calls
let lastPopulateAt = 0;
let lastPopulateUserId: string | null = null;

export const populateInvestmentAccountsInDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, populated: 0 }; // Graceful: don't throw during logout race

    const now = Date.now();
    if (
      lastPopulateUserId === user.id &&
      now - lastPopulateAt < POPULATE_THROTTLE_MS
    ) {
      logger.debug("🔄 Skipping populate (throttled) - called recently");
      return { success: true, populated: 0 };
    }
    lastPopulateAt = now;
    lastPopulateUserId = user.id;

    logger.debug("🔄 Populating investment accounts via API endpoint...");

    // Call the server-side API endpoint to handle RLS policies
    const res = await authenticatedFetch(`${BASE_URL}/api/store_accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "populate_investment_accounts",
        user_id: user.id 
      }),
    });

    const { data, rawText } = await parseApiResponse(
      res,
      "Populate investment accounts",
    );
    
    if (!res.ok) {
      throw buildApiError(
        res,
        data,
        rawText,
        "Failed to populate investment accounts",
      );
    }

    logger.debug(`✅ Investment accounts population completed: ${data.populated} accounts processed`);
    return { success: true, populated: data.populated };
  } catch (error) {
    logger.error("❌ Failed to populate investment accounts:", error);
    throw error;
  }
};
