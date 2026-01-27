# Manual Notification Trigger Guide

This guide explains how to manually trigger notifications for all users or a specific user in production using the CLI script.

## CLI Script

**Location**: `scripts/manual-notification-trigger.js`

## Usage

### Trigger notifications for ALL users

```bash
node scripts/manual-notification-trigger.js \
  --type custom \
  --message "Check out your latest financial insights!" \
  --send
```

### Trigger notifications for a SPECIFIC user

```bash
node scripts/manual-notification-trigger.js \
  --user-id user-uuid-here \
  --type custom \
  --message "Your spending summary is ready!" \
  --send
```

### Create triggers without sending immediately

If you want to create triggers but send them later (via the scheduled processor):

```bash
node scripts/manual-notification-trigger.js \
  --type custom \
  --message "Check your finances!"
```

Then send them later by calling the scheduled processor or using the `--send` flag on a separate run.

## Command Line Options

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--user-id` | `-u` | No | Specific user ID. If omitted, creates triggers for all users |
| `--type` | `-t` | Yes | One of: `paycheck`, `money_received`, `spending_spike`, `spending_drought`, `weekly_summary`, `goal_milestone`, `custom` |
| `--message` | `-m` | Yes* | Notification message (required for `custom` type) |
| `--metadata` | - | No | Full metadata JSON object (overrides `--message`) |
| `--priority` | `-p` | No | Priority (1-10, default: 5) |
| `--send` | `-s` | No | Send notifications immediately after creating triggers (default: false) |
| `--help` | `-h` | No | Show help message |

*Required for `custom` trigger type

## Trigger Types and Metadata Examples

### Custom Notification
```bash
node scripts/manual-notification-trigger.js \
  --type custom \
  --message "Your weekly financial summary is ready!" \
  --send
```

### Paycheck Notification
```bash
node scripts/manual-notification-trigger.js \
  --type paycheck \
  --metadata '{"amount": 5000, "transaction_id": "txn-123"}' \
  --send
```

### Money Received
```bash
node scripts/manual-notification-trigger.js \
  --type money_received \
  --metadata '{"amount": 1000, "merchant_name": "John Doe", "transaction_id": "txn-456"}' \
  --send
```

### Spending Spike
```bash
node scripts/manual-notification-trigger.js \
  --type spending_spike \
  --metadata '{"recent_total": 1500, "spike_ratio": 1.5}' \
  --send
```

### Spending Drought (Saving Streak)
```bash
node scripts/manual-notification-trigger.js \
  --type spending_drought \
  --metadata '{"days_without_spending": 5}' \
  --send
```

## Output Format

The script prints a summary to the console:

```
📊 SUMMARY
============================================================
Total users: 150
Triggers created: 150
Triggers failed: 0
Notifications sent: 145
Notifications failed: 5
============================================================
```

If there are errors, they will be listed at the end.

## Important Notes

1. **User Preferences**: Notifications respect user preferences (quiet hours, daily limits, etc.). If a user has disabled notifications or hit their daily limit, the trigger will be created but may not be sent immediately.

2. **Push Tokens**: Users must have active push tokens registered. Users without push tokens will have triggers created but notifications will fail to send.

3. **Rate Limiting**: The Expo Push API has rate limits. If sending to many users, consider:
   - Creating triggers with `sendImmediately: false` and letting the scheduled processor handle sending
   - Batching users in smaller groups

4. **Production Safety**: Always test with a single user first before sending to all users.

## Quick Examples

### Send a test notification to yourself
```bash
# Replace YOUR_USER_ID with your actual user ID
node scripts/manual-notification-trigger.js \
  --user-id YOUR_USER_ID \
  --type custom \
  --message "Test notification" \
  --send
```

### Send weekly summary to all users
```bash
node scripts/manual-notification-trigger.js \
  --type weekly_summary \
  --message "Your weekly financial summary is ready! Check it out in the app." \
  --send
```

### Show help
```bash
node scripts/manual-notification-trigger.js --help
```
