import AsyncStorage from "@react-native-async-storage/async-storage";
import { open, create } from "react-native-plaid-link-sdk";

// === Create Link Token ===
export const fetchLinkToken = async () => {
  try {
    const res = await fetch("http://localhost:8080/api/create_link_token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
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

  create({ token: linkToken });
  open({
    onSuccess: async ({ publicToken }) => {
      const res = await fetch("http://localhost:8080/api/exchange_public_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken }),
      });
      const data = await res.json();
      const token = data.access_token;
      await AsyncStorage.setItem("accessToken", token);
      onSuccess(token);
    },
    onExit: () => console.log("Plaid flow exited"),
  });
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
    const res = await fetch("http://localhost:8080/api/institution", {
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
    const res = await fetch("http://localhost:8080/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    });
    const data = await res.json();
    console.log("Accounts data:", JSON.stringify(data, null, 2));
    return data.accounts;
  } catch (err) {
    console.error("Error fetching accounts:", err);
    return [];
  }
};

export const fetchIdentity = async (token: string) => {
  try {
    const res = await fetch("http://localhost:8080/api/identity", {
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
    const res = await fetch("http://localhost:8080/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    });
    const data = await res.json();
    console.log("✅ Investments full response:", JSON.stringify(data, null, 2));

    return {
      holdings: data.holdings || [],
      securities: data.securities || [],
      investmentTransactions: data.investmentTransactions || [],
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
    const res = await fetch("http://localhost:8080/api/liabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    });
    const data = await res.json();
    console.log("Liabilities data:", data);
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
