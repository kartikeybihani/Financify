import { Transaction } from '@/app/_types/plaid';
import logger from '@/app/_utils/logger';

export interface OptimisticUpdate<T> {
  id: string;
  data: T;
  timestamp: number;
  operation: 'create' | 'update' | 'delete';
}

export class OptimisticUpdateManager {
  private static updates = new Map<string, OptimisticUpdate<any>>();

  /**
   * Apply optimistic update to transaction list
   */
  static applyTransactionUpdate(
    transactions: Transaction[],
    transactionId: string,
    updates: Partial<Transaction>
  ): Transaction[] {
    return transactions.map(transaction => {
      if (transaction.id === transactionId) {
        const updatedTransaction = { ...transaction, ...updates };
        
        // Store the optimistic update
        this.updates.set(transactionId, {
          id: transactionId,
          data: updatedTransaction,
          timestamp: Date.now(),
          operation: 'update'
        });
        
        logger.info(`🔄 [OPTIMISTIC] Applied update to transaction ${transactionId}:`, updates);
        return updatedTransaction;
      }
      return transaction;
    });
  }

  /**
   * Apply optimistic category change to transaction
   */
  static applyCategoryChange(
    transactions: Transaction[],
    transactionId: string,
    newCategory: string
  ): Transaction[] {
    return this.applyTransactionUpdate(transactions, transactionId, {
      new_category: newCategory,
      top_category: newCategory, // Also update top_category for consistency
    });
  }

  /**
   * Revert optimistic updates (on error)
   */
  static revertUpdates(transactions: Transaction[]): Transaction[] {
    const revertedTransactions = transactions.map(transaction => {
      const optimisticUpdate = this.updates.get(transaction.id);
      if (optimisticUpdate) {
        // Revert to original data (remove the optimistic update)
        this.updates.delete(transaction.id);
        logger.info(`↩️ [OPTIMISTIC] Reverted update for transaction ${transaction.id}`);
        return transaction; // Return original transaction
      }
      return transaction;
    });

    return revertedTransactions;
  }

  /**
   * Clear optimistic updates (on successful server sync)
   */
  static clearUpdates(transactionIds: string[]): void {
    transactionIds.forEach(id => {
      if (this.updates.has(id)) {
        this.updates.delete(id);
        logger.info(`✅ [OPTIMISTIC] Cleared update for transaction ${id}`);
      }
    });
  }

  /**
   * Get pending optimistic updates
   */
  static getPendingUpdates(): OptimisticUpdate<any>[] {
    return Array.from(this.updates.values());
  }

  /**
   * Check if transaction has pending optimistic update
   */
  static hasPendingUpdate(transactionId: string): boolean {
    return this.updates.has(transactionId);
  }

  /**
   * Clear all optimistic updates
   */
  static clearAll(): void {
    this.updates.clear();
    logger.info(`🗑️ [OPTIMISTIC] Cleared all pending updates`);
  }

  /**
   * Get optimistic update for specific transaction
   */
  static getUpdate(transactionId: string): OptimisticUpdate<any> | undefined {
    return this.updates.get(transactionId);
  }
}

// Default export for Expo Router compatibility
export default OptimisticUpdateManager;
