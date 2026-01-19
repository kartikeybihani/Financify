# Testing Pattern Detection

## How to Trigger Transaction Sync

### Option 1: Manual Sync via API (Recommended for Testing)

```bash
# Replace YOUR_USER_ID and YOUR_ITEM_ID
curl -X POST https://financify-rose.vercel.app/api/transactions_sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "item_id": "YOUR_ITEM_ID",
    "user_id": "YOUR_USER_ID"
  }'
```

### Option 2: From App UI
1. Open your app
2. Go to Settings → Accounts
3. Tap "Sync Transactions" or "Refresh" button
4. This triggers the sync endpoint

### Option 3: Supabase Edge Function
If you have the sync-transactions edge function set up:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/sync-transactions \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"item_id": "YOUR_ITEM_ID"}'
```

## Verify Pattern Detection

### 1. Check Notification Triggers Table
```sql
-- View all pending triggers
SELECT 
  id,
  trigger_type,
  trigger_metadata,
  priority,
  detected_at,
  status
FROM notification_triggers
WHERE user_id = 'YOUR_USER_ID'
ORDER BY detected_at DESC
LIMIT 10;
```

### 2. Check Logs
Pattern detection logs to console:
- `✅ [PATTERN_DETECTION] Created X triggers for user...`
- `[PATTERN_DETECTION] Error...` (if errors)

### 3. Test Specific Patterns

**Money Received:**
- Add a positive transaction > $50
- Should create trigger with type `paycheck` or `money_received`

**Spending Spike:**
- Spend 2x your average daily spending in 3 days
- Should create trigger with type `spending_spike`

**Spending Drought:**
- Don't spend for 4 days
- Should create trigger with type `spending_drought`

**LLM Patterns:**
- Runs once per day automatically
- Analyzes last month's transactions
- Creates `custom` type triggers with creative insights

## Debugging

### Check if Pattern Detection Ran
```sql
SELECT COUNT(*) 
FROM notification_triggers 
WHERE user_id = 'YOUR_USER_ID' 
  AND detected_at > NOW() - INTERVAL '1 hour';
```

### View Trigger Metadata
```sql
SELECT 
  trigger_type,
  trigger_metadata->>'amount' as amount,
  trigger_metadata->>'pattern_description' as pattern,
  priority,
  detected_at
FROM notification_triggers
WHERE user_id = 'YOUR_USER_ID'
  AND status = 'pending'
ORDER BY priority DESC, detected_at DESC;
```

### Common Issues

1. **No triggers created:**
   - Check user has transactions in last 30 days
   - Verify OPENROUTER_API_KEY is set (for LLM detection)
   - Check console logs for errors

2. **Triggers created but not sending:**
   - Triggers are `pending` - need decision engine to process them
   - Decision engine not built yet (next step)

3. **Too many triggers:**
   - Cooldown periods prevent spam
   - Check `cooldown_until` field

## Next Steps

After verifying pattern detection works:
1. Build decision engine (evaluates which triggers to send)
2. Build message generator (creates personalized messages)
3. Extend notification service (sends notifications)

