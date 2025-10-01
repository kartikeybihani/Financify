# Finny Test Script

This script allows you to test Finny responses directly without using the UI, making it easy to verify the new context planner functionality.

## Setup

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env` file in the project root with:
   ```env
   APP_BASE_URL=http://localhost:3000
   TEST_USER_ID=your-actual-user-id
   ```

3. **Make sure your API is running**:
   ```bash
   npm start
   # or however you normally start your app
   ```

## Usage

### Test a specific query:
```bash
node test_finny.js "What were my food expenses last month?"
node test_finny.js "What are my current accounts and investments?"
node test_finny.js "Do you think I can achieve my goals?"
```

### Run all predefined tests:
```bash
node test_finny.js
```

### Using npm scripts:
```bash
npm run test-finny "Your question here"
npm run test-finny-all
```

## What the script tests:

### Spend Queries (should get `spend_total` + `txns_by_category`):
- "What were my food expenses last month?"
- "How much did I spend on shopping last month?"
- "What were my transportation costs this month?"

### Investment Queries (should get `summary_min` + `invest_holdings`):
- "What are my current accounts and investments?"
- "Show me my investment portfolio"
- "What stocks do I own?"
- "How is my retirement planning going?"

### Goals Queries (should get `goals_overview` + `cashflow_monthly`):
- "Do you think I can achieve my goals?"
- "How am I doing with my savings goals?"
- "Can I afford to buy a house?"

### Account Queries (should get `summary_min` only):
- "What are my account balances?"
- "Show me my bank accounts"

### General Queries (should get `summary_min`):
- "What's my net worth?"
- "How am I doing financially?"

## Expected Output

The script will show:
1. **Classification result** - What intent was detected
2. **Finny's response** - The actual answer
3. **Context packs used** - Which data packs were included
4. **Data gaps** - Any missing data (if applicable)

## Debugging

If you see errors:
1. Make sure your API server is running
2. Check that `TEST_USER_ID` is a valid user in your database
3. Verify your `.env` file has the correct `APP_BASE_URL`
4. Check the console logs for detailed error messages

## Example Output

```
🧪 Testing: "What were my food expenses last month?"
👤 User ID: test-user-123
────────────────────────────────────────────────────────────────────────────────
🎯 Step 1: Classifying message...
✅ Classification: ask
🤖 Step 2: Asking Finny...
✅ Response received:
────────────────────────────────────────
Based on your spending data for last month, you spent $247.50 on food across 12 transactions. Your main food expenses were at grocery stores ($156.30) and restaurants ($91.20). This is about 15% of your total spending for the month.
────────────────────────────────────────
📦 Context packs used: base, spend
⚠️  Data gaps: 
```

This confirms the context planner is working correctly - it fetched both the base summary and spend data for the food category query.
