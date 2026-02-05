-- Add debugging columns to sync_logs for better observability after Supabase cron migration.
-- Run this migration before deploying the updated scheduled-sync.js code.

-- status: overall outcome of the run
ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'success'
  CHECK (status IN ('success', 'failure', 'partial'));

-- trigger_source: who triggered the run (Supabase pg_cron vs Vercel Cron)
ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS trigger_source text
  CHECK (trigger_source IS NULL OR trigger_source IN ('supabase_cron', 'vercel_cron'));

-- duration_ms: how long the run took (for performance debugging)
ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS duration_ms integer;

-- error_summary: short message for failures (e.g. exception message)
ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS error_summary text;

-- Backfill trigger_source for existing rows (infer from sync_type)
UPDATE public.sync_logs
SET trigger_source = CASE
  WHEN sync_type = 'plaid_transactions' THEN 'supabase_cron'
  ELSE 'vercel_cron'
END
WHERE trigger_source IS NULL;

-- Index for common queries (Supabase Plaid runs, failures)
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type_started_at
  ON public.sync_logs(sync_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_status
  ON public.sync_logs(status)
  WHERE status != 'success';
