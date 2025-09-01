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
    console.log(
      "🏦 Fetching and storing ALL financial data for item_id:",
      item_id
    );

    // 1. Get user_id for this item
    const { data: userItem, error: fetchErr } = await supabase
      .from("user_items")
      .select("user_id")
      .eq("item_id", item_id)
      .single();

    if (fetchErr || !userItem) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 2. Get access_token from Vault
    const { data: access_token, error: tokenError } = await supabase.rpc(
      "secure_get_plaid_token",
      { p_item_id: item_id, p_user_id: userItem.user_id }
    );

    if (tokenError || !access_token) {
      console.error("Error retrieving Plaid token from Vault:", tokenError);
      return res.status(404).json({ error: "Access token not found" });
    }
    let storedData = {};

    // 2. Fetch and store ACCOUNTS
    try {
      console.log("📊 Fetching accounts...");
      const accountsResponse = await client.accountsGet({ access_token });
      const accounts = accountsResponse.data.accounts;

      if (accounts.length > 0) {
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

        const { error: accountsError } = await supabase
          .from("accounts")
          .upsert(accountsToStore, {
            onConflict: "account_id",
            ignoreDuplicates: false,
          });

        if (accountsError) throw accountsError;
        console.log(`✅ Stored ${accounts.length} accounts`);
        storedData.accounts = accounts.length;
      }
    } catch (error) {
      console.error("⚠️ Accounts fetch failed:", error.message);
      storedData.accounts = 0;
    }

    // 3. Fetch and store INSTITUTION data
    try {
      console.log("🏢 Fetching institution...");
      const itemResponse = await client.itemGet({ access_token });
      const institutionId = itemResponse.data.item.institution_id;
      const institutionResponse = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: ["US"],
      });

      const institution = institutionResponse.data.institution;

      // Update the user_items table with institution info
      await supabase
        .from("user_items")
        .update({
          institution_id: institution.institution_id,
          institution_name: institution.name,
        })
        .eq("item_id", item_id);

      console.log(`✅ Updated institution: ${institution.name}`);
      storedData.institution = institution.name;
    } catch (error) {
      console.error("⚠️ Institution fetch failed:", error.message);
      storedData.institution = "Unknown";
    }

    // 4. Fetch INVESTMENTS (optional - may not exist for all accounts)
    try {
      console.log("📈 Fetching investments...");
      const holdingsResponse = await client.investmentsHoldingsGet({
        access_token,
      });
      const transactionsResponse = await client.investmentsTransactionsGet({
        access_token,
        start_date: "2020-01-01",
        end_date: new Date().toISOString().split("T")[0],
      });

      storedData.investments = {
        holdings: holdingsResponse.data.holdings.length,
        securities: holdingsResponse.data.securities.length,
        transactions: transactionsResponse.data.investment_transactions.length,
      };
      console.log(
        `✅ Found ${holdingsResponse.data.holdings.length} investment holdings`
      );
    } catch (error) {
      console.log("ℹ️ No investments found (this is normal for most accounts)");
      storedData.investments = { holdings: 0, securities: 0, transactions: 0 };
    }

    // 5. Fetch LIABILITIES (optional - credit cards, loans)
    try {
      console.log("💳 Fetching liabilities...");
      const liabilitiesResponse = await client.liabilitiesGet({ access_token });
      const liabilityCount = liabilitiesResponse.data.liabilities?.length || 0;
      storedData.liabilities = liabilityCount;
      console.log(`✅ Found ${liabilityCount} liabilities`);
    } catch (error) {
      console.log(
        "ℹ️ No liabilities found (this is normal for depository accounts)"
      );
      storedData.liabilities = 0;
    }

    // 6. Fetch IDENTITY (optional - account holder info)
    try {
      console.log("🆔 Fetching identity...");
      const identityResponse = await client.identityGet({ access_token });
      storedData.identity = identityResponse.data.accounts.length;
      console.log(
        `✅ Found identity for ${identityResponse.data.accounts.length} accounts`
      );
    } catch (error) {
      console.log("ℹ️ Identity not available (this is normal)");
      storedData.identity = 0;
    }

    console.log("🎉 Financial data storage complete:", storedData);

    return res.status(200).json({
      message: "Financial data stored successfully",
      stored: storedData,
      item_id: item_id,
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
