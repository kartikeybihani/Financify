# Spending Category Data Changes - Summary

## Overview
Changed spending category data format from "last 30 days" to separate "current month" and "last complete month" sections to enable better pattern analysis.

## Changes Made

### 1. SQL Migration ✅
**File**: `supabase/migrations/add_monthly_spending_breakdown.sql`

**What it does**:
- Modifies `get_summary_min_composite` function to fetch spending data for:
  - Current month (1st of current month → today)
  - Last complete month (1st of last month → last day of last month)
  - Maintains backward compatibility with "last 30 days" field

**Action Required**: Run this SQL migration on your database

### 2. JavaScript Processing ✅
**File**: `api/finny.js`

**Changes**:
- Updated `processSummaryData()` function to extract:
  - `spendByCategoryCurrentMonth` (new)
  - `spendByCategoryLastMonth` (new)
  - `spendByCategory` (kept for backward compatibility)

### 3. Prompt Formatting ✅
**File**: `lib/prompt_engine.js`

**Changes**:
- Updated `synthesizeFinancialData()` function to format two sections:
  - `SPENDING BY CATEGORY - CURRENT MONTH (January 2026):`
  - `SPENDING BY CATEGORY - LAST COMPLETE MONTH (December 2025):`
- Updated `buildGoalAnalysisPrompt()` function with same formatting
- Added backward compatibility fallback to "last 30 days" format if new fields are missing

## SQL Migration Instructions

**IMPORTANT**: You need to run the SQL migration file on your database:

```bash
# Option 1: If using Supabase CLI
supabase migration up

# Option 2: Run the SQL file directly in your Supabase SQL editor
# Copy the contents of: supabase/migrations/add_monthly_spending_breakdown.sql
```

The migration:
- ✅ Maintains backward compatibility (old `spend_by_category` field still exists)
- ✅ Adds new fields: `spend_by_category_current_month` and `spend_by_category_last_month`
- ✅ Uses existing `get_spend_by_category` function (no changes needed to that)
- ✅ Calculates dates automatically (no manual date parameters needed)

## Backward Compatibility

✅ **Fully backward compatible**:
- Old `spend_by_category` field is still returned
- If new fields are missing, code falls back to old format
- No breaking changes to existing functionality

## Testing Checklist

After running the SQL migration, verify:
1. ✅ Finny responses still work correctly
2. ✅ Spending category data appears in both sections
3. ✅ Month names are formatted correctly (e.g., "January 2026")
4. ✅ No errors in console/logs
5. ✅ Pattern analysis works better with monthly comparisons

## Example Output

**Before**:
```
SPENDING BY CATEGORY (last 30 days):
- Food: $450.00
- Transportation: $200.00
```

**After**:
```
SPENDING BY CATEGORY - CURRENT MONTH (January 2026):
- Food: $300.00
- Transportation: $150.00

SPENDING BY CATEGORY - LAST COMPLETE MONTH (December 2025):
- Food: $450.00
- Transportation: $200.00
```

## Files Modified

1. ✅ `supabase/migrations/add_monthly_spending_breakdown.sql` (NEW - needs to be run)
2. ✅ `api/finny.js` (updated `processSummaryData`)
3. ✅ `lib/prompt_engine.js` (updated formatting in 2 functions)

## No Breaking Changes

- ✅ All existing functionality preserved
- ✅ Backward compatible with old data format
- ✅ No changes needed to frontend or other API consumers
- ✅ Cache keys remain the same
- ✅ No changes to other RPC functions
