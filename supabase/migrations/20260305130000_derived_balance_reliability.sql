-- Derived balance reliability hardening
-- - deterministic/idempotent derived balance runs
-- - cursor guards
-- - Plaid anchor snapshots
-- - per-item sync disable controls
-- - transactions.updated_at maintenance

-- 1) Anchor snapshots from paid Plaid balance pulls
CREATE TABLE IF NOT EXISTS public.account_balance_anchors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  account_id text NOT NULL,
  account_type text,
  account_subtype text,
  anchor_current numeric,
  anchor_available numeric,
  anchor_limit numeric,
  anchored_at timestamp with time zone NOT NULL,
  anchor_source text NOT NULL CHECK (
    anchor_source IN ('plaid_weekly', 'plaid_manual', 'plaid_connect')
  ),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT account_balance_anchors_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_balance_anchors_account_anchored
  ON public.account_balance_anchors(account_id, anchored_at);

CREATE INDEX IF NOT EXISTS idx_account_balance_anchors_item_created
  ON public.account_balance_anchors(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_balance_anchors_user_created
  ON public.account_balance_anchors(user_id, created_at DESC);

-- 2) Per-account derived application logs
CREATE TABLE IF NOT EXISTS public.derived_balance_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  item_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  cursor_start text,
  cursor_end text NOT NULL,
  posted_delta_current numeric NOT NULL DEFAULT 0,
  posted_delta_available numeric NOT NULL DEFAULT 0,
  pending_delta_available numeric NOT NULL DEFAULT 0,
  prev_current numeric,
  prev_available numeric,
  new_current numeric,
  new_available numeric,
  status text NOT NULL CHECK (status IN ('applied', 'skipped', 'error')),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT derived_balance_runs_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_derived_runs_item_cursor_account_status
  ON public.derived_balance_runs(item_id, cursor_end, account_id, status);

CREATE INDEX IF NOT EXISTS idx_derived_runs_item_created
  ON public.derived_balance_runs(item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_derived_runs_account_created
  ON public.derived_balance_runs(account_id, created_at DESC);

-- 3) Idempotency guard by item + cursor_end
CREATE TABLE IF NOT EXISTS public.sync_cursor_guards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id text NOT NULL,
  cursor_end text NOT NULL,
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sync_cursor_guards_pkey PRIMARY KEY (id),
  CONSTRAINT sync_cursor_guards_item_cursor_unique UNIQUE (item_id, cursor_end)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursor_guards_item_applied
  ON public.sync_cursor_guards(item_id, applied_at DESC);

-- 4) Scheduled-sync control flags on user_items
ALTER TABLE public.user_items
  ADD COLUMN IF NOT EXISTS sync_enabled boolean;

ALTER TABLE public.user_items
  ADD COLUMN IF NOT EXISTS sync_disabled_reason text;

ALTER TABLE public.user_items
  ADD COLUMN IF NOT EXISTS sync_disabled_at timestamp with time zone;

UPDATE public.user_items
SET sync_enabled = true
WHERE sync_enabled IS NULL;

ALTER TABLE public.user_items
  ALTER COLUMN sync_enabled SET DEFAULT true;

ALTER TABLE public.user_items
  ALTER COLUMN sync_enabled SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_items_sync_enabled
  ON public.user_items(sync_enabled);

-- 5) transactions.updated_at maintained on updates/upserts
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

UPDATE public.transactions
SET updated_at = COALESCE(updated_at, inserted_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.transactions
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_transactions_updated_at();
