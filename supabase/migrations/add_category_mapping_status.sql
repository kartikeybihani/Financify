-- Add category_mapping_status column to budget_periods table
-- This tracks the status of AI-powered transaction category mapping
-- Values: null (not started), 'in_progress', 'completed', 'failed'

ALTER TABLE public.budget_periods
ADD COLUMN IF NOT EXISTS category_mapping_status text CHECK (category_mapping_status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'failed'::text]));

-- Add comment for documentation
COMMENT ON COLUMN public.budget_periods.category_mapping_status IS 'Status of AI-powered transaction category mapping: in_progress, completed, or failed';
