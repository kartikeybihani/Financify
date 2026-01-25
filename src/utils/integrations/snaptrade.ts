// app/utils/snaptrade.ts
import AppStorage from '@/src/utils/storage/storage';
import { supabase } from '@/src/lib/supabase/supabase';
import logger from '@/src/utils/core/logger';
import { authenticatedFetch } from '@/src/utils/auth/authToken';
import { API_BASE_URL } from '@/src/utils/core/apiUrl';

const BASE_URL = API_BASE_URL;

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

const hasSnaptradeCredentials = async (): Promise<boolean> => {
  try {
    const credentials = await getSnaptradeCredentials();
    return credentials !== null;
  } catch (error) {
    logger.error('Error checking SnapTrade credentials:', error);
    return false;
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
export const callSnapTradeAPI = async (mode: string, params: any = {}) => {
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
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Failed to call SnapTrade API with mode: ${mode}`);
    
    logger.info(`✅ SnapTrade API call successful for mode: ${mode}`, data);
    return data;
  } catch (error) {
    logger.error(`❌ SnapTrade API call failed for mode: ${mode}:`, error);
    throw error;
  }
};

// === Handle SnapTrade Register ===
export const handleSnapTradeRegister = async (userId: string) => {
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch SnapTrade accounts");
  
  logger.info("✅ SnapTrade accounts fetched successfully: ", data);
  return data.accounts;
};

// === Get Stored SnapTrade Credentials ===
export const getStoredSnaptradeCredentials = async () => {
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
export const refreshExpiredCredentials = async () => {
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

// === Fetch SnapTrade Accounts Using Stored Credentials ===
export const fetchSnaptradeAccountsFromStorage = async () => {
  try {
    const credentials = await getStoredSnaptradeCredentials();
    if (!credentials) {
      throw new Error("No valid SnapTrade credentials found in storage");
    }
    
    // Get the actual authenticated user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");
    
    // Retrieve userSecret from database
    const userSecret = await getSnaptradeUserSecretFromDB(user.id, credentials.userId, credentials.accountId);
    
    logger.info("🔄 Fetching SnapTrade accounts using stored credentials...");
    const accounts = await fetchSnaptradeAccounts(credentials.userId, userSecret);
    logger.info("✅ SnapTrade accounts fetched using stored credentials:", accounts.length);
    return accounts;
  } catch (error) {
    logger.error("❌ Failed to fetch SnapTrade accounts from storage:", error);
    throw error;
  }
};

// === Check if SnapTrade Connection Exists ===
export const hasSnaptradeConnection = async (): Promise<boolean> => {
  try {
    const hasCredentials = await hasSnaptradeCredentials();
    if (!hasCredentials) return false;
    
    const isValid = await areSnaptradeCredentialsValid();
    return isValid;
  } catch (error) {
    logger.error("❌ Failed to check SnapTrade connection:", error);
    return false;
  }
};

// === Check SnapTrade Connection Status ===
export const getSnaptradeConnectionStatus = async (): Promise<{
  hasConnection: boolean;
  isActive: boolean;
  status: string | null;
  needsReconnection: boolean;
}> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { hasConnection: false, isActive: false, status: null, needsReconnection: false };
    }

    const { data: connections, error } = await supabase
      .from("snaptrade_connections")
      .select("is_active, connection_status")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("last_synced_at", { ascending: false })
      .limit(1);

    if (error || !connections || connections.length === 0) {
      return { hasConnection: false, isActive: false, status: null, needsReconnection: false };
    }

    const connection = connections[0];
    const needsReconnection = !connection.is_active || 
                             connection.connection_status === "disabled" || 
                             connection.connection_status === "error";

    return {
      hasConnection: true,
      isActive: connection.is_active,
      status: connection.connection_status,
      needsReconnection
    };
  } catch (error) {
    logger.error("❌ Failed to check SnapTrade connection status:", error);
    return { hasConnection: false, isActive: false, status: null, needsReconnection: false };
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

// === Beautify Holdings Response ===
export const beautifyHoldingsResponse = (holdings: any) => {
  logger.info("📊 === SNAPTRADE HOLDINGS RESPONSE ===");
  logger.info("📈 Total Holdings:", holdings.length);
  logger.info("");

  holdings.forEach((holding: any, index: number) => {
    const symbol = holding.symbol?.symbol || holding.symbol;
    const marketValue = holding.units && holding.price ? holding.units * holding.price : 0;
    
    logger.info(`🏦 Holding #${index + 1}:`);
    logger.info(`   📋 Symbol: ${symbol?.symbol || "N/A"}`);
    logger.info(`   📝 Description: ${symbol?.description || "N/A"}`);
    logger.info(`   💰 Units: ${holding.units || "N/A"}`);
    logger.info(`   💵 Price: $${holding.price || "N/A"}`);
    logger.info(`   💰 Market Value: $${marketValue.toFixed(2)}`);
    logger.info(`   📊 Average Cost: $${holding.average_purchase_price || "N/A"}`);
    logger.info(`   📈 Open P&L: $${holding.open_pnl || "N/A"}`);
    logger.info(`   💱 Currency: ${holding.currency?.code || "N/A"}`);
    logger.info("");
  });

  logger.info("=".repeat(60));
  logger.info(`📈 Number of Holdings: ${holdings.length}`);
  logger.info("=".repeat(60));
};

// === Fetch SnapTrade Holdings via API ===
export const fetchSnaptradeHoldings = async (userId: string, userSecret: string, accountId: string) => {
  try {
    logger.info("🔄 Fetching SnapTrade holdings via API...");
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_holdings", 
        userId: userId,
        userSecret: userSecret,
        accountId: accountId
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch SnapTrade holdings");
    
    logger.info("✅ SnapTrade holdings fetched successfully via API");
    
    // Beautify the response on frontend
    if (data.holdings && Array.isArray(data.holdings)) {
      beautifyHoldingsResponse(data.holdings);
    } else {
      logger.info("📊 Holdings data structure:", JSON.stringify(data.holdings, null, 2));
    }
    
    return data.holdings;
  } catch (error) {
    logger.error("❌ Failed to fetch SnapTrade holdings via API:", error);
    throw error;
  }
};

// === Fetch SnapTrade Holdings Using Stored Credentials ===
export const fetchSnaptradeHoldingsFromStorage = async (accountId: string) => {
  try {
    const credentials = await getStoredSnaptradeCredentials();
    if (!credentials) {
      throw new Error("No valid SnapTrade credentials found in storage");
    }
    
    // Get the actual authenticated user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");
    
    // Retrieve userSecret from database
    const userSecret = await getSnaptradeUserSecretFromDB(user.id, credentials.userId, credentials.accountId);
    
    logger.info("🔄 Fetching SnapTrade holdings using stored credentials...");
    const holdings = await fetchSnaptradeHoldings(credentials.userId, userSecret, accountId);
    logger.info("✅ SnapTrade holdings fetched using stored credentials:", holdings.length);
    return holdings;
  } catch (error) {
    logger.error("❌ Failed to fetch SnapTrade holdings from storage:", error);
    throw error;
  }
};

// === Fetch SnapTrade Options ===
export const fetchSnaptradeOptions = async (userId: string, userSecret: string, accountId: string) => {
  try {
    logger.info("🔄 Fetching SnapTrade options via API...");
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_options", 
        userId: userId,
        userSecret: userSecret,
        accountId: accountId
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch SnapTrade options");
    
    logger.info("✅ SnapTrade options fetched successfully via API");
    return data.options;
  } catch (error) {
    logger.error("❌ Failed to fetch SnapTrade options via API:", error);
    throw error;
  }
};

// === Fetch SnapTrade Options Using Stored Credentials ===
export const fetchSnaptradeOptionsFromStorage = async (accountId: string) => {
  try {
    const credentials = await getStoredSnaptradeCredentials();
    if (!credentials) {
      throw new Error("No valid SnapTrade credentials found in storage");
    }
    
    // Get the actual authenticated user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");
    
    // Retrieve userSecret from database
    const userSecret = await getSnaptradeUserSecretFromDB(user.id, credentials.userId, credentials.accountId);
    
    logger.info("🔄 Fetching SnapTrade options using stored credentials...");
    const options = await fetchSnaptradeOptions(credentials.userId, userSecret, accountId);
    logger.info("✅ SnapTrade options fetched using stored credentials:", options.length);
    return options;
  } catch (error) {
    logger.error("❌ Failed to fetch SnapTrade options from storage:", error);
    throw error;
  }
};

// === Fetch SnapTrade Balances ===
export const fetchSnaptradeBalances = async (userId: string, userSecret: string, accountId: string) => {
  try {
    logger.info("🔄 Fetching SnapTrade balances via API...");
    
    const res = await authenticatedFetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_balances", 
        userId: userId,
        userSecret: userSecret,
        accountId: accountId
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch SnapTrade balances");
    
    logger.info("✅ SnapTrade balances fetched successfully via API");
    return data.balances;
  } catch (error) {
    logger.error("❌ Failed to fetch SnapTrade balances via API:", error);
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
    
    // Try to get connection_id from SnapTrade API if not provided
    let connectionId = metadata?.connection_id;
    if (!connectionId) {
      try {
        logger.info("🔍 Fetching connection_id from SnapTrade API...");
        // Call SnapTrade API to get connections/authorizations
        const connectionsResponse = await callSnapTradeAPI("snaptrade_connections", {
          userId: snaptradeUserId,
          userSecret: userSecret,
        });
        
        // Find the connection that matches this account
        if (connectionsResponse?.data && Array.isArray(connectionsResponse.data)) {
          const matchingConnection = connectionsResponse.data.find(
            (conn: any) => conn.id === accountId || conn.account_id === accountId
          );
          if (matchingConnection?.id) {
            connectionId = matchingConnection.id;
            logger.info("✅ Found connection_id from API:", connectionId);
          }
        }
      } catch (connError) {
        logger.warn("⚠️ Could not fetch connection_id from API (will store without it):", connError);
        // Continue without connection_id - it can be updated later
      }
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
export const checkSnaptradeConnectionStatus = async (userId: string, accountId: string) => {
  try {
    logger.info("🔍 Checking SnapTrade connection status...");
    
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
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to check connection status");
    
    logger.info("✅ Connection status checked:", data);
    return data;
  } catch (error) {
    logger.error("❌ Failed to check connection status:", error);
    throw error;
  }
};

// === Get Connection Details from SnapTrade API ===
export const getSnaptradeConnectionDetails = async (userId: string, accountId: string) => {
  try {
    logger.info("🔍 Getting connection details from SnapTrade API...");
    
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
    
    const data = await res.json();
    
    // Handle 402 error (disabled connection)
    if (res.status === 402) {
      logger.warn("🔴 Connection is disabled:", data);
      return {
        disabled: true,
        requiresReconnect: true,
        connectionId: data.connectionId,
        message: data.message,
      };
    }
    
    if (!res.ok) throw new Error(data.error || "Failed to get connection details");
    
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to sync SnapTrade investments");
    
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to recalculate balances");
    
    logger.info("✅ Investment balances recalculated successfully");
    return data;
  } catch (error) {
    logger.error("❌ Failed to recalculate investment balances:", error);
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
    const data = await res.json();
    
    // Check for 402 error (disabled connection)
    if (res.status === 402) {
      logger.error("🔴 Connection is disabled (402 error):", data);
      
      // Create a special error object with requiresReconnect flag
      const disabledError: any = new Error(data.message || "Connection is disabled. Please reconnect your account.");
      disabledError.code = data.code || "CONNECTION_DISABLED";
      disabledError.requiresReconnect = data.requiresReconnect || true;
      disabledError.connectionId = data.connectionId;
      disabledError.statusCode = 402;
      
      throw disabledError;
    }
    
    if (!res.ok) {
      throw new Error(data.error || "Failed to refresh SnapTrade investments");
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
    if (!user) throw new Error("User not authenticated");

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
    if (!user) throw new Error("User not authenticated");

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
    if (!user) throw new Error("User not authenticated");

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
    if (!user) throw new Error("User not authenticated");

    // Get SnapTrade connections
    const { data: snaptradeConnections, error: snaptradeError } = await supabase
      .from("snaptrade_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("last_synced_at", { ascending: false });

    if (snaptradeError) {
      logger.error("Error fetching SnapTrade connections:", snaptradeError);
    }

    // Get Plaid investment accounts (from user_items where there are investment accounts)
    const { data: plaidItems, error: plaidError } = await supabase
      .from("user_items")
      .select("item_id, institution_name, last_synced_at")
      .eq("user_id", user.id);

    if (plaidError) {
      logger.error("Error fetching Plaid items:", plaidError);
    }

    // Check which Plaid items have investment accounts
    const plaidConnections: any[] = [];
    if (plaidItems && plaidItems.length > 0) {
      for (const item of plaidItems) {
        // Check if this item has investment accounts
        const { data: investmentAccounts } = await supabase
          .from("accounts")
          .select("account_id, name, type")
          .eq("item_id", item.item_id)
          .eq("type", "investment")
          .limit(1);

        if (investmentAccounts && investmentAccounts.length > 0) {
          // Check if there are actual holdings for this item
          const { data: holdings } = await supabase
            .from("investment_holdings")
            .select("id")
            .eq("user_id", user.id)
            .eq("item_id", item.item_id)
            .eq("provider", "plaid")
            .eq("is_active", true)
            .limit(1);

          if (holdings && holdings.length > 0) {
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

    logger.info("📊 All investment connections loaded:", {
      snaptrade: snaptradeConnections?.length || 0,
      plaid: plaidConnections.length,
      total: allConnections.length,
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
    if (!user) throw new Error("User not authenticated");

    // Don't filter by is_active - we need to see disabled connections too
    const { data, error } = await supabase
      .from("snaptrade_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("last_synced_at", { ascending: false });

    if (error) throw error;
    
    // Debug logging to see connection status
    if (data && data.length > 0) {
      logger.info("📊 Connections loaded:", {
        count: data.length,
        statuses: data.map((c: any) => ({
          account_id: c.account_id?.substring(0, 8) + "...",
          is_active: c.is_active,
          connection_status: c.connection_status,
          connection_id: c.connection_id ? "exists" : "missing",
        })),
      });
    }
    
    return data;
  } catch (error) {
    logger.error("❌ Failed to get SnapTrade connections from DB:", error);
    throw error;
  }
};

// === Populate Investment Accounts in Main Accounts Table ===
export const populateInvestmentAccountsInDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    logger.info("🔄 Populating investment accounts via API endpoint...");

    // Call the server-side API endpoint to handle RLS policies
    const res = await authenticatedFetch(`${BASE_URL}/api/store_accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "populate_investment_accounts",
        user_id: user.id 
      }),
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || "Failed to populate investment accounts");
    }

    logger.info(`✅ Investment accounts population completed: ${data.populated} accounts processed`);
    return { success: true, populated: data.populated };
  } catch (error) {
    logger.error("❌ Failed to populate investment accounts:", error);
    throw error;
  }
};

// Export all functions
const snaptradeUtils = {
  // Core API functions
  callSnapTradeAPI,
  handleSnapTradeRegister,
  handleSnapTradeLogin,
  
  // Registration and connection management
  registerSnaptradeUser,
  storeSnaptradeCredentials,
  hasSnaptradeConnection,
  getSnaptradeConnectionStatus,
  clearSnaptradeConnection,
  reconnectSnaptradeConnection,
  getStoredSnaptradeCredentials,
  getSnaptradeCredentialsWithFallback,
  refreshExpiredCredentials,
  getSnaptradeUserSecretFromDB,
  checkSnaptradeConnectionStatus,
  getSnaptradeConnectionDetails,
  
  // Account operations
  fetchSnaptradeAccounts,
  fetchSnaptradeAccountsFromStorage,
  
  // Holdings operations
  fetchSnaptradeHoldings,
  fetchSnaptradeHoldingsFromStorage,
  beautifyHoldingsResponse,
  
  // Options operations
  fetchSnaptradeOptions,
  fetchSnaptradeOptionsFromStorage,
  
  // Balances operations
  fetchSnaptradeBalances,
  
  // Sync operations
  syncSnaptradeInvestments,
  refreshSnaptradeInvestments,
  
  // Database operations
  getSnaptradeHoldingsFromDB,
  getSnaptradeOptionsFromDB,
  getSnaptradeBalancesFromDB,
  getSnaptradeConnectionsFromDB,
  getAllInvestmentConnectionsFromDB,
  populateInvestmentAccountsInDB,
};

export default snaptradeUtils;
