# Supermemory API Optimization Analysis

## Current Issues

### 1. **Timeout Configuration**
- **Current**: 15 seconds (`SUPERMEMORY_FETCH_TIMEOUT_MS = 15000`)
- **Location**: `lib/memoryUtils.js:579`
- **Problem**: Too long - users wait unnecessarily when Supermemory is slow
- **Impact**: From logs, timeout is triggering after 15 seconds, blocking the entire request

### 2. **Blocking Memory/Profile Loading**

#### In `handleOffTopic` (api/finny.js:6340-6352)
```javascript
const [loadedMemory, loadedProfile] = await Promise.all([
  loadUserMemory(userId, messageText).catch(...),
  fetchSupermemoryProfile(userId).catch(...),
]);
```
- **Problem**: `Promise.all` waits for BOTH promises, even if one is slow
- **Impact**: If memory search times out (15s), profile also waits, blocking response
- **Current behavior**: Both calls use 15s timeout, so worst case = 15s delay

#### In `handleAsk` (api/finny.js:1436-1440)
```javascript
const [loadedMemory, profileData, feedback] = await Promise.all([
  memoryPromise,
  profilePromise,
  feedbackPromise,
]);
```
- **Problem**: Similar blocking behavior
- **Impact**: All three must complete before proceeding

### 3. **Other Supermemory Call Sites**

#### `loadUserMemory` calls:
- `api/finny.js:1395` - In memory loading logic (blocking)
- `api/finny.js:1405` - Empty query case (blocking)
- `api/finny.js:2594` - Stock query context (blocking)
- `api/goals.js:1934` - Goal creation memory search (has timeout wrapper but still blocking)

#### `fetchSupermemoryProfile` calls:
- `api/finny.js:6345` - In handleOffTopic (blocking via Promise.all)
- `api/memory.js:141` - In memory API endpoint (blocking)

#### `searchSupermemoryMemories` calls:
- `lib/memoryUtils.js:426` - Inside loadUserMemory (blocking)
- `lib/memoryUtils.js:3220` - Feedback patterns retrieval (blocking)
- `api/goals.js:1934` - Goal memories (has timeout wrapper)

### 4. **Storage Operations (Less Critical)**
- `storeConversationMemory` - Already non-blocking (uses `setImmediate`)
- `storeGoalCreationMemory` - Should check if blocking

## Proposed Solutions

### Solution 1: Reduce Timeout to 5 Seconds
**Change**: `SUPERMEMORY_FETCH_TIMEOUT_MS` from 15000 → 5000
**Files**: 
- `lib/memoryUtils.js:579`
- `tests/test_memory_search.js:21` (if needed)

### Solution 2: Make Memory/Profile Loading Non-Blocking with Race Condition

#### For `handleOffTopic`:
Instead of:
```javascript
const [loadedMemory, loadedProfile] = await Promise.all([...])
```

Use:
```javascript
// Race against a 5-second timeout, return defaults if timeout wins
const memoryPromise = loadUserMemory(userId, messageText)
  .catch(() => ({ memories: [], totalCount: 0 }));

const profilePromise = fetchSupermemoryProfile(userId)
  .catch(() => null);

// Race: get results within 5 seconds, or use defaults
const timeoutPromise = new Promise(resolve => 
  setTimeout(() => resolve({ timeout: true }), 5000)
);

const [memoryResult, profileResult] = await Promise.all([
  Promise.race([memoryPromise, timeoutPromise]).then(r => 
    r.timeout ? { memories: [], totalCount: 0 } : r
  ),
  Promise.race([profilePromise, timeoutPromise]).then(r => 
    r.timeout ? null : r
  )
]);
```

**Better approach**: Use `Promise.allSettled` with individual timeouts:
```javascript
const memoryPromise = Promise.race([
  loadUserMemory(userId, messageText),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Memory timeout')), 5000)
  )
]).catch(() => ({ memories: [], totalCount: 0 }));

const profilePromise = Promise.race([
  fetchSupermemoryProfile(userId),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Profile timeout')), 5000)
  )
]).catch(() => null);

const [loadedMemory, loadedProfile] = await Promise.all([
  memoryPromise,
  profilePromise
]);
```

### Solution 3: Create Non-Blocking Wrapper Function

Create a helper in `lib/memoryUtils.js`:
```javascript
/**
 * Load user memory with timeout fallback (non-blocking)
 * Returns empty memories if timeout occurs
 */
async function loadUserMemoryWithTimeout(userId, query, timeoutMs = 5000) {
  return Promise.race([
    loadUserMemory(userId, query),
    new Promise((resolve) => 
      setTimeout(() => resolve({ memories: [], totalCount: 0 }), timeoutMs)
    )
  ]);
}

/**
 * Fetch profile with timeout fallback (non-blocking)
 * Returns null if timeout occurs
 */
async function fetchSupermemoryProfileWithTimeout(userId, timeoutMs = 5000) {
  return Promise.race([
    fetchSupermemoryProfile(userId),
    new Promise((resolve) => 
      setTimeout(() => resolve(null), timeoutMs)
    )
  ]);
}
```

### Solution 4: Update All Call Sites

1. **handleOffTopic** (api/finny.js:6340)
   - Use non-blocking wrappers
   - Don't wait more than 5 seconds total

2. **handleAsk** (api/finny.js:1436)
   - Apply same pattern to memory/profile/feedback loading

3. **Stock queries** (api/finny.js:2594)
   - Use non-blocking memory loading

4. **Goals** (api/goals.js:1934)
   - Already has timeout wrapper, but verify it's 5s

### Solution 5: Improve Error Handling

- Log timeout warnings (not errors) when Supermemory is slow
- Don't fail the entire request if Supermemory times out
- Consider adding metrics/monitoring for timeout frequency

## Implementation Plan

### Phase 1: Reduce Timeout (Quick Win)
1. Change `SUPERMEMORY_FETCH_TIMEOUT_MS` to 5000
2. Update test file if needed

### Phase 2: Non-Blocking Memory Loading
1. Create wrapper functions in `lib/memoryUtils.js`
2. Update `handleOffTopic` to use wrappers
3. Update `handleAsk` to use wrappers
4. Update other critical call sites

### Phase 3: Monitoring & Optimization
1. Add timeout metrics/logging
2. Consider caching strategies for frequently accessed data
3. Evaluate if some calls can be made truly async (fire-and-forget)

## Expected Impact

- **Before**: Up to 15 seconds wait time when Supermemory is slow
- **After**: Maximum 5 seconds wait, with graceful fallback to empty/defaults
- **User Experience**: Faster responses, especially for off-topic queries
- **Reliability**: Better resilience to Supermemory API issues

## Risk Assessment

- **Low Risk**: Timeout reduction (already has error handling)
- **Medium Risk**: Non-blocking changes (need to ensure fallbacks work correctly)
- **Mitigation**: Test with Supermemory API down/slow scenarios

## Testing Checklist

- [ ] Test with Supermemory API responding normally (< 1s)
- [ ] Test with Supermemory API slow (3-4s response)
- [ ] Test with Supermemory API timing out (> 5s)
- [ ] Test with Supermemory API completely down
- [ ] Verify off-topic handler still works without memories
- [ ] Verify handleAsk works with partial memory/profile data
- [ ] Check logs for proper timeout warnings (not errors)
