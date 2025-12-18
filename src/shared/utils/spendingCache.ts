// app/_shared/utils/spendingCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - spending breakdown cached for smooth UX

// Helper to generate user-specific cache keys
const getSpendingCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.SPENDING_BREAKDOWN}_${userId}`;
const getSpendingCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.SPENDING_BREAKDOWN_TIMESTAMP}_${userId}`;

export type CategoryBreakdown = [
  string,
  {
    amount: number;
    percentage: number;
    color: string;
    hasRecurringTransactions: boolean;
  }
][];

export interface CachedSpendingData {
  userId: string; // CRITICAL: Track which user this cache belongs to
  categoryBreakdown: CategoryBreakdown;
  currentMonthTransactions: any[];
  totalSpent: number;
  displayPeriod: string;
  timestamp: number;
}

/**
 * Save spending breakdown data to AsyncStorage cache (user-specific)
 */
export const saveSpendingToCache = async (userId: string, data: {
  categoryBreakdown: CategoryBreakdown;
  currentMonthTransactions: any[];
  totalSpent: number;
  displayPeriod: string;
}): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [SPENDING CACHE] Cannot save cache without userId");
      return;
    }

    const cacheData: CachedSpendingData = {
      ...data,
      userId, // Store userId in cached data for validation
      timestamp: Date.now(),
    };
    const timestamp = cacheData.timestamp.toString();
    const cacheKey = getSpendingCacheKey(userId);
    const timestampKey = getSpendingCacheTimestampKey(userId);

    await Promise.all([
      AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData)),
      AsyncStorage.setItem(timestampKey, timestamp)
    ]);
    logger.info("💾 [SPENDING CACHE] Saved spending breakdown with", data.categoryBreakdown.length, "categories for user:", userId.substring(0, 8));
  } catch (error) {
    logger.error("❌ [SPENDING CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load spending breakdown data from AsyncStorage cache (user-specific)
 * Returns null if cache is expired, doesn't exist, or belongs to different user
 */
export const loadSpendingFromCache = async (userId: string): Promise<CachedSpendingData | null> => {
  try {
    if (!userId) {
      logger.error("❌ [SPENDING CACHE] Cannot load cache without userId");
      return null;
    }

    const cacheKey = getSpendingCacheKey(userId);
    const timestampKey = getSpendingCacheTimestampKey(userId);

    const [cachedData, timestampStr] = await Promise.all([
      AsyncStorage.getItem(cacheKey),
      AsyncStorage.getItem(timestampKey)
    ]);

    if (!cachedData || !timestampStr) {
      logger.info("📦 [SPENDING CACHE] No cached data found for user:", userId.substring(0, 8));
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [SPENDING CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearSpendingCache(userId);
      return null;
    }

    const data = JSON.parse(cachedData) as CachedSpendingData;

    // CRITICAL SECURITY CHECK: Verify cache belongs to current user
    if (data.userId !== userId) {
      logger.error("🔒 [SPENDING CACHE] SECURITY: Cache belongs to different user! Clearing cache.", {
        cachedUserId: data.userId?.substring(0, 8),
        currentUserId: userId.substring(0, 8)
      });
      await clearSpendingCache(userId);
      return null;
    }

    logger.info("📦 [SPENDING CACHE] Loaded spending breakdown from cache for user:", userId.substring(0, 8), "age:", Math.round(age / 1000), "seconds");
    return data;
  } catch (error) {
    logger.error("❌ [SPENDING CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear spending breakdown cache for a specific user
 * If userId is not provided, clears all user caches (for migration/logout)
 */
export const clearSpendingCache = async (userId?: string): Promise<void> => {
  try {
    if (userId) {
      // Clear specific user's cache
      const cacheKey = getSpendingCacheKey(userId);
      const timestampKey = getSpendingCacheTimestampKey(userId);
      await Promise.all([
        AsyncStorage.removeItem(cacheKey),
        AsyncStorage.removeItem(timestampKey)
      ]);
      logger.info("🗑️ [SPENDING CACHE] Cache cleared for user:", userId.substring(0, 8));
    } else {
      // Clear all user caches (for migration/logout)
      const allKeys = await AsyncStorage.getAllKeys();
      const spendingKeys = allKeys.filter(key => 
        key.startsWith(CACHE_CONFIG.KEYS.SPENDING_BREAKDOWN) ||
        key.startsWith(CACHE_CONFIG.KEYS.SPENDING_BREAKDOWN_TIMESTAMP)
      );
      if (spendingKeys.length > 0) {
        await AsyncStorage.multiRemove(spendingKeys);
        logger.info("🗑️ [SPENDING CACHE] Cleared all user caches:", spendingKeys.length, "keys");
      }
    }
  } catch (error) {
    logger.error("❌ [SPENDING CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached spending data exists and is valid for a specific user
 */
export const hasValidSpendingCache = async (userId: string): Promise<boolean> => {
  try {
    if (!userId) return false;

    const timestampKey = getSpendingCacheTimestampKey(userId);
    const timestampStr = await AsyncStorage.getItem(timestampKey);
    if (!timestampStr) return false;

    const timestamp = parseInt(timestampStr);
    const age = Date.now() - timestamp;
    return age <= CACHE_DURATION;
  } catch (error) {
    logger.error("❌ [SPENDING CACHE] Failed to check cache validity:", error);
    return false;
  }
};

// Default export for Expo Router compatibility
export default {
  saveSpendingToCache,
  loadSpendingFromCache,
  clearSpendingCache,
  hasValidSpendingCache,
};

