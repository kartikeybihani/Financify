-- Budget System Tables
-- Run this SQL in Supabase SQL Editor

-- Create budget_periods table (one per user per month)
CREATE TABLE IF NOT EXISTS public.budget_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text NOT NULL DEFAULT 'monthly' CHECK (period_type = 'monthly'),
  currency_code text NOT NULL DEFAULT 'USD',
  total_limit numeric,
  rollover_mode text NOT NULL DEFAULT 'none' CHECK (rollover_mode = ANY (ARRAY['none','carry_remaining','carry_overspend'])),
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['draft','active','archived'])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT budget_periods_pkey PRIMARY KEY (id),
  CONSTRAINT budget_periods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT budget_periods_unique_period UNIQUE (user_id, period_start, period_end)
);

-- Create budget_entries table (one per budget line: overall, category, or group)
CREATE TABLE IF NOT EXISTS public.budget_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  budget_period_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type = ANY (ARRAY['overall','category','group'])),
  category_id uuid,
  group_key text,
  label text NOT NULL,
  limit_amount numeric NOT NULL CHECK (limit_amount >= 0),
  is_flexible boolean NOT NULL DEFAULT false,
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT budget_entries_pkey PRIMARY KEY (id),
  CONSTRAINT budget_entries_budget_period_id_fkey FOREIGN KEY (budget_period_id) REFERENCES public.budget_periods(id) ON DELETE CASCADE,
  CONSTRAINT budget_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_budget_periods_user_id ON public.budget_periods(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_periods_period_dates ON public.budget_periods(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_budget_entries_budget_period_id ON public.budget_entries(budget_period_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_category_id ON public.budget_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_scope_type ON public.budget_entries(scope_type);

-- Create unique constraint for category entries per period (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_entries_unique_category 
ON public.budget_entries(budget_period_id, scope_type, category_id) 
WHERE scope_type = 'category' AND category_id IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for budget_periods
-- Users can only see their own budget periods
CREATE POLICY "Users can view their own budget periods"
  ON public.budget_periods
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own budget periods
CREATE POLICY "Users can insert their own budget periods"
  ON public.budget_periods
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own budget periods
CREATE POLICY "Users can update their own budget periods"
  ON public.budget_periods
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own budget periods
CREATE POLICY "Users can delete their own budget periods"
  ON public.budget_periods
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for budget_entries
-- Users can view budget entries for their own budget periods
CREATE POLICY "Users can view their own budget entries"
  ON public.budget_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_periods
      WHERE budget_periods.id = budget_entries.budget_period_id
      AND budget_periods.user_id = auth.uid()
    )
  );

-- Users can insert budget entries for their own budget periods
CREATE POLICY "Users can insert their own budget entries"
  ON public.budget_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_periods
      WHERE budget_periods.id = budget_entries.budget_period_id
      AND budget_periods.user_id = auth.uid()
    )
  );

-- Users can update budget entries for their own budget periods
CREATE POLICY "Users can update their own budget entries"
  ON public.budget_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_periods
      WHERE budget_periods.id = budget_entries.budget_period_id
      AND budget_periods.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_periods
      WHERE budget_periods.id = budget_entries.budget_period_id
      AND budget_periods.user_id = auth.uid()
    )
  );

-- Users can delete budget entries for their own budget periods
CREATE POLICY "Users can delete their own budget entries"
  ON public.budget_entries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_periods
      WHERE budget_periods.id = budget_entries.budget_period_id
      AND budget_periods.user_id = auth.uid()
    )
  );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_budget_periods_updated_at
  BEFORE UPDATE ON public.budget_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budget_entries_updated_at
  BEFORE UPDATE ON public.budget_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

