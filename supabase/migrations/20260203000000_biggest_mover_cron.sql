-- Biggest mover notification: run weekdays at 4PM ET (21:00 UTC).
-- Requires: pg_cron and pg_net extensions enabled (enable in Dashboard → Database → Extensions if needed).
-- Before running: replace YOUR_VERCEL_DOMAIN and YOUR_CRON_SECRET with your values.
-- The same secret must be set in Vercel as BIGGEST_MOVER_CRON_SECRET.

-- Enable extensions (idempotent; skip if already enabled)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schedule: Mon–Fri at 21:00 UTC (4PM ET in EST; in EDT it will be 5PM ET)
select cron.schedule(
  'biggest-mover-4pm-et',
  '0 21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://financify-rose.vercel.app/api/refresh_financial_data?mode=biggest_mover',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'rkguhwrgouwrghwrugorlwbv42972f'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
