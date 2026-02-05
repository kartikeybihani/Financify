// Cache invalidation helpers for event-based cache management
// Call these when data changes to invalidate relevant caches

import AppStorage from "@/src/utils/storage/storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";
import { clearTransactionsCache } from "./transactionCache";
import { clearSpendingCache } from "./spendingCache";
import { clearBudgetCache } from "./budgetCache";
import { clearInvestmentCache } from "./investmentCache";
import { clearRecurringCache } from "./recurringCache";
import { clearOnboardingCache } from "./onboardingCache";
import { clearHomeScreenCache } from "./homeScreenCache";
import { clearInsightsCache } from "@/src/hooks/useHomeInsights";

/**
 * Invalidate unified financial data cache
 * Call when: accounts, goals, or cash entries change
 */
export const invalidateUnifiedCache = async (userId?: string): Promise<void> => {
  try {
    const keys = [
      "unified_financial_data",
      "unified_financial_data_timestamp",
      "unified_financial_data_last_sync",
    ];
    
    if (userId) {
      // User-specific cache keys
      keys.forEach(key => {
        AppStorage.removeItemSync(key);
      });
      logger.info(`🗑️ [CACHE] Invalidated unified cache for user: ${userId.substring(0, 8)}`);
    } else {
      // Clear all user caches
      keys.forEach(key => {
        AppStorage.removeItemSync(key);
      });
      logger.info("🗑️ [CACHE] Invalidated all unified caches");
    }
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate unified cache:", error);
  }
};

/**
 * Invalidate transactions cache
 * Call when: new transactions sync, transaction categories updated
 */
export const invalidateTransactionsCache = async (userId: string): Promise<void> => {
  try {
    await clearTransactionsCache(userId);
    // Also invalidate spending cache since it depends on transactions
    await clearSpendingCache(userId);
    logger.info(`🗑️ [CACHE] Invalidated transactions and spending cache for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate transactions cache:", error);
  }
};

/**
 * Invalidate spending breakdown cache
 * Call when: spending calculations need refresh
 */
export const invalidateSpendingCache = async (userId: string): Promise<void> => {
  try {
    await clearSpendingCache(userId);
    logger.info(`🗑️ [CACHE] Invalidated spending cache for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate spending cache:", error);
  }
};

/**
 * Invalidate budget cache
 * Call when: budget created, updated, or deleted
 */
export const invalidateBudgetCache = async (userId: string): Promise<void> => {
  try {
    await clearBudgetCache(userId);
    logger.info(`🗑️ [CACHE] Invalidated budget cache for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate budget cache:", error);
  }
};

/**
 * Invalidate investment cache
 * Call when: investment accounts change, balances update
 */
export const invalidateInvestmentCache = async (userId: string): Promise<void> => {
  try {
    await clearInvestmentCache(userId);
    // Also invalidate unified cache since it includes investments
    await invalidateUnifiedCache(userId);
    logger.info(`🗑️ [CACHE] Invalidated investment cache for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate investment cache:", error);
  }
};

/**
 * Invalidate recurring transactions cache
 * Call when: recurring patterns change, transactions marked as recurring
 */
export const invalidateRecurringCache = async (userId: string): Promise<void> => {
  try {
    await clearRecurringCache(userId);
    logger.info(`🗑️ [CACHE] Invalidated recurring cache for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate recurring cache:", error);
  }
};

/**
 * Invalidate goals cache
 * Call when: goal created, updated, or deleted
 */
export const invalidateGoalsCache = async (userId?: string): Promise<void> => {
  try {
    const keys = [
      CACHE_CONFIG.KEYS.GOALS,
      CACHE_CONFIG.KEYS.GOALS_TIMESTAMP,
    ];
    
    if (userId) {
      // User-specific cache keys (if implemented)
      keys.forEach(key => {
        AppStorage.removeItemSync(`${key}_${userId}`);
      });
      // Also invalidate unified cache since it includes goals
      await invalidateUnifiedCache(userId);
      logger.info(`🗑️ [CACHE] Invalidated goals cache for user: ${userId.substring(0, 8)}`);
    } else {
      // Clear all user caches
      const allKeys = AppStorage.getAllKeysSync();
      const goalKeys = allKeys.filter(key => 
        key.startsWith(CACHE_CONFIG.KEYS.GOALS) ||
        key.startsWith(CACHE_CONFIG.KEYS.GOALS_TIMESTAMP)
      );
      if (goalKeys.length > 0) {
        AppStorage.multiRemoveSync(goalKeys);
      }
      logger.info("🗑️ [CACHE] Invalidated all goals caches");
    }
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate goals cache:", error);
  }
};

/**
 * Invalidate onboarding progress cache
 * Call when: onboarding step completed, dismissed, or reset
 */
export const invalidateOnboardingCache = async (userId: string): Promise<void> => {
  try {
    clearOnboardingCache(userId);
    logger.info(`🗑️ [CACHE] Invalidated onboarding cache for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate onboarding cache:", error);
  }
};

/**
 * Invalidate home screen cache (firstName, budgetProgress)
 * Call when: profile updated, budget changed, transactions synced
 */
export const invalidateHomeScreenCache = async (userId: string): Promise<void> => {
  try {
    clearHomeScreenCache(userId);
    clearInsightsCache(userId);
    logger.info(`🗑️ [CACHE] Invalidated home screen cache for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate home screen cache:", error);
  }
};

/**
 * Invalidate all caches for a user (use on logout or data reset)
 */
export const invalidateAllCaches = async (userId: string): Promise<void> => {
  try {
    await Promise.all([
      invalidateUnifiedCache(userId),
      invalidateTransactionsCache(userId),
      invalidateBudgetCache(userId),
      invalidateInvestmentCache(userId),
      invalidateRecurringCache(userId),
      invalidateGoalsCache(userId),
      invalidateOnboardingCache(userId),
      invalidateHomeScreenCache(userId),
    ]);
    logger.info(`🗑️ [CACHE] Invalidated all caches for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [CACHE] Failed to invalidate all caches:", error);
  }
};

// Default export
export default {
  invalidateUnifiedCache,
  invalidateTransactionsCache,
  invalidateSpendingCache,
  invalidateBudgetCache,
  invalidateInvestmentCache,
  invalidateRecurringCache,
  invalidateGoalsCache,
  invalidateOnboardingCache,
  invalidateHomeScreenCache,
  invalidateAllCaches,
};
