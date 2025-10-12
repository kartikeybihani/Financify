<!-- 3e6f442b-b6a7-4df1-85a6-23ec7b101661 23c5fcf3-9b90-4c37-a428-d5a293b2fad3 -->
# Financify Gen Z Onboarding Build Plan

## Scope

Implement 4-step onboarding: Welcome/Auth → Chat-style Questions → Plaid Connect → Immediate Insights (+mascot). Add resume-by-stage, minimal trust UX, optional multi-account add, analytics, and copy.

## Flow (routes)

1. `/(onboarding)/welcome` → Auth (Apple + Email; Google later) + progress (1/4)
2. `/(onboarding)/intent` → Chat micro-questions A (mindset, stress, $1k) + progress (2/4)
3. `/(onboarding)/aboutyou` (NEW) → Chat micro-questions B (occupation, name confirm, age confirm) + progress (3/4)
4. `/(onboarding)/accountconnection` → Plaid connect (trust panel, optional “Add another”) + progress (3/4 → 4/4)
5. `/(onboarding)/final` → 3 immediate insights + mascot + CTAs (goal first, explore insights)

## App changes

- Routing/guards: In `/(onboarding)/_layout.tsx` or shared auth gate, read `auth.user.user_metadata.onboarding_stage` and redirect to next step. Update stage after each screen.
- Welcome: Replace “Let’s Begin” with direct Auth. Show concise value prop + tiny trust line. Keep Apple + Email now; leave TODO stub for Google.
- Chat Qs A (`intent.tsx`): Convert to chat-card style chips. Persist answers immediately via `supabase.auth.updateUser` keys: `money_mindset`, `stress_level`, `emergency_readiness`. Skippable.
- Chat Qs B (`aboutyou.tsx` NEW): Chips for `occupation`; confirm `age` if missing; single text for `first_name`. Persist immediately.
- Plaid (`accountconnection.tsx`): Add compact trust panel, silent link token refresh on `INVALID_LINK_TOKEN`, success screen with primary “Continue” and secondary “Add another account”. Set `has_connected_bank=true`, `accounts_count>=1`.
- Final (`final.tsx`): Replace carousel with 3 fast cards. Use RPCs: `get_spend_by_category` (top category 30d), `get_recurring_streams_active` (subs total), `get_cashflow_monthly` (runway estimate). Keep mascot image + subtle motion. Primary CTA “Set your first goal”, secondary “See all insights”, tertiary link “Add another account”. Set `onboarding_complete=true`.
- Resume logic: Save `onboarding_stage` after each screen: `welcome`, `q1`, `q2`, `plaid_connected`, `final`, `complete`.
- Metrics: Fire lightweight event logs (local API) for step views/completions with duration and Plaid outcomes.

## Copy (concise)

- Welcome: “Real advice needs real data. ~90s. See insights right after.”
- Plaid trust: “Used by Venmo, Robinhood • Read-only • Encrypted”
- Post-Plaid: “Connected 1 account. Add more now or later—your call.”
- Final: “Here’s what jumps out already.”

## DB/Supabase

- Use `auth.users.metadata` for onboarding fields initially: `onboarding_stage`, `has_connected_bank`, `accounts_count`, `first_name`, `age`, `occupation`, `money_mindset`, `stress_level`, `emergency_readiness`, `income_bracket` (optional).
- New table (recommended): `onboarding_events(id uuid, user_id uuid, stage text, action text, duration_ms int, error_code text, metadata jsonb, created_at timestamptz)` with RLS (user_id = auth.uid()). Add RPC `log_onboarding_event(p_user_id uuid, p_stage text, p_action text, p_duration_ms int, p_error_code text, p_metadata jsonb)`.
- No changes needed to financial RPCs; reuse: `get_spend_by_category`, `get_recurring_streams_active`, `get_cashflow_monthly`. Ensure indexes on `transactions(user_id, date)` if not present (optional perf).

## Error/latency handling

- Auto-refresh Plaid link token on expiry. Pre-save stage before opening Plaid. Show skeletons post-Plaid; guarantee at least 1 deterministic stat ≤3s.

## A/B hooks (later)

- Toggle: goal-first vs direct Plaid ask. Toggle: mascot visible vs minimal on final.

## Out of scope (v1)

- Full Google auth setup, deep investment linking, complex demo mode.

## Acceptance criteria

- Full flow completes <90s happy path. Resume works. 3 insights render <8s P95. Optional multi-account does not block progression. All events recorded.

### To-dos

- [ ] Add onboarding_stage guard/redirect in /(onboarding)/_layout.tsx
- [ ] Refactor welcome.tsx to show Auth-first + progress (1/4)
- [ ] Convert intent.tsx to chat-style micro Qs A, persist metadata
- [ ] Create aboutyou.tsx with occupation/name/age Qs B
- [ ] Enhance accountconnection.tsx (trust panel, add-another, token refresh)
- [ ] Rewrite final.tsx to 3 fast insights + mascot + CTAs
- [ ] Create onboarding_events table + RPC log_onboarding_event
- [ ] Set onboarding_stage after every step; verify resume behavior
- [ ] Apply concise copy across screens; add trust bottom sheet
- [ ] Instrument step timings and Plaid outcomes; verify logs