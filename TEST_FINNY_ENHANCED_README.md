# Enhanced Finny Test Script

A comprehensive testing tool for the Finny system that allows you to test various functionalities without using the UI.

## Features

- 🎯 **Interactive Mode**: Real-time testing with a command-line interface
- 📊 **Batch Testing**: Run multiple test categories automatically
- 🧠 **Memory Testing**: Test memory storage and retrieval functionality
- ⚡ **Performance Testing**: Measure response times and success rates
- 🎨 **Colorized Output**: Easy-to-read console output with colors
- 📈 **Statistics**: Track testing results and performance metrics

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
   ```

## Usage

### Interactive Mode (Recommended)
```bash
node test_finny_enhanced.js
# or
npm run test-finny-enhanced
```

This opens an interactive session where you can:
- Type questions directly
- Use special commands (help, stats, clear, user <id>)
- See real-time results with detailed output
- Track testing statistics

### Test Specific Query
```bash
node test_finny_enhanced.js "What were my food expenses last month?"
```

### Batch Testing
```bash
# Run all test categories
node test_finny_enhanced.js --batch

# Test specific categories
node test_finny_enhanced.js --spending
node test_finny_enhanced.js --investments
node test_finny_enhanced.js --goals
node test_finny_enhanced.js --memory
```

### Performance Testing
```bash
node test_finny_enhanced.js --performance
```

### Help
```bash
node test_finny_enhanced.js --help
```

## Test Categories

### Spending Tests
Tests queries related to expense tracking and spending analysis:
- "What were my food expenses last month?"
- "How much did I spend on shopping this month?"
- "What's my biggest expense category?"
- "Break down my spending by category"

### Investment Tests
Tests queries related to investment portfolio and performance:
- "What are my current accounts and investments?"
- "Show me my investment portfolio"
- "What stocks do I own?"
- "How are my investments performing?"

### Goals Tests
Tests queries related to financial goals and planning:
- "Do you think I can achieve my goals?"
- "How am I doing with my savings goals?"
- "Can I afford to buy a house?"
- "What should I prioritize for my financial goals?"

### Account Tests
Tests queries related to account balances and net worth:
- "What are my account balances?"
- "Show me my bank accounts"
- "What's my total net worth?"
- "How much credit do I have available?"

### Memory Tests
Tests the memory system functionality:
- Stores user preferences and information
- Tests memory retrieval
- Verifies memory persistence

## Interactive Commands

When in interactive mode, you can use these special commands:

- `help` - Show available commands
- `stats` - Display testing statistics
- `clear` - Clear the screen
- `user <id>` - Change the user ID for testing
- `quit`/`exit`/`q` - Exit interactive mode

## Output Format

The script provides detailed output including:

- **Query Classification**: Shows detected intent
- **Response Time**: Measures how long each query takes
- **Context Packs**: Shows which data packs were used
- **Data Gaps**: Indicates any missing data
- **Success/Failure Status**: Clear indication of test results

### Example Output

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
ℹ️  Response time: 1247ms
ℹ️  Context packs used: base, spend
⚠️  Data gaps: 
```

## Performance Metrics

The script tracks:
- **Response Time**: Average, minimum, and maximum response times
- **Success Rate**: Percentage of successful queries
- **Error Analysis**: Detailed error reporting for failed tests
- **Category Breakdown**: Performance by test category

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Ensure your API server is running
   - Check that `APP_BASE_URL` is correct in your `.env` file

2. **User ID Issues**
   - Verify `TEST_USER_ID` is a valid user in your database
   - Use the `user <id>` command in interactive mode to change users

3. **Timeout Errors**
   - Increase timeout values if queries are taking too long
   - Check server performance and database connectivity

4. **Memory Issues**
   - Ensure the memory system is properly configured
   - Check database permissions for memory storage

### Debug Mode

For detailed debugging, you can modify the script to show more verbose output by setting `showDetails = true` in the `testFinnyQuery` function calls.

## Advanced Usage

### Custom Test Scenarios

You can modify the `TEST_CATEGORIES` object in the script to add your own test queries:

```javascript
const TEST_CATEGORIES = {
  custom: [
    "Your custom test query 1",
    "Your custom test query 2",
    // ... more queries
  ]
};
```

### Batch Testing Specific Categories

```bash
# Test only spending queries
node test_finny_enhanced.js --spending

# Test only investment queries  
node test_finny_enhanced.js --investments

# Test only goal-related queries
node test_finny_enhanced.js --goals
```

### Performance Benchmarking

The performance test runs multiple iterations of the same query to measure:
- Average response time
- Response time consistency
- Success rate under load
- System stability

## Integration with CI/CD

The script can be integrated into automated testing pipelines:

```bash
# Exit with error code if tests fail
node test_finny_enhanced.js --batch && echo "All tests passed" || exit 1
```

This makes it easy to include Finny testing in your deployment process.
