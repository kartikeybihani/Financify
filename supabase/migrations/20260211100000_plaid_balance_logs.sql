-- Plaid balance sync logs for debugging wrong-balance reports.
-- Written by store_accounts.js on every account connect; query by user_id/item_id when investigating.
-- Service role (API) bypasses RLS. No other policies = internal-only.

CREATE TABLE IF NOT EXISTS public.plaid_balance_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_id text NOT NULL,
  account_id text NOT NULL,
  account_type text NOT NULL,
  account_name text,
  account_mask text,
  event_type text NOT NULL DEFAULT 'store_accounts_connect'
    CHECK (event_type IN ('store_accounts_connect', 'store_accounts_investment_update')),
  plaid_api text
    CHECK (plaid_api IS NULL OR plaid_api IN ('accountsBalanceGet', 'accountsGet')),
  plaid_current numeric,
  plaid_available numeric,
  stored_current numeric,
  stored_available numeric,
  total_value numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT plaid_balance_logs_pkey PRIMARY KEY (id)
);

ALTER TABLE public.plaid_balance_logs ENABLE ROW LEVEL SECURITY;

-- Indexes for common debug queries
CREATE INDEX IF NOT EXISTS idx_plaid_balance_logs_user_created
  ON public.plaid_balance_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plaid_balance_logs_item_created
  ON public.plaid_balance_logs(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plaid_balance_logs_account_created
  ON public.plaid_balance_logs(account_id, created_at DESC);

-- Allow service role (API) to insert; no SELECT policy for regular users.
-- Service role bypasses RLS, so API writes succeed. Users cannot read.

COMMENT ON TABLE public.plaid_balance_logs IS 'Logs Plaid raw vs stored balances for debugging wrong-balance reports';
