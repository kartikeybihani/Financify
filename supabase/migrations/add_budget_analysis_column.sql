-- Add budget_analysis column to budget_periods table
-- This stores Finny's raw LLM response when generating budgets

ALTER TABLE public.budget_periods
ADD COLUMN IF NOT EXISTS budget_analysis text;

-- Add comment for documentation
COMMENT ON COLUMN public.budget_periods.budget_analysis IS 'Stores the raw LLM response from Finny when generating budget categories';
