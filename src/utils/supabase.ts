// app/utils/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Slim transaction type for cache
export type SlimTransaction = {
  plaid_transaction_id: string;
  date: string;
  amount: number;
  merchant_name?: string | null;
  name?: string | null;
  category?: string | null;
};

// Transform full transaction to slim version
function slimTransaction(tx: any): SlimTransaction {
  return {
    plaid_transaction_id: tx.plaid_transaction_id,
    date: tx.date,
    amount: tx.amount,
    merchant_name: tx.merchant_name ?? null,
    name: tx.name ?? null,
    category: tx.category ?? null,
  };
}

// Fetch latest 50 transactions for a specific item
export async function fetchLatest50Transactions(userId: string, itemId: string): Promise<SlimTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("plaid_transaction_id, date, amount, merchant_name, name, category")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .order("date", { ascending: false })
    .limit(50);
  
  if (error) throw error;
  
  return (data ?? []).map(slimTransaction);
}

// Fetch all user items with metadata
export async function fetchUserItems(userId: string) {
  const { data, error } = await supabase
    .from("user_items")
    .select("item_id, institution_id, institution_name, has_new_accounts, requires_update_mode, last_synced_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return data ?? [];
}

// Fetch account balances for a specific item  
export async function fetchAccountBalances(itemId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("account_id, name, type, subtype, current_balance, available_balance, balance_as_of")
    .eq("item_id", itemId);
  
  if (error) throw error;
  
  return (data ?? []).map(account => ({
    account_id: account.account_id,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    balances: {
      current: account.current_balance || 0,
      available: account.available_balance || 0,
    },
    balance_as_of: account.balance_as_of,
  }));
}

// Fetch institution metadata
export async function fetchInstitutionData(itemId: string) {
  const { data, error } = await supabase
    .from("user_items")
    .select("institution_id, institution_name")
    .eq("item_id", itemId)
    .single();
  
  if (error) throw error;
  
  return {
    institution_id: data.institution_id,
    institution_name: data.institution_name,
  };
}

// Check if item still exists (for stale cache cleanup)
export async function itemExists(userId: string, itemId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_items")
    .select("item_id")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .single();
  
  return !error && !!data;
}

// Get recent transactions across all user items (for insights)
export async function fetchRecentTransactionsAllItems(userId: string, limit: number = 100): Promise<any[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(`
      *,
      accounts(name, type, subtype, item_id)
    `)
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

// Get all accounts across user items (for overview)
export async function fetchAllUserAccounts(userId: string) {
  const userItems = await fetchUserItems(userId);
  const allItemIds = userItems.map(item => item.item_id);
  
  if (allItemIds.length === 0) return [];
  
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("*")
    .in("item_id", allItemIds);
  
  if (error) throw error;
  
  return (accounts || []).map(account => {
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
}

export { supabase };
