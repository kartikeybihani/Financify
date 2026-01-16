-- RLS Policies for RPC Functions
-- These policies ensure authenticated users can only access their own data
-- Run this FIRST before the fix script

-- ============================================
-- Enable RLS on all relevant tables
-- ============================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_options ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Drop existing policies if they exist (to avoid conflicts)
-- ============================================
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can view their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can view their own budget periods" ON public.budget_periods;
DROP POLICY IF EXISTS "Users can view their own budget entries" ON public.budget_entries;
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can view their own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can view their own recurring streams" ON public.recurring_streams;
DROP POLICY IF EXISTS "Users can view their own user items" ON public.user_items;
DROP POLICY IF EXISTS "Users can view their own investment holdings" ON public.investment_holdings;
DROP POLICY IF EXISTS "Users can view their own investment balances" ON public.investment_balances;
DROP POLICY IF EXISTS "Users can view their own investment options" ON public.investment_options;

-- ============================================
-- Accounts: Users can only access accounts via their user_items
-- ============================================
CREATE POLICY "Users can view their own accounts"
  ON public.accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_items ui
      WHERE ui.item_id = accounts.item_id
      AND ui.user_id = auth.uid()
    )
  );

-- ============================================
-- Transactions: Users can only access their own transactions
-- ============================================
CREATE POLICY "Users can view their own transactions"
  ON public.transactions
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Goals: Users can only access their own goals
-- ============================================
CREATE POLICY "Users can view their own goals"
  ON public.goals
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Budget Periods: Users can only access their own budget periods
-- ============================================
CREATE POLICY "Users can view their own budget periods"
  ON public.budget_periods
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Budget Entries: Users can only access entries for their own budget periods
-- ============================================
CREATE POLICY "Users can view their own budget entries"
  ON public.budget_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_periods bp
      WHERE bp.id = budget_entries.budget_period_id
      AND bp.user_id = auth.uid()
    )
  );

-- ============================================
-- Categories: Users can view their own categories and default categories (user_id IS NULL)
-- ============================================
CREATE POLICY "Users can view their own categories"
  ON public.categories
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- ============================================
-- Cash Entries: Users can only access their own cash entries
-- ============================================
CREATE POLICY "Users can view their own cash entries"
  ON public.cash_entries
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Recurring Streams: Users can only access their own recurring streams
-- ============================================
CREATE POLICY "Users can view their own recurring streams"
  ON public.recurring_streams
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- User Items: Users can only access their own user items
-- ============================================
CREATE POLICY "Users can view their own user items"
  ON public.user_items
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Investment Holdings: Users can only access their own investment holdings
-- ============================================
CREATE POLICY "Users can view their own investment holdings"
  ON public.investment_holdings
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Investment Balances: Users can only access their own investment balances
-- ============================================
CREATE POLICY "Users can view their own investment balances"
  ON public.investment_balances
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Investment Options: Users can only access their own investment options
-- ============================================
CREATE POLICY "Users can view their own investment options"
  ON public.investment_options
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- Verify RLS is enabled
-- ============================================
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'accounts',
    'transactions',
    'goals',
    'budget_periods',
    'budget_entries',
    'categories',
    'cash_entries',
    'recurring_streams',
    'user_items',
    'investment_holdings',
    'investment_balances',
    'investment_options'
  )
ORDER BY tablename;
