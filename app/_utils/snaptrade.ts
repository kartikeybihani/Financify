// app/utils/snaptrade.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../_lib/supabase/supabase';

const BASE_URL = "https://financify-rose.vercel.app";

// Storage keys for SnapTrade credentials
const SNAPTRADE_CREDENTIALS_KEY = 'snaptrade_credentials';
const SNAPTRADE_CREDENTIALS_VALIDITY_KEY = 'snaptrade_credentials_validity';

// === Storage Helper Functions ===
const getSnaptradeCredentials = async () => {
  try {
    const credentials = await AsyncStorage.getItem(SNAPTRADE_CREDENTIALS_KEY);
    return credentials ? JSON.parse(credentials) : null;
  } catch (error) {
    console.error('Error getting SnapTrade credentials:', error);
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
    
    await AsyncStorage.setItem(SNAPTRADE_CREDENTIALS_KEY, JSON.stringify(safeCredentials));
    // Set validity timestamp (24 hours from now)
    const validityTimestamp = Date.now() + (24 * 60 * 60 * 1000);
    await AsyncStorage.setItem(SNAPTRADE_CREDENTIALS_VALIDITY_KEY, validityTimestamp.toString());
    
    console.log("🔄 Storing SnapTrade credentials (userSecret excluded for security):", safeCredentials);
  } catch (error) {
    console.error('Error setting SnapTrade credentials:', error);
  }
};

const clearSnaptradeCredentials = async () => {
  try {
    await AsyncStorage.removeItem(SNAPTRADE_CREDENTIALS_KEY);
    await AsyncStorage.removeItem(SNAPTRADE_CREDENTIALS_VALIDITY_KEY);
  } catch (error) {
    console.error('Error clearing SnapTrade credentials:', error);
  }
};

const hasSnaptradeCredentials = async (): Promise<boolean> => {
  try {
    const credentials = await getSnaptradeCredentials();
    return credentials !== null;
  } catch (error) {
    console.error('Error checking SnapTrade credentials:', error);
    return false;
  }
};

const areSnaptradeCredentialsValid = async (): Promise<boolean> => {
  try {
    const validityTimestamp = await AsyncStorage.getItem(SNAPTRADE_CREDENTIALS_VALIDITY_KEY);
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
    console.error('Error checking SnapTrade credentials validity:', error);
    return false;
  }
};

// === Call SnapTrade API ===
export const callSnapTradeAPI = async (mode: string, params: any = {}) => {
  try {
    console.log(`🔄 Calling SnapTrade API with mode: ${mode}`, params);
    
    const res = await fetch(`${BASE_URL}/api/link_tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: mode,
        ...params
      }),
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Failed to call SnapTrade API with mode: ${mode}`);
    
    console.log(`✅ SnapTrade API call successful for mode: ${mode}`, data);
    return data;
  } catch (error) {
    console.error(`❌ SnapTrade API call failed for mode: ${mode}:`, error);
    throw error;
  }
};

// === Handle SnapTrade Register ===
export const handleSnapTradeRegister = async (userId: string) => {
  try {
    console.log("🔄 Registering SnapTrade user:", userId);
    
    const response = await callSnapTradeAPI("snaptrade", { user_id: userId });
    
    console.log("✅ SnapTrade user registered successfully:", response);
    return response;
  } catch (error) {
    console.error("❌ Failed to register SnapTrade user:", error);
    throw error;
  }
};

// === Handle SnapTrade Login ===
export const handleSnapTradeLogin = async (userId: string, userSecret: string) => {
  try {
    console.log("🔄 Logging in SnapTrade user:", userId);
    
    const response = await callSnapTradeAPI("snaptrade", { 
      userId: userId, 
      userSecret: userSecret 
    });
    
    console.log("✅ SnapTrade user logged in successfully:", response);
    return response;
  } catch (error) {
    console.error("❌ Failed to login SnapTrade user:", error);
    throw error;
  }
};

// === Register SnapTrade User ===
export const registerSnaptradeUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Generate a new unique user ID for each SnapTrade registration
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const snaptradeUserId = `financify-${user?.id}-${timestamp}-${randomSuffix}`;
  
  console.log("🆔 Generated new SnapTrade user ID:", snaptradeUserId);
  
  return await handleSnapTradeRegister(snaptradeUserId);
};

// === Fetch SnapTrade Accounts ===
export const fetchSnaptradeAccounts = async (userId: string, userSecret: string) => {
  const res = await fetch(`${BASE_URL}/api/plaid`, {
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
  
  console.log("✅ SnapTrade accounts fetched successfully: ", data);
  return data.accounts;
};

// === Get Stored SnapTrade Credentials ===
export const getStoredSnaptradeCredentials = async () => {
  try {
    const credentials = await getSnaptradeCredentials();
    if (!credentials) {
      console.log("ℹ️ No stored SnapTrade credentials found");
      return null;
    }
    
    // Check if credentials are still valid
    const isValid = await areSnaptradeCredentialsValid();
    if (!isValid) {
      console.log("⚠️ Stored SnapTrade credentials have expired");
      await clearSnaptradeCredentials();
      return null;
    }
    
    console.log("✅ Valid SnapTrade credentials found in storage");
    return credentials;
  } catch (error) {
    console.error("❌ Failed to get stored SnapTrade credentials:", error);
    return null;
  }
};

// === Get SnapTrade UserSecret from Vault ===
export const getSnaptradeUserSecretFromVault = async (userId: string, snaptradeUserId: string, accountId: string) => {
  try {
    console.log("🔑 Retrieving userSecret from secure vault...");
    
    const { data: userSecret, error: vaultError } = await supabase.rpc(
      "secure_get_snaptrade_credentials",
      { 
        p_user_id: userId,
        p_snaptrade_user_id: snaptradeUserId,
        p_account_id: accountId
      }
    );
    
    if (vaultError || !userSecret) {
      console.error("Error retrieving SnapTrade userSecret from Vault:", vaultError);
      throw new Error(vaultError?.message || "UserSecret not found in vault");
    }
    
    console.log("✅ UserSecret retrieved from vault successfully");
    return userSecret;
  } catch (error) {
    console.error("❌ Failed to retrieve userSecret from vault:", error);
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
    
    // Retrieve userSecret from vault
    const userSecret = await getSnaptradeUserSecretFromVault(user.id, credentials.userId, credentials.accountId);
    
    console.log("🔄 Fetching SnapTrade accounts using stored credentials...");
    const accounts = await fetchSnaptradeAccounts(credentials.userId, userSecret);
    console.log("✅ SnapTrade accounts fetched using stored credentials:", accounts.length);
    return accounts;
  } catch (error) {
    console.error("❌ Failed to fetch SnapTrade accounts from storage:", error);
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
    console.error("❌ Failed to check SnapTrade connection:", error);
    return false;
  }
};

// === Clear SnapTrade Connection ===
export const clearSnaptradeConnection = async (): Promise<void> => {
  try {
    await clearSnaptradeCredentials();
    console.log("✅ SnapTrade connection cleared");
  } catch (error) {
    console.error("❌ Failed to clear SnapTrade connection:", error);
    throw error;
  }
};

// === Beautify Holdings Response ===
export const beautifyHoldingsResponse = (holdings: any) => {
  console.log("📊 === SNAPTRADE HOLDINGS RESPONSE ===");
  console.log("📈 Total Holdings:", holdings.length);
  console.log("");

  holdings.forEach((holding: any, index: number) => {
    const symbol = holding.symbol?.symbol || holding.symbol;
    const marketValue = holding.units && holding.price ? holding.units * holding.price : 0;
    
    console.log(`🏦 Holding #${index + 1}:`);
    console.log(`   📋 Symbol: ${symbol?.symbol || "N/A"}`);
    console.log(`   📝 Description: ${symbol?.description || "N/A"}`);
    console.log(`   💰 Units: ${holding.units || "N/A"}`);
    console.log(`   💵 Price: $${holding.price || "N/A"}`);
    console.log(`   💰 Market Value: $${marketValue.toFixed(2)}`);
    console.log(`   📊 Average Cost: $${holding.average_purchase_price || "N/A"}`);
    console.log(`   📈 Open P&L: $${holding.open_pnl || "N/A"}`);
    console.log(`   💱 Currency: ${holding.currency?.code || "N/A"}`);
    console.log("");
  });

  console.log("=".repeat(60));
  console.log(`📈 Number of Holdings: ${holdings.length}`);
  console.log("=".repeat(60));
};

// === Fetch SnapTrade Holdings via API ===
export const fetchSnaptradeHoldings = async (userId: string, userSecret: string, accountId: string) => {
  try {
    console.log("🔄 Fetching SnapTrade holdings via API...");
    
    const res = await fetch(`${BASE_URL}/api/plaid`, {
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
    
    console.log("✅ SnapTrade holdings fetched successfully via API");
    
    // Beautify the response on frontend
    if (data.holdings && Array.isArray(data.holdings)) {
      beautifyHoldingsResponse(data.holdings);
    } else {
      console.log("📊 Holdings data structure:", JSON.stringify(data.holdings, null, 2));
    }
    
    return data.holdings;
  } catch (error) {
    console.error("❌ Failed to fetch SnapTrade holdings via API:", error);
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
    
    // Retrieve userSecret from vault
    const userSecret = await getSnaptradeUserSecretFromVault(user.id, credentials.userId, credentials.accountId);
    
    console.log("🔄 Fetching SnapTrade holdings using stored credentials...");
    const holdings = await fetchSnaptradeHoldings(credentials.userId, userSecret, accountId);
    console.log("✅ SnapTrade holdings fetched using stored credentials:", holdings.length);
    return holdings;
  } catch (error) {
    console.error("❌ Failed to fetch SnapTrade holdings from storage:", error);
    throw error;
  }
};

// === Fetch SnapTrade Options ===
export const fetchSnaptradeOptions = async (userId: string, userSecret: string, accountId: string) => {
  try {
    console.log("🔄 Fetching SnapTrade options via API...");
    
    const res = await fetch(`${BASE_URL}/api/plaid`, {
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
    
    console.log("✅ SnapTrade options fetched successfully via API");
    return data.options;
  } catch (error) {
    console.error("❌ Failed to fetch SnapTrade options via API:", error);
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
    
    // Retrieve userSecret from vault
    const userSecret = await getSnaptradeUserSecretFromVault(user.id, credentials.userId, credentials.accountId);
    
    console.log("🔄 Fetching SnapTrade options using stored credentials...");
    const options = await fetchSnaptradeOptions(credentials.userId, userSecret, accountId);
    console.log("✅ SnapTrade options fetched using stored credentials:", options.length);
    return options;
  } catch (error) {
    console.error("❌ Failed to fetch SnapTrade options from storage:", error);
    throw error;
  }
};

// === Fetch SnapTrade Balances ===
export const fetchSnaptradeBalances = async (userId: string, userSecret: string, accountId: string) => {
  try {
    console.log("🔄 Fetching SnapTrade balances via API...");
    
    const res = await fetch(`${BASE_URL}/api/plaid`, {
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
    
    console.log("✅ SnapTrade balances fetched successfully via API");
    return data.balances;
  } catch (error) {
    console.error("❌ Failed to fetch SnapTrade balances via API:", error);
    throw error;
  }
};

// === Store SnapTrade Credentials Securely ===
export const storeSnaptradeCredentials = async (
  userId: string,
  snaptradeUserId: string,
  accountId: string,
  userSecret: string,
  metadata?: any
) => {
  try {
    console.log("🔄 Storing SnapTrade credentials securely...");
    
    const res = await fetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode: "snaptrade_store_credentials", 
        userId: userId,
        snaptradeUserId: snaptradeUserId,
        accountId: accountId,
        userSecret: userSecret,
        ...metadata
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to store SnapTrade credentials");
    
    // Also store locally for quick access
    await setSnaptradeCredentials({
      userId: snaptradeUserId,
      userSecret: userSecret,
      accountId: accountId
    });
    
    console.log("✅ SnapTrade credentials stored securely");
    return data;
  } catch (error) {
    console.error("❌ Failed to store SnapTrade credentials:", error);
    throw error;
  }
};

// === Sync SnapTrade Investments ===
export const syncSnaptradeInvestments = async (userId: string, accountId: string) => {
  try {
    console.log("🔄 Syncing SnapTrade investments...");
    
    const res = await fetch(`${BASE_URL}/api/plaid`, {
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
    
    console.log("✅ SnapTrade investments synced successfully");
    return data;
  } catch (error) {
    console.error("❌ Failed to sync SnapTrade investments:", error);
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
    console.error("❌ Failed to get SnapTrade holdings from DB:", error);
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
    console.error("❌ Failed to get SnapTrade options from DB:", error);
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
    console.error("❌ Failed to get SnapTrade balances from DB:", error);
    throw error;
  }
};

export const getSnaptradeConnectionsFromDB = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    const { data, error } = await supabase
      .from("snaptrade_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("last_synced_at", { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to get SnapTrade connections from DB:", error);
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
  clearSnaptradeConnection,
  getStoredSnaptradeCredentials,
  getSnaptradeUserSecretFromVault,
  
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
  
  // Database operations
  getSnaptradeHoldingsFromDB,
  getSnaptradeOptionsFromDB,
  getSnaptradeBalancesFromDB,
  getSnaptradeConnectionsFromDB,
};

export default snaptradeUtils;
