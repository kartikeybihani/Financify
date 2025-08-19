# API Migration Guide

## Overview
Your API has been consolidated from 15 files to 7 files to stay within Vercel's 12-file free plan limit.

## File Changes

### ✅ New Consolidated Files:
- `api/plaid.js` - Combines: accounts, transactions, investments, liabilities, identity, institution
- `api/link_tokens.js` - Combines: create_link_token, create_update_link_token  
- `api/finny.js` - Combines: finny/ask, finny/classify, finny/goal

### ❌ Deleted Files:
- `api/create_link_token.js`
- `api/create_update_link_token.js`
- `api/accounts.js`
- `api/transactions.js`
- `api/investments.js`
- `api/liabilities.js`
- `api/identity.js`
- `api/institution.js`
- `api/finny/ask.js`
- `api/finny/classify.js`
- `api/finny/goal.js`

### 🔄 Remaining Files (unchanged):
- `api/exchange_public_token.js`
- `api/remove_item.js`
- `api/webhook.js`
- `api/fire_webhook.js`

## Frontend Code Updates

### 1. Plaid Data Endpoints

**Before:**
```javascript
// Individual calls
const accountsResponse = await fetch('/api/accounts', {
  method: 'POST',
  body: JSON.stringify({ access_token })
});

const transactionsResponse = await fetch('/api/transactions', {
  method: 'POST', 
  body: JSON.stringify({ access_token })
});
```

**After:**
```javascript
// Single consolidated call
const accountsResponse = await fetch('/api/plaid', {
  method: 'POST',
  body: JSON.stringify({ 
    endpoint: 'accounts',
    access_token 
  })
});

const transactionsResponse = await fetch('/api/plaid', {
  method: 'POST',
  body: JSON.stringify({ 
    endpoint: 'transactions',
    access_token 
  })
});
```

**Available endpoints:**
- `'accounts'`
- `'transactions'`
- `'investments'`
- `'liabilities'`
- `'identity'`
- `'institution'`

### 2. Link Token Endpoints

**Before:**
```javascript
// Create new link token
const createResponse = await fetch('/api/create_link_token', {
  method: 'POST'
});

// Update existing link token
const updateResponse = await fetch('/api/create_update_link_token', {
  method: 'POST',
  body: JSON.stringify({ access_token })
});
```

**After:**
```javascript
// Create new link token
const createResponse = await fetch('/api/link_tokens', {
  method: 'POST',
  body: JSON.stringify({ mode: 'create' })
});

// Update existing link token
const updateResponse = await fetch('/api/link_tokens', {
  method: 'POST',
  body: JSON.stringify({ 
    mode: 'update',
    access_token 
  })
});
```

### 3. Finny AI Endpoints

**Before:**
```javascript
// Ask Finny
const askResponse = await fetch('/api/finny/ask', {
  method: 'POST',
  body: JSON.stringify({ message, context })
});

// Classify message
const classifyResponse = await fetch('/api/finny/classify', {
  method: 'POST',
  body: JSON.stringify({ message, context })
});
```

**After:**
```javascript
// Ask Finny
const askResponse = await fetch('/api/finny', {
  method: 'POST',
  body: JSON.stringify({ 
    action: 'ask',
    message, 
    context 
  })
});

// Classify message
const classifyResponse = await fetch('/api/finny', {
  method: 'POST',
  body: JSON.stringify({ 
    action: 'classify',
    message, 
    context 
  })
});

// Goal-related actions
const goalResponse = await fetch('/api/finny', {
  method: 'POST',
  body: JSON.stringify({ 
    action: 'goal',
    message, 
    context,
    // additional goal parameters
  })
});
```

**Available actions:**
- `'ask'`
- `'classify'`
- `'goal'`

## Benefits

1. **Reduced API file count**: From 15 to 7 files
2. **Better organization**: Related functionality grouped together
3. **Easier maintenance**: Fewer files to manage
4. **Consistent error handling**: Unified error responses
5. **Vercel compatibility**: Stays within free plan limits

## Testing

After updating your frontend code, test each endpoint to ensure:
- All data is returned correctly
- Error handling works as expected
- Authentication flows still function
- Webhook processing continues to work

## Rollback Plan

If you need to rollback, you can:
1. Restore the deleted files from git history
2. Revert frontend changes
3. The original endpoints will work as before

## Support

If you encounter any issues during migration, check:
1. Network tab for API call errors
2. Console logs for detailed error messages
3. Vercel function logs for server-side issues
