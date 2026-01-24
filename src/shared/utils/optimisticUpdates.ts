import { Transaction } from '@/src/types/plaid';
import logger from '@/src/utils/core/logger';
import AppStorage from '@/src/utils/storage/storage';

export interface OptimisticUpdate<T> {
  id: string;
  data: T;
  timestamp: number;
  operation: 'create' | 'update' | 'delete';
}

export interface CategoryUpdate {
  categoryId: string;
  categoryName: string;
  timestamp: number;
}

const OPTIMISTIC_UPDATES_KEY = 'optimistic_transaction_updates';
const MAX_UPDATE_AGE = 5 * 60 * 1000; // 5 minutes - updates should be confirmed by then

export class OptimisticUpdateManager {
  private static updates = new Map<string, OptimisticUpdate<any>>();

  /**
   * Load persistent optimistic updates from storage
   */
  private static loadPersistentUpdates(): Map<string, CategoryUpdate> {
    try {
      const stored = AppStorage.getItemSync(OPTIMISTIC_UPDATES_KEY);
      if (!stored) return new Map();

      const updates = JSON.parse(stored) as Record<string, CategoryUpdate>;
      const now = Date.now();
      const validUpdates = new Map<string, CategoryUpdate>();

      // Filter out stale updates
      for (const [transactionId, update] of Object.entries(updates)) {
        const age = now - update.timestamp;
        if (age < MAX_UPDATE_AGE) {
          validUpdates.set(transactionId, update);
        }
      }

      // Save back only valid updates
      if (validUpdates.size !== Object.keys(updates).length) {
        const validUpdatesObj = Object.fromEntries(validUpdates);
        AppStorage.setItemSync(OPTIMISTIC_UPDATES_KEY, JSON.stringify(validUpdatesObj));
      }

      return validUpdates;
    } catch (error) {
      logger.error('[OPTIMISTIC] Failed to load persistent updates:', error);
      return new Map();
    }
  }

  /**
   * Save persistent optimistic updates to storage
   */
  private static savePersistentUpdates(updates: Map<string, CategoryUpdate>): void {
    try {
      const updatesObj = Object.fromEntries(updates);
      AppStorage.setItemSync(OPTIMISTIC_UPDATES_KEY, JSON.stringify(updatesObj));
    } catch (error) {
      logger.error('[OPTIMISTIC] Failed to save persistent updates:', error);
    }
  }

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
        
        // Log removed - too verbose during renders
        return updatedTransaction;
      }
      return transaction;
    });
  }

  /**
   * Store optimistic category update persistently
   */
  static storeCategoryUpdate(
    transactionId: string,
    categoryId: string,
    categoryName: string
  ): void {
    const updates = this.loadPersistentUpdates();
    updates.set(transactionId, {
      categoryId,
      categoryName,
      timestamp: Date.now(),
    });
    this.savePersistentUpdates(updates);
  }

  /**
   * Get optimistic category update for a transaction
   */
  static getCategoryUpdate(transactionId: string): CategoryUpdate | null {
    const updates = this.loadPersistentUpdates();
    const update = updates.get(transactionId);
    if (!update) return null;

    // Check if update is still valid
    const age = Date.now() - update.timestamp;
    if (age >= MAX_UPDATE_AGE) {
      // Stale update, remove it
      updates.delete(transactionId);
      this.savePersistentUpdates(updates);
      return null;
    }

    return update;
  }

  /**
   * Apply optimistic category update to a single transaction object
   */
  static applyCategoryUpdateToTransaction(transaction: Transaction): Transaction {
    const update = this.getCategoryUpdate(transaction.id);
    if (!update) return transaction;

    // Handle clearing category (empty categoryId means clear)
    if (!update.categoryId || update.categoryId === "") {
      return {
        ...transaction,
        category_id: null,
        categories: null,
      };
    }

    // Apply the update
    return {
      ...transaction,
      category_id: update.categoryId,
      categories: {
        ...(transaction.categories || {}),
        id: update.categoryId,
        name: update.categoryName,
      },
    };
  }

  /**
   * Apply optimistic category change to transaction list
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
   * Apply optimistic category update (using category_id) to transaction list
   */
  static applyCategoryChangeWithId(
    transactions: Transaction[],
    transactionId: string,
    categoryId: string,
    categoryName: string
  ): Transaction[] {
    // Store the update persistently
    this.storeCategoryUpdate(transactionId, categoryId, categoryName);

    // Apply to transaction list
    return transactions.map(transaction => {
      if (transaction.id === transactionId) {
        return {
          ...transaction,
          category_id: categoryId,
          categories: {
            ...(transaction.categories || {}),
            id: categoryId,
            name: categoryName,
          },
        };
      }
      return transaction;
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
        // Log removed - only log on actual errors
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
        // Log removed - too verbose
      }
    });
  }

  /**
   * Clear persistent category update for a transaction
   */
  static clearCategoryUpdate(transactionId: string): void {
    const updates = this.loadPersistentUpdates();
    if (updates.has(transactionId)) {
      updates.delete(transactionId);
      this.savePersistentUpdates(updates);
    }
  }

  /**
   * Clear persistent category updates for multiple transactions
   */
  static clearCategoryUpdates(transactionIds: string[]): void {
    const updates = this.loadPersistentUpdates();
    let cleared = 0;
    transactionIds.forEach(id => {
      if (updates.has(id)) {
        updates.delete(id);
        cleared++;
      }
    });
    if (cleared > 0) {
      this.savePersistentUpdates(updates);
    }
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
   * Clear all optimistic updates (both in-memory and persistent)
   */
  static clearAll(): void {
    this.updates.clear();
    AppStorage.removeItemSync(OPTIMISTIC_UPDATES_KEY);
    logger.info(`🗑️ [OPTIMISTIC] Cleared all pending updates`);
  }

  /**
   * Clean up stale persistent updates (call periodically)
   */
  static cleanupStaleUpdates(): void {
    const updates = this.loadPersistentUpdates();
    const now = Date.now();
    let cleaned = 0;

    for (const [transactionId, update] of updates.entries()) {
      const age = now - update.timestamp;
      if (age >= MAX_UPDATE_AGE) {
        updates.delete(transactionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.savePersistentUpdates(updates);
    }
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
