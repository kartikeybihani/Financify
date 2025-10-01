-- Time-aware Spending RPCs
-- These functions provide summarized spending views by date ranges and months.
-- Assumptions: expenses have amount > 0; income has amount < 0.

-- get_spend_summary
-- Returns total spend and transaction count for a user in a date range
create or replace function public.get_spend_summary(
  p_user_id uuid,
  p_start date,
  p_end date
)
returns table (
  total_spend numeric,
  txn_count integer
) language sql security definer set search_path = public as $$
  select
    coalesce(sum(case when t.amount > 0 then t.amount else 0 end), 0) as total_spend,
    count(*) filter (where t.amount > 0) as txn_count
  from public.transactions t
  where t.user_id = p_user_id
    and t.date >= p_start
    and t.date <= p_end;
$$;

comment on function public.get_spend_summary(uuid, date, date)
  is 'Total spend and expense transaction count for a user between p_start and p_end (inclusive).';


-- get_spend_by_month
-- Returns monthly spend totals for the last p_months (including current month)
create or replace function public.get_spend_by_month(
  p_user_id uuid,
  p_months integer default 3
)
returns table (
  month date,
  total_spend numeric,
  txn_count integer
) language sql security definer set search_path = public as $$
  with window_start as (
    select (date_trunc('month', current_date) - ((greatest(p_months,1) - 1) || ' months')::interval)::date as start_date
  )
  select
    date_trunc('month', t.date)::date as month,
    coalesce(sum(case when t.amount > 0 then t.amount else 0 end), 0) as total_spend,
    count(*) filter (where t.amount > 0) as txn_count
  from public.transactions t
  cross join window_start ws
  where t.user_id = p_user_id
    and t.date >= ws.start_date
  group by 1
  order by 1 desc;
$$;

comment on function public.get_spend_by_month(uuid, integer)
  is 'Monthly spend totals for the last p_months months (amount > 0 considered expense).';


-- get_spend_by_category_periods
-- Returns per-category monthly spend for the last p_months
create or replace function public.get_spend_by_category_periods(
  p_user_id uuid,
  p_months integer default 3
)
returns table (
  month date,
  category text,
  total_spend numeric,
  txn_count integer
) language sql security definer set search_path = public as $$
  with window_start as (
    select (date_trunc('month', current_date) - ((greatest(p_months,1) - 1) || ' months')::interval)::date as start_date
  )
  select
    date_trunc('month', t.date)::date as month,
    coalesce(nullif(trim(coalesce(t.new_category, t.category)), ''), 'uncategorized') as category,
    coalesce(sum(case when t.amount > 0 then t.amount else 0 end), 0) as total_spend,
    count(*) filter (where t.amount > 0) as txn_count
  from public.transactions t
  cross join window_start ws
  where t.user_id = p_user_id
    and t.date >= ws.start_date
  group by 1, 2
  order by 1 desc, 3 desc;
$$;

comment on function public.get_spend_by_category_periods(uuid, integer)
  is 'Per-category monthly spend for the last p_months months (amount > 0 considered expense).';


-- Cleanup: drop legacy/unused RPCs if present
-- Note: Only drops functions marked UNUSED in manual_functions.txt
drop function if exists public.apply_transaction_override(uuid, uuid, uuid, uuid);
drop function if exists public.create_category_rule(uuid, text, uuid, uuid, boolean);
drop function if exists public.get_category_tree();
drop function if exists public.get_mapped_sub_category(text);
drop function if exists public.get_mapped_top_category(text);
drop function if exists public.get_spend_by_category_effective(uuid, date, date);


