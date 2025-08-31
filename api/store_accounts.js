// /api/store_accounts.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { item_id } = req.body;
  if (!item_id) {
    return res.status(400).json({ error: "Missing item_id" });
  }

  try {
    console.log("🏦 Fetching and storing accounts for item_id:", item_id);

    // 1. Get access_token for this item
    const { data: item, error: fetchErr } = await supabase
      .from("user_items")
      .select("access_token")
      .eq("item_id", item_id)
      .single();

    if (fetchErr || !item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 2. Fetch accounts from Plaid
    const accountsResponse = await client.accountsGet({
      access_token: item.access_token,
    });

    const accounts = accountsResponse.data.accounts;
    console.log(`📊 Found ${accounts.length} accounts to store`);

    if (accounts.length === 0) {
      return res.status(200).json({ message: "No accounts found", stored: 0 });
    }

    // 3. Prepare account data for database
    const accountsToStore = accounts.map((account) => ({
      account_id: account.account_id,
      item_id: item_id,
      name: account.name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      official_name: account.official_name,
      current_balance: account.balances.current,
      available_balance: account.balances.available,
    }));

    // 4. Store accounts in database (upsert to handle duplicates)
    const { error: insertError } = await supabase
      .from("accounts")
      .upsert(accountsToStore, {
        onConflict: "account_id",
        ignoreDuplicates: false,
      });

    if (insertError) {
      console.error("❌ Error storing accounts:", insertError);
      throw insertError;
    }

    console.log(`✅ Successfully stored ${accounts.length} accounts`);

    return res.status(200).json({
      message: "Accounts stored successfully",
      stored: accounts.length,
      accounts: accountsToStore.map((acc) => ({
        account_id: acc.account_id,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype,
        current_balance: acc.current_balance,
      })),
    });
  } catch (error) {
    console.error("❌ store_accounts error:", error);
    const plaidError = error.response?.data;

    return res.status(500).json({
      error: plaidError?.error_message || error.message,
      details: plaidError || error,
    });
  }
}
