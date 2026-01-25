# Plaid + SnapTrade Aggregation Fixes

## Summary
Fixed all investment calculations to properly aggregate data from **both Plaid and SnapTrade** providers when users have investment accounts from both sources.

## Issues Fixed

### 1. Investment Screen Total Portfolio Value ✅
**File:** `app/investments/index.tsx`

**Problem:** Only used `balances[0].total_value` - would only show first account's value

**Fix:** Now sums ALL balances:
```typescript
const totalPortfolioValue = balances.reduce(
  (sum, b) => sum + (b.total_value || 0),
  0
);
```

### 2. Investment Screen Total Unrealized P&L ✅
**File:** `app/investments/index.tsx`

**Problem:** Only used `balances[0].total_change` - would only show first account's P&L

**Fix:** Now sums ALL balances:
```typescript
const totalChangeSum = balances.reduce(
  (sum, b) => sum + (b.total_change || 0),
  0
);
```

### 3. Investment Screen Day Change ✅
**File:** `app/investments/index.tsx`

**Problem:** Only used `balances[0].day_change` - would only show first account's day change

**Fix:** Now sums ALL balances:
```typescript
const dayChangeSum = balances.reduce(
  (sum, b) => sum + (b.day_change || 0),
  0
);
```

### 4. Unified Financial Data Hook ✅
**File:** `src/hooks/useUnifiedFinancialData.ts`

**Problem:** Only used `investmentBalances[0].total_value` - would only show first account's value

**Fix:** Now sums ALL balances:
```typescript
const total = investmentBalances.reduce(
  (sum, b) => sum + (b.total_value || 0),
  0
);
```

### 5. Investment Connections ✅
**File:** `src/utils/integrations/snaptrade.ts`

**Added:** `getAllInvestmentConnectionsFromDB()` function that:
- Gets SnapTrade connections from `snaptrade_connections` table
- Gets Plaid investment accounts from `user_items` + `accounts` + `investment_holdings`
- Combines both into a unified list
- Sorts by `last_synced_at` (most recent first)

**Updated:** Investment screen now uses `getAllInvestmentConnectionsFromDB()` instead of `getSnaptradeConnectionsFromDB()`

## How It Works Now

### Data Queries (Already Correct ✅)
- `getSnaptradeHoldingsFromDB()` - Queries by `user_id` and `is_active` → Gets **both** Plaid and SnapTrade holdings
- `getSnaptradeBalancesFromDB()` - Queries by `user_id` and `is_current` → Gets **both** Plaid and SnapTrade balances
- `getSnaptradeOptionsFromDB()` - Queries by `user_id` and `is_active` → Gets **both** Plaid and SnapTrade options

### Aggregations (Now Fixed ✅)
- **Total Portfolio Value**: Sums `total_value` from ALL balances (both providers)
- **Total Cash**: Sums `cash` from ALL balances (both providers)
- **Total Unrealized P&L**: Sums `total_change` from ALL balances (both providers)
- **Day Change**: Sums `day_change` from ALL balances (both providers)
- **Holdings**: Already aggregates all holdings (both providers)
- **Options**: Already aggregates all options (both providers)

## Example Scenario

**User has:**
- 1 Plaid investment account: $50,000 total value
- 1 SnapTrade investment account: $30,000 total value

**Before Fix:**
- Total Portfolio Value: $50,000 (only Plaid, first balance)
- OR $30,000 (only SnapTrade, if it was first)

**After Fix:**
- Total Portfolio Value: $80,000 (sum of both)

## Testing Checklist

- [ ] Connect Plaid investment account → Verify holdings appear
- [ ] Connect SnapTrade investment account → Verify holdings appear
- [ ] Verify total portfolio value = sum of both accounts
- [ ] Verify total unrealized P&L = sum of both accounts
- [ ] Verify day change = sum of both accounts
- [ ] Verify both connections appear in connections list
- [ ] Verify home screen investments total includes both
- [ ] Verify net worth calculation includes both

## Files Modified

1. `app/investments/index.tsx` - Fixed aggregations for totals
2. `src/hooks/useUnifiedFinancialData.ts` - Fixed investments total calculation
3. `src/utils/integrations/snaptrade.ts` - Added `getAllInvestmentConnectionsFromDB()`
