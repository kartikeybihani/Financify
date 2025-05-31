import AsyncStorage from "@react-native-async-storage/async-storage";
import { open, create } from "react-native-plaid-link-sdk";
import supabase from "../lib/supabase/supabase";

const BASE_URL = "https://financify-rose.vercel.app";

// === Create Link Token ===
export const fetchLinkToken = async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/create_link_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    console.log("Link token:", data.link_token);
    return data.link_token;
  } catch (err) {
    console.error("Error fetching link token:", err);
    return null;
  }
};

// === Connect Flow ===
export const handlePlaidConnect = async (
  linkToken: string,
  onSuccess: (token: string) => void
) => {
  if (!linkToken) return;
  console.log("In handlePlaidConnect");
  console.log("Doing the exchange_public_token call...");

  create({ token: linkToken });
  console.log("Created the create function");
  open({
    onSuccess: async ({ publicToken }) => {
      const { data: { user }} = await supabase.auth.getUser();
      console.log("User ID:", user?.id);

      try {
        console.log("In onSuccess");
        const res = await fetch(
          `${BASE_URL}/api/exchange_public_token`,
          {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({  
            public_token: publicToken,
            user_id: user?.id,
          }),
      });
        const data = await res.json();
        const token = data.access_token;
        console.log("Plaid token:", token);
        // await AsyncStorage.setItem("accessToken", token);
        onSuccess(token);
      } catch (err) {
        console.error("Error in onSuccess:", err);
      }
    },
    onExit: () => console.log("Plaid flow exited here... oops"),
  });
};

// === Update Mode ===
export const getUpdateLinkToken = async (access_token: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/create_update_link_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to get update token");
    return data.link_token;
  } catch (error) {
    console.error("Error getting update token:", error);
    throw error;
  }
};

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
        onExit: (error) => {
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
export const handleDisconnect = async () => {
  await AsyncStorage.removeItem("accessToken");
  console.log("Disconnected from Plaid");
  return await fetchLinkToken();
};

// === Plaid Data Fetchers ===
export const fetchInstitution = async (token: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/institution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    });
    const data = await res.json();
    return data.institution;
  } catch (err) {
    console.error("Error fetching institution:", err);
    return null;
  }
};

export const fetchAccounts = async (token: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    });
    const data = await res.json();
    console.log("Accounts data loaded...");
    return data.accounts;
  } catch (err) {
    console.error("Error fetching accounts:", err);
    return [];
  }
};

export const triggerWebhook = async (access_token: string) => {
  const res = await fetch(`${BASE_URL}/api/fire_webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token }),
  });

  console.log("Webhook triggered");
  if (!res.ok) {
    throw new Error("Webhook trigger failed");
  }
  console.log("Response from webhook:", await res.json());

  return await res.json();
};


export const fetchIdentity = async (token: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    });
    const data = await res.json();
    return data.identity;
  } catch (err) {
    console.error("Error fetching identity:", err);
    return [];
  }
};

// ✅ NEW: Fetch Investments (Holdings + Transactions)
export const fetchInvestments = async (token: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/investments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
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

export const fetchLiabilities = async (token: string) => {
  try {
    const res = await fetch(`${BASE_URL}/api/liabilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
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
export const fetchInitialData = async (token: string) => {
  try {
    console.log("Fetching initial data with token:", token);
    const [institution, accounts, identity, investments, liabilities] =
      await Promise.all([
        fetchInstitution(token),
        fetchAccounts(token),
        fetchIdentity(token),
        fetchInvestments(token),
        fetchLiabilities(token),
      ]);

    return {
      institution,
      accounts,
      identity,
      investments,
      liabilities,
    };
  } catch (err) {
    console.error("Error fetching initial data:", err);
    return null;
  }
};

const plaidUtils = {
  initializePlaid: fetchInitialData,
  getPlaidLinkToken: fetchLinkToken,
  exchangePublicToken: handlePlaidConnect,
  getAccounts: fetchAccounts,
  getTransactions: fetchInvestments,
  getInvestments: fetchInvestments,
  getLiabilities: fetchLiabilities,
  disconnectPlaid: handleDisconnect,
};

export default plaidUtils;
