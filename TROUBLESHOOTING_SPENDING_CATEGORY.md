# Troubleshooting: Spending Category Changes Not Showing

## Problem
After deploying the changes, Finny is still showing the old format:
```
SPENDING BY CATEGORY (last 30 days):
```

Instead of the new format:
```
SPENDING BY CATEGORY - CURRENT MONTH (January 2026):
SPENDING BY CATEGORY - LAST COMPLETE MONTH (December 2025):
```

## Root Cause
The cache contains old data from before the SQL migration was run. The cache TTL is **50 minutes**, so old cached data persists.

## Solution Steps

### Step 1: Verify SQL Migration Was Run ✅

**Check if the migration was applied:**

Run this SQL query in your Supabase SQL editor:

```sql
-- Check if the function has the new fields
SELECT 
  proname,
  prosrc
FROM pg_proc 
WHERE proname = 'get_summary_min_composite'
AND prosrc LIKE '%spend_by_category_current_month%';
```

**If it returns a row**: Migration is applied ✅  
**If it returns no rows**: Migration needs to be run ❌

**To run the migration:**

```bash
# Option 1: Via Supabase CLI
supabase migration up

# Option 2: Copy and paste the SQL directly in Supabase SQL Editor
# File: supabase/migrations/add_monthly_spending_breakdown.sql
```

### Step 2: Clear the Cache 🔄

After running the migration, you need to clear the cached data. You have 3 options:

#### Option A: Clear Cache via API (Recommended)

Make a POST request to clear the cache:

```bash
# Replace YOUR_USER_ID with actual user ID
curl -X POST https://your-api-url/api/store_accounts \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "clear_cache",
    "user_id": "YOUR_USER_ID"
  }'
```

Or use the Finny API endpoint if available:

```bash
curl -X POST https://your-api-url/api/finny \
  -H "Content-Type: application/json" \
  -d '{
    "action": "invalidate_cache",
    "user_id": "YOUR_USER_ID"
  }'
```

#### Option B: Clear Cache Directly in Database

Run this SQL to delete cached entries:

```sql
-- Clear summary_min cache for a specific user
DELETE FROM context_cache 
WHERE user_id = 'YOUR_USER_ID' 
AND cache_key LIKE 'summary_min%';

-- Or clear all summary_min cache (all users)
DELETE FROM context_cache 
WHERE cache_key LIKE 'summary_min%';
```

#### Option C: Wait for Cache Expiration

The cache TTL is 50 minutes. If you can wait, the cache will automatically refresh with new data after expiration.

### Step 3: Verify It's Working ✅

After clearing cache, test Finny again. Check the logs for:

```
📊 [SUMMARY_DATA] Raw composite data from RPC: {
  ...
  spend_categories_current_month_count: X,  // Should be > 0
  spend_categories_last_month_count: Y,     // Should be > 0
  has_new_monthly_fields: true              // Should be true
}
```

**If you see this warning:**
```
⚠️ [SUMMARY_DATA] New monthly spending fields are missing!
```

It means:
1. SQL migration wasn't run, OR
2. Cache still has old data, OR  
3. Database function doesn't have the new fields

### Step 4: Force Fresh Data Fetch

If cache is still showing old data, you can force a fresh fetch by:

1. **Wait for cache expiration** (50 minutes max)
2. **Clear cache** (see Step 2)
3. **Make a new request** - Finny will fetch fresh data from the database

## Quick Diagnostic Commands

### Check if migration was applied:
```sql
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'get_summary_min_composite'
AND prosrc LIKE '%spend_by_category_current_month%';
```

### Check cache entries:
```sql
SELECT cache_key, created_at, expires_at, 
       expires_at > NOW() as is_valid
FROM context_cache 
WHERE cache_key LIKE 'summary_min%'
ORDER BY created_at DESC
LIMIT 5;
```

### Test the function directly:
```sql
-- Replace with your actual user_id
SELECT 
  jsonb_pretty(
    get_summary_min_composite(
      'YOUR_USER_ID'::uuid,
      5,
      NULL,
      NULL
    )
  ) -> 'spend_by_category_current_month';
```

This should return an array of spending categories for the current month.

## Expected Behavior After Fix

Once everything is working, you should see in the logs:

```
📊 [SUMMARY_DATA] Raw composite data from RPC: {
  ...
  spend_categories_current_month_count: 10,
  spend_categories_last_month_count: 8,
  has_new_monthly_fields: true
}
```

And Finny's prompt will show:

```
SPENDING BY CATEGORY - CURRENT MONTH (January 2026):
- Shopping: $300.00
- Housing: $150.00
...

SPENDING BY CATEGORY - LAST COMPLETE MONTH (December 2025):
- Shopping: $450.00
- Housing: $200.00
...
```

## Still Not Working?

1. **Double-check SQL migration**: Make sure the function was updated
2. **Check database permissions**: Ensure the function has proper grants
3. **Verify JavaScript code**: Make sure `api/finny.js` has the latest changes
4. **Check logs**: Look for the warning message about missing fields
5. **Test function directly**: Use the SQL test query above
