// /app/utils/plaid.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { open, create } from "react-native-plaid-link-sdk";
import {supabase} from "../lib/supabase/supabase";

const BASE_URL = "https://financify-rose.vercel.app";

// === Last Used Item Management ===
import { setLastUsedItemId, getLastUsedItemId } from "./lastUsedItem";
import { fetchUserItems } from "./supabase";
import { 
  cacheRemove, 
  txPreviewKey, 
  balancesKey, 
  institutionKey, 
  lastSyncKey 
} from "./cache";

// === Get User Items from Supabase ===
export async function getUserItems() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];
  
  return fetchUserItems(user.id);
}

// === Get Primary Item ID (for compatibility) ===
export async function getPrimaryItemId(): Promise<string | null> {
  // First try last used
  const lastUsed = await getLastUsedItemId();
  if (lastUsed) return lastUsed;
  
  // Fall back to most recent item
  const items = await getUserItems();
  if (items.length === 0) return null;
  
  const primaryItemId = items[0].item_id; // Most recent (ordered by created_at desc)
  await setLastUsedItemId(primaryItemId);
  return primaryItemId;
}

// === Create Link Token ===
export const fetchLinkToken = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  const res = await fetch(`${BASE_URL}/api/link_tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "create", user_id: user?.id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get link token");
  return data.link_token;
};

// === Connect Flow ===
export const handlePlaidConnect = async (
  linkToken: string,
  onSuccess: (itemId: string) => void,
  onExit?: (error?: any) => void
) => {
  if (!linkToken) return;

  create({ token: linkToken }); // init RN SDK
  open({
    onSuccess: async ({ publicToken }: { publicToken: string }) => {
      try {
        console.log("🔄 Starting token exchange...");
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.id) {
          throw new Error("User not authenticated");
        }

        console.log("📡 Making API call to exchange_public_token");
        const res = await fetch(`${BASE_URL}/api/exchange_public_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            user_id: user.id,
          }),
        });

        const data = await res.json();
        console.log("📦 Exchange response:", { ok: res.ok, data });
        
        if (!res.ok) {
          throw new Error(data.error || `Exchange failed: ${res.status}`);
        }

        if (!data.item_id) {
          throw new Error("No item_id returned from exchange");
        }

        // ✅ we only get and keep item_id client-side
        const { item_id } = data;
        await setLastUsedItemId(item_id);
        console.log("✅ Token exchange successful, item_id:", item_id);
        
        // 🏦 Immediately fetch and store accounts
        try {
          console.log("🔄 Fetching and storing accounts...");
          await storeAccounts(item_id);
          console.log("✅ Accounts stored successfully");
        } catch (accountError) {
          console.error("⚠️ Failed to store accounts (continuing anyway):", accountError);
          // Don't fail the whole connection if account storage fails
        }
        
        // 💸 Trigger initial transaction sync
        try {
          console.log("🔄 Syncing initial transactions...");
          await syncTransactions(item_id);
          console.log("✅ Initial transaction sync completed");
        } catch (syncError) {
          console.error("⚠️ Failed to sync initial transactions (continuing anyway):", syncError);
          // Don't fail the whole connection if initial sync fails
        }
        
        onSuccess(item_id);
      } catch (error) {
        console.error("❌ Token exchange failed:", error);
        // Call onExit with error to trigger error handling
        onExit?.(error);
      }
    },
    onExit: (error?: any) => onExit?.(error),
  });
};

// === Add New Bank Account (for existing users) ===
export const addNewBankAccount = async (
  onSuccess?: (itemId: string) => void,
  onExit?: (error?: any) => void
) => {
  try {
    console.log("🏦 Starting process to add new bank account...");
    
    // 1. Get a new link token for adding accounts
    const linkToken = await fetchLinkToken();
    console.log("🔗 Generated link token for new bank connection");
    
    // 2. Open Plaid Link for the user to select a new bank
    await handlePlaidConnect(
      linkToken,
      (itemId) => {
        console.log("✅ Successfully added new bank account:", itemId);
        onSuccess?.(itemId);
      },
      (error) => {
        console.error("❌ Failed to add new bank account:", error);
        onExit?.(error);
      }
    );
    
  } catch (error) {
    console.error("❌ Error in addNewBankAccount:", error);
    onExit?.(error);
  }
};

// === Update Mode ===
export const getUpdateLinkToken = async (item_id: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  const res = await fetch(`${BASE_URL}/api/link_tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "update", item_id, user_id: user?.id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get update token");
  return data.link_token;
};

// === Open Plaid Link ===
export const openPlaidLink = async (link_token: string) => {
  try {
    console.log("Opening Plaid link for update");
    create({ token: link_token });
    return new Promise((resolve, reject) => {
      open({
        onSuccess: () => {
          console.log("✅ Update success");
          resolve(true);
        },
        onExit: (error: any) => {
          console.log("⛔ Update exited", error);
          reject(error || new Error("Update flow exited"));
        },
      });
    });
  } catch (error) {
    console.error("Error opening Plaid link:", error);
    throw error;
  }
};

// === Disconnect ===
export const handleDisconnect = async (item_id: string) => {
  console.log(`🔄 Disconnecting item: ${item_id}`);
  
  if (!item_id) {
    throw new Error("Item ID is required for disconnection");
  }

  const res = await fetch(`${BASE_URL}/api/remove_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id }),
  });
  
  const payload = await res.json();
  console.log("📦 Remove item response:", { ok: res.ok, payload });
  
  if (!res.ok || payload?.error) {
    throw new Error(payload?.error || `Remove failed with status ${res.status}`);
  }
  
  // Clear last used if it matches the removed item
  const lastUsed = await getLastUsedItemId();
  if (lastUsed === item_id) {
    await setLastUsedItemId(''); // Clear it
    console.log("🧹 Cleared last used item ID");
  }
  
  console.log("✅ Successfully disconnected item");
  return true;
};

// === Disconnect All Items (for complete cleanup) ===
export const handleDisconnectAll = async () => {
  try {
    const items = await getUserItems();
    console.log(`🔄 Disconnecting all ${items.length} connected items...`);
    
    if (items.length === 0) {
      console.log("ℹ️ No items to disconnect");
      return { success: true, disconnected: 0 };
    }
    
    const results = await Promise.allSettled(
      items.map(item => handleDisconnect(item.item_id))
    );
    
    const successful = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.filter(result => result.status === 'rejected').length;
    
    console.log(`✅ Disconnect summary: ${successful} successful, ${failed} failed`);
    
    // Clear last used item regardless
    await setLastUsedItemId('');
    
    return { 
      success: true, 
      disconnected: successful,
      failed: failed,
      total: items.length 
    };
  } catch (error) {
    console.error("❌ Error during disconnect all:", error);
    throw error;
  }
};

// === Plaid Data Fetchers ===
export const fetchInstitution = async (item_id: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "institution", item_id }),
    });
    const data = await res.json();
    return data.institution;
  } catch (err) {
    console.error("Error fetching institution:", err);
    return null;
  }
};

// === Fetch Accounts ===
export const fetchAccounts = async (item_id: string) => {
  const res = await fetch(`${BASE_URL}/api/plaid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: "accounts", item_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch accounts");
  return data.accounts;
};

// === Trigger Webhook ===
export const triggerWebhook = async (item_id: string) => {
  const res = await fetch(`${BASE_URL}/api/fire_webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id }),
  });
  console.log("Webhook triggered");
  if (!res.ok) throw new Error("Webhook trigger failed");
  return res.json();
};

// === Fetch Identity ===
export const fetchIdentity = async (item_id: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "identity", item_id }),
    });
    const data = await res.json();
    return data.identity;
  } catch (err) {
    console.error("Error fetching identity:", err);
    return [];
  }
};

// === Fetch Investments ===
export const fetchInvestments = async (item_id: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "investments", item_id }),
    });
    const data = await res.json();
    console.log("Investments data loaded...");
    return {
      holdings: data.holdings || [],
      securities: data.securities || [],
      investmentTransactions: data.investment_transactions || [],
    };
  } catch (err) {
    console.error("Error fetching investments:", err);
    return {
      holdings: [],
      securities: [],
      investmentTransactions: [],
    };
  }
};

export const fetchLiabilities = async (item_id: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/plaid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "liabilities", item_id }),
    });
    const data = await res.json();
    console.log("Liabilities data loaded...");
    return data.liabilities || [];
  } catch (err) {
    console.error("Error fetching liabilities:", err);
    return [];
  }
};

// === Bootup Fetch ===
export const fetchInitialData = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      console.log("❌ No authenticated user found");
      return { accounts: [], transactions: [], investments: {}, liabilities: [] };
    }

    console.log("🚀 Loading initial data for user:", user.id);

    // Get all accounts for user (from all connected institutions)
    const accounts = await getAllUserAccounts(user.id);
    
    // Get recent transactions
    const transactions = await getRecentTransactions(user.id, 100);

    // Get institution info from the primary item (for compatibility)
    const item_id = await getPrimaryItemId();
    let institution = null;
    
    if (item_id) {
      const { data: userItem, error } = await supabase
        .from("user_items")
        .select("institution_name, institution_id")
        .eq("item_id", item_id)
        .single();

      institution = userItem && !error ? {
        name: userItem.institution_name,
        institution_id: userItem.institution_id
      } : null;
    }

    const result = {
      institution,
      accounts,
      transactions,
      identity: [], // Legacy compatibility
      investments: { holdings: [], securities: [], investmentTransactions: [] },
      liabilities: [],
      item_id // Most recent item_id for compatibility
    };

    console.log("📊 Initial data loaded:", {
      institution: institution?.name || "Multiple/Unknown",
      accounts: accounts?.length || 0,
      transactions: transactions?.length || 0,
      investments: 0,
      liabilities: 0,
    });

    return result;
  } catch (error) {
    console.error("❌ Error fetching initial data:", error);
    return { 
      accounts: [], 
      transactions: [],
      investments: { holdings: [], securities: [], investmentTransactions: [] }, 
      liabilities: [],
      identity: [],
      institution: null
    };
  }
};

// === Sync Transactions (Supabase Function) ===
export const syncTransactions = async (item_id: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("User not authenticated");

  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!SUPABASE_URL) throw new Error("Supabase URL not configured");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-transactions`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ item_id, user_id: user.id }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sync failed");
  
  console.log("✅ Transaction sync complete:", {
    added: data.added,
    modified: data.modified, 
    removed: data.removed
  });
  
  return data; // { message, added, modified, removed }
};

// === Store Accounts ===
export const storeAccounts = async (item_id: string) => {
  console.log("🏦 Storing accounts for item_id:", item_id);
  const res = await fetch(`${BASE_URL}/api/store_accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to store accounts");
  console.log("✅ Accounts stored:", data.stored);
  return data;
};

// === Fetch Accounts from Database ===
export const fetchAccountsFromDatabase = async (item_id: string) => {
  try {
    const { data: accounts, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("item_id", item_id);

    if (error) throw error;
    
    console.log(`📊 Found ${accounts?.length || 0} accounts in database for item_id: ${item_id}`);
    
    // Transform database format to UI-compatible format
    const transformedAccounts = (accounts || []).map(account => ({
        ...account,
        // UI expects nested balances object, database has flat fields
        balances: {
          current: account.current_balance || 0,
          available: account.available_balance || 0,
        },
        // Keep all original fields for compatibility
        account_id: account.account_id,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        mask: account.mask,
        official_name: account.official_name,
    }));
    
    console.log("🔄 Transformed accounts for UI compatibility:", transformedAccounts.length);
    if (transformedAccounts.length > 0) {
      console.log("📊 Sample transformed account:", {
        name: transformedAccounts[0].name,
        type: transformedAccounts[0].type,
        balances: transformedAccounts[0].balances,
      });
    }
    
    return transformedAccounts;
  } catch (err) {
    console.error("Error fetching accounts from database:", err);
    return [];
  }
};

// === Supabase Data Fetchers for UI ===

// Fetch recent transactions for a user
export const getRecentTransactions = async (user_id: string, limit: number = 50) => {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(`
        *,
        accounts(name, type, subtype)
      `)
      .eq("user_id", user_id)
      .order("date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    console.log(`📊 Found ${data?.length || 0} recent transactions for user`);
    return data || [];
  } catch (err) {
    console.error("Error fetching recent transactions:", err);
    return [];
  }
};

// Fetch transactions for a specific account
export const getAccountTransactions = async (account_id: string, limit: number = 100) => {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(`
        *,
        accounts(name, type, subtype)
      `)
      .eq("account_id", account_id)
      .order("date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    console.log(`📊 Found ${data?.length || 0} transactions for account ${account_id}`);
    return data || [];
  } catch (err) {
    console.error("Error fetching account transactions:", err);
    return [];
  }
};

// Fetch all accounts for a user (across all items)
export const getAllUserAccounts = async (user_id: string) => {
  try {
    const { data: userItems, error: itemsError } = await supabase
      .from("user_items")
      .select("item_id, institution_name")
      .eq("user_id", user_id);
    
    if (itemsError) throw itemsError;
    
    if (!userItems || userItems.length === 0) {
      return [];
    }
    
    const allItemIds = userItems.map(item => item.item_id);
    
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("*")
      .in("item_id", allItemIds);
    
    if (accountsError) throw accountsError;
    
    // Transform and add institution info
    const transformedAccounts = (accounts || []).map(account => {
      const userItem = userItems.find(item => item.item_id === account.item_id);
      return {
        ...account,
        balances: {
          current: account.current_balance || 0,
          available: account.available_balance || 0,
        },
        institution_name: userItem?.institution_name || "Unknown Institution",
      };
    });
    
    console.log(`📊 Found ${transformedAccounts.length} total accounts for user across ${userItems.length} institutions`);
    return transformedAccounts;
  } catch (err) {
    console.error("Error fetching all user accounts:", err);
    return [];
  }
};

// Fetch transactions by date range
export const getTransactionsByDateRange = async (
  user_id: string, 
  startDate: string, 
  endDate: string,
  limit: number = 200
) => {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(`
        *,
        accounts(name, type, subtype, item_id)
      `)
      .eq("user_id", user_id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    console.log(`📊 Found ${data?.length || 0} transactions between ${startDate} and ${endDate}`);
    return data || [];
  } catch (err) {
    console.error("Error fetching transactions by date range:", err);
    return [];
  }
};

// Get spending by category for analytics
export const getSpendingByCategory = async (user_id: string, days: number = 30) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from("transactions")
      .select("category, amount")
      .eq("user_id", user_id)
      .gte("date", startDate.toISOString().split('T')[0])
      .gt("amount", 0); // Only positive amounts (expenses)
    
    if (error) throw error;
    
    // Group by category and sum amounts
    const categorySpending = (data || []).reduce((acc, transaction) => {
      const category = transaction.category || "Other";
      acc[category] = (acc[category] || 0) + Math.abs(transaction.amount);
      return acc;
    }, {} as Record<string, number>);
    
    // Convert to array and sort by amount
    const sortedCategories = Object.entries(categorySpending)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    
    console.log(`📊 Found spending across ${sortedCategories.length} categories in last ${days} days`);
    return sortedCategories;
  } catch (err) {
    console.error("Error fetching spending by category:", err);
    return [];
  }
};

// === Legacy Support Functions ===
export const clearOldPlaidData = async () => {
  try {
    console.log("🧹 Clearing old Plaid data and cache...");
    
    // Clear old AsyncStorage keys that might conflict
    const keysToRemove = [
      'access_token',
      'plaid_data',
      'cached_accounts',
      'cached_transactions',
      'last_sync_time'
    ];
    
    await Promise.all(keysToRemove.map(key => 
      AsyncStorage.removeItem(key).catch(err => 
        console.log(`Could not remove ${key}:`, err)
      )
    ));
    
    console.log("✅ Old data cleared");
  } catch (error) {
    console.error("Error clearing old data:", error);
  }
};

export const getItemIds = async (): Promise<string[]> => {
  try {
    // Get from new Supabase-based approach
    const items = await getUserItems();
    return items.map(item => item.item_id);
  } catch (error) {
    console.error("Error getting item IDs:", error);
    return [];
  }
};

// === Cache Invalidation Helpers ===
export const invalidateItemCache = async (userId: string, itemId: string) => {
  const keysToRemove = [
    txPreviewKey(userId, itemId),
    balancesKey(userId, itemId),
    // Keep institution cache - it rarely changes
  ];
  
  await Promise.all(keysToRemove.map(key => cacheRemove(key)));
  console.log(`🧹 Invalidated cache for item ${itemId}`);
};

export const invalidateAllUserCache = async (userId: string) => {
  const items = await getUserItems();
  await Promise.all(
    items.map(item => invalidateItemCache(userId, item.item_id))
  );
  console.log(`🧹 Invalidated cache for all ${items.length} user items`);
};

// Manual sync for UI - syncs all connected accounts for the current user
export const syncAllUserTransactions = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    // Invalidate cache first
    await invalidateAllUserCache(user.id);
    
    // Get all user items
    const userItems = await getUserItems();
    
    if (userItems.length === 0) {
      console.log("No connected accounts to sync");
      return { synced: 0 };
    }
    
    console.log(`🔄 Syncing transactions for ${userItems.length} connected accounts...`);
    
    // Sync each account
    const syncPromises = userItems.map(item => 
      syncTransactions(item.item_id).catch(error => {
        console.error(`Failed to sync item ${item.item_id}:`, error);
        return { error: error.message };
      })
    );
    
    const results = await Promise.all(syncPromises);
    const successful = results.filter(result => !result.error).length;
    
    console.log(`✅ Sync completed: ${successful}/${userItems.length} accounts synced successfully`);
    
    return { 
      synced: successful,
      total: userItems.length,
      results 
    };
  } catch (err) {
    console.error("Error in manual sync:", err);
    throw err;
  }
};

const plaidUtils = {
  initializePlaid: fetchInitialData,
  getPlaidLinkToken: fetchLinkToken,
  exchangePublicToken: handlePlaidConnect,
  addNewBankAccount,                       // add additional bank accounts
  getAccounts: fetchAccounts,              // now takes item_id (from Plaid API)
  getAccountsFromDB: fetchAccountsFromDatabase, // from local database
  storeAccounts,                           // store accounts after connection
  syncTransactions,                        // sync via Supabase function
  syncAllUserTransactions,                 // manual sync for UI
  getInvestments: fetchInvestments,        // now takes item_id
  getLiabilities: fetchLiabilities,        // now takes item_id
  disconnectPlaid: handleDisconnect,       // disconnect single item
  disconnectAll: handleDisconnectAll,      // disconnect all items
  
  // Legacy support functions
  clearOldPlaidData,                       // clear old AsyncStorage data
  getItemIds,                              // get all item IDs for this user
  
  // New item management
  getUserItems,                            // get all user items from Supabase
  getPrimaryItemId,                        // get primary/last used item ID
  
  // Cache management
  invalidateItemCache,                     // clear cache for specific item
  invalidateAllUserCache,                  // clear cache for all user items
  
  // Supabase data fetchers for UI
  getRecentTransactions,
  getAccountTransactions,
  getAllUserAccounts,
  getTransactionsByDateRange,
  getSpendingByCategory,
};

export default plaidUtils;
