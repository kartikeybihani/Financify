// /api/webhook.js
import {
  supabase,
  supabaseUrl,
  supabaseServiceKey,
} from "../lib/api/supabase.js";
import { client as plaidClient } from "../lib/api/plaidClient.js";
import { refreshAndStoreRecurringForItem } from "../lib/plaid/recurringRefresh.js";
import { syncSnaptradeInvestments } from "../lib/snaptradeSync.js";

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

    // --- HOLDINGS webhooks (Plaid investment holdings) ---
    if (webhook_type === "HOLDINGS") {
      if (webhook_code === "DEFAULT_UPDATE") {
        console.log("📈 Plaid holdings update webhook received", {
          item_id,
          new_holdings: req.body.new_holdings || 0,
          updated_holdings: req.body.updated_holdings || 0,
        });

        // Process webhook asynchronously (don't block response)
        // This allows Plaid to get quick acknowledgment while we process in background
        (async () => {
          try {
            // Look up user_id from item_id
            const { data: userItem, error } = await supabase
              .from("user_items")
              .select("user_id")
              .eq("item_id", item_id)
              .single();

            if (error || !userItem) {
              console.error(
                "❌ Could not find user for item_id:",
                item_id,
                error
              );
              // Log for monitoring/alerting
              await logWebhookError(item_id, "user_not_found", error);
              return;
            }

            // Get access token with retry
            const access_token = await retryOperation(
              async () => {
                const { data: token, error: tokenErr } = await supabase.rpc(
                  "secure_get_plaid_token",
                  {
                    p_item_id: item_id,
                    p_user_id: userItem.user_id,
                  }
                );
                if (tokenErr || !token) {
                  throw new Error(
                    `Token fetch failed: ${
                      tokenErr?.message || "No token returned"
                    }`
                  );
                }
                return token;
              },
              {
                maxRetries: 3,
                operationName: "get_plaid_token",
                item_id,
              }
            );

            if (!access_token) {
              console.error(
                "❌ Could not get access token for holdings sync after retries"
              );
              await logWebhookError(item_id, "token_not_found", null);
              return;
            }

            // Fetch and store updated holdings with retry
            await retryOperation(
              async () => {
                await syncPlaidHoldings({
                  access_token,
                  item_id,
                  user_id: userItem.user_id,
                });
              },
              {
                maxRetries: 3,
                operationName: "sync_plaid_holdings",
                item_id,
              }
            );

            console.log("✅ Plaid holdings synced successfully from webhook");
          } catch (e) {
            console.error("❌ Error syncing Plaid holdings from webhook:", e);
            await logWebhookError(item_id, "sync_failed", e);
            // Consider queueing for retry via a job queue system
          }
        })();

        // Always ack quickly so Plaid doesn't retry
        return res.status(200).json({
          ok: true,
          trigger_holdings_sync: true,
        });
      }

      // Other HOLDINGS webhook codes can be handled here in the future
      return res.status(200).json({ ok: true });
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
          // Trigger scheduled-sync API (same as pg_cron; syncs all Plaid items)
          const baseUrl =
            process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : process.env.APP_BASE_URL ||
                process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/rest/v1", "") ||
                "http://localhost:3000";
          const cronSecret =
            process.env.SCHEDULED_SYNC_CRON_SECRET ||
            process.env.BIGGEST_MOVER_CRON_SECRET;

          fetch(`${baseUrl}/api/scheduled-sync?mode=plaid_transactions`, {
            method: "GET",
            headers: {
              "x-cron-secret": cronSecret || "",
            },
          }).catch((e) =>
            console.error("webhook scheduled-sync trigger failed", e)
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
    const { event_type, user_id, connection_id, webhookSecret, data, accountId } = payload;

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
        await handleAccountHoldingsUpdated(user_id, connection_id, accountId);
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
      await syncSnaptradeInvestments(
        connection.user_id,
        connection.snaptrade_user_id,
        connection.account_id
      ).catch((e) =>
        console.error("SnapTrade sync failed after connection fixed", e)
      );
    } else {
      console.warn("⚠️ Could not find connection to trigger sync");
    }

    console.log("✅ Connection fixed and sync triggered");
  } catch (error) {
    console.error("❌ Error handling connection fixed:", error);
  }
}

async function handleAccountHoldingsUpdated(user_id, connection_id, account_id = null) {
  try {
    console.log(`📈 Account holdings updated:`, { user_id, connection_id, account_id });

    // Note: user_id here is the SnapTrade user_id (snaptrade_user_id), not Supabase user_id
    // Retry mechanism to handle race conditions where webhook arrives before connection is stored
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 500; // Small initial delay to give database write time to complete
    const RETRY_DELAY_MS = 1000; // Delay between retries
    let connection = null;
    let attempt = 0;

    // Small initial delay before first attempt (handles immediate webhooks)
    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS));

    // Retry loop with exponential backoff
    while (!connection && attempt <= MAX_RETRIES) {
      if (attempt > 0) {
        const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        console.log(`⏳ Retry attempt ${attempt}/${MAX_RETRIES} - waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      attempt++;
      console.log(`🔍 Connection lookup attempt ${attempt}/${MAX_RETRIES + 1}...`);

      // First attempt: Find by connection_id (most reliable)
      if (connection_id) {
        const { data, error: connError } = await supabase
          .from("snaptrade_connections")
          .select("user_id, account_id, snaptrade_user_id, connection_id, is_active")
          .eq("snaptrade_user_id", user_id)
          .eq("connection_id", connection_id)
          .eq("is_active", true)
          .maybeSingle();
        
        if (!connError && data) {
          connection = data;
          console.log("✅ Found connection by connection_id");
          break;
        }
      }

      // Fallback: Find by account_id if connection_id lookup failed and account_id is available
      if (!connection && account_id) {
        // First try with is_active filter
        let { data, error: accountError } = await supabase
          .from("snaptrade_connections")
          .select("user_id, account_id, snaptrade_user_id, connection_id, is_active")
          .eq("snaptrade_user_id", user_id)
          .eq("account_id", account_id)
          .eq("is_active", true)
          .maybeSingle();
        
        // If not found, try without is_active filter (in case connection exists but flag not set)
        if (!data && !accountError) {
          const retryResult = await supabase
            .from("snaptrade_connections")
            .select("user_id, account_id, snaptrade_user_id, connection_id, is_active")
            .eq("snaptrade_user_id", user_id)
            .eq("account_id", account_id)
            .maybeSingle();
          data = retryResult.data;
          accountError = retryResult.error;
        }
        
        // If still not found, try with just snaptrade_user_id (broader search)
        if (!data && !accountError) {
          const { data: allConnections } = await supabase
            .from("snaptrade_connections")
            .select("user_id, account_id, snaptrade_user_id, connection_id, is_active")
            .eq("snaptrade_user_id", user_id);
          
          if (allConnections && allConnections.length > 0) {
            // Try to find by matching account_id (case-insensitive or exact)
            const matched = allConnections.find(c => 
              c.account_id === account_id || 
              c.account_id?.toLowerCase() === account_id?.toLowerCase()
            );
            if (matched) {
              data = matched;
            }
          }
        }
        
        if (!accountError && data) {
          connection = data;
          console.log("✅ Found connection by account_id (fallback)", {
            account_id: connection.account_id,
            connection_id: connection.connection_id,
            is_active: connection.is_active,
            attempt: attempt,
          });
          
          // Update connection_id if it was missing
          if (!connection.connection_id && connection_id) {
            console.log("🔄 Updating connection_id in database...");
            await supabase
              .from("snaptrade_connections")
              .update({ connection_id: connection_id })
              .eq("user_id", connection.user_id)
              .eq("snaptrade_user_id", connection.snaptrade_user_id)
              .eq("account_id", connection.account_id);
            console.log("✅ Updated connection_id in database");
          }
          
          // Ensure is_active is set to true if it wasn't
          if (!connection.is_active) {
            console.log("🔄 Updating is_active flag to true...");
            await supabase
              .from("snaptrade_connections")
              .update({ is_active: true })
              .eq("user_id", connection.user_id)
              .eq("snaptrade_user_id", connection.snaptrade_user_id)
              .eq("account_id", connection.account_id);
          }
          break;
        }
      }
    }

    // If connection still not found after all retries, handle gracefully (idempotent)
    if (!connection) {
      console.warn("⚠️ Could not find connection for webhook after all retries (likely race condition)");
      console.warn("Query details:", {
        snaptrade_user_id: user_id,
        connection_id: connection_id,
        account_id: account_id,
        attempts: attempt,
      });
      
      // Log what connections actually exist for debugging
      const { data: allConnections } = await supabase
        .from("snaptrade_connections")
        .select("account_id, snaptrade_user_id, connection_id, is_active")
        .eq("snaptrade_user_id", user_id)
        .limit(10);
      
      if (allConnections && allConnections.length > 0) {
        console.warn("🔍 Existing connections for this snaptrade_user_id:", 
          allConnections.map(c => ({
            account_id: c.account_id,
            connection_id: c.connection_id,
            is_active: c.is_active,
            matches_account_id: c.account_id === account_id,
            matches_connection_id: c.connection_id === connection_id,
          }))
        );
      } else {
        console.warn("🔍 No connections found for snaptrade_user_id (connection may not be stored yet):", user_id);
      }
      
      // Idempotent: Return success even if connection not found
      // The frontend sync will handle the initial sync, and future webhooks will work once connection is stored
      console.log("ℹ️ Webhook processed successfully (connection not found - likely timing issue, frontend sync will handle)");
      return;
    }

    console.log("✅ Found connection for webhook:", {
      supabase_user_id: connection.user_id,
      account_id: connection.account_id,
      snaptrade_user_id: connection.snaptrade_user_id,
    });

    // Sync investments in-process (Vercel/Node.js - has crypto for SnapTrade SDK)
    await syncSnaptradeInvestments(
      connection.user_id,
      connection.snaptrade_user_id,
      connection.account_id
    ).catch((e) =>
      console.error("SnapTrade sync failed after holdings webhook", e)
    );

    console.log("✅ Triggered sync after holdings update webhook");
    
    // Populate investment accounts in main accounts table after webhook sync
    // This ensures the accounts table has the correct balances from investment_balances
    // Note: This is a fire-and-forget operation - we don't wait for it to complete
    try {
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('/rest/v1', '') || 'http://localhost:3000';
      
      fetch(`${baseUrl}/api/store_accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "populate_investment_accounts",
          user_id: connection.user_id,
        }),
      }).catch((err) => {
        console.warn("⚠️ Failed to populate investment accounts after webhook (non-critical):", err.message);
      });
      console.log("✅ Investment accounts population triggered after webhook");
    } catch (populateError) {
      console.warn("⚠️ Error triggering investment account population after webhook (non-critical):", populateError.message);
    }
  } catch (error) {
    console.error("❌ Error handling account holdings updated:", error);
  }
}

// Retry utility with exponential backoff
async function retryOperation(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    operationName = "operation",
    item_id = null,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors (e.g., authentication, validation)
      if (error?.response?.status === 401 || error?.response?.status === 400) {
        console.error(
          `❌ [${operationName}] Non-retryable error:`,
          error.message
        );
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        );
        console.warn(
          `⚠️ [${operationName}] Attempt ${attempt + 1}/${
            maxRetries + 1
          } failed. Retrying in ${delay}ms...`,
          { item_id, error: error.message }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `❌ [${operationName}] All ${maxRetries + 1} attempts failed`,
          { item_id, error: error.message }
        );
      }
    }
  }
  throw lastError;
}

// Log webhook errors for monitoring
async function logWebhookError(item_id, errorType, error) {
  try {
    // You can extend this to log to your error tracking service (e.g., Sentry, LogRocket)
    console.error("🔴 Webhook Error Logged:", {
      item_id,
      errorType,
      error: error?.message || error,
      timestamp: new Date().toISOString(),
    });

    // Optional: Store in database for monitoring
    // await supabase.from('webhook_errors').insert({
    //   item_id,
    //   error_type: errorType,
    //   error_message: error?.message || String(error),
    //   created_at: new Date().toISOString(),
    // });
  } catch (logError) {
    console.error("❌ Failed to log webhook error:", logError);
  }
}

// Sync Plaid investment holdings (called from webhook)
async function syncPlaidHoldings({ access_token, item_id, user_id }) {
  let previousBalancesBackup = null;

  try {
    console.log("📈 Syncing Plaid investment holdings...", {
      item_id,
      user_id: user_id?.substring(0, 8) + "...",
    });

    // Backup current balances before update (for rollback)
    const { data: currentBalances } = await supabase
      .from("investment_balances")
      .select("*")
      .eq("user_id", user_id)
      .eq("item_id", item_id)
      .eq("provider", "plaid")
      .eq("is_current", true);

    previousBalancesBackup = currentBalances || [];

    // Fetch holdings from Plaid with retry
    const holdingsResponse = await retryOperation(
      async () => {
        return await plaidClient.investmentsHoldingsGet({
          access_token,
        });
      },
      {
        maxRetries: 3,
        operationName: "plaid_holdings_get",
        item_id,
      }
    );

    const holdings = holdingsResponse.data.holdings || [];
    const securities = holdingsResponse.data.securities || [];
    const accounts = holdingsResponse.data.accounts || [];

    if (holdings.length === 0) {
      console.log("ℹ️ No holdings found for this Plaid item");
      return;
    }

    // Create maps for quick lookup
    const securitiesMap = new Map();
    securities.forEach((security) => {
      securitiesMap.set(security.security_id, security);
    });

    const accountsMap = new Map();
    accounts.forEach((account) => {
      accountsMap.set(account.account_id, account);
    });

    // Get existing holdings to calculate day_change
    const { data: existingHoldings } = await supabase
      .from("investment_holdings")
      .select(
        "security_id, previous_market_value, market_value, plaid_account_id"
      )
      .eq("user_id", user_id)
      .eq("item_id", item_id)
      .eq("provider", "plaid")
      .eq("is_active", true);

    // Process holdings
    const holdingsRows = holdings
      .map((holding) => {
        const security = securitiesMap.get(holding.security_id);
        if (!security) {
          console.warn(
            `⚠️ Security not found for security_id: ${holding.security_id}`
          );
          return null;
        }

        // Find existing holding for day_change calculation
        const existingHolding = existingHoldings?.find(
          (eh) =>
            eh.security_id === holding.security_id &&
            eh.plaid_account_id === holding.account_id
        );

        const previousMarketValue =
          existingHolding?.previous_market_value ??
          existingHolding?.market_value ??
          null;

        const currentMarketValue = holding.institution_value || 0;
        const currentPrice =
          holding.institution_price || security.close_price || 0;
        const quantity = holding.quantity || 0;
        const costBasis = holding.cost_basis || 0;

        // Calculate day_change
        let dayChange = null;
        let dayChangePercent = null;
        if (
          previousMarketValue !== null &&
          previousMarketValue !== undefined &&
          currentMarketValue !== null
        ) {
          dayChange = currentMarketValue - previousMarketValue;
          dayChangePercent =
            previousMarketValue !== 0
              ? (dayChange / previousMarketValue) * 100
              : 0;
        }

        // Calculate unrealized P&L and total_percent_change
        const unrealizedPL = currentMarketValue - costBasis;
        const totalPercentChange =
          costBasis !== 0 && costBasis !== null
            ? ((currentMarketValue - costBasis) / costBasis) * 100
            : null;

        return {
          user_id,
          provider: "plaid",
          item_id,
          plaid_account_id: holding.account_id,
          security_id: holding.security_id,
          symbol: security.ticker_symbol || security.name || null,
          description: security.name || null,
          currency_code:
            holding.iso_currency_code || security.iso_currency_code || "USD",
          exchange_code: security.market_identifier_code || null,
          exchange_name: null,
          security_type: security.type || null,
          sector: security.sector || null,
          industry: security.industry || null,
          units: quantity,
          price: currentPrice,
          market_value: currentMarketValue,
          previous_market_value: currentMarketValue,
          average_purchase_price:
            costBasis > 0 && quantity > 0 ? costBasis / quantity : null,
          total_cost_basis: costBasis,
          unrealized_pl: unrealizedPL,
          day_change: dayChange,
          day_change_percent: dayChangePercent,
          total_percent_change: totalPercentChange,
          is_active: true,
          last_updated: new Date().toISOString(),
          snaptrade_user_id: null,
          account_id: holding.account_id, // Use plaid_account_id value for account_id (required field)
          symbol_id: null,
        };
      })
      .filter((h) => h !== null);

    if (holdingsRows.length > 0) {
      // Upsert holdings with retry and fallback
      let holdingsError = null;

      try {
        const { error: upsertError } = await supabase
          .from("investment_holdings")
          .upsert(holdingsRows, {
            onConflict: "user_id,item_id,plaid_account_id,security_id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          holdingsError = upsertError;
          console.error(
            "❌ Error upserting Plaid holdings (batch):",
            upsertError
          );

          // Fallback: Try individual upserts
          console.log("🔄 Attempting individual holdings upserts...");
          let successCount = 0;
          let failCount = 0;

          for (const holding of holdingsRows) {
            try {
              const { error: individualError } = await supabase
                .from("investment_holdings")
                .upsert(holding, {
                  onConflict: "user_id,item_id,plaid_account_id,security_id",
                  ignoreDuplicates: false,
                });

              if (individualError) {
                console.error(
                  `❌ Failed to upsert holding ${
                    holding.symbol || holding.security_id
                  }:`,
                  individualError
                );
                failCount++;
              } else {
                successCount++;
              }
            } catch (err) {
              console.error(
                `❌ Exception upserting holding ${
                  holding.symbol || holding.security_id
                }:`,
                err
              );
              failCount++;
            }
          }

          if (failCount > 0) {
            console.warn(
              `⚠️ ${failCount} holdings failed to upsert, ${successCount} succeeded`
            );
          } else {
            console.log(
              `✅ All ${successCount} holdings upserted individually`
            );
          }
        } else {
          console.log(
            `✅ Stored ${holdingsRows.length} Plaid investment holdings`
          );
        }
      } catch (err) {
        console.error("❌ Exception during holdings upsert:", err);
        throw err;
      }

      // Mark removed holdings as inactive
      await new Promise((resolve) => setTimeout(resolve, 500));

      const activeSecurityIds = new Set(
        holdingsRows
          .map((h) => h.security_id)
          .filter((id) => id !== null && id !== undefined && id !== "")
      );
      const activeAccountIds = new Set(
        holdingsRows
          .map((h) => h.plaid_account_id)
          .filter((id) => id !== null && id !== undefined && id !== "")
      );

      if (activeSecurityIds.size > 0 && activeAccountIds.size > 0) {
        const { data: allActiveHoldings, error: fetchError } = await supabase
          .from("investment_holdings")
          .select("security_id, plaid_account_id")
          .eq("user_id", user_id)
          .eq("item_id", item_id)
          .eq("provider", "plaid")
          .eq("is_active", true);

        if (!fetchError && allActiveHoldings && allActiveHoldings.length > 0) {
          const removedHoldings = allActiveHoldings.filter((h) => {
            if (!h.security_id || !h.plaid_account_id) return false;
            return (
              !activeSecurityIds.has(h.security_id) ||
              !activeAccountIds.has(h.plaid_account_id)
            );
          });

          if (removedHoldings.length > 0) {
            const removedSecurityIds = removedHoldings
              .map((h) => h.security_id)
              .filter((id) => id);
            const removedAccountIds = removedHoldings
              .map((h) => h.plaid_account_id)
              .filter((id) => id);

            await supabase
              .from("investment_holdings")
              .update({
                is_active: false,
                last_updated: new Date().toISOString(),
              })
              .eq("user_id", user_id)
              .eq("item_id", item_id)
              .eq("provider", "plaid")
              .in("security_id", removedSecurityIds)
              .in("plaid_account_id", removedAccountIds);

            console.log(
              `✅ Marked ${removedHoldings.length} removed holdings as inactive`
            );
          }
        }
      }
    }

    // Update account balances
    const investmentAccounts = accounts.filter(
      (account) => account.type === "investment"
    );
    const balanceRows = await Promise.all(
      investmentAccounts.map(async (account) => {
        const accountHoldings = holdingsRows.filter(
          (h) => h.plaid_account_id === account.account_id
        );
        const totalHoldingsValue = accountHoldings.reduce(
          (sum, h) => sum + (h.market_value || 0),
          0
        );
        const cashBalance = account.balances?.current || 0;
        const totalValue = totalHoldingsValue + cashBalance;

        const { data: existingBalance } = await supabase
          .from("investment_balances")
          .select("previous_total_value, total_value")
          .eq("user_id", user_id)
          .eq("item_id", item_id)
          .eq("plaid_account_id", account.account_id)
          .eq("provider", "plaid")
          .eq("is_current", true)
          .single();

        const previousTotalValue =
          existingBalance?.previous_total_value ??
          existingBalance?.total_value ??
          null;

        let dayChange = null;
        let dayChangePercent = null;
        if (previousTotalValue !== null && previousTotalValue !== undefined) {
          dayChange = totalValue - previousTotalValue;
          dayChangePercent =
            previousTotalValue !== 0
              ? (dayChange / previousTotalValue) * 100
              : 0;
        }

        return {
          user_id,
          provider: "plaid",
          item_id,
          plaid_account_id: account.account_id,
          currency_code: account.balances?.iso_currency_code || "USD",
          cash: cashBalance,
          buying_power: 0,
          total_value: totalValue,
          previous_total_value: totalValue,
          day_change: dayChange,
          day_change_percent: dayChangePercent,
          total_change: null,
          total_change_percent: null,
          is_current: true,
          last_updated: new Date().toISOString(),
          snaptrade_user_id: null,
          account_id: account.account_id, // Use plaid_account_id value for account_id (required field)
        };
      })
    );

    if (balanceRows.length > 0) {
      // Mark previous balances as not current (with error handling)
      const { error: markError } = await supabase
        .from("investment_balances")
        .update({ is_current: false })
        .eq("user_id", user_id)
        .eq("item_id", item_id)
        .eq("provider", "plaid");

      if (markError) {
        console.error(
          "❌ Error marking previous balances as not current:",
          markError
        );
        // Don't proceed with upsert if marking failed (data integrity)
        throw new Error(
          `Failed to mark previous balances: ${markError.message}`
        );
      }

      // Upsert balances with retry and rollback capability
      try {
        const { error: balancesError } = await supabase
          .from("investment_balances")
          .upsert(balanceRows, {
            onConflict: "user_id,item_id,plaid_account_id,currency_code",
            ignoreDuplicates: false,
          });

        if (balancesError) {
          console.error("❌ Error upserting Plaid balances:", balancesError);

          // Rollback: Restore previous balances as current
          console.log("🔄 Rolling back balance updates...");
          if (previousBalancesBackup && previousBalancesBackup.length > 0) {
            const rollbackData = previousBalancesBackup.map((b) => ({
              ...b,
              is_current: true,
            }));

            const { error: rollbackError } = await supabase
              .from("investment_balances")
              .upsert(rollbackData, {
                onConflict: "user_id,item_id,plaid_account_id,currency_code",
              });

            if (rollbackError) {
              console.error(
                "❌ Critical: Failed to rollback balances:",
                rollbackError
              );
            } else {
              console.log("✅ Successfully rolled back balance updates");
            }
          }

          throw balancesError;
        } else {
          console.log(
            `✅ Stored ${balanceRows.length} Plaid investment account balances`
          );
        }
      } catch (err) {
        // If upsert fails, attempt rollback
        if (previousBalancesBackup && previousBalancesBackup.length > 0) {
          try {
            const rollbackData = previousBalancesBackup.map((b) => ({
              ...b,
              is_current: true,
            }));
            await supabase.from("investment_balances").upsert(rollbackData, {
              onConflict: "user_id,item_id,plaid_account_id,currency_code",
            });
            console.log("✅ Rolled back balances after error");
          } catch (rollbackErr) {
            console.error("❌ Critical: Rollback failed:", rollbackErr);
          }
        }
        throw err;
      }
    }

    console.log("✅ Plaid holdings sync completed successfully");
  } catch (error) {
    console.error("❌ Error syncing Plaid holdings:", error);

    // Log error details for monitoring
    await logWebhookError(item_id, "sync_plaid_holdings_failed", error);

    throw error;
  }
}
