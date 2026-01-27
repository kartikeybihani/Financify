#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";

/**
 * CLI Script: Manual Notification Trigger
 * =======================================
 * Run this script to manually trigger notifications for all users or a specific user
 *
 * Usage:
 * ------
 * # Send to all users:
 * node scripts/manual-notification-trigger.js --type custom --message "Your weekly summary is ready!" --send
 *
 * # Send to specific user:
 * node scripts/manual-notification-trigger.js --user-id USER_ID --type custom --message "Test notification" --send
 *
 * # Create triggers without sending (let scheduled processor handle it):
 * node scripts/manual-notification-trigger.js --type custom --message "Check your finances!"
 *
 * # Show help:
 * node scripts/manual-notification-trigger.js --help
 */

import { supabase } from "../lib/api/supabase.js";
import {
  sendNotificationsForUser,
  getPushTokensForUser,
} from "../lib/notificationSender.js";
import {
  getTriggersForUser,
  evaluateTrigger,
} from "../lib/notificationDecisionEngine.js";

const validTriggerTypes = [
  "paycheck",
  "money_received",
  "spending_spike",
  "spending_drought",
  "weekly_summary",
  "goal_milestone",
  "custom",
];

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    userId: undefined,
    triggerType: undefined,
    triggerMetadata: {},
    priority: 5,
    sendImmediately: false,
    bypassPreferences: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--user-id":
      case "-u":
        options.userId = args[++i];
        break;

      case "--type":
      case "-t":
        options.triggerType = args[++i];
        break;

      case "--message":
      case "-m":
        options.triggerMetadata.notification_hook = args[++i];
        break;

      case "--metadata":
        try {
          options.triggerMetadata = JSON.parse(args[++i]);
        } catch (e) {
          console.error("❌ Invalid JSON for --metadata:", e.message);
          process.exit(1);
        }
        break;

      case "--priority":
      case "-p":
        options.priority = parseInt(args[++i], 10);
        if (
          isNaN(options.priority) ||
          options.priority < 1 ||
          options.priority > 10
        ) {
          console.error("❌ Priority must be between 1 and 10");
          process.exit(1);
        }
        break;

      case "--send":
      case "-s":
        options.sendImmediately = true;
        break;

      case "--force":
      case "-f":
        options.bypassPreferences = true;
        break;

      case "--help":
      case "-h":
        options.help = true;
        break;

      default:
        console.warn(`⚠️  Unknown argument: ${arg}`);
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║   Manual Notification Trigger                                 ║
╚════════════════════════════════════════════════════════════════╝

This script creates and optionally sends notification triggers to users.

USAGE:
  node scripts/manual-notification-trigger.js [OPTIONS]

OPTIONS:
  --user-id, -u <id>        User ID (optional - if omitted, sends to all users)
  --type, -t <type>         Trigger type (required)
                            Options: ${validTriggerTypes.join(", ")}
  --message, -m <text>       Notification message (for custom type)
  --metadata <json>         Full metadata JSON object (overrides --message)
  --priority, -p <1-10>     Priority (default: 5)
  --send, -s                Send notifications immediately (default: false)
  --force, -f               Bypass user preference checks (admin override)
  --help, -h                Show this help message

EXAMPLES:
  # Send custom notification to all users immediately:
  node scripts/manual-notification-trigger.js \\
    --type custom \\
    --message "Your weekly summary is ready!" \\
    --send

  # Send to specific user:
  node scripts/manual-notification-trigger.js \\
    --user-id abc-123-def-456 \\
    --type custom \\
    --message "Test notification" \\
    --send

  # Create paycheck trigger with metadata:
  node scripts/manual-notification-trigger.js \\
    --type paycheck \\
    --metadata '{"amount": 5000, "transaction_id": "txn-123"}' \\
    --send

  # Create triggers without sending (let scheduled processor handle it):
  node scripts/manual-notification-trigger.js \\
    --type custom \\
    --message "Check your finances!"

TRIGGER TYPES:
  - paycheck: Paycheck received notification
  - money_received: Money received from a source
  - spending_spike: Spending spike detected
  - spending_drought: Spending drought (saving streak)
  - weekly_summary: Weekly financial summary
  - goal_milestone: Goal milestone reached
  - custom: Custom notification message

METADATA EXAMPLES:
  Paycheck:
    {"amount": 5000, "transaction_id": "txn-123"}
  
  Money Received:
    {"amount": 1000, "merchant_name": "John Doe", "transaction_id": "txn-456"}
  
  Spending Spike:
    {"recent_total": 1500, "spike_ratio": 1.5}
  
  Spending Drought:
    {"days_without_spending": 5}
  
  Custom:
    {"notification_hook": "Your message here"}

SAFETY:
  ✓ Defaults to creating triggers only (not sending immediately)
  ✓ Use --send flag to send immediately
  ✓ Respects user notification preferences
  ✓ Only sends to users with active push tokens

`);
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate required arguments
  if (!options.triggerType) {
    console.error("❌ Error: --type is required");
    console.log("\nUse --help for usage information");
    process.exit(1);
  }

  if (!validTriggerTypes.includes(options.triggerType)) {
    console.error(
      `❌ Error: Invalid trigger type. Must be one of: ${validTriggerTypes.join(", ")}`,
    );
    process.exit(1);
  }

  // For custom type, ensure we have a message
  if (
    options.triggerType === "custom" &&
    !options.triggerMetadata.notification_hook
  ) {
    console.error("❌ Error: --message is required for custom trigger type");
    process.exit(1);
  }

  console.log(
    `🔄 Creating notification triggers: type=${options.triggerType}, userId=${options.userId || "ALL"}, sendImmediately=${options.sendImmediately}\n`,
  );

  let targetUserIds = [];

  if (options.userId) {
    // Single user - verify exists
    try {
      const { data: user, error: userError } =
        await supabase.auth.admin.getUserById(options.userId);
      if (userError || !user) {
        console.error(`❌ Error: User not found: ${options.userId}`);
        process.exit(1);
      }
      targetUserIds = [options.userId];
      console.log(`✅ Found user: ${options.userId.substring(0, 8)}...`);
    } catch (error) {
      console.error(`❌ Error verifying user: ${error.message}`);
      process.exit(1);
    }
  } else {
    // All users
    try {
      const { data: users, error: usersError } =
        await supabase.auth.admin.listUsers();
      if (usersError) {
        throw usersError;
      }
      targetUserIds = users.users.map((u) => u.id);
      console.log(`📊 Found ${targetUserIds.length} users via auth.admin`);
    } catch (authError) {
      // Fallback: get user IDs from user_push_tokens
      console.log("⚠️  auth.admin failed, falling back to user_push_tokens");
      const { data: tokens, error: tokensError } = await supabase
        .from("user_push_tokens")
        .select("user_id")
        .eq("is_active", true);

      if (tokensError) {
        console.error("❌ Error fetching users:", tokensError);
        process.exit(1);
      }

      targetUserIds = [...new Set(tokens.map((t) => t.user_id))];
      console.log(
        `📊 Found ${targetUserIds.length} users via user_push_tokens`,
      );
    }
  }

  const results = {
    triggers_created: 0,
    triggers_failed: 0,
    notifications_sent: 0,
    notifications_failed: 0,
    errors: [],
  };

  // Create triggers for each user
  for (const targetUserId of targetUserIds) {
    try {
        const { data: trigger, error: insertError } = await supabase
          .from("notification_triggers")
          .insert({
            user_id: targetUserId,
            trigger_type: options.triggerType,
            trigger_metadata: options.triggerMetadata,
            priority: options.priority,
            status: "pending",
            detected_at: new Date().toISOString(),
          })
          .select("*")
          .single();

      if (insertError) {
        console.error(
          `❌ Error creating trigger for user ${targetUserId.substring(0, 8)}:`,
          insertError.message,
        );
        results.triggers_failed++;
        results.errors.push({
          user_id: targetUserId,
          error: insertError.message,
        });
        continue;
      }

      results.triggers_created++;
      console.log(
        `✅ Created trigger ${trigger.id.substring(0, 8)}... for user ${targetUserId.substring(0, 8)}...`,
      );

      // If sendImmediately is true, send the notification right away
      if (options.sendImmediately) {
        try {
          if (options.bypassPreferences) {
            // Bypass preference checks - send directly
            console.log(
              `⚡ Bypassing preference checks for trigger ${trigger.id.substring(0, 8)}...`,
            );

            // Check if user has push tokens first
            const pushTokens = await getPushTokensForUser(targetUserId);
            if (pushTokens.length === 0) {
              console.log(
                `⚠️  No push tokens found for user ${targetUserId.substring(0, 8)}...`,
              );
              console.log(
                `   💡 User needs to open the app to register their push token`,
              );
              results.notifications_failed++;
              results.errors.push({
                user_id: targetUserId,
                trigger_id: trigger.id,
                error: "No push tokens registered. User needs to open the app.",
              });
              continue;
            }

            console.log(
              `📱 Found ${pushTokens.length} push token(s) for user ${targetUserId.substring(0, 8)}...`,
            );

            const sendResult = await sendNotificationsForUser(targetUserId, [
              trigger,
            ]);
            results.notifications_sent += sendResult.sent;
            results.notifications_failed += sendResult.failed;

            if (sendResult.errors && sendResult.errors.length > 0) {
              // Handle both string array errors and object array errors
              const errorDetails = sendResult.errors.map((err) => {
                if (typeof err === "string") {
                  return err;
                }
                return err.error || err.message || JSON.stringify(err);
              });

              results.errors.push({
                user_id: targetUserId,
                trigger_id: trigger.id,
                error: errorDetails.join("; "),
                send_errors: sendResult.errors,
              });
            }

            if (sendResult.sent > 0) {
              console.log(
                `✅ Successfully sent notification to user ${targetUserId.substring(0, 8)}...`,
              );
            } else {
              console.log(
                `❌ Failed to send notification to user ${targetUserId.substring(0, 8)}...`,
              );
            }
          } else {
            // Check preferences first
            const triggersToSend = await getTriggersForUser(targetUserId);
            const triggerToSend = triggersToSend.find(
              (t) => t.id === trigger.id,
            );

            if (triggerToSend) {
              // Check if user has push tokens first
              const pushTokens = await getPushTokensForUser(targetUserId);
              if (pushTokens.length === 0) {
                console.log(
                  `⚠️  No push tokens found for user ${targetUserId.substring(0, 8)}...`,
                );
                console.log(
                  `   💡 User needs to open the app to register their push token`,
                );
                results.notifications_failed++;
                results.errors.push({
                  user_id: targetUserId,
                  trigger_id: trigger.id,
                  error: "No push tokens registered. User needs to open the app.",
                });
                continue;
              }

              const sendResult = await sendNotificationsForUser(targetUserId, [
                triggerToSend,
              ]);
              results.notifications_sent += sendResult.sent;
              results.notifications_failed += sendResult.failed;

              if (sendResult.errors && sendResult.errors.length > 0) {
                // Handle both string array errors and object array errors
                const errorDetails = sendResult.errors.map((err) => {
                  if (typeof err === "string") {
                    return err;
                  }
                  return err.error || err.message || JSON.stringify(err);
                });

                results.errors.push({
                  user_id: targetUserId,
                  trigger_id: trigger.id,
                  error: errorDetails.join("; "),
                  send_errors: sendResult.errors,
                });
              }

              if (sendResult.sent > 0) {
                console.log(
                  `✅ Successfully sent notification to user ${targetUserId.substring(0, 8)}...`,
                );
              } else {
                console.log(
                  `❌ Failed to send notification to user ${targetUserId.substring(0, 8)}...`,
                );
              }
            } else {
              // Check why it was filtered
              const { data: preferences } = await supabase
                .from("notification_preferences")
                .select("*")
                .eq("user_id", targetUserId)
                .maybeSingle();

              const userPreferences = preferences || {
                proactive_enabled: true,
                max_notifications_per_day: 5,
                quiet_hours_start: null,
                quiet_hours_end: null,
              };

              const evaluation = await evaluateTrigger(
                trigger,
                userPreferences,
              );
              console.log(
                `⚠️  Trigger ${trigger.id.substring(0, 8)}... filtered: ${evaluation.reason || "Unknown reason"}`,
              );
              console.log(`   💡 Use --force flag to bypass preference checks`);
            }
          }
        } catch (sendError) {
          console.error(
            `❌ Error sending notification to user ${targetUserId.substring(0, 8)}...:`,
            sendError.message,
          );
          results.notifications_failed++;
          results.errors.push({
            user_id: targetUserId,
            trigger_id: trigger.id,
            error: sendError.message,
          });
        }
      }
    } catch (error) {
      console.error(
        `❌ Error processing user ${targetUserId.substring(0, 8)}...:`,
        error.message,
      );
      results.triggers_failed++;
      results.errors.push({
        user_id: targetUserId,
        error: error.message,
      });
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total users: ${targetUserIds.length}`);
  console.log(`Triggers created: ${results.triggers_created}`);
  console.log(`Triggers failed: ${results.triggers_failed}`);
  if (options.sendImmediately) {
    console.log(`Notifications sent: ${results.notifications_sent}`);
    console.log(`Notifications failed: ${results.notifications_failed}`);
  } else {
    console.log(
      `\nℹ️  Triggers created but not sent. Use --send flag to send immediately, or let the scheduled processor handle it.`,
    );
  }

  if (results.errors.length > 0) {
    console.log(`\n⚠️  Errors (${results.errors.length}):`);
    results.errors.slice(0, 10).forEach((err, i) => {
      const errorMsg =
        err.error ||
        (err.send_errors && Array.isArray(err.send_errors)
          ? err.send_errors.map((e) =>
              typeof e === "string" ? e : e.error || JSON.stringify(e),
            ).join("; ")
          : JSON.stringify(err.send_errors)) ||
        "Unknown error";
      console.log(
        `  ${i + 1}. User ${err.user_id?.substring(0, 8)}...: ${errorMsg}`,
      );
    });
    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more errors`);
    }
  }

  console.log("=".repeat(60) + "\n");

  // Exit with error code if there were failures
  if (results.triggers_failed > 0 || results.notifications_failed > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
