# Quick Finny Test Setup

## 🚀 Fast Start

1. **Set your test user ID**:
   ```bash
   export TEST_USER_ID="your-actual-user-id-here"
   ```

2. **Test a single query**:
   ```bash
   node test_finny_simple.js "What were my food expenses last month?"
   ```

3. **Run all tests**:
   ```bash
   node test_finny_simple.js
   ```

## 🎯 What to Look For

### ✅ Good Signs (Context Planner Working):
- **Spend queries** show: `📦 Context packs used: base, spend`
- **Investment queries** show: `📦 Context packs used: base, invest`  
- **Goals queries** show: `📦 Context packs used: base, goals`
- **No data gaps** or minimal gaps
- **Specific, accurate responses** based on actual data

### ❌ Bad Signs (Old System):
- Missing context packs
- Generic responses
- "I don't have that data" errors
- Inconsistent responses to similar queries

## 🔧 Troubleshooting

**"Connection refused"**: Make sure your API server is running
**"User not found"**: Set a valid `TEST_USER_ID`
**"No data"**: User needs to have connected accounts and transactions

## 📝 Example Commands

```bash
# Test spend analysis
node test_finny_simple.js "How much did I spend on food last month?"

# Test investment queries  
node test_finny_simple.js "What stocks do I own?"

# Test goals feasibility
node test_finny_simple.js "Can I afford to buy a house?"

# Test general financial health
node test_finny_simple.js "How am I doing financially?"
```

The new context planner should give you **consistent, data-driven responses** every time! 🎉
