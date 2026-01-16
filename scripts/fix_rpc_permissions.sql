-- Fix RPC function permissions for service_role
-- This grants EXECUTE permission to service_role for all critical RPC functions
-- Run this in Supabase SQL Editor

-- CRITICAL: Grant service_role execute permission on all critical RPC functions
-- These functions are called from API routes using service_role key
GRANT EXECUTE ON FUNCTION public.get_net_worth(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_investment_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_transactions(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_spend_by_category(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cashflow_monthly(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_summary_min_composite(uuid, integer, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_goals_overview(uuid, integer) TO service_role;

-- Also ensure authenticated can still execute (for client-side calls)
GRANT EXECUTE ON FUNCTION public.get_net_worth(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_investment_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_transactions(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_spend_by_category(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashflow_monthly(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_summary_min_composite(uuid, integer, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_goals_overview(uuid, integer) TO authenticated;

-- Verify grants
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
