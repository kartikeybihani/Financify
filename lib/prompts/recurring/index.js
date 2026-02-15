/**
 * Recurring transaction analysis prompts.
 */

/**
 * Builds a prompt for Finny to analyze recurring transactions from transaction history.
 * Used when user connects a new account or clicks "Do a quick analysis".
 * Scans last 4 months to find patterns Plaid may have missed; avoids duplicating Plaid's findings.
 *
 * @param {Array<{date: string, amount: number, name: string, merchant_name?: string, category?: string}>} transactions
 * @param {Array<{description: string, merchant_name?: string, stream_id?: string}>} plaidStreams - Recurring streams already detected by Plaid (so LLM doesn't duplicate)
 * @returns {string} - Formatted prompt for LLM
 */
export function buildRecurringAnalysisPrompt(transactions, plaidStreams = []) {
  const txSummary = (transactions || [])
    .map((tx) => {
      const name = tx.merchant_name || tx.name || "Unknown";
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      const date = tx.date || "";
      const category = tx.category || tx.top_category || tx.new_category || "";
      return `- ${date} | ${name} | $${amount.toFixed(2)} | ${category}`;
    })
    .join("\n");

  const plaidList =
    (plaidStreams || []).length > 0
      ? `PLAID ALREADY DETECTED (do NOT list these again — Plaid has them):
${plaidStreams
  .map(
    (s) => `- ${s.merchant_name || s.description || s.stream_id || "Unknown"}`,
  )
  .join("\n")}

`
      : "";

  const prompt = `You are Finny, a financial coach. Analyze these transactions (last 4 months) to find recurring patterns that Plaid may have MISSED.

${plaidList}TRANSACTIONS:
${txSummary || "No transactions available"}

TASK:
1. Find RECURRING patterns Plaid did NOT already detect (see list above). Do NOT duplicate Plaid's findings.
2. For each pattern you find that is NOT in Plaid's list, CLASSIFY:
   - newly_found_subscriptions: True recurring subscriptions Plaid missed (Spotify, Netflix, gym, software) — ONLY if you see multiple tx with same merchant and similar amounts
   - credit_card_payments_to_ignore: User paying credit card bill (Chase, Amex, Wells Fargo CCPYMT, ACH PMT)
   - peer_payments: ONLY Venmo (reliable recurring P2P pattern). Do NOT include Zelle — Zelle is often one-off (rent, bills); only Venmo typically shows recurring peer behavior
   - newly_found_income: ONLY clear recurring income — payroll, DIRECT DEPOSIT, interest, dividend. Must see 2+ tx. EXCLUDE: "REMOTE ONLINE DEPOSIT", "PAYPAL", wire transfers, random deposits, "ORIG CO NAME", one-off transfers
   - recurring_fees: Bank CHARGES that recur (wire fee, maintenance fee) — money OUT. Do NOT put "Monthly Interest Paid" here (that's income)

3. For each item: merchant (exact name from transactions), frequency, typical_amount (must match actual tx amounts), transaction_count
4. Write a brief summary. Mention newly found vs Plaid.

Return ONLY valid JSON:
{
  "summary": "Brief insight.",
  "newly_found_subscriptions": [
    { "merchant": "GoDaddy", "frequency": "monthly", "typical_amount": 11.30, "transaction_count": 2 }
  ],
  "credit_card_payments_to_ignore": [
    { "merchant": "AMERICAN EXPRESS ACH PMT", "reason": "User paying credit card bill" }
  ],
  "peer_payments": [
    { "merchant": "Venmo", "frequency": "biweekly", "note": "Peer payments" }
  ],
  "newly_found_income": [
    { "merchant": "DIRECT DEPOSIT PAYROLL", "frequency": "biweekly", "typical_amount": 2500, "transaction_count": 8 }
  ],
  "recurring_fees": [
    { "merchant": "Domestic incoming wire fee", "frequency": "monthly", "typical_amount": 25, "transaction_count": 3, "note": "Bank fee user gets charged" }
  ]
}

CRITICAL RULES:
- NEVER hallucinate. Only list merchants you SEE in the transaction list above. If unsure, omit.
- newly_found_subscriptions: Must see 2+ transactions with that merchant. Use exact typical_amount from those tx.
- peer_payments: Venmo only. Do NOT list Zelle — it is often one-off, not recurring.
- newly_found_income: Only payroll, direct deposit, interest. No REMOTE ONLINE DEPOSIT, no generic PAYPAL — those are often random/one-off.
- recurring_fees: Bank charges (wire fee, maintenance) that recur — useful for user to know they're being charged.
- credit_card_payments_to_ignore: ACH PMT, CCPYMT, card payment descriptions.

Return ONLY the JSON object, no other text.`;

  return prompt;
}
