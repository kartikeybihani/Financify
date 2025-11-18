/**
 * CLI Script: Backfill Recurring Transaction Categories
 * =======================================================
 * Run this script to backfill recurring transaction categories for users
 * 
 * Usage:
 * ------
 * # Dry run (preview changes):
 * npx ts-node scripts/backfill-recurring-categories.ts --dry-run --user-id YOUR_USER_ID
 * 
 * # Apply changes:
 * npx ts-node scripts/backfill-recurring-categories.ts --user-id YOUR_USER_ID
 * 
 * # Show help:
 * npx ts-node scripts/backfill-recurring-categories.ts --help
 * 
 * @module backfill-recurring-categories
 */

import { supabase } from '../src/lib/supabase/supabase';
import {
  backfillRecurringCategories,
  BackfillResult,
} from '../src/utils/recurring/recurringBackfill';

interface CliOptions {
  userId?: string;
  dryRun: boolean;
  help: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    userId: undefined,
    dryRun: true, // Default to dry run for safety
    help: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--user-id':
      case '-u':
        options.userId = args[++i];
        break;
      
      case '--live':
      case '--apply':
        options.dryRun = false;
        break;
      
      case '--dry-run':
      case '--preview':
        options.dryRun = true;
        break;
      
      case '--help':
      case '-h':
        options.help = true;
        break;
      
      default:
        console.warn(`Unknown argument: ${arg}`);
    }
  }
  
  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║   Backfill Recurring Transaction Categories                    ║
╚════════════════════════════════════════════════════════════════╝

This script backfills recurring transaction categorization for users.
It links transactions to recurring streams and sets categories based on
stream types (subscriptions, bills, income, etc.).

USAGE:
  npx ts-node scripts/backfill-recurring-categories.ts [OPTIONS]

OPTIONS:
  --user-id, -u <id>     User ID to backfill (required)
  --dry-run, --preview   Preview changes without applying (default)
  --live, --apply        Apply changes (use with caution!)
  --help, -h             Show this help message

EXAMPLES:
  # Preview changes for a user:
  npx ts-node scripts/backfill-recurring-categories.ts \\
    --user-id abc-123 --dry-run

  # Apply changes for a user:
  npx ts-node scripts/backfill-recurring-categories.ts \\
    --user-id abc-123 --live

  # Get current user ID from Supabase auth (for testing):
  npx ts-node scripts/backfill-recurring-categories.ts \\
    --user-id $(supabase auth get-user --json | jq -r '.id')

SAFETY FEATURES:
  ✓ Defaults to dry-run mode
  ✓ Never overwrites user category overrides (new_category)
  ✓ Idempotent (safe to run multiple times)
  ✓ Batch processing for large datasets
  ✓ Detailed logging

WHAT IT DOES:
  1. Links transactions to recurring streams (sets recurring_stream_id)
  2. Sets if_recurring = 'yes' for stream-linked transactions
  3. Sets new_category based on stream_type (subscriptions, bills, etc.)
     BUT ONLY if new_category is NULL (respects user overrides)

RECOMMENDATION:
  Always run with --dry-run first to preview changes!
  `);
}

/**
 * Print results in a nice format
 */
function printResults(result: BackfillResult, dryRun: boolean) {
  console.log('');
  console.log('═'.repeat(70));
  console.log(`  BACKFILL RESULTS ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
  console.log('═'.repeat(70));
  console.log('');
  console.log(`  Status:                ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`  Total Transactions:    ${result.stats.totalTransactions}`);
  console.log(`  Linked to Streams:     ${result.stats.linkedToStreams}`);
  console.log(`  Categories Set:        ${result.stats.categoriesSet}`);
  console.log(`  Flags Set:             ${result.stats.flagsSet}`);
  console.log(`  Skipped:               ${result.stats.skipped}`);
  console.log(`  Errors:                ${result.stats.errors}`);
  console.log('');
  console.log('═'.repeat(70));
  
  if (dryRun) {
    console.log('');
    console.log('💡 This was a DRY RUN - no changes were applied');
    console.log('💡 To apply these changes, run again with --live flag');
    console.log('');
  }
  
  // Show sample changes
  if (result.changes.length > 0) {
    console.log('');
    console.log('SAMPLE CHANGES (first 10):');
    console.log('─'.repeat(70));
    
    const sampleChanges = result.changes.slice(0, 10);
    
    sampleChanges.forEach((change, idx) => {
      console.log(`${idx + 1}. ${change.transactionName}`);
      console.log(`   ${change.change}: ${change.from || 'null'} → ${change.to || 'null'}`);
      if (change.streamType) {
        console.log(`   Stream Type: ${change.streamType}`);
      }
      console.log('');
    });
    
    if (result.changes.length > 10) {
      console.log(`   ... and ${result.changes.length - 10} more changes`);
    }
  }
  
  if (result.error) {
    console.log('');
    console.log('❌ ERROR:', result.error);
  }
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();
  
  // Show help if requested
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  // Validate user ID
  if (!options.userId) {
    console.error('❌ Error: --user-id is required');
    console.log('Run with --help for usage information');
    process.exit(1);
  }
  
  console.log('');
  console.log('🚀 Starting backfill...');
  console.log(`   User ID: ${options.userId}`);
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN (preview only)' : 'LIVE (applying changes)'}`);
  console.log('');
  
  if (!options.dryRun) {
    console.log('⚠️  WARNING: Running in LIVE mode - changes will be applied!');
    console.log('⚠️  Press Ctrl+C within 5 seconds to cancel...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('');
  }
  
  try {
    const result = await backfillRecurringCategories({
      userId: options.userId,
      dryRun: options.dryRun,
      batchSize: 1000,
    });
    
    printResults(result, options.dryRun);
    
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error('');
    console.error('═'.repeat(70));
    console.error('❌ FATAL ERROR');
    console.error('═'.repeat(70));
    console.error('');
    console.error(error);
    console.error('');
    
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

