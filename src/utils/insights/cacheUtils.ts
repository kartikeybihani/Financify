import AppStorage from "@/src/utils/storage/storage";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
import logger from "@/src/utils/core/logger";
import { Transaction } from "@/src/types/plaid";
import { InitialCache } from "@/src/types/insights";

// Dedicated key for storing current userId - simple and reliable
const CURRENT_USER_ID_KEY = "financify_current_user_id";

/**
 * Save the current userId for instant cache loading on next app open
 * Call this whenever user is authenticated
 */
export const saveCurrentUserId = (userId: string): void => {
  try {
    AppStorage.setItemSync(CURRENT_USER_ID_KEY, userId);
  } catch (error) {
    // Silently fail
  }
};

/**
 * Clear the current userId on logout
 */
export const clearCurrentUserId = (): void => {
  try {
    AppStorage.removeItemSync(CURRENT_USER_ID_KEY);
  } catch (error) {
    // Silently fail
  }
};

/**
 * Try to get userId synchronously from session storage for instant cache loading
 * This allows us to load cache before first render, eliminating loading skeleton
 */
export const getUserIdSync = (): string | null => {
  try {
    // PRIORITY 1: Check our dedicated userId storage (most reliable)
    const savedUserId = AppStorage.getItemSync(CURRENT_USER_ID_KEY);
    if (savedUserId) {
      return savedUserId;
    }

    // PRIORITY 2: Try Supabase session storage
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
            // Try multiple possible paths for user ID
            const userId = 
              parsed?.currentSession?.user?.id ||
              parsed?.user?.id ||
              parsed?.session?.user?.id;
            if (userId) {
              // Save it for next time
              saveCurrentUserId(userId);
              return userId;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    // PRIORITY 3: Try to find userId from any cached data
    const allKeys = AppStorage.getAllKeysSync();
    
    // Try home screen cache first (most likely to have userId)
    const homeKey = allKeys.find((key) => key.startsWith("home_screen_cache_"));
    if (homeKey) {
      // Extract userId from key: "home_screen_cache_{userId}"
      const userId = homeKey.replace("home_screen_cache_", "");
      if (userId && userId.length > 10) {
        saveCurrentUserId(userId);
        return userId;
      }
    }

    // Try transaction cache
    const transactionKey = allKeys.find((key) =>
      key.includes(CACHE_CONFIG.KEYS.TRANSACTIONS),
    );
    if (transactionKey) {
      const cachedData = AppStorage.getItemSync(transactionKey);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed?.userId) {
            saveCurrentUserId(parsed.userId);
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
