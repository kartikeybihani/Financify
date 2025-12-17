# Supermemory Storage Test Examples

Use these examples to test the memory storage functionality. Each example tests different aspects of the system.

## Quick Examples (Simple, Fast Tests)

### 1. Simple Goal Mention
**User Message:** "I want to save $5000 for a vacation to Japan"

**What to Check:**
- ✅ Memory stored with `context_type: "goal"`
- ✅ Tags include: `goal_mentioned`, `travel_interest`, `savings_discussion`
- ✅ `financial_relevance: "high"`
- ✅ `financial_impact: "high"` (has amounts, goals, and timeline implied)
- ✅ `emotional_state: "neutral"` or `"excited"` (depending on tone)

**Expected Metadata:**
```json
{
  "context_type": "goal",
  "financial_relevance": "high",
  "tags": ["goal_mentioned", "travel_interest", "savings_discussion"],
  "financial_impact": "high"
}
```

---

### 2. Debt Concern
**User Message:** "I'm stressed about my credit card debt. I owe $8,000 and don't know how to pay it off"

**What to Check:**
- ✅ Memory stored with `context_type: "constraint"`
- ✅ Tags include: `debt_concern`
- ✅ `emotional_state: "anxious"`
- ✅ `financial_relevance: "high"`
- ✅ `financial_impact: "medium"` (has amounts and goals)

**Expected Metadata:**
```json
{
  "context_type": "constraint",
  "financial_relevance": "high",
  "tags": ["debt_concern"],
  "emotional_state": "anxious",
  "financial_impact": "medium"
}
```

---

## Easy Examples (Moderate Complexity)

### 3. Purchase Decision with Context
**User Message:** "Can I afford to buy a MacBook? It costs $2,500 and I make $80k a year"

**What to Check:**
- ✅ Memory stored with `context_type: "decision"`
- ✅ Tags include: `purchase_interest`
- ✅ `financial_relevance: "high"`
- ✅ `financial_impact: "medium"` (has amounts)
- ✅ Metadata includes income context

**Expected Metadata:**
```json
{
  "context_type": "decision",
  "financial_relevance": "high",
  "tags": ["purchase_interest"],
  "financial_impact": "medium"
}
```

---

### 4. Life Event (Job Change)
**User Message:** "I just got a raise! My salary went from $70k to $85k. What should I do with the extra money?"

**What to Check:**
- ✅ Memory stored with `context_type: "life_event"`
- ✅ Tags include: `income_discussion`
- ✅ `emotional_state: "excited"`
- ✅ `financial_relevance: "high"`
- ✅ Contains salary change information

**Expected Metadata:**
```json
{
  "context_type": "life_event",
  "financial_relevance": "high",
  "tags": ["income_discussion"],
  "emotional_state": "excited",
  "financial_impact": "medium"
}
```

---

## Hard Example (Complex Scenario)

### 5. Multi-Faceted Financial Question
**User Message:** "I'm confused about my retirement planning. I'm 35, make $90k, have $50k in my 401k, and want to retire at 60 with $2 million. I also have $15k in credit card debt that I'm paying off. Should I prioritize paying off debt or increasing my 401k contributions? I'm worried I'm behind."

**What to Check:**
- ✅ Memory stored with multiple relevant tags
- ✅ Tags include: `investment_discussion`, `debt_concern`, `goal_mentioned`
- ✅ `context_type: "decision"` or `"goal"` (complex, may have multiple)
- ✅ `emotional_state: "confused"` or `"anxious"`
- ✅ `financial_relevance: "high"`
- ✅ `financial_impact: "high"` (has amounts, timelines, and goals)
- ✅ Rich metadata capturing all financial details

**Expected Metadata:**
```json
{
  "context_type": "decision",
  "financial_relevance": "high",
  "tags": [
    "investment_discussion",
    "debt_concern",
    "goal_mentioned"
  ],
  "emotional_state": "confused",
  "financial_impact": "high"
}
```

---

## How to Test

1. **Send each message** to Finny via the chat interface
2. **Check the console logs** for:
   - `✅ [SUPERMEMORY] Stored memory for user {userId}: {id}`
   - Any error messages: `❌ [SUPERMEMORY] Error storing memory:`
3. **Verify in Supermemory dashboard** (if available) that memories are stored with correct:
   - Content (user message + Finny response)
   - Metadata (tags, context_type, emotional_state, etc.)
   - Container tags (`user_{userId}`)

## What to Look For

### ✅ Success Indicators:
- Console shows successful storage for each message
- No errors in logs
- Memories appear in Supermemory with correct metadata
- Container tags properly isolate user data

### ⚠️ Potential Issues:
- Missing API key: `⚠️ [SUPERMEMORY] API key not configured`
- API errors: Check error message for details
- Missing userId: `⚠️ [SUPERMEMORY] No userId provided`
- Incorrect metadata: Tags or context types don't match expected values

## Testing Checklist

- [ ] Quick Example 1: Goal mention stores correctly
- [ ] Quick Example 2: Debt concern with emotional state
- [ ] Easy Example 3: Purchase decision with amounts
- [ ] Easy Example 4: Life event (salary change)
- [ ] Hard Example 5: Complex multi-faceted question
- [ ] Verify all memories have correct `containerTags`
- [ ] Verify metadata is properly structured
- [ ] Check that errors don't break conversation flow
