-- ============================================
-- COMPREHENSIVE RLS & RPC FUNCTION DIAGNOSTIC
-- Run this to verify everything is set up correctly
-- ============================================

-- ============================================
-- PART 1: Check RLS Status on All Tables
-- ============================================
SELECT 
  '=== RLS STATUS ON TABLES ===' as section,
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status
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
    'investment_options'
  )
ORDER BY tablename;

-- ============================================
-- PART 2: List All RLS Policies
-- ============================================
SELECT 
  '=== RLS POLICIES ===' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
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
    'investment_options'
  )
ORDER BY tablename, policyname;

-- ============================================
-- PART 3: Check RPC Function Existence & Signatures
-- ============================================
SELECT 
  '=== RPC FUNCTIONS EXISTENCE ===' as section,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE p.prosecdef 
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type,
  CASE 
    WHEN p.proname IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
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
-- PART 4: Check RPC Function Permissions (Grants)
-- ============================================
SELECT 
  '=== RPC FUNCTION PERMISSIONS ===' as section,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  CASE 
    WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN '✅'
    ELSE '❌'
  END as authenticated_status,
  CASE 
    WHEN has_function_privilege('service_role', p.oid, 'EXECUTE') THEN '⚠️ (should be false)'
    ELSE '✅'
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
-- PART 5: Check get_summary_min_composite Security Check
-- ============================================
SELECT 
  '=== get_summary_min_composite SECURITY CHECK ===' as section,
  p.proname as function_name,
  CASE p.prosecdef 
    WHEN true THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_type,
  CASE 
    WHEN p.prosecdef = false THEN '✅ SECURITY INVOKER (respects RLS)'
    ELSE '⚠️ SECURITY DEFINER (bypasses RLS - should be INVOKER)'
  END as status,
  pg_get_functiondef(p.oid) LIKE '%auth.uid()%' as has_auth_uid_check,
  pg_get_functiondef(p.oid) LIKE '%service_role%' as has_service_role_check
FROM pg_proc p
WHERE p.proname = 'get_summary_min_composite'
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================
-- PART 6: Summary - What Needs Fixing
-- ============================================
SELECT 
  '=== SUMMARY & RECOMMENDATIONS ===' as section,
  'Check Results Above' as instruction,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('accounts', 'transactions', 'goals')
      AND rowsecurity = false
    ) THEN '⚠️ Some tables have RLS DISABLED'
    ELSE '✅ All critical tables have RLS enabled'
  END as rls_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname = 'get_summary_min_composite'
      AND p.prosecdef = true
    ) THEN '⚠️ get_summary_min_composite is SECURITY DEFINER (should be INVOKER)'
    ELSE '✅ get_summary_min_composite is SECURITY INVOKER'
  END as function_security_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname IN ('get_net_worth', 'get_summary_min_composite')
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) THEN '❌ Some functions missing authenticated grant'
    ELSE '✅ All functions have authenticated grant'
  END as permissions_status;

-- ============================================
-- PART 7: Detailed Function Definitions (for get_summary_min_composite)
-- ============================================
SELECT 
  '=== get_summary_min_composite FULL DEFINITION ===' as section,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'get_summary_min_composite'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LIMIT 1;

-- ============================================
-- PART 8: Count Policies Per Table
-- ============================================
SELECT 
  '=== POLICY COUNT PER TABLE ===' as section,
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ NO POLICIES'
    WHEN COUNT(*) = 1 THEN '⚠️ ONLY 1 POLICY (might need more)'
    ELSE '✅ HAS POLICIES'
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
    'investment_options'
  )
GROUP BY tablename
ORDER BY policy_count, tablename;
