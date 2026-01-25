-- CLEANUP: Remove test Plaid investment data
-- Replace 79952F35-B607-40D6-A32E-D81386882EB7 with your actual user_id UUID

-- ============================================
-- Delete test holdings
-- ============================================
DELETE FROM public.investment_holdings
WHERE user_id = '79952F35-B607-40D6-A32E-D81386882EB7'::uuid
  AND provider = 'plaid'
  AND item_id = '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq'
  AND plaid_account_id IN ('rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'KqZZMoZmBWHJlz7yKaZjHZb78VNpaxfVa7e5z')
  AND security_id IN ('JDdP7XPMklt5vwPmDN45t3KAoWAPmjtpaW7DP', 'NDVQrXQoqzt5v3bAe8qRt4A7mK7wvZCLEBBJk', 'eW4jmnjd6AtjxXVrjmj6SX1dNEdZp3Cy8RnRQ');

-- ============================================
-- Delete test balances
-- ============================================
DELETE FROM public.investment_balances
WHERE user_id = '79952F35-B607-40D6-A32E-D81386882EB7'::uuid
  AND provider = 'plaid'
  AND item_id = '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq'
  AND plaid_account_id IN ('rz99ex9ZQotvnjXdgQLEsR81e3ArPgulVWjGj', 'KqZZMoZmBWHJlz7yKaZjHZb78VNpaxfVa7e5z');

-- ============================================
-- Verify deletion
-- ============================================
SELECT 
  'Holdings remaining' as check_type,
  COUNT(*) as count
FROM public.investment_holdings
WHERE user_id = '79952F35-B607-40D6-A32E-D81386882EB7'::uuid
  AND provider = 'plaid'
  AND item_id = '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq'
UNION ALL
SELECT 
  'Balances remaining' as check_type,
  COUNT(*) as count
FROM public.investment_balances
WHERE user_id = '79952F35-B607-40D6-A32E-D81386882EB7'::uuid
  AND provider = 'plaid'
  AND item_id = '8Mqq5rqQ7Pcxq9MGDv3JULZ6yzZDLMCwoxGDq';
