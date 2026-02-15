-- Add optional amount to category_rules for amount-specific matching.
-- When amount is set, the rule applies only to transactions with that exact amount.
-- When amount is NULL, the rule applies to all amounts (existing behavior).

ALTER TABLE public.category_rules
ADD COLUMN IF NOT EXISTS amount numeric;

COMMENT ON COLUMN public.category_rules.amount IS 'Optional. When set, rule matches only transactions with this exact amount (absolute value). NULL = match all amounts.';

-- Update create_or_update_category_rule to support optional amount.
-- p_amount: when provided, rule matches only that exact amount; NULL = match all amounts.
CREATE OR REPLACE FUNCTION public.create_or_update_category_rule(
  p_user_id uuid,
  p_match_field text,
  p_match_value text,
  p_category_name text,
  p_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_existing_id uuid;
  v_rule_id uuid;
BEGIN
  -- Resolve category: user's category first, then default (user_id IS NULL)
  SELECT id INTO v_category_id
  FROM categories
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_category_name))
    AND (user_id = p_user_id OR user_id IS NULL)
    AND is_active = true
  ORDER BY (user_id IS NOT NULL) DESC
  LIMIT 1;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Category not found: %', p_category_name;
  END IF;

  -- Find existing rule: same user, match field/value, and same amount (incl. both null)
  SELECT id INTO v_existing_id
  FROM category_rules
  WHERE user_id = p_user_id
    AND (
      (p_match_field = 'merchant_name' AND match_field = 'merchant_name' AND merchant_name IS NOT DISTINCT FROM p_match_value)
      OR (p_match_field IN ('name', 'transaction_name') AND match_field IN ('name', 'transaction_name') AND transaction_name IS NOT DISTINCT FROM p_match_value)
    )
    AND (amount IS NOT DISTINCT FROM p_amount)
    AND active = true
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE category_rules
    SET top_category_id = v_category_id,
        sub_category_id = v_category_id,
        amount = p_amount
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  -- Insert new rule
  v_rule_id := gen_random_uuid();
  INSERT INTO category_rules (
    id, user_id, merchant_name, transaction_name,
    top_category_id, sub_category_id, match_field, amount, active
  ) VALUES (
    v_rule_id, p_user_id,
    CASE WHEN p_match_field = 'merchant_name' THEN p_match_value ELSE NULL END,
    CASE WHEN p_match_field IN ('name', 'transaction_name') THEN p_match_value ELSE NULL END,
    v_category_id, v_category_id,
    CASE WHEN p_match_field = 'name' THEN 'transaction_name' ELSE p_match_field END,
    p_amount,
    true
  );
  RETURN v_rule_id;
END;
$$;
