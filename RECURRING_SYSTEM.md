# Recurring Transactions - System Overview

## Data Sources

| Source | Stored in | When |
|-------|-----------|------|
| Plaid `transactionsRecurringGet` | `recurring_streams` (source=plaid) | Plaid refresh / webhook |
| Finny LLM analysis | `recurring_streams` (source=finny), `finny_recurring_analysis` | New account connect, "Quick analysis" button |
| User-marked | Grouped from `transactions` (if_recurring=yes) | User toggles in tx detail modal |

## Tables

**recurring_streams** — stream_id, stream_type, transaction_ids, is_active, user_dismissed, source (plaid|finny), item_id (null for Finny)

**finny_recurring_analysis** — id, user_id, item_id, analysis_text, analysis_json, trigger_source (new_account|manual)

**transactions** — recurring_stream_id (FK), if_recurring ('yes'|'no')

## Flows

1. **Plaid refresh** → lib/plaid/recurringRefresh.js → upserts to recurring_streams (per item_id)
2. **Finny analysis** → lib/recurringAnalysis.js → LLM + enrich → upserts Finny items to recurring_streams (item_id=null)
3. **API** → POST /api/exchange_public_token with `mode: "analyze_recurring"` → handleAnalyzeRecurring
4. **Triggers** — New account: after syncTransactions (plaid.ts). Manual: "Quick analysis" button (RecurringSection)

## UI (RecurringSection)

- Active streams (Plaid + Finny + user-marked) in 2-column grid
- "Quick analysis" button → calls API → refresh
- Past recurring section (is_active=false streams)
- Tap card → transaction history; Remove → dismissRecurringStream + bulk if_recurring=no

## Script

```bash
node scripts/analyze-recurring-transactions.js --user-id <uuid> [--item-id <plaid_item>]
```
