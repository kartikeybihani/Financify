# Steps 1 & 2 Complete: Classification + Orchestration System ✅

## What We Built

### Step 1: Upgraded Classification Test Harness ✅
**File**: `tests/test_classification_direct.js`

#### Schema v1.1 (Extensible Design)
Extended the classification output with new fields:

```javascript
{
  // Existing fields (unchanged)
  intent: "ask_personalized" | "goal_conversation" | "stock_query" | "off_topic",
  intent_type: "exploratory" | "actionable" | "emotional_support" | "crisis" | "planning",
  emotional_state: "neutral" | "anxious" | "panicked" | "ashamed" | "overwhelmed" | "fomo",
  needs_web: boolean,
  needs_user_data: boolean,
  decision_risk: "low" | "medium" | "high",
  info_sufficiency: "sufficient" | "partial" | "insufficient",
  confidence: 0.0-1.0,
  ticker: string | null,
  entities: string[],
  
  // NEW in Schema v1.1 (extensible, not rigid)
  clarification_needed: boolean,  // Derived: risk=high AND sufficiency=insufficient
  clarification_reasons: string[],  // Free-form array: ["timeline_missing", "income_plan_unclear", ...]
  clarification_note: string | null,  // Human-readable explanation
  requested_context: string[],  // Data hints: ["timeline", "income", "purpose", "budget"]
  
  // Legacy (optional)
  clarification_type: string | null  // Backward compat
}
```

**Key Improvements**:
- ✅ Extensible `clarification_reasons[]` - not limited to fixed enum
- ✅ Schema validator with graceful fallbacks
- ✅ Auto-derives `clarification_needed` if missing
- ✅ Supports legacy `clarification_type` for backward compatibility

#### Orchestrator: `decideClarificationAction()`
Simple decision logic that determines whether to clarify or proceed:

```javascript
function decideClarificationAction(classification) {
  // Clarify if:
  // 1. clarification_needed === true (high risk + insufficient info)
  // 2. OR confidence < 0.5 (very uncertain)
  
  // Otherwise: proceed to answering
}
```

**Returns**:
```javascript
{
  action: "clarify" | "proceed",
  rationale: "High-risk decision (high) with insufficient info..."
}
```

#### Question Generator: `generateClarifyingQuestion()`
Template-based approach with smart fallbacks:

1. **Primary**: Uses `clarification_note` if present
2. **Secondary**: Pattern-matches `clarification_reasons[]` to templates
3. **Tertiary**: Falls back to legacy `clarification_type`
4. **Final**: Generic fallback

**Templates cover**:
- Timeline questions ("What's your timeline?")
- Income/replacement ("Do you have a plan for replacing income?")
- Purpose/use ("What's the main purpose?")
- Budget/amount ("What's your budget?")
- Execution plan ("How are you planning to execute?")
- Location context ("Where are you planning this?")
- Risk tolerance ("How comfortable are you with risk?")

#### Trace Logger
Simple debugging tool that tracks:
- Each step (classification, orchestration, question generation)
- Timestamps and durations
- Key data at each step
- Unique trace ID per run

#### CLI Enhancements
New flags:
```bash
# Original (classification only)
node tests/test_classification_direct.js "your query"

# NEW: Orchestrated flow (classify → decide → clarify/proceed)
node tests/test_classification_direct.js "your query" --orchestrate

# NEW: With trace logging
node tests/test_classification_direct.js "your query" --orchestrate --trace
```

### Step 2: End-to-End Test File ✅
**File**: `tests/test_flow_minimal.js`

**5 Test Scenarios** (all passing ✅):

#### Scenario 1: High-risk clarification required ✅
- **Query**: "Should I quit my job and go freelance?"
- **Expected**: clarify
- **Result**: ✅ PASS - Generated question: "To give you the best advice, I need a bit more info: Need income plan and timeline. Could you share that?"

#### Scenario 2: Low-risk proceed ✅
- **Query**: "How much did I spend last month?"
- **Expected**: proceed
- **Result**: ✅ PASS - Proceeds directly to answering

#### Scenario 3: Stock query proceed ✅
- **Query**: "What about Apple stock?"
- **Expected**: proceed
- **Result**: ✅ PASS - Proceeds directly with ticker=AAPL

#### Scenario 4: Affordability check proceed ✅
- **Query**: "Can I afford a $1500 trip to Italy?"
- **Expected**: proceed
- **Result**: ✅ PASS - Proceeds directly (has amount)

#### Scenario 5: Investment property clarification ✅
- **Query**: "I want to buy a second house as an investment"
- **Expected**: clarify
- **Result**: ✅ PASS - Generated question about purpose and execution plan

**Usage**:
```bash
# Run all scenarios
node tests/test_flow_minimal.js

# Run single query
node tests/test_flow_minimal.js "your query here" clarify
```

## How It Works (Flow)

```
┌─────────────────────────────────────────────────┐
│  User Query: "Should I quit my job?"            │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Step 1: CLASSIFICATION                         │
│  - Intent: ask_personalized                     │
│  - Risk: high                                   │
│  - Sufficiency: insufficient                    │
│  - Clarification needed: true                   │
│  - Reasons: [income_replacement, timeline]      │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Step 2: ORCHESTRATION DECISION                 │
│  decideClarificationAction()                    │
│  → Action: CLARIFY                              │
│  → Rationale: High-risk + insufficient info     │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Step 3: GENERATE CLARIFYING QUESTION           │
│  generateClarifyingQuestion()                   │
│  → "Do you have a plan for replacing your       │
│     income? For example, savings runway,        │
│     side income, or client pipeline?"           │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  🛑 STOP - Wait for user reply                  │
└─────────────────────────────────────────────────┘
```

For queries that **don't need clarification**:
```
Step 1: Classification → Step 2: Decide (PROCEED) → Step 3: [Placeholder] Answer
```

## Key Design Decisions

### ✅ Minimal & Practical
- No mocks, uses real model calls
- Template-based question generation (deterministic)
- Simple orchestration logic (no complex rules)

### ✅ Extensible
- `clarification_reasons[]` is free-form (not rigid enum)
- Can add new templates easily
- Schema validator accepts superset fields

### ✅ Observable
- Trace logging with timestamps
- Clear step-by-step output
- Rationale for every decision

### ✅ Tested
- 5/5 scenarios passing
- Covers both clarify and proceed paths
- Edge cases tested (high-risk, low-risk, stock queries)

## Examples

### Example 1: Clarification Required
```bash
$ node tests/test_classification_direct.js "Should I quit my job and go freelance?" --orchestrate

📋 Step 1: Classification
  ✅ Intent: ask_personalized
  ✅ Risk: high, Sufficiency: insufficient
  ✅ Clarification needed: true
  ✅ Reasons: income_replacement_plan, timeline_missing

🤔 Step 2: Orchestration Decision
  ✅ Action: CLARIFY
  ✅ Rationale: High-risk decision (high) with insufficient info (insufficient)

💬 Step 3: Generate Clarifying Question
  💬 Question: "To give you the best advice, I need a bit more info: Need income plan and timeline. Could you share that?"

🛑 Flow stops here. Waiting for user reply...
```

### Example 2: Proceed Directly
```bash
$ node tests/test_classification_direct.js "How much did I spend last month?" --orchestrate

📋 Step 1: Classification
  ✅ Intent: ask_personalized
  ✅ Risk: low, Sufficiency: sufficient
  ✅ Clarification needed: false

🤔 Step 2: Orchestration Decision
  ✅ Action: PROCEED
  ✅ Rationale: Sufficient info to proceed (risk: low, sufficiency: sufficient, confidence: 0.95)

✅ Step 3: Proceed to Answering
  ℹ️  [Placeholder] Would fetch user data and generate answer here
```

## What's Next (Not Yet Implemented)

### Stage 3: Port to api/finny.js
- Add feature flag `FINNY_CLASSIFY_FLOW=true`
- Integrate with existing Finny infrastructure
- Replace placeholder with real answer generation
- Add state management for multi-turn clarification

### Future Enhancements
- Few-shot question generation (if templates not sufficient)
- Answer planner (data fetching strategy)
- Answer synthesizer (personalized response generation)
- Multi-turn clarification (handle follow-up questions)
- Privacy guardrails (minimal data exposure in classification)

## Files Changed/Created

### Modified
- ✅ `tests/test_classification_direct.js` - Upgraded with schema v1.1, orchestrator, question generator, trace logger, CLI flags

### Created
- ✅ `tests/test_flow_minimal.js` - End-to-end test with 5 scenarios
- ✅ `Roadmap/finny.txt` - Original roadmap document
- ✅ `Roadmap/STEP1_STEP2_COMPLETE.md` - This summary

## Test Results

```
================================================================================
📊 TEST SUMMARY
================================================================================

Results: 5/5 passed

✅ 1. High-risk query requiring clarification
✅ 2. Low-risk query that should proceed
✅ 3. Stock query that should proceed
✅ 4. Affordability check that should proceed
✅ 5. Another high-risk query requiring clarification

🎉 All tests passed!
```

## Constraints Met

✅ **Minimal**: No overengineering, simple template approach  
✅ **No Mocks**: Uses real free model + fallback  
✅ **Wait for Reply**: Clarification stops and waits (no auto-proceed)  
✅ **Test-First**: Everything built and tested in test files first  

---

**Status**: Steps 1 & 2 Complete ✅  
**Next**: Ready for Stage 3 (api/finny.js integration)

## Update: Stricter Stock Query Detection (Fixed APR Issue)

### Problem
- APR (Annual Percentage Rate) was being mistaken for a stock ticker
- "What about Apple?" was classified as stock_query without explicit stock context

### Solution
Made stock detection much stricter:

**New Rules:**
1. **Must have explicit stock context keywords**: "stock", "ticker", "shares", "invest in [company]"
2. **OR explicit ticker symbol**: All-caps ticker (AAPL, TSLA, MSFT)
3. **Finance acronyms explicitly excluded**: APR, APY, HSA, IRA, 401k, CD, ARM, FSA
4. **Company name alone → ask_personalized**: "Apple" without "stock" context is NOT stock_query

**Test Results:**
```bash
✅ "What's the APR?" → ask_personalized (not stock_query)
✅ "What's my HSA balance?" → ask_personalized (not stock_query)
✅ "What about Apple?" → ask_personalized (no stock context)
✅ "Tell me about Apple stock" → stock_query (has "stock" keyword)
✅ "Tell me about AAPL" → stock_query (ticker symbol)
```

### Why This Matters
- **Fewer false positives**: Finance terms won't trigger stock queries
- **Better UX**: Users asking about APR, HSA, etc. get relevant answers
- **More conservative**: When unclear, defaults to ask_personalized (safer)

**Commit**: Reduced stock query prompt bloat by ~60% and made detection strict
