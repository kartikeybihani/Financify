-- Fix security check in get_summary_min_composite to allow service_role calls
-- This fixes the "forbidden" error when calling from server-side

CREATE OR REPLACE FUNCTION public.get_summary_min_composite(
  p_user_id uuid,
  p_limit integer DEFAULT 5,
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_net_worth jsonb;
  v_recent_transactions jsonb;
  v_spend_by_category jsonb;
  v_spend_by_category_current_month jsonb;
  v_spend_by_category_last_month jsonb;
  v_default_start date;
  v_default_end date;
  
  -- Current month dates
  v_current_month_start date;
  v_current_month_end date;
  
  -- Last complete month dates
  v_last_month_start date;
  v_last_month_end date;

  -- Auth
  v_claim_sub uuid;
  v_claim_role text;

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
  -- SECURITY: Prevent cross-user access when called via PostgREST.
  -- Allow service_role callers (server-side) to request any user.
  -- For authenticated callers, enforce p_user_id matches JWT subject.
  -- Note: When using service_role key via Supabase client, JWT claims may not be set
  BEGIN
    v_claim_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  EXCEPTION WHEN OTHERS THEN
    -- If JWT claims are not available (service_role calls), set to NULL
    v_claim_role := NULL;
  END;
  
  BEGIN
    v_claim_sub := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    -- If JWT claims are not available (service_role calls), set to NULL
    v_claim_sub := NULL;
  END;

  -- Only enforce user_id check for authenticated (non-service) callers
  -- If role is NULL or 'service_role', allow the call (server-side)
  IF v_claim_role IS NOT NULL AND v_claim_role <> 'service_role' THEN
    -- This is an authenticated (non-service) caller - enforce user_id match
    IF v_claim_sub IS NULL OR v_claim_sub <> p_user_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Calculate current month dates (1st of current month to today)
  v_current_month_start := DATE_TRUNC('month', CURRENT_DATE)::date;
  v_current_month_end := CURRENT_DATE;

  -- Calculate last complete month dates (1st of last month to last day of last month)
  v_last_month_start := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date;
  v_last_month_end := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::date;

  -- Set default date range to last 30 days if not provided (for backward compatibility)
  -- Note: This is kept for backward compatibility but we now use monthly breakdowns
  IF p_start IS NULL OR p_end IS NULL THEN
    v_default_end := CURRENT_DATE;
    v_default_start := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_default_start := p_start;
    v_default_end := p_end;
  END IF;

  -- Get net worth data
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

  -- Get recent transactions
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

  -- Get spend by category for current month
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category', category,
      'total_spend', total_spend,
      'txn_count', txn_count
    )
  ), '[]'::jsonb)
  INTO v_spend_by_category_current_month
  FROM get_spend_by_category(p_user_id, v_current_month_start, v_current_month_end);

  -- Get spend by category for last complete month
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category', category,
      'total_spend', total_spend,
      'txn_count', txn_count
    )
  ), '[]'::jsonb)
  INTO v_spend_by_category_last_month
  FROM get_spend_by_category(p_user_id, v_last_month_start, v_last_month_end);

  -- Keep backward compatibility: maintain spend_by_category for last 30 days
  -- (using the default date range)
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
    'spend_by_category_current_month', COALESCE(v_spend_by_category_current_month, '[]'::jsonb),
    'spend_by_category_last_month', COALESCE(v_spend_by_category_last_month, '[]'::jsonb),
    'budget', v_budget,
    'fetched_at', now()
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_summary_min_composite(uuid, integer, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_summary_min_composite IS
'Composite function that fetches net worth, recent transactions, spend by category (current month, last complete month, and last 30 days for backward compatibility), and current budget (active preferred, fallback to draft).';
