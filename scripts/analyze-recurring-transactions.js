#!/usr/bin/env node

/**
 * CLI Script: Finny Recurring Transaction Analysis
 * Runs LLM analysis, saves to finny_recurring_analysis, upserts Finny items into recurring_streams.
 *
 * Usage:
 *   node scripts/analyze-recurring-transactions.js --user-id <uuid>
 *   node scripts/analyze-recurring-transactions.js --user-id <uuid> --item-id <plaid_item_id>
 */

import "dotenv/config";
import { supabase } from "../lib/api/supabase.js";
import { runRecurringAnalysis } from "../lib/recurringAnalysis.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { userId: null, itemId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user-id" && args[i + 1]) {
      out.userId = args[i + 1];
      i++;
    } else if (args[i] === "--item-id" && args[i + 1]) {
      out.itemId = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Finny Recurring Analysis - Analyze last 4 months with LLM, save to DB.

Usage:
  node scripts/analyze-recurring-transactions.js --user-id <uuid>
  node scripts/analyze-recurring-transactions.js --user-id <uuid> --item-id <plaid_item_id>
`);
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const { userId, itemId } = parseArgs();
  if (!userId) {
    console.error("Error: --user-id is required. Use --help for usage.");
    process.exit(1);
  }

  console.log("📊 Finny Recurring Analysis");
  console.log("  user_id:", userId);
  if (itemId) console.log("  item_id:", itemId);
  console.log("");

  try {
    const result = await runRecurringAnalysis(supabase, userId, itemId, "manual");

    if (result.reason === "no_transactions") {
      console.log("  No transactions to analyze. Exiting.");
      process.exit(0);
    }

    console.log("  Saved to finny_recurring_analysis:", result.analysisId);
    console.log("  Upserted", result.upserted, "Finny streams to recurring_streams");
    console.log("\n--- Summary ---");
    console.log(result.analysisJson?.summary || "No summary");
    console.log("\n--- Enriched JSON ---");
    console.log(JSON.stringify(result.analysisJson, null, 2));
  } catch (err) {
    console.error("Fatal:", err);
    process.exit(1);
  }
}

main();
