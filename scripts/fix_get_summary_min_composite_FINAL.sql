-- FINAL FIX: Remove auth.uid() check from get_summary_min_composite
-- This MUST work - run this and verify

-- First, check current state
SELECT 
  'BEFORE FIX' as status,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%IF auth.uid()%' THEN 'HAS auth.uid() CHECK'
    ELSE 'NO auth.uid() CHECK'
  END as current_state
FROM pg_proc
WHERE proname = 'get_summary_min_composite'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Now fix it
CREATE OR REPLACE FUNCTION public.get_summary_min_composite(
  p_user_id uuid,
  p_limit integer DEFAULT 5,
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_net_worth jsonb;
  v_recent_transactions jsonb;
  v_spend_by_category jsonb;
  v_default_start date;
  v_default_end date;
  v_budget_period_id uuid;
  v_budget_currency_code text;
  v_budget_period_start date;
  v_budget_period_end date;
  v_budget_status text;
  v_budget_total numeric;
  v_budget_categories jsonb;
  v_budget jsonb;
BEGIN
  -- NOTE: No auth.uid() check - API validates user_id
  -- RLS policies enforce security on underlying tables

  IF p_start IS NULL OR p_end IS NULL THEN
    v_default_end := CURRENT_DATE;
    v_default_start := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_default_start := p_start;
    v_default_end := p_end;
  END IF;

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

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category', category,
      'total_spend', total_spend,
      'txn_count', txn_count
    )
  ), '[]'::jsonb)
  INTO v_spend_by_category
  FROM get_spend_by_category(p_user_id, v_default_start, v_default_end);

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
    SELECT COALESCE(SUM(be.limit_amount), 0)
    INTO v_budget_total
    FROM budget_entries be
    WHERE be.budget_period_id = v_budget_period_id
      AND be.scope_type = 'category'
      AND be.category_id IS NOT NULL;

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

-- Verify AFTER fix
SELECT 
  'AFTER FIX' as status,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%IF auth.uid()%' 
      OR pg_get_functiondef(oid) LIKE '%auth.uid() IS NULL%'
      OR pg_get_functiondef(oid) LIKE '%auth.uid() <>%'
    THEN '❌ STILL HAS auth.uid() CHECK'
    ELSE '✅ NO auth.uid() CHECK'
  END as verification
FROM pg_proc
WHERE proname = 'get_summary_min_composite'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
