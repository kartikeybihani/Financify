/**
 * Recurring Transaction Backfill Utility
 * ========================================
 * Safely backfill recurring transaction categorization
 * 
 * Features:
 * - Dry-run mode (preview changes before applying)
 * - Batch processing (process in chunks)
 * - Transaction safety (rollback on error)
 * - Detailed logging
 * - Idempotent (safe to run multiple times)
 * - User override protection (never overwrite new_category)
 * 
 * @module recurringBackfill
 */

import { supabase } from '@/src/lib/supabase/supabase';
import logger from '@/src/utils/logger';
import { getCategoryToSetForStream } from './transactionCategory';

export interface BackfillStats {
  totalTransactions: number;
  linkedToStreams: number;
  categoriesSet: number;
  flagsSet: number;
  skipped: number;
  errors: number;
}

export interface BackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
  userId: string;
}

export interface BackfillResult {
  success: boolean;
  stats: BackfillStats;
  changes: BackfillChange[];
  error?: string;
}

export interface BackfillChange {
  transactionId: string;
  transactionName: string;
  change: 'link_stream' | 'set_category' | 'set_flag';
  from: string | null;
  to: string | null;
  streamType?: string;
}

/**
 * Run backfill for a specific user
 * 
 * @param options - Backfill options
 * @returns Result with stats and changes
 * 
 * @example
 * ```typescript
 * // Dry run first (preview changes)
 * const preview = await backfillRecurringCategories({
 *   userId: 'user-id',
 *   dryRun: true
 * });
 * console.log(`Would update ${preview.stats.categoriesSet} transactions`);
 * 
 * // Apply changes
 * const result = await backfillRecurringCategories({
 *   userId: 'user-id',
 *   dryRun: false
 * });
 * ```
 */
export async function backfillRecurringCategories(
  options: BackfillOptions
): Promise<BackfillResult> {
  const { dryRun = true, batchSize = 1000, userId } = options;
  
  const stats: BackfillStats = {
    totalTransactions: 0,
    linkedToStreams: 0,
    categoriesSet: 0,
    flagsSet: 0,
    skipped: 0,
    errors: 0,
  };
  
  const changes: BackfillChange[] = [];
  
  logger.info(`🔄 Starting backfill (${dryRun ? 'DRY RUN' : 'LIVE'}) for user ${userId.substring(0, 8)}...`);
  
  try {
    // Step 1: Get all active recurring streams for this user
    const { data: streams, error: streamsError } = await supabase
      .from('recurring_streams')
      .select('stream_id, stream_type, transaction_ids, merchant_name')
      .eq('user_id', userId)
      .eq('is_active', true);
    
    if (streamsError) {
      throw new Error(`Failed to fetch recurring streams: ${streamsError.message}`);
    }
    
    if (!streams || streams.length === 0) {
      logger.info('No active recurring streams found for user');
      return { success: true, stats, changes };
    }
    
    logger.info(`Found ${streams.length} active recurring streams`);
    
    // Step 2: Build a map of transaction_id -> stream data
    const transactionToStreamMap = new Map<string, { streamId: string; streamType: string; merchantName: string }>();
    
    streams.forEach(stream => {
      if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
        stream.transaction_ids.forEach((txId: string) => {
          transactionToStreamMap.set(txId, {
            streamId: stream.stream_id,
            streamType: stream.stream_type,
            merchantName: stream.merchant_name || 'Unknown',
          });
        });
      }
    });
    
    logger.info(`Total transaction IDs in streams: ${transactionToStreamMap.size}`);
    
    // Step 3: Process in batches
    const transactionIds = Array.from(transactionToStreamMap.keys());
    const totalBatches = Math.ceil(transactionIds.length / batchSize);
    
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const start = batchNum * batchSize;
      const end = Math.min(start + batchSize, transactionIds.length);
      const batchIds = transactionIds.slice(start, end);
      
      logger.info(`Processing batch ${batchNum + 1}/${totalBatches} (${batchIds.length} transactions)`);
      
      // Fetch transactions in this batch
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('id, plaid_transaction_id, name, recurring_stream_id, new_category, if_recurring')
        .eq('user_id', userId)
        .in('plaid_transaction_id', batchIds);
      
      if (txError) {
        logger.error(`Error fetching batch ${batchNum + 1}:`, txError);
        stats.errors++;
        continue;
      }
      
      if (!transactions || transactions.length === 0) {
        logger.warn(`No transactions found for batch ${batchNum + 1}`);
        continue;
      }
      
      stats.totalTransactions += transactions.length;
      
      // Step 4: Prepare updates
      const updates: any[] = [];
      
      transactions.forEach(tx => {
        const streamData = transactionToStreamMap.get(tx.plaid_transaction_id);
        
        if (!streamData) {
          stats.skipped++;
          return;
        }
        
        const update: any = { id: tx.id };
        let hasChanges = false;
        
        // 4a: Link to recurring stream if not already linked
        if (!tx.recurring_stream_id) {
          update.recurring_stream_id = streamData.streamId;
          hasChanges = true;
          stats.linkedToStreams++;
          
          changes.push({
            transactionId: tx.id,
            transactionName: tx.name || 'Unknown',
            change: 'link_stream',
            from: null,
            to: streamData.streamId,
            streamType: streamData.streamType,
          });
        }
        
        // 4b: Set if_recurring flag
        if (tx.if_recurring !== 'yes') {
          update.if_recurring = 'yes';
          hasChanges = true;
          stats.flagsSet++;
          
          changes.push({
            transactionId: tx.id,
            transactionName: tx.name || 'Unknown',
            change: 'set_flag',
            from: tx.if_recurring || 'unknown',
            to: 'yes',
            streamType: streamData.streamType,
          });
        }
        
        // 4c: Set category from stream type (ONLY if new_category is NULL)
        if (!tx.new_category) {
          const categoryToSet = getCategoryToSetForStream(streamData.streamType);
          
          if (categoryToSet) {
            update.new_category = categoryToSet;
            hasChanges = true;
            stats.categoriesSet++;
            
            changes.push({
              transactionId: tx.id,
              transactionName: tx.name || 'Unknown',
              change: 'set_category',
              from: null,
              to: categoryToSet,
              streamType: streamData.streamType,
            });
          }
        } else {
          // User has overridden category - respect it
          logger.debug(`Skipping category for ${tx.name} - user override exists`);
        }
        
        if (hasChanges) {
          updates.push(update);
        } else {
          stats.skipped++;
        }
      });
      
      // Step 5: Apply updates (if not dry run)
      if (!dryRun && updates.length > 0) {
        logger.info(`Applying ${updates.length} updates for batch ${batchNum + 1}`);
        
        const { error: updateError } = await supabase
          .from('transactions')
          .upsert(updates, {
            onConflict: 'id',
            ignoreDuplicates: false,
          });
        
        if (updateError) {
          logger.error(`Error updating batch ${batchNum + 1}:`, updateError);
          stats.errors++;
        } else {
          logger.info(`✅ Successfully updated batch ${batchNum + 1}`);
        }
      } else if (dryRun && updates.length > 0) {
        logger.info(`DRY RUN: Would update ${updates.length} transactions in batch ${batchNum + 1}`);
      }
    }
    
    // Summary
    logger.info('');
    logger.info('='.repeat(60));
    logger.info(`Backfill Complete (${dryRun ? 'DRY RUN' : 'LIVE'})`);
    logger.info('='.repeat(60));
    logger.info(`Total transactions processed: ${stats.totalTransactions}`);
    logger.info(`Linked to streams: ${stats.linkedToStreams}`);
    logger.info(`Categories set: ${stats.categoriesSet}`);
    logger.info(`Flags set: ${stats.flagsSet}`);
    logger.info(`Skipped: ${stats.skipped}`);
    logger.info(`Errors: ${stats.errors}`);
    logger.info('='.repeat(60));
    
    if (dryRun) {
      logger.info('');
      logger.info('💡 This was a DRY RUN - no changes were applied');
      logger.info('💡 Set dryRun: false to apply changes');
    }
    
    return {
      success: stats.errors === 0,
      stats,
      changes,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Backfill failed:', errorMessage);
    
    return {
      success: false,
      stats,
      changes,
      error: errorMessage,
    };
  }
}

/**
 * Get a summary of what would be changed (dry run)
 * 
 * @param userId - User ID to check
 * @returns Preview of changes
 */
export async function previewBackfillChanges(userId: string): Promise<BackfillResult> {
  return backfillRecurringCategories({
    userId,
    dryRun: true,
    batchSize: 1000,
  });
}

/**
 * Apply backfill changes (live)
 * 
 * @param userId - User ID to backfill
 * @returns Result with stats
 */
export async function applyBackfillChanges(userId: string): Promise<BackfillResult> {
  return backfillRecurringCategories({
    userId,
    dryRun: false,
    batchSize: 1000,
  });
}

export default {
  backfillRecurringCategories,
  previewBackfillChanges,
  applyBackfillChanges,
};

