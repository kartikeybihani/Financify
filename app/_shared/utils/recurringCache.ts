// app/_shared/utils/recurringCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/app/_utils/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

const RECURRING_CACHE_KEY = CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS;
const RECURRING_CACHE_TIMESTAMP_KEY = CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS_TIMESTAMP;
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - recurring data is very stable

export interface CachedRecurringData {
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
 * Save recurring transactions data to AsyncStorage cache
 */
export const saveRecurringToCache = async (data: CachedRecurringData): Promise<void> => {
  try {
    const timestamp = Date.now().toString();
    await Promise.all([
      AsyncStorage.setItem(RECURRING_CACHE_KEY, JSON.stringify(data)),
      AsyncStorage.setItem(RECURRING_CACHE_TIMESTAMP_KEY, timestamp)
    ]);
    logger.info("💾 [RECURRING CACHE] Data saved to cache:", data.summary);
  } catch (error) {
    logger.error("❌ [RECURRING CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load recurring transactions data from AsyncStorage cache
 * Returns null if cache is expired or doesn't exist
 */
export const loadRecurringFromCache = async (): Promise<CachedRecurringData | null> => {
  try {
    const [cachedData, timestampStr] = await Promise.all([
      AsyncStorage.getItem(RECURRING_CACHE_KEY),
      AsyncStorage.getItem(RECURRING_CACHE_TIMESTAMP_KEY)
    ]);

    if (!cachedData || !timestampStr) {
      logger.info("📦 [RECURRING CACHE] No cached data found");
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [RECURRING CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearRecurringCache();
      return null;
    }

    const data = JSON.parse(cachedData) as CachedRecurringData;
    logger.info("📦 [RECURRING CACHE] Loaded from cache:", data.summary, "age:", Math.round(age / 1000), "seconds");
    return data;
  } catch (error) {
    logger.error("❌ [RECURRING CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear recurring transactions cache
 */
export const clearRecurringCache = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(RECURRING_CACHE_KEY),
      AsyncStorage.removeItem(RECURRING_CACHE_TIMESTAMP_KEY)
    ]);
    logger.info("🗑️ [RECURRING CACHE] Cache cleared");
  } catch (error) {
    logger.error("❌ [RECURRING CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached data exists and is valid
 */
export const hasValidRecurringCache = async (): Promise<boolean> => {
  try {
    const timestampStr = await AsyncStorage.getItem(RECURRING_CACHE_TIMESTAMP_KEY);
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
