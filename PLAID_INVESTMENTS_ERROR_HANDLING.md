# Plaid Investments - Error Handling & Retry Logic

## Overview
Enhanced error handling and retry logic has been added to the Plaid investments implementation to improve reliability and resilience.

## Changes Made

### 1. **Retry Utility Functions**

#### `retryOperation` (in `webhook.js`)
- Exponential backoff retry mechanism
- Configurable max retries (default: 3)
- Skips retry for non-retryable errors (401, 400)
- Logs each retry attempt with context

#### `retryPlaidOperation` (in `store_accounts.js`)
- Specialized for Plaid API calls
- Handles rate limiting (429) with longer delays
- Respects `Retry-After` headers
- Skips retry for authentication/validation errors

### 2. **Webhook Handler Improvements** (`webhook.js`)

#### Asynchronous Processing
- Webhook handler now processes asynchronously
- Returns 200 immediately to Plaid (prevents retries)
- Processes sync in background

#### Error Logging
- `logWebhookError` function logs errors for monitoring
- Includes item_id, error type, and timestamp
- Ready for integration with error tracking services (Sentry, etc.)

#### Retry Logic
- Token fetching retries up to 3 times
- Holdings sync retries up to 3 times
- Each retry uses exponential backoff

### 3. **Holdings Upsert Improvements**

#### Fallback Strategy
- If batch upsert fails, attempts individual upserts
- Logs success/failure counts
- Continues processing even if some holdings fail

#### Error Handling
- Catches and logs individual holding errors
- Doesn't throw on partial failures
- Allows balance updates to proceed

### 4. **Balance Update Improvements**

#### Rollback Capability
- Backs up current balances before update
- If upsert fails, restores previous balances
- Maintains data integrity

#### Transaction-like Behavior
- Marks previous balances as `is_current = false` first
- Only proceeds with upsert if marking succeeds
- Rolls back if upsert fails

### 5. **Plaid API Call Retries** (`store_accounts.js`)

#### Retry for API Calls
- `investmentsHoldingsGet` retries on failure
- `investmentsTransactionsGet` retries on failure
- Handles rate limiting gracefully

## Error Handling Flow

### Webhook Processing Flow
```
1. Receive webhook → Return 200 immediately
2. Process asynchronously:
   a. Look up user_id (with error handling)
   b. Get access token (with retry)
   c. Sync holdings (with retry)
   d. Log errors for monitoring
```

### Holdings Sync Flow
```
1. Fetch from Plaid API (with retry)
2. Process holdings data
3. Upsert holdings:
   - Try batch upsert
   - If fails → Try individual upserts
   - Log partial failures
4. Mark removed holdings as inactive
5. Update balances (with rollback)
```

### Balance Update Flow
```
1. Backup current balances
2. Mark previous as not current
3. Upsert new balances
4. If fails:
   - Rollback: Restore previous balances
   - Log error
   - Throw to caller
```

## Retry Configuration

### Default Settings
- **Max Retries**: 3
- **Initial Delay**: 1000ms
- **Max Delay**: 10000ms
- **Backoff Multiplier**: 2x

### Rate Limiting
- **429 Errors**: Uses `Retry-After` header or 60s default
- **Max Wait**: 100s for rate limits

## Error Types

### Non-Retryable Errors
- **401 Unauthorized**: Authentication failed
- **400 Bad Request**: Invalid request (won't succeed on retry)
- **404 Not Found**: Resource doesn't exist

### Retryable Errors
- **500 Internal Server Error**: Server issues
- **503 Service Unavailable**: Temporary unavailability
- **429 Too Many Requests**: Rate limiting (special handling)
- **Network Errors**: Timeouts, connection issues

## Monitoring & Logging

### Error Logging
- All errors logged with context (item_id, operation name)
- Error types categorized for monitoring
- Timestamps included for debugging

### Success Metrics
- Holdings upserted count
- Balances updated count
- Retry attempt counts
- Rollback occurrences

## Testing Recommendations

### Test Scenarios
1. **Network Failures**: Simulate network timeouts
2. **Rate Limiting**: Test 429 error handling
3. **Partial Failures**: Test individual upsert fallback
4. **Rollback**: Test balance update rollback
5. **Concurrent Syncs**: Test multiple webhooks simultaneously

### Monitoring
- Track retry rates
- Monitor rollback frequency
- Alert on persistent failures
- Track error types distribution

## Future Enhancements

### Potential Improvements
1. **Job Queue**: Queue failed syncs for later retry
2. **Dead Letter Queue**: Store permanently failed syncs
3. **Circuit Breaker**: Stop retrying if service is down
4. **Metrics**: Track success rates, retry counts
5. **Alerting**: Alert on high failure rates

## Code Locations

### Files Modified
- `api/webhook.js`: Webhook handler, retry logic, error logging
- `api/store_accounts.js`: Initial sync, retry logic, rollback

### Key Functions
- `retryOperation()`: Generic retry utility
- `retryPlaidOperation()`: Plaid-specific retry
- `logWebhookError()`: Error logging
- `syncPlaidHoldings()`: Enhanced with retry and rollback
