# Memory Storage Flow - Step by Step

This document explains exactly when and how conversations are stored in Supermemory.

## Example Messages
1. "I want to save a thousand dollars for a vacation in Japan"
2. "I'm stressed about my credit card debt, I don't know how to pay it off"

---

## Complete Flow

### Step 1: User Sends Message
**Location:** Frontend → `/api/finny` endpoint

User types message and hits send. The message arrives at the API endpoint.

---

### Step 2: Request Processing & Classification
**Location:** `api/finny.js` - Main handler (around line 1000-1150)

```
1. Extract userId, chatId, message from request
2. Load conversation context (if exists)
3. Classify message intent (ask_personalized, goal_conversation, off_topic)
4. Route to appropriate handler (handleAsk, handleGoalConversation, etc.)
```

**For our examples:**
- Both messages → `handleAsk()` function (intent: "ask_personalized")

---

### Step 3: Build Context & Generate Response
**Location:** `api/finny.js` - `handleAsk()` function (around line 1411-2320)

```
1. Load user financial data (accounts, transactions, goals, etc.)
2. Build context packs (base, spend, invest, goals, cashflow)
3. Detect if web search is needed
4. Build system prompt with user context
5. Call LLM (OpenRouter) to generate Finny's response
6. Clean and format the response
```

**Key Point:** At this stage, NO memory storage has happened yet. We're just generating the response.

---

### Step 4: Topic Detection
**Location:** `api/finny.js` - `handleAsk()` function (around line 2378-2396)

**AFTER the response is generated**, we detect:
- Active topic (e.g., "goal_planning", "debt_management")
- Last entity (e.g., {type: "goal", amount: 1000})
- Pending action (if any)

```javascript
const topicDetection = detectConversationTopic(message, context?.conversationContext);
const contextMetadata = {
  active_topic: topicDetection.topic,
  last_entity: topicDetection.entity,
  pending_action: topicDetection.pending_action,
};
```

**For Example 1:** 
- Topic: "goal_planning"
- Entity: {type: "goal", amount: 1000, destination: "Japan"}

**For Example 2:**
- Topic: "debt_management"
- Entity: {type: "debt", concern: "credit_card"}
- Emotional state detected: "anxious"

---

### Step 5: Save Conversation Context (Supabase)
**Location:** `api/finny.js` - `handleAsk()` function (around line 2398-2411)

**SYNCHRONOUSLY** saves short-term conversation context to Supabase:
- Last 10 messages (5 exchanges)
- Active topic
- Last entity
- Pending actions

This is for immediate conversation continuity, NOT long-term memory.

```javascript
await updateConversationContext(
  context.user_id,
  context.chat_id,
  message,
  response.message,
  contextMetadata
);
```

---

### Step 6: Store in Supermemory (ASYNC, NON-BLOCKING)
**Location:** `api/finny.js` - `handleAsk()` function (around line 2413-2431)

**THIS IS WHERE SUPERMEMORY STORAGE HAPPENS**

```javascript
// Store conversation memory in Supermemory (async, non-blocking)
if (userId && cleanText) {
  setImmediate(async () => {
    try {
      await storeConversationMemory(userId, message, cleanText, {
        intent: intent,
        chat_id: context?.chat_id,
        topic: topicDetection?.topic,
        entity: topicDetection?.entity,
      });
    } catch (error) {
      console.error("❌ [FINNY] Failed to store conversation memory:", error);
      // Non-fatal, don't break conversation flow
    }
  });
}
```

**Key Points:**
- ✅ Happens **AFTER** response is generated
- ✅ Uses `setImmediate()` - **non-blocking** (doesn't delay response to user)
- ✅ Happens **asynchronously** in the background
- ✅ Includes: user message, Finny response, topic, entity, intent
- ✅ Errors are caught and logged but don't break the conversation

---

### Step 7: Return Response to User
**Location:** `api/finny.js` - `handleAsk()` function (around line 2433)

The response is returned to the user **immediately**. Supermemory storage happens in the background.

---

## Timeline Visualization

```
User sends: "I want to save $1000 for vacation in Japan"
    ↓
[1] Request received
    ↓
[2] Classify intent → "ask_personalized"
    ↓
[3] Load user data, build context, call LLM
    ↓
[4] Generate response: "That's a great goal! Let's break down..."
    ↓
[5] Detect topic: "goal_planning", entity: {amount: 1000, destination: "Japan"}
    ↓
[6] Save conversation context (Supabase) - SYNCHRONOUS
    ↓
[7] Return response to user ← USER SEES RESPONSE HERE
    ↓
[8] Store in Supermemory ← HAPPENS IN BACKGROUND (setImmediate)
    ↓
    ✅ Memory stored with:
       - Content: "User said: 'I want to save $1000...' Finny responded: 'That's a great goal...'"
       - Metadata: {context_type: "goal", tags: ["goal_mentioned", "travel_interest"], ...}
```

---

## What Gets Stored in Supermemory?

### Content:
```
User said: "I want to save a thousand dollars for a vacation in Japan"

Finny responded: [First 500 chars of Finny's response]
```

### Metadata (auto-extracted):
```json
{
  "user_id": "uuid-here",
  "timestamp": "2024-01-15T10:30:00Z",
  "context_type": "goal",
  "financial_relevance": "high",
  "tags": ["goal_mentioned", "travel_interest", "savings_discussion"],
  "emotional_state": "neutral",
  "financial_impact": "high",
  "intent": "ask_personalized",
  "chat_id": "chat-uuid",
  "topic": "goal_planning",
  "entity": {"type": "goal", "amount": 1000}
}
```

---

## Important Notes

### ⚡ Non-Blocking Design
- Storage happens **after** the user receives their response
- Uses `setImmediate()` to run in the next event loop tick
- User doesn't wait for storage to complete
- If storage fails, conversation continues normally

### 🔄 Multiple Storage Points
Storage happens in **3 places** (all async, non-blocking):

1. **Main conversation flow** (line 2413-2431)
   - Most common path
   - Regular ask_personalized conversations

2. **Stock query responses** (line 1775-1793)
   - When user asks about stocks
   - Includes stock_ticker in metadata

3. **Fallback stock analysis** (line 1857-1875)
   - When stock APIs fail
   - Includes fallback_used flag

### 🛡️ Error Handling
- All storage calls wrapped in try/catch
- Errors logged but don't throw
- Conversation flow never breaks due to storage failures

### 📊 What Triggers Storage?
- ✅ User sends a message
- ✅ Finny generates a response
- ✅ Both userId and response text exist
- ❌ Storage skipped if: no API key, no userId, or no response

---

## Example Flow for "I'm stressed about credit card debt"

```
[1] User: "I'm stressed about my credit card debt, I don't know how to pay it off"
    ↓
[2] Classify → "ask_personalized"
    ↓
[3] Load user data → Check for debt info
    ↓
[4] Generate response: "I understand that debt can feel overwhelming..."
    ↓
[5] Topic detection:
    - Topic: "debt_management"
    - Entity: {type: "debt", concern: "credit_card"}
    - Emotional state: "anxious" (detected from "stressed")
    ↓
[6] Save context (Supabase) - SYNCHRONOUS
    ↓
[7] Return response ← USER SEES THIS
    ↓
[8] Store in Supermemory ← BACKGROUND
    {
      "context_type": "constraint",
      "tags": ["debt_concern"],
      "emotional_state": "anxious",
      "financial_relevance": "high",
      "topic": "debt_management"
    }
```

---

## Summary

**Storage happens:**
- ✅ AFTER response is generated
- ✅ AFTER user receives their response
- ✅ ASYNCHRONOUSLY in the background
- ✅ NON-BLOCKING (doesn't delay user)

**Storage includes:**
- User's original message
- Finny's generated response
- Auto-extracted metadata (tags, context type, emotional state)
- Topic and entity detection results
- Intent and chat_id

**Storage is:**
- Safe (errors don't break conversation)
- Fast (doesn't block user response)
- Rich (includes full context and metadata)
