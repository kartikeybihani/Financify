-- Check RPC function permissions
-- Run this in Supabase SQL Editor to see current grants

SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE p.prosecdef 
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type,
  array_agg(DISTINCT r.rolname ORDER BY r.rolname) as granted_to_roles
FROM pg_proc p
LEFT JOIN pg_depend d ON d.objid = p.oid
LEFT JOIN pg_roles r ON r.oid = d.refobjid
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
AND (d.deptype = 'a' OR d.deptype IS NULL) -- 'a' = ACL (grant)
GROUP BY p.proname, p.oid, p.prosecdef
ORDER BY p.proname;

-- Also check if service_role can execute
SELECT 
  p.proname as function_name,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
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
