-- SQL script to delete an account_id and all related data
-- Replace 'YOUR_ACCOUNT_ID_HERE' with the actual account_id to delete

-- Start transaction for safety
BEGIN;

-- 1. Delete transactions (has FK constraint to accounts)
DELETE FROM public.transactions
WHERE account_id = 'YOUR_ACCOUNT_ID_HERE';

-- 2. Delete recurring streams (has FK constraint to accounts)
DELETE FROM public.recurring_streams
WHERE account_id = 'YOUR_ACCOUNT_ID_HERE';

-- 3. Delete investment balances (has account_id field, may reference plaid accounts)
DELETE FROM public.investment_balances
WHERE account_id = 'YOUR_ACCOUNT_ID_HERE'
   OR plaid_account_id = 'YOUR_ACCOUNT_ID_HERE';

-- 4. Delete investment holdings (has account_id field, may reference plaid accounts)
DELETE FROM public.investment_holdings
WHERE account_id = 'YOUR_ACCOUNT_ID_HERE'
   OR plaid_account_id = 'YOUR_ACCOUNT_ID_HERE';

-- 5. Delete investment options (has account_id field, but FK to snaptrade_connections)
-- Note: Only delete if account_id matches, but this might be a different account_id system
-- Uncomment if needed:
-- DELETE FROM public.investment_options
-- WHERE account_id = 'YOUR_ACCOUNT_ID_HERE';

-- 6. Finally, delete the account itself
DELETE FROM public.accounts
WHERE account_id = 'YOUR_ACCOUNT_ID_HERE';

-- Commit transaction
COMMIT;

-- To rollback if something goes wrong, use:
-- ROLLBACK;
