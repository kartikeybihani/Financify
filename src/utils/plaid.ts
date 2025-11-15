// /app/utils/plaid.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { open, create } from "react-native-plaid-link-sdk";
import {supabase} from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/logger";
import { getPlaidInstitutionId, logInstitutionMapping } from "@/src/components/shared/modal-constants";

const BASE_URL = process.env.EXPO_PUBLIC_APP_BASE_URL || "https://financify-rose.vercel.app";

// === Last Used Item Management ===
import { setLastUsedItemId, getLastUsedItemId } from "@/src/utils/lastUsedItem";

// === Get User Items from Supabase ===
export async function getUserItems() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    logger.info("❌ No authenticated user in getUserItems");
    return [];
  }
  
  logger.info(`🔄 Getting user items for user: ${user.id}`);
  
  // Debug: Check what's actually in the user_items table
  const { data: debugItems, error: debugError } = await supabase
    .from("user_items")
    .select("*")
    .eq("user_id", user.id);
  
  if (debugError) {
    logger.error("❌ Debug query error:", debugError);
  } else {
    logger.info(`🔍 Debug: Found ${debugItems?.length || 0} items in user_items table for user ${user.id}`);
    if (debugItems && debugItems.length > 0) {
      logger.info("🔍 Debug: Sample item:", {
        item_id: debugItems[0].item_id,
        institution_name: debugItems[0].institution_name,
        user_id: debugItems[0].user_id
      });
    }
  }
  
  // Try direct query first to bypass fetchUserItems
  const { data: directItems, error: directError } = await supabase
    .from("user_items")
    .select("item_id, institution_id, institution_name, has_new_accounts, requires_update_mode, last_synced_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  
  if (directError) {
    logger.error("❌ Direct query error:", directError);
    return [];
  }
  
  logger.info(`📦 Direct query found ${directItems?.length || 0} user items:`, directItems?.map(item => ({
    item_id: item.item_id,
    institution_name: item.institution_name,
    has_new_accounts: item.has_new_accounts,
    requires_update_mode: item.requires_update_mode
  })));
  
  return directItems || [];
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
export const fetchLinkToken = async (institution_id?: string, routing_number?: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  const requestBody: any = { mode: "create", user_id: user?.id };
  
  // Add institution_id and routing_number if provided for Institution Select shortcut
  if (institution_id) {
    requestBody.institution_id = institution_id;
    logger.info("🏦 Fetching link token for specific institution:", institution_id);
  }
  
  if (routing_number) {
    requestBody.routing_number = routing_number;
    logger.info("🎯 Using routing number for Institution Select shortcut:", routing_number);
  }

  const res = await fetch(`${BASE_URL}/api/plaid_management`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get link token");
  return data.link_token;
};

// === Institution-Specific Connect Flow ===
export const handleInstitutionConnect = async (
  institutionId: string,
  onSuccess: (itemId: string) => void,
  onExit?: (error?: any) => void
) => {
  try {
    logger.info(`🔄 Starting institution-specific connection for: ${institutionId}`);
    
    // Get the Plaid institution ID
    const plaidInstitutionId = getPlaidInstitutionId(institutionId);
    
    if (!plaidInstitutionId) {
      logger.warn(`⚠️ No Plaid institution ID found for: ${institutionId}, falling back to general flow`);
      logger.info(`🔍 Available institution mappings:`);
      logInstitutionMapping();
      // Fall back to general connection flow
      const linkToken = await fetchLinkToken();
      return handlePlaidConnect(linkToken, onSuccess, onExit);
    }
    
    logger.info(`🏦 Using Plaid institution ID: ${plaidInstitutionId}`);
    
    // Get the routing number for Institution Select shortcut
    const { getInstitutionRoutingNumber } = await import("@/src/components/shared/modal-constants");
    const routingNumber = getInstitutionRoutingNumber(institutionId);
    
    if (routingNumber) {
      logger.info(`🎯 Using Institution Select shortcut with routing number: ${routingNumber}`);
      // Create link token with routing number for Institution Select shortcut
      const linkToken = await fetchLinkToken(institutionId, routingNumber);
      return handlePlaidConnect(linkToken, onSuccess, onExit);
    } else {
      logger.warn(`⚠️ No routing number found for ${institutionId}, using general flow`);
      // Fall back to general connection flow
      const linkToken = await fetchLinkToken();
      return handlePlaidConnect(linkToken, onSuccess, onExit);
    }
  } catch (error) {
    logger.error(`❌ Failed to connect to institution ${institutionId}:`, error);
    
    // Enhanced error logging for debugging
    if (error instanceof Error && error.message.includes('invalid institution_id')) {
      logger.error(`🔍 Institution ID Debug Info:`, {
        requestedInstitution: institutionId,
        plaidInstitutionId: getPlaidInstitutionId(institutionId),
        errorMessage: error instanceof Error ? error.message : String(error),
        suggestion: 'Check if institution is registered in Plaid Dashboard or if ID has changed'
      });
    }
    
    throw error;
  }
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
        logger.info("🔄 Starting token exchange...");
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.id) {
          throw new Error("User not authenticated");
        }

        logger.info("📡 Making API call to exchange_public_token");
        const res = await fetch(`${BASE_URL}/api/exchange_public_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            user_id: user.id,
          }),
        });

        const data = await res.json();
        logger.info("📦 Exchange response:", { ok: res.ok, data });
        
        if (!res.ok) {
          throw new Error(data.error || `Exchange failed: ${res.status}`);
        }

        if (!data.item_id) {
          throw new Error("No item_id returned from exchange");
        }

        // ✅ we only get and keep item_id client-side
        const { item_id } = data;
        await setLastUsedItemId(item_id);
        logger.info("✅ Token exchange successful, item_id:", item_id);
        
        // 🏦 Immediately fetch and store accounts
        try {
          logger.info("🔄 Fetching and storing accounts...");
          await storeAccounts(item_id);
          logger.info("✅ Accounts stored successfully");
        } catch (accountError) {
          logger.error("⚠️ Failed to store accounts (continuing anyway):", accountError);
          // Don't fail the whole connection if account storage fails
        }
        
        // 💸 Trigger initial transaction sync
        try {
          logger.info("🔄 Syncing initial transactions...");
          await syncTransactions(item_id);
          logger.info("✅ Initial transaction sync completed");
        } catch (syncError) {
          logger.error("⚠️ Failed to sync initial transactions (continuing anyway):", syncError);
          // Don't fail the whole connection if initial sync fails
        }
        
        onSuccess(item_id);
      } catch (error) {
        logger.error("❌ Token exchange failed:", error);
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
    logger.info("🏦 Starting process to add new bank account...");
    
    // 1. Get a new link token for adding accounts
    const linkToken = await fetchLinkToken();
    logger.info("🔗 Generated link token for new bank connection");
    
    // 2. Open Plaid Link for the user to select a new bank
    await handlePlaidConnect(
      linkToken,
      (itemId) => {
        logger.info("✅ Successfully added new bank account:", itemId);
        onSuccess?.(itemId);
      },
      (error) => {
        logger.error("❌ Failed to add new bank account:", error);
        onExit?.(error);
      }
    );
    
  } catch (error) {
    logger.error("❌ Error in addNewBankAccount:", error);
    onExit?.(error);
  }
};

// === Update Mode ===
export const getUpdateLinkToken = async (item_id: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  const res = await fetch(`${BASE_URL}/api/plaid_management`, {
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
    logger.info("Opening Plaid link for update");
    create({ token: link_token });
    return new Promise((resolve, reject) => {
      open({
        onSuccess: () => {
          logger.info("✅ Update success");
          resolve(true);
        },
        onExit: (error: any) => {
          logger.info("⛔ Update exited", error);
          reject(error || new Error("Update flow exited"));
        },
      });
    });
  } catch (error) {
    logger.error("Error opening Plaid link:", error);
    throw error;
  }
};

// === Disconnect ===
export const handleDisconnect = async (item_id: string) => {
  logger.info(`🔄 Disconnecting item: ${item_id}`);
  
  if (!item_id) {
    throw new Error("Item ID is required for disconnection");
  }

  const res = await fetch(`${BASE_URL}/api/plaid_management`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "remove_item", item_id }),
  });
  
  const payload = await res.json();
  logger.info("📦 Remove item response:", { ok: res.ok, payload });
  
  if (!res.ok || payload?.error) {
    throw new Error(payload?.error || `Remove failed with status ${res.status}`);
  }
  
  // Clear last used if it matches the removed item
  const lastUsed = await getLastUsedItemId();
  if (lastUsed === item_id) {
    await setLastUsedItemId(''); // Clear it
    logger.info("🧹 Cleared last used item ID");
  }
  
  logger.info("✅ Successfully disconnected item");
  return true;
};

// === Disconnect All Items (for complete cleanup) ===
export const handleDisconnectAll = async () => {
  try {
    const items = await getUserItems();
    logger.info(`🔄 Disconnecting all ${items.length} connected items...`);
    
    if (items.length === 0) {
      logger.info("ℹ️ No items to disconnect");
      return { success: true, disconnected: 0 };
    }
    
    const results = await Promise.allSettled(
      items.map(item => handleDisconnect(item.item_id))
    );
    
    const successful = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.filter(result => result.status === 'rejected').length;
    
    logger.info(`✅ Disconnect summary: ${successful} successful, ${failed} failed`);
    
    // Clear last used item regardless
    await setLastUsedItemId('');
    
    return { 
      success: true, 
      disconnected: successful,
      failed: failed,
      total: items.length 
    };
  } catch (error) {
    logger.error("❌ Error during disconnect all:", error);
    throw error;
  }
};

// === Plaid Data Fetchers ===
// Note: Direct Plaid API calls moved to API endpoints
// Use database functions instead for better performance

// === Bootup Fetch ===
export const fetchInitialData = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      logger.info("❌ No authenticated user found");
      return { accounts: [], transactions: [], investments: {}, liabilities: [] };
    }

    logger.info("🚀 Loading initial data for user:", user.id);

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

    logger.info("📊 Initial data loaded:", {
      institution: institution?.name || "Multiple/Unknown",
      accounts: accounts?.length || 0,
      transactions: transactions?.length || 0,
      investments: 0,
      liabilities: 0,
    });

    return result;
  } catch (error) {
    logger.error("❌ Error fetching initial data:", error);
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

  // Skip SnapTrade investment accounts
  if (item_id.startsWith('snaptrade-')) {
    logger.info(`🚫 Skipping SnapTrade investment account: ${item_id}`);
    return { added: 0, modified: 0, removed: 0, skipped: true };
  }

  try {
    // Use API endpoint directly (more reliable than Supabase function)
    logger.info("📡 Calling transactions_sync API endpoint...");
    const res = await fetch(`${BASE_URL}/api/transactions_sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id, user_id: user.id }),
    });
    
    // Check if response is JSON
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const textResponse = await res.text();
      logger.error(`❌ API returned non-JSON response for ${item_id}:`, textResponse.substring(0, 200));
      throw new Error(`API returned non-JSON response (${res.status}): ${textResponse.substring(0, 100)}...`);
    }
    
    const data = await res.json();
    logger.info("📦 API response:", { status: res.status, data });
    
    if (!res.ok) throw new Error(data.error || "API sync failed");
    
    logger.info("✅ Transaction sync complete via API:", {
      added: data.added,
      modified: data.modified, 
      removed: data.removed
    });
    return data;
    
  } catch (error) {
    logger.error("❌ Transaction sync failed:", error);
    throw error;
  }
};

// === Store Accounts ===
export const storeAccounts = async (item_id: string) => {
  logger.info("🏦 Storing accounts for item_id:", item_id);
  const res = await fetch(`${BASE_URL}/api/store_accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to store accounts");
  logger.info("✅ Accounts stored:", data.stored);
  return data;
};

// === Supabase Data Fetchers for UI ===

// Fetch recent transactions for a user
export const getRecentTransactions = async (user_id: string, limit: number = 50) => {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(`
        *,
        accounts(name, type, subtype),
        recurring_streams:recurring_stream_id (
          stream_id,
          stream_type,
          is_active
        )
      `)
      .eq("user_id", user_id)
      .order("date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    logger.info(`📊 Found ${data?.length || 0} recent transactions for user`);
    
    // Debug: Log categories from database query
    // if (data && data.length > 0) {
    //   const categoriesFromDB = data.map(tx => tx.category).filter(Boolean);
    //   const uniqueCategories = [...new Set(categoriesFromDB)];
    //   console.log("🔍 DEBUG: Categories from getRecentTransactions:");
    //   console.log("Total transactions:", data.length);
    //   console.log("Unique categories:", uniqueCategories.length);
    //   uniqueCategories.forEach((category, index) => {
    //     const count = categoriesFromDB.filter(cat => cat === category).length;
    //     console.log(`${index + 1}. ${category} (${count} transactions)`);
    //   });
    // }
    
    return data || [];
  } catch (err) {
    logger.error("Error fetching recent transactions:", err);
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
    
    logger.info(`📊 Found ${transformedAccounts.length} total accounts for user across ${userItems.length} institutions`);
    return transformedAccounts;
  } catch (err) {
    logger.error("Error fetching all user accounts:", err);
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
    
    logger.info(`📊 Found spending across ${sortedCategories.length} categories in last ${days} days`);
    return sortedCategories;
  } catch (err) {
    logger.error("Error fetching spending by category:", err);
    return [];
  }
};

// === Legacy Support Functions ===
export const clearOldPlaidData = async () => {
  try {
    logger.info("🧹 Clearing old Plaid data and cache...");
    
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
        logger.info(`Could not remove ${key}:`, err)
      )
    ));
    
    logger.info("✅ Old data cleared");
  } catch (error) {
    logger.error("Error clearing old data:", error);
  }
};

export const getItemIds = async (): Promise<string[]> => {
  try {
    // Get from new Supabase-based approach
    const items = await getUserItems();
    return items.map(item => item.item_id);
  } catch (error) {
    logger.error("Error getting item IDs:", error);
    return [];
  }
};


// Manual sync for UI - syncs all connected accounts for the current user
export const syncAllUserTransactions = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    // Clear cache first (simplified approach)
    logger.info("🧹 Clearing cache before sync...");
    
    // Get all user items
    const userItems = await getUserItems();
    
    if (userItems.length === 0) {
      logger.info("No connected accounts to sync");
      return { synced: 0 };
    }
    
    // Filter out SnapTrade investment accounts (they start with "snaptrade-")
    const plaidItems = userItems.filter(item => !item.item_id.startsWith('snaptrade-'));
    const snapTradeItems = userItems.filter(item => item.item_id.startsWith('snaptrade-'));
    
    if (snapTradeItems.length > 0) {
      logger.info(`🚫 Skipping ${snapTradeItems.length} SnapTrade investment accounts (not Plaid accounts)`);
    }
    
    if (plaidItems.length === 0) {
      logger.info("No Plaid accounts to sync (only SnapTrade investment accounts found)");
      return { synced: 0, total: 0 };
    }
    
    logger.info(`🔄 Syncing transactions for ${plaidItems.length} Plaid accounts...`);
    
    // Sync each Plaid account only
    const syncPromises = plaidItems.map(item => 
      syncTransactions(item.item_id).catch(error => {
        logger.error(`Failed to sync item ${item.item_id}:`, error);
        return { error: error.message };
      })
    );
    
    const results = await Promise.all(syncPromises);
    const successful = results.filter(result => !result.error).length;
    
    logger.info(`✅ Sync completed: ${successful}/${plaidItems.length} Plaid accounts synced successfully`);
    
    return { 
      synced: successful,
      total: plaidItems.length,
      results 
    };
  } catch (err) {
    logger.error("Error in manual sync:", err);
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
    
    // Also fetch user-marked recurring transactions (if_recurring = 'yes' but not in a stream)
    // IMPORTANT: Must select plaid_transaction_id because transaction_ids array uses Plaid IDs, not database UUIDs
    const { data: userMarkedTxs, error: userMarkedError } = await supabase
      .from('transactions')
      .select('id, plaid_transaction_id, name, merchant_name, amount, date, new_category, top_category, account_id')
      .eq('user_id', user.id)
      .eq('if_recurring', 'yes')
      .is('recurring_stream_id', null)
      .order('date', { ascending: false });
    
    if (userMarkedError) {
      logger.error("Error fetching user-marked recurring transactions:", userMarkedError);
    }
    
    // Add user-marked transactions as "pseudo-streams" - one stream per transaction
    (userMarkedTxs || []).forEach(tx => {
      const category = tx.new_category || tx.top_category || 'Other';
      // CRITICAL: Use plaid_transaction_id (not database UUID) for transaction_ids array
      // This matches the format used by Plaid recurring streams and allows backfill to work correctly
      const plaidTxId = tx.plaid_transaction_id;
      if (!plaidTxId) {
        logger.warn(`Skipping user-marked transaction ${tx.id} - missing plaid_transaction_id`);
        return;
      }
      
      const streamData = {
        stream_id: `user-marked-${tx.id}`, // Unique ID for user-marked transactions (uses DB UUID for uniqueness)
        description: tx.name || 'User-marked recurring',
        merchant_name: tx.merchant_name || tx.name,
        category: category,
        frequency: 'user-marked', // Special indicator
        average_amount: Math.abs(tx.amount),
        last_amount: Math.abs(tx.amount),
        last_date: tx.date,
        first_date: tx.date,
        is_active: true,
        account_id: tx.account_id,
        transaction_ids: [plaidTxId], // Use Plaid transaction ID, not database UUID
        iso_currency_code: 'USD',
        updated_at: tx.date,
      };
      
      // Categorize based on transaction category
      // If category is 'Subscriptions', add to subscriptions
      // If category is 'Income', add to income
      // If category suggests it's a bill (Housing, utilities, etc.), add to bills
      // Otherwise add to other
      
      const categoryLower = category.toLowerCase();
      if (categoryLower.includes('subscription')) {
        groupedStreams.subscriptions.push(streamData);
      } else if (categoryLower.includes('income') || categoryLower.includes('salary') || categoryLower.includes('wage')) {
        groupedStreams.income.push(streamData);
      } else if (
        categoryLower.includes('housing') || 
        categoryLower.includes('utilities') || 
        categoryLower.includes('bill') ||
        categoryLower.includes('rent') ||
        categoryLower.includes('mortgage')
      ) {
        groupedStreams.bills.push(streamData);
      } else {
        groupedStreams.other.push(streamData);
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
    
    logger.info(`📊 Found ${summary.total} recurring items from database (${streams?.length || 0} streams + ${userMarkedTxs?.length || 0} user-marked):`, summary);
    return { ...groupedStreams, summary };
  } catch (err) {
    logger.error("Error fetching recurring transactions from database:", err);
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
    const allUserItems = item_id 
      ? [{ item_id, institution_name: 'Unknown' }] 
      : await getUserItems();
    
    if (allUserItems.length === 0) {
      logger.info("No connected accounts to refresh recurring transactions");
      return { refreshed: 0, message: "No connected accounts found" };
    }
    
    // Filter out SnapTrade investment accounts (they start with "snaptrade-")
    const userItems = allUserItems.filter(item => !item.item_id.startsWith('snaptrade-'));
    const snapTradeItems = allUserItems.filter(item => item.item_id.startsWith('snaptrade-'));
    
    if (snapTradeItems.length > 0) {
      logger.info(`🚫 Skipping ${snapTradeItems.length} SnapTrade investment accounts for recurring transactions`);
    }
    
    if (userItems.length === 0) {
      logger.info("No Plaid accounts to refresh recurring transactions (only SnapTrade investment accounts found)");
      return { refreshed: 0, message: "No Plaid accounts found" };
    }
    
    logger.info(`🔄 Refreshing recurring transactions for ${userItems.length} Plaid account(s)...`);
    
    // Refresh recurring transactions for each account
    const recurringPromises = userItems.map(async (item) => {
      try {
        const res = await fetch(`${BASE_URL}/api/refresh_financial_data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            item_id: item.item_id,
            user_id: user.id,
            refresh_type: "recurring"
          }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || `Recurring refresh failed for ${item.institution_name}`);
        }
        
        logger.info(`✅ Recurring transactions refreshed for ${item.institution_name || item.item_id}:`, data.summary);
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: true, 
          summary: data.summary,
          stored: data.stored
        };
      } catch (error) {
        logger.error(`Failed to refresh recurring transactions for item ${item.item_id}:`, error);
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
    
    logger.info(`✅ Recurring transactions refresh completed: ${successful}/${userItems.length} items, ${totalStored} streams stored`);
    
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
    logger.error("Error refreshing recurring transactions:", err);
    throw err;
  }
};


// === Get All Recurring Transactions from Database (All Connected Accounts) ===
export const getAllRecurringTransactions = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    logger.info("🔄 Fetching recurring transactions from database...");
    
    // Fetch all recurring streams from database for this user
    // Note: getRecurringTransactionsFromDatabase() already includes user-marked transactions
    // when called without an item_id, so we don't need to fetch them again here.
    const data = await getRecurringTransactionsFromDatabase();
    
    logger.info(`✅ Retrieved recurring transactions from database:`, data.summary);
    return data;
  } catch (err) {
    logger.error("Error fetching all recurring transactions from database:", err);
    return { 
      subscriptions: [], 
      income: [], 
      bills: [], 
      other: [],
      summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 }
    };
  }
};

// === Get Transactions for a Specific Recurring Stream ===
export const getTransactionsForRecurringStream = async (streamId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    logger.info(`🔄 Fetching transactions for recurring stream: ${streamId}`);
    
    // Get the recurring stream to find its transaction IDs
    const { data: stream, error: streamError } = await supabase
      .from("recurring_streams")
      .select("transaction_ids, stream_id, description, merchant_name")
      .eq("user_id", user.id)
      .eq("stream_id", streamId)
      .single();
    
    if (streamError) {
      logger.error("Error fetching recurring stream:", streamError);
      return [];
    }
    
    if (!stream || !stream.transaction_ids || stream.transaction_ids.length === 0) {
      logger.info(`No transaction IDs found for stream: ${streamId}`);
      return [];
    }
    
    // Get all transactions that match the transaction IDs from the stream
    const { data: transactions, error: transactionsError } = await supabase
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
      .eq("user_id", user.id)
      .in("plaid_transaction_id", stream.transaction_ids)
      .order("date", { ascending: false });
    
    if (transactionsError) {
      logger.error("Error fetching transactions for stream:", transactionsError);
      return [];
    }
    
    logger.info(`✅ Found ${transactions?.length || 0} transactions for stream: ${streamId}`);
    return transactions || [];
  } catch (err) {
    logger.error("Error fetching transactions for recurring stream:", err);
    return [];
  }
};

// === Refresh Both Balances and Transactions ===
export const refreshBothBalancesAndTransactions = async (item_id?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    // If no specific item_id, refresh all accounts
    const allUserItems = item_id 
      ? [{ item_id, institution_name: 'Unknown' }] 
      : await getUserItems();
    
    if (allUserItems.length === 0) {
      logger.info("No connected accounts to refresh");
      return { refreshed: 0, message: "No connected accounts found" };
    }
    
    // Filter out SnapTrade investment accounts (they start with "snaptrade-")
    const userItems = allUserItems.filter(item => !item.item_id.startsWith('snaptrade-'));
    const snapTradeItems = allUserItems.filter(item => item.item_id.startsWith('snaptrade-'));
    
    if (snapTradeItems.length > 0) {
      logger.info(`🚫 Skipping ${snapTradeItems.length} SnapTrade investment accounts for combined refresh`);
    }
    
    if (userItems.length === 0) {
      logger.info("No Plaid accounts to refresh (only SnapTrade investment accounts found)");
      return { refreshed: 0, message: "No Plaid accounts found" };
    }
    
    logger.info(`🔄 Refreshing both balances and transactions for ${userItems.length} Plaid account(s)...`);
    
    // Refresh both balances and transactions for each account
    const refreshPromises = userItems.map(async (item) => {
      try {
        const res = await fetch(`${BASE_URL}/api/refresh_financial_data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            item_id: item.item_id,
            user_id: user.id,
            refresh_type: "both"
          }),
        });
        
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || `Combined refresh failed for ${item.institution_name}`);
        }
        
        logger.info(`✅ Combined refresh completed for ${item.institution_name || item.item_id}:`, {
          balances: data.results?.balances?.updated || 0,
          transactions: data.results?.transactions?.request_id ? 'initiated' : 'failed'
        });
        
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: true, 
          balances_updated: data.results?.balances?.updated || 0,
          transactions_request_id: data.results?.transactions?.request_id,
          errors: data.errors || []
        };
      } catch (error) {
        logger.error(`Failed to refresh item ${item.item_id}:`, error);
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
    const totalBalancesUpdated = results
      .filter(result => result.success)
      .reduce((sum, result) => sum + (result.balances_updated || 0), 0);
    
    logger.info(`✅ Combined refresh completed: ${successful}/${userItems.length} items, ${totalBalancesUpdated} balances updated`);
    
    return { 
      refreshed: successful,
      total: userItems.length,
      balancesUpdated: totalBalancesUpdated,
      results,
      message: successful > 0 
        ? `Refreshed ${successful} bank${successful > 1 ? 's' : ''}, updated ${totalBalancesUpdated} balances, initiated transaction refresh`
        : "Failed to refresh any accounts"
    };
  } catch (err) {
    logger.error("Error in combined refresh:", err);
    throw err;
  }
};

// === Enhanced Filtering Functions for Insights ===
// Helper function to get date range from time period
const getDateRangeFromTimePeriod = (timePeriod: string) => {
  const now = new Date();
  let startDate: string;
  let endDate: string = now.toISOString().split('T')[0]; // Today

  switch (timePeriod) {
    case "all":
      // Use an early start date to effectively remove lower bound constraint
      startDate = "2023-01-01";
      break;
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
    categoryIds?: string[]; // empty array means all categories
    limit?: number;
    offset?: number;
  } = {}
) => {
  try {
    const {
      accountIds = [],
      timePeriod = "7days",
      categoryIds = [],
      limit = 50,
      offset = 0
    } = options;

    // Convert category IDs to category names for database filtering
    let categoryNames: string[] = [];
    if (categoryIds.length > 0) {
      // Get category names from the categories table
      const { data: categories, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', categoryIds);
      
      if (categoryError) {
        console.error("❌ Error fetching category names:", categoryError);
      } else {
        categoryNames = categories?.map(cat => cat.name) || [];
      }
    }


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
        ),
        recurring_streams:recurring_stream_id (
          stream_id,
          stream_type,
          is_active
        )
      `)
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .range(offset, offset + limit - 1);

    // Add account filter if specified (multiple accounts)
    if (accountIds.length > 0) {
      // logger.info(`🔍 Filtering by ${accountIds.length} specific accounts:`, accountIds);
      query = query.in("account_id", accountIds);
    } else {
      // logger.info(`🔍 No account filter - showing transactions from ALL accounts`);
    }

    // Add category filter if specified (multiple categories)
    if (categoryNames.length > 0) {
      // logger.info(`🔍 Filtering by ${categoryNames.length} specific categories:`, categoryNames);
      
      // Use COALESCE to fallback from new_category to top_category
      // This handles the case where new_category is null and we need to use top_category
      query = query.or(
        categoryNames.map(cat => 
          `new_category.eq.${cat},and(new_category.is.null,top_category.eq.${cat})`
        ).join(',')
      );
    } else {
      // logger.info(`🔍 No category filter - showing transactions from ALL categories`);
    }

    logger.info(`🔍 Query parameters:`, {
      userId,
      startDate,
      endDate,
      accountIdsLength: accountIds.length,
      categoryIdsLength: categoryIds.length,
      limit,
      offset
    });

    const { data: transactions, error } = await query;

    if (error) {
      console.error("❌ DATABASE QUERY ERROR:", error);
      throw error;
    }


    // Transform transactions to include institution info
    const transformedTransactions = (transactions || []).map(tx => ({
      ...tx,
      institution_name: tx.accounts?.user_items?.institution_name || "Unknown Institution",
      account_name: tx.accounts?.name || "Unknown Account",
      account_mask: tx.accounts?.mask,
    }));


    logger.info(`📊 Found ${transformedTransactions.length} filtered transactions`);
    return transformedTransactions;
  } catch (err) {
    logger.error("Error fetching filtered transactions:", err);
    return [];
  }
};

// Get total count of filtered transactions (for pagination)
export const getFilteredTransactionsCount = async (
  userId: string,
  options: {
    accountIds?: string[];
    timePeriod?: string;
    categoryIds?: string[];
  } = {}
) => {
  try {
    const {
      accountIds = [],
      timePeriod = "7days",
      categoryIds = []
    } = options;

    // Convert category IDs to category names for database filtering
    let categoryNames: string[] = [];
    if (categoryIds.length > 0) {
      // Get category names from the categories table
      const { data: categories, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', categoryIds);
      
      if (categoryError) {
        console.error("❌ Error fetching category names for count:", categoryError);
      } else {
        categoryNames = categories?.map(cat => cat.name) || [];
      }
    }

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

    // Add category filter if specified (multiple categories)
    if (categoryNames.length > 0) {
      // Use COALESCE to fallback from new_category to top_category
      query = query.or(
        categoryNames.map(cat => 
          `new_category.eq.${cat},and(new_category.is.null,top_category.eq.${cat})`
        ).join(',')
      );
    }

    const { count, error } = await query;

    if (error) throw error;

    return count || 0;
  } catch (err) {
    logger.error("Error getting filtered transactions count:", err);
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
    logger.error("Error fetching user accounts for filter:", err);
    return [];
  }
};


const plaidUtils = {
  initializePlaid: fetchInitialData,
  getPlaidLinkToken: fetchLinkToken,
  exchangePublicToken: handlePlaidConnect,
  addNewBankAccount,                       // add additional bank accounts
  storeAccounts,                           // store accounts after connection
  syncAllUserTransactions,                 // manual sync for UI
  refreshBothBalancesAndTransactions,      // refresh both balances and transactions in one call
  getAllRecurringTransactions,             // get recurring transactions for all accounts (from DB)
  getRecurringTransactionsFromDatabase,    // get recurring transactions from database
  refreshRecurringTransactions,            // refresh recurring transactions (Plaid → DB)
  disconnectPlaid: handleDisconnect,       // disconnect single item
  
  // Legacy support functions
  clearOldPlaidData,                       // clear old AsyncStorage data
  getItemIds,                              // get all item IDs for this user
  
  // New item management
  getUserItems,                            // get all user items from Supabase
  getPrimaryItemId,                        // get primary/last used item ID
  
  // Supabase data fetchers for UI
  getRecentTransactions,
  getAllUserAccounts,
  getSpendingByCategory,
  
  // Enhanced filtering functions
  getFilteredTransactions,
  getFilteredTransactionsCount,
  getUserAccountsForFilter,
};

export default plaidUtils;
