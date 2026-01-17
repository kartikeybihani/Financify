# Message Splitting Mechanism - Complete Analysis

## Current Flow (The Confusing Part)

### 1. **Backend Response Generation** (`api/finny.js`)

#### Streaming Mode (Current Default)
```
User Request → handleAsk() → LLM Response → Clean Message
                                                      ↓
                                    streamTextChunks() - sends word chunks via SSE
                                                      ↓
                                    sendStreamEvent("complete", { message: fullText })
```

**What happens:**
- Backend gets full LLM response
- Streams it word-by-word via `text_chunk` events (15 words per chunk)
- Sends final `complete` event with **entire message as single string**
- **NO splitting happens on backend for streaming**

#### Non-Streaming Mode (Backward Compatibility)
```
User Request → handleAsk() → LLM Response → Clean Message
                                                      ↓
                                    splitLongResponse() - splits into chunks
                                                      ↓
                                    Returns: { message: [chunk1, chunk2], isSplit: true }
```

**What happens:**
- Backend splits using `splitLongResponse()` (lines 3542-3639)
- Returns array of chunks with `isSplit: true` flag
- **Splitting happens on backend for non-streaming**

### 2. **Frontend Processing** (`src/hooks/useChat.ts`)

#### Streaming Response Handling
```
SSE Stream → text_chunk events → accumulate text
                              ↓
                    complete event → finalMessage (full string)
                              ↓
                    splitFinnyMessage(finalMessage) - splits again!
                              ↓
                    Creates multiple ChatMessage objects with IDs: messageId, messageId::2, messageId::3
```

**What happens:**
- Frontend receives complete message as single string
- **Frontend splits it again** using `splitFinnyMessage()` (lines 609-760)
- Creates multiple message bubbles with special IDs (`messageId::2`, etc.)
- All parts added synchronously to state

#### Non-Streaming Response Handling
```
JSON Response → { message: [chunks], isSplit: true }
                              ↓
                    handleSplitMessages() - processes array
                              ↓
                    pushChat() for each chunk with delays
```

**What happens:**
- Frontend receives pre-split array from backend
- Uses `handleSplitMessages()` to display them with delays
- **Backend already did the splitting**

## The Problem: Dual Splitting Logic

### Current Issues:

1. **Redundant Splitting**
   - Backend has `splitLongResponse()` (simple, paragraph-based)
   - Frontend has `splitFinnyMessage()` (sophisticated, respects code blocks, lists)
   - **Streaming uses frontend splitting only**
   - **Non-streaming uses backend splitting only**
   - Two different algorithms, different results!

2. **Inconsistent Behavior**
   - Streaming: Frontend splits (more sophisticated)
   - Non-streaming: Backend splits (simpler)
   - Same message could split differently depending on mode

3. **Code Duplication**
   - Two splitting implementations
   - Two sets of logic to maintain
   - Hard to keep in sync

4. **Backend Splitting is Unused**
   - `splitLongResponse()` only used for non-streaming
   - But streaming is always enabled (`useStreaming = true`)
   - Dead code path

## Current Splitting Algorithms

### Backend: `splitLongResponse()` (Simple)
- **Location:** `api/finny.js:3542-3639`
- **Strategy:**
  1. If < 600 chars → single message
  2. Split at double line breaks (`\n\n`)
  3. If chunks > 500 chars, split further
  4. Fallback: Split at sentence boundaries
- **Limitations:**
  - Doesn't respect code blocks
  - Doesn't respect list contexts
  - Simple paragraph/sentence splitting

### Frontend: `splitFinnyMessage()` (Sophisticated)
- **Location:** `src/hooks/useChat.ts:609-760`
- **Strategy:**
  1. Finds "strong breaks" (2+ blank lines)
  2. Finds "weak breaks" (single blank line) for long messages
  3. Validates splits:
     - Not inside code blocks (```)
     - Not inside list contexts
     - Not mid-sentence
     - Both parts >= 80 chars
  4. Aims for ~400 char chunks
  5. Max 4 parts
- **Advantages:**
  - Respects code formatting
  - Respects list structure
  - Better UX (smarter splits)

## Clean Options to Fix This

### Option 1: **Frontend-Only Splitting** (Recommended) ⭐

**Approach:**
- Remove backend splitting entirely
- Always send full message from backend
- Frontend handles all splitting

**Changes:**
```javascript
// Backend (api/finny.js)
// Remove splitLongResponse() usage
response = {
  message: cleanedMessage,  // Always single string
  type: "assistant",
  // Remove isSplit flag
};

// Frontend (useChat.ts)
// Keep splitFinnyMessage() - it's already better
// Works for both streaming and non-streaming
```

**Pros:**
- ✅ Single source of truth (frontend splitting logic)
- ✅ Consistent behavior (streaming = non-streaming)
- ✅ Better splitting algorithm (respects code/lists)
- ✅ Simpler backend code
- ✅ Easier to maintain

**Cons:**
- ⚠️ Slightly more work on frontend (but already doing it)
- ⚠️ Need to remove backend splitting code

**Effort:** Low (just remove backend splitting)

---

### Option 2: **Backend-Only Splitting**

**Approach:**
- Move sophisticated splitting to backend
- Backend sends pre-split chunks
- Frontend just displays them

**Changes:**
```javascript
// Backend (api/finny.js)
// Replace splitLongResponse() with sophisticated algorithm
// Send chunks in complete event:
sendStreamEvent(res, "complete", {
  message: splitParts,  // Array of chunks
  isSplit: splitParts.length > 1
});

// Frontend (useChat.ts)
// Remove splitFinnyMessage()
// Just display chunks as received
if (data.isSplit && Array.isArray(data.message)) {
  // Display each chunk
}
```

**Pros:**
- ✅ Single source of truth (backend)
- ✅ Consistent behavior
- ✅ Less frontend processing

**Cons:**
- ❌ More complex backend code
- ❌ Need to port sophisticated splitting logic
- ❌ Backend needs to know about UI concerns (code blocks, lists)
- ❌ Harder to iterate on splitting UX

**Effort:** Medium (port splitting logic to backend)

---

### Option 3: **Hybrid: Backend Hints, Frontend Decides**

**Approach:**
- Backend sends split suggestions (indices)
- Frontend validates and applies splits
- Best of both worlds

**Changes:**
```javascript
// Backend (api/finny.js)
const splitHints = findSplitCandidates(cleanedMessage);
sendStreamEvent(res, "complete", {
  message: cleanedMessage,
  splitHints: [{ index: 500, type: "paragraph" }, ...]
});

// Frontend (useChat.ts)
// Use hints but validate with sophisticated logic
const parts = applySplitHints(message, splitHints);
```

**Pros:**
- ✅ Backend can optimize (knows full message)
- ✅ Frontend validates (knows UI constraints)
- ✅ Flexible

**Cons:**
- ❌ Most complex
- ❌ Two systems to maintain
- ❌ Over-engineering

**Effort:** High (complex coordination)

---

### Option 4: **No Splitting - Let UI Handle It**

**Approach:**
- Don't split messages at all
- Use expandable/collapsible UI for long messages
- Or use native text scrolling

**Changes:**
```javascript
// Remove all splitting logic
// Just display full message
// Use UI patterns like:
// - Expandable text
// - Scrollable containers
// - "Read more" buttons
```

**Pros:**
- ✅ Simplest code
- ✅ No splitting bugs
- ✅ Better for very long messages

**Cons:**
- ❌ Different UX (might not want this)
- ❌ Need to redesign UI

**Effort:** Medium (UI changes)

---

## Recommendation: **Option 1 - Frontend-Only Splitting**

### Why?

1. **Frontend splitting is already better**
   - More sophisticated algorithm
   - Respects code blocks and lists
   - Better UX

2. **Simpler architecture**
   - Single splitting implementation
   - Easier to maintain
   - Less code duplication

3. **Already working**
   - Streaming already uses frontend splitting
   - Just need to remove backend splitting

4. **Frontend is the right place**
   - UI concerns (bubble sizes, formatting) belong in frontend
   - Backend shouldn't know about UI constraints

### Implementation Steps:

1. **Remove backend splitting:**
   ```javascript
   // api/finny.js:3326-3333
   // Remove this:
   const splitMessages = splitLongResponse(cleanedMessage);
   response = {
     message: splitMessages.length === 1 ? splitMessages[0].content : splitMessages,
     isSplit: splitMessages.length > 1,
   };
   
   // Replace with:
   response = {
     message: cleanedMessage,  // Always single string
     type: "assistant",
   };
   ```

2. **Remove backend splitting function:**
   ```javascript
   // api/finny.js:3542-3639
   // Delete splitLongResponse() function
   ```

3. **Update frontend to always split:**
   ```typescript
   // useChat.ts
   // Remove isSplit checks
   // Always use splitFinnyMessage() for non-action messages
   ```

4. **Remove handleSplitMessages:**
   ```typescript
   // useChat.ts:1266-1296
   // This is only for non-streaming backward compatibility
   // Can be removed if streaming is always enabled
   ```

5. **Clean up:**
   - Remove `isSplit` flag from types
   - Remove `handleSplitMessages` function
   - Update comments

### Result:
- ✅ Single splitting implementation
- ✅ Consistent behavior
- ✅ Simpler codebase
- ✅ Better splitting algorithm
- ✅ No more confusion

---

## Summary

**Current State:** Confusing dual splitting
- Backend splits for non-streaming (simple)
- Frontend splits for streaming (sophisticated)
- Two different algorithms, inconsistent results

**Recommended Fix:** Frontend-only splitting
- Remove backend splitting entirely
- Always use frontend's sophisticated algorithm
- Single source of truth, consistent behavior

**Effort:** Low (mostly deletion)
**Risk:** Low (frontend splitting already works)
**Benefit:** High (cleaner, simpler, more maintainable)
