-- SnapTrade Investments Schema
-- Execute these commands in your Supabase SQL editor

-- 1. SnapTrade Connections Table (similar to user_items for Plaid)
CREATE TABLE public.snaptrade_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snaptrade_user_id text NOT NULL, -- SnapTrade's user ID
  account_id text NOT NULL, -- SnapTrade's account UUID
  connection_id text, -- SnapTrade's connection ID
  brokerage_name text,
  account_name text,
  account_type text,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_secret_id uuid, -- Reference to Vault secret
  CONSTRAINT snaptrade_connections_pkey PRIMARY KEY (id),
  CONSTRAINT snaptrade_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT snaptrade_connections_unique_account UNIQUE (snaptrade_user_id, account_id)
);

-- 2. Investment Holdings Table (regular positions)
CREATE TABLE public.investment_holdings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snaptrade_user_id text NOT NULL,
  account_id text NOT NULL,
  symbol_id text NOT NULL, -- SnapTrade's symbol UUID
  symbol text NOT NULL, -- Trading symbol (e.g., AAPL)
  raw_symbol text, -- Symbol without exchange suffix
  description text,
  currency_code text NOT NULL DEFAULT 'USD',
  exchange_code text,
  exchange_name text,
  security_type text, -- e.g., 'Common Stock', 'ETF'
  units numeric NOT NULL DEFAULT 0, -- Number of shares/units
  price numeric, -- Current market price per share
  market_value numeric, -- Total market value (units * price)
  average_purchase_price numeric, -- Cost basis per share
  total_cost_basis numeric, -- Total cost basis (units * average_purchase_price)
  unrealized_pl numeric, -- Unrealized profit/loss
  realized_pl numeric DEFAULT 0, -- Realized profit/loss
  day_change numeric, -- Daily change in value
  day_change_percent numeric, -- Daily change percentage
  is_active boolean NOT NULL DEFAULT true,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT investment_holdings_pkey PRIMARY KEY (id),
  CONSTRAINT investment_holdings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT investment_holdings_connection_fkey FOREIGN KEY (snaptrade_user_id, account_id) 
    REFERENCES public.snaptrade_connections(snaptrade_user_id, account_id) ON DELETE CASCADE,
  CONSTRAINT investment_holdings_unique_position UNIQUE (snaptrade_user_id, account_id, symbol_id)
);

-- 3. Investment Options Table (option positions)
CREATE TABLE public.investment_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snaptrade_user_id text NOT NULL,
  account_id text NOT NULL,
  option_symbol_id text NOT NULL, -- SnapTrade's option symbol UUID
  ticker text NOT NULL, -- OCC symbol for the option
  option_type text NOT NULL CHECK (option_type IN ('CALL', 'PUT')),
  strike_price numeric NOT NULL,
  expiration_date date NOT NULL,
  is_mini_option boolean NOT NULL DEFAULT false,
  underlying_symbol_id text NOT NULL, -- SnapTrade's underlying symbol UUID
  underlying_symbol text NOT NULL, -- Underlying stock symbol (e.g., AAPL)
  underlying_description text,
  underlying_currency_code text NOT NULL DEFAULT 'USD',
  underlying_exchange_code text,
  underlying_security_type text,
  units numeric NOT NULL DEFAULT 0, -- Number of contracts (positive = long, negative = short)
  price numeric, -- Current market price per contract
  market_value numeric, -- Total market value (units * price * 100)
  average_purchase_price numeric, -- Cost basis per contract
  total_cost_basis numeric, -- Total cost basis (units * average_purchase_price * 100)
  unrealized_pl numeric, -- Unrealized profit/loss
  realized_pl numeric DEFAULT 0, -- Realized profit/loss
  day_change numeric, -- Daily change in value
  day_change_percent numeric, -- Daily change percentage
  is_active boolean NOT NULL DEFAULT true,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT investment_options_pkey PRIMARY KEY (id),
  CONSTRAINT investment_options_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT investment_options_connection_fkey FOREIGN KEY (snaptrade_user_id, account_id) 
    REFERENCES public.snaptrade_connections(snaptrade_user_id, account_id) ON DELETE CASCADE,
  CONSTRAINT investment_options_unique_position UNIQUE (snaptrade_user_id, account_id, option_symbol_id)
);

-- 4. Investment Balances Table
CREATE TABLE public.investment_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snaptrade_user_id text NOT NULL,
  account_id text NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD',
  cash numeric DEFAULT 0, -- Cash balance
  buying_power numeric DEFAULT 0, -- Available buying power
  total_equity numeric DEFAULT 0, -- Total account equity
  total_margin_used numeric DEFAULT 0, -- Margin used
  total_margin_available numeric DEFAULT 0, -- Available margin
  is_current boolean NOT NULL DEFAULT true, -- Mark the most recent balance
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT investment_balances_pkey PRIMARY KEY (id),
  CONSTRAINT investment_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT investment_balances_connection_fkey FOREIGN KEY (snaptrade_user_id, account_id) 
    REFERENCES public.snaptrade_connections(snaptrade_user_id, account_id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_snaptrade_connections_user_id ON public.snaptrade_connections(user_id);
CREATE INDEX idx_snaptrade_connections_account ON public.snaptrade_connections(snaptrade_user_id, account_id);
CREATE INDEX idx_investment_holdings_user_account ON public.investment_holdings(user_id, snaptrade_user_id, account_id);
CREATE INDEX idx_investment_holdings_symbol ON public.investment_holdings(symbol);
CREATE INDEX idx_investment_options_user_account ON public.investment_options(user_id, snaptrade_user_id, account_id);
CREATE INDEX idx_investment_options_underlying ON public.investment_options(underlying_symbol);
CREATE INDEX idx_investment_options_expiration ON public.investment_options(expiration_date);
CREATE INDEX idx_investment_balances_user_account ON public.investment_balances(user_id, snaptrade_user_id, account_id);
CREATE INDEX idx_investment_balances_current ON public.investment_balances(snaptrade_user_id, account_id, is_current) WHERE is_current = true;

-- Add updated_at trigger for snaptrade_connections
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_snaptrade_connections_updated_at 
    BEFORE UPDATE ON public.snaptrade_connections 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
