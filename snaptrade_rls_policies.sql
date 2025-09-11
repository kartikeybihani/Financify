-- SnapTrade RLS Policies
-- Execute these commands in your Supabase SQL editor after creating the tables

-- Enable RLS on all SnapTrade tables
ALTER TABLE public.snaptrade_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_balances ENABLE ROW LEVEL SECURITY;

-- snaptrade_connections policies
CREATE POLICY "Users can view their own snaptrade connections" ON public.snaptrade_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own snaptrade connections" ON public.snaptrade_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own snaptrade connections" ON public.snaptrade_connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own snaptrade connections" ON public.snaptrade_connections
  FOR DELETE USING (auth.uid() = user_id);

-- investment_holdings policies
CREATE POLICY "Users can view their own investment holdings" ON public.investment_holdings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own investment holdings" ON public.investment_holdings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own investment holdings" ON public.investment_holdings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own investment holdings" ON public.investment_holdings
  FOR DELETE USING (auth.uid() = user_id);

-- investment_options policies
CREATE POLICY "Users can view their own investment options" ON public.investment_options
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own investment options" ON public.investment_options
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own investment options" ON public.investment_options
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own investment options" ON public.investment_options
  FOR DELETE USING (auth.uid() = user_id);

-- investment_balances policies
CREATE POLICY "Users can view their own investment balances" ON public.investment_balances
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own investment balances" ON public.investment_balances
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own investment balances" ON public.investment_balances
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own investment balances" ON public.investment_balances
  FOR DELETE USING (auth.uid() = user_id);
