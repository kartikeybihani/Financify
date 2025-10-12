-- Onboarding analytics table and RPCs for Supabase
-- Run this in Supabase SQL editor.

-- 1) Table: onboarding_events
create table if not exists public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null,
  action text not null,
  duration_ms integer,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.onboarding_events enable row level security;

-- Policies: users can insert/select their own events only
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='onboarding_events' and policyname='onboarding_events_select_own'
  ) then
    create policy onboarding_events_select_own on public.onboarding_events
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='onboarding_events' and policyname='onboarding_events_insert_own'
  ) then
    create policy onboarding_events_insert_own on public.onboarding_events
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- Helpful indexes
create index if not exists idx_onboarding_events_user_created_at on public.onboarding_events(user_id, created_at desc);

-- 2) RPC: log_onboarding_event
-- Use auth.uid() server-side to avoid passing user_id from client.
create or replace function public.log_onboarding_event(
  p_stage text,
  p_action text,
  p_duration_ms integer default null,
  p_error_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security definer
as $$
  insert into public.onboarding_events(user_id, stage, action, duration_ms, error_code, metadata)
  values (auth.uid(), p_stage, p_action, p_duration_ms, p_error_code, coalesce(p_metadata, '{}'::jsonb))
  returning id;
$$;

grant execute on function public.log_onboarding_event(text, text, integer, text, jsonb) to anon, authenticated;

-- 3) Optional performance indexes referenced by onboarding insights (safe if already exist)
create index if not exists idx_transactions_user_date on public.transactions(user_id, date);
create index if not exists idx_recurring_streams_user on public.recurring_streams(user_id);
create index if not exists idx_user_items_user on public.user_items(user_id);


