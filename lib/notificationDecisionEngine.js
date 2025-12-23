// lib/notificationDecisionEngine.js
// Decision engine for evaluating which notification triggers should be sent
import { supabase } from "./api/supabase.js";

/**
 * Get pending triggers for a user that are ready to send
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of triggers to return
 * @returns {Promise<Array>} Array of triggers ready to send
 */
export async function getTriggersToSend(userId, limit = 10) {
  if (!userId) {
    console.warn("[DECISION_ENGINE] No userId provided");
    return [];
  }

  try {
    const now = new Date().toISOString();

    // Query pending triggers that are past cooldown
    const { data: triggers, error } = await supabase
      .from("notification_triggers")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
      .order("priority", { ascending: false })
      .order("detected_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[DECISION_ENGINE] Error fetching triggers:", error);
      return [];
    }

    return triggers || [];
  } catch (error) {
    console.error("[DECISION_ENGINE] Error in getTriggersToSend:", error);
    return [];
  }
}

/**
 * Evaluate if a trigger should be sent based on user preferences
 * @param {Object} trigger - Notification trigger object
 * @param {Object} userPreferences - User notification preferences
 * @returns {Promise<{shouldSend: boolean, reason?: string}>}
 */
export async function evaluateTrigger(trigger, userPreferences) {
  // Check if proactive notifications are enabled
  if (!userPreferences.proactive_enabled) {
    return { shouldSend: false, reason: "Proactive notifications disabled" };
  }

  // Check quiet hours if configured
  if (userPreferences.quiet_hours_start && userPreferences.quiet_hours_end) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight
    const startMinutes = timeToMinutes(userPreferences.quiet_hours_start);
    const endMinutes = timeToMinutes(userPreferences.quiet_hours_end);

    let isQuietHours = false;
    if (startMinutes < endMinutes) {
      // Normal case: start < end (e.g., 22:00 to 08:00 next day)
      isQuietHours = currentTime >= startMinutes && currentTime < endMinutes;
    } else {
      // Wraps midnight (e.g., 22:00 to 08:00)
      isQuietHours = currentTime >= startMinutes || currentTime < endMinutes;
    }

    if (isQuietHours) {
      return { shouldSend: false, reason: "Quiet hours active" };
    }
  }

  // Check daily notification limit
  const sentToday = await countNotificationsSentToday(trigger.user_id);
  const maxPerDay = userPreferences.max_notifications_per_day || 5;

  if (sentToday >= maxPerDay) {
    return {
      shouldSend: false,
      reason: `Daily limit reached (${sentToday}/${maxPerDay})`,
    };
  }

  return { shouldSend: true };
}

/**
 * Get all triggers that should be sent for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of triggers to send
 */
export async function getTriggersForUser(userId) {
  if (!userId) {
    console.warn("[DECISION_ENGINE] No userId provided");
    return [];
  }

  try {
    // Get user preferences
    const { data: preferences, error: prefError } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (prefError) {
      console.error("[DECISION_ENGINE] Error fetching preferences:", prefError);
      // Default preferences if not found
      const defaultPreferences = {
        proactive_enabled: true,
        max_notifications_per_day: 5,
        quiet_hours_start: null,
        quiet_hours_end: null,
      };
      return await filterTriggersWithPreferences(userId, defaultPreferences);
    }

    // Use default preferences if not found
    const userPreferences = preferences || {
      proactive_enabled: true,
      max_notifications_per_day: 5,
      quiet_hours_start: null,
      quiet_hours_end: null,
    };

    return await filterTriggersWithPreferences(userId, userPreferences);
  } catch (error) {
    console.error("[DECISION_ENGINE] Error in getTriggersForUser:", error);
    return [];
  }
}

/**
 * Filter triggers based on user preferences
 * @param {string} userId - User ID
 * @param {Object} userPreferences - User preferences
 * @returns {Promise<Array>} Filtered triggers
 */
async function filterTriggersWithPreferences(userId, userPreferences) {
  const triggers = await getTriggersToSend(userId, 20); // Get more than needed for filtering

  const triggersToSend = [];

  for (const trigger of triggers) {
    const evaluation = await evaluateTrigger(trigger, userPreferences);
    if (evaluation.shouldSend) {
      triggersToSend.push(trigger);
    } else {
      console.log(
        `[DECISION_ENGINE] Skipping trigger ${trigger.id}: ${evaluation.reason}`
      );
    }

    // Stop if we've reached the daily limit
    if (triggersToSend.length >= userPreferences.max_notifications_per_day) {
      break;
    }
  }

  return triggersToSend;
}

/**
 * Count notifications sent today for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Count of notifications sent today
 */
async function countNotificationsSentToday(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { count, error } = await supabase
      .from("notification_triggers")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "sent")
      .gte("sent_at", todayISO);

    if (error) {
      console.error(
        "[DECISION_ENGINE] Error counting notifications sent today:",
        error
      );
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error(
      "[DECISION_ENGINE] Error in countNotificationsSentToday:",
      error
    );
    return 0;
  }
}

/**
 * Convert time string (HH:MM) to minutes since midnight
 * @param {string} timeStr - Time string in HH:MM format
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

