// app/_shared/utils/investmentCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

const INVESTMENT_CACHE_KEY = CACHE_CONFIG.KEYS.INVESTMENT_DATA;
const INVESTMENT_CACHE_TIMESTAMP_KEY = CACHE_CONFIG.KEYS.INVESTMENT_DATA_TIMESTAMP;
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - investment data is stable for daily use

export interface CachedInvestmentData {
  holdings: any[];
  options: any[];
  balances: any[];
  connections: any[];
}

/**
 * Save investment data to AsyncStorage cache
 */
export const saveInvestmentToCache = async (data: CachedInvestmentData): Promise<void> => {
  try {
    const timestamp = Date.now().toString();
    await Promise.all([
      AsyncStorage.setItem(INVESTMENT_CACHE_KEY, JSON.stringify(data)),
      AsyncStorage.setItem(INVESTMENT_CACHE_TIMESTAMP_KEY, timestamp)
    ]);
    logger.info("💾 [INVESTMENT CACHE] Data saved to cache:", {
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
 * Load investment data from AsyncStorage cache
 * Returns null if cache is expired or doesn't exist
 */
export const loadInvestmentFromCache = async (): Promise<CachedInvestmentData | null> => {
  try {
    const [cachedData, timestampStr] = await Promise.all([
      AsyncStorage.getItem(INVESTMENT_CACHE_KEY),
      AsyncStorage.getItem(INVESTMENT_CACHE_TIMESTAMP_KEY)
    ]);

    if (!cachedData || !timestampStr) {
      logger.info("📦 [INVESTMENT CACHE] No cached data found");
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [INVESTMENT CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearInvestmentCache();
      return null;
    }

    const data = JSON.parse(cachedData) as CachedInvestmentData;
    logger.info("📦 [INVESTMENT CACHE] Loaded from cache:", {
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
 * Clear investment data cache
 */
export const clearInvestmentCache = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(INVESTMENT_CACHE_KEY),
      AsyncStorage.removeItem(INVESTMENT_CACHE_TIMESTAMP_KEY)
    ]);
    logger.info("🗑️ [INVESTMENT CACHE] Cache cleared");
  } catch (error) {
    logger.error("❌ [INVESTMENT CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached investment data exists and is valid
 */
export const hasValidInvestmentCache = async (): Promise<boolean> => {
  try {
    const timestampStr = await AsyncStorage.getItem(INVESTMENT_CACHE_TIMESTAMP_KEY);
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
