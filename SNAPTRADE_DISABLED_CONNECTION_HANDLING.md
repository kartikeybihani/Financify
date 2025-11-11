# SnapTrade Disabled Connection Handling

## Overview

This document explains how the system handles disabled SnapTrade investment account connections and guides users through reconnection.

## Problem

SnapTrade connections can become disabled when:
- User changes password at the brokerage
- User explicitly removes access at the brokerage
- Session expires and requires re-authentication
- Other brokerage-specific reasons

When disabled, API calls return `402` status with error code `3003`.

## Solution Layers

We've implemented a **multi-layered approach** to detect and handle disabled connections:

### 1. **Proactive Check Before Refresh** 
**Location:** `api/plaid.js` - `handleSnapTradeRefresh()`

Before attempting to refresh data, we now:
- Call SnapTrade's `detailBrokerageAuthorization` API to check if connection is disabled
- Update our database if the connection status has changed
- Return `402` error with reconnection details if disabled

**Benefits:**
- Prevents unnecessary API calls to disabled connections
- Provides immediate feedback to the user
- Updates database proactively

### 2. **402 Error Detection and Handling**
**Location:** `src/utils/snaptrade.ts` - `refreshSnaptradeInvestments()`

When refresh API returns `402`:
- Creates a special error object with `requiresReconnect: true` flag
- Includes `connectionId` for reconnection flow
- Status code and error details

**Location:** `app/investments/index.tsx` - `handleManualRefresh()`

Catch handler specifically checks for:
- `err.statusCode === 402`
- `err.code === "CONNECTION_DISABLED"`  
- `err.requiresReconnect === true`

When detected:
- Updates UI state to show reconnection prompt
- Reloads connections from database
- Displays user-friendly error message

### 3. **Webhook Notifications**
**Location:** `api/webhook.js`

Handles SnapTrade webhooks:
- `CONNECTION_BROKEN` - when connection is disabled
- `CONNECTION_FIXED` - when connection is reconnected
- `CONNECTION_FAILED` - when connection attempt fails

Updates database `snaptrade_connections` table:
- Sets `is_active = false`
- Sets `connection_status = 'disabled'`
- Records timestamp

### 4. **Database Status Check**
**Location:** Database queries throughout the app

Before any operation, checks database status:
```sql
SELECT is_active, connection_status 
FROM snaptrade_connections 
WHERE user_id = ? AND account_id = ?
```

If `is_active = false` or `connection_status = 'disabled'`, shows reconnection UI.

### 5. **(Optional) Periodic Polling**
For extra reliability, you can add periodic status checks as a backup to webhooks.

## Reconnection Flow

When a disabled connection is detected:

1. **UI displays reconnection prompt** with clear message
2. **User clicks "Reconnect" button**
3. **System calls** `reconnectSnaptradeConnection()` with `connection_id`
4. **SnapTrade opens** Connection Portal in reconnect mode
5. **User authenticates** at their brokerage
6. **Webhook fires** `CONNECTION_FIXED` event
7. **Database updated** to `is_active = true`, `connection_status = 'active'`
8. **User can continue** using the app

## Key Features

### ✅ Already Implemented

- **Proactive status checking** before refresh attempts
- **402 error detection and handling** in multiple layers
- **Webhook handlers** for connection status changes
- **UI reconnection prompts** and flow
- **Database synchronization** of connection status
- **Comprehensive error messages** to guide users

### 📝 Recommended (Optional)

- **Periodic polling** (every 24 hours) as backup to webhooks
- **Connection status indicator** in UI (green/red badge)
- **Notification banner** when connection becomes disabled
- **Automatic retry** with exponential backoff

## Testing

To test the disabled connection flow:

1. **Manually disable** connection in SnapTrade dashboard
2. **Click refresh** in investments section
3. **Verify** you see reconnection prompt
4. **Click reconnect** and complete flow
5. **Verify** data syncs after reconnection

## API Endpoints

### Check Connection Status
```javascript
POST /api/plaid
{
  "mode": "snaptrade_check_status",
  "userId": "user_id",
  "accountId": "account_id"
}
```

### Get Connection Details
```javascript
POST /api/plaid
{
  "mode": "snaptrade_get_connection_details",
  "userId": "user_id",
  "accountId": "account_id"
}
```

Returns `402` if disabled with:
```json
{
  "error": "Connection is disabled",
  "code": "CONNECTION_DISABLED",
  "requiresReconnect": true,
  "connectionId": "uuid",
  "disabledDate": "2025-10-30T10:09:33.406479Z"
}
```

## Database Schema

```sql
snaptrade_connections:
- is_active: boolean (false when disabled)
- connection_status: text ('active' | 'disabled' | 'error' | 'pending')
- connection_id: text (required for reconnection)
- updated_at: timestamp
```

## Webhook Configuration

Ensure webhook URL is set in SnapTrade Dashboard:
```
https://your-app.vercel.app/api/webhook
```

Environment variable (optional):
```
SNAPTRADE_WEBHOOK_SECRET=your_secret_here
```

## Related Files

- `api/plaid.js` - Backend handlers
- `api/webhook.js` - Webhook handlers  
- `src/utils/snaptrade.ts` - Frontend API calls
- `app/investments/index.tsx` - UI and error handling
- `tables.txt` - Database schema reference

## SnapTrade Documentation References

- [Fix Disabled Connections](https://docs.snaptrade.com/docs/fix-broken-connections)
- [Webhooks](https://docs.snaptrade.com/docs/webhooks)
- [Get Connection Detail API](https://docs.snaptrade.com/reference/Connections/Connections_detailBrokerageAuthorization)

## Summary

The system now has robust detection and handling of disabled connections:

1. ✅ **Before refresh** - Proactive status check via API
2. ✅ **During refresh** - 402 error detection and handling
3. ✅ **Via webhooks** - Real-time notifications from SnapTrade
4. ✅ **Via database** - Status check before any operation
5. ✅ **User guidance** - Clear reconnection flow in UI

This multi-layered approach ensures users are always notified when their connection needs attention, with minimal disruption to their experience.

