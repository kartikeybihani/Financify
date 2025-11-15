/**
 * CLI Script: Backfill Recurring Transaction Categories (JavaScript version)
 * Run: node scripts/backfill-recurring-categories.js --user-id YOUR_ID [--dry-run|--live]
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: Supabase credentials not found");
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getCategoryFromStreamType(streamType) {
  const mapping = {
    subscription: "Subscriptions",
    income: "Income",
    bill: "Housing",
    other: "Other",
  };
  return mapping[streamType] || null;
}

async function backfillRecurringCategories(userId, dryRun = true) {
  console.log(
    `\n🔄 Starting backfill (${
      dryRun ? "DRY RUN" : "LIVE"
    }) for user ${userId.substring(0, 8)}...\n`
  );

  const stats = {
    totalTransactions: 0,
    linkedToStreams: 0,
    categoriesSet: 0,
    flagsSet: 0,
    skipped: 0,
  };

  const changes = [];

  try {
    // Get all active recurring streams
    const { data: streams, error: streamsError } = await supabase
      .from("recurring_streams")
      .select("stream_id, stream_type, transaction_ids, merchant_name")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (streamsError)
      throw new Error(`Failed to fetch streams: ${streamsError.message}`);

    if (!streams || streams.length === 0) {
      console.log("No active recurring streams found");
      return { success: true, stats, changes };
    }

    console.log(`Found ${streams.length} active recurring streams`);

    // Build transaction map
    const transactionToStreamMap = new Map();
    streams.forEach((stream) => {
      if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
        stream.transaction_ids.forEach((txId) => {
          transactionToStreamMap.set(txId, {
            streamId: stream.stream_id,
            streamType: stream.stream_type,
            merchantName: stream.merchant_name || "Unknown",
          });
        });
      }
    });

    const transactionIds = Array.from(transactionToStreamMap.keys());
    console.log(`Found ${transactionIds.length} transaction IDs in streams`);

    if (transactionIds.length === 0) {
      console.log("No transactions to backfill");
      return { success: true, stats, changes };
    }

    // Fetch transactions in batches
    const batchSize = 1000;
    for (let i = 0; i < transactionIds.length; i += batchSize) {
      const batchIds = transactionIds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(transactionIds.length / batchSize);

      console.log(
        `\nProcessing batch ${batchNum}/${totalBatches} (${batchIds.length} transactions)`
      );

      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select(
          "id, plaid_transaction_id, name, recurring_stream_id, new_category, if_recurring"
        )
        .eq("user_id", userId)
        .in("plaid_transaction_id", batchIds);

      if (txError) {
        console.error(`Error fetching batch ${batchNum}:`, txError);
        continue;
      }

      if (!transactions || transactions.length === 0) {
        console.log(`No transactions found for batch ${batchNum}`);
        continue;
      }

      stats.totalTransactions += transactions.length;

      const updates = [];

      transactions.forEach((tx) => {
        const streamData = transactionToStreamMap.get(tx.plaid_transaction_id);
        if (!streamData) {
          stats.skipped++;
          return;
        }

        const update = { id: tx.id };
        let hasChanges = false;

        // Link to stream
        if (!tx.recurring_stream_id) {
          update.recurring_stream_id = streamData.streamId;
          hasChanges = true;
          stats.linkedToStreams++;
          changes.push({
            transactionName: tx.name || "Unknown",
            change: "link_stream",
            streamType: streamData.streamType,
          });
        }

        // Set flag
        if (tx.if_recurring !== "yes") {
          update.if_recurring = "yes";
          hasChanges = true;
          stats.flagsSet++;
        }

        // Set category (only if NULL)
        if (!tx.new_category) {
          const categoryToSet = getCategoryFromStreamType(
            streamData.streamType
          );
          if (categoryToSet && streamData.streamType !== "other") {
            update.new_category = categoryToSet;
            hasChanges = true;
            stats.categoriesSet++;
            changes.push({
              transactionName: tx.name || "Unknown",
              change: "set_category",
              to: categoryToSet,
              streamType: streamData.streamType,
            });
          }
        }

        if (hasChanges) {
          updates.push(update);
        } else {
          stats.skipped++;
        }
      });

      // Apply updates
      if (!dryRun && updates.length > 0) {
        console.log(`Applying ${updates.length} updates...`);
        const { error: updateError } = await supabase
          .from("transactions")
          .upsert(updates, { onConflict: "id", ignoreDuplicates: false });

        if (updateError) {
          console.error(`Error updating batch ${batchNum}:`, updateError);
        } else {
          console.log(`✅ Successfully updated batch ${batchNum}`);
        }
      } else if (dryRun && updates.length > 0) {
        console.log(`DRY RUN: Would update ${updates.length} transactions`);
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log(`Backfill Complete (${dryRun ? "DRY RUN" : "LIVE"})`);
    console.log("=".repeat(60));
    console.log(`Total transactions processed: ${stats.totalTransactions}`);
    console.log(`Linked to streams: ${stats.linkedToStreams}`);
    console.log(`Categories set: ${stats.categoriesSet}`);
    console.log(`Flags set: ${stats.flagsSet}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log("=".repeat(60));

    if (dryRun) {
      console.log("\n💡 This was a DRY RUN - no changes were applied");
      console.log("💡 Run with --live to apply changes\n");
    }

    // Show sample changes
    if (changes.length > 0) {
      console.log("\nSample changes (first 10):");
      console.log("─".repeat(60));
      changes.slice(0, 10).forEach((change, i) => {
        console.log(`${i + 1}. ${change.transactionName}`);
        console.log(
          `   ${change.change}: ${change.to || "linked"} (${change.streamType})`
        );
      });
      if (changes.length > 10) {
        console.log(`\n... and ${changes.length - 10} more changes`);
      }
    }

    return { success: true, stats, changes };
  } catch (error) {
    console.error("\n❌ Backfill failed:", error.message);
    return { success: false, stats, changes, error: error.message };
  }
}

// Parse arguments
const args = process.argv.slice(2);
let userId = null;
let dryRun = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--user-id" || args[i] === "-u") {
    userId = args[++i];
  } else if (args[i] === "--live" || args[i] === "--apply") {
    dryRun = false;
  } else if (args[i] === "--dry-run" || args[i] === "--preview") {
    dryRun = true;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
Usage: node scripts/backfill-recurring-categories.js [OPTIONS]

Options:
  --user-id, -u <id>     User ID to backfill (required)
  --dry-run, --preview   Preview changes without applying (default)
  --live, --apply        Apply changes
  --help, -h             Show this help

Example:
  node scripts/backfill-recurring-categories.js --user-id abc-123 --dry-run
    `);
    process.exit(0);
  }
}

if (!userId) {
  console.error("❌ Error: --user-id is required");
  console.log("Run with --help for usage information");
  process.exit(1);
}

// Run backfill
(async () => {
  if (!dryRun) {
    console.log(
      "\n⚠️  WARNING: Running in LIVE mode - changes will be applied!"
    );
    console.log("⚠️  Press Ctrl+C within 3 seconds to cancel...\n");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const result = await backfillRecurringCategories(userId, dryRun);
  process.exit(result.success ? 0 : 1);
})();
