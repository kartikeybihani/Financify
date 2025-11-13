# Token Refresh Testing Guide

## Overview

This document describes how to test the token refresh fixes to ensure the app never gets stuck during `TOKEN_REFRESHED` events.

## What Was Fixed

1. **Session State Synchronization**: Session is now updated BEFORE navigation state, preventing stale token reads
2. **Removed Duplicate Calls**: Eliminated double `updateNavigationState` calls during `TOKEN_REFRESHED`
3. **Fresh Token Utility**: Created `getFreshAccessToken()` that always fetches latest token from Supabase client
4. **Automatic Retry**: `authenticatedFetch()` automatically retries on 401 errors with fresh tokens
5. **Updated All API Calls**: All manual token extractions now use the fresh token utility

## Testing Scenarios

### 1. Development Server Long-Running Test

**Purpose**: Simulate the exact scenario where the issue occurred

**Steps**:
1. Start the dev server: `npx expo start`
2. Log in to the app
3. Leave the app running for **at least 1 hour** (tokens typically refresh every hour)
4. During this time, periodically:
   - Send messages in chat
   - Navigate between screens
   - Make database operations (view accounts, goals, etc.)
5. Watch the logs for `TOKEN_REFRESHED` events
6. **Expected**: App continues working normally, no stuck loading screens, no failed API calls

**Success Criteria**:
- ✅ `TOKEN_REFRESHED` appears in logs
- ✅ App continues functioning immediately after refresh
- ✅ No "stuck loading" screens
- ✅ Database operations succeed
- ✅ Chat API calls succeed

---

### 2. Manual Token Refresh Trigger

**Purpose**: Force a token refresh to test the fix immediately

**Steps**:
1. Log in to the app
2. Open React Native Debugger or add this code temporarily:
   ```typescript
   // In a component, add:
   useEffect(() => {
     const interval = setInterval(async () => {
       await supabase.auth.refreshSession();
     }, 5000); // Refresh every 5 seconds for testing
     return () => clearInterval(interval);
   }, []);
   ```
3. Watch logs for `TOKEN_REFRESHED` events
4. Immediately after seeing `TOKEN_REFRESHED`:
   - Send a chat message
   - Navigate to different screens
   - Check database operations
5. **Expected**: Everything works immediately, no delays or failures

**Success Criteria**:
- ✅ Token refresh happens
- ✅ All operations succeed immediately after refresh
- ✅ No 401 errors in network tab
- ✅ No stuck loading states

---

### 3. Background/Foreground Transition Test

**Purpose**: Test token refresh when app returns from background

**Steps**:
1. Log in to the app
2. Leave app open for 30+ minutes
3. Put app in background (press home button)
4. Wait 5 minutes
5. Bring app to foreground
6. Immediately:
   - Send a chat message
   - Navigate between screens
   - Check if data loads correctly
7. **Expected**: Token refreshes if needed, app works normally

**Success Criteria**:
- ✅ App resumes normally
- ✅ Token refresh happens if needed
- ✅ No authentication errors
- ✅ All features work immediately

---

### 4. Network Interruption Test

**Purpose**: Test behavior when network is interrupted during token refresh

**Steps**:
1. Log in to the app
2. Enable airplane mode
3. Wait 10 seconds
4. Disable airplane mode (reconnect)
5. Immediately send a chat message or navigate
6. **Expected**: Token refreshes automatically, app recovers gracefully

**Success Criteria**:
- ✅ App recovers from network interruption
- ✅ Token refresh succeeds after reconnection
- ✅ No stuck states
- ✅ Operations succeed after reconnection

---

### 5. Multiple Rapid API Calls Test

**Purpose**: Test race conditions when multiple API calls happen during token refresh

**Steps**:
1. Log in to the app
2. Trigger token refresh manually (see test #2)
3. **Immediately** (within 1 second) trigger multiple operations:
   - Send 3 chat messages rapidly
   - Navigate to home screen
   - Navigate to goals screen
   - Navigate to insights screen
4. **Expected**: All operations succeed, no failures

**Success Criteria**:
- ✅ All API calls succeed
- ✅ No 401 errors
- ✅ No duplicate operations
- ✅ UI updates correctly

---

### 6. Production-Like Test (Recommended)

**Purpose**: Simulate real production usage patterns

**Steps**:
1. Build a production build: `eas build --platform ios` or `eas build --platform android`
2. Install on device
3. Use the app normally for **2+ hours**:
   - Send messages
   - View accounts
   - Check goals
   - Navigate between screens
4. Monitor for any issues
5. **Expected**: Smooth operation throughout, no issues

**Success Criteria**:
- ✅ No crashes
- ✅ No stuck loading screens
- ✅ All features work throughout session
- ✅ Token refreshes happen silently in background

---

## Monitoring & Verification

### What to Watch For

**In Logs**:
- `🔐 Auth: TOKEN_REFRESHED` - Should appear periodically
- `[AUTH_TOKEN]` - Should show successful token fetches
- No `401` errors in network requests
- No `Invalid user on token refresh` errors

**In App**:
- Loading screens should appear briefly and disappear
- No infinite loading states
- Smooth navigation between screens
- Chat messages send successfully
- Database operations complete successfully

**In Network Tab** (if using React Native Debugger):
- All API calls should have `Authorization: Bearer <token>` header
- No 401 Unauthorized responses
- Responses should be 200 OK

---

## Automated Testing (Future Enhancement)

Consider adding automated tests:

```typescript
// Example test structure (not implemented yet)
describe('Token Refresh', () => {
  it('should handle TOKEN_REFRESHED without breaking app', async () => {
    // Mock token refresh event
    // Verify session updates
    // Verify API calls succeed
  });
  
  it('should retry failed requests with fresh token', async () => {
    // Mock 401 error
    // Verify retry with fresh token
    // Verify success
  });
});
```

---

## Troubleshooting

### If You Still See Issues

1. **Check Logs**: Look for `[AUTH_TOKEN]` errors
2. **Verify Token**: Add temporary logging:
   ```typescript
   const token = await getFreshAccessToken();
   console.log('Token length:', token?.length);
   ```
3. **Check Network**: Verify API calls are using correct headers
4. **Verify Session**: Check if `supabase.auth.getSession()` returns valid session

### Common Issues

**Issue**: Still seeing 401 errors
- **Solution**: Ensure all API calls use `authenticatedFetch()` or `getFreshAccessToken()`

**Issue**: App still gets stuck
- **Solution**: Check if `updateNavigationState` is being called multiple times (should only be once per event)

**Issue**: Token refresh happens but operations fail
- **Solution**: Verify session is updated BEFORE operations start (check `AuthNavigationContext.tsx`)

---

## Success Metrics

After implementing these fixes, you should see:

- ✅ **Zero** stuck loading screens during token refresh
- ✅ **Zero** 401 errors in production logs
- ✅ **100%** success rate for API calls after token refresh
- ✅ **< 1 second** delay between token refresh and app functionality resuming

---

## Notes

- Token refresh typically happens every **1 hour** in Supabase
- The fix ensures tokens are always fresh when making API calls
- Database operations via Supabase client work automatically (no changes needed)
- Only manual API calls to your backend needed updates (now fixed)

---

## Questions?

If you encounter any issues during testing, check:
1. Are all API calls using `authenticatedFetch()` or `getFreshAccessToken()`?
2. Is `AuthNavigationContext` updating session before navigation state?
3. Are there any remaining direct `session?.access_token` reads?

