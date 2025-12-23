// lib/notificationSender.js
// Notification sender for Expo Push Notifications
import { supabase } from "./api/supabase.js";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Get active push tokens for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array<string>>} Array of Expo push tokens
 */
export async function getPushTokensForUser(userId) {
  if (!userId) {
    console.warn("[NOTIFICATION_SENDER] No userId provided");
    return [];
  }

  try {
    const { data: tokens, error } = await supabase
      .from("user_push_tokens")
      .select("expo_push_token, id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      console.error("[NOTIFICATION_SENDER] Error fetching push tokens:", error);
      return [];
    }

    return (tokens || []).map((t) => t.expo_push_token);
  } catch (error) {
    console.error("[NOTIFICATION_SENDER] Error in getPushTokensForUser:", error);
    return [];
  }
}

/**
 * Generate notification content from trigger
 * @param {Object} trigger - Notification trigger object
 * @returns {Object} Notification content { title, body, data }
 */
export function generateNotificationContent(trigger) {
  const metadata = trigger.trigger_metadata || {};
  const triggerType = trigger.trigger_type;

  let title = "💰 Finny Update";
  let body = "";
  const data = {
    type: "proactive",
    trigger_type: triggerType,
    trigger_id: trigger.id,
  };

  switch (triggerType) {
    case "paycheck":
      const paycheckAmount = metadata.amount
        ? `$${Math.abs(metadata.amount).toLocaleString()}`
        : "money";
      title = "💰 Paycheck Received!";
      body = `Your paycheck of ${paycheckAmount} has been deposited!`;
      data.amount = metadata.amount;
      data.transaction_id = metadata.transaction_id;
      break;

    case "money_received":
      const receivedAmount = metadata.amount
        ? `$${Math.abs(metadata.amount).toLocaleString()}`
        : "money";
      const source = metadata.merchant_name || metadata.name || "a source";
      title = "💵 Money Received!";
      body = `You received ${receivedAmount} from ${source}`;
      data.amount = metadata.amount;
      data.transaction_id = metadata.transaction_id;
      break;

    case "spending_spike":
      const spikeAmount = metadata.recent_total
        ? `$${Math.abs(metadata.recent_total).toLocaleString()}`
        : "significant amount";
      title = "📈 Spending Spike Detected";
      body = `You've spent ${spikeAmount} in the last 3 days - that's ${Math.round(
        (metadata.spike_ratio || 1) * 100
      )}% above your average!`;
      data.recent_total = metadata.recent_total;
      data.spike_ratio = metadata.spike_ratio;
      break;

    case "spending_drought":
      const days = metadata.days_without_spending || 4;
      title = "🌵 Saving Streak!";
      body = `You haven't spent anything for ${days} days - great job on saving!`;
      data.days_without_spending = days;
      break;

    case "custom":
      title = "💡 Finny Insight";
      body =
        metadata.notification_hook ||
        metadata.pattern_description ||
        "We noticed something interesting about your finances!";
      data.pattern_type = metadata.pattern_type;
      data.pattern_description = metadata.pattern_description;
      break;

    default:
      title = "💰 Finny Update";
      body = "We have an update about your finances!";
  }

  return { title, body, data };
}

/**
 * Send push notification via Expo Push API with retry logic
 * @param {string} expoPushToken - Expo push token
 * @param {Object} notification - Notification content { title, body, data }
 * @param {number} retries - Number of retries remaining (default: 2)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendPushNotification(expoPushToken, notification, retries = 2) {
  if (!expoPushToken) {
    return { success: false, error: "No push token provided" };
  }

  try {
    const payload = {
      to: expoPushToken,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: "default",
      priority: "high",
    };

    const response = await fetch(EXPO_PUSH_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;

      if (retries > 0) {
        console.log(
          `[NOTIFICATION_SENDER] Rate limited, retrying after ${waitTime}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return sendPushNotification(expoPushToken, notification, retries - 1);
      }

      return {
        success: false,
        error: "Rate limited - max retries exceeded",
      };
    }

    const result = await response.json();

    // Expo Push API returns { data: [{ status: 'ok' | 'error', ... }] }
    if (result.data && result.data.length > 0) {
      const receipt = result.data[0];
      if (receipt.status === "ok") {
        return { success: true };
      } else {
        const errorMsg = receipt.message || "Unknown error";
        
        // Retry on transient errors
        if (
          retries > 0 &&
          (errorMsg.includes("timeout") ||
            errorMsg.includes("network") ||
            errorMsg.includes("temporarily"))
        ) {
          const waitTime = Math.pow(2, 2 - retries) * 1000; // Exponential backoff
          console.log(
            `[NOTIFICATION_SENDER] Transient error, retrying after ${waitTime}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          return sendPushNotification(expoPushToken, notification, retries - 1);
        }

        return { success: false, error: errorMsg };
      }
    }

    return { success: false, error: "Invalid response from Expo API" };
  } catch (error) {
    // Retry on network errors
    if (retries > 0 && (error.message.includes("network") || error.message.includes("fetch"))) {
      const waitTime = Math.pow(2, 2 - retries) * 1000; // Exponential backoff
      console.log(
        `[NOTIFICATION_SENDER] Network error, retrying after ${waitTime}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return sendPushNotification(expoPushToken, notification, retries - 1);
    }

    console.error("[NOTIFICATION_SENDER] Error sending push notification:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notifications for a user's triggers
 * @param {string} userId - User ID
 * @param {Array} triggers - Array of triggers to send
 * @returns {Promise<{sent: number, failed: number, errors: Array}>}
 */
export async function sendNotificationsForUser(userId, triggers) {
  if (!userId || !triggers || triggers.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  // Get push tokens for user
  const pushTokens = await getPushTokensForUser(userId);

  if (pushTokens.length === 0) {
    console.warn(
      `[NOTIFICATION_SENDER] No push tokens found for user ${userId}`
    );
    return { sent: 0, failed: triggers.length, errors: ["No push tokens"] };
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  // Process each trigger
  for (const trigger of triggers) {
    try {
      // Generate notification content
      const notification = generateNotificationContent(trigger);

      // Send to all user's devices
      let triggerSent = false;
      let triggerFailed = false;

      for (const token of pushTokens) {
        const result = await sendPushNotification(token, notification);

        if (result.success) {
          triggerSent = true;
        } else {
          triggerFailed = true;
          errors.push({
            trigger_id: trigger.id,
            token: token.substring(0, 20) + "...",
            error: result.error,
          });

          // Handle invalid token errors
          if (
            result.error &&
            (result.error.includes("InvalidToken") ||
              result.error.includes("DeviceNotRegistered"))
          ) {
            // Mark token as inactive
            await markTokenInactive(token);
          }
        }
      }

      // Update trigger status if at least one device received it
      if (triggerSent) {
        const { error: updateError } = await supabase
          .from("notification_triggers")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", trigger.id);

        if (updateError) {
          console.error(
            `[NOTIFICATION_SENDER] Error updating trigger ${trigger.id}:`,
            updateError
          );
        } else {
          sent++;
        }
      } else {
        // All sends failed - check retry count
        failed++;
        await handleFailedTrigger(trigger);
      }
    } catch (error) {
      console.error(
        `[NOTIFICATION_SENDER] Error processing trigger ${trigger.id}:`,
        error
      );
      failed++;
      errors.push({
        trigger_id: trigger.id,
        error: error.message,
      });
    }
  }

  return { sent, failed, errors };
}

/**
 * Mark a push token as inactive
 * @param {string} expoPushToken - Expo push token
 */
async function markTokenInactive(expoPushToken) {
  try {
    const { error } = await supabase
      .from("user_push_tokens")
      .update({ is_active: false })
      .eq("expo_push_token", expoPushToken);

    if (error) {
      console.error(
        `[NOTIFICATION_SENDER] Error marking token inactive:`,
        error
      );
    } else {
      console.log(
        `[NOTIFICATION_SENDER] Marked invalid token as inactive`
      );
    }
  } catch (error) {
    console.error(
      `[NOTIFICATION_SENDER] Error in markTokenInactive:`,
      error
    );
  }
}

/**
 * Handle failed trigger - track retries and mark as expired after 3 attempts
 * @param {Object} trigger - Notification trigger object
 */
async function handleFailedTrigger(trigger) {
  try {
    // Check how many times we've tried to send this trigger
    // We'll use a simple approach: check if trigger is older than 3 days
    const detectedAt = new Date(trigger.detected_at);
    const daysSinceDetection = Math.floor(
      (Date.now() - detectedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // If trigger is older than 3 days and still pending, mark as expired
    if (daysSinceDetection >= 3) {
      const { error } = await supabase
        .from("notification_triggers")
        .update({
          status: "expired",
        })
        .eq("id", trigger.id);

      if (error) {
        console.error(
          `[NOTIFICATION_SENDER] Error marking trigger ${trigger.id} as expired:`,
          error
        );
      } else {
        console.log(
          `[NOTIFICATION_SENDER] Marked trigger ${trigger.id} as expired (${daysSinceDetection} days old)`
        );
      }
    }
  } catch (error) {
    console.error(
      `[NOTIFICATION_SENDER] Error in handleFailedTrigger:`,
      error
    );
  }
}

