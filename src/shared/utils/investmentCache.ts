// app/_shared/utils/investmentCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - investment data is stable for daily use

// Helper to generate user-specific cache keys
const getInvestmentCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.INVESTMENT_DATA}_${userId}`;
const getInvestmentCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.INVESTMENT_DATA_TIMESTAMP}_${userId}`;

export interface CachedInvestmentData {
  userId: string; // CRITICAL: Track which user this cache belongs to
  holdings: any[];
  options: any[];
  balances: any[];
  connections: any[];
}

/**
 * Save investment data to AsyncStorage cache (user-specific)
 */
export const saveInvestmentToCache = async (userId: string, data: Omit<CachedInvestmentData, 'userId'>): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [INVESTMENT CACHE] Cannot save cache without userId");
      return;
    }

    const cacheData: CachedInvestmentData = {
      ...data,
      userId, // Store userId in cached data for validation
    };
    const timestamp = Date.now().toString();
    const cacheKey = getInvestmentCacheKey(userId);
    const timestampKey = getInvestmentCacheTimestampKey(userId);

    await Promise.all([
      AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData)),
      AsyncStorage.setItem(timestampKey, timestamp)
    ]);
    logger.info("💾 [INVESTMENT CACHE] Data saved to cache for user:", userId.substring(0, 8), {
      holdings: data.holdings.length,
      options: data.options.length,
      balances: data.balances.length,
      connections: data.connections.length
    });
  } catch (error) {
    logger.error("❌ [INVESTMENT CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load investment data from AsyncStorage cache (user-specific)
 * Returns null if cache is expired, doesn't exist, or belongs to different user
 */
export const loadInvestmentFromCache = async (userId: string): Promise<CachedInvestmentData | null> => {
  try {
    if (!userId) {
      logger.error("❌ [INVESTMENT CACHE] Cannot load cache without userId");
      return null;
    }

    const cacheKey = getInvestmentCacheKey(userId);
    const timestampKey = getInvestmentCacheTimestampKey(userId);

    const [cachedData, timestampStr] = await Promise.all([
      AsyncStorage.getItem(cacheKey),
      AsyncStorage.getItem(timestampKey)
    ]);

    if (!cachedData || !timestampStr) {
      logger.info("📦 [INVESTMENT CACHE] No cached data found for user:", userId.substring(0, 8));
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [INVESTMENT CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearInvestmentCache(userId);
      return null;
    }

    const data = JSON.parse(cachedData) as CachedInvestmentData;

    // CRITICAL SECURITY CHECK: Verify cache belongs to current user
    if (data.userId !== userId) {
      logger.error("🔒 [INVESTMENT CACHE] SECURITY: Cache belongs to different user! Clearing cache.", {
        cachedUserId: data.userId?.substring(0, 8),
        currentUserId: userId.substring(0, 8)
      });
      await clearInvestmentCache(userId);
      return null;
    }

    logger.info("📦 [INVESTMENT CACHE] Loaded from cache for user:", userId.substring(0, 8), {
      holdings: data.holdings.length,
      options: data.options.length,
      balances: data.balances.length,
      connections: data.connections.length
    }, "age:", Math.round(age / 1000), "seconds");
    return data;
  } catch (error) {
    logger.error("❌ [INVESTMENT CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear investment data cache for a specific user
 * If userId is not provided, clears all user caches (for migration/logout)
 */
export const clearInvestmentCache = async (userId?: string): Promise<void> => {
  try {
    if (userId) {
      // Clear specific user's cache
      const cacheKey = getInvestmentCacheKey(userId);
      const timestampKey = getInvestmentCacheTimestampKey(userId);
      await Promise.all([
        AsyncStorage.removeItem(cacheKey),
        AsyncStorage.removeItem(timestampKey)
      ]);
      logger.info("🗑️ [INVESTMENT CACHE] Cache cleared for user:", userId.substring(0, 8));
    } else {
      // Clear all user caches (for migration/logout)
      // Get all AsyncStorage keys and filter for investment cache keys
      const allKeys = await AsyncStorage.getAllKeys();
      const investmentKeys = allKeys.filter(key => 
        key.startsWith(CACHE_CONFIG.KEYS.INVESTMENT_DATA) ||
        key.startsWith(CACHE_CONFIG.KEYS.INVESTMENT_DATA_TIMESTAMP)
      );
      if (investmentKeys.length > 0) {
        await AsyncStorage.multiRemove(investmentKeys);
        logger.info("🗑️ [INVESTMENT CACHE] Cleared all user caches:", investmentKeys.length, "keys");
      }
    }
  } catch (error) {
    logger.error("❌ [INVESTMENT CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached investment data exists and is valid for a specific user
 */
export const hasValidInvestmentCache = async (userId: string): Promise<boolean> => {
  try {
    if (!userId) return false;

    const timestampKey = getInvestmentCacheTimestampKey(userId);
    const timestampStr = await AsyncStorage.getItem(timestampKey);
    if (!timestampStr) return false;

    const timestamp = parseInt(timestampStr);
    const age = Date.now() - timestamp;
    return age <= CACHE_DURATION;
  } catch (error) {
    logger.error("❌ [INVESTMENT CACHE] Failed to check cache validity:", error);
    return false;
  }
};

// Default export for Expo Router compatibility
export default {
  saveInvestmentToCache,
  loadInvestmentFromCache,
  clearInvestmentCache,
  hasValidInvestmentCache,
};
