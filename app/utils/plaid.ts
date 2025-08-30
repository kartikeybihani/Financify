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
      const { data: { user } } = await supabase.auth.getUser();

      const res = await fetch(`${BASE_URL}/api/exchange_public_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          user_id: user?.id,
          // optional: include institution metadata you can capture later
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Exchange failed");

      // ✅ we only get and keep item_id client-side
      const { item_id } = data;
      await addItemId(item_id); // add to array instead of single item
      onSuccess(item_id);
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

  const [institution, accounts, identity, investments, liabilities] = await Promise.all([
    fetchInstitution(item_id),
    fetchAccounts(item_id),
    fetchIdentity(item_id),
    fetchInvestments(item_id),
    fetchLiabilities(item_id),
  ]);

  return { institution, accounts, identity, investments, liabilities, item_id };
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


const plaidUtils = {
  initializePlaid: fetchInitialData,
  getPlaidLinkToken: fetchLinkToken,
  exchangePublicToken: handlePlaidConnect,
  getAccounts: fetchAccounts,              // now takes item_id
  syncTransactions,                        // new
  getInvestments: fetchInvestments,        // now takes item_id
  getLiabilities: fetchLiabilities,        // now takes item_id
  disconnectPlaid: handleDisconnect,
};

export default plaidUtils;
