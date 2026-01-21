// /api/webhook.js
import {
  supabase,
  supabaseUrl,
  supabaseServiceKey,
} from "../lib/api/supabase.js";
import { client as plaidClient } from "../lib/api/plaidClient.js";
import { refreshAndStoreRecurringForItem } from "../lib/plaid/recurringRefresh.js";

export default async function handler(req, res) {
  // Log ALL incoming requests for debugging
  console.log("🔔 Webhook received:", {
    method: req.method,
    url: req.url,
    headers: {
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
      "x-forwarded-for": req.headers["x-forwarded-for"],
    },
    bodyKeys: Object.keys(req.body || {}),
    hasBody: !!req.body,
  });

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const {
    webhook_type,
    webhook_code,
    item_id,
    event_type,
    eventType, // SnapTrade uses camelCase
    user_id,
    userId, // SnapTrade uses this
    connection_id,
    connectionId, // SnapTrade might use camelCase
    webhookId, // SnapTrade uses this (webhook delivery ID)
    brokerageAuthorizationId, // SnapTrade uses this for connection_id
    webhookSecret,
    clientId, // SnapTrade uses this
    accountId, // SnapTrade uses this
  } = req.body || {};

  // Normalize SnapTrade webhook format (camelCase -> snake_case)
  // Note: SnapTrade sends clientId (SnapTrade user ID), not Supabase user_id
  const normalizedEventType = eventType || event_type;
  const normalizedSnapTradeUserId = userId || user_id; // SnapTrade sends userId (SnapTrade user ID)
  // brokerageAuthorizationId is the actual connection_id/authorization_id
  // webhookId is just the webhook delivery ID, not connection_id
  const normalizedConnectionId =
    brokerageAuthorizationId || connectionId || connection_id;

  // Log full body for SnapTrade-like requests
  if (
    normalizedEventType ||
    normalizedConnectionId ||
    normalizedSnapTradeUserId
  ) {
    console.log(
      "📦 SnapTrade-like webhook payload:",
      JSON.stringify(req.body, null, 2)
    );
  }

  // Handle SnapTrade webhooks
  // Check for eventType or event_type (SnapTrade identifier)
  if (normalizedEventType) {
    console.log(
      "🔍 Detected SnapTrade webhook by eventType:",
      normalizedEventType
    );

    // Normalize payload to snake_case for handler
    // Note: user_id in payload will be the SnapTrade user ID (userId), not Supabase user_id
    const normalizedPayload = {
      ...req.body,
      event_type: normalizedEventType,
      user_id: normalizedSnapTradeUserId, // This is actually snaptrade_user_id (SnapTrade userId)
      connection_id: normalizedConnectionId, // This is brokerageAuthorizationId
      webhookSecret: webhookSecret,
      accountId: accountId, // Keep accountId for account-specific events
      data: req.body.data || req.body,
      // Keep original fields for reference
      clientId: clientId,
      webhookId: webhookId,
      brokerageAuthorizationId: brokerageAuthorizationId, // Keep original
    };

    return handleSnapTradeWebhook(req, res, normalizedPayload);
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

      const shouldRefreshRecurring =
        webhook_code === "RECURRING_TRANSACTIONS_UPDATE";

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
          fetch(`${supabaseUrl}/functions/v1/sync-transactions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ item_id, user_id: userItem.user_id }),
          }).catch((e) =>
            console.error("sync-transactions function call failed", e)
          );
        } catch (e) {
          console.error("webhook sync error", e);
        }
      }

      if (shouldRefreshRecurring) {
        try {
          const { data: userItem, error } = await supabase
            .from("user_items")
            .select("user_id")
            .eq("item_id", item_id)
            .single();

          if (error || !userItem) {
            console.error("Could not find user for item_id:", item_id, error);
            return res.status(200).json({ ok: true, error: "user_not_found" });
          }

          const { data: access_token, error: tokenErr } = await supabase.rpc(
            "secure_get_plaid_token",
            {
              p_item_id: item_id,
              p_user_id: userItem.user_id,
            }
          );

          if (tokenErr || !access_token) {
            console.error("Recurring refresh token missing", {
              item_id,
              tokenErr,
            });
            return res.status(200).json({ ok: true, error: "token_not_found" });
          }

          await refreshAndStoreRecurringForItem({
            supabase,
            plaidClient,
            accessToken: access_token,
            itemId: item_id,
            userId: userItem.user_id,
          });
        } catch (e) {
          console.error("webhook recurring refresh error", e);
        }
      }

      // Always ack quickly so Plaid doesn't retry
      return res.status(200).json({
        ok: true,
        trigger_sync: !!shouldSync,
        trigger_recurring_refresh: !!shouldRefreshRecurring,
      });
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
      has_webhookSecret: !!webhookSecret,
      full_payload: JSON.stringify(payload, null, 2),
    });

    // Verify webhook authenticity (required in production)
    const expectedSecret = process.env.SNAPTRADE_WEBHOOK_SECRET;
    if (expectedSecret) {
      if (!webhookSecret) {
        console.error("❌ SnapTrade webhook secret expected but not provided");
        return res.status(401).json({ error: "Unauthorized" });
      } else if (webhookSecret !== expectedSecret) {
        console.error("❌ SnapTrade webhook secret mismatch", {
          expected: expectedSecret?.substring(0, 8) + "...",
          received: webhookSecret?.substring(0, 8) + "...",
        });
        return res.status(401).json({ error: "Unauthorized" });
      } else {
        console.log("✅ SnapTrade webhook secret verified");
      }
    } else {
      console.warn(
        "⚠️ SNAPTRADE_WEBHOOK_SECRET not set - webhook verification disabled (not recommended for production)"
      );
    }

    switch (event_type) {
      case "CONNECTION_BROKEN":
      case "connection.broken":
        // SnapTrade sends CONNECTION_BROKEN when connection is disabled/broken
        await handleConnectionDisabled(user_id, connection_id, event_type);
        break;

      case "CONNECTION_FAILED":
      case "connection.failed":
        // Connection attempt failed
        await handleConnectionDisabled(user_id, connection_id, event_type);
        break;

      case "CONNECTION_ADDED":
      case "connection.added":
        // New connection added - treat as enabled
        await handleConnectionEnabled(user_id, connection_id);
        break;

      case "CONNECTION_FIXED":
      case "connection.fixed":
        await handleConnectionFixed(user_id, connection_id);
        break;

      case "account.holdings_updated":
      case "ACCOUNT_HOLDINGS_UPDATED":
      case "holdings.updated":
      case "HOLDINGS_UPDATED":
        await handleAccountHoldingsUpdated(user_id, connection_id);
        break;

      case "user.registered":
      case "USER_REGISTERED":
        await handleUserRegistered(user_id, data);
        break;

      case "user.login":
      case "USER_LOGIN":
        await handleUserLogin(user_id, data);
        break;

      case "TEST_WEBHOOK":
        console.log("✅ SnapTrade test webhook received - webhook is working!");
        // Just acknowledge test webhooks
        break;

      default:
        console.log(`ℹ️ Unhandled SnapTrade webhook event: ${event_type}`);
    }

    console.log("✅ SnapTrade webhook processed successfully");
    return res.status(200).json({ ok: true, processed: event_type });
  } catch (error) {
    console.error("❌ SnapTrade webhook error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      payload: JSON.stringify(payload, null, 2),
    });
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

    // Note: SnapTrade sends clientId (SnapTrade user ID) as user_id
    // and webhookId might be the webhook delivery ID, not connection_id
    // We need to find the connection by looking up the SnapTrade user

    // First, try to find connection by connection_id if provided
    let updateQuery = supabase.from("snaptrade_connections").update({
      is_active: false,
      updated_at: new Date().toISOString(),
      connection_status:
        event_type === "connection.disabled" ||
        event_type === "CONNECTION_DISABLED"
          ? "disabled"
          : "error",
    });

    if (connection_id && connection_id !== user_id) {
      // If connection_id is provided and different from user_id, use it
      updateQuery = updateQuery.eq("connection_id", connection_id);
      console.log("🔍 Updating by connection_id:", connection_id);
    } else if (user_id) {
      // Otherwise, update all connections for this SnapTrade user
      // Note: user_id here is actually the SnapTrade user ID (clientId)
      updateQuery = updateQuery.eq("snaptrade_user_id", user_id);
      console.log("🔍 Updating by snaptrade_user_id:", user_id);
    } else {
      console.error("❌ No user_id or connection_id provided");
      return;
    }

    const { error, data } = await updateQuery.select();

    if (error) {
      console.error("❌ Failed to update connection status:", error);
      return;
    }

    console.log("✅ Connection status updated to disabled", {
      updated_count: data?.length || 0,
      connections: data,
    });
  } catch (error) {
    console.error("❌ Error handling connection disabled:", error);
  }
}

async function handleConnectionEnabled(user_id, connection_id) {
  try {
    console.log(`🟢 Connection enabled:`, { user_id, connection_id });

    // Note: user_id here is actually the SnapTrade user ID (clientId)
    let updateQuery = supabase.from("snaptrade_connections").update({
      is_active: true,
      connection_status: "active",
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (connection_id && connection_id !== user_id) {
      updateQuery = updateQuery.eq("connection_id", connection_id);
      console.log("🔍 Updating by connection_id:", connection_id);
    } else if (user_id) {
      updateQuery = updateQuery.eq("snaptrade_user_id", user_id);
      console.log("🔍 Updating by snaptrade_user_id:", user_id);
    } else {
      console.error("❌ No user_id or connection_id provided");
      return;
    }

    const { error, data } = await updateQuery.select();

    if (error) {
      console.error("❌ Failed to update connection status:", error);
      return;
    }

    console.log("✅ Connection re-enabled successfully", {
      updated_count: data?.length || 0,
    });
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

async function handleConnectionFixed(user_id, connection_id) {
  try {
    console.log(`✅ Connection fixed:`, { user_id, connection_id });

    // Note: user_id here is the SnapTrade user_id (snaptrade_user_id), not Supabase user_id
    // We need to find the connection by snaptrade_user_id and connection_id
    const { error } = await supabase
      .from("snaptrade_connections")
      .update({
        is_active: true,
        connection_status: "active",
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("snaptrade_user_id", user_id) // Use snaptrade_user_id, not user_id
      .eq("connection_id", connection_id);

    if (error) {
      console.error("❌ Failed to update connection status:", error);
      return;
    }

    console.log("✅ Connection status updated to active in database");

    // Trigger sync to pull fresh data after reconnection
    const { data: connection } = await supabase
      .from("snaptrade_connections")
      .select("user_id, account_id, snaptrade_user_id")
      .eq("snaptrade_user_id", user_id) // Use snaptrade_user_id, not user_id
      .eq("connection_id", connection_id)
      .single();

    if (connection) {
      console.log("🔄 Triggering sync after connection fixed...");
      await fetch(`${supabaseUrl}/functions/v1/sync-investments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_id: connection.user_id, // Use Supabase user_id from connection
          snaptrade_user_id: connection.snaptrade_user_id,
          account_id: connection.account_id,
        }),
      }).catch((e) =>
        console.error("sync-investments function call failed", e)
      );
    } else {
      console.warn("⚠️ Could not find connection to trigger sync");
    }

    console.log("✅ Connection fixed and sync triggered");
  } catch (error) {
    console.error("❌ Error handling connection fixed:", error);
  }
}

async function handleAccountHoldingsUpdated(user_id, connection_id) {
  try {
    console.log(`📈 Account holdings updated:`, { user_id, connection_id });

    // Note: user_id here is the SnapTrade user_id (snaptrade_user_id), not Supabase user_id
    // We need to find the connection by snaptrade_user_id and connection_id
    const { data: connection, error } = await supabase
      .from("snaptrade_connections")
      .select("user_id, account_id, snaptrade_user_id") // CRITICAL: Include user_id to get Supabase UUID
      .eq("snaptrade_user_id", user_id) // CRITICAL: Use snaptrade_user_id, not user_id
      .eq("connection_id", connection_id)
      .eq("is_active", true)
      .single();

    if (error || !connection) {
      console.error("❌ Could not find connection for webhook:", error);
      console.error("Query details:", {
        snaptrade_user_id: user_id,
        connection_id: connection_id,
        error_code: error?.code,
        error_message: error?.message,
      });
      return;
    }

    console.log("✅ Found connection for webhook:", {
      supabase_user_id: connection.user_id,
      account_id: connection.account_id,
      snaptrade_user_id: connection.snaptrade_user_id,
    });

    // Call sync-investments Supabase function to pull fresh data
    await fetch(`${supabaseUrl}/functions/v1/sync-investments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        user_id: connection.user_id, // CRITICAL: Use Supabase user_id from connection, not SnapTrade user_id
        snaptrade_user_id: connection.snaptrade_user_id,
        account_id: connection.account_id,
      }),
    }).catch((e) => console.error("sync-investments function call failed", e));

    console.log("✅ Triggered sync after holdings update webhook");
  } catch (error) {
    console.error("❌ Error handling account holdings updated:", error);
  }
}
