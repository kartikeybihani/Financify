-- Check the actual function definition to see what's happening
SELECT 
  '=== FUNCTION DEFINITION ===' as section,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'get_summary_min_composite'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;

-- Also check if other functions being called have auth.uid() checks
SELECT 
  '=== CALLED FUNCTIONS WITH auth.uid() ===' as section,
  p.proname as function_name,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%auth.uid()%' THEN '✅ Has auth.uid() check'
    ELSE '❌ No auth.uid() check'
  END as has_auth_check
FROM pg_proc p
WHERE p.proname IN (
  'get_net_worth',
  'get_investment_snapshot',
  'get_recent_transactions',
  'get_spend_by_category',
  'get_cashflow_monthly'
)
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY p.proname;
