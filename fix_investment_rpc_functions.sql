-- Fix Investment RPC Functions
-- This script drops existing functions first, then recreates them with updated signatures

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS get_investment_portfolio_summary(uuid);
DROP FUNCTION IF EXISTS get_investment_holdings_detailed(uuid);
DROP FUNCTION IF EXISTS get_investment_balances_summary(uuid);
DROP FUNCTION IF EXISTS get_investment_connections(uuid);

-- 1. Get Investment Portfolio Summary with total_value
CREATE OR REPLACE FUNCTION get_investment_portfolio_summary(p_user_id uuid)
RETURNS TABLE(
  total_portfolio_value numeric,
  total_cash numeric,
  total_investments numeric,
  day_change numeric,
  day_change_percent numeric,
  total_change numeric,
  total_change_percent numeric,
  last_updated timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(ib.total_value, 0) as total_portfolio_value,
    COALESCE(ib.cash, 0) as total_cash,
    COALESCE(ib.total_value - ib.cash, 0) as total_investments,
    COALESCE(ib.day_change, 0) as day_change,
    COALESCE(ib.day_change_percent, 0) as day_change_percent,
    COALESCE(ib.total_change, 0) as total_change,
    COALESCE(ib.total_change_percent, 0) as total_change_percent,
    ib.last_updated
  FROM investment_balances ib
  WHERE ib.user_id = p_user_id 
    AND ib.is_current = true
  ORDER BY ib.last_updated DESC
  LIMIT 1;
END;
$$;

-- 2. Get Investment Holdings with Performance Data
CREATE OR REPLACE FUNCTION get_investment_holdings_detailed(p_user_id uuid)
RETURNS TABLE(
  symbol text,
  description text,
  units numeric,
  price numeric,
  market_value numeric,
  unrealized_pl numeric,
  day_change numeric,
  day_change_percent numeric,
  security_type text,
  last_updated timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ih.symbol,
    ih.description,
    ih.units,
    ih.price,
    ih.market_value,
    ih.unrealized_pl,
    ih.day_change,
    ih.day_change_percent,
    ih.security_type,
    ih.last_updated
  FROM investment_holdings ih
  WHERE ih.user_id = p_user_id 
    AND ih.is_active = true
  ORDER BY ih.market_value DESC;
END;
$$;

-- 3. Get Investment Balances with total_value
CREATE OR REPLACE FUNCTION get_investment_balances_summary(p_user_id uuid)
RETURNS TABLE(
  cash numeric,
  buying_power numeric,
  total_value numeric,
  day_change numeric,
  day_change_percent numeric,
  total_change numeric,
  total_change_percent numeric,
  currency_code text,
  last_updated timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ib.cash,
    ib.buying_power,
    ib.total_value,
    ib.day_change,
    ib.day_change_percent,
    ib.total_change,
    ib.total_change_percent,
    ib.currency_code,
    ib.last_updated
  FROM investment_balances ib
  WHERE ib.user_id = p_user_id 
    AND ib.is_current = true
  ORDER BY ib.last_updated DESC;
END;
$$;

-- 4. Get Investment Connections
CREATE OR REPLACE FUNCTION get_investment_connections(p_user_id uuid)
RETURNS TABLE(
  account_id text,
  brokerage_name text,
  account_name text,
  account_type text,
  is_active boolean,
  last_synced_at timestamp with time zone,
  connection_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.account_id,
    sc.brokerage_name,
    sc.account_name,
    sc.account_type,
    sc.is_active,
    sc.last_synced_at,
    sc.connection_status
  FROM snaptrade_connections sc
  WHERE sc.user_id = p_user_id 
    AND sc.is_active = true
  ORDER BY sc.last_synced_at DESC;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_investment_portfolio_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_investment_holdings_detailed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_investment_balances_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_investment_connections(uuid) TO authenticated;
