# Budget Category Mapping Implementation Plan

## Overview
When a user creates a budget (via Finny or manually), we need to intelligently map existing transactions to the new budget categories. This ensures transactions don't get lost in "Other" and users see accurate budget vs actuals from day one.

---

## Phase 1: Update Finny's Budget Generation Prompt

### 1.1 Add "Other" Category Requirement
- **Location**: `lib/prompt_engine.js` → `buildBudgetGenerationPrompt()`
- **Change**: Add explicit requirement that "Other" must always be included as the last category
- **Note**: No default percentage/limit for "Other" - user sets it later

### 1.2 Add Obvious Categories to Prompt
- **Location**: `lib/prompt_engine.js` → `buildBudgetGenerationPrompt()`
- **Change**: Explicitly mention that Finny should include obvious categories like:
  - Food / Dining Out
  - Travel
  - Shopping
  - Entertainment
  - Transportation
  - Health
  - Subscriptions
  - etc.
- **Reason**: Prevent Finny from skipping obvious categories that users need

### 1.3 Update Prompt Text
Add to the "Consider" section:
```
- Always include essential categories: Food/Dining, Travel, Shopping, Entertainment, Transportation, Health, Subscriptions
- Don't skip obvious categories - users need these for accurate tracking
- Always include "Other" as the final category (no default limit)
```

---

## Phase 2: Ensure "Other" Category Exists

### 2.1 Check/Create "Other" Category
- **Location**: `api/transactions_sync.js` → `handleBudgetCreation()`
- **When**: After budget categories are created (both Finny and manual flows)
- **Logic**:
  1. Check if "Other" category exists for user: `SELECT id FROM categories WHERE name = 'Other' AND user_id = X`
  2. If not exists, create it:
     ```javascript
     {
       id: generateUUID(),
       user_id: userId,
       name: "Other",
       slug: "other",
       icon: "📦",
       color: "#607D8B",
       rank: 999,
       is_active: true
     }
     ```
  3. Add "Other" to budget entries (user can set limit later or leave unlimited)

### 2.2 Add "Other" to Budget Entries
- **Location**: `api/transactions_sync.js` → `handleBudgetCreation()`
- **When**: When saving budget (both Finny and manual)
- **Logic**: Ensure "Other" has a budget entry (even if limit is null/unlimited)

---

## Phase 3: AI-Powered Category Mapping (After Budget Creation)

### 3.1 Collect Transaction Categories (Last 4 Months)
- **Location**: `api/transactions_sync.js` → New function `remapTransactionsToBudgetCategories()`
- **Query**:
  ```sql
  SELECT DISTINCT top_category, sub_category 
  FROM transactions 
  WHERE user_id = $1 
    AND category_id IS NULL
    AND date >= NOW() - INTERVAL '4 months'
    AND amount > 0  -- Only expenses (exclude income/transfers)
  ORDER BY top_category, sub_category
  ```
- **Result Format**:
  ```javascript
  [
    {"top_category": "Food", "sub_category": "Drink Restaurant"},
    {"top_category": "Income", "sub_category": "Earned"},
    {"top_category": "Other", "sub_category": "Investment And Retirement Funds"},
    ...
  ]
  ```

### 3.2 Collect Budget Categories
- **Location**: `api/transactions_sync.js` → `remapTransactionsToBudgetCategories()`
- **Query**:
  ```sql
  SELECT DISTINCT c.id, c.name
  FROM categories c
  INNER JOIN budget_entries be ON be.category_id = c.id
  INNER JOIN budget_periods bp ON bp.id = be.budget_period_id
  WHERE bp.user_id = $1
    AND bp.status = 'active'
    AND c.is_active = true
  ORDER BY c.name
  ```
- **Result Format**:
  ```javascript
  [
    {"id": "uuid-1", "name": "Other"},
    {"id": "uuid-2", "name": "Education"},
    {"id": "uuid-3", "name": "Groceries"},
    {"id": "uuid-4", "name": "Food"},
    ...
  ]
  ```

### 3.3 Create AI Mapping Prompt
- **Location**: `lib/prompt_engine.js` → New function `buildCategoryMappingPrompt()`
- **Input**:
  - Transaction categories: `[{"top": "Food", "sub": "Drink Restaurant"}, ...]`
  - Budget categories: `["Other", "Education", "Groceries", "Food", ...]`
- **Prompt Structure**:
  ```
  You are Finny, a financial coach helping users map their transaction categories to budget categories.
  
  TRANSACTION CATEGORIES (from bank/plaid):
  - Food | Drink Restaurant
  - Income | Earned
  - Other | Investment And Retirement Funds
  ...
  
  BUDGET CATEGORIES (user created):
  - Other
  - Education
  - Groceries
  - Food
  - Entertainment
  - Social Activities
  - Content Creation
  ...
  
  TASK:
  Map each transaction category to the most appropriate budget category.
  - Use semantic matching (e.g., "Food" → "Food" or "Dining Out")
  - If no good match exists, return null (will go to "Other")
  - New budget categories (like "Content Creation", "Social Activities") should only be matched if transaction category clearly fits
  
  Return ONLY valid JSON:
  {
    "mappings": {
      "Food|Drink Restaurant": "Food",
      "Income|Earned": null,  // Income doesn't go to budget categories
      "Other|Investment And Retirement Funds": "Other",
      ...
    }
  }
  ```

### 3.4 Call AI for Mapping
- **Location**: `api/transactions_sync.js` → `remapTransactionsToBudgetCategories()`
- **Function**: Use existing `callLLM()` function
- **Input**: Prompt from 3.3
- **Output**: JSON with mappings

### 3.5 Bulk Update Transactions
- **Location**: `api/transactions_sync.js` → `remapTransactionsToBudgetCategories()`
- **Logic**:
  ```javascript
  for (const [transactionKey, budgetCategoryName] of Object.entries(mappings)) {
    if (budgetCategoryName === null) {
      // Assign to "Other"
      const [top, sub] = transactionKey.split('|');
      await supabase
        .from('transactions')
        .update({ category_id: otherCategoryId })
        .eq('user_id', userId)
        .eq('top_category', top)
        .eq('sub_category', sub)
        .is('category_id', null);
    } else {
      // Find budget category ID
      const budgetCategory = budgetCategories.find(c => c.name === budgetCategoryName);
      if (budgetCategory) {
        const [top, sub] = transactionKey.split('|');
        await supabase
          .from('transactions')
          .update({ category_id: budgetCategory.id })
          .eq('user_id', userId)
          .eq('top_category', top)
          .eq('sub_category', sub)
          .is('category_id', null);
      }
    }
  }
  ```

### 3.6 Call Remapping After Budget Creation
- **Location**: `api/transactions_sync.js` → `handleBudgetCreation()`
- **When**: After budget is successfully saved (when `save: true`)
- **Call**: `await remapTransactionsToBudgetCategories(userId)`
- **Note**: Run in background (don't block response), log errors but don't fail budget creation

---

## Phase 4: Ongoing Transaction Matching (Future)

### 4.1 For New Transactions
When new transactions are synced:
1. **First**: Check merchant rules (`category_rules` table)
2. **Second**: Try exact/fuzzy match: `top_category` + `sub_category` → budget categories
3. **Third**: Fallback to "Other"
4. **Set**: `category_id` when matched

### 4.2 Merchant Rules
- Already exists in system
- User can create rules when manually recategorizing transactions
- Rules take priority over AI matching

---

## Implementation Order

1. ✅ **Phase 1**: Update Finny's prompt (add "Other" requirement + obvious categories)
2. ✅ **Phase 2**: Ensure "Other" category exists when budget is created
3. ✅ **Phase 3**: Implement AI category mapping (4 months of data)
4. ⏳ **Phase 4**: Ongoing matching (can be done later)

---

## Example Flow

### Input
**Transaction Categories** (from last 4 months):
- `Food | Drink Restaurant`
- `Income | Earned`
- `Other | Investment And Retirement Funds`
- `Other | Other General Services`

**Budget Categories**:
- Other, Education, Groceries, Savings, Housing, Entertainment, Health, Subscriptions, Social Activities, Transportation, Content Creation, Personal Care, Food, Travel, Shopping

### AI Mapping Result
```json
{
  "mappings": {
    "Food|Drink Restaurant": "Food",
    "Income|Earned": null,
    "Other|Investment And Retirement Funds": "Other",
    "Other|Other General Services": "Other"
  }
}
```

### SQL Updates
```sql
-- Food transactions → Food category
UPDATE transactions 
SET category_id = 'food-category-id'
WHERE user_id = 'user-id'
  AND top_category = 'Food'
  AND sub_category = 'Drink Restaurant'
  AND category_id IS NULL;

-- Other transactions → Other category
UPDATE transactions 
SET category_id = 'other-category-id'
WHERE user_id = 'user-id'
  AND top_category = 'Other'
  AND sub_category IN ('Investment And Retirement Funds', 'Other General Services')
  AND category_id IS NULL;

-- Income transactions → null (don't assign, they're not expenses)
-- (No update needed)
```

---

## Files to Modify

1. **`lib/prompt_engine.js`**
   - Update `buildBudgetGenerationPrompt()` - add "Other" requirement + obvious categories
   - Add new function `buildCategoryMappingPrompt()`

2. **`api/transactions_sync.js`**
   - Update `handleBudgetCreation()` - ensure "Other" category exists
   - Add new function `remapTransactionsToBudgetCategories()`
   - Call remapping after budget is saved

3. **`src/components/modals/BudgetCreationModal.tsx`** (if needed)
   - No changes needed (handled in API)

---

## Testing Checklist

- [ ] Finny always includes "Other" in budget generation
- [ ] Finny includes obvious categories (Food, Travel, Shopping, etc.)
- [ ] "Other" category is created if it doesn't exist
- [ ] "Other" is added to budget entries
- [ ] AI mapping correctly matches transaction categories to budget categories
- [ ] Transactions are bulk updated with correct `category_id`
- [ ] Unmapped transactions go to "Other"
- [ ] New budget categories (like "Content Creation") stay empty initially
- [ ] Remapping doesn't block budget creation (runs in background)
- [ ] Only last 4 months of transactions are processed

---

## Notes

- **Performance**: Using 4 months of data instead of all transactions reduces cost and processing time
- **Accuracy**: 4 months is enough to capture most spending patterns
- **Background Processing**: Remapping runs asynchronously so budget creation isn't blocked
- **Error Handling**: If remapping fails, log error but don't fail budget creation
- **Future**: Merchant rules will improve matching over time, reducing reliance on "Other"
