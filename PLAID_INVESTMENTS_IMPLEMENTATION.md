# Plaid Investments Implementation Summary

## Overview
This implementation adds support for storing Plaid investment accounts in the same `investment_holdings` and `investment_balances` tables used for SnapTrade accounts. Users can now connect investment accounts via either Plaid or SnapTrade (or both), and all holdings will be stored and displayed together.

## Changes Made

### 1. Database Schema Migration
**File:** `supabase/migrations/add_plaid_support_to_investments.sql`

**Key Changes:**
- Added `provider` column (enum: 'plaid' | 'snaptrade') to both tables
- Added Plaid-specific fields:
  - `item_id` (Plaid item_id)
  - `plaid_account_id` (Plaid account_id)
  - `security_id` (Plaid security_id, equivalent to SnapTrade's symbol_id)
  - `sector` and `industry` (from Plaid securities)
- Made SnapTrade-specific fields nullable (`snaptrade_user_id`, `symbol_id`, `symbol`)
- Removed restrictive foreign key constraints
- Added partial unique indexes for both providers:
  - SnapTrade: `(user_id, snaptrade_user_id, account_id, symbol_id)`
  - Plaid: `(user_id, item_id, plaid_account_id, security_id)`
- Added check constraints to ensure provider-specific fields are set correctly

### 2. Store Accounts API Update
**File:** `api/store_accounts.js`

**Key Changes:**
- Enhanced the investments section to actually **store** Plaid holdings (previously only logged)
- Maps Plaid response structure to our schema:
  - `holdings[]` → `investment_holdings` rows
  - `securities[]` → used for security metadata (name, ticker, type, etc.)
  - `accounts[]` → `investment_balances` rows
- Calculates:
  - `market_value` from `institution_value`
  - `price` from `institution_price` or `security.close_price`
  - `unrealized_pl` from `market_value - cost_basis`
  - `day_change` and `day_change_percent` from previous sync
  - `total_percent_change` from cost basis
- Handles sold/removed holdings by marking them as `is_active = false`
- Stores account balances with total portfolio value

## Data Mapping

### Plaid → Database

| Plaid Field | Database Field | Notes |
|------------|----------------|-------|
| `holding.account_id` | `plaid_account_id` | Plaid account identifier |
| `holding.security_id` | `security_id` | Plaid security identifier |
| `security.ticker_symbol` | `symbol` | Stock ticker |
| `security.name` | `description` | Security name |
| `holding.quantity` | `units` | Number of shares/units |
| `holding.institution_price` | `price` | Current price |
| `holding.institution_value` | `market_value` | Total market value |
| `holding.cost_basis` | `total_cost_basis` | Total cost basis |
| `security.type` | `security_type` | Security type (equity, mutual fund, etc.) |
| `security.sector` | `sector` | Industry sector |
| `security.industry` | `industry` | Industry classification |
| `security.market_identifier_code` | `exchange_code` | Exchange code (e.g., XNAS) |
| `account.balances.current` | `cash` | Cash balance |
| `item_id` | `item_id` | Plaid item identifier |

### Calculated Fields

- `unrealized_pl` = `market_value - total_cost_basis`
- `day_change` = `current_market_value - previous_market_value`
- `day_change_percent` = `(day_change / previous_market_value) * 100`
- `total_percent_change` = `((market_value - cost_basis) / cost_basis) * 100`
- `average_purchase_price` = `cost_basis / quantity` (if both available)

## How It Works

### Onboarding Flow (Plaid)
1. User connects account via Plaid link in `onboarding-connect.tsx`
2. `handlePlaidConnect` → `storeAccounts(item_id)` is called
3. `store_accounts.js` fetches investments via `investmentsHoldingsGet`
4. Holdings and balances are processed and stored with `provider = 'plaid'`
5. Holdings appear in investments view alongside SnapTrade accounts

### SnapTrade Flow (Existing)
1. User connects via SnapTrade (existing flow)
2. Holdings synced via `handleSnapTradeSync` in `api/plaid.js`
3. Stored with `provider = 'snaptrade'`
4. Appears alongside Plaid accounts

### Querying Both Providers
When fetching investments, filter by `user_id` and `is_active = true`. Both providers will be returned:

```sql
SELECT * FROM investment_holdings 
WHERE user_id = $1 AND is_active = true
ORDER BY provider, last_updated DESC;
```

## Testing Checklist

### Schema Migration
- [ ] Run migration: `supabase/migrations/add_plaid_support_to_investments.sql`
- [ ] Verify existing SnapTrade data still works (provider = 'snaptrade')
- [ ] Verify unique constraints work for both providers
- [ ] Verify check constraints prevent invalid data

### Plaid Connection
- [ ] Connect a Plaid investment account in onboarding
- [ ] Verify holdings are stored in `investment_holdings` with `provider = 'plaid'`
- [ ] Verify balances are stored in `investment_balances` with `provider = 'plaid'`
- [ ] Verify all fields are populated correctly
- [ ] Verify `day_change` is null on first sync (no previous value)

### Mixed Providers
- [ ] Connect both Plaid and SnapTrade investment accounts
- [ ] Verify both appear in investments view
- [ ] Verify no conflicts between providers
- [ ] Verify unique constraints work correctly

### Updates & Sync
- [ ] Re-sync Plaid account (should update existing holdings)
- [ ] Verify `day_change` is calculated correctly on second sync
- [ ] Verify sold holdings are marked as `is_active = false`
- [ ] Verify new holdings are added correctly

### Edge Cases
- [ ] Account with no holdings (should still create balance record)
- [ ] Account with cash only (no securities)
- [ ] Security without ticker_symbol (should use name)
- [ ] Holdings with missing cost_basis
- [ ] Multiple investment accounts from same Plaid item

## Webhook Support ✅

**File:** `api/webhook.js`

**Implementation:**
- Added handler for Plaid `HOLDINGS.DEFAULT_UPDATE` webhook
- When webhook fires, automatically:
  1. Fetches fresh holdings from Plaid API
  2. Updates `investment_holdings` table
  3. Updates `investment_balances` table
  4. Calculates `day_change` and `day_change_percent`
  5. Marks sold/removed holdings as inactive

**Webhook Flow:**
1. Plaid sends `HOLDINGS.DEFAULT_UPDATE` webhook
2. Webhook handler extracts `item_id`
3. Looks up `user_id` from `user_items` table
4. Gets access token from Vault
5. Calls `syncPlaidHoldings()` function
6. Holdings are updated in database
7. Returns 200 OK to acknowledge webhook

**Webhook Payload:**
```json
{
  "webhook_type": "HOLDINGS",
  "webhook_code": "DEFAULT_UPDATE",
  "item_id": "wz666MBjYWTp2PDzzggYhM6oWWmBb",
  "error": null,
  "new_holdings": 19,
  "updated_holdings": 0,
  "environment": "production"
}
```

## Next Steps (Future)

1. **Manual Refresh**: Add manual refresh button for Plaid accounts (similar to SnapTrade)
2. **Performance**: Add caching for Plaid holdings (similar to SnapTrade)
3. **Error Handling**: Better error messages for Plaid-specific errors
4. **UI Updates**: Show provider badge (Plaid vs SnapTrade) in investments view
5. **Webhook Testing**: Test webhook in production environment

## Notes

- **No Breaking Changes**: Existing SnapTrade functionality remains unchanged
- **Backward Compatible**: Existing SnapTrade data is automatically set to `provider = 'snaptrade'`
- **Unique Constraints**: Uses partial unique indexes to handle provider-specific uniqueness
- **Foreign Keys**: Removed to allow both providers (application-level validation instead)

## Files Modified

1. `supabase/migrations/add_plaid_support_to_investments.sql` - Schema migration
2. `api/store_accounts.js` - Plaid holdings storage logic (onboarding/initial connection)
3. `api/webhook.js` - Plaid holdings webhook handler (`HOLDINGS.DEFAULT_UPDATE`)

## Files That May Need Updates (Future)

1. Investment views/components - May need to show provider badge
2. Investment sync logic - May need Plaid-specific sync endpoint
3. Webhook handlers - Need to handle Plaid investment webhooks
4. RPC functions - May need to filter by provider in some queries
