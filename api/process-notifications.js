// api/process-notifications.js
// Scheduled processor for proactive notifications
import { supabase } from "../lib/api/supabase.js";
import { getTriggersForUser } from "../lib/notificationDecisionEngine.js";
import { sendNotificationsForUser } from "../lib/notificationSender.js";

export default async function handler(req, res) {
  // Only allow GET requests (for cron triggers)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log(
    "🔄 Starting notification processing at",
    new Date().toISOString()
  );

  const startedAt = new Date().toISOString();

  try {
    // Get all users with pending triggers
    const { data: usersWithTriggers, error: usersError } = await supabase
      .from("notification_triggers")
      .select("user_id")
      .eq("status", "pending")
      .not("cooldown_until", "gt", new Date().toISOString());

    if (usersError) {
      console.error("❌ Error fetching users with triggers:", usersError);
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    if (!usersWithTriggers || usersWithTriggers.length === 0) {
      console.log("ℹ️ No users with pending triggers");
      return res.status(200).json({
        message: "No pending triggers",
        processed_users: 0,
        total_sent: 0,
        total_failed: 0,
      });
    }

    // Get unique user IDs
    const uniqueUserIds = [
      ...new Set(usersWithTriggers.map((item) => item.user_id)),
    ];

    console.log(`📊 Found ${uniqueUserIds.length} users with pending triggers`);

    const results = {
      processed_users: 0,
      total_sent: 0,
      total_failed: 0,
      errors: [],
    };

    // Process each user
    for (const userId of uniqueUserIds) {
      try {
        console.log(`🔄 Processing notifications for user ${userId.substring(0, 8)}...`);

        // Get triggers that should be sent for this user
        const triggersToSend = await getTriggersForUser(userId);

        if (triggersToSend.length === 0) {
          console.log(`ℹ️ No triggers to send for user ${userId.substring(0, 8)}`);
          continue;
        }

        console.log(
          `📨 Sending ${triggersToSend.length} notifications for user ${userId.substring(0, 8)}`
        );

        // Send notifications
        const sendResult = await sendNotificationsForUser(userId, triggersToSend);

        results.processed_users++;
        results.total_sent += sendResult.sent;
        results.total_failed += sendResult.failed;

        if (sendResult.errors && sendResult.errors.length > 0) {
          results.errors.push({
            user_id: userId,
            errors: sendResult.errors,
          });
        }

        console.log(
          `✅ User ${userId.substring(0, 8)}: ${sendResult.sent} sent, ${sendResult.failed} failed`
        );
      } catch (error) {
        console.error(
          `❌ Error processing user ${userId.substring(0, 8)}:`,
          error
        );
        results.errors.push({
          user_id: userId,
          error: error.message,
        });
        // Continue processing other users
      }
    }

    const completedAt = new Date().toISOString();

    console.log(
      `✅ Notification processing complete: ${results.processed_users} users processed, ${results.total_sent} sent, ${results.total_failed} failed`
    );

    return res.status(200).json({
      message: "Notification processing completed",
      processed_users: results.processed_users,
      total_sent: results.total_sent,
      total_failed: results.total_failed,
      errors: results.errors.length > 0 ? results.errors : undefined,
      started_at: startedAt,
      completed_at: completedAt,
    });
  } catch (error) {
    console.error("❌ Notification processing error:", error);
    return res.status(500).json({
      error: "Notification processing failed",
      details: error.message,
    });
  }
}

