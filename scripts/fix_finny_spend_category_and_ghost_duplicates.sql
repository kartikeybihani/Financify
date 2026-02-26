-- Fix 1: Make category resolution consistent and avoid "Uncategorized" leakage.
-- Fix 2: Provide safe ghost-account duplicate cleanup workflow for one user.
--
-- IMPORTANT:
-- 1) Review preview queries first.
-- 2) Uncomment DELETE blocks only after validating preview output.

-- ============================================================================
-- A) RPC CATEGORY CONSISTENCY FIXES
-- ============================================================================

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
WITH tx AS (
  SELECT
    t.amount,
    CASE
      WHEN c.name IS NOT NULL AND btrim(c.name) <> '' THEN c.name
      WHEN t.new_category IS NOT NULL AND btrim(t.new_category) <> '' THEN t.new_category
      WHEN t.top_category IS NOT NULL AND btrim(t.top_category) <> '' THEN t.top_category
      WHEN t.sub_category IS NOT NULL AND btrim(t.sub_category) <> '' THEN t.sub_category
      ELSE 'Other'
    END AS effective_category
  FROM public.transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.user_id = p_user_id
    AND t.date >= p_start
    AND t.date <= p_end
    AND COALESCE(t.pending, false) = false
    AND t.amount > 0
)
SELECT
  CASE
    WHEN effective_category IN ('Uncategorized', 'uncategorized') THEN 'Other'
    ELSE effective_category
  END AS category,
  SUM(amount)::numeric AS total_spend,
  COUNT(*)::integer AS txn_count
FROM tx
WHERE effective_category NOT IN (
  'INTERNAL_TRANSFER',
  'TRANSFER_OUT_ACCOUNT_TRANSFER',
  'TRANSFER_IN_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_CASH_ADVANCE',
  'TRANSFER_IN_CASH_ADVANCES_AND_LOANS',
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
  'Income'
)
GROUP BY 1
HAVING SUM(amount) > 0
ORDER BY total_spend DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_recent_transactions(
  p_user_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(date date, amount numeric, merchant text, category text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT
  t.date,
  t.amount,
  COALESCE(t.merchant_name, t.name) AS merchant,
  CASE
    WHEN COALESCE(NULLIF(c.name, ''), NULLIF(t.new_category, ''), NULLIF(t.top_category, ''), NULLIF(t.sub_category, ''), 'Other') IN ('Uncategorized', 'uncategorized')
      THEN 'Other'
    ELSE COALESCE(NULLIF(c.name, ''), NULLIF(t.new_category, ''), NULLIF(t.top_category, ''), NULLIF(t.sub_category, ''), 'Other')
  END AS category,
  t.name
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.user_id = p_user_id
ORDER BY t.date DESC
LIMIT p_limit;
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
    AND t.amount > 0
    AND COALESCE(t.pending, false) = false
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
ORDER BY date DESC, amount DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_transactions_by_merchant(
  p_user_id uuid,
  p_merchant text,
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
  transaction_type text,
  authorized_date date,
  category_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT
  t.id,
  t.amount,
  t.date,
  t.name,
  t.merchant_name,
  CASE
    WHEN COALESCE(NULLIF(c.name, ''), NULLIF(t.new_category, ''), NULLIF(t.top_category, ''), NULLIF(t.sub_category, ''), 'Other') IN ('Uncategorized', 'uncategorized')
      THEN 'Other'
    ELSE COALESCE(NULLIF(c.name, ''), NULLIF(t.new_category, ''), NULLIF(t.top_category, ''), NULLIF(t.sub_category, ''), 'Other')
  END AS category,
  t.top_category,
  t.sub_category,
  t.transaction_type,
  t.authorized_date,
  t.category_id
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.user_id = p_user_id
  AND t.date >= p_start
  AND t.date <= p_end
  AND (
    (t.merchant_name IS NOT NULL AND lower(t.merchant_name) LIKE '%' || lower(trim(p_merchant)) || '%')
    OR (t.name IS NOT NULL AND lower(t.name) LIKE '%' || lower(trim(p_merchant)) || '%')
  )
ORDER BY t.date DESC, t.amount ASC;
$function$;

-- ============================================================================
-- B) GHOST-ACCOUNT DUPLICATE CLEANUP (PREVIEW + OPTIONAL DELETE)
-- ============================================================================

-- Replace this user id if needed.
WITH params AS (
  SELECT '79952f35-b607-40d6-a32e-d81386882eb7'::uuid AS user_id
),
ghost_accounts AS (
  SELECT a.account_id, a.item_id
  FROM public.accounts a
  JOIN public.user_items ui ON ui.item_id = a.item_id
  JOIN params p ON p.user_id = ui.user_id
  WHERE a.name IS NULL
    AND a.official_name IS NULL
    AND a.mask IS NULL
    AND a.type IS NULL
    AND a.subtype IS NULL
),
candidate_pairs AS (
  SELECT
    gt.id AS ghost_tx_id,
    ct.id AS keep_tx_id,
    gt.account_id AS ghost_account_id,
    ct.account_id AS keep_account_id,
    ga.item_id,
    gt.amount,
    COALESCE(gt.authorized_date, gt.date) AS effective_date,
    COALESCE(NULLIF(lower(trim(gt.merchant_name)), ''), NULLIF(lower(trim(gt.name)), ''), 'unknown') AS merchant_key
  FROM public.transactions gt
  JOIN ghost_accounts ga ON ga.account_id = gt.account_id
  JOIN params p ON p.user_id = gt.user_id
  JOIN public.transactions ct
    ON ct.user_id = gt.user_id
   AND ct.account_id <> gt.account_id
   AND ct.amount = gt.amount
   AND COALESCE(ct.authorized_date, ct.date) = COALESCE(gt.authorized_date, gt.date)
   AND COALESCE(NULLIF(lower(trim(ct.merchant_name)), ''), NULLIF(lower(trim(ct.name)), ''), 'unknown')
       = COALESCE(NULLIF(lower(trim(gt.merchant_name)), ''), NULLIF(lower(trim(gt.name)), ''), 'unknown')
  JOIN public.accounts ca ON ca.account_id = ct.account_id AND ca.item_id = ga.item_id
  WHERE COALESCE(gt.pending, false) = false
    AND COALESCE(ct.pending, false) = false
    AND NOT (
      ca.name IS NULL
      AND ca.official_name IS NULL
      AND ca.mask IS NULL
      AND ca.type IS NULL
      AND ca.subtype IS NULL
    )
),
ranked_pairs AS (
  SELECT
    cp.*,
    row_number() OVER (PARTITION BY cp.ghost_tx_id ORDER BY cp.keep_tx_id) AS rn
  FROM candidate_pairs cp
),
pairs AS (
  SELECT * FROM ranked_pairs WHERE rn = 1
)
SELECT
  ghost_account_id,
  keep_account_id,
  item_id,
  amount,
  effective_date,
  merchant_key,
  COUNT(*) AS duplicate_txn_count
FROM pairs
GROUP BY ghost_account_id, keep_account_id, item_id, amount, effective_date, merchant_key
ORDER BY effective_date DESC, amount DESC;

-- Optional: delete only ghost duplicate rows that have a canonical twin.
-- Uncomment after reviewing preview output.
/*
WITH params AS (
  SELECT '79952f35-b607-40d6-a32e-d81386882eb7'::uuid AS user_id
),
ghost_accounts AS (
  SELECT a.account_id, a.item_id
  FROM public.accounts a
  JOIN public.user_items ui ON ui.item_id = a.item_id
  JOIN params p ON p.user_id = ui.user_id
  WHERE a.name IS NULL
    AND a.official_name IS NULL
    AND a.mask IS NULL
    AND a.type IS NULL
    AND a.subtype IS NULL
),
candidate_pairs AS (
  SELECT
    gt.id AS ghost_tx_id
  FROM public.transactions gt
  JOIN ghost_accounts ga ON ga.account_id = gt.account_id
  JOIN params p ON p.user_id = gt.user_id
  JOIN public.transactions ct
    ON ct.user_id = gt.user_id
   AND ct.account_id <> gt.account_id
   AND ct.amount = gt.amount
   AND COALESCE(ct.authorized_date, ct.date) = COALESCE(gt.authorized_date, gt.date)
   AND COALESCE(NULLIF(lower(trim(ct.merchant_name)), ''), NULLIF(lower(trim(ct.name)), ''), 'unknown')
       = COALESCE(NULLIF(lower(trim(gt.merchant_name)), ''), NULLIF(lower(trim(gt.name)), ''), 'unknown')
  JOIN public.accounts ca ON ca.account_id = ct.account_id AND ca.item_id = ga.item_id
  WHERE COALESCE(gt.pending, false) = false
    AND COALESCE(ct.pending, false) = false
    AND NOT (
      ca.name IS NULL
      AND ca.official_name IS NULL
      AND ca.mask IS NULL
      AND ca.type IS NULL
      AND ca.subtype IS NULL
    )
),
to_delete AS (
  SELECT DISTINCT ghost_tx_id FROM candidate_pairs
)
DELETE FROM public.transactions t
USING to_delete d
WHERE t.id = d.ghost_tx_id;
*/

-- Optional: remove empty ghost accounts for this user.
-- Uncomment only after duplicate cleanup.
/*
WITH params AS (
  SELECT '79952f35-b607-40d6-a32e-d81386882eb7'::uuid AS user_id
)
DELETE FROM public.accounts a
USING public.user_items ui, params p
WHERE ui.user_id = p.user_id
  AND a.item_id = ui.item_id
  AND a.name IS NULL
  AND a.official_name IS NULL
  AND a.mask IS NULL
  AND a.type IS NULL
  AND a.subtype IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t WHERE t.account_id = a.account_id
  );
*/

-- Optional: clear summary_min cache for this user so Finny reads fresh values.
-- Uncomment if needed.
/*
DELETE FROM public.context_cache
WHERE user_id = '79952f35-b607-40d6-a32e-d81386882eb7'::uuid
  AND data_type = 'summary_min';
*/
