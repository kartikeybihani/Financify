-- Align Finny RPC spending math with app budget math:
-- net spend = expenses - refunds, floored at 0 per category.
-- Keep Income inflows out of spending math.

CREATE OR REPLACE FUNCTION public.get_spend_by_category(
  p_user_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE(category text, total_spend numeric, txn_count integer)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
WITH resolved AS (
  SELECT
    t.amount,
    CASE
      WHEN c.name IS NOT NULL AND btrim(c.name) <> '' THEN c.name
      WHEN t.new_category IS NOT NULL AND btrim(t.new_category) <> '' THEN t.new_category
      WHEN t.top_category IS NOT NULL AND btrim(t.top_category) <> '' THEN t.top_category
      WHEN t.sub_category IS NOT NULL AND btrim(t.sub_category) <> '' THEN t.sub_category
      ELSE 'Other'
    END AS raw_category
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.user_id = p_user_id
    AND t.date >= p_start
    AND t.date <= p_end
    AND COALESCE(t.pending, false) = false
    AND COALESCE(t.transaction_type, '') <> 'transfer'
    AND t.amount <> 0
),
normalized AS (
  SELECT
    CASE
      WHEN raw_category IN ('Uncategorized', 'uncategorized') THEN 'Other'
      ELSE raw_category
    END AS category,
    amount
  FROM resolved
),
filtered AS (
  SELECT category, amount
  FROM normalized
  WHERE category NOT IN (
    'INTERNAL_TRANSFER',
    'TRANSFER_OUT_ACCOUNT_TRANSFER',
    'TRANSFER_IN_ACCOUNT_TRANSFER',
    'TRANSFER_OUT_CASH_ADVANCE',
    'TRANSFER_IN_CASH_ADVANCES_AND_LOANS',
    'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
  )
    -- Exclude income inflows from spending math.
    AND NOT (amount < 0 AND category = 'Income')
),
rolled AS (
  SELECT
    category,
    SUM(amount)::numeric AS net_spend,
    COUNT(*)::integer AS txn_count
  FROM filtered
  GROUP BY category
)
SELECT
  category,
  GREATEST(net_spend, 0)::numeric AS total_spend,
  txn_count
FROM rolled
WHERE GREATEST(net_spend, 0) > 0
ORDER BY total_spend DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_spend_summary(
  p_user_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE(total_spend numeric, txn_count integer)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
SELECT
  COALESCE(SUM(s.total_spend), 0)::numeric AS total_spend,
  COALESCE(SUM(s.txn_count), 0)::integer AS txn_count
FROM public.get_spend_by_category(p_user_id, p_start, p_end) s;
$function$;

CREATE OR REPLACE FUNCTION public.get_spend_by_category_periods(
  p_user_id uuid,
  p_months integer DEFAULT 3
)
RETURNS TABLE(month date, category text, total_spend numeric, txn_count integer)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
WITH bounds AS (
  SELECT
    date_trunc('month', CURRENT_DATE)::date AS end_month,
    (
      date_trunc('month', CURRENT_DATE)::date
      - ((GREATEST(COALESCE(p_months, 1), 1) - 1) || ' months')::interval
    )::date AS start_month
),
resolved AS (
  SELECT
    date_trunc('month', t.date)::date AS month_bucket,
    t.amount,
    CASE
      WHEN c.name IS NOT NULL AND btrim(c.name) <> '' THEN c.name
      WHEN t.new_category IS NOT NULL AND btrim(t.new_category) <> '' THEN t.new_category
      WHEN t.top_category IS NOT NULL AND btrim(t.top_category) <> '' THEN t.top_category
      WHEN t.sub_category IS NOT NULL AND btrim(t.sub_category) <> '' THEN t.sub_category
      ELSE 'Other'
    END AS raw_category
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  CROSS JOIN bounds b
  WHERE t.user_id = p_user_id
    AND t.date >= b.start_month
    AND t.date < (b.end_month + INTERVAL '1 month')
    AND COALESCE(t.pending, false) = false
    AND COALESCE(t.transaction_type, '') <> 'transfer'
    AND t.amount <> 0
),
normalized AS (
  SELECT
    month_bucket,
    CASE
      WHEN raw_category IN ('Uncategorized', 'uncategorized') THEN 'Other'
      ELSE raw_category
    END AS category,
    amount
  FROM resolved
),
filtered AS (
  SELECT month_bucket, category, amount
  FROM normalized
  WHERE category NOT IN (
    'INTERNAL_TRANSFER',
    'TRANSFER_OUT_ACCOUNT_TRANSFER',
    'TRANSFER_IN_ACCOUNT_TRANSFER',
    'TRANSFER_OUT_CASH_ADVANCE',
    'TRANSFER_IN_CASH_ADVANCES_AND_LOANS',
    'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
  )
    AND NOT (amount < 0 AND category = 'Income')
),
rolled AS (
  SELECT
    month_bucket,
    category,
    SUM(amount)::numeric AS net_spend,
    COUNT(*)::integer AS txn_count
  FROM filtered
  GROUP BY month_bucket, category
)
SELECT
  month_bucket AS month,
  category,
  GREATEST(net_spend, 0)::numeric AS total_spend,
  txn_count
FROM rolled
WHERE GREATEST(net_spend, 0) > 0
ORDER BY month DESC, total_spend DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_transactions_by_category(
  p_user_id uuid,
  p_category text,
  p_start date,
  p_end date
)
RETURNS TABLE(
  id uuid,
  amount numeric,
  date date,
  name text,
  merchant_name text,
  category text,
  top_category text,
  sub_category text,
  transaction_type text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH tx AS (
  SELECT
    t.id,
    t.amount,
    t.date,
    t.name,
    t.merchant_name,
    t.top_category,
    t.sub_category,
    t.transaction_type,
    CASE
      WHEN COALESCE(NULLIF(c.name, ''), NULLIF(t.new_category, ''), NULLIF(t.top_category, ''), NULLIF(t.sub_category, ''), 'Other') IN ('Uncategorized', 'uncategorized')
        THEN 'Other'
      ELSE COALESCE(NULLIF(c.name, ''), NULLIF(t.new_category, ''), NULLIF(t.top_category, ''), NULLIF(t.sub_category, ''), 'Other')
    END AS resolved_category
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.user_id = p_user_id
    AND t.date >= p_start
    AND t.date <= p_end
    AND t.amount <> 0
    AND COALESCE(t.pending, false) = false
    AND COALESCE(t.transaction_type, '') <> 'transfer'
)
SELECT
  id,
  amount,
  date,
  name,
  merchant_name,
  resolved_category AS category,
  top_category,
  sub_category,
  transaction_type
FROM tx
WHERE lower(resolved_category) = lower(trim(p_category))
  AND resolved_category <> 'INTERNAL_TRANSFER'
ORDER BY date DESC, amount DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_spend_by_category(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_spend_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_spend_by_category_periods(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transactions_by_category(uuid, text, date, date) TO authenticated;
