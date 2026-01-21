# 5 Hardball Test Questions for Finny

These questions are designed to stress-test the RPC functions, data processing, and prompt communication.

## Test Question 1: Bidirectional Merchant (Sent Only)
**Query**: "how much have i sent on zelle in the past year?"
**Why it's hard**: Zelle has both sent (positive) and received (negative) transactions. Must filter correctly.
**Expected**: Sum of only positive amounts
**Current Bug**: Sums all amounts (sent + received) = wrong total

## Test Question 2: Bidirectional Merchant (Received Only)
**Query**: "how much did i receive via zelle last month?"
**Why it's hard**: Opposite direction filter - must sum only negative amounts
**Expected**: Sum of only negative amounts (as positive total)
**Current Bug**: Same as #1 - doesn't distinguish direction

## Test Question 3: Empty Results with Similar Merchant Name
**Query**: "how much have i spent at 'Chipotle Express' in the last 6 months?"
**Why it's hard**: Tests merchant name matching (partial vs exact) and empty result handling
**Expected**: "I searched your transactions for Chipotle Express and didn't find any purchases"
**Current Status**: Should work (we fixed empty results)

## Test Question 4: Large Transaction Count with Period Boundary
**Query**: "show me all my amazon transactions from december 2024"
**Why it's hard**: Tests date boundary accuracy, large result sets, and prompt truncation
**Expected**: All December 2024 Amazon transactions, correct total
**Potential Issues**: Date filtering, prompt length limits, transaction count accuracy

## Test Question 5: Mixed Transaction Types with Category Filter
**Query**: "how much did i spend on food at chipotle in the last 3 months?"
**Why it's hard**: Combines merchant filter + category filter + period filter
**Expected**: Only Chipotle transactions categorized as Food, correct total
**Potential Issues**: Category matching, multiple filter combination

## Bonus: Edge Case Tests

### Test 6: Zero Amount Transactions
**Query**: "show me my zelle transactions from last month"
**Why it's hard**: Some transactions might have $0 amounts (refunds, adjustments)
**Expected**: All transactions including $0, correct total excluding $0

### Test 7: Merchant Name Variations
**Query**: "how much have i spent at starbucks in the last year?"
**Why it's hard**: Merchant names vary: "Starbucks", "STARBUCKS", "Starbucks Store #1234"
**Expected**: All variations matched, correct total
**Current Status**: SQL uses LIKE '%starbucks%' so should work

### Test 8: Period Boundary Precision
**Query**: "how much did i spend on january 1st, 2025?"
**Expected**: Only transactions from that exact date
**Potential Issues**: Timezone handling, date comparison logic
