-- Backfill script: Populate category_id in transactions table
-- This script matches transactions to categories by name and sets category_id
-- Run this AFTER the migration add_category_id_to_transactions.sql

-- Strategy:
-- 1. For transactions with new_category set: Match by new_category name
-- 2. For transactions with only top_category set: Match by top_category name
-- 3. Only update if a matching category exists and is_active = true

-- Update transactions that have new_category set
UPDATE public.transactions t
SET category_id = c.id
FROM public.categories c
WHERE t.category_id IS NULL
  AND t.new_category IS NOT NULL
  AND t.new_category != 'INTERNAL_TRANSFER'
  AND LOWER(TRIM(t.new_category)) = LOWER(TRIM(c.name))
  AND t.user_id = c.user_id
  AND c.is_active = true;

-- Update transactions that only have top_category set (and new_category is NULL)
UPDATE public.transactions t
SET category_id = c.id
FROM public.categories c
WHERE t.category_id IS NULL
  AND t.new_category IS NULL
  AND t.top_category IS NOT NULL
  AND t.top_category != 'INTERNAL_TRANSFER'
  AND LOWER(TRIM(t.top_category)) = LOWER(TRIM(c.name))
  AND t.user_id = c.user_id
  AND c.is_active = true;

-- Log summary
DO $$
DECLARE
  total_with_category_id INTEGER;
  total_without_category_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_with_category_id
  FROM public.transactions
  WHERE category_id IS NOT NULL;
  
  SELECT COUNT(*) INTO total_without_category_id
  FROM public.transactions
  WHERE category_id IS NULL
    AND (new_category IS NOT NULL OR top_category IS NOT NULL)
    AND COALESCE(new_category, top_category) != 'INTERNAL_TRANSFER';
  
  RAISE NOTICE 'Backfill complete:';
  RAISE NOTICE '  Transactions with category_id: %', total_with_category_id;
  RAISE NOTICE '  Transactions without category_id (unmatched): %', total_without_category_id;
END $$;
