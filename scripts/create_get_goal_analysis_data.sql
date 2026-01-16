-- Composite function to batch RPC calls for goal analysis
-- Reduces network round-trips from 5 to 1
-- Returns all financial data needed for goal analysis in a single JSONB response

CREATE OR REPLACE FUNCTION public.get_goal_analysis_data(
  p_user_id uuid,
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_transaction_limit integer DEFAULT 200,
  p_cashflow_months integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_net_worth jsonb;
  v_investment_snapshot jsonb;
  v_recent_transactions jsonb;
  v_spend_by_category jsonb;
  v_cashflow jsonb;
  v_default_start date;
  v_default_end date;
BEGIN
  -- NOTE: No auth.uid() check - API validates user_id
  -- RLS policies enforce security on underlying tables

  -- Set default date range if not provided
  IF p_start IS NULL OR p_end IS NULL THEN
    v_default_end := CURRENT_DATE;
    v_default_start := CURRENT_DATE - INTERVAL '30 days';
  ELSE
    v_default_start := p_start;
    v_default_end := p_end;
  END IF;

  -- Fetch net worth
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

  -- Fetch investment snapshot
  SELECT jsonb_build_object(
    'total_value', total_value,
    'total_cost_basis', total_cost_basis,
    'total_gain_loss', total_gain_loss,
    'total_gain_loss_percent', total_gain_loss_percent,
    'holdings_count', holdings_count,
    'accounts_count', accounts_count
  )
  INTO v_investment_snapshot
  FROM get_investment_snapshot(p_user_id)
  LIMIT 1;

  -- Fetch recent transactions
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', date,
      'amount', amount,
      'merchant', merchant,
      'category', category,
      'name', name
    )
    ORDER BY date DESC
  ), '[]'::jsonb)
  INTO v_recent_transactions
  FROM get_recent_transactions(p_user_id, p_transaction_limit);

  -- Fetch spend by category
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'category', category,
      'total_spend', total_spend,
      'txn_count', txn_count
    )
    ORDER BY total_spend DESC
  ), '[]'::jsonb)
  INTO v_spend_by_category
  FROM get_spend_by_category(p_user_id, v_default_start, v_default_end);

  -- Fetch cashflow
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'month', month,
      'income', income,
      'expenses', expenses,
      'net', net
    )
    ORDER BY month DESC
  ), '[]'::jsonb)
  INTO v_cashflow
  FROM get_cashflow_monthly(p_user_id, p_cashflow_months);

  -- Build composite result
  v_result := jsonb_build_object(
    'net_worth', COALESCE(v_net_worth, '{}'::jsonb),
    'investment_snapshot', COALESCE(v_investment_snapshot, '{}'::jsonb),
    'recent_transactions', COALESCE(v_recent_transactions, '[]'::jsonb),
    'spend_by_category', COALESCE(v_spend_by_category, '[]'::jsonb),
    'cashflow', COALESCE(v_cashflow, '[]'::jsonb),
    'fetched_at', now()
  );

  RETURN v_result;
END;
$function$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_goal_analysis_data(uuid, date, date, integer, integer) TO authenticated;

-- Verify function was created
SELECT 
  'Function created' as status,
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'get_goal_analysis_data'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
