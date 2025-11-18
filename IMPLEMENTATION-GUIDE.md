# 🚀 Recurring Transaction Categorization - Implementation Guide

## Overview

This implementation ensures that recurring transactions (subscriptions, bills, etc.) are properly categorized based on their recurring stream type, while always respecting user overrides.

---

## 📋 Files Changed

### Core Utilities
- ✅ `src/utils/transactionCategory.ts` - Display logic (NEW)
- ✅ `src/utils/recurringBackfill.ts` - Safe backfill (NEW)
- ✅ `scripts/backfill-recurring-categories.ts` - CLI script (NEW)

### Backend
- ✅ `schema-updates.sql` - Database indexes (NEW)
- ✅ `api/transactions_sync.js` - Sets categories from streams
- ✅ `api/refresh_financial_data.js` - Triggers backfill after stream refresh
- ✅ `src/utils/plaid.ts` - Includes user-marked recurring transactions

### Frontend (TO DO)
- ⏳ `src/components/insights/components/TransactionsSection.tsx`
- ⏳ `src/components/insights/components/SpendingSection.tsx`
- ⏳ `src/components/modals/TransactionDetailModal.tsx`
- ⏳ `src/components/insights/CategoryDetailModal.tsx`

---

## 🎯 Category Priority Logic

```
1. new_category (user explicit override) → ALWAYS WINS
2. recurring_stream category (if transaction is part of active stream)
   - subscription → "Subscriptions"
   - income → "Income"
   - bill → "Housing"
3. top_category (Plaid's original) → FALLBACK
```

---

## 🗄️ Database Setup

### Step 1: Run SQL Schema Updates

```bash
# Copy the SQL file contents and run in Supabase SQL Editor
cat schema-updates.sql
```

This adds indexes for performance (safe to run multiple times).

---

## 🔧 Running the Backfill

### Preview Changes (Dry Run - Recommended First)

```bash
# Get your user ID from Supabase
# Then preview what would change:
npx ts-node scripts/backfill-recurring-categories.ts \
  --user-id YOUR_USER_ID \
  --dry-run
```

### Apply Changes (Live)

```bash
# After reviewing the dry run, apply changes:
npx ts-node scripts/backfill-recurring-categories.ts \
  --user-id YOUR_USER_ID \
  --live
```

**Safety Features:**
- ✅ Defaults to dry-run mode
- ✅ Never overwrites user category overrides
- ✅ Idempotent (safe to run multiple times)
- ✅ Batch processing for large datasets
- ✅ Detailed logging

---

## 📊 How It Works

### 1. Transaction Sync (Going Forward)

When new transactions sync from Plaid (`transactions_sync.js`):

```javascript
1. Check if transaction exists in any recurring stream
2. If YES:
   - Set recurring_stream_id
   - Set if_recurring = 'yes'
   - Set new_category from stream_type (only if new_category is NULL)
3. If NO:
   - Set if_recurring = 'no'
```

**User Override Protection:**
- Before upserting, checks if transaction already has `new_category`
- If yes, preserves it (never overwrites user choice)

### 2. Recurring Stream Refresh

When recurring streams refresh (`refresh_financial_data.js`):

```javascript
1. Fetch recurring streams from Plaid
2. Store in recurring_streams table
3. Automatically trigger backfill:
   - Link existing transactions to streams
   - Set if_recurring = 'yes'
   - Set new_category (only if NULL)
```

### 3. Frontend Display

Components use `getDisplayCategory()` utility:

```typescript
import { getDisplayCategory } from '@/src/utils/categories/transactionCategory';

// In component:
const displayCategory = getDisplayCategory(transaction);
```

This handles the priority logic automatically.

---

## 🎨 Frontend Implementation Plan

### TransactionsSection.tsx

**Change:** Use `getDisplayCategory()` for category display

```typescript
// Before:
{tx.new_category || tx.top_category || "Other"}

// After:
{formatCategoryFromHook(getDisplayCategory(tx))}
```

**Required:** Update transaction query to include `recurring_streams` join

### SpendingSection.tsx

**Change:** Use `getDisplayCategory()` in category breakdown calculation

```typescript
// In processTransactionsData:
const category = getDisplayCategory(tx);
```

### TransactionDetailModal.tsx

**Change:** Display category using `getDisplayCategory()`

**Already uses similar logic** - just needs to import and use utility function.

### CategoryDetailModal.tsx

**Change:** Filter transactions using `getDisplayCategory()`

```typescript
const filteredTxs = transactions.filter(tx => 
  getDisplayCategory(tx) === selectedCategory
);
```

---

## 🔍 Query Updates Needed

All transaction queries need to include `recurring_streams` join:

```typescript
// Before:
.select('*')

// After:
.select(`
  *,
  recurring_streams:recurring_stream_id (
    stream_id,
    stream_type,
    is_active
  )
`)
```

---

## 🧪 Testing Checklist

- [ ] Run SQL schema updates in Supabase
- [ ] Run backfill in dry-run mode
- [ ] Review dry-run changes
- [ ] Run backfill in live mode
- [ ] Verify Spotify shows as "Subscriptions" in transactions list
- [ ] Verify user category overrides are preserved
- [ ] Test manual category change (should override stream category)
- [ ] Test recurring toggle (should show/hide chip but keep categorization)
- [ ] Test category rules (should override stream category)
- [ ] Verify spending breakdown uses correct categories
- [ ] Verify recurring section includes user-marked transactions

---

## 🐛 Troubleshooting

### Transactions still showing old categories

**Solution:** 
1. Run backfill script again
2. Check if transactions have `new_category` set (user override)
3. Force refresh: Cloud sync → will re-run backfill automatically

### User override not preserved

**Check:**
1. transactions_sync.js has the user override protection logic
2. Backfill script checks for existing `new_category`

### Recurring section not showing user-marked transactions

**Check:**
1. Transaction has `if_recurring = 'yes'`
2. Transaction has `recurring_stream_id = NULL`
3. getAllRecurringTransactions includes the user-marked logic

---

## 📝 User Workflow

### Scenario 1: Spotify (Subscription)

1. ✅ Plaid detects recurring pattern → creates stream (stream_type = 'subscription')
2. ✅ Transaction syncs → automatically categorized as "Subscriptions"
3. ✅ Shows in Recurring Section as subscription
4. ✅ Shows "Recurring" chip in transaction list
5. ✅ User can manually change category if desired (override preserved)

### Scenario 2: User Marks Transaction as Recurring

1. ✅ User opens transaction detail
2. ✅ Toggles "Mark as Recurring"
3. ✅ if_recurring set to 'yes'
4. ✅ Transaction appears in Recurring Section
5. ✅ Shows "Recurring" chip
6. ✅ Category unchanged (uses existing category)

### Scenario 3: User Changes Category

1. ✅ User changes Spotify from "Subscriptions" to "Entertainment"
2. ✅ new_category set to "Entertainment"
3. ✅ Transaction still linked to stream (still shows in Recurring Section)
4. ✅ Transaction displays as "Entertainment" (user override)
5. ✅ Future Spotify transactions still auto-categorized as "Subscriptions"

---

## 🎯 Key Principles

1. **User Override Always Wins** - Never overwrite `new_category`
2. **Stream Category Fills Gaps** - Only set category if `new_category` is NULL
3. **Plaid is Fallback** - Use `top_category` if no stream or user override
4. **Recurring ≠ Stream** - User can mark any transaction as recurring
5. **Idempotent Operations** - Safe to run multiple times

---

## 📊 Stream Type Mapping

| Stream Type   | Category Name      | Notes                    |
|---------------|-------------------|--------------------------|
| subscription  | Subscriptions     | Netflix, Spotify, etc.   |
| income        | Income            | Salary, wages, etc.      |
| bill          | Housing           | Rent, utilities, etc.    |
| other         | (no override)     | Uses Plaid category      |

**TODO:** Confirm "Housing" for bills or create "Bills & Utilities" category.

---

## 🚀 Next Steps

1. ✅ Run SQL schema updates
2. ✅ Run backfill (dry-run first!)
3. ⏳ Update frontend components
4. ⏳ Test all user workflows
5. ⏳ Deploy to production

---

## 📞 Support

If you encounter issues:
1. Check console logs for detailed errors
2. Run backfill in dry-run mode to preview changes
3. Verify SQL indexes are created
4. Check that queries include `recurring_streams` join

---

**Last Updated:** 2025-01-15
**Version:** 1.0.0

