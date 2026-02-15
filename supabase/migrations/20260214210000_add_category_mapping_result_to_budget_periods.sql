-- Add category_mapping_result column to budget_periods table
-- Stores the LLM category mapping result (top_category|sub_category -> budget category name)
-- Populated when remapTransactionsToBudgetCategories completes successfully

ALTER TABLE public.budget_periods
ADD COLUMN IF NOT EXISTS category_mapping_result jsonb;

COMMENT ON COLUMN public.budget_periods.category_mapping_result IS 'LLM result from category mapping: { mappings: { "Food|Restaurant": "Food", "Loans|Student Loan Payment": "Other", ... } }';
