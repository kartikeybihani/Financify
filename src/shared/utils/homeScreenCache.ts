// Home screen cache for instant UI loading
// Caches critical data needed for immediate home screen display

import AppStorage from "@/src/utils/storage/storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

// Cache keys
const CACHE_KEY_PREFIX = "home_screen_cache";
const getHomeScreenCacheKey = (userId: string) => `${CACHE_KEY_PREFIX}_${userId}`;
const getHomeScreenTimestampKey = (userId: string) => `${CACHE_KEY_PREFIX}_timestamp_${userId}`;

// Use VERY_LONG (7 days) with event-based invalidation
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG;

export interface BudgetProgressData {
  spent: number;
  total: number;
  percentage: number;
  remaining: number;
  daysLeft: number;
}

export interface HomeScreenCacheData {
  userId: string;
  firstName: string | null;
  budgetProgress: BudgetProgressData | null;
  hasBudget: boolean;
  timestamp: number;
}

/**
 * Save home screen cache data synchronously
 * Called after fresh data is loaded
 */
export const saveHomeScreenCache = (
  userId: string,
  data: Omit<HomeScreenCacheData, "userId" | "timestamp">
): void => {
  try {
    if (!userId) {
      logger.error("❌ [HOME CACHE] Cannot save without userId");
      return;
    }

    const cacheData: HomeScreenCacheData = {
      userId,
      ...data,
      timestamp: Date.now(),
    };

    const cacheKey = getHomeScreenCacheKey(userId);
    const timestampKey = getHomeScreenTimestampKey(userId);

    AppStorage.setItemSync(cacheKey, JSON.stringify(cacheData));
    AppStorage.setItemSync(timestampKey, cacheData.timestamp.toString());

    logger.debug(
      `💾 [HOME CACHE] Saved for user: ${userId.substring(0, 8)}`,
      {
        hasBudget: data.hasBudget,
        hasFirstName: !!data.firstName,
      }
    );
  } catch (error) {
    logger.error("❌ [HOME CACHE] Failed to save:", error);
  }
};

/**
 * Load home screen cache data synchronously
 * Returns cached data immediately for instant UI
 * Shows stale data if available - caller should refresh in background
 */
export const loadHomeScreenCache = (userId: string): HomeScreenCacheData | null => {
  try {
    if (!userId) {
      return null;
    }

    const cacheKey = getHomeScreenCacheKey(userId);
    const cachedString = AppStorage.getItemSync(cacheKey);

    if (!cachedString) {
      return null;
    }

    const data = JSON.parse(cachedString) as HomeScreenCacheData;

    // Security check: ensure cache belongs to current user
    if (data.userId !== userId) {
      logger.error(
        `🔒 [HOME CACHE] Security: Cache belongs to different user (cache: ${data.userId?.substring(0, 8)}, current: ${userId.substring(0, 8)}). Clearing stale cache.`
      );
      // Clear the stale cache to prevent future issues
      AppStorage.removeItemSync(cacheKey);
      const timestampKey = getHomeScreenTimestampKey(data.userId);
      AppStorage.removeItemSync(timestampKey);
      return null;
    }

    // Always return data for instant UI, even if stale
    // Caller should refresh in background
    const cacheAge = Date.now() - data.timestamp;
    const ageSeconds = Math.round(cacheAge / 1000);

    logger.debug(
      `📦 [HOME CACHE] Loaded for user: ${userId.substring(0, 8)}, age: ${ageSeconds}s`
    );

    return data;
  } catch (error) {
    logger.error("❌ [HOME CACHE] Failed to load:", error);
    return null;
  }
};

/**
 * Load only firstName from cache synchronously
 * For quick header display
 */
export const loadFirstNameFromCache = (userId: string): string | null => {
  try {
    const cache = loadHomeScreenCache(userId);
    return cache?.firstName ?? null;
  } catch (error) {
    return null;
  }
};

/**
 * Load only budget progress from cache synchronously
 * For quick QuickStats display
 */
export const loadBudgetProgressFromCache = (
  userId: string
): { budgetProgress: BudgetProgressData | null; hasBudget: boolean } | null => {
  try {
    const cache = loadHomeScreenCache(userId);
    if (!cache) return null;
    return {
      budgetProgress: cache.budgetProgress,
      hasBudget: cache.hasBudget,
    };
  } catch (error) {
    return null;
  }
};

/**
 * Update only firstName in cache (partial update)
 */
export const updateFirstNameInCache = (userId: string, firstName: string | null): void => {
  try {
    const cache = loadHomeScreenCache(userId);
    if (cache) {
      saveHomeScreenCache(userId, {
        firstName,
        budgetProgress: cache.budgetProgress,
        hasBudget: cache.hasBudget,
      });
    } else {
      // Create new cache with just firstName
      saveHomeScreenCache(userId, {
        firstName,
        budgetProgress: null,
        hasBudget: false,
      });
    }
  } catch (error) {
    logger.error("❌ [HOME CACHE] Failed to update firstName:", error);
  }
};

/**
 * Update only budget progress in cache (partial update)
 */
export const updateBudgetProgressInCache = (
  userId: string,
  budgetProgress: BudgetProgressData | null,
  hasBudget: boolean
): void => {
  try {
    const cache = loadHomeScreenCache(userId);
    if (cache) {
      saveHomeScreenCache(userId, {
        firstName: cache.firstName,
        budgetProgress,
        hasBudget,
      });
    } else {
      // Create new cache with just budget
      saveHomeScreenCache(userId, {
        firstName: null,
        budgetProgress,
        hasBudget,
      });
    }
  } catch (error) {
    logger.error("❌ [HOME CACHE] Failed to update budget progress:", error);
  }
};

/**
 * Clear home screen cache for user
 */
export const clearHomeScreenCache = (userId?: string): void => {
  try {
    if (userId) {
      const cacheKey = getHomeScreenCacheKey(userId);
      const timestampKey = getHomeScreenTimestampKey(userId);
      AppStorage.removeItemSync(cacheKey);
      AppStorage.removeItemSync(timestampKey);
      logger.debug(`🗑️ [HOME CACHE] Cleared for user: ${userId.substring(0, 8)}`);
    } else {
      // Clear all home screen caches
      const allKeys = AppStorage.getAllKeysSync();
      const homeKeys = allKeys.filter((key) => key.startsWith(CACHE_KEY_PREFIX));
      if (homeKeys.length > 0) {
        AppStorage.multiRemoveSync(homeKeys);
        logger.debug(`🗑️ [HOME CACHE] Cleared all (${homeKeys.length} keys)`);
      }
    }
  } catch (error) {
    logger.error("❌ [HOME CACHE] Failed to clear:", error);
  }
};

/**
 * Check if cache exists and is reasonably fresh (< 24 hours for staleness warning)
 */
export const isCacheFresh = (userId: string): boolean => {
  try {
    const cache = loadHomeScreenCache(userId);
    if (!cache) return false;

    const cacheAge = Date.now() - cache.timestamp;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    return cacheAge < ONE_DAY;
  } catch (error) {
    return false;
  }
};

export default {
  saveHomeScreenCache,
  loadHomeScreenCache,
  loadFirstNameFromCache,
  loadBudgetProgressFromCache,
  updateFirstNameInCache,
  updateBudgetProgressInCache,
  clearHomeScreenCache,
  isCacheFresh,
};
