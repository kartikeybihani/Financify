-- Check if any RPC functions have auth.uid() checks that might cause hangs
SELECT 
  '=== ALL RPC FUNCTIONS WITH auth.uid() CHECKS ===' as section,
  p.proname as function_name,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%auth.uid()%' THEN '⚠️ HAS auth.uid() CHECK'
    ELSE '✅ NO auth.uid() check'
  END as has_auth_check,
  CASE p.prosecdef 
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type
FROM pg_proc p
WHERE p.proname IN (
  'get_net_worth',
  'get_investment_snapshot',
  'get_recent_transactions',
  'get_spend_by_category',
  'get_cashflow_monthly',
  'get_summary_min_composite',
  'get_goals_overview'
)
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY p.proname;
