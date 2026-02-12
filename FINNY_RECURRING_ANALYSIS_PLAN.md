# Finny Recurring Transaction Analysis - Implementation Plan

## Problem
- Currently we only rely on Plaid's `transactionsRecurringGet` for recurring streams
- Plaid can miss patterns (Spotify, Netflix, Venmo, etc.) or flag noise (credit card payments)
- User wants: **LLM-powered analysis** that complements Plaid, using 4 months of tx data + merchant naming

## Architecture

### 1. Data Flow
```
New account connect → storeAccounts → transaction sync → run recurring analysis (LLM)
                                          ↓
User clicks "Do a quick analysis" → run recurring analysis (LLM)
```

### 2. Database: `finny_recurring_analysis`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK auth.users |
| item_id | text | null = all accounts, else specific Plaid item |
| analysis_text | text | LLM's human-readable summary |
| analysis_json | jsonb | Structured: real_subscriptions, ignore_suggestions, income |
| created_at | timestamptz | When analysis ran |
| trigger_source | text | 'new_account' \| 'manual' |

One row per analysis run. Keep latest per user (or latest per item_id). UI fetches most recent.

### 3. LLM Prompt (`buildRecurringAnalysisPrompt`)
- **Input**: Last 4 months of transactions + Plaid's recurring_streams (so LLM doesn't duplicate)
- **Task**: Find recurring patterns Plaid may have MISSED (bi-weekly, monthly, yearly)
- **Use**: Merchant names (Spotify, Netflix, Venmo, OpenAI, Oura, etc.)
- **Output**: `newly_found_subscriptions`, `credit_card_payments_to_ignore`, `peer_payments`, `newly_found_income`
- **Post-processing**: Match each item to transactions by merchant name; attach `transaction_ids` for UI to show history
- **Distinguish**:
  - **Real subscriptions**: Spotify, Netflix, OpenAI ChatGPT, Oura Ring
  - **Noise to ignore**: Credit card payments (Chase, Amex, Wells Fargo CCPYMT/ACH)
  - **Peer payments**: Venmo (behavioral, not subscription—flag for user)
  - **Income streams**: Payroll, interest, transfers
- **Output**: JSON with `summary`, `real_subscriptions[]`, `ignore_suggestions[]`, `income_streams[]`

### 4. Script: `scripts/analyze-recurring-transactions.js`
- Args: `--user-id <uuid>` (required), `--item-id <plaid_item>` (optional)
- Fetches 4 months of tx for user (optionally filtered by item)
- Calls `buildRecurringAnalysisPrompt` + OpenRouter LLM
- Inserts into `finny_recurring_analysis`
- Logs result for testing

### 5. Production Integration (future)
- **On new account**: After `storeAccounts` + initial tx sync, call recurring analysis API (or background job)
- **RecurringSection UI**:
  - Show Finny analysis at top (from `finny_recurring_analysis`)
  - "Do a quick analysis" button → API → re-run LLM → refresh
  - Past recurring section (inactive streams) — separate task

### 6. Scope for This PR
- [x] Plan document
- [x] DB migration
- [x] Prompt in prompt_engine.js
- [x] Test script
- [ ] API route (for production)
- [ ] RecurringSection UI (analysis card + button + past section)

## Usage
```bash
# Test for a specific user
node scripts/analyze-recurring-transactions.js --user-id 79952f35-b607-40d6-a32e-d81386882eb7

# Optional: scope to one Plaid item
node scripts/analyze-recurring-transactions.js --user-id 79952f35-b607-40d6-a32e-d81386882eb7 --item-id 7j1bEV1kdAHYb3N5bBExCLzP5XD6nwCQEKAMX
```
