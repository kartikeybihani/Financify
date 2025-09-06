// /api/refresh_transactions.js
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
    console.log(`🔄 Starting refresh for item_id: ${item_id}`);

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

    // 3) Call Plaid's transactions/refresh endpoint
    console.log("📡 Calling Plaid transactions/refresh...");
    const refreshResponse = await client.transactionsRefresh({
      access_token: access_token,
    });

    console.log("✅ Refresh request sent to Plaid:", refreshResponse.data);

    // 4) Update the refresh timestamp in our database
    await supabase
      .from("user_items")
      .update({
        last_refresh_requested_at: new Date().toISOString(),
      })
      .eq("item_id", item_id);

    // 5) Return success - webhook will handle the actual data sync
    return res.status(200).json({
      message: "Refresh initiated successfully",
      request_id: refreshResponse.data.request_id,
      note: "New transactions will be available via webhook soon",
    });
  } catch (error) {
    console.error("❌ Refresh request failed:", error);

    // Handle specific Plaid errors
    const plaidError = error.response?.data;
    if (plaidError?.error_code === "ITEM_LOGIN_REQUIRED") {
      return res.status(400).json({
        error: "Item requires re-authentication",
        requires_update_mode: true,
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
