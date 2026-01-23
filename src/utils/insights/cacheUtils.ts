import AppStorage from "@/src/utils/storage/storage";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
import logger from "@/src/utils/core/logger";
import { Transaction } from "@/src/types/plaid";
import { InitialCache } from "@/src/types/insights";

/**
 * Try to get userId synchronously from session storage for instant cache loading
 * This allows us to load cache before first render, eliminating loading skeleton
 */
export const getUserIdSync = (): string | null => {
  try {
    // Try to get userId from Supabase session storage (Supabase stores it)
    // Check common Supabase session storage keys
    // Get Supabase URL from environment variables
    const supabaseUrl =
      process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) {
      const urlParts = supabaseUrl.split("//")[1]?.split(".");
      if (urlParts && urlParts.length > 0) {
        const sessionKey = `sb-${urlParts[0]}-auth-token`;
        const sessionData = AppStorage.getItemSync(sessionKey);
        if (sessionData) {
          try {
            const parsed = JSON.parse(sessionData);
            if (parsed?.currentSession?.user?.id) {
              return parsed.currentSession.user.id;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    // Fallback: Try to find userId from any cached transaction data
    // This is a best-effort approach - we'll validate later
    const allKeys = AppStorage.getAllKeysSync();
    const transactionKey = allKeys.find((key) =>
      key.includes(CACHE_CONFIG.KEYS.TRANSACTIONS),
    );
    if (transactionKey) {
      const cachedData = AppStorage.getItemSync(transactionKey);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed?.userId) {
            return parsed.userId;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  } catch (error) {
    // Silently fail - will fall back to async userId fetch
  }
  return null;
};

/**
 * Load cache synchronously before first render (like unified hook does)
 */
export const loadInitialCache = (userId: string | null): InitialCache => {
  if (!userId) {
    return { transactions: [], hasCache: false };
  }

  try {
    // Use the same cache key format as transactionCache utility
    const cacheKey = `${CACHE_CONFIG.KEYS.TRANSACTIONS}_${userId}`;
    const timestampKey = `${CACHE_CONFIG.KEYS.TRANSACTIONS_TIMESTAMP}_${userId}`;

    const cachedDataStr = AppStorage.getItemSync(cacheKey);
    const timestampStr = AppStorage.getItemSync(timestampKey);

    if (!cachedDataStr || !timestampStr) {
      return { transactions: [], hasCache: false };
    }

    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    const age = now - timestamp;

    // Check if cache is valid (1 day = 86400000ms, same as CACHE_CONFIG.DURATIONS.VERY_LONG)
    if (age > 86400000) {
      return { transactions: [], hasCache: false };
    }

    const data = JSON.parse(cachedDataStr);

    // Validate userId matches (security check)
    if (data.userId !== userId) {
      return { transactions: [], hasCache: false };
    }

    if (
      data.transactions &&
      Array.isArray(data.transactions) &&
      data.transactions.length > 0
    ) {
      logger.info(
        `📦 [INSIGHTS] Loaded ${data.transactions.length} transactions from cache synchronously`,
      );
      return { transactions: data.transactions, hasCache: true };
    }
  } catch (error) {
    // Silently fail - will load async
  }

  return { transactions: [], hasCache: false };
};
