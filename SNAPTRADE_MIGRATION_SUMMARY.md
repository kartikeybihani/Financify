# SnapTrade Migration: From Vault to Direct Database Storage

## Overview
This migration moves SnapTrade user secrets from the secure vault to direct storage in the `snaptrade_connections` table for easier debugging and testing.

## Database Changes Required

### 1. Run the SQL Migration
Execute the following SQL in your Supabase database:

```sql
-- Add user_secret column to store the SnapTrade user secret directly
ALTER TABLE public.snaptrade_connections 
ADD COLUMN user_secret text;

-- Remove the user_secret_id column since we're not using vault anymore
ALTER TABLE public.snaptrade_connections 
DROP COLUMN IF EXISTS user_secret_id;

-- Add index for performance on snaptrade_user_id lookups
CREATE INDEX IF NOT EXISTS idx_snaptrade_connections_user_id 
ON public.snaptrade_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_snaptrade_connections_snaptrade_user_id 
ON public.snaptrade_connections(snaptrade_user_id);

-- Add unique constraint to prevent duplicate connections
ALTER TABLE public.snaptrade_connections 
ADD CONSTRAINT unique_snaptrade_user_account 
UNIQUE (user_id, snaptrade_user_id, account_id);
```

## Code Changes Made

### 1. Updated SnapTrade Utils (`app/_utils/snaptrade.ts`)
- ✅ Renamed `getSnaptradeUserSecretFromVault` → `getSnaptradeUserSecretFromDB`
- ✅ Updated function to read from `snaptrade_connections` table instead of vault
- ✅ Modified `storeSnaptradeCredentials` to store directly in database
- ✅ Updated all function calls to use new database approach

### 2. Updated API Endpoint (`api/plaid.js`)
- ✅ Modified `handleSnapTradeStoreCredentials` to store directly in database
- ✅ Removed dependency on Supabase Edge function
- ✅ Added proper error handling for database operations

### 3. Updated Table Structure
- ✅ Created migration SQL to add `user_secret` column
- ✅ Created migration SQL to remove `user_secret_id` column
- ✅ Added performance indexes and unique constraints

## Files Modified
1. `app/_utils/snaptrade.ts` - Core SnapTrade utility functions
2. `api/plaid.js` - API endpoint for storing credentials
3. `snaptrade_table_migration.sql` - Database migration script

## Files NOT Modified (Disregarded as requested)
- `supabase/functions/store-snaptrade-credentials/index.ts` - Edge function (kept but not used)
- `snaptrade_vault_functions.sql` - Vault functions (kept but not used)

## Testing Steps

### 1. Apply Database Migration
Run the SQL migration script in your Supabase database.

### 2. Test SnapTrade Connection
1. Open the app and go to account connection
2. Select "Fidelity" from the institution list
3. Complete the SnapTrade connection flow
4. Verify credentials are stored in `snaptrade_connections` table with `user_secret` populated

### 3. Test Data Retrieval
1. Check that investment data loads correctly
2. Verify holdings, options, and balances are fetched
3. Test the sync functionality

### 4. Verify Database Storage
Check the `snaptrade_connections` table:
```sql
SELECT user_id, snaptrade_user_id, account_id, brokerage_name, 
       CASE WHEN user_secret IS NOT NULL THEN 'Present' ELSE 'Missing' END as user_secret_status,
       is_active, created_at
FROM snaptrade_connections;
```

## Security Considerations
⚠️ **Important**: The `user_secret` is now stored in plain text in the database. This is acceptable for testing but consider encryption for production use.

## Rollback Plan
If you need to rollback:
1. Revert the code changes
2. Run: `ALTER TABLE snaptrade_connections DROP COLUMN user_secret;`
3. Run: `ALTER TABLE snaptrade_connections ADD COLUMN user_secret_id uuid;`
4. Re-enable vault functions

## Next Steps
1. Apply the database migration
2. Test the connection flow
3. Verify data storage and retrieval
4. Monitor for any issues in the logs
