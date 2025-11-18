// app/_shared/utils/spendingCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

const SPENDING_CACHE_KEY = "cached_spending_breakdown";
const SPENDING_CACHE_TIMESTAMP_KEY = "cached_spending_breakdown_timestamp";
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - spending breakdown cached for smooth UX

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
  categoryBreakdown: CategoryBreakdown;
  currentMonthTransactions: any[];
  totalSpent: number;
  displayPeriod: string;
  timestamp: number;
}

/**
 * Save spending breakdown data to AsyncStorage cache
 */
export const saveSpendingToCache = async (data: {
  categoryBreakdown: CategoryBreakdown;
  currentMonthTransactions: any[];
  totalSpent: number;
  displayPeriod: string;
}): Promise<void> => {
  try {
    const cacheData: CachedSpendingData = {
      ...data,
      timestamp: Date.now(),
    };
    const timestamp = cacheData.timestamp.toString();
    await Promise.all([
      AsyncStorage.setItem(SPENDING_CACHE_KEY, JSON.stringify(cacheData)),
      AsyncStorage.setItem(SPENDING_CACHE_TIMESTAMP_KEY, timestamp)
    ]);
    logger.info("💾 [SPENDING CACHE] Saved spending breakdown with", data.categoryBreakdown.length, "categories");
  } catch (error) {
    logger.error("❌ [SPENDING CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load spending breakdown data from AsyncStorage cache
 * Returns null if cache is expired or doesn't exist
 */
export const loadSpendingFromCache = async (): Promise<CachedSpendingData | null> => {
  try {
    const [cachedData, timestampStr] = await Promise.all([
      AsyncStorage.getItem(SPENDING_CACHE_KEY),
      AsyncStorage.getItem(SPENDING_CACHE_TIMESTAMP_KEY)
    ]);

    if (!cachedData || !timestampStr) {
      logger.info("📦 [SPENDING CACHE] No cached data found");
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [SPENDING CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearSpendingCache();
      return null;
    }

    const data = JSON.parse(cachedData) as CachedSpendingData;
    logger.info("📦 [SPENDING CACHE] Loaded spending breakdown from cache, age:", Math.round(age / 1000), "seconds");
    return data;
  } catch (error) {
    logger.error("❌ [SPENDING CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear spending breakdown cache
 */
export const clearSpendingCache = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(SPENDING_CACHE_KEY),
      AsyncStorage.removeItem(SPENDING_CACHE_TIMESTAMP_KEY)
    ]);
    logger.info("🗑️ [SPENDING CACHE] Cache cleared");
  } catch (error) {
    logger.error("❌ [SPENDING CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached spending data exists and is valid
 */
export const hasValidSpendingCache = async (): Promise<boolean> => {
  try {
    const timestampStr = await AsyncStorage.getItem(SPENDING_CACHE_TIMESTAMP_KEY);
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

