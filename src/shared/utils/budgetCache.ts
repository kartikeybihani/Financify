// app/_shared/utils/budgetCache.ts
import AppStorage from "@/src/utils/storage/storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";
import { BudgetData, BudgetSummary } from "@/src/types/budget";

const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - budget data is stable

// Helper to generate user-specific cache keys
const getBudgetCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.BUDGET_DATA}_${userId}`;
const getBudgetCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.BUDGET_DATA_TIMESTAMP}_${userId}`;

// Cache the final computed budgetData array (like spending/investment sections)
export interface CachedBudgetData {
  userId: string; // CRITICAL: Track which user this cache belongs to
  budgetData: BudgetData[]; // Final computed budget data ready to display
  totalBudget: number;
  totalSpent: number;
  budgetSummary: BudgetSummary | null; // Store raw summary for reference
  historicalAverages: Array<[string, { averageMonthly: number; totalSpent: number; months: number }]>; // Store as array for JSON serialization
  timestamp: number;
}

/**
 * Save computed budget data to AsyncStorage cache (user-specific)
 * Caches the final computed budgetData array, not raw BudgetSummary
 */
export const saveBudgetToCache = async (
  userId: string,
  budgetData: BudgetData[],
  totalBudget: number,
  totalSpent: number,
  budgetSummary: BudgetSummary | null,
  historicalAverages: Map<string, { averageMonthly: number; totalSpent: number; months: number }>
): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [BUDGET CACHE] Cannot save cache without userId");
      return;
    }

    // Convert Map to array for JSON serialization
    const historicalAveragesArray = Array.from(historicalAverages.entries());

    const cacheData: CachedBudgetData = {
      userId,
      budgetData,
      totalBudget,
      totalSpent,
      budgetSummary,
      historicalAverages: historicalAveragesArray,
      timestamp: Date.now(),
    };

    const timestamp = cacheData.timestamp.toString();
    const cacheKey = getBudgetCacheKey(userId);
    const timestampKey = getBudgetCacheTimestampKey(userId);

    // Use synchronous operations for better performance
    AppStorage.setItemSync(cacheKey, JSON.stringify(cacheData));
    AppStorage.setItemSync(timestampKey, timestamp);
    logger.info(
      "💾 [BUDGET CACHE] Saved computed budget data with",
      budgetData.length,
      "categories for user:",
      userId.substring(0, 8)
    );
  } catch (error) {
    logger.error("❌ [BUDGET CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load computed budget data from AsyncStorage cache synchronously (user-specific)
 * Returns null if cache is expired, doesn't exist, or belongs to different user
 * IMPORTANT: Shows stale data even if expired - user wants instant UI
 */
export const loadBudgetFromCache = (
  userId: string
): {
  budgetData: BudgetData[];
  totalBudget: number;
  totalSpent: number;
  budgetSummary: BudgetSummary | null;
  historicalAverages: Map<string, { averageMonthly: number; totalSpent: number; months: number }>;
} | null => {
  try {
    if (!userId) {
      return null;
    }

    const cacheKey = getBudgetCacheKey(userId);
    const timestampKey = getBudgetCacheTimestampKey(userId);

    // Use synchronous reads for instant cache access (MMKV advantage)
    const cachedData = AppStorage.getItemSync(cacheKey);
    const timestampStr = AppStorage.getItemSync(timestampKey);

    if (!cachedData || !timestampStr) {
      return null;
    }

    const data = JSON.parse(cachedData) as CachedBudgetData;

    // CRITICAL SECURITY CHECK: Verify cache belongs to current user
    // Only check userId match for security, ignore expiration for initial load
    if (data.userId !== userId) {
      logger.error(
        "🔒 [BUDGET CACHE] SECURITY: Cache belongs to different user!",
        {
          cachedUserId: data.userId?.substring(0, 8),
          currentUserId: userId.substring(0, 8),
        }
      );
      return null;
    }

    // Convert array back to Map for historical averages
    const historicalAverages = new Map<string, { averageMonthly: number; totalSpent: number; months: number }>();
    if (data.historicalAverages) {
      data.historicalAverages.forEach(([key, value]) => {
        historicalAverages.set(key, value);
      });
    }

    // Fix budgetSummary: Convert actuals.byCategory back to Map if it exists
    let budgetSummary = data.budgetSummary;
    if (budgetSummary && budgetSummary.actuals) {
      // If byCategory is not a Map (was serialized as object/array), convert it
      if (!(budgetSummary.actuals.byCategory instanceof Map)) {
        const byCategoryMap = new Map<string, number>();
        const byCategoryValue = budgetSummary.actuals.byCategory;
        if (Array.isArray(byCategoryValue)) {
          // If it's an array of [key, value] pairs
          (byCategoryValue as any[]).forEach((item: any) => {
            if (Array.isArray(item) && item.length === 2) {
              byCategoryMap.set(item[0], item[1]);
            }
          });
        } else if (typeof byCategoryValue === 'object' && byCategoryValue !== null) {
          // If it's a plain object
          Object.entries(byCategoryValue as Record<string, number>).forEach(([key, value]) => {
            byCategoryMap.set(key, value);
          });
        }
        budgetSummary = {
          ...budgetSummary,
          actuals: {
            ...budgetSummary.actuals,
            byCategory: byCategoryMap,
          },
        };
      }
    }


    return {
      budgetData: data.budgetData,
      totalBudget: data.totalBudget,
      totalSpent: data.totalSpent,
      budgetSummary,
      historicalAverages,
    };
  } catch (error) {
    logger.error("❌ [BUDGET CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear budget cache for a specific user
 * If userId is not provided, clears all user caches (for migration/logout)
 */
export const clearBudgetCache = async (userId?: string): Promise<void> => {
  try {
    if (userId) {
      // Clear specific user's cache
      const cacheKey = getBudgetCacheKey(userId);
      const timestampKey = getBudgetCacheTimestampKey(userId);
      // Use synchronous operations
      AppStorage.removeItemSync(cacheKey);
      AppStorage.removeItemSync(timestampKey);
      logger.info(
        "🗑️ [BUDGET CACHE] Cache cleared for user:",
        userId.substring(0, 8)
      );
    } else {
      // Clear all user caches (for migration/logout)
      const allKeys = AppStorage.getAllKeysSync();
      const budgetKeys = allKeys.filter(
        (key) =>
          key.startsWith(CACHE_CONFIG.KEYS.BUDGET_DATA) ||
          key.startsWith(CACHE_CONFIG.KEYS.BUDGET_DATA_TIMESTAMP)
      );
      if (budgetKeys.length > 0) {
        AppStorage.multiRemoveSync(budgetKeys);
        logger.info(
          "🗑️ [BUDGET CACHE] Cleared all user caches:",
          budgetKeys.length,
          "keys"
        );
      }
    }
  } catch (error) {
    logger.error("❌ [BUDGET CACHE] Failed to clear cache:", error);
  }
};

// Default export for Expo Router compatibility
export default {
  saveBudgetToCache,
  loadBudgetFromCache,
  clearBudgetCache,
};
