-- ============================================
-- FINAL VERIFICATION CHECK
-- Run this to confirm everything is ready for testing
-- ============================================

-- ============================================
-- 1. Verify RLS is enabled on all critical tables
-- ============================================
SELECT 
  '✅ RLS STATUS CHECK' as check_type,
  tablename,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED - FIX NEEDED'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'accounts',
    'transactions',
    'goals',
    'budget_periods',
    'budget_entries',
    'categories',
    'cash_entries',
    'recurring_streams',
    'user_items',
    'investment_holdings',
    'investment_balances',
    'investment_options',
    'category_rules',
    'category_groupings'
  )
ORDER BY 
  CASE WHEN rowsecurity THEN 0 ELSE 1 END,
  tablename;

-- ============================================
-- 2. Verify RPC functions have authenticated grant
-- ============================================
SELECT 
  '✅ RPC PERMISSIONS CHECK' as check_type,
  p.proname as function_name,
  CASE 
    WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN '✅ HAS authenticated GRANT'
    ELSE '❌ MISSING authenticated GRANT - FIX NEEDED'
  END as authenticated_status,
  CASE 
    WHEN has_function_privilege('service_role', p.oid, 'EXECUTE') THEN '⚠️ HAS service_role GRANT (should remove)'
    ELSE '✅ NO service_role GRANT'
  END as service_role_status
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

-- ============================================
-- 3. Verify get_summary_min_composite is SECURITY INVOKER
-- ============================================
SELECT 
  '✅ FUNCTION SECURITY CHECK' as check_type,
  p.proname as function_name,
  CASE p.prosecdef 
    WHEN true THEN '❌ SECURITY DEFINER (bypasses RLS) - FIX NEEDED'
    ELSE '✅ SECURITY INVOKER (respects RLS)'
  END as security_status,
  CASE 
    WHEN pg_get_functiondef(p.oid) LIKE '%auth.uid()%' THEN '✅ Has auth.uid() check'
    ELSE '⚠️ Missing auth.uid() check'
  END as has_auth_check
FROM pg_proc p
WHERE p.proname = 'get_summary_min_composite'
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================
-- 4. Count policies per table (should be 4 for most tables)
-- ============================================
SELECT 
  '✅ POLICY COUNT CHECK' as check_type,
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) >= 4 THEN '✅ SUFFICIENT'
    WHEN COUNT(*) = 0 THEN '❌ NO POLICIES - FIX NEEDED'
    ELSE '⚠️ MIGHT NEED MORE'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'accounts',
    'transactions',
    'goals',
    'budget_periods',
    'budget_entries',
    'categories',
    'cash_entries',
    'recurring_streams',
    'user_items',
    'investment_holdings',
    'investment_balances',
    'investment_options',
    'category_rules',
    'category_groupings'
  )
GROUP BY tablename
ORDER BY 
  CASE WHEN COUNT(*) >= 4 THEN 0 WHEN COUNT(*) = 0 THEN 2 ELSE 1 END,
  tablename;

-- ============================================
-- 5. FINAL SUMMARY - Ready to test?
-- ============================================
SELECT 
  '🎯 FINAL SUMMARY' as check_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('accounts', 'transactions', 'goals', 'category_rules', 'category_groupings')
      AND rowsecurity = false
    ) THEN '✅ All critical tables have RLS enabled'
    ELSE '❌ Some tables missing RLS - FIX NEEDED'
  END as rls_status,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname IN ('get_net_worth', 'get_summary_min_composite')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) THEN '✅ All RPC functions have authenticated grant'
    ELSE '❌ Some functions missing authenticated grant - FIX NEEDED'
  END as rpc_permissions_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname = 'get_summary_min_composite'
      AND p.prosecdef = false
    ) THEN '✅ get_summary_min_composite is SECURITY INVOKER'
    ELSE '❌ get_summary_min_composite is SECURITY DEFINER - FIX NEEDED'
  END as function_security_status,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('accounts', 'transactions', 'goals', 'category_rules', 'category_groupings')
      AND rowsecurity = false
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname IN ('get_net_worth', 'get_summary_min_composite')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
    AND EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname = 'get_summary_min_composite'
      AND p.prosecdef = false
    )
    THEN '✅ READY TO TEST!'
    ELSE '⚠️ FIXES NEEDED - See details above'
  END as ready_status;
