-- Allow Finny streams in recurring_streams (item_id/account_id null, source='finny')
-- Plaid refresh only updates .eq("item_id", itemId) so Finny rows (item_id null) are untouched

ALTER TABLE public.recurring_streams
  ALTER COLUMN item_id DROP NOT NULL,
  ALTER COLUMN account_id DROP NOT NULL;

ALTER TABLE public.recurring_streams
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'plaid'
  CHECK (source IN ('plaid', 'finny'));

COMMENT ON COLUMN public.recurring_streams.source IS 'plaid = from Plaid API; finny = from Finny LLM analysis';
