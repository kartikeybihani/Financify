// /app/utils/plaid.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { open, create } from "react-native-plaid-link-sdk";
import {supabase} from "../lib/supabase/supabase";

const BASE_URL = "https://financify-rose.vercel.app";

// === Multiple Item ID Management ===
const ITEM_IDS_KEY = "plaid:item_ids";

export async function getItemIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(ITEM_IDS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addItemId(itemId: string) {
  const ids = await getItemIds();
  if (!ids.includes(itemId)) {
    ids.push(itemId);
    await AsyncStorage.setItem(ITEM_IDS_KEY, JSON.stringify(ids));
  }
}

export async function removeItemId(itemId: string) {
  const ids = await getItemIds();
  const next = ids.filter(id => id !== itemId);
  await AsyncStorage.setItem(ITEM_IDS_KEY, JSON.stringify(next));
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
        await addItemId(item_id);
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
  const res = await fetch(`${BASE_URL}/api/remove_item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id }),
  });
  const payload = await res.json();
  if (!res.ok || payload?.error) throw new Error(payload?.error || "Remove failed");
  await removeItemId(item_id);
  return true;
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
  const ids = await getItemIds();
  const item_id = ids[0]; // choose active one; later, let user pick
  if (!item_id) return { accounts: [], investments: {}, liabilities: [] };

  console.log("🚀 Loading initial data for item_id:", item_id);

  try {
    // Get accounts from local database
    const accounts = await fetchAccountsFromDatabase(item_id);
    
    // Get institution info from user_items table
    const { data: userItem, error } = await supabase
      .from("user_items")
      .select("institution_name, institution_id")
      .eq("item_id", item_id)
      .single();

    const institution = userItem && !error ? {
      name: userItem.institution_name,
      institution_id: userItem.institution_id
    } : null;

    // For now, return empty data for investments, liabilities, identity
    // These will be populated later when we add local storage for them
    const result = {
      institution,
      accounts,
      identity: [],
      investments: { holdings: [], securities: [], investmentTransactions: [] },
      liabilities: [],
      item_id
    };

    console.log("📊 Initial data loaded:", {
      institution: institution?.name || "Unknown",
      accounts: accounts?.length || 0,
      investments: 0,
      liabilities: 0,
    });

    return result;
  } catch (error) {
    console.error("❌ Error fetching initial data:", error);
    return { 
      accounts: [], 
      investments: { holdings: [], securities: [], investmentTransactions: [] }, 
      liabilities: [],
      identity: [],
      institution: null
    };
  }
};

// === Sync Transactions ===
export const syncTransactions = async (item_id: string) => {
  const res = await fetch(`${BASE_URL}/api/transactions_sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sync failed");
  return data; // { added, modified, removed }
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
    return accounts || [];
  } catch (err) {
    console.error("Error fetching accounts from database:", err);
    return [];
  }
};

const plaidUtils = {
  initializePlaid: fetchInitialData,
  getPlaidLinkToken: fetchLinkToken,
  exchangePublicToken: handlePlaidConnect,
  getAccounts: fetchAccounts,              // now takes item_id (from Plaid API)
  getAccountsFromDB: fetchAccountsFromDatabase, // from local database
  storeAccounts,                           // store accounts after connection
  syncTransactions,                        // new
  getInvestments: fetchInvestments,        // now takes item_id
  getLiabilities: fetchLiabilities,        // now takes item_id
  disconnectPlaid: handleDisconnect,
};

export default plaidUtils;
