# Phase 1 Test Questions - Data Requirements Classification

Test these questions in `tests/test_classification_direct.js` to verify that classification correctly outputs `data_requirements`.

## Expected Behavior

Each classification result should include a `data_requirements` object with:
- `required_packs`: Array of pack names needed
- `optional_packs`: Array of optional pack names
- `filters`: Object with merchant, category, or period filters
- `granularity`: "summary_level" | "transaction_level" | "category_level"
- `time_range`: "current" | "1_month" | "3_months" | "6_months" | "1_year" | "all_time"

---

## Test Questions

### 1. Merchant-Specific Query (6 months)
**Query:** "How much have I spent on Chipotle for the last six months?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "category_details"],
  "optional_packs": [],
  "filters": {
    "merchant": "Chipotle",
    "category": null,
    "period": {
      "months": 6,
      "start": "2024-07-01",  // Adjust based on current date
      "end": "2024-12-31"     // Adjust based on current date
    }
  },
  "granularity": "transaction_level",
  "time_range": "6_months"
}
```

---

### 2. Affordability Query
**Query:** "Can I afford a $1500 trip to Italy?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "cashflow_monthly"],
  "optional_packs": ["goals_overview"],
  "filters": {},
  "granularity": "summary_level",
  "time_range": "3_months"
}
```

---

### 3. Simple Net Worth Query
**Query:** "What's my net worth?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min"],
  "optional_packs": [],
  "filters": {},
  "granularity": "summary_level",
  "time_range": "current"
}
```

---

### 4. Investment Portfolio Query
**Query:** "Show me my investment portfolio"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "invest_holdings"],
  "optional_packs": [],
  "filters": {},
  "granularity": "summary_level",
  "time_range": "current"
}
```

---

### 5. Category Spending Query (Last Month)
**Query:** "How much did I spend on food last month?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "category_details"],
  "optional_packs": [],
  "filters": {
    "merchant": null,
    "category": "Food",
    "period": {
      "months": 1,
      "start": "2024-11-01",  // Adjust based on current date
      "end": "2024-11-30"     // Adjust based on current date
    }
  },
  "granularity": "category_level",
  "time_range": "1_month"
}
```

---

### 6. Goals Query
**Query:** "What are my financial goals?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "goals_overview"],
  "optional_packs": [],
  "filters": {},
  "granularity": "summary_level",
  "time_range": "current"
}
```

---

### 7. Total Spending Query (3 Months)
**Query:** "How much did I spend in the last 3 months?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "spend_total"],
  "optional_packs": [],
  "filters": {
    "period": {
      "months": 3,
      "start": "2024-09-01",  // Adjust based on current date
      "end": "2024-11-30"     // Adjust based on current date
    }
  },
  "granularity": "summary_level",
  "time_range": "3_months"
}
```

---

### 8. Merchant Query (No Time Period)
**Query:** "How much have I spent at Starbucks?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "category_details"],
  "optional_packs": [],
  "filters": {
    "merchant": "Starbucks",
    "category": null,
    "period": null
  },
  "granularity": "transaction_level",
  "time_range": "current"  // or "1_month" if default
}
```

---

### 9. Complex Affordability Query
**Query:** "Can I afford to buy a house worth $500,000?"

**Expected `data_requirements`:**
```json
{
  "required_packs": ["summary_min", "cashflow_monthly"],
  "optional_packs": ["goals_overview"],
  "filters": {},
  "granularity": "summary_level",
  "time_range": "3_months"
}
```

---

### 10. Off-Topic Query (No Data Needed)
**Query:** "What's the weather like today?"

**Expected `data_requirements`:**
```json
null
```

**Note:** `needs_user_data` should be `false`, and `data_requirements` should be `null`.

---

## Validation Checklist

For each test question, verify:

- [ ] `data_requirements` exists (or is `null` for off-topic queries)
- [ ] `required_packs` includes "summary_min"` (if `needs_user_data` is true)
- [ ] `filters` object structure is correct (merchant, category, period)
- [ ] `granularity` is one of: "summary_level", "transaction_level", "category_level"
- [ ] `time_range` matches the query's time period
- [ ] Period dates are calculated correctly (based on current date)
- [ ] Merchant names are extracted correctly (Chipotle, Starbucks, etc.)
- [ ] Category names are extracted correctly (Food, Shopping, etc.)

---

## Common Issues to Watch For

1. **Missing `summary_min`**: Should always be in `required_packs` when `needs_user_data` is true
2. **Incorrect period dates**: Dates should be calculated from current date (e.g., "last 6 months" from today)
3. **Missing filters**: Merchant/category should be extracted and included in filters
4. **Wrong granularity**: Transaction-level queries should use "transaction_level", not "summary_level"
5. **Null handling**: Off-topic queries should have `data_requirements: null`

---

## Debugging Tips

If classification fails or returns incorrect `data_requirements`:

1. Check the console logs for `📦 [FINNY] Data requirements:` - this shows what was parsed
2. Verify the JSON structure matches the expected format
3. Check if period dates are calculated correctly (they depend on current date)
4. Ensure merchant/category names are extracted correctly
5. Verify `needs_user_data` is set correctly (true for financial queries, false for off-topic)
