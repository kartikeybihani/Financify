// app/_shared/utils/recurringCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - recurring data is very stable

// Helper to generate user-specific cache keys
const getRecurringCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS}_${userId}`;
const getRecurringCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS_TIMESTAMP}_${userId}`;

export interface CachedRecurringData {
  userId: string; // CRITICAL: Track which user this cache belongs to
  subscriptions: any[];
  income: any[];
  bills: any[];
  other: any[];
  summary: {
    subscriptions: number;
    income: number;
    bills: number;
    other: number;
    total: number;
  };
}

/**
 * Save recurring transactions data to AsyncStorage cache (user-specific)
 */
export const saveRecurringToCache = async (userId: string, data: Omit<CachedRecurringData, 'userId'>): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [RECURRING CACHE] Cannot save cache without userId");
      return;
    }

    const cacheData: CachedRecurringData = {
      ...data,
      userId, // Store userId in cached data for validation
    };
    const timestamp = Date.now().toString();
    const cacheKey = getRecurringCacheKey(userId);
    const timestampKey = getRecurringCacheTimestampKey(userId);

    await Promise.all([
      AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData)),
      AsyncStorage.setItem(timestampKey, timestamp)
    ]);
    logger.info("💾 [RECURRING CACHE] Data saved to cache for user:", userId.substring(0, 8), data.summary);
  } catch (error) {
    logger.error("❌ [RECURRING CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load recurring transactions data from AsyncStorage cache (user-specific)
 * Returns null if cache is expired, doesn't exist, or belongs to different user
 */
export const loadRecurringFromCache = async (userId: string): Promise<CachedRecurringData | null> => {
  try {
    if (!userId) {
      logger.error("❌ [RECURRING CACHE] Cannot load cache without userId");
      return null;
    }

    const cacheKey = getRecurringCacheKey(userId);
    const timestampKey = getRecurringCacheTimestampKey(userId);

    const [cachedData, timestampStr] = await Promise.all([
      AsyncStorage.getItem(cacheKey),
      AsyncStorage.getItem(timestampKey)
    ]);

    if (!cachedData || !timestampStr) {
      logger.info("📦 [RECURRING CACHE] No cached data found for user:", userId.substring(0, 8));
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [RECURRING CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearRecurringCache(userId);
      return null;
    }

    const data = JSON.parse(cachedData) as CachedRecurringData;

    // CRITICAL SECURITY CHECK: Verify cache belongs to current user
    if (data.userId !== userId) {
      logger.error("🔒 [RECURRING CACHE] SECURITY: Cache belongs to different user! Clearing cache.", {
        cachedUserId: data.userId?.substring(0, 8),
        currentUserId: userId.substring(0, 8)
      });
      await clearRecurringCache(userId);
      return null;
    }

    logger.info("📦 [RECURRING CACHE] Loaded from cache for user:", userId.substring(0, 8), data.summary, "age:", Math.round(age / 1000), "seconds");
    return data;
  } catch (error) {
    logger.error("❌ [RECURRING CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear recurring transactions cache for a specific user
 * If userId is not provided, clears all user caches (for migration/logout)
 */
export const clearRecurringCache = async (userId?: string): Promise<void> => {
  try {
    if (userId) {
      // Clear specific user's cache
      const cacheKey = getRecurringCacheKey(userId);
      const timestampKey = getRecurringCacheTimestampKey(userId);
      await Promise.all([
        AsyncStorage.removeItem(cacheKey),
        AsyncStorage.removeItem(timestampKey)
      ]);
      logger.info("🗑️ [RECURRING CACHE] Cache cleared for user:", userId.substring(0, 8));
    } else {
      // Clear all user caches (for migration/logout)
      const allKeys = await AsyncStorage.getAllKeys();
      const recurringKeys = allKeys.filter(key => 
        key.startsWith(CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS) ||
        key.startsWith(CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS_TIMESTAMP)
      );
      if (recurringKeys.length > 0) {
        await AsyncStorage.multiRemove(recurringKeys);
        logger.info("🗑️ [RECURRING CACHE] Cleared all user caches:", recurringKeys.length, "keys");
      }
    }
  } catch (error) {
    logger.error("❌ [RECURRING CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached data exists and is valid for a specific user
 */
export const hasValidRecurringCache = async (userId: string): Promise<boolean> => {
  try {
    if (!userId) return false;

    const timestampKey = getRecurringCacheTimestampKey(userId);
    const timestampStr = await AsyncStorage.getItem(timestampKey);
    if (!timestampStr) return false;

    const timestamp = parseInt(timestampStr);
    const age = Date.now() - timestamp;
    return age <= CACHE_DURATION;
  } catch (error) {
    logger.error("❌ [RECURRING CACHE] Failed to check cache validity:", error);
    return false;
  }
};

// Default export for Expo Router compatibility
export default {
  saveRecurringToCache,
  loadRecurringFromCache,
  clearRecurringCache,
  hasValidRecurringCache,
};
