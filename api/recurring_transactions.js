// /api/recurring_transactions.js
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
    console.log(`🔄 Fetching recurring transactions for item_id: ${item_id}`);

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

    // 3) Call Plaid's transactions/recurring/get endpoint
    console.log("📡 Calling Plaid transactions/recurring/get...");
    const recurringResponse = await client.transactionsRecurringGet({
      access_token: access_token,
      account_ids: [], // Empty array means all accounts
    });

    const recurringData = recurringResponse.data;
    console.log(
      `✅ Found ${recurringData.inflow_streams?.length || 0} inflow and ${
        recurringData.outflow_streams?.length || 0
      } outflow recurring streams`
    );

    // 4) Process and categorize recurring transactions
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
          merchant.includes("amazon prime")
        ) {
          processedStreams.subscriptions.push(streamData);
        } else if (
          category.includes("utilities") ||
          category.includes("rent") ||
          merchant.includes("electric") ||
          merchant.includes("gas") ||
          merchant.includes("water") ||
          merchant.includes("rent")
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
        });
      });
    }

    // 5) Store recurring streams in database (optional - for caching)
    try {
      const recurringRows = [
        ...processedStreams.subscriptions.map((s) => ({
          ...s,
          stream_type: "subscription",
          user_id: actualUserId,
          item_id,
        })),
        ...processedStreams.income.map((s) => ({
          ...s,
          stream_type: "income",
          user_id: actualUserId,
          item_id,
        })),
        ...processedStreams.bills.map((s) => ({
          ...s,
          stream_type: "bill",
          user_id: actualUserId,
          item_id,
        })),
        ...processedStreams.other.map((s) => ({
          ...s,
          stream_type: "other",
          user_id: actualUserId,
          item_id,
        })),
      ];

      if (recurringRows.length > 0) {
        // Check if recurring_streams table exists, if not, skip storage
        const { error: upsertErr } = await supabase
          .from("recurring_streams")
          .upsert(recurringRows, { onConflict: "stream_id" })
          .select();

        if (upsertErr && !upsertErr.message.includes("does not exist")) {
          console.warn("⚠️ Could not store recurring streams:", upsertErr);
        } else if (!upsertErr) {
          console.log(
            `💾 Stored ${recurringRows.length} recurring streams in database`
          );
        }
      }
    } catch (storageError) {
      console.warn(
        "⚠️ Recurring streams storage failed (continuing anyway):",
        storageError
      );
    }

    // 6) Return processed data
    return res.status(200).json({
      message: "Recurring transactions fetched successfully",
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
      data: processedStreams,
    });
  } catch (error) {
    console.error("❌ Recurring transactions fetch failed:", error);

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

    return res.status(500).json({
      error: plaidError?.error_message || error.message,
    });
  }
}
