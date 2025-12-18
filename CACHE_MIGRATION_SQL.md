# Cache Migration SQL Script

## Overview
This migration clears old global cache keys from AsyncStorage (client-side storage). Since AsyncStorage is client-side, this SQL script is for documentation purposes only. The actual cache clearing happens automatically in the app code via the `runCacheMigration()` function.

## Migration Details

**Migration Version:** v2  
**Migration Key:** `cache_migration_v2_complete`  
**Purpose:** Clear old global cache keys that don't include `user_id` to prevent data leakage between users

## Old Cache Keys to Clear

The following AsyncStorage keys will be cleared on first launch after update:

### Investment Cache
- `cached_investment_data`
- `cached_investment_data_timestamp`

### Recurring Transactions Cache
- `cached_recurring_transactions`
- `cached_recurring_transactions_timestamp`

### Account Balances Cache
- `cached_account_balances`
- `cached_account_balances_timestamp`

### Transactions Cache
- `cached_transactions`
- `cached_transactions_timestamp`

### Spending Breakdown Cache
- `cached_spending_breakdown`
- `cached_spending_breakdown_timestamp`

### Goals Cache
- `cached_goals`
- `cached_goals_timestamp`

### Legacy Hardcoded Keys (also cleared)
- `@investment_cache`
- `@recurring_cache`
- `@balances_cache`
- `@goals_cache`
- `@cash_cache`

## Implementation

The migration runs automatically on app startup via `app/_layout.tsx`:

```typescript
import { runCacheMigration } from "@/src/shared/utils/cacheMigration";

// In useEffect on app initialization:
await runCacheMigration();
```

## Verification

After migration:
1. Old global cache keys are removed
2. New user-specific cache keys are used (format: `{cache_key}_{userId}`)
3. Migration completion is tracked via `cache_migration_v2_complete` key
4. Migration only runs once per device

## Notes

- **Client-Side Only:** This migration affects AsyncStorage (React Native), not Supabase database
- **Automatic:** Migration runs automatically on first app launch after update
- **Idempotent:** Safe to run multiple times (checks completion flag)
- **Non-Breaking:** App continues to work even if migration fails

## Testing

To test migration:
1. Clear app data/cache manually
2. Launch app
3. Check logs for: `✅ [CACHE MIGRATION] Migration completed successfully`
4. Verify old cache keys are removed from AsyncStorage
5. Verify new user-specific cache keys are created when data is cached
