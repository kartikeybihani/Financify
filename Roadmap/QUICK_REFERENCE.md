# Quick Reference: Classification + Orchestration System

## Running Tests

### Single Query Tests
```bash
# Classification only (original mode)
node tests/test_classification_direct.js "your query here"

# Full orchestrated flow (classify → decide → clarify/proceed)
node tests/test_classification_direct.js "your query here" --orchestrate

# With trace logging
node tests/test_classification_direct.js "your query here" --orchestrate --trace
```

### Test Suites
```bash
# End-to-end flow (5 scenarios)
node tests/test_flow_minimal.js

# Hardball tests (edge cases)
node tests/test_classification_direct.js hardball

# Stock query tests
node tests/test_classification_direct.js stock

# Clarification tests
node tests/test_classification_direct.js clarify
```

## Schema v1.1 Quick Reference

### Classification Output
```javascript
{
  // Core
  intent: "ask_personalized" | "goal_conversation" | "stock_query" | "off_topic",
  decision_risk: "low" | "medium" | "high",
  info_sufficiency: "sufficient" | "partial" | "insufficient",
  
  // NEW: Clarification (extensible)
  clarification_needed: boolean,
  clarification_reasons: ["timeline_missing", "income_plan_unclear", ...],
  clarification_note: "Need income plan and timeline",
  requested_context: ["timeline", "income", "purpose"],
  
  // Other
  confidence: 0.95,
  needs_web: false,
  needs_user_data: true
}
```

### Orchestration Decision
```javascript
{
  action: "clarify" | "proceed",
  rationale: "High-risk decision (high) with insufficient info (insufficient)"
}
```

## Common Patterns

### Pattern 1: High-Risk Clarification
**Input**: "Should I quit my job and go freelance?"  
**Classification**: risk=high, sufficiency=insufficient  
**Decision**: clarify  
**Question**: "Do you have a plan for replacing your income?"

### Pattern 2: Low-Risk Proceed
**Input**: "How much did I spend last month?"  
**Classification**: risk=low, sufficiency=sufficient  
**Decision**: proceed  
**Action**: Fetch user data and generate answer

### Pattern 3: Stock Query Proceed
**Input**: "What about Apple stock?"  
**Classification**: stock_query, ticker=AAPL  
**Decision**: proceed  
**Action**: Analyze stock

## Adding New Clarification Templates

Edit `generateClarifyingQuestion()` in `tests/test_classification_direct.js`:

```javascript
if (reason.includes('YOUR_NEW_REASON')) {
  return "Your clarifying question here?";
}
```

## Key Functions

### `handleClassify(message, context)`
Returns classification with schema v1.1

### `decideClarificationAction(classification)`
Returns `{ action: "clarify"|"proceed", rationale: "..." }`

### `generateClarifyingQuestion(classification, userMessage)`
Returns a clarifying question string

### `testOrchestrated(message, enableTrace)`
Runs full flow: classify → decide → clarify/proceed

## Next Steps

1. ✅ Test and validate (DONE - 5/5 passing)
2. ⏳ Port to api/finny.js with feature flag
3. ⏳ Add real user data fetching
4. ⏳ Add state management for multi-turn clarification
