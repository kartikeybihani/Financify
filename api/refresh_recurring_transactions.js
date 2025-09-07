// /api/refresh_recurring_transactions.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { item_id, user_id } = req.body;
  if (!item_id) return res.status(400).json({ error: "Missing item_id" });

  try {
    console.log(`🔄 Refreshing recurring transactions for item_id: ${item_id}`);

    // 1) Look up user_id if not provided
    let actualUserId = user_id;
    if (!actualUserId) {
      const { data: item, error: userErr } = await supabase
        .from("user_items")
        .select("user_id")
        .eq("item_id", item_id)
        .single();

      if (userErr || !item) {
        return res.status(404).json({ error: "Item not found" });
      }
      actualUserId = item.user_id;
    }

    // 2) Get access token from Vault
    const { data: access_token, error: tokenErr } = await supabase.rpc(
      "secure_get_plaid_token",
      {
        p_item_id: item_id,
        p_user_id: actualUserId,
      }
    );

    if (tokenErr || !access_token) {
      console.error("Vault token fetch failed:", tokenErr);
      return res.status(404).json({ error: "Access token not found" });
    }

    // 3) Get account IDs for this item
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("account_id")
      .eq("item_id", item_id);

    if (accountsError) {
      console.error("Error fetching accounts:", accountsError);
      return res.status(500).json({ error: "Failed to fetch accounts" });
    }

    if (!accounts || accounts.length === 0) {
      console.log(`⚠️ No accounts found for item: ${item_id}`);
      return res.status(200).json({
        message: "No accounts found for recurring analysis",
        summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 },
        stored: 0,
        debug: {
          item_id,
          accounts_found: 0,
          reason: "No accounts in database for this item",
        },
      });
    }

    const accountIds = accounts.map((acc) => acc.account_id);
    console.log(
      `📡 Calling Plaid transactions/recurring/get for ${accountIds.length} accounts...`
    );

    // 4) Call Plaid's transactions/recurring/get endpoint
    const recurringResponse = await client.transactionsRecurringGet({
      access_token: access_token,
      account_ids: accountIds,
    });

    const recurringData = recurringResponse.data;
    console.log(
      `✅ Found ${recurringData.inflow_streams?.length || 0} inflow and ${
        recurringData.outflow_streams?.length || 0
      } outflow recurring streams`
    );

    // 5) Process and categorize recurring transactions
    const processedStreams = {
      subscriptions: [],
      income: [],
      bills: [],
      other: [],
    };

    // Process outflow streams (subscriptions, bills, etc.)
    if (recurringData.outflow_streams) {
      recurringData.outflow_streams.forEach((stream) => {
        const streamData = {
          stream_id: stream.stream_id,
          description: stream.description,
          merchant_name: stream.merchant_name,
          category: stream.category?.[0] || "Other",
          frequency: stream.frequency,
          average_amount: stream.average_amount?.amount || 0,
          last_amount: stream.last_amount?.amount || 0,
          last_date: stream.last_date,
          first_date: stream.first_date,
          is_active: stream.is_active,
          account_id: stream.account_id,
          transaction_ids: stream.transaction_ids || [],
          iso_currency_code: stream.average_amount?.iso_currency_code || "USD",
        };

        // Categorize based on category and merchant
        const category = stream.category?.[0]?.toLowerCase() || "";
        const merchant = (stream.merchant_name || "").toLowerCase();

        if (
          category.includes("subscription") ||
          merchant.includes("netflix") ||
          merchant.includes("spotify") ||
          merchant.includes("apple") ||
          merchant.includes("google") ||
          merchant.includes("amazon prime") ||
          merchant.includes("hulu") ||
          merchant.includes("disney") ||
          merchant.includes("youtube") ||
          merchant.includes("adobe") ||
          merchant.includes("microsoft")
        ) {
          processedStreams.subscriptions.push(streamData);
        } else if (
          category.includes("utilities") ||
          category.includes("rent") ||
          merchant.includes("electric") ||
          merchant.includes("gas") ||
          merchant.includes("water") ||
          merchant.includes("rent") ||
          merchant.includes("mortgage") ||
          merchant.includes("insurance") ||
          merchant.includes("phone") ||
          merchant.includes("internet")
        ) {
          processedStreams.bills.push(streamData);
        } else {
          processedStreams.other.push(streamData);
        }
      });
    }

    // Process inflow streams (income, etc.)
    if (recurringData.inflow_streams) {
      recurringData.inflow_streams.forEach((stream) => {
        processedStreams.income.push({
          stream_id: stream.stream_id,
          description: stream.description,
          merchant_name: stream.merchant_name,
          category: stream.category?.[0] || "Income",
          frequency: stream.frequency,
          average_amount: stream.average_amount?.amount || 0,
          last_amount: stream.last_amount?.amount || 0,
          last_date: stream.last_date,
          first_date: stream.first_date,
          is_active: stream.is_active,
          account_id: stream.account_id,
          transaction_ids: stream.transaction_ids || [],
          iso_currency_code: stream.average_amount?.iso_currency_code || "USD",
        });
      });
    }

    // 6) Store recurring streams in database
    let storedCount = 0;
    try {
      // First, mark all existing streams for this item as inactive
      await supabase
        .from("recurring_streams")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("item_id", item_id);

      // Prepare data for database insertion
      const recurringRows = [
        ...processedStreams.subscriptions.map((s) => ({
          user_id: actualUserId,
          item_id,
          account_id: s.account_id,
          stream_id: s.stream_id,
          stream_type: "subscription",
          flow_type: "outflow",
          description: s.description,
          merchant_name: s.merchant_name,
          category: s.category,
          average_amount: s.average_amount,
          last_amount: s.last_amount,
          iso_currency_code: s.iso_currency_code,
          frequency: s.frequency,
          first_date: s.first_date,
          last_date: s.last_date,
          is_active: s.is_active,
          transaction_ids: s.transaction_ids,
          last_synced_at: new Date().toISOString(),
        })),
        ...processedStreams.income.map((s) => ({
          user_id: actualUserId,
          item_id,
          account_id: s.account_id,
          stream_id: s.stream_id,
          stream_type: "income",
          flow_type: "inflow",
          description: s.description,
          merchant_name: s.merchant_name,
          category: s.category,
          average_amount: s.average_amount,
          last_amount: s.last_amount,
          iso_currency_code: s.iso_currency_code,
          frequency: s.frequency,
          first_date: s.first_date,
          last_date: s.last_date,
          is_active: s.is_active,
          transaction_ids: s.transaction_ids,
          last_synced_at: new Date().toISOString(),
        })),
        ...processedStreams.bills.map((s) => ({
          user_id: actualUserId,
          item_id,
          account_id: s.account_id,
          stream_id: s.stream_id,
          stream_type: "bill",
          flow_type: "outflow",
          description: s.description,
          merchant_name: s.merchant_name,
          category: s.category,
          average_amount: s.average_amount,
          last_amount: s.last_amount,
          iso_currency_code: s.iso_currency_code,
          frequency: s.frequency,
          first_date: s.first_date,
          last_date: s.last_date,
          is_active: s.is_active,
          transaction_ids: s.transaction_ids,
          last_synced_at: new Date().toISOString(),
        })),
        ...processedStreams.other.map((s) => ({
          user_id: actualUserId,
          item_id,
          account_id: s.account_id,
          stream_id: s.stream_id,
          stream_type: "other",
          flow_type: "outflow",
          description: s.description,
          merchant_name: s.merchant_name,
          category: s.category,
          average_amount: s.average_amount,
          last_amount: s.last_amount,
          iso_currency_code: s.iso_currency_code,
          frequency: s.frequency,
          first_date: s.first_date,
          last_date: s.last_date,
          is_active: s.is_active,
          transaction_ids: s.transaction_ids,
          last_synced_at: new Date().toISOString(),
        })),
      ];

      if (recurringRows.length > 0) {
        // Upsert recurring streams (insert or update based on stream_id)
        const { data: insertedData, error: upsertErr } = await supabase
          .from("recurring_streams")
          .upsert(recurringRows, {
            onConflict: "stream_id",
            ignoreDuplicates: false,
          })
          .select();

        if (upsertErr) {
          console.error("❌ Failed to store recurring streams:", upsertErr);
          throw new Error(`Database storage failed: ${upsertErr.message}`);
        }

        storedCount = insertedData?.length || recurringRows.length;
        console.log(`💾 Stored ${storedCount} recurring streams in database`);
      }
    } catch (storageError) {
      console.error("❌ Recurring streams storage failed:", storageError);
      throw new Error(`Storage failed: ${storageError.message}`);
    }

    // 7) Return processed data
    return res.status(200).json({
      message: "Recurring transactions refreshed and stored successfully",
      summary: {
        subscriptions: processedStreams.subscriptions.length,
        income: processedStreams.income.length,
        bills: processedStreams.bills.length,
        other: processedStreams.other.length,
        total:
          processedStreams.subscriptions.length +
          processedStreams.income.length +
          processedStreams.bills.length +
          processedStreams.other.length,
      },
      stored: storedCount,
      data: processedStreams,
    });
  } catch (error) {
    console.error("❌ Recurring transactions refresh failed:", error);

    // Handle specific Plaid errors
    const plaidError = error.response?.data;
    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({
        error: "Item requires re-authentication",
        requires_update_mode: true,
      });
    }

    if (plaidError?.error_code === "INSUFFICIENT_TRANSACTION_HISTORY") {
      return res.status(400).json({
        error:
          "Insufficient transaction history for recurring analysis. Need at least 180 days of data.",
      });
    }

    if (plaidError?.error_code === "RATE_LIMIT_EXCEEDED") {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again later.",
      });
    }

    return res.status(500).json({
      error: plaidError?.error_message || error.message,
    });
  }
}
