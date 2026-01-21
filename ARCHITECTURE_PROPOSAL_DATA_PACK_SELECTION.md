# Architecture Proposal: Classification-Based Data Pack Selection

## Executive Summary

Currently, Finny uses **keyword-based slot extraction** (`extractSlots`) to determine which Basepacks to fetch. This approach is brittle, misses semantic nuances, and often pulls unnecessary data. This proposal outlines a **classification-driven architecture** that uses LLM classification to intelligently determine data requirements, resulting in more accurate, efficient, and maintainable data fetching.

---

## Current Architecture Analysis

### How It Works Today

1. **Slot Extraction** (`extractSlots` function, lines 3704-3904)
   - Keyword matching: "spend" → `topic: "spend"`, "chipotle" → `merchant: "chipotle"`
   - Pattern matching for periods: "last 6 months" → `period: { start, end, months: 6 }`
   - Hardcoded category/merchant mappings

2. **Needs Planning** (`planNeeds` function, lines 3654-3702)
   - Maps slots to data needs deterministically:
     - `topic: "spend"` → needs `["summary_min", "spend_total", "txns_by_category"]`
     - `topic: "merchant"` → needs `["summary_min", "merchant_breakdown"]`
     - `topic: "invest"` → needs `["summary_min", "invest_holdings"]`

3. **Context Building** (`buildContextPacks` function, lines 3906-4029)
   - Fetches all needs in parallel
   - Caches results for reuse

### Problems with Current Approach

1. **Brittle Keyword Matching**
   - "How much did I spend on Chipotle?" → Works
   - "What's my Chipotle spending?" → Might miss merchant detection
   - "Show me Chipotle expenses" → Different phrasing, same intent

2. **Over-fetching**
   - Query: "How much have I spent on Chipotle for the last six months?"
   - Current: Fetches `summary_min`, `spend_total`, `txns_by_category` (all categories)
   - Needed: Only `category_details` with merchant="Chipotle" and period=6 months

3. **Under-fetching**
   - Query: "Can I afford a $1500 trip to Italy?"
   - Current: Might only fetch `summary_min` (basic account info)
   - Needed: `summary_min`, `cashflow_monthly`, `goals_overview` (to assess affordability)

4. **No Semantic Understanding**
   - Can't distinguish between "show me spending" (needs totals) vs "analyze my spending patterns" (needs detailed transactions)
   - Can't understand context: "How much did I spend?" could mean total, category, merchant, or time period

5. **Classification Underutilized**
   - Classification already exists and is sophisticated (intent, emotional state, decision risk)
   - But it's NOT used for data pack selection - only for intent routing and prompt building

---

## Proposed Architecture

### Core Concept

**Use classification output to drive data pack selection**, replacing keyword-based slot extraction with semantic understanding.

### Architecture Flow

```
User Query
    ↓
Classification LLM Call
    ↓
Classification Result (Enhanced with data_requirements)
    ↓
Data Pack Selector (maps requirements → needs)
    ↓
buildContextPacks (fetches only needed packs)
    ↓
Phineas LLM Call (with optimized context)
```

### 1. Enhanced Classification Output

Extend the classification prompt to include **data requirements**:

```json
{
  "intent": "ask_personalized",
  "intent_type": "actionable",
  "emotional_state": "neutral",
  "needs_web": false,
  "needs_user_data": true,
  "needs_clarification": false,
  "info_sufficiency": "sufficient",
  "missing_fields": [],
  "decision_risk": "low",
  "state": null,
  "entities": ["Chipotle"],
  "ticker": null,
  "confidence": 0.95,
  
  // NEW: Data requirements
  "data_requirements": {
    "required_packs": ["category_details"],
    "optional_packs": [],
    "filters": {
      "merchant": "Chipotle",
      "category": null,
      "period": {
        "months": 6,
        "start": "2024-07-01",
        "end": "2024-12-31"
      }
    },
    "granularity": "transaction_level", // vs "summary_level"
    "time_range": "6_months"
  }
}
```

### 2. Data Requirements Schema

```typescript
interface DataRequirements {
  required_packs: string[];      // Must-have packs: ["summary_min", "category_details"]
  optional_packs: string[];     // Nice-to-have: ["cashflow_monthly"]
  filters: {
    merchant?: string;           // Specific merchant name
    category?: string;           // Category name (e.g., "Food")
    period?: {
      months?: number;
      start: string;             // ISO date
      end: string;               // ISO date
    };
  };
  granularity: "summary_level" | "transaction_level" | "category_level";
  time_range: string;           // "1_month", "3_months", "6_months", "1_year", "all_time"
}
```

### 3. Pack Selection Logic

Create a new function `selectDataPacksFromClassification`:

```javascript
function selectDataPacksFromClassification(classificationResult, message) {
  const { data_requirements } = classificationResult;
  
  if (!data_requirements) {
    // Fallback to keyword-based for backward compatibility
    return planNeeds(extractSlots(message), message);
  }
  
  const needs = [];
  
  // Always include summary_min for base context (unless explicitly not needed)
  if (data_requirements.required_packs.length > 0 || 
      data_requirements.optional_packs.length > 0) {
    needs.push("summary_min");
  }
  
  // Map classification packs to internal needs
  const packMapping = {
    "summary_min": "summary_min",
    "spend_total": "spend_total",
    "category_details": "category_details",
    "merchant_breakdown": "category_details", // Same pack, different filter
    "invest_holdings": "invest_holdings",
    "goals_overview": "goals_overview",
    "cashflow_monthly": "cashflow_monthly",
  };
  
  // Add required packs
  data_requirements.required_packs.forEach(pack => {
    const need = packMapping[pack] || pack;
    if (!needs.includes(need)) {
      needs.push(need);
    }
  });
  
  // Add optional packs (only if not already included)
  data_requirements.optional_packs.forEach(pack => {
    const need = packMapping[pack] || pack;
    if (!needs.includes(need)) {
      needs.push(need);
    }
  });
  
  return {
    needs,
    filters: data_requirements.filters,
    granularity: data_requirements.granularity,
    time_range: data_requirements.time_range
  };
}
```

### 4. Enhanced Classification Prompt

Add to `getClassificationPrompt()` in `lib/prompt_engine.js`:

```javascript
"=== DATA REQUIREMENTS (NEW) ===",
"Determine what financial data packs are needed to answer this query:",
"",
"Required packs (must-have):",
"- summary_min: Basic account balances, net worth, recent transactions (almost always needed)",
"- spend_total: Total spending amounts by period",
"- category_details: Detailed transactions for a specific category or merchant",
"- invest_holdings: Investment portfolio and holdings",
"- goals_overview: Financial goals and progress",
"- cashflow_monthly: Monthly income/expense patterns",
"",
"Optional packs (nice-to-have for better context):",
"- Same as above, but not strictly required",
"",
"Filters (when specific data is needed):",
"- merchant: Specific merchant name (e.g., 'Chipotle', 'Starbucks')",
"- category: Category name (e.g., 'Food', 'Shopping', 'Entertainment')",
"- period: Time range with months, start, end dates",
"",
"Granularity:",
"- summary_level: High-level totals only",
"- transaction_level: Individual transaction details needed",
"- category_level: Category breakdowns needed",
"",
"Time range:",
"- Extract from query: '1_month', '3_months', '6_months', '1_year', 'all_time'",
"",
"Examples:",
"- 'How much have I spent on Chipotle for the last six months?'",
"  → required_packs: ['category_details'], filters: {merchant: 'Chipotle', period: {months: 6}}",
"- 'Can I afford a $1500 trip to Italy?'",
"  → required_packs: ['summary_min', 'cashflow_monthly'], optional_packs: ['goals_overview']",
"- 'What's my net worth?'",
"  → required_packs: ['summary_min']",
"- 'Show me my investment portfolio'",
"  → required_packs: ['summary_min', 'invest_holdings']",
```

### 5. Updated Classification Output Format

Update the JSON schema in the prompt:

```javascript
'{"intent":"ask_personalized","intent_type":"actionable","emotional_state":"neutral","needs_web":false,"needs_user_data":true,"needs_clarification":false,"info_sufficiency":"sufficient","missing_fields":[],"decision_risk":"low","state":null,"entities":[],"ticker":null,"confidence":0.95,"data_requirements":{"required_packs":["category_details"],"optional_packs":[],"filters":{"merchant":"Chipotle","category":null,"period":{"months":6,"start":"2024-07-01","end":"2024-12-31"}},"granularity":"transaction_level","time_range":"6_months"}}'
```

---

## Implementation Plan

### Phase 1: Extend Classification ✅ COMPLETE

1. **Update Classification Prompt** (`lib/prompt_engine.js`) ✅
   - Add data requirements section to `getClassificationPrompt()`
   - Update JSON schema examples
   - Add examples for common queries

2. **Update Classification Handler** (`api/finny.js`) ✅
   - Parse `data_requirements` from classification result
   - Add backward compatibility (default to empty if missing)
   - Log data requirements for debugging
   - **Added date recalculation** to fix LLM training data dates

3. **Test Classification** ✅
   - Test with example queries (10 test questions provided)
   - Verify JSON parsing and structure
   - Dates now correctly calculated from current date

### Phase 2: Implement Pack Selector ✅ COMPLETE

1. **Create `selectDataPacksFromClassification` function** ✅
   - Map classification packs to internal needs
   - Handle filters (merchant, category, period)
   - Preserve backward compatibility with keyword fallback
   - Determine when to use merchant RPC vs category RPC

2. **Update `handleAsk` function** ✅
   - Replaced `planNeeds(extractSlots(message), message)` with classification-based selection
   - Classification filters ALWAYS override keyword-based slots
   - Maintains backward compatibility

3. **Update `buildContextPacks` / `createOptimizedFetchOperations`** ✅
   - Use filters from classification when fetching category_details
   - **Added merchant RPC support** (`get_spend_by_merchant`) for merchant queries
   - Pass period filters to spend_total fetcher
   - Updated cache key generation to include merchant/category filters

4. **Update `processCategoryTransactionsData`** ✅
   - Handle merchant RPC results separately
   - Process merchant transactions with proper structure

### Phase 3: Optimize Data Fetching ✅ COMPLETE

1. **Smart Caching** ✅
   - Cache key includes filters (merchant, category, period) - **DONE**
   - Check cache before fetching - **Already existed**
   - Cache invalidation on new transactions - **Deferred** (TTL-based caching is sufficient for now)

2. **Parallel Fetching** ✅
   - Keep existing parallel fetch logic - **Already existed**
   - Add filter-aware fetching for category_details - **DONE**

3. **Error Handling** ✅
   - Fallback to keyword-based if classification fails - **DONE**
   - Log when fallback is used - **DONE** (logs at line 3715-3717)
   - Monitor classification accuracy - **Basic logging in place**, advanced metrics deferred

### Phase 4: Testing & Refinement 🔄 READY FOR TESTING

1. **Unit Tests** (User will test)
   - Test `selectDataPacksFromClassification` with various classification results
   - Test filter application
   - Test backward compatibility

2. **Integration Tests** (User will test)
   - Test end-to-end with real queries
   - Measure performance (should be same or better)
   - Verify data accuracy

3. **Monitoring** (Basic logging in place)
   - Log classification → pack selection mapping ✅ (logs at line 3777-3783)
   - Track cache hit rates (existing cache logging)
   - Monitor LLM classification accuracy (basic logging, advanced metrics deferred)

---

## ✅ Implementation Summary

**Phases 1-3: COMPLETE**

All core functionality has been implemented:
- ✅ Classification outputs `data_requirements` with proper structure
- ✅ Date recalculation fixes LLM training data issues
- ✅ Pack selection uses classification (with keyword fallback)
- ✅ Merchant RPC (`get_spend_by_merchant`) used for merchant queries
- ✅ Category RPC (`get_transactions_by_category`) used for category queries
- ✅ Classification filters override keyword-based slots
- ✅ Smart caching with filter-aware cache keys
- ✅ Proper error handling and fallback logging

**Ready for Phase 4: Testing**

---

## Example Flows

### Example 1: Merchant-Specific Query

**Query:** "How much have I spent on Chipotle for the last six months?"

**Classification Output:**
```json
{
  "intent": "ask_personalized",
  "intent_type": "actionable",
  "data_requirements": {
    "required_packs": ["category_details"],
    "filters": {
      "merchant": "Chipotle",
      "period": {"months": 6, "start": "2024-07-01", "end": "2024-12-31"}
    },
    "granularity": "transaction_level",
    "time_range": "6_months"
  }
}
```

**Pack Selection:**
- Needs: `["summary_min", "category_details"]`
- Filters: `{merchant: "Chipotle", period: {months: 6}}`

**Data Fetched:**
- `summary_min` (cached, fast)
- `category_details` with merchant="Chipotle" filter, period=6 months

**Result:** Only fetches Chipotle transactions for 6 months, not all categories.

---

### Example 2: Affordability Query

**Query:** "Can I afford a $1500 trip to Italy?"

**Classification Output:**
```json
{
  "intent": "ask_personalized",
  "intent_type": "actionable",
  "decision_risk": "medium",
  "data_requirements": {
    "required_packs": ["summary_min", "cashflow_monthly"],
    "optional_packs": ["goals_overview"],
    "filters": {},
    "granularity": "summary_level",
    "time_range": "3_months"
  }
}
```

**Pack Selection:**
- Needs: `["summary_min", "cashflow_monthly", "goals_overview"]`

**Data Fetched:**
- `summary_min` (liquid assets, net worth)
- `cashflow_monthly` (income vs expenses)
- `goals_overview` (existing goals that might conflict)

**Result:** Fetches all needed context for affordability assessment.

---

### Example 3: Simple Query

**Query:** "What's my net worth?"

**Classification Output:**
```json
{
  "intent": "ask_personalized",
  "intent_type": "exploratory",
  "data_requirements": {
    "required_packs": ["summary_min"],
    "optional_packs": [],
    "filters": {},
    "granularity": "summary_level",
    "time_range": "current"
  }
}
```

**Pack Selection:**
- Needs: `["summary_min"]`

**Data Fetched:**
- `summary_min` only

**Result:** Minimal data fetch, fast response.

---

## Benefits

1. **Accuracy**: Semantic understanding vs keyword matching
2. **Efficiency**: Fetch only needed data, reduce over-fetching
3. **Maintainability**: Single source of truth (classification) for data needs
4. **Extensibility**: Easy to add new pack types or filters
5. **Performance**: Better cache utilization, fewer unnecessary fetches
6. **User Experience**: Faster responses, more accurate answers

---

## Migration Strategy

1. **Gradual Rollout**
   - Keep keyword-based as fallback
   - A/B test classification-based selection
   - Monitor accuracy and performance

2. **Backward Compatibility**
   - If classification fails or missing `data_requirements`, use keyword fallback
   - Log when fallback is used
   - Gradually improve classification prompt

3. **Monitoring**
   - Track classification accuracy
   - Measure cache hit rates
   - Monitor query performance
   - Collect user feedback

---

## Risks & Mitigations

1. **Classification Accuracy**
   - Risk: LLM misclassifies data needs
   - Mitigation: Comprehensive prompt with examples, fallback to keyword-based

2. **Performance**
   - Risk: Classification adds latency
   - Mitigation: Classification is already cached, no additional latency

3. **Complexity**
   - Risk: More complex codebase
   - Mitigation: Clean separation of concerns, well-documented functions

4. **Breaking Changes**
   - Risk: Existing queries break
   - Mitigation: Backward compatibility, gradual rollout, extensive testing

---

## Success Metrics

1. **Accuracy**: % of queries that fetch correct data packs (target: >95%)
2. **Efficiency**: Average number of packs fetched per query (target: reduce by 30%)
3. **Performance**: Average query latency (target: same or better)
4. **Cache Hit Rate**: % of queries using cached data (target: >80%)
5. **Fallback Rate**: % of queries using keyword fallback (target: <5%)

---

## Conclusion

This architecture proposal transforms Finny's data pack selection from **keyword-based** to **classification-driven**, resulting in more accurate, efficient, and maintainable data fetching. The implementation is incremental, backward-compatible, and can be rolled out gradually with monitoring and fallbacks.

The key insight: **Classification already understands the query semantically - we should use that understanding to drive data fetching, not just prompt building.**
