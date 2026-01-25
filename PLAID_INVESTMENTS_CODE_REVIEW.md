# Plaid Investments Implementation - Code Review

## ✅ What's Working Well

### 1. **Migration Schema** (`add_plaid_support_to_investments.sql`)
- ✅ Properly adds provider column and Plaid-specific fields
- ✅ Makes SnapTrade fields nullable correctly
- ✅ Creates partial unique indexes for both providers
- ✅ Adds check constraints to ensure data integrity
- ✅ Sets default provider for existing SnapTrade records
- ✅ Includes performance indexes

### 2. **Data Storage** (`store_accounts.js`)
- ✅ Correctly maps Plaid API response to database schema
- ✅ Sets `account_id = plaid_account_id` (required field fix)
- ✅ Calculates day_change, unrealized_pl, total_percent_change correctly
- ✅ Handles missing securities gracefully
- ✅ Marks removed holdings as inactive
- ✅ Updates balances with proper conflict handling

### 3. **Webhook Handler** (`webhook.js`)
- ✅ Handles `HOLDINGS.DEFAULT_UPDATE` webhook correctly
- ✅ Fetches access token securely via RPC
- ✅ Reuses `syncPlaidHoldings` function (DRY principle)
- ✅ Same logic as `store_accounts.js` for consistency

### 4. **Frontend Integration**
- ✅ `getAllInvestmentConnectionsFromDB` correctly fetches both providers
- ✅ `getSnaptradeBalancesFromDB` returns all balances (no provider filter - correct!)
- ✅ `useUnifiedFinancialData` sums all balances correctly
- ✅ Investments screen aggregates totals from all providers
- ✅ FinancialBottomSheet will show Plaid investments (via accounts table)

## ⚠️ Potential Issues & Fixes

### Issue 1: `onConflict` with Partial Unique Indexes

**Problem**: Supabase's `onConflict` with column names may not work correctly with partial unique indexes. PostgreSQL requires the conflict target to match an actual unique constraint or index.

**Current Code**:
```javascript
.upsert(holdingsRows, {
  onConflict: "user_id,item_id,plaid_account_id,security_id",
  ignoreDuplicates: false,
});
```

**Solution Options**:

**Option A**: Use explicit conflict resolution (Recommended)
```javascript
// Delete existing records first, then insert
await supabase
  .from("investment_holdings")
  .delete()
  .eq("user_id", userId)
  .eq("item_id", item_id)
  .eq("provider", "plaid")
  .in("security_id", holdingsRows.map(h => h.security_id))
  .in("plaid_account_id", holdingsRows.map(h => h.plaid_account_id));

await supabase
  .from("investment_holdings")
  .insert(holdingsRows);
```

**Option B**: Use individual upserts with error handling (Current SnapTrade approach)
```javascript
for (const holding of holdingsRows) {
  try {
    await supabase
      .from("investment_holdings")
      .upsert(holding, {
        onConflict: "user_id,item_id,plaid_account_id,security_id",
      });
  } catch (err) {
    // Handle individual errors
  }
}
```

**Option C**: Create a unique constraint (not partial index) - but this won't work because we need different constraints for different providers.

**Recommendation**: Test the current implementation first. If `onConflict` fails, implement Option A (delete then insert) as it's the most reliable.

### Issue 2: Missing Error Handling in Webhook

**Location**: `api/webhook.js` line 162

**Current**: Errors in `syncPlaidHoldings` are caught but webhook still returns 200.

**Fix**: Add better error logging and potentially retry logic:
```javascript
try {
  await syncPlaidHoldings({
    access_token,
    item_id,
    user_id: userItem.user_id,
  });
  console.log("✅ Plaid holdings synced successfully from webhook");
} catch (e) {
  console.error("❌ Error syncing Plaid holdings from webhook:", e);
  // Log to error tracking service
  // Consider queueing for retry
}
```

### Issue 3: Race Condition in Balance Updates

**Location**: `store_accounts.js` line 524-530

**Current**: Marks previous balances as `is_current = false` before upserting new ones.

**Potential Issue**: If upsert fails, balances are marked as not current but no new current balance exists.

**Fix**: Add transaction or better error handling:
```javascript
// Mark previous balances as not current
const { error: markError } = await supabase
  .from("investment_balances")
  .update({ is_current: false })
  .eq("user_id", userId)
  .eq("item_id", item_id)
  .eq("provider", "plaid");

if (markError) {
  console.error("❌ Error marking previous balances:", markError);
  // Don't proceed with upsert if marking failed
  return;
}

// Upsert new balances
const { error: balancesError } = await supabase
  .from("investment_balances")
  .upsert(balanceRows, {
    onConflict: "user_id,item_id,plaid_account_id,currency_code",
    ignoreDuplicates: false,
  });

if (balancesError) {
  console.error("❌ Error upserting Plaid balances:", balancesError);
  // Optionally: Re-mark previous balances as current
}
```

### Issue 4: Missing Provider Filter in Some Queries

**Location**: `getSnaptradeBalancesFromDB` in `snaptrade.ts`

**Current**: Returns all balances regardless of provider (which is actually correct for unified view).

**Status**: ✅ This is intentional and correct - the function name is misleading but the behavior is right.

**Recommendation**: Consider renaming to `getAllInvestmentBalancesFromDB` for clarity, but this is a breaking change.

### Issue 5: Inactive Holdings Cleanup Logic

**Location**: Both `store_accounts.js` and `webhook.js`

**Current**: Uses a 500ms delay before checking for removed holdings.

**Potential Issue**: Race condition if multiple syncs happen simultaneously.

**Fix**: Use a more robust approach:
```javascript
// Instead of setTimeout, use a transaction or check after upsert completes
const { data: upsertedHoldings } = await supabase
  .from("investment_holdings")
  .select("security_id, plaid_account_id")
  .eq("user_id", userId)
  .eq("item_id", item_id)
  .eq("provider", "plaid")
  .eq("is_active", true);

// Then compare with activeSecurityIds and activeAccountIds
```

## 🔍 Data Integrity Checks

### 1. Check Constraint Validation
The migration includes check constraints that ensure:
- Plaid records have `item_id`, `plaid_account_id`, `security_id` NOT NULL
- SnapTrade records have `snaptrade_user_id`, `symbol_id`, `symbol` NOT NULL

**Status**: ✅ Correctly implemented

### 2. Unique Constraint Validation
Partial unique indexes ensure:
- No duplicate Plaid holdings: `(user_id, item_id, plaid_account_id, security_id)`
- No duplicate Plaid balances: `(user_id, item_id, plaid_account_id, currency_code)`

**Status**: ✅ Correctly implemented, but `onConflict` usage needs testing

### 3. Foreign Key Relationships
- `account_id` references `accounts.account_id` (for both providers)
- `item_id` references `user_items.item_id` (for Plaid)

**Status**: ✅ Should work, but verify `accounts` table has Plaid investment accounts

## 📋 Testing Checklist

### Migration Testing
- [x] Migration runs successfully
- [x] Existing SnapTrade data preserved
- [x] Check constraints work correctly
- [x] Unique indexes prevent duplicates

### Data Storage Testing
- [ ] Test `store_accounts.js` with real Plaid investment account
- [ ] Verify holdings are stored correctly
- [ ] Verify balances are stored correctly
- [ ] Test with multiple investment accounts
- [ ] Test with accounts that have no holdings
- [ ] Test error handling when Plaid API fails

### Webhook Testing
- [ ] Test `HOLDINGS.DEFAULT_UPDATE` webhook
- [ ] Verify holdings update correctly
- [ ] Verify removed holdings are marked inactive
- [ ] Test error handling when webhook fails

### Frontend Testing
- [ ] Verify Plaid investments show in investments screen
- [ ] Verify totals aggregate correctly (Plaid + SnapTrade)
- [ ] Verify FinancialBottomSheet shows Plaid investments
- [ ] Test with both providers connected
- [ ] Test with only Plaid connected
- [ ] Test with only SnapTrade connected

### Edge Cases
- [ ] Account with zero holdings
- [ ] Account with only cash (no holdings)
- [ ] Holdings with missing security data
- [ ] Multiple currencies
- [ ] Very large portfolios (100+ holdings)
- [ ] Concurrent syncs (same account synced twice)

## 🚀 Recommended Next Steps

1. **Test `onConflict` behavior**: Run a test to see if upsert works with partial indexes. If not, implement delete-then-insert pattern.

2. **Add monitoring**: Add error tracking for webhook failures and sync errors.

3. **Add retry logic**: For webhook failures, implement a retry queue.

4. **Performance testing**: Test with large portfolios to ensure queries are optimized.

5. **Documentation**: Update API documentation to reflect Plaid investment support.

## 📝 Code Quality Notes

### Strengths
- ✅ Consistent data mapping between `store_accounts.js` and `webhook.js`
- ✅ Proper error handling in most places
- ✅ Good logging for debugging
- ✅ Follows existing patterns (similar to SnapTrade implementation)

### Areas for Improvement
- ⚠️ `onConflict` usage needs verification
- ⚠️ Error handling in webhook could be more robust
- ⚠️ Some function names are misleading (`getSnaptradeBalancesFromDB` returns all providers)
- ⚠️ Race condition potential in balance updates

## ✅ Overall Assessment

The implementation is **solid and well-structured**. The main concerns are:
1. Testing `onConflict` with partial indexes
2. Adding more robust error handling
3. Testing edge cases

The code follows good practices and maintains consistency with existing SnapTrade implementation.
