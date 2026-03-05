-- Atomic/idempotent per-account derived balance application.
-- Prevents double-apply if app-level retries happen after partial failures.

CREATE OR REPLACE FUNCTION public.apply_derived_balance_delta(
  p_run_id uuid,
  p_item_id text,
  p_user_id uuid,
  p_account_id text,
  p_cursor_start text,
  p_cursor_end text,
  p_posted_delta_current numeric,
  p_posted_delta_available numeric,
  p_pending_delta_available numeric
)
RETURNS TABLE (
  outcome text,
  prev_current numeric,
  prev_available numeric,
  new_current numeric,
  new_available numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.accounts%ROWTYPE;
  v_next_current numeric;
  v_next_available numeric;
  v_available_delta numeric := COALESCE(p_posted_delta_available, 0) + COALESCE(p_pending_delta_available, 0);
BEGIN
  SELECT *
  INTO v_account
  FROM public.accounts
  WHERE account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.derived_balance_runs (
      run_id,
      item_id,
      user_id,
      account_id,
      cursor_start,
      cursor_end,
      posted_delta_current,
      posted_delta_available,
      pending_delta_available,
      prev_current,
      prev_available,
      new_current,
      new_available,
      status,
      reason
    )
    VALUES (
      p_run_id,
      p_item_id,
      p_user_id,
      p_account_id,
      p_cursor_start,
      p_cursor_end,
      COALESCE(p_posted_delta_current, 0),
      COALESCE(p_posted_delta_available, 0),
      COALESCE(p_pending_delta_available, 0),
      NULL,
      NULL,
      NULL,
      NULL,
      'skipped',
      'account_not_found'
    )
    ON CONFLICT (item_id, cursor_end, account_id, status) DO NOTHING;

    RETURN QUERY SELECT
      'account_not_found'::text,
      NULL::numeric,
      NULL::numeric,
      NULL::numeric,
      NULL::numeric;
    RETURN;
  END IF;

  IF LOWER(COALESCE(v_account.type, '')) NOT IN ('depository', 'credit', 'loan') THEN
    INSERT INTO public.derived_balance_runs (
      run_id,
      item_id,
      user_id,
      account_id,
      cursor_start,
      cursor_end,
      posted_delta_current,
      posted_delta_available,
      pending_delta_available,
      prev_current,
      prev_available,
      new_current,
      new_available,
      status,
      reason
    )
    VALUES (
      p_run_id,
      p_item_id,
      p_user_id,
      p_account_id,
      p_cursor_start,
      p_cursor_end,
      COALESCE(p_posted_delta_current, 0),
      COALESCE(p_posted_delta_available, 0),
      COALESCE(p_pending_delta_available, 0),
      v_account.current_balance,
      v_account.available_balance,
      v_account.current_balance,
      v_account.available_balance,
      'skipped',
      'unknown_account_type'
    )
    ON CONFLICT (item_id, cursor_end, account_id, status) DO NOTHING;

    RETURN QUERY SELECT
      'unknown_account_type'::text,
      v_account.current_balance,
      v_account.available_balance,
      v_account.current_balance,
      v_account.available_balance;
    RETURN;
  END IF;

  v_next_current := COALESCE(v_account.current_balance, 0) + COALESCE(p_posted_delta_current, 0);
  IF v_account.available_balance IS NULL THEN
    v_next_available := NULL;
  ELSE
    v_next_available := COALESCE(v_account.available_balance, 0) + v_available_delta;
  END IF;

  INSERT INTO public.derived_balance_runs (
    run_id,
    item_id,
    user_id,
    account_id,
    cursor_start,
    cursor_end,
    posted_delta_current,
    posted_delta_available,
    pending_delta_available,
    prev_current,
    prev_available,
    new_current,
    new_available,
    status,
    reason
  )
  VALUES (
    p_run_id,
    p_item_id,
    p_user_id,
    p_account_id,
    p_cursor_start,
    p_cursor_end,
    COALESCE(p_posted_delta_current, 0),
    COALESCE(p_posted_delta_available, 0),
    COALESCE(p_pending_delta_available, 0),
    v_account.current_balance,
    v_account.available_balance,
    v_next_current,
    v_next_available,
    'applied',
    NULL
  )
  ON CONFLICT (item_id, cursor_end, account_id, status) DO NOTHING;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'already_applied'::text,
      v_account.current_balance,
      v_account.available_balance,
      v_account.current_balance,
      v_account.available_balance;
    RETURN;
  END IF;

  UPDATE public.accounts
  SET
    current_balance = v_next_current,
    available_balance = CASE
      WHEN v_account.available_balance IS NULL THEN available_balance
      ELSE v_next_available
    END,
    balance_source = 'derived'
  WHERE account_id = p_account_id;

  RETURN QUERY SELECT
    'applied'::text,
    v_account.current_balance,
    v_account.available_balance,
    v_next_current,
    v_next_available;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_derived_balance_delta(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_derived_balance_delta(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric
) TO service_role;
