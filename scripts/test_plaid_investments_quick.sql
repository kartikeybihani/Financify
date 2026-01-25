-- QUICK TEST: Add sample Plaid investment data
-- Replace 79952F35-B607-40D6-A32E-D81386882EB7 with your actual user_id UUID (appears 3 times)

-- ============================================
-- Holdings for 401k Account
-- ============================================
-- Delete existing holdings first (to avoid conflicts)
DELETE FROM public.investment_holdings
WHERE user_id = '79952F35-B607-40D6-A32E-D81386882EB7'::uuid
  AND provider = 'plaid'
  AND item_id = '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq'
  AND plaid_account_id = 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj'
  AND security_id IN ('JDdP7XPMklt5vwPmDN45t3KAoWAPmjtpaW7DP', 'NDVQrXQoqzt5v3bAe8qRt4A7mK7wvZCLEBBJk', 'eW4jmnjd6AtjxXVrjmj6SX1dNEdZp3Cy8RnRQ');

-- Insert holdings (account_id = plaid_account_id for Plaid records)
INSERT INTO public.investment_holdings (
  user_id, provider, item_id, plaid_account_id, account_id, security_id, symbol, description,
  currency_code, exchange_code, security_type, sector, industry,
  units, price, market_value, average_purchase_price, total_cost_basis, unrealized_pl,
  day_change, day_change_percent, total_percent_change, is_active,
  snaptrade_user_id, symbol_id
) VALUES
-- MIPTX - Matthews Pacific Tiger Fund
('79952F35-B607-40D6-A32E-D81386882EB7'::uuid, 'plaid', '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq', 
 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'JDdP7XPMklt5vwPmDN45t3KAoWAPmjtpaW7DP',
 'MIPTX', 'Matthews Pacific Tiger Fund Insti Class', 'USD', 'XNAS', 'mutual fund',
 'Miscellaneous', 'Investment Trusts or Mutual Funds',
 23.567, 27.00, 636.31, 25.50, 600.46, 35.85, 5.20, 0.82, 5.97, true, NULL, NULL),
-- DBLTX - DoubleLine Total Return Bond Fund  
('79952F35-B607-40D6-A32E-D81386882EB7'::uuid, 'plaid', '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq',
 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'NDVQrXQoqzt5v3bAe8qRt4A7mK7wvZCLEBBJk',
 'DBLTX', 'DoubleLine Total Return Bond Fund', 'USD', 'XNAS', 'mutual fund',
 NULL, NULL,
 2.0, 10.42, 20.84, 10.20, 20.40, 0.44, 0.10, 0.48, 2.16, true, NULL, NULL),
-- SBSI - Southside Bancshares Inc.
('79952F35-B607-40D6-A32E-D81386882EB7'::uuid, 'plaid', '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq',
 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'eW4jmnjd6AtjxXVrjmj6SX1dNEdZp3Cy8RnRQ',
 'SBSI', 'Southside Bancshares Inc.', 'USD', 'XNAS', 'equity',
 'Finance', 'Regional Banks',
 100.0, 34.73, 3473.00, 32.00, 3200.00, 273.00, 15.50, 0.45, 8.53, true, NULL, NULL);

-- ============================================
-- Balances
-- ============================================
-- Delete existing balances first (to avoid conflicts)
DELETE FROM public.investment_balances
WHERE user_id = '79952F35-B607-40D6-A32E-D81386882EB7'::uuid
  AND provider = 'plaid'
  AND item_id = '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq'
  AND plaid_account_id IN ('rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'KqZZMoZmBWHJlz7yKaZjHZb78VNpaxfVa7e5z');

-- Insert balances (account_id = plaid_account_id for Plaid records)
INSERT INTO public.investment_balances (
  user_id, provider, item_id, plaid_account_id, account_id, currency_code,
  cash, buying_power, total_value, previous_total_value,
  day_change, day_change_percent, total_change, total_change_percent, is_current,
  snaptrade_user_id
) VALUES
-- 401k Account
('79952F35-B607-40D6-A32E-D81386882EB7'::uuid, 'plaid', '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq',
 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'USD',
 0.00, 0.00, 23631.98, 23600.00, 31.98, 0.14, 309.29, 1.31, true, NULL),
-- IRA Account  
('79952F35-B607-40D6-A32E-D81386882EB7'::uuid, 'plaid', '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq',
 'KqZZMoZmBWHJlz7yKaZjHZb78VNpaxfVa7e5z', 'KqZZMoZmBWHJlz7yKaZjHZb78VNpaxfVa7e5z', 'USD',
 320.76, 0.00, 320.76, 320.00, 0.76, 0.24, 0.00, 0.00, true, NULL);

-- ============================================
-- Verify: Check totals (should include both Plaid + SnapTrade)
-- ============================================
SELECT 
  provider,
  COUNT(*) as account_count,
  SUM(total_value) as total_portfolio_value,
  SUM(cash) as total_cash,
  SUM(day_change) as total_day_change,
  SUM(total_change) as total_unrealized_pl
FROM public.investment_balances
WHERE user_id = '79952F35-B607-40D6-A32E-D81386882EB7'::uuid AND is_current = true
GROUP BY provider;
