# SnapTrade Investments Integration Setup Guide

## 🚀 **Complete Setup Instructions**

### **1. Database Setup**

Execute these SQL files in your Supabase SQL editor in this order:

1. **Create Tables**: `snaptrade_schema.sql`
2. **Create Vault Functions**: `snaptrade_vault_functions.sql` 
3. **Create RLS Policies**: `snaptrade_rls_policies.sql`

### **2. Environment Variables**

Add these to your Supabase Edge Functions environment:

```bash
SNAPTRADE_CLIENT_ID=your_client_id
SNAPTRADE_CONSUMER_KEY=your_consumer_key
```

### **3. Deploy Supabase Functions**

```bash
# Deploy the credential storage function
supabase functions deploy store-snaptrade-credentials

# Deploy the sync function  
supabase functions deploy sync-investments
```

### **4. API Integration**

#### **Store SnapTrade Credentials**
```javascript
// Call this when user connects their SnapTrade account
const response = await fetch('/functions/v1/store-snaptrade-credentials', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user-uuid',
    snaptrade_user_id: 'snaptrade-user-id',
    account_id: 'snaptrade-account-uuid',
    user_secret: 'snaptrade-user-secret',
    connection_id: 'optional-connection-id',
    brokerage_name: 'Fidelity',
    account_name: 'My Investment Account',
    account_type: 'investment'
  })
});
```

#### **Sync Investments Data**
```javascript
// Call this to sync holdings, options, and balances
const response = await fetch('/functions/v1/sync-investments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user-uuid',
    snaptrade_user_id: 'snaptrade-user-id',
    account_id: 'snaptrade-account-uuid'
  })
});
```

### **5. Database Tables Created**

#### **`snaptrade_connections`**
- Stores SnapTrade connection metadata
- Links to Vault for secure credential storage
- Tracks sync status and connection health

#### **`investment_holdings`**
- Regular stock/ETF/crypto positions
- Includes market value, P&L, cost basis
- Supports multiple currencies and exchanges

#### **`investment_options`**
- Option positions (calls/puts)
- Includes strike price, expiration, underlying info
- Handles mini options and contract multipliers

#### **`investment_balances`**
- Account cash, buying power, equity
- Margin information
- Historical balance tracking

### **6. Security Features**

✅ **Secure Credential Storage**: User secrets stored in Supabase Vault  
✅ **Row Level Security**: Users can only access their own data  
✅ **Encrypted Communication**: All API calls use HTTPS  
✅ **Audit Trail**: Tracks sync timestamps and connection status  

### **7. Data Sync Strategy**

- **Real-time**: Balances and positions updated on demand
- **Cached**: SnapTrade provides cached data (varies by brokerage)
- **Manual Refresh**: Use sync function for latest data
- **Error Handling**: Graceful fallbacks for API failures

### **8. Next Steps**

1. **Test the setup** with a sample SnapTrade account
2. **Create API endpoints** in your existing API structure
3. **Build UI components** to display holdings and options
4. **Add real-time updates** using Supabase subscriptions
5. **Implement error handling** and user notifications

### **9. API Endpoints to Create**

You'll need to create these in your existing API structure:

- `POST /api/snaptrade/connect` - Store credentials
- `POST /api/snaptrade/sync` - Sync investments data  
- `GET /api/snaptrade/holdings` - Get user holdings
- `GET /api/snaptrade/options` - Get user options
- `GET /api/snaptrade/balances` - Get account balances

### **10. Integration with Existing Plaid Flow**

The SnapTrade integration follows the same pattern as your Plaid integration:

- **Secure storage** in Vault (like Plaid tokens)
- **RLS policies** for data isolation
- **Sync functions** for data updates
- **Error handling** for connection issues

This gives you a unified approach for both Plaid (banking) and SnapTrade (investments) data!
