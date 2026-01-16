-- FIX RPC Functions for Authenticated Role Only (No Service Role)
-- This removes service_role and uses only authenticated role with RLS
-- Run this AFTER running rls_policies.sql

-- ============================================
-- STEP 1: Grant authenticated execute on all critical RPC functions
-- ============================================
GRANT EXECUTE ON FUNCTION public.get_net_worth(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_investment_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_transactions(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_spend_by_category(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashflow_monthly(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_summary_min_composite(uuid, integer, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_goals_overview(uuid, integer) TO authenticated;

-- ============================================
-- STEP 2: Fix get_summary_min_composite to use authenticated role only
-- Remove service_role logic, enforce user_id matches authenticated user
-- ============================================
CREATE OR REPLACE FUNCTION public.get_summary_min_composite(
  p_user_id uuid,
  p_limit integer DEFAULT 5,
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- Changed from SECURITY DEFINER to SECURITY INVOKER to respect RLS
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_net_worth jsonb;
  v_recent_transactions jsonb;
  v_spend_by_category jsonb;
  v_default_start date;
  v_default_end date;

  -- Budget
  v_budget_period_id uuid;
  v_budget_currency_code text;
  v_budget_period_start date;
  v_budget_period_end date;
  v_budget_status text;
  v_budget_total numeric;
  v_budget_categories jsonb;
  v_budget jsonb;
BEGIN
  -- SECURITY: Enforce that authenticated user can only access their own data
  -- RLS policies will also enforce this at the table level
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', MESSAGE = 'Access denied: user_id mismatch';
  END IF;

  -- Set default date range to last 30 days if not provided
  IF p_start IS NULL OR p_end IS NULL THEN
    v_default_end := CURRENT_DATE;
    v_default_start := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_default_start := p_start;
    v_default_end := p_end;
  END IF;

  -- Get net worth data (RLS will enforce user_id check)
  SELECT jsonb_build_object(
    'liquid_assets', liquid_assets,
    'investments_total', investments_total,
    'total_liabilities', total_liabilities,
    'net_worth', net_worth,
    'bank_accounts', bank_accounts,
    'bank_accounts_count', jsonb_array_length(bank_accounts)
  )
  INTO v_net_worth
  FROM get_net_worth(p_user_id)
  LIMIT 1;

  -- Get recent transactions (RLS will enforce user_id check)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', date,
      'amount', amount,
      'merchant', merchant,
      'category', category,
      'name', name
    )
  ), '[]'::jsonb)
  INTO v_recent_transactions
  FROM get_recent_transactions(p_user_id, p_limit);

  -- Get spend by category (RLS will enforce user_id check)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category', category,
      'total_spend', total_spend,
      'txn_count', txn_count
    )
  ), '[]'::jsonb)
  INTO v_spend_by_category
  FROM get_spend_by_category(p_user_id, v_default_start, v_default_end);

  -- Current budget (active preferred, fallback to draft)
  -- RLS will enforce user_id check on budget_periods
  v_budget := NULL;
  v_budget_period_id := NULL;

  SELECT
    bp.id,
    bp.currency_code,
    bp.period_start,
    bp.period_end,
    bp.status
  INTO
    v_budget_period_id,
    v_budget_currency_code,
    v_budget_period_start,
    v_budget_period_end,
    v_budget_status
  FROM budget_periods bp
  WHERE bp.user_id = p_user_id
    AND bp.period_start <= CURRENT_DATE
    AND bp.period_end >= CURRENT_DATE
    AND bp.status IN ('active', 'draft')
  ORDER BY
    CASE WHEN bp.status = 'active' THEN 0 ELSE 1 END,
    bp.updated_at DESC
  LIMIT 1;

  IF v_budget_period_id IS NOT NULL THEN
    -- Total = sum of category limits only
    -- RLS will enforce user_id check on budget_entries via budget_periods
    SELECT COALESCE(SUM(be.limit_amount), 0)
    INTO v_budget_total
    FROM budget_entries be
    WHERE be.budget_period_id = v_budget_period_id
      AND be.scope_type = 'category'
      AND be.category_id IS NOT NULL;

    -- Per-category limits (simple, no grouping)
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'category', COALESCE(c.name, be.label),
          'limit', be.limit_amount
        )
        ORDER BY COALESCE(c.name, be.label)
      ),
      '[]'::jsonb
    )
    INTO v_budget_categories
    FROM budget_entries be
    LEFT JOIN categories c ON c.id = be.category_id
    WHERE be.budget_period_id = v_budget_period_id
      AND be.scope_type = 'category'
      AND be.category_id IS NOT NULL;

    v_budget := jsonb_build_object(
      'period_start', v_budget_period_start,
      'period_end', v_budget_period_end,
      'status', v_budget_status,
      'currency_code', v_budget_currency_code,
      'total_budget', v_budget_total,
      'categories', v_budget_categories
    );
  END IF;

  v_result := jsonb_build_object(
    'net_worth', COALESCE(v_net_worth, '{}'::jsonb),
    'recent_transactions', COALESCE(v_recent_transactions, '[]'::jsonb),
    'spend_by_category', COALESCE(v_spend_by_category, '[]'::jsonb),
    'budget', v_budget,
    'fetched_at', now()
  );

  RETURN v_result;
END;
$function$;

-- Grant execute permission to authenticated
GRANT EXECUTE ON FUNCTION public.get_summary_min_composite(uuid, integer, date, date) TO authenticated;

-- ============================================
-- STEP 3: IMPORTANT - Update API Routes
-- ============================================
-- After running this script, you MUST update your API routes to use authenticated clients
-- instead of service_role. I've created a helper file: lib/api/supabase_authenticated.js
--
-- Example usage in API routes:
--   import { createAuthenticatedClient, extractTokenFromRequest } from '../lib/api/supabase_authenticated.js';
--   
--   const token = extractTokenFromRequest(req);
--   if (!token) {
--     return res.status(401).json({ error: 'Unauthorized' });
--   }
--   
--   const supabase = createAuthenticatedClient(token);
--   const { data, error } = await supabase.rpc('get_net_worth', { p_user_id: userId });
--
-- This ensures RLS policies are enforced and users can only access their own data.
-- ============================================

-- ============================================
-- STEP 4: Verify all grants are in place
-- ============================================
SELECT 
  p.proname as function_name,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
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
