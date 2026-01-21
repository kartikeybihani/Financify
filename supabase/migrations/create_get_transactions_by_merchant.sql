-- Create get_transactions_by_merchant RPC function
-- Returns individual transactions for a specific merchant within a date range
-- Similar structure to get_transactions_by_category but filtered by merchant_name

CREATE OR REPLACE FUNCTION get_transactions_by_merchant(
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
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.amount,
    t.date,
    t.name,
    t.merchant_name,
    COALESCE(t.new_category, t.top_category, t.sub_category, 'uncategorized') as category,
    t.top_category,
    t.sub_category,
    t.transaction_type,
    t.authorized_date,
    t.category_id
  FROM public.transactions t
  WHERE t.user_id = p_user_id
    AND t.date >= p_start
    AND t.date <= p_end
    -- Check both merchant_name AND name fields (some transactions have merchant_name = null)
    -- Case-insensitive partial match for merchant name
    -- Handles variations like "Chipotle", "Chipotle Mexican Grill", etc.
    AND (
      (t.merchant_name IS NOT NULL AND LOWER(t.merchant_name) LIKE '%' || LOWER(TRIM(p_merchant)) || '%')
      OR (t.name IS NOT NULL AND LOWER(t.name) LIKE '%' || LOWER(TRIM(p_merchant)) || '%')
    )
    -- Note: Amounts are stored as positive values for expenses in this database
    -- If you need to filter expenses only, check transaction_type or remove this filter
  ORDER BY t.date DESC, t.amount ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_transactions_by_merchant(uuid, text, date, date) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_transactions_by_merchant IS 
'Returns individual transactions for a specific merchant within a date range. 
Checks both merchant_name and name fields for merchant matching (case-insensitive partial match).
Handles cases where merchant_name may be null but name contains the merchant.
Returns same structure as get_transactions_by_category for consistency.';
