-- Finny Recurring Transaction Analysis
-- Stores LLM-powered analysis when user connects account or clicks "Do a quick analysis"
CREATE TABLE IF NOT EXISTS public.finny_recurring_analysis (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id text,
  analysis_text text NOT NULL,
  analysis_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  trigger_source text NOT NULL DEFAULT 'manual'::text CHECK (trigger_source = ANY (ARRAY['new_account'::text, 'manual'::text])),
  CONSTRAINT finny_recurring_analysis_pkey PRIMARY KEY (id),
  CONSTRAINT finny_recurring_analysis_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_finny_recurring_analysis_user_created
  ON public.finny_recurring_analysis (user_id, created_at DESC);

COMMENT ON TABLE public.finny_recurring_analysis IS 'Stores Finny LLM analysis of recurring transactions from last 4 months of transaction data';
COMMENT ON COLUMN public.finny_recurring_analysis.item_id IS 'Plaid item_id; null means analysis covered all connected accounts';
COMMENT ON COLUMN public.finny_recurring_analysis.trigger_source IS 'new_account = ran on account connect, manual = user clicked button';

-- RLS
ALTER TABLE public.finny_recurring_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own recurring analysis" ON public.finny_recurring_analysis;
CREATE POLICY "Users can read own recurring analysis"
  ON public.finny_recurring_analysis FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own recurring analysis" ON public.finny_recurring_analysis;
CREATE POLICY "Users can insert own recurring analysis"
  ON public.finny_recurring_analysis FOR INSERT
  WITH CHECK (user_id = auth.uid());
