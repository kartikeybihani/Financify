# Finny API Test Script

A quick and easy way to test the Finny API without going through the full app interface.

## Usage

### Run All Predefined Tests
```bash
# Using npm script
npm run test-finny-all

# Or directly with node
node test-finny.js
```

### Test a Custom Query
```bash
# Using npm script
npm run test-finny "Chase Sapphire Preferred benefits"

# Or directly with node
node test-finny.js "Chase Sapphire Preferred benefits"
```

### Show Help
```bash
node test-finny.js --help
```

## Predefined Test Queries

The script includes these test queries to verify different functionality:

1. "What are the Chase Ultimate card benefits?"
2. "Which is better chase sapphire card or Amex platinum?"
3. "Which is a better chase sapphire card or bilt card?"
4. "What is the 2025 estate tax exemption?"
5. "Chase Sapphire Preferred vs Amex Gold"
6. "What are the benefits of the Bilt Rewards card?"
7. "Compare Chase Sapphire Reserve vs Amex Platinum"
8. "What is the 2025 IRA contribution limit?"
9. "Chase Freedom Unlimited benefits"
10. "Amex Gold card annual fee and benefits"

## Features

- **Colored Output**: Easy-to-read colored console output
- **Response Time Tracking**: Shows how long each request takes
- **Error Handling**: Graceful error handling with detailed error messages
- **Multiple Test Modes**: Run all tests or test individual queries
- **Rate Limiting**: Built-in delays between requests to be respectful to the API

## Example Output

```
🚀 Testing: "Chase Sapphire Preferred benefits"

================================================================================
Query: Chase Sapphire Preferred benefits
Status: 200
================================================================================
Intent: ask_fact_fresh
Cached: false

Response:
Chase Sapphire Preferred Card Benefits: $95 annual fee

The Chase Sapphire Preferred card offers a $95 annual fee with comprehensive travel and dining rewards. You earn 2X points on travel and dining purchases, 1X point on all other purchases, and 25% more value when redeeming through Chase Ultimate Rewards. The card includes valuable travel protections, no foreign transaction fees, and a generous sign-up bonus of 60,000 points after spending $4,000 in the first 3 months. This makes it an excellent choice for travelers who want premium benefits without the high annual fee of premium cards.

Source: https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred

Type: assistant

⏱️  Response time: 2341ms
```

## Troubleshooting

- **Connection Issues**: Make sure you have internet connectivity
- **API Errors**: Check that the Finny API is deployed and accessible
- **Permission Issues**: Make sure the script is executable (`chmod +x test-finny.js`)

## Customization

You can modify the `TEST_QUERIES` array in the script to add your own test queries, or change the API endpoint if you're testing against a different deployment.
