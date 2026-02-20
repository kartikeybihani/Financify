// /app/utils/plaid.ts
import AppStorage from "@/src/utils/storage/storage";
import { open, create, LinkSuccess, LinkEvent, LinkExit } from "react-native-plaid-link-sdk";
import {supabase} from "@/src/lib/supabase/supabase";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import logger from "@/src/utils/core/logger";
import { getPlaidInstitutionId } from "@/src/components/shared/modal-constants";
import {
  logLinkEventCallback,
  logLinkExitEvent,
  logLinkSuccessEvent,
} from "./linkAnalytics";

import { API_BASE_URL } from "@/src/utils/core/apiUrl";
import {
  removeSnaptradeBrokerage,
  clearSnaptradeConnection,
} from "@/src/utils/integrations/snaptrade";

const BASE_URL = API_BASE_URL;

// === Last Used Item Management ===
import { setLastUsedItemId, getLastUsedItemId } from "@/src/utils/cache/lastUsedItem";

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
export const fetchLinkToken = async (institution_id?: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  const requestBody: any = { mode: "create", user_id: user?.id };
  
  // Add institution_id if provided
  if (institution_id) {
    requestBody.institution_id = institution_id;
    logger.info("🏦 Fetching link token for specific institution:", institution_id);
  }

  const url = `${BASE_URL}/api/plaid_management`;
  logger.info("🔄 Fetching link token from:", url);
  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const text = await res.text();
  let data: { link_token?: string; error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    logger.error("❌ API returned non-JSON response:", res.status, text.slice(0, 200));
    throw new Error(
      `API returned ${res.status} (expected JSON). Check deployment logs.`
    );
  }
  logger.info("📦 Link token response:", { ok: res.ok, hasToken: !!data?.link_token });
  if (!res.ok) throw new Error(data.error || "Failed to get link token");
  return data.link_token;
};


// === Connect Flow ===
export const handlePlaidConnect = async (
  linkToken: string,
  onSuccess: (itemId: string, institution?: { name: string; id: string }) => void,
  onExit?: (error?: any) => void
) => {
  if (!linkToken) return;

  // Get user ID for analytics tracking
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  create({ token: linkToken }); // init RN SDK
  
  // Prepare open config with analytics tracking
  const openConfig: any = {
    onSuccess: async ({ publicToken, metadata }: LinkSuccess) => {
      try {
        logger.info("🔄 Starting token exchange...");
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.id) {
          throw new Error("User not authenticated");
        }

        // 📊 Log HANDOFF event (successful connection) - use fresh user ID from callback
        if (user.id && metadata) {
          logLinkSuccessEvent(user.id, metadata).catch((err) => {
            logger.error("⚠️ Failed to log HANDOFF event:", err);
          });
        }

        // Extract metadata for duplicate detection
        // Note: LinkInstitution uses 'id' not 'institution_id', but we need 'institution_id' for backend
        // LinkAccount.subtype is a LinkAccountSubtype object with 'type' and 'subtype' properties
        const linkMetadata = metadata ? {
          institution: metadata.institution ? {
            name: metadata.institution.name || null,
            // SDK uses 'id' but backend expects 'institution_id' - use 'id' as fallback
            institution_id: (metadata.institution as any).institution_id || metadata.institution.id || null,
          } : null,
          accounts: metadata.accounts ? metadata.accounts.map(acc => {
            // Extract subtype string from LinkAccountSubtype object
            let subtypeStr: string | null = null;
            if (acc.subtype) {
              if (typeof acc.subtype === 'string') {
                subtypeStr = acc.subtype;
              } else if (typeof acc.subtype === 'object' && acc.subtype !== null) {
                // LinkAccountSubtype has 'subtype' property that contains the string value
                subtypeStr = (acc.subtype as any).subtype || (acc.subtype as any).value || null;
              }
            }
            
            return {
              name: acc.name || null,
              mask: acc.mask || null,
              type: acc.type || null,
              subtype: subtypeStr,
            };
          }) : [],
        } : null;

        logger.info("📡 Making API call to exchange_public_token", {
          hasMetadata: !!linkMetadata,
          institutionId: linkMetadata?.institution?.institution_id,
          accountCount: linkMetadata?.accounts?.length || 0,
        });

        const res = await authenticatedFetch(`${BASE_URL}/api/exchange_public_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            user_id: user.id,
            metadata: linkMetadata,
          }),
        });

        const data = await res.json();
        logger.info("📦 Exchange response:", { ok: res.ok, data });
        
        if (!res.ok) {
          // Handle duplicate item error specifically
          if (res.status === 409 && data.error === "DUPLICATE_ITEM") {
            const duplicateError = new Error(data.message || "This account is already connected");
            (duplicateError as any).code = "DUPLICATE_ITEM";
            (duplicateError as any).institution_name = data.institution_name;
            (duplicateError as any).duplicate_accounts = data.duplicate_accounts;
            throw duplicateError;
          }
          throw new Error(data.error || data.message || `Exchange failed: ${res.status}`);
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
        
        // 💸 Trigger initial transaction sync (includes Finny recurring analysis after tx write)
        try {
          logger.info("🔄 Syncing initial transactions...");
          await syncTransactions(item_id);
          logger.info("✅ Initial transaction sync completed");
        } catch (syncError) {
          logger.error("⚠️ Failed to sync initial transactions (continuing anyway):", syncError);
          // Don't fail the whole connection if initial sync fails
        }

        const institution = linkMetadata?.institution
          ? {
              name: linkMetadata.institution.name || "Bank",
              id: linkMetadata.institution.institution_id || "unknown",
            }
          : undefined;
        onSuccess(item_id, institution);
      } catch (error) {
        logger.error("❌ Token exchange failed:", error);
        // Call onExit with error to trigger error handling
        onExit?.(error);
      }
    },
    onExit: userId
      ? (exit?: LinkExit) => {
          // 📊 Log EXIT event with full metadata
          if (exit) {
            logLinkExitEvent(userId, exit).catch((err) => {
              logger.error("⚠️ Failed to log EXIT event:", err);
            });
          }
          // Call original onExit callback
          onExit?.(exit?.error);
        }
      : (error?: any) => onExit?.(error),
  };

  // Add onEvent callback if user is authenticated (SDK supports it but types don't include it)
  if (userId) {
    openConfig.onEvent = (event: LinkEvent) => {
      // 📊 Log all Link events for analytics
      logLinkEventCallback(userId, event).catch((err) => {
        logger.error("⚠️ Failed to log Link event:", err);
      });
    };
  }

  open(openConfig);
};

// === Add New Bank Account (for existing users) ===
export const addNewBankAccount = async (
  onSuccess?: (itemId: string, institution?: { name: string; id: string }) => void,
  onExit?: (error?: any) => void
) => {
  try {
    logger.info("🏦 Starting process to add new bank account...");
    
    // 1. Get a new link token for adding accounts
    const linkToken = await fetchLinkToken();
    if (!linkToken) {
      throw new Error("Failed to get link token");
    }
    logger.info("🔗 Generated link token for new bank connection");
    
    // 2. Open Plaid Link for the user to select a new bank
    await handlePlaidConnect(
      linkToken,
      (itemId, institution) => {
        logger.info("✅ Successfully added new bank account:", itemId);
        onSuccess?.(itemId, institution);
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
  const res = await authenticatedFetch(`${BASE_URL}/api/plaid_management`, {
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
    
    // Get user ID for analytics tracking
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    
    create({ token: link_token });
    return new Promise((resolve, reject) => {
      const openConfig: any = {
        onSuccess: () => {
          logger.info("✅ Update success");
          resolve(true);
        },
        onExit: userId
          ? (exit?: LinkExit) => {
              // 📊 Log EXIT event for update mode
              if (exit) {
                logLinkExitEvent(userId, exit).catch((err) => {
                  logger.error("⚠️ Failed to log EXIT event:", err);
                });
              }
              logger.info("⛔ Update exited", exit?.error);
              reject(exit?.error || new Error("Update flow exited"));
            }
          : (error: any) => {
              logger.info("⛔ Update exited", error);
              reject(error || new Error("Update flow exited"));
            },
      };

      // Add onEvent callback for update mode tracking
      if (userId) {
        openConfig.onEvent = (event: LinkEvent) => {
          // 📊 Log all Link events for analytics (update mode)
          logLinkEventCallback(userId, event).catch((err) => {
            logger.error("⚠️ Failed to log Link event:", err);
          });
        };
      }

      open(openConfig);
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

  const res = await authenticatedFetch(`${BASE_URL}/api/plaid_management`, {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      logger.info("❌ No authenticated user for disconnect all");
      return { success: false, disconnected: 0, failed: 0, total: 0, errors: [] };
    }

    const items = await getUserItems();
    const plaidItems = items.filter((item) => !item.item_id.startsWith("snaptrade-"));
    const snapTradeItems = items.filter((item) => item.item_id.startsWith("snaptrade-"));
    const totalItems = plaidItems.length + snapTradeItems.length;

    if (totalItems === 0) {
      logger.info("ℹ️ No items to disconnect");
      return { success: true, disconnected: 0, failed: 0, total: 0, errors: [] };
    }

    let plaidSuccessful = 0;
    let plaidFailed = 0;
    const errors: { error: string }[] = [];

    // Disconnect Plaid items
    if (plaidItems.length > 0) {
      logger.info(`🔄 Disconnecting ${plaidItems.length} Plaid item(s)...`);
      const plaidResults = await Promise.allSettled(
        plaidItems.map((item) => handleDisconnect(item.item_id))
      );
      plaidSuccessful = plaidResults.filter((r) => r.status === "fulfilled").length;
      plaidFailed = plaidResults.filter((r) => r.status === "rejected").length;
      plaidResults
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .forEach((r) => errors.push({ error: r.reason instanceof Error ? r.reason.message : String(r.reason) }));
    }

    // Disconnect SnapTrade investment accounts
    let snapTradeSuccessful = 0;
    let snapTradeFailed = 0;
    if (snapTradeItems.length > 0) {
      logger.info(`🔄 Disconnecting ${snapTradeItems.length} SnapTrade investment account(s)...`);
      const snapTradeResults = await Promise.allSettled(
        snapTradeItems.map((item) => {
          const accountId = item.item_id.replace("snaptrade-", "");
          return removeSnaptradeBrokerage(user.id, accountId);
        })
      );
      snapTradeSuccessful = snapTradeResults.filter((r) => r.status === "fulfilled").length;
      snapTradeFailed = snapTradeResults.filter((r) => r.status === "rejected").length;
      snapTradeResults
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .forEach((r) => errors.push({ error: r.reason instanceof Error ? r.reason.message : String(r.reason) }));
    }

    const disconnected = plaidSuccessful + snapTradeSuccessful;
    const failed = plaidFailed + snapTradeFailed;

    logger.info(`✅ Disconnect summary: ${disconnected} successful (Plaid: ${plaidSuccessful}, SnapTrade: ${snapTradeSuccessful}), ${failed} failed`);

    // Clear last used item regardless
    await setLastUsedItemId("");

    // Clear local SnapTrade credentials when all investment accounts are disconnected
    if (snapTradeSuccessful > 0) {
      await clearSnaptradeConnection().catch((err) =>
        logger.warn("⚠️ Failed to clear SnapTrade credentials:", err)
      );
    }

    return {
      success: failed === 0,
      disconnected,
      failed,
      total: totalItems,
      errors,
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
    const res = await authenticatedFetch(`${BASE_URL}/api/transactions_sync`, {
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
    
    if (!res.ok) {
      // Check for ITEM_LOGIN_REQUIRED errors (OAuth invalid token, credentials changed, etc.)
      const errorMessage = data.error || "API sync failed";
      const isLoginRequired = 
        errorMessage.includes("ITEM_LOGIN_REQUIRED") ||
        errorMessage.includes("login details of this item have changed") ||
        errorMessage.includes("OAuth connection") ||
        errorMessage.includes("use Link's update mode") ||
        data.requires_update_mode === true;
      
      if (isLoginRequired) {
        // Create a special error that includes item_id for re-auth handling
        const reAuthError: any = new Error(errorMessage);
        reAuthError.item_id = item_id;
        reAuthError.requires_update_mode = true;
        reAuthError.error_code = "ITEM_LOGIN_REQUIRED";
        throw reAuthError;
      }
      
      throw new Error(errorMessage);
    }
    
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
  const res = await authenticatedFetch(`${BASE_URL}/api/store_accounts`, {
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

/** Get start/end dates for current month only (spending breakdown) */
export const getCurrentMonthRange = () => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const endDate = now.toISOString().split("T")[0];
  return { startDate, endDate };
};

/** Get start/end dates for current month + last month (fast initial load for transactions) */
export const getCurrentAndLastMonthRange = () => {
  const now = new Date();
  const endDate = now.toISOString().split("T")[0];
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .split("T")[0];
  return { startDate, endDate };
};

// Fetch recent transactions for a user
// When options.startDate/endDate provided, filters by date range (for fast initial load of current + last month)
export const getRecentTransactions = async (
  user_id: string,
  limit: number = 50,
  options?: { startDate?: string; endDate?: string }
) => {
  try {
    let query = supabase
      .from("transactions")
      .select(`
        *,
        accounts(name, type, subtype),
        recurring_streams:recurring_stream_id (
          stream_id,
          stream_type,
          is_active
        ),
        categories:category_id (
          id,
          name,
          slug,
          icon,
          color
        )
      `)
      .eq("user_id", user_id)
      .order("date", { ascending: false })
      .limit(limit);

    if (options?.startDate) {
      query = query.gte("date", options.startDate);
    }
    if (options?.endDate) {
      query = query.lte("date", options.endDate);
    }

    const { data, error } = await query;
    
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
        // Convert string balances to numbers, preserve null values
        current_balance: account.current_balance != null ? Number(account.current_balance) : null,
        available_balance: account.available_balance != null ? Number(account.available_balance) : null,
        balances: {
          current: account.current_balance != null ? Number(account.current_balance) : null,
          available: account.available_balance != null ? Number(account.available_balance) : null,
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
      .select("category, new_category, amount")
      .eq("user_id", user_id)
      .gte("date", startDate.toISOString().split('T')[0])
      .gt("amount", 0) // Only positive amounts (expenses)
      .neq("new_category", "INTERNAL_TRANSFER"); // Exclude internal transfers from spending
    
    if (error) throw error;
    
    // Group by category and sum amounts
    // Filter out INTERNAL_TRANSFER transactions (defensive check in case query filter didn't work)
    const categorySpending = (data || [])
      .filter((tx) => tx.new_category !== "INTERNAL_TRANSFER")
      .reduce((acc, transaction) => {
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
    
    
    AppStorage.multiRemoveSync(keysToRemove);
    
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
        
        // Check if error indicates login required
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isLoginRequired = 
          (error as any)?.requires_update_mode === true ||
          (error as any)?.error_code === "ITEM_LOGIN_REQUIRED" ||
          errorMessage.includes("ITEM_LOGIN_REQUIRED") ||
          errorMessage.includes("login details of this item have changed") ||
          errorMessage.includes("OAuth connection") ||
          errorMessage.includes("use Link's update mode");
        
        return { 
          error: errorMessage,
          item_id: item.item_id,
          institution_name: item.institution_name,
          requires_update_mode: isLoginRequired,
          error_code: isLoginRequired ? "ITEM_LOGIN_REQUIRED" : undefined
        };
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

// === Get active recurring streams count (lightweight) ===
export const getRecurringStreamsActiveCount = async (): Promise<number> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return 0;
    const { count, error } = await supabase
      .from("recurring_streams")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("user_dismissed", false);
    if (error) {
      logger.warn("Failed to count recurring streams:", error);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
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
      .eq("user_dismissed", false)
      .order("updated_at", { ascending: false });

    if (item_id) {
      // Include Finny streams (item_id null) alongside item-scoped Plaid streams
      query = query.or(`item_id.eq.${item_id},item_id.is.null`);
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
    
    // Create a set of merchant names from existing Plaid streams to avoid duplicates
    const existingMerchantNames = new Set<string>();
    (streams || []).forEach(stream => {
      if (stream.merchant_name) {
        existingMerchantNames.add(stream.merchant_name.toLowerCase().trim());
      }
      // Also check description as fallback
      if (stream.description) {
        existingMerchantNames.add(stream.description.toLowerCase().trim());
      }
    });
    
    // Group user-marked transactions by merchant_name (or name if no merchant_name)
    // Create one stream per merchant group instead of one per transaction
    const userMarkedGroups = new Map<string, typeof userMarkedTxs>();
    
    (userMarkedTxs || []).forEach(tx => {
      // Check if a Plaid stream already exists for this merchant
      const txMerchantName = (tx.merchant_name || tx.name || '').toLowerCase().trim();
      if (existingMerchantNames.has(txMerchantName)) {
        // Skip this user-marked transaction - a Plaid stream already exists for this merchant
        logger.info(`Skipping user-marked transaction for ${txMerchantName} - Plaid stream already exists`);
        return;
      }
      
      // Use merchant_name as key, fallback to name
      const groupKey = (tx.merchant_name || tx.name || '').toLowerCase().trim();
      if (!groupKey) {
        logger.warn(`Skipping user-marked transaction ${tx.id} - no merchant_name or name`);
        return;
      }
      
      if (!userMarkedGroups.has(groupKey)) {
        userMarkedGroups.set(groupKey, []);
      }
      userMarkedGroups.get(groupKey)!.push(tx);
    });
    
    // Create one stream per merchant group
    userMarkedGroups.forEach((transactions, groupKey) => {
      if (!transactions || transactions.length === 0) return;
      
      // Use first transaction for metadata (merchant_name, category, etc.)
      const firstTx = transactions[0];
      const category = firstTx.new_category || firstTx.top_category || 'Other';
      
      // Collect all plaid_transaction_ids for user-marked stream
      const plaidTxIds: string[] = [];
      let totalAmount = 0;
      let lastAmount = 0;
      let lastDate = firstTx.date;
      let firstDate = firstTx.date;
      
      transactions.forEach(tx => {
        const plaidTxId = tx.plaid_transaction_id;
        if (plaidTxId) {
          plaidTxIds.push(plaidTxId);
        }
        const absAmount = Math.abs(tx.amount);
        totalAmount += absAmount;
        // Track most recent transaction
        if (new Date(tx.date) > new Date(lastDate)) {
          lastDate = tx.date;
          lastAmount = absAmount;
        }
        // Track earliest transaction
        if (new Date(tx.date) < new Date(firstDate)) {
          firstDate = tx.date;
        }
      });
      
      if (plaidTxIds.length === 0) {
        logger.warn(`Skipping user-marked group ${groupKey} - no valid plaid_transaction_ids`);
        return;
      }
      
      const averageAmount = transactions.length > 0 ? totalAmount / transactions.length : 0;
      const merchantName = firstTx.merchant_name || firstTx.name;
      const description = firstTx.name || 'User-marked recurring';
      
      // Create stream_id based on merchant name (hash for uniqueness)
      // Use a simple hash of the merchant name to create a stable ID
      // Simple hash function for React Native compatibility
      let hash = 0;
      for (let i = 0; i < groupKey.length; i++) {
        const char = groupKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      const streamId = `user-marked-group-${Math.abs(hash).toString(36)}`;
      
      const frequency = 'user-marked';
      
      const streamData = {
        stream_id: streamId,
        description: description,
        merchant_name: merchantName,
        category: category,
        frequency: frequency,
        average_amount: averageAmount,
        last_amount: lastAmount,
        last_date: lastDate,
        first_date: firstDate,
        is_active: true,
        account_id: firstTx.account_id, // Use first transaction's account
        transaction_ids: plaidTxIds, // All transaction IDs for this merchant group
        iso_currency_code: 'USD',
        updated_at: lastDate,
      };
      
      // Categorize based on transaction category
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
             groupedStreams.bills.length + groupedStreams.other.length,
    };

    // Fetch inactive streams:
    // 1) Stopped/cancelled - Plaid no longer detects them (is_active=false)
    // 2) User dismissed - user explicitly removed from recurring (user_dismissed=true)
    let stoppedQuery = supabase
      .from("recurring_streams")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", false)
      .eq("user_dismissed", false)
      .order("updated_at", { ascending: false });
    if (item_id) {
      stoppedQuery = stoppedQuery.or(`item_id.eq.${item_id},item_id.is.null`);
    }
    const { data: stoppedStreams } = await stoppedQuery;

    let dismissedQuery = supabase
      .from("recurring_streams")
      .select("*")
      .eq("user_id", user.id)
      .eq("user_dismissed", true)
      .order("updated_at", { ascending: false });
    if (item_id) {
      dismissedQuery = dismissedQuery.or(`item_id.eq.${item_id},item_id.is.null`);
    }
    const { data: dismissedStreams } = await dismissedQuery;

    // Merge and dedupe by stream_id (user-dismissed may overlap with stopped)
    const inactiveStreamsMap = new Map<string, any>();
    [...(stoppedStreams || []), ...(dismissedStreams || [])].forEach((s) => {
      if (!inactiveStreamsMap.has(s.stream_id)) {
        inactiveStreamsMap.set(s.stream_id, s);
      }
    });
    const inactiveStreams = Array.from(inactiveStreamsMap.values()).sort(
      (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    );

    const inactiveList = inactiveStreams.map((s) => ({
      stream_id: s.stream_id,
      description: s.description,
      merchant_name: s.merchant_name,
      category: s.category,
      frequency: s.frequency,
      average_amount: s.average_amount,
      last_amount: s.last_amount,
      last_date: s.last_date,
      first_date: s.first_date,
      is_active: false,
      account_id: s.account_id,
      transaction_ids: s.transaction_ids || [],
      iso_currency_code: s.iso_currency_code || "USD",
      updated_at: s.updated_at,
      user_dismissed: !!s.user_dismissed,
    }));

    logger.info(`📊 Found ${summary.total} recurring items from database (${streams?.length || 0} streams + ${userMarkedTxs?.length || 0} user-marked), ${inactiveList.length} inactive`);
    return { ...groupedStreams, summary, inactive: inactiveList };
  } catch (err) {
    logger.error("Error fetching recurring transactions from database:", err);
    return {
      subscriptions: [],
      income: [],
      bills: [],
      other: [],
      summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 },
      inactive: [],
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
        const res = await authenticatedFetch(`${BASE_URL}/api/refresh_financial_data`, {
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
          const errorMessage = data.error || `Recurring refresh failed for ${item.institution_name}`;
          
          // Check for ITEM_LOGIN_REQUIRED errors (OAuth invalid token, credentials changed, etc.)
          const isLoginRequired = 
            data.requires_update_mode === true ||
            errorMessage.includes("ITEM_LOGIN_REQUIRED") ||
            errorMessage.includes("login details of this item have changed") ||
            errorMessage.includes("OAuth connection") ||
            errorMessage.includes("use Link's update mode");
          
          if (isLoginRequired) {
            return {
              item_id: item.item_id,
              institution_name: item.institution_name,
              success: false,
              error: errorMessage,
              requires_update_mode: true,
              error_code: "ITEM_LOGIN_REQUIRED"
            };
          }
          
          throw new Error(errorMessage);
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
        
        // Check if error indicates login required
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isLoginRequired = 
          errorMessage.includes("ITEM_LOGIN_REQUIRED") ||
          errorMessage.includes("login details of this item have changed") ||
          errorMessage.includes("OAuth connection") ||
          errorMessage.includes("use Link's update mode");
        
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: false, 
          error: errorMessage,
          requires_update_mode: isLoginRequired,
          error_code: isLoginRequired ? "ITEM_LOGIN_REQUIRED" : undefined
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
      summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 },
      inactive: [],
    };
  }
};

// === Get Transactions for a Specific Recurring Stream ===
export const getTransactionsForRecurringStream = async (streamId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error("User not authenticated");
    
    logger.info(`🔄 Fetching transactions for recurring stream: ${streamId}`);
    
    // Check if this is a user-marked pseudo-stream (starts with "user-marked-")
    if (streamId.startsWith("user-marked-")) {
      // Check if it's a grouped stream (user-marked-group-*) or single transaction (user-marked-{uuid})
      if (streamId.startsWith("user-marked-group-")) {
        // This is a grouped user-marked stream - need to find all transactions with same merchant_name
        // We need to decode the merchant name from the stream_id or fetch differently
        // For now, let's fetch all user-marked transactions and filter by matching merchant_name
        // Actually, we should store the merchant_name in a way we can retrieve it
        // For grouped streams, we'll fetch all user-marked transactions and group them client-side
        
        // Fetch all user-marked recurring transactions
        const { data: allUserMarkedTxs, error: allTxError } = await supabase
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
          .eq("if_recurring", "yes")
          .is("recurring_stream_id", null)
          .order("date", { ascending: false });
        
        if (allTxError) {
          logger.error("Error fetching user-marked transactions:", allTxError);
          return [];
        }
        
        // Group by merchant_name (or name if no merchant_name)
        const grouped = new Map<string, typeof allUserMarkedTxs>();
        (allUserMarkedTxs || []).forEach(tx => {
          const key = (tx.merchant_name || tx.name || '').toLowerCase().trim();
          if (!key) return;
          if (!grouped.has(key)) {
            grouped.set(key, []);
          }
          grouped.get(key)!.push(tx);
        });
        
        // Find the group that matches this stream_id
        // We need to match by recreating the stream_id from the merchant name
        for (const [merchantKey, txs] of grouped.entries()) {
          // Recreate hash using same algorithm
          let hash = 0;
          for (let i = 0; i < merchantKey.length; i++) {
            const char = merchantKey.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
          }
          const expectedStreamId = `user-marked-group-${Math.abs(hash).toString(36)}`;
          if (expectedStreamId === streamId) {
            logger.info(`✅ Found ${txs.length} user-marked transactions for grouped stream: ${streamId}`);
            return txs;
          }
        }
        
        logger.warn(`⚠️ Could not find transactions for grouped stream: ${streamId}`);
        return [];
      } else {
        // Legacy: Single transaction stream (user-marked-{uuid})
        const transactionId = streamId.replace("user-marked-", "");
        
        // Fetch the single transaction
        const { data: transaction, error: txError } = await supabase
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
          .eq("id", transactionId)
          .single();
        
        if (txError) {
          logger.error("Error fetching user-marked transaction:", txError);
          return [];
        }
        
        logger.info(`✅ Found user-marked transaction for stream: ${streamId}`);
        return transaction ? [transaction] : [];
      }
    }
    
    // This is a Plaid recurring stream - fetch from recurring_streams table
    const { data: stream, error: streamError } = await supabase
      .from("recurring_streams")
      .select("transaction_ids, stream_id, description, merchant_name")
      .eq("user_id", user.id)
      .eq("stream_id", streamId)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully
    
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
        const res = await authenticatedFetch(`${BASE_URL}/api/refresh_financial_data`, {
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
          const errorMessage = data.error || `Combined refresh failed for ${item.institution_name}`;
          
          // Check for ITEM_LOGIN_REQUIRED errors (OAuth invalid token, credentials changed, etc.)
          const isLoginRequired = 
            data.requires_update_mode === true ||
            errorMessage.includes("ITEM_LOGIN_REQUIRED") ||
            errorMessage.includes("login details of this item have changed") ||
            errorMessage.includes("OAuth connection") ||
            errorMessage.includes("use Link's update mode");
          
          if (isLoginRequired) {
            return {
              item_id: item.item_id,
              institution_name: item.institution_name,
              success: false,
              error: errorMessage,
              requires_update_mode: true,
              error_code: "ITEM_LOGIN_REQUIRED"
            };
          }
          
          throw new Error(errorMessage);
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
        
        // Check if error indicates login required
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isLoginRequired = 
          errorMessage.includes("ITEM_LOGIN_REQUIRED") ||
          errorMessage.includes("login details of this item have changed") ||
          errorMessage.includes("OAuth connection") ||
          errorMessage.includes("use Link's update mode");
        
        return { 
          item_id: item.item_id, 
          institution_name: item.institution_name,
          success: false, 
          error: errorMessage,
          requires_update_mode: isLoginRequired,
          error_code: isLoginRequired ? "ITEM_LOGIN_REQUIRED" : undefined
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
    default:
      // Check if it's a month-year format (e.g., "january2024", "december2025")
      const monthYearMatch = timePeriod.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)(\d{4})$/i);
      if (monthYearMatch) {
        const monthName = monthYearMatch[1].toLowerCase();
        const year = parseInt(monthYearMatch[2], 10);
        
        const monthMap: { [key: string]: number } = {
          january: 0,
          february: 1,
          march: 2,
          april: 3,
          may: 4,
          june: 5,
          july: 6,
          august: 7,
          september: 8,
          october: 9,
          november: 10,
          december: 11,
        };
        
        const monthIndex = monthMap[monthName];
        if (monthIndex !== undefined) {
          // First day of the month
          const firstDay = new Date(year, monthIndex, 1);
          startDate = firstDay.toISOString().split('T')[0];
          
          // Last day of the month (first day of next month minus 1 day)
          const lastDay = new Date(year, monthIndex + 1, 0);
          endDate = lastDay.toISOString().split('T')[0];
          break;
        }
      }
      
      // Default to last 30 days if no match
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
    searchQuery?: string; // search by transaction name or category
    startDate?: string; // optional override for fast initial load (e.g. 2 months)
    endDate?: string; // optional override
  } = {}
) => {
  try {
    const {
      accountIds = [],
      timePeriod = "all", // Default to "all" to match UI default
      categoryIds = [],
      limit = 50,
      offset = 0,
      searchQuery = "",
    startDate: startDateOverride,
    endDate: endDateOverride,
    } = options;

    // Use override dates if provided (for fast initial load); else derive from timePeriod
    const { startDate, endDate } =
      startDateOverride && endDateOverride
        ? { startDate: startDateOverride, endDate: endDateOverride }
        : getDateRangeFromTimePeriod(timePeriod || "all");

    // Note: We now use category_id directly for filtering (more secure and performant)
    // categoryNames is kept for legacy fallback support only
    let categoryNames: string[] = [];
    if (categoryIds.length > 0) {
      // Validate that category IDs exist (optional - for error checking)
      const { data: categories, error: categoryError } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', categoryIds);
      
      if (categoryError) {
        console.error("❌ Error validating category IDs:", categoryError);
      } else {
        // Store names for legacy fallback (if needed)
        categoryNames = categories?.map(cat => cat.name) || [];
      }
    }

    logger.info(`📅 Time filter applied:`, {
      timePeriod: timePeriod || "all",
      startDate,
      endDate,
      daysDiff: Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
    });

    // Build query
    // NOTE: INTERNAL_TRANSFER transactions are NOT filtered here - they should be visible in transactions section
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
        ),
        categories:category_id (
          id,
          name,
          slug,
          icon,
          color
        )
      `)
      .eq("user_id", userId)
      // Filter by date field (posted date) - this is the primary date field in the database
      // Note: authorized_date is optional and may differ, but we filter by posted date for consistency
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
    // Use category_id for filtering (more secure and performant than name matching)
    if (categoryIds.length > 0) {
      // Filter by category_id directly (preferred method)
      query = query.in("category_id", categoryIds);
    } else if (categoryNames.length > 0) {
      // Fallback: If categoryIds not provided but categoryNames are, 
      // we need to filter by name (legacy support, but should use categoryIds)
      // logger.info(`🔍 Filtering by ${categoryNames.length} specific categories:`, categoryNames);
      
      // Use COALESCE to fallback from category_id (via join) to new_category to top_category
      // This handles the case where category_id is null and we need to use name fallbacks
      query = query.or(
        categoryNames.map(cat => 
          `categories.name.eq.${cat},and(category_id.is.null,new_category.eq.${cat}),and(category_id.is.null,new_category.is.null,top_category.eq.${cat})`
        ).join(',')
      );
    } else {
      // logger.info(`🔍 No category filter - showing transactions from ALL categories`);
    }

    // Add search query filter if specified (search by name or effective category)
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      // Search in transaction name (case-insensitive)
      // Search in category fields: new_category if exists, else top_category
      // Note: We can't directly filter on joined categories.name in PostgREST or() clauses
      // Instead, we search in the denormalized fields (new_category, top_category)
      // The joined categories.name is available for display but not for filtering
      // PostgREST uses * as wildcard for ilike (not %)
      // Pattern: name matches OR (new_category matches AND new_category is not null) 
      //          OR (top_category matches AND new_category is null)
      // For transactions with category_id, the category name will be matched via 
      // the joined categories table, but we filter client-side after fetch if needed
      query = query.or(
        `name.ilike.*${searchTerm}*,and(new_category.ilike.*${searchTerm}*,new_category.not.is.null),and(top_category.ilike.*${searchTerm}*,new_category.is.null)`
      );
    }

    logger.info(`🔍 Query parameters:`, {
      userId,
      startDate,
      endDate,
      accountIdsLength: accountIds.length,
      categoryIdsLength: categoryIds.length,
      searchQuery: searchQuery || "none",
      limit,
      offset
    });

    const { data: transactions, error } = await query;

    if (error) {
      console.error("❌ DATABASE QUERY ERROR:", error);
      throw error;
    }

    // Filter transactions by joined category name if search query exists
    // PostgREST can't filter on joined table fields in complex OR clauses,
    // so we do it client-side for transactions with category_id
    let filteredTransactions = transactions || [];
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim().toLowerCase();
      filteredTransactions = (transactions || []).filter(tx => {
        // Transaction name is already filtered by PostgREST
        const nameMatch = (tx.name || "").toLowerCase().includes(searchTerm);
        
        // Check joined category name if category_id exists
        const categoryNameMatch = tx.categories?.name?.toLowerCase().includes(searchTerm);
        
        // new_category and top_category are already filtered by PostgREST
        // Just need to check joined category name
        return nameMatch || !!categoryNameMatch;
      });
    }

    // Transform transactions to include institution info
    const transformedTransactions = filteredTransactions.map(tx => ({
      ...tx,
      institution_name: tx.accounts?.user_items?.institution_name || "Unknown Institution",
      account_name: tx.accounts?.name || "Unknown Account",
      account_mask: tx.accounts?.mask,
    }));

    // Log date range of returned transactions for debugging
    if (transformedTransactions.length > 0) {
      const dates = transformedTransactions.map(tx => tx.date || tx.authorized_date).filter(Boolean).sort();
      const earliestDate = dates[0];
      const latestDate = dates[dates.length - 1];
      logger.info(`📊 Found ${transformedTransactions.length} filtered transactions`, {
        dateRange: {
          earliest: earliestDate,
          latest: latestDate,
          expectedStart: startDate,
          expectedEnd: endDate,
        },
        sampleDates: dates.slice(0, 5).concat(dates.slice(-5))
      });
    } else {
      logger.info(`📊 Found 0 filtered transactions for date range ${startDate} to ${endDate}`);
    }
    
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
    searchQuery?: string; // search by transaction name or category
  } = {}
) => {
  try {
    const {
      accountIds = [],
      timePeriod = "all", // Default to "all" to match UI default
      categoryIds = [],
      searchQuery = ""
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
    // Ensure timePeriod is valid, fallback to "all" if undefined/null/empty
    const validTimePeriod = timePeriod || "all";
    const { startDate, endDate } = getDateRangeFromTimePeriod(validTimePeriod);

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

    // Add search query filter if specified (search by name or effective category)
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      // Search in transaction name (case-insensitive)
      // Search in category fields: new_category if exists, else top_category
      // Note: We can't filter on joined categories.name in count queries either
      // PostgREST uses * as wildcard for ilike (not %)
      // Pattern: name matches OR (new_category matches AND new_category is not null) 
      //          OR (top_category matches AND new_category is null)
      // For accurate count with category_id, we'd need to fetch and count client-side
      // but this is acceptable for now as most transactions will have category_id set
      query = query.or(
        `name.ilike.*${searchTerm}*,and(new_category.ilike.*${searchTerm}*,new_category.not.is.null),and(top_category.ilike.*${searchTerm}*,new_category.is.null)`
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
