-- Users who have at least one active holding (for stock_prices sync)
-- Run in Supabase SQL Editor or: psql $DATABASE_URL -f scripts/sql-users-with-holdings.sql

SELECT DISTINCT user_id
FROM investment_holdings
WHERE is_active = true
  AND symbol IS NOT NULL
  AND symbol != ''
ORDER BY user_id;
