-- 1) Create biggest_mover_runs table for DB logging of cron job results
CREATE TABLE IF NOT EXISTS public.biggest_mover_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  holdings_updated integer NOT NULL DEFAULT 0,
  triggers_created integer NOT NULL DEFAULT 0,
  users_sent integer NOT NULL DEFAULT 0,
  total_sent integer NOT NULL DEFAULT 0,
  total_failed integer NOT NULL DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failure')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT biggest_mover_runs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_biggest_mover_runs_started_at
  ON public.biggest_mover_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_biggest_mover_runs_status
  ON public.biggest_mover_runs(status);

-- Enable RLS (read-only for authenticated, service role can insert)
ALTER TABLE public.biggest_mover_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to biggest_mover_runs"
  ON public.biggest_mover_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2) Fix cron: switch from http_post to http_get (API expects GET for biggest_mover)
-- Unschedule the existing job (uses POST, which never hit the correct handler)
SELECT cron.unschedule('biggest-mover-4pm-et');

-- Schedule with http_get so the API receives GET and processes biggest_mover
SELECT cron.schedule(
  'biggest-mover-4pm-et',
  '0 21 * * 1-5',
  $$
  SELECT net.http_get(
    url := 'https://financify-rose.vercel.app/api/refresh_financial_data',
    params := '{"mode": "biggest_mover"}'::jsonb,
    headers := jsonb_build_object(
      'x-cron-secret', 'rkguhwrgouwrghwrugorlwbv42972f'
    )
  ) AS request_id;
  $$
);
