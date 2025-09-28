// /api/webhook.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL, // server-side env var with fallback
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY // server-side env var with fallback
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const {
    webhook_type,
    webhook_code,
    item_id,
    event_type,
    user_id,
    connection_id,
    webhookSecret,
  } = req.body || {};

  // Handle SnapTrade webhooks
  if (event_type && webhookSecret) {
    return handleSnapTradeWebhook(req, res, req.body);
  }

  if (!item_id) {
    // Plaid normally sends item_id; log and 200 to avoid retries
    console.warn("Webhook missing item_id", req.body);
    return res.status(200).json({ ok: true });
  }

  try {
    // --- ITEM webhooks ---
    if (webhook_type === "ITEM") {
      if (webhook_code === "NEW_ACCOUNTS_AVAILABLE") {
        await supabase
          .from("user_items")
          .update({ has_new_accounts: true })
          .eq("item_id", item_id);

        // tell your app to launch UPDATE mode with account select
        return res.status(200).json({ ok: true, prompt_update_mode: true });
      }

      if (
        webhook_code === "ITEM_LOGIN_REQUIRED" ||
        webhook_code === "PENDING_EXPIRATION" ||
        webhook_code === "PENDING_DISCONNECT"
      ) {
        await supabase
          .from("user_items")
          .update({ requires_update_mode: true })
          .eq("item_id", item_id);

        return res.status(200).json({ ok: true, requires_update_mode: true });
      }
    }

    // --- TRANSACTIONS webhooks ---
    if (webhook_type === "TRANSACTIONS") {
      const shouldSync =
        webhook_code === "INITIAL_UPDATE" ||
        webhook_code === "HISTORICAL_UPDATE" ||
        webhook_code === "SYNC_UPDATES_AVAILABLE";

      if (shouldSync) {
        try {
          // Look up user_id from item_id
          const { data: userItem, error } = await supabase
            .from("user_items")
            .select("user_id")
            .eq("item_id", item_id)
            .single();

          if (error || !userItem) {
            console.error("Could not find user for item_id:", item_id, error);
            return res.status(200).json({ ok: true, error: "user_not_found" });
          }

          // Call Supabase sync-transactions function
          const SUPABASE_URL =
            process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
          fetch(`${SUPABASE_URL}/functions/v1/sync-transactions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${
                process.env.SUPABASE_SERVICE_ROLE_KEY ||
                process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
              }`,
            },
            body: JSON.stringify({ item_id, user_id: userItem.user_id }),
          }).catch((e) =>
            console.error("sync-transactions function call failed", e)
          );
        } catch (e) {
          console.error("webhook sync error", e);
        }
      }

      // Always ack quickly so Plaid doesn't retry
      return res.status(200).json({ ok: true, trigger_sync: !!shouldSync });
    }

    // default: acknowledge
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    // still 200 to avoid retries; log internally
    return res.status(200).json({ ok: true });
  }
}

// SnapTrade webhook handler
async function handleSnapTradeWebhook(req, res, payload) {
  try {
    const { event_type, user_id, connection_id, webhookSecret, data } = payload;

    console.log(`🔔 SnapTrade webhook received: ${event_type}`, {
      user_id: user_id?.substring(0, 8) + "...",
      connection_id: connection_id?.substring(0, 8) + "...",
      has_data: !!data,
    });

    // Verify webhook authenticity (you should set this in your SnapTrade dashboard)
    const expectedSecret = process.env.SNAPTRADE_WEBHOOK_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.error("❌ SnapTrade webhook secret mismatch");
      return res.status(401).json({ error: "Unauthorized" });
    }

    switch (event_type) {
      case "connection.disabled":
      case "connection.error":
        await handleConnectionDisabled(user_id, connection_id, event_type);
        break;

      case "connection.enabled":
        await handleConnectionEnabled(user_id, connection_id);
        break;

      case "user.registered":
        await handleUserRegistered(user_id, data);
        break;

      case "user.login":
        await handleUserLogin(user_id, data);
        break;

      default:
        console.log(`ℹ️ Unhandled SnapTrade webhook event: ${event_type}`);
    }

    return res.status(200).json({ ok: true, processed: event_type });
  } catch (error) {
    console.error("❌ SnapTrade webhook error:", error);
    // Still return 200 to prevent retries
    return res.status(200).json({ ok: true, error: error.message });
  }
}

async function handleConnectionDisabled(user_id, connection_id, event_type) {
  try {
    console.log(`🔴 Connection disabled: ${event_type}`, {
      user_id,
      connection_id,
    });

    // Update connection status in database
    const { error } = await supabase
      .from("snaptrade_connections")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
        connection_status:
          event_type === "connection.disabled" ? "disabled" : "error",
      })
      .eq("user_id", user_id)
      .eq("account_id", connection_id);

    if (error) {
      console.error("❌ Failed to update connection status:", error);
      return;
    }

    // You could trigger a notification to the user here
    // For example, send a push notification or update a notification table
    console.log(
      "✅ Connection status updated, user should be notified to reconnect"
    );
  } catch (error) {
    console.error("❌ Error handling connection disabled:", error);
  }
}

async function handleConnectionEnabled(user_id, connection_id) {
  try {
    console.log(`🟢 Connection enabled:`, { user_id, connection_id });

    // Update connection status in database
    const { error } = await supabase
      .from("snaptrade_connections")
      .update({
        is_active: true,
        connection_status: "active",
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id)
      .eq("account_id", connection_id);

    if (error) {
      console.error("❌ Failed to update connection status:", error);
      return;
    }

    console.log("✅ Connection re-enabled successfully");
  } catch (error) {
    console.error("❌ Error handling connection enabled:", error);
  }
}

async function handleUserRegistered(user_id, data) {
  try {
    console.log(`👤 User registered:`, { user_id, has_data: !!data });
    // You could track user registration metrics here
  } catch (error) {
    console.error("❌ Error handling user registered:", error);
  }
}

async function handleUserLogin(user_id, data) {
  try {
    console.log(`🔐 User login:`, { user_id, has_data: !!data });
    // You could track login metrics or update last_login timestamp
  } catch (error) {
    console.error("❌ Error handling user login:", error);
  }
}
