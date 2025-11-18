// app/_shared/utils/transactionCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";
import { Transaction } from "@/src/types/plaid";

const TRANSACTIONS_CACHE_KEY = CACHE_CONFIG.KEYS.TRANSACTIONS;
const TRANSACTIONS_CACHE_TIMESTAMP_KEY = CACHE_CONFIG.KEYS.TRANSACTIONS_TIMESTAMP;
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - transactions cached for smooth UX

export interface CachedTransactionData {
  transactions: Transaction[];
  timestamp: number;
}

/**
 * Save transactions data to AsyncStorage cache
 */
export const saveTransactionsToCache = async (transactions: Transaction[]): Promise<void> => {
  try {
    const timestamp = Date.now().toString();
    await Promise.all([
      AsyncStorage.setItem(TRANSACTIONS_CACHE_KEY, JSON.stringify(transactions)),
      AsyncStorage.setItem(TRANSACTIONS_CACHE_TIMESTAMP_KEY, timestamp)
    ]);
    logger.info("💾 [TRANSACTIONS CACHE] Saved", transactions.length, "transactions to cache");
  } catch (error) {
    logger.error("❌ [TRANSACTIONS CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load transactions data from AsyncStorage cache
 * Returns null if cache is expired or doesn't exist
 */
export const loadTransactionsFromCache = async (): Promise<Transaction[] | null> => {
  try {
    const [cachedData, timestampStr] = await Promise.all([
      AsyncStorage.getItem(TRANSACTIONS_CACHE_KEY),
      AsyncStorage.getItem(TRANSACTIONS_CACHE_TIMESTAMP_KEY)
    ]);

    if (!cachedData || !timestampStr) {
      logger.info("📦 [TRANSACTIONS CACHE] No cached data found");
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [TRANSACTIONS CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearTransactionsCache();
      return null;
    }

    const transactions = JSON.parse(cachedData) as Transaction[];
    logger.info("📦 [TRANSACTIONS CACHE] Loaded", transactions.length, "transactions from cache, age:", Math.round(age / 1000), "seconds");
    return transactions;
  } catch (error) {
    logger.error("❌ [TRANSACTIONS CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear transactions cache
 */
export const clearTransactionsCache = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(TRANSACTIONS_CACHE_KEY),
      AsyncStorage.removeItem(TRANSACTIONS_CACHE_TIMESTAMP_KEY)
    ]);
    logger.info("🗑️ [TRANSACTIONS CACHE] Cache cleared");
  } catch (error) {
    logger.error("❌ [TRANSACTIONS CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached transactions data exists and is valid
 */
export const hasValidTransactionsCache = async (): Promise<boolean> => {
  try {
    const timestampStr = await AsyncStorage.getItem(TRANSACTIONS_CACHE_TIMESTAMP_KEY);
    if (!timestampStr) return false;

    const timestamp = parseInt(timestampStr);
    const age = Date.now() - timestamp;
    return age <= CACHE_DURATION;
  } catch (error) {
    logger.error("❌ [TRANSACTIONS CACHE] Failed to check cache validity:", error);
    return false;
  }
};

// Default export for Expo Router compatibility
export default {
  saveTransactionsToCache,
  loadTransactionsFromCache,
  clearTransactionsCache,
  hasValidTransactionsCache,
};

