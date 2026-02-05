-- Plaid transaction sync: run every 2 hours via Supabase pg_cron.
-- Calls Vercel API with mode=plaid_transactions (Plaid only; SnapTrade stays in Vercel).
-- Requires: SCHEDULED_SYNC_CRON_SECRET or BIGGEST_MOVER_CRON_SECRET set in Vercel (same value as x-cron-secret below).

SELECT cron.schedule(
  'plaid-transaction-sync-every-2h',
  '0 */2 * * *',
  $$
  SELECT net.http_get(
    url := 'https://financify-rose.vercel.app/api/scheduled-sync',
    params := '{"mode": "plaid_transactions"}'::jsonb,
    headers := jsonb_build_object(
      'x-cron-secret', 'rkguhwrgouwrghwrugorlwbv42972f'
    )
  ) AS request_id;
  $$
);
