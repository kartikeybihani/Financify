-- Fix category_rules_match_field_check: allow 'transaction_name' in addition to 'merchant_name' and 'name'.
-- The create_or_update_category_rule function stores 'transaction_name' when matching by transaction name,
-- but the original constraint only allowed 'merchant_name' and 'name'.

ALTER TABLE public.category_rules
  DROP CONSTRAINT IF EXISTS category_rules_match_field_check;

ALTER TABLE public.category_rules
  ADD CONSTRAINT category_rules_match_field_check
  CHECK (match_field IN ('merchant_name', 'name', 'transaction_name'));
