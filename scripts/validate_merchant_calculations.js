/**
 * Validation Script for Merchant Transaction Calculations
 * 
 * This script validates that our calculation logic matches SQL expectations
 * Run this after running the SQL test queries to verify consistency
 */

// Test data structure matching what we get from RPC
const testTransactions = [
  { amount: 20, name: "Zelle payment to Siddharth", date: "2026-01-15" }, // sent
  { amount: 26, name: "Zelle payment to Diego", date: "2026-01-12" }, // sent
  { amount: 1, name: "Zelle payment to Siddharth", date: "2026-01-02" }, // sent
  { amount: -2000, name: "Zelle payment from MEGHA", date: "2025-12-24" }, // received
  { amount: -150, name: "Zelle payment from KEVIN", date: "2025-12-24" }, // received
  { amount: 0, name: "Zelle adjustment", date: "2025-12-01" }, // neutral (should be ignored)
];

// Simulate our calculation logic
function calculateTotals(transactions) {
  let totalSent = 0;
  let totalReceived = 0;
  let sentCount = 0;
  let receivedCount = 0;

  transactions.forEach((txn) => {
    const amount = Number(txn.amount) || 0;
    if (amount > 0) {
      totalSent += amount;
      sentCount++;
    } else if (amount < 0) {
      totalReceived += Math.abs(amount);
      receivedCount++;
    }
    // amount === 0 is ignored
  });

  return {
    total_sent: totalSent,
    total_received: totalReceived,
    sent_count: sentCount,
    received_count: receivedCount,
    txn_count: transactions.length,
    total_spend: totalSent + totalReceived,
  };
}

// Run validation
const results = calculateTotals(testTransactions);

console.log("📊 Validation Results:");
console.log("====================");
console.log(`Total Sent: $${results.total_sent} (${results.sent_count} transactions)`);
console.log(`Total Received: $${results.total_received} (${results.received_count} transactions)`);
console.log(`Total Spend (legacy): $${results.total_spend}`);
console.log(`Total Count: ${results.txn_count} transactions`);

// Expected results
const expected = {
  total_sent: 47, // 20 + 26 + 1
  total_received: 2150, // 2000 + 150
  sent_count: 3,
  received_count: 2,
  txn_count: 6,
  total_spend: 2197, // 47 + 2150
};

// Validate
console.log("\n✅ Validation Checks:");
console.log("====================");
const checks = [
  { name: "Total Sent", actual: results.total_sent, expected: expected.total_sent },
  { name: "Total Received", actual: results.total_received, expected: expected.total_received },
  { name: "Sent Count", actual: results.sent_count, expected: expected.sent_count },
  { name: "Received Count", actual: results.received_count, expected: expected.received_count },
  { name: "Total Spend", actual: results.total_spend, expected: expected.total_spend },
];

let allPassed = true;
checks.forEach((check) => {
  const passed = check.actual === check.expected;
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} ${check.name}: ${check.actual} (expected: ${check.expected})`);
  if (!passed) allPassed = false;
});

if (allPassed) {
  console.log("\n🎉 All validation checks passed!");
} else {
  console.log("\n⚠️ Some validation checks failed. Review the calculation logic.");
  process.exit(1);
}
