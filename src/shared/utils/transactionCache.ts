// app/_shared/utils/transactionCache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";
import { Transaction } from "@/src/types/plaid";

const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - transactions cached for smooth UX

// Helper to generate user-specific cache keys
const getTransactionsCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.TRANSACTIONS}_${userId}`;
const getTransactionsCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.TRANSACTIONS_TIMESTAMP}_${userId}`;

export interface CachedTransactionData {
  userId: string; // CRITICAL: Track which user this cache belongs to
  transactions: Transaction[];
  timestamp: number;
}

/**
 * Save transactions data to AsyncStorage cache (user-specific)
 */
export const saveTransactionsToCache = async (userId: string, transactions: Transaction[]): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [TRANSACTIONS CACHE] Cannot save cache without userId");
      return;
    }

    const cacheData: CachedTransactionData = {
      userId, // Store userId in cached data for validation
      transactions,
      timestamp: Date.now(),
    };
    const timestamp = cacheData.timestamp.toString();
    const cacheKey = getTransactionsCacheKey(userId);
    const timestampKey = getTransactionsCacheTimestampKey(userId);

    await Promise.all([
      AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData)),
      AsyncStorage.setItem(timestampKey, timestamp)
    ]);
    logger.info("💾 [TRANSACTIONS CACHE] Saved", transactions.length, "transactions to cache for user:", userId.substring(0, 8));
  } catch (error) {
    logger.error("❌ [TRANSACTIONS CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load transactions data from AsyncStorage cache (user-specific)
 * Returns null if cache is expired, doesn't exist, or belongs to different user
 */
export const loadTransactionsFromCache = async (userId: string): Promise<Transaction[] | null> => {
  try {
    if (!userId) {
      logger.error("❌ [TRANSACTIONS CACHE] Cannot load cache without userId");
      return null;
    }

    const cacheKey = getTransactionsCacheKey(userId);
    const timestampKey = getTransactionsCacheTimestampKey(userId);

    const [cachedDataStr, timestampStr] = await Promise.all([
      AsyncStorage.getItem(cacheKey),
      AsyncStorage.getItem(timestampKey)
    ]);

    if (!cachedDataStr || !timestampStr) {
      logger.info("📦 [TRANSACTIONS CACHE] No cached data found for user:", userId.substring(0, 8));
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const now = Date.now();
    const age = now - timestamp;

    if (age > CACHE_DURATION) {
      logger.info("⏰ [TRANSACTIONS CACHE] Cache expired, age:", Math.round(age / 1000), "seconds");
      // Clean up expired cache
      await clearTransactionsCache(userId);
      return null;
    }

    // Try to parse as new format (with userId) or old format (just transactions array)
    let data: CachedTransactionData | Transaction[];
    try {
      data = JSON.parse(cachedDataStr);
    } catch (parseError) {
      logger.error("❌ [TRANSACTIONS CACHE] Failed to parse cached data:", parseError);
      await clearTransactionsCache(userId);
      return null;
    }

    // Handle old format (backward compatibility during migration)
    if (Array.isArray(data)) {
      logger.warn("⚠️ [TRANSACTIONS CACHE] Old cache format detected, clearing cache");
      await clearTransactionsCache(userId);
      return null;
    }

    // CRITICAL SECURITY CHECK: Verify cache belongs to current user
    if (data.userId !== userId) {
      logger.error("🔒 [TRANSACTIONS CACHE] SECURITY: Cache belongs to different user! Clearing cache.", {
        cachedUserId: data.userId?.substring(0, 8),
        currentUserId: userId.substring(0, 8)
      });
      await clearTransactionsCache(userId);
      return null;
    }

    logger.info("📦 [TRANSACTIONS CACHE] Loaded", data.transactions.length, "transactions from cache for user:", userId.substring(0, 8), "age:", Math.round(age / 1000), "seconds");
    return data.transactions;
  } catch (error) {
    logger.error("❌ [TRANSACTIONS CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear transactions cache for a specific user
 * If userId is not provided, clears all user caches (for migration/logout)
 */
export const clearTransactionsCache = async (userId?: string): Promise<void> => {
  try {
    if (userId) {
      // Clear specific user's cache
      const cacheKey = getTransactionsCacheKey(userId);
      const timestampKey = getTransactionsCacheTimestampKey(userId);
      await Promise.all([
        AsyncStorage.removeItem(cacheKey),
        AsyncStorage.removeItem(timestampKey)
      ]);
      logger.info("🗑️ [TRANSACTIONS CACHE] Cache cleared for user:", userId.substring(0, 8));
    } else {
      // Clear all user caches (for migration/logout)
      const allKeys = await AsyncStorage.getAllKeys();
      const transactionKeys = allKeys.filter(key => 
        key.startsWith(CACHE_CONFIG.KEYS.TRANSACTIONS) ||
        key.startsWith(CACHE_CONFIG.KEYS.TRANSACTIONS_TIMESTAMP)
      );
      if (transactionKeys.length > 0) {
        await AsyncStorage.multiRemove(transactionKeys);
        logger.info("🗑️ [TRANSACTIONS CACHE] Cleared all user caches:", transactionKeys.length, "keys");
      }
    }
  } catch (error) {
    logger.error("❌ [TRANSACTIONS CACHE] Failed to clear cache:", error);
  }
};

/**
 * Check if cached transactions data exists and is valid for a specific user
 */
export const hasValidTransactionsCache = async (userId: string): Promise<boolean> => {
  try {
    if (!userId) return false;

    const timestampKey = getTransactionsCacheTimestampKey(userId);
    const timestampStr = await AsyncStorage.getItem(timestampKey);
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

