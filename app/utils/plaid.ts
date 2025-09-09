// /app/utils/plaid.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { open, create } from "react-native-plaid-link-sdk";
import {supabase} from "../lib/supabase/supabase";

const BASE_URL = "https://financify-rose.vercel.app";

// === Last Used Item Management ===
import { setLastUsedItemId, getLastUsedItemId } from "../../src/utils/lastUsedItem";
import { fetchUserItems } from "../../src/utils/supabase";
import { 
  cacheRemove, 
  txPreviewKey, 
  balancesKey, 
  institutionKey, 
  lastSyncKey 
} from "../../src/utils/cache";

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

// === Register Snaptrade User ===
export const registerSnaptradeUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  const res = await fetch(`${BASE_URL}/api/link_tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "snaptrade", user_id: user?.id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to register Snaptrade user");
  console.log("✅ Snaptrade user registered successfully: ", data);
  return data.snaptrade;
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

// === Sync Transactions (with fallback) ===
export const syncTransactions = async (item_id: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("User not authenticated");

  try {
    // Try Supabase function first
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    
    if (SUPABASE_URL) {
      console.log("📡 Calling Supabase function for sync...");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-transactions`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ item_id, user_id: user.id }),
      });
      
      const data = await res.json();
      console.log("📦 Supabase function response:", { status: res.status, data });
      
      if (res.ok) {
        console.log("✅ Transaction sync complete via Supabase function:", {
          added: data.added,
          modified: data.modified, 
          removed: data.removed
        });
        return data;
      } else {
        console.warn("⚠️ Supabase function failed, trying API fallback:", data);
      }
    }
    
    // Fallback to API endpoint (with fixed category storage)
    console.log("📡 Using API endpoint fallback...");
    const res = await fetch(`${BASE_URL}/api/transactions_sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id }),
    });
    
    const data = await res.json();
    console.log("📦 API response:", { status: res.status, data });
    
    if (!res.ok) throw new Error(data.error || "API sync failed");
    
    console.log("✅ Transaction sync complete via API:", data);
    return data;
    
  } catch (error) {
    console.error("❌ Transaction sync failed:", error);
    throw error;
  }
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

// === Refresh Latest Data (Plaid transactions/refresh) ===
export const refreshPlaidData = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    // Get all user items
    const userItems = await getUserItems();
    
    if (userItems.length === 0) {
      console.log("No connected accounts to refresh");
      return { refreshed: 0, message: "No connected accounts found" };
    }
    
    console.log(`🔄 Requesting fresh data for ${userItems.length} connected accounts...`);
    
    // Request refresh for each account
    const refreshPromises = userItems.map(async (item) => {
      try {
        const res = await fetch(`${BASE_URL}/api/refresh_transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            item_id: item.item_id,
            user_id: user.id 
          }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || `Refresh failed for ${item.institution_name}`);
        }
        
        console.log(`✅ Refresh requested for ${item.institution_name}:`, data.request_id);
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: true, 
          request_id: data.request_id 
        };
      } catch (error) {
        console.error(`Failed to refresh item ${item.item_id}:`, error);
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    const results = await Promise.all(refreshPromises);
    const successful = results.filter(result => result.success).length;
    
    console.log(`✅ Refresh requests completed: ${successful}/${userItems.length} accounts`);
    
    return { 
      refreshed: successful,
      total: userItems.length,
      results,
      message: successful > 0 
        ? `Refresh initiated for ${successful} account${successful > 1 ? 's' : ''}. New data will arrive via webhook soon.`
        : "Failed to initiate refresh for any accounts"
    };
  } catch (err) {
    console.error("Error in data refresh:", err);
    throw err;
  }
};

// === Get Recurring Transactions from Database (Subscriptions, Bills, etc.) ===
export const getRecurringTransactionsFromDatabase = async (item_id?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    // If no specific item_id, get all user items
    let query = supabase
      .from("recurring_streams")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (item_id) {
      query = query.eq("item_id", item_id);
    }
    
    const { data: streams, error } = await query;
    
    if (error) throw error;
    
    // Group streams by type
    const groupedStreams = {
      subscriptions: [] as any[],
      income: [] as any[],
      bills: [] as any[],
      other: [] as any[]
    };
    
    (streams || []).forEach(stream => {
      const streamData = {
        stream_id: stream.stream_id,
        description: stream.description,
        merchant_name: stream.merchant_name,
        category: stream.category,
        frequency: stream.frequency,
        average_amount: stream.average_amount,
        last_amount: stream.last_amount,
        last_date: stream.last_date,
        first_date: stream.first_date,
        is_active: stream.is_active,
        account_id: stream.account_id,
        transaction_ids: stream.transaction_ids,
        iso_currency_code: stream.iso_currency_code,
        updated_at: stream.updated_at,
      };
      
      switch (stream.stream_type) {
        case 'subscription':
          groupedStreams.subscriptions.push(streamData);
          break;
        case 'income':
          groupedStreams.income.push(streamData);
          break;
        case 'bill':
          groupedStreams.bills.push(streamData);
          break;
        case 'other':
          groupedStreams.other.push(streamData);
          break;
      }
    });
    
    const summary = {
      subscriptions: groupedStreams.subscriptions.length,
      income: groupedStreams.income.length,
      bills: groupedStreams.bills.length,
      other: groupedStreams.other.length,
      total: groupedStreams.subscriptions.length + groupedStreams.income.length + 
             groupedStreams.bills.length + groupedStreams.other.length
    };
    
    console.log(`📊 Found ${summary.total} recurring streams from database:`, summary);
    return { ...groupedStreams, summary };
  } catch (err) {
    console.error("Error fetching recurring transactions from database:", err);
    return { 
      subscriptions: [], 
      income: [], 
      bills: [], 
      other: [],
      summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 }
    };
  }
};

// === Refresh Recurring Transactions (Plaid → Database) ===
export const refreshRecurringTransactions = async (item_id?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    // If no specific item_id, refresh all user items
    const userItems = item_id 
      ? [{ item_id, institution_name: 'Unknown' }] 
      : await getUserItems();
    
    if (userItems.length === 0) {
      console.log("No connected accounts to refresh recurring transactions");
      return { refreshed: 0, message: "No connected accounts found" };
    }
    
    console.log(`🔄 Refreshing recurring transactions for ${userItems.length} account(s)...`);
    
    // Refresh recurring transactions for each account
    const recurringPromises = userItems.map(async (item) => {
      try {
        const res = await fetch(`${BASE_URL}/api/refresh_recurring_transactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            item_id: item.item_id,
            user_id: user.id 
          }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || `Recurring refresh failed for ${item.institution_name}`);
        }
        
        console.log(`✅ Recurring transactions refreshed for ${item.institution_name || item.item_id}:`, data.summary);
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: true, 
          summary: data.summary,
          stored: data.stored
        };
      } catch (error) {
        console.error(`Failed to refresh recurring transactions for item ${item.item_id}:`, error);
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    const results = await Promise.all(recurringPromises);
    const successful = results.filter(result => result.success).length;
    const totalStored = results
      .filter(result => result.success)
      .reduce((sum, result) => sum + (result.stored || 0), 0);
    
    console.log(`✅ Recurring transactions refresh completed: ${successful}/${userItems.length} items, ${totalStored} streams stored`);
    
    return { 
      refreshed: successful,
      total: userItems.length,
      streamsStored: totalStored,
      results,
      message: successful > 0 
        ? `Refreshed recurring transactions for ${successful} bank${successful > 1 ? 's' : ''}, stored ${totalStored} streams`
        : "Failed to refresh recurring transactions for any accounts"
    };
  } catch (err) {
    console.error("Error refreshing recurring transactions:", err);
    throw err;
  }
};

// === Legacy function for backward compatibility ===
export const getRecurringTransactions = async (item_id?: string) => {
  console.log("⚠️ Using legacy getRecurringTransactions - consider using getRecurringTransactionsFromDatabase");
  return getRecurringTransactionsFromDatabase(item_id);
};

// === Get All Recurring Transactions from Database (All Connected Accounts) ===
export const getAllRecurringTransactions = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    console.log("🔄 Fetching recurring transactions from database...");
    
    // Fetch all recurring streams from database for this user
    const data = await getRecurringTransactionsFromDatabase();
    
    console.log(`✅ Retrieved recurring transactions from database:`, data.summary);
    return data;
  } catch (err) {
    console.error("Error fetching all recurring transactions from database:", err);
    return { 
      subscriptions: [], 
      income: [], 
      bills: [], 
      other: [],
      summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 }
    };
  }
};

// === Refresh Account Balances ===
export const refreshAccountBalances = async (item_id?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    // If no specific item_id, refresh all accounts
    const userItems = item_id 
      ? [{ item_id, institution_name: 'Unknown' }] 
      : await getUserItems();
    
    if (userItems.length === 0) {
      console.log("No connected accounts to refresh balances");
      return { refreshed: 0, message: "No connected accounts found" };
    }
    
    console.log(`🏦 Refreshing balances for ${userItems.length} account(s)...`);
    
    // Refresh balances for each account
    const balancePromises = userItems.map(async (item) => {
      try {
        const res = await fetch(`${BASE_URL}/api/refresh_balances`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            item_id: item.item_id,
            user_id: user.id 
          }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || `Balance refresh failed for ${item.institution_name}`);
        }
        
        console.log(`✅ Balances refreshed for ${item.institution_name || item.item_id}:`, data.updated);
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: true, 
          updated: data.updated 
        };
      } catch (error) {
        console.error(`Failed to refresh balances for item ${item.item_id}:`, error);
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });
    
    const results = await Promise.all(balancePromises);
    const successful = results.filter(result => result.success).length;
    const totalUpdated = results
      .filter(result => result.success)
      .reduce((sum, result) => sum + (result.updated || 0), 0);
    
    console.log(`✅ Balance refresh completed: ${successful}/${userItems.length} items, ${totalUpdated} accounts updated`);
    
    return { 
      refreshed: successful,
      total: userItems.length,
      accountsUpdated: totalUpdated,
      results,
      message: successful > 0 
        ? `Updated balances for ${totalUpdated} accounts across ${successful} bank${successful > 1 ? 's' : ''}`
        : "Failed to refresh balances for any accounts"
    };
  } catch (err) {
    console.error("Error refreshing account balances:", err);
    throw err;
  }
};

// === Complete Post Re-Auth Data Refresh ===
export const performCompleteDataRefresh = async (item_id?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    console.log("🔄 Starting complete data refresh...");
    
    const refreshResults = {
      refreshRequested: false,
      transactionsSynced: false,
      balancesRefreshed: false,
      accountsUpdated: false,
      recurringTransactionsRefreshed: false,
      errors: [] as string[]
    };
    
    // 1. Request fresh data from Plaid (triggers webhook)
    try {
      await refreshPlaidData();
      refreshResults.refreshRequested = true;
      console.log("✅ Fresh data requested from Plaid");
    } catch (error) {
      const errorMsg = `Failed to request fresh data: ${error instanceof Error ? error.message : String(error)}`;
      refreshResults.errors.push(errorMsg);
      console.warn("⚠️", errorMsg);
    }
    
    // 2. Refresh account balances immediately
    try {
      const balanceResult = await refreshAccountBalances(item_id);
      refreshResults.balancesRefreshed = balanceResult.refreshed > 0;
      console.log("✅ Account balances refreshed:", balanceResult.message);
    } catch (error) {
      const errorMsg = `Failed to refresh balances: ${error instanceof Error ? error.message : String(error)}`;
      refreshResults.errors.push(errorMsg);
      console.warn("⚠️", errorMsg);
    }
    
    // 3. Sync transactions immediately
    try {
      await syncAllUserTransactions();
      refreshResults.transactionsSynced = true;
      console.log("✅ Transactions synced");
    } catch (error) {
      const errorMsg = `Failed to sync transactions: ${error instanceof Error ? error.message : String(error)}`;
      refreshResults.errors.push(errorMsg);
      console.warn("⚠️", errorMsg);
    }
    
    // 4. Refresh recurring transactions
    try {
      const recurringResult = await refreshRecurringTransactions(item_id);
      refreshResults.recurringTransactionsRefreshed = recurringResult.refreshed > 0;
      console.log("✅ Recurring transactions refreshed:", recurringResult.message);
    } catch (error) {
      const errorMsg = `Failed to refresh recurring transactions: ${error instanceof Error ? error.message : String(error)}`;
      refreshResults.errors.push(errorMsg);
      console.warn("⚠️", errorMsg);
    }
    
    console.log("✅ Complete data refresh finished:", refreshResults);
    return refreshResults;
    
  } catch (error) {
    console.error("❌ Complete data refresh failed:", error);
    throw error;
  }
};

// === Enhanced Filtering Functions for Insights ===
// Helper function to get date range from time period
export const getDateRangeFromTimePeriod = (timePeriod: string) => {
  const now = new Date();
  let startDate: string;
  let endDate: string = now.toISOString().split('T')[0]; // Today

  switch (timePeriod) {
    case "7days":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case "30days":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case "3months":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case "6months":
      startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case "12months":
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case "december2024":
      startDate = "2024-12-01";
      endDate = "2024-12-31";
      break;
    case "november2024":
      startDate = "2024-11-01";
      endDate = "2024-11-30";
      break;
    case "october2024":
      startDate = "2024-10-01";
      endDate = "2024-10-31";
      break;
    default:
      // Default to last 30 days
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  return { startDate, endDate };
};

// Get filtered transactions with pagination support
export const getFilteredTransactions = async (
  userId: string,
  options: {
    accountIds?: string[]; // empty array means all accounts
    timePeriod?: string;
    limit?: number;
    offset?: number;
  } = {}
) => {
  try {
    const {
      accountIds = [],
      timePeriod = "30days",
      limit = 50,
      offset = 0
    } = options;

    // Get date range
    const { startDate, endDate } = getDateRangeFromTimePeriod(timePeriod);

    // Build query
    let query = supabase
      .from("transactions")
      .select(`
        *,
        accounts:account_id (
          name,
          mask,
          type,
          subtype,
          item_id,
          user_items:item_id (
            institution_name
          )
        )
      `)
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    // Add account filter if specified (multiple accounts)
    if (accountIds.length > 0) {
      query = query.in("account_id", accountIds);
    }

    const { data: transactions, error } = await query;

    if (error) throw error;

    // Transform transactions to include institution info
    const transformedTransactions = (transactions || []).map(tx => ({
      ...tx,
      institution_name: tx.accounts?.user_items?.institution_name || "Unknown Institution",
      account_name: tx.accounts?.name || "Unknown Account",
      account_mask: tx.accounts?.mask,
    }));

    console.log(`📊 Found ${transformedTransactions.length} filtered transactions`);
    return transformedTransactions;
  } catch (err) {
    console.error("Error fetching filtered transactions:", err);
    return [];
  }
};

// Get total count of filtered transactions (for pagination)
export const getFilteredTransactionsCount = async (
  userId: string,
  options: {
    accountIds?: string[];
    timePeriod?: string;
  } = {}
) => {
  try {
    const {
      accountIds = [],
      timePeriod = "30days"
    } = options;

    // Get date range
    const { startDate, endDate } = getDateRangeFromTimePeriod(timePeriod);

    // Build count query
    let query = supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate);

    // Add account filter if specified (multiple accounts)
    if (accountIds.length > 0) {
      query = query.in("account_id", accountIds);
    }

    const { count, error } = await query;

    if (error) throw error;

    return count || 0;
  } catch (err) {
    console.error("Error getting filtered transactions count:", err);
    return 0;
  }
};

// Get user accounts formatted for filter modal
export const getUserAccountsForFilter = async (userId: string) => {
  try {
    const accounts = await getAllUserAccounts(userId);
    
    // Transform for filter modal use
    const transformed = accounts.map(account => ({
      account_id: account.account_id,
      name: account.name,
      mask: account.mask,
      institution_name: account.institution_name,
      type: account.type,
      subtype: account.subtype,
    }));
    
    return transformed;
  } catch (err) {
    console.error("Error fetching user accounts for filter:", err);
    return [];
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
  refreshPlaidData,                        // refresh latest data (Plaid transactions/refresh)
  refreshAccountBalances,                  // refresh account balances (Plaid accounts/balance/get)
  performCompleteDataRefresh,              // complete post re-auth data refresh
  getRecurringTransactions,                // get recurring transactions for one account (legacy)
  getAllRecurringTransactions,             // get recurring transactions for all accounts (from DB)
  getRecurringTransactionsFromDatabase,    // get recurring transactions from database
  refreshRecurringTransactions,            // refresh recurring transactions (Plaid → DB)
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
  
  // Enhanced filtering functions
  getFilteredTransactions,
  getFilteredTransactionsCount,
  getUserAccountsForFilter,
  getDateRangeFromTimePeriod,
};

export default plaidUtils;
