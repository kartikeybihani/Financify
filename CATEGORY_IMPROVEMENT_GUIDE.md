# Transaction Category Improvement Guide

## Current Issues
- Using basic Plaid categories (`personal_finance_category.primary`)
- No enrichment or enhanced categorization
- Many categories coming through as generic (GENERAL_MERCHANDISE, etc.)

## Solution 1: Enable Plaid Enrich (Recommended)

### Update transactions_sync.js:
```javascript
// In the transactionsSync call, add options for enrichment:
const { data } = await client.transactionsSync({
  access_token: access_token,
  cursor,
  count: 500,
  options: {
    include_original_description: true,
    // Enable enrichment options if available in your Plaid plan
    include_personal_finance_category: true
  }
});
```

### Enhanced Category Mapping:
```javascript
// Improved category extraction:
const rows = [...added, ...modified].map((txn) => {
  // Try multiple category sources in order of preference
  let category = null;
  
  if (txn.personal_finance_category?.detailed) {
    category = txn.personal_finance_category.detailed;
  } else if (txn.personal_finance_category?.primary) {
    category = txn.personal_finance_category.primary;
  } else if (txn.category && txn.category.length > 0) {
    // Fallback to legacy category array
    category = txn.category[0];
  }
  
  return {
    // ... existing fields ...
    category: category,
    category_detailed: txn.personal_finance_category?.detailed || null,
    category_primary: txn.personal_finance_category?.primary || null,
    merchant_name: txn.merchant_name || null,
    original_description: txn.original_description || null,
  };
});
```

## Solution 2: Custom Category Enhancement

### Create Enhanced Category Mapping:
```javascript
// utils/categoryEnhancement.js
const MERCHANT_CATEGORY_MAP = {
  'AMAZON': 'ONLINE_SHOPPING',
  'UBER': 'TRANSPORTATION',
  'STARBUCKS': 'COFFEE_SHOPS',
  'MCDONALD': 'FAST_FOOD',
  // Add more merchant-specific mappings
};

const KEYWORD_CATEGORY_MAP = {
  'gas station': 'GAS_STATIONS',
  'pharmacy': 'PHARMACY',
  'grocery': 'GROCERY_STORES',
  // Add more keyword mappings
};

export function enhanceCategory(transaction) {
  const { name, merchant_name, category } = transaction;
  const text = `${name} ${merchant_name || ''}`.toLowerCase();
  
  // Check merchant mappings
  for (const [merchant, cat] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (text.includes(merchant.toLowerCase())) {
      return cat;
    }
  }
  
  // Check keyword mappings
  for (const [keyword, cat] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (text.includes(keyword)) {
      return cat;
    }
  }
  
  // Return original or enhanced category
  return category;
}
```

## Solution 3: Plaid Link Configuration Update

### Update Link Token Creation:
```javascript
// In api/link_tokens.js, ensure you're requesting the right products:
const request = {
  products: ['transactions'], // Ensure transactions product is enabled
  client_name: 'Financify',
  country_codes: ['US'],
  language: 'en',
  user: {
    client_user_id: user_id
  },
  // Add enhanced options if available:
  transactions: {
    days_requested: 730 // Request more historical data for better patterns
  }
};
```

## Immediate Actions:

1. **Check Plaid Console**: Verify if Enrich is available in your current Plaid plan
2. **Update transactions_sync.js**: Add enrichment options to the sync call
3. **Add fallback logic**: Implement merchant/keyword-based category enhancement
4. **Test with sample data**: Run a small sync to see improved categories
5. **Force re-sync**: Use the existing `forceFullResync()` function to get fresh data

## Testing:
```javascript
// Add to your app for testing:
import { debugTransactionCategories } from './utils/categoryFix';

// Run this to see current category distribution:
await debugTransactionCategories(user.id, 50);
```

