/**
 * Transaction Category Display Logic
 * ===================================
 * Single source of truth for determining which category to display for a transaction.
 * 
 * Priority Order:
 * 1. new_category (user explicit override) - ALWAYS WINS
 * 2. recurring_stream-based category (if part of active recurring stream)
 * 3. top_category (Plaid's original fallback)
 * 
 * @module transactionCategory
 */

import { Transaction } from '@/src/types/plaid';

/**
 * Map recurring stream types to category names
 */
export const STREAM_TYPE_TO_CATEGORY: Record<string, string> = {
  subscription: 'Subscriptions',
  income: 'Income',
  bill: 'Housing',  // TODO: Update this based on user preference
  other: 'Other',
};

/**
 * Get the display category for a transaction
 * 
 * @param transaction - Transaction object with all fields
 * @returns The category name to display
 * 
 * @example
 * ```typescript
 * const category = getDisplayCategory(transaction);
 * console.log(category); // "Subscriptions"
 * ```
 */
export function getDisplayCategory(transaction: Transaction): string {
  // Priority 1: User explicit override (but skip INTERNAL_TRANSFER)
  if (transaction.new_category && transaction.new_category !== 'INTERNAL_TRANSFER') {
    return transaction.new_category;
  }
  
  // If INTERNAL_TRANSFER, fall through to Plaid category
  // Priority 2: Recurring stream-based category
  if (transaction.recurring_stream_id && transaction.recurring_streams) {
    const stream = Array.isArray(transaction.recurring_streams)
      ? transaction.recurring_streams[0]
      : transaction.recurring_streams;
    
    if (stream && stream.is_active && stream.stream_type) {
      const streamType = stream.stream_type;
      const mappedCategory = STREAM_TYPE_TO_CATEGORY[streamType];
      
      if (mappedCategory) {
        return mappedCategory;
      }
    }
  }
  
  // Priority 3: Plaid's original category
  return transaction.top_category || transaction.category || 'Other';
}

/**
 * Get category name from recurring stream type
 * 
 * @param streamType - The stream type from recurring_streams table
 * @returns The category name
 * 
 * @example
 * ```typescript
 * const category = getCategoryFromStreamType('subscription');
 * console.log(category); // "Subscriptions"
 * ```
 */
export function getCategoryFromStreamType(streamType: string): string {
  return STREAM_TYPE_TO_CATEGORY[streamType] || 'Other';
}

/**
 * Check if a transaction should be categorized by its recurring stream
 * 
 * @param transaction - Transaction object
 * @returns True if transaction should use recurring stream category
 */
export function shouldUseStreamCategory(transaction: Transaction): boolean {
  // Don't use stream category if user has explicitly overridden
  if (transaction.new_category) {
    return false;
  }
  
  // Check if transaction is linked to an active recurring stream
  if (transaction.recurring_stream_id && transaction.recurring_streams) {
    const stream = Array.isArray(transaction.recurring_streams)
      ? transaction.recurring_streams[0]
      : transaction.recurring_streams;
    
    return stream && stream.is_active === true;
  }
  
  return false;
}

/**
 * Get the category that should be set for a transaction based on its recurring stream
 * Used during transaction sync and backfill
 * 
 * @param streamType - The stream type from recurring_streams table
 * @returns The category name to set, or null if no override needed
 * 
 * @example
 * ```typescript
 * // During transaction sync:
 * if (transaction.recurring_stream_id && !transaction.new_category) {
 *   const category = getCategoryToSetForStream(streamType);
 *   transaction.new_category = category;
 * }
 * ```
 */
export function getCategoryToSetForStream(streamType: string): string | null {
  // Only return category for types we want to override
  const category = STREAM_TYPE_TO_CATEGORY[streamType];
  
  // Don't override for 'other' type - let Plaid's category stand
  if (streamType === 'other') {
    return null;
  }
  
  return category || null;
}

/**
 * Batch process transactions to set categories from recurring streams
 * Used in backfill operations
 * 
 * @param transactions - Array of transactions
 * @returns Array of transactions with updated categories
 */
export function batchSetCategoriesFromStreams(transactions: Transaction[]): Transaction[] {
  return transactions.map(tx => {
    // Skip if user has already set a category
    if (tx.new_category) {
      return tx;
    }
    
    // Skip if not linked to a recurring stream
    if (!tx.recurring_stream_id || !tx.recurring_streams) {
      return tx;
    }
    
    const stream = Array.isArray(tx.recurring_streams)
      ? tx.recurring_streams[0]
      : tx.recurring_streams;
    
    if (!stream || !stream.is_active || !stream.stream_type) {
      return tx;
    }
    
    const categoryToSet = getCategoryToSetForStream(stream.stream_type);
    
    if (categoryToSet) {
      return {
        ...tx,
        new_category: categoryToSet,
      };
    }
    
    return tx;
  });
}

/**
 * Check if a transaction should show the "Recurring" chip
 * 
 * @param transaction - Transaction object
 * @returns True if the transaction should display as recurring
 * 
 * @example
 * ```typescript
 * const showChip = shouldShowRecurringChip(transaction);
 * if (showChip) {
 *   // Display recurring badge/chip
 * }
 * ```
 */
export function shouldShowRecurringChip(transaction: Transaction): boolean {
  return transaction.if_recurring === 'yes';
}

/**
 * Export all functions for easy importing
 */
export default {
  getDisplayCategory,
  getCategoryFromStreamType,
  shouldUseStreamCategory,
  getCategoryToSetForStream,
  batchSetCategoriesFromStreams,
  shouldShowRecurringChip,
  STREAM_TYPE_TO_CATEGORY,
};

