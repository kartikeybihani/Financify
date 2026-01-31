-- One-time backfill script: Create investment_balances rows from SnapTrade API data
-- For user: 8f48f00d-5266-417a-a9d3-b13f38596e40
-- Accounts: Schwab (ddd57000-dcdc-4fb0-a7b5-0ca5fcfbe5fe) and Fidelity (1f5c8838-6d33-433f-8cda-013cd5f266f7)

-- Account 1: Schwab PCRA Trust
INSERT INTO investment_balances (
  user_id,
  snaptrade_user_id,
  account_id,
  currency_code,
  cash,
  buying_power,
  total_value,
  total_change,
  total_change_percent,
  day_change,
  day_change_percent,
  previous_total_value,
  is_current,
  provider,
  last_updated,
  created_at
)
SELECT 
  '8f48f00d-5266-417a-a9d3-b13f38596e40',
  'financify-8f48f00d-5266-417a-a9d3-b13f38596e40-1769807033117-rvquoi',
  'ddd57000-dcdc-4fb0-a7b5-0ca5fcfbe5fe',
  'USD',
  40818.97,  -- From balances[0].cash
  0,  -- From balances[0].buying_power
  45687.95,  -- From account.balance.total.amount
  COALESCE(SUM(h.unrealized_pl), 0),  -- Total unrealized P&L from holdings
  CASE 
    WHEN 45687.95 > 0 
    THEN (COALESCE(SUM(h.unrealized_pl), 0) / 45687.95) * 100
    ELSE 0
  END,  -- total_change_percent
  0,  -- day_change (no previous data)
  0,  -- day_change_percent (no previous data)
  45687.95,  -- previous_total_value = total_value (baseline for future day_change)
  true,
  'snaptrade',
  NOW(),
  NOW()
FROM investment_holdings h
WHERE h.user_id = '8f48f00d-5266-417a-a9d3-b13f38596e40'
  AND h.snaptrade_user_id = 'financify-8f48f00d-5266-417a-a9d3-b13f38596e40-1769807033117-rvquoi'
  AND h.account_id = 'ddd57000-dcdc-4fb0-a7b5-0ca5fcfbe5fe'
  AND h.is_active = true
  -- Only insert if row doesn't exist
  AND NOT EXISTS (
    SELECT 1 
    FROM investment_balances ib
    WHERE ib.user_id = '8f48f00d-5266-417a-a9d3-b13f38596e40'
      AND ib.snaptrade_user_id = 'financify-8f48f00d-5266-417a-a9d3-b13f38596e40-1769807033117-rvquoi'
      AND ib.account_id = 'ddd57000-dcdc-4fb0-a7b5-0ca5fcfbe5fe'
      AND ib.currency_code = 'USD'
      AND ib.provider = 'snaptrade'
      AND ib.is_current = true
  );

-- Account 2: Fidelity Individual - TOD
INSERT INTO investment_balances (
  user_id,
  snaptrade_user_id,
  account_id,
  currency_code,
  cash,
  buying_power,
  total_value,
  total_change,
  total_change_percent,
  day_change,
  day_change_percent,
  previous_total_value,
  is_current,
  provider,
  last_updated,
  created_at
)
SELECT 
  '8f48f00d-5266-417a-a9d3-b13f38596e40',
  'financify-8f48f00d-5266-417a-a9d3-b13f38596e40-1769807513591-8i9n2x',
  '1f5c8838-6d33-433f-8cda-013cd5f266f7',
  'USD',
  14103.67,  -- From balances[0].cash
  15498.9,  -- From balances[0].buying_power
  81081.92,  -- From account.balance.total.amount (NOTE: total_value.value shows 93790.37, but account.balance.total.amount is 81081.92 - using account.balance.total.amount as source of truth)
  COALESCE(SUM(h.unrealized_pl), 0),  -- Total unrealized P&L from holdings
  CASE 
    WHEN 81081.92 > 0 
    THEN (COALESCE(SUM(h.unrealized_pl), 0) / 81081.92) * 100
    ELSE 0
  END,  -- total_change_percent
  0,  -- day_change (no previous data)
  0,  -- day_change_percent (no previous data)
  81081.92,  -- previous_total_value = total_value (baseline for future day_change)
  true,
  'snaptrade',
  NOW(),
  NOW()
FROM investment_holdings h
WHERE h.user_id = '8f48f00d-5266-417a-a9d3-b13f38596e40'
  AND h.snaptrade_user_id = 'financify-8f48f00d-5266-417a-a9d3-b13f38596e40-1769807513591-8i9n2x'
  AND h.account_id = '1f5c8838-6d33-433f-8cda-013cd5f266f7'
  AND h.is_active = true
  -- Only insert if row doesn't exist
  AND NOT EXISTS (
    SELECT 1 
    FROM investment_balances ib
    WHERE ib.user_id = '8f48f00d-5266-417a-a9d3-b13f38596e40'
      AND ib.snaptrade_user_id = 'financify-8f48f00d-5266-417a-a9d3-b13f38596e40-1769807513591-8i9n2x'
      AND ib.account_id = '1f5c8838-6d33-433f-8cda-013cd5f266f7'
      AND ib.currency_code = 'USD'
      AND ib.provider = 'snaptrade'
      AND ib.is_current = true
  );

-- Verify the results
SELECT 
  ib.user_id,
  ib.snaptrade_user_id,
  ib.account_id,
  ib.currency_code,
  ib.cash,
  ib.buying_power,
  ib.total_value,
  ib.total_change,
  ib.total_change_percent,
  ib.day_change,
  ib.day_change_percent,
  ib.previous_total_value,
  ib.provider,
  ib.last_updated
FROM investment_balances ib
WHERE ib.user_id = '8f48f00d-5266-417a-a9d3-b13f38596e40'
ORDER BY ib.account_id, ib.currency_code;
