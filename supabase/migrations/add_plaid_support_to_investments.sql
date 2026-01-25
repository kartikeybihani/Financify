-- Migration: Add Plaid support to investment_holdings and investment_balances tables
-- This allows both Plaid and SnapTrade investment accounts to be stored in the same tables

-- Step 1: Add provider column and new fields to investment_holdings
ALTER TABLE public.investment_holdings
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS item_id text, -- Plaid item_id
  ADD COLUMN IF NOT EXISTS plaid_account_id text, -- Plaid account_id (different from SnapTrade account_id)
  ADD COLUMN IF NOT EXISTS security_id text, -- Plaid security_id (instead of symbol_id for Plaid)
  ADD COLUMN IF NOT EXISTS sector text, -- From Plaid securities
  ADD COLUMN IF NOT EXISTS industry text; -- From Plaid securities

-- Step 2: Make SnapTrade-specific fields nullable
ALTER TABLE public.investment_holdings
  ALTER COLUMN snaptrade_user_id DROP NOT NULL,
  ALTER COLUMN symbol_id DROP NOT NULL,
  ALTER COLUMN symbol DROP NOT NULL;

-- Step 3: Add provider column and new fields to investment_balances
ALTER TABLE public.investment_balances
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS item_id text, -- Plaid item_id
  ADD COLUMN IF NOT EXISTS plaid_account_id text; -- Plaid account_id

-- Step 4: Make SnapTrade-specific fields nullable in investment_balances
ALTER TABLE public.investment_balances
  ALTER COLUMN snaptrade_user_id DROP NOT NULL;

-- Step 5: Drop old foreign key constraints (they're too restrictive)
ALTER TABLE public.investment_holdings
  DROP CONSTRAINT IF EXISTS fk_ih_pair;

ALTER TABLE public.investment_balances
  DROP CONSTRAINT IF EXISTS fk_ib_pair;

-- Step 6: Add conditional foreign key for SnapTrade (only when provider = 'snaptrade')
-- Note: PostgreSQL doesn't support conditional foreign keys directly, so we'll use triggers or application-level validation
-- For now, we'll rely on application logic to ensure data integrity

-- Step 7: Create unique constraints for both providers
-- For SnapTrade: (user_id, snaptrade_user_id, account_id, symbol_id)
-- For Plaid: (user_id, item_id, plaid_account_id, security_id)

-- Drop existing unique constraints if they exist
ALTER TABLE public.investment_holdings
  DROP CONSTRAINT IF EXISTS investment_holdings_unique_snaptrade;

ALTER TABLE public.investment_holdings
  DROP CONSTRAINT IF EXISTS investment_holdings_unique_plaid;

-- Add unique constraint for SnapTrade (using partial unique index since we can't have conditional constraints)
CREATE UNIQUE INDEX IF NOT EXISTS investment_holdings_unique_snaptrade
  ON public.investment_holdings(user_id, snaptrade_user_id, account_id, symbol_id)
  WHERE provider = 'snaptrade' AND snaptrade_user_id IS NOT NULL AND symbol_id IS NOT NULL;

-- Add unique constraint for Plaid (using partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS investment_holdings_unique_plaid
  ON public.investment_holdings(user_id, item_id, plaid_account_id, security_id)
  WHERE provider = 'plaid' AND item_id IS NOT NULL AND plaid_account_id IS NOT NULL AND security_id IS NOT NULL;

-- Step 8: Update investment_balances unique constraints
ALTER TABLE public.investment_balances
  DROP CONSTRAINT IF EXISTS investment_balances_unique_snaptrade;

ALTER TABLE public.investment_balances
  DROP CONSTRAINT IF EXISTS investment_balances_unique_plaid;

-- Add unique constraint for SnapTrade balances (using partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS investment_balances_unique_snaptrade
  ON public.investment_balances(user_id, snaptrade_user_id, account_id, currency_code)
  WHERE provider = 'snaptrade' AND snaptrade_user_id IS NOT NULL;

-- Add unique constraint for Plaid balances (using partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS investment_balances_unique_plaid
  ON public.investment_balances(user_id, item_id, plaid_account_id, currency_code)
  WHERE provider = 'plaid' AND item_id IS NOT NULL AND plaid_account_id IS NOT NULL;

-- Step 9: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_investment_holdings_provider_user
  ON public.investment_holdings(user_id, provider, is_active);

CREATE INDEX IF NOT EXISTS idx_investment_holdings_plaid
  ON public.investment_holdings(user_id, item_id, plaid_account_id)
  WHERE provider = 'plaid';

CREATE INDEX IF NOT EXISTS idx_investment_balances_provider_user
  ON public.investment_balances(user_id, provider, is_current);

CREATE INDEX IF NOT EXISTS idx_investment_balances_plaid
  ON public.investment_balances(user_id, item_id, plaid_account_id)
  WHERE provider = 'plaid';

-- Step 10: Set default provider for existing SnapTrade records
UPDATE public.investment_holdings
  SET provider = 'snaptrade'
  WHERE provider IS NULL AND snaptrade_user_id IS NOT NULL;

UPDATE public.investment_balances
  SET provider = 'snaptrade'
  WHERE provider IS NULL AND snaptrade_user_id IS NOT NULL;

-- Step 11: Add check constraints to ensure provider-specific fields are set correctly
-- Drop existing constraints if they exist (in case migration was partially run)
ALTER TABLE public.investment_holdings
  DROP CONSTRAINT IF EXISTS investment_holdings_provider_check;

ALTER TABLE public.investment_balances
  DROP CONSTRAINT IF EXISTS investment_balances_provider_check;

-- Add comprehensive check constraint for investment_holdings
ALTER TABLE public.investment_holdings
  ADD CONSTRAINT investment_holdings_provider_check CHECK (
    (provider = 'snaptrade' AND snaptrade_user_id IS NOT NULL AND symbol_id IS NOT NULL AND symbol IS NOT NULL) OR
    (provider = 'plaid' AND item_id IS NOT NULL AND plaid_account_id IS NOT NULL AND security_id IS NOT NULL)
  );

-- Add comprehensive check constraint for investment_balances
ALTER TABLE public.investment_balances
  ADD CONSTRAINT investment_balances_provider_check CHECK (
    (provider = 'snaptrade' AND snaptrade_user_id IS NOT NULL) OR
    (provider = 'plaid' AND item_id IS NOT NULL AND plaid_account_id IS NOT NULL)
  );

-- Step 12: Add comments for documentation
COMMENT ON COLUMN public.investment_holdings.provider IS 'Provider type: plaid or snaptrade';
COMMENT ON COLUMN public.investment_holdings.item_id IS 'Plaid item_id (for Plaid accounts)';
COMMENT ON COLUMN public.investment_holdings.plaid_account_id IS 'Plaid account_id (for Plaid accounts)';
COMMENT ON COLUMN public.investment_holdings.security_id IS 'Plaid security_id (for Plaid accounts, equivalent to symbol_id for SnapTrade)';
COMMENT ON COLUMN public.investment_balances.provider IS 'Provider type: plaid or snaptrade';
COMMENT ON COLUMN public.investment_balances.item_id IS 'Plaid item_id (for Plaid accounts)';
COMMENT ON COLUMN public.investment_balances.plaid_account_id IS 'Plaid account_id (for Plaid accounts)';
