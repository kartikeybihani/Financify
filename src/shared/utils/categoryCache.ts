// Cache for categories and category groupings
import AppStorage from "@/src/utils/storage/storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";
import { CategoryRecord, CategoryGrouping } from "@/src/types/budget";

const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day - categories are stable

// Helper to generate user-specific cache keys
const getCategoriesCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.CATEGORIES}_${userId}`;
const getCategoriesCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.CATEGORIES_TIMESTAMP}_${userId}`;
const getGroupingsCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.CATEGORY_GROUPINGS}_${userId}`;
const getGroupingsCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.CATEGORY_GROUPINGS_TIMESTAMP}_${userId}`;

// Serialized version of categories and groupings
export interface CachedCategoryData {
  userId: string; // CRITICAL: Track which user this cache belongs to
  categories: CategoryRecord[];
  hiddenCategoryKeys: string[]; // Set serialized as array
  timestamp: number;
}

export interface CachedGroupingData {
  userId: string;
  groupings: CategoryGrouping[];
  timestamp: number;
}

/**
 * Save categories to cache (user-specific)
 */
export const saveCategoriesToCache = async (
  userId: string,
  categories: CategoryRecord[],
  hiddenCategoryKeys: Set<string>
): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [CATEGORY CACHE] Cannot save cache without userId");
      return;
    }

    const cacheData: CachedCategoryData = {
      userId,
      categories,
      hiddenCategoryKeys: Array.from(hiddenCategoryKeys),
      timestamp: Date.now(),
    };

    const timestamp = cacheData.timestamp.toString();
    const cacheKey = getCategoriesCacheKey(userId);
    const timestampKey = getCategoriesCacheTimestampKey(userId);

    // Use synchronous operations for better performance
    AppStorage.setItemSync(cacheKey, JSON.stringify(cacheData));
    AppStorage.setItemSync(timestampKey, timestamp);
    logger.info(
      "💾 [CATEGORY CACHE] Saved",
      categories.length,
      "categories for user:",
      userId.substring(0, 8)
    );
  } catch (error) {
    logger.error("❌ [CATEGORY CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load categories from cache synchronously (user-specific)
 * Returns null if cache is expired, doesn't exist, or belongs to different user
 */
export const loadCategoriesFromCache = (
  userId: string
): { categories: CategoryRecord[]; hiddenCategoryKeys: Set<string> } | null => {
  try {
    if (!userId) {
      return null;
    }

    const cacheKey = getCategoriesCacheKey(userId);
    const timestampKey = getCategoriesCacheTimestampKey(userId);

    // Use synchronous reads for instant cache access (MMKV advantage)
    const cachedData = AppStorage.getItemSync(cacheKey);
    const timestampStr = AppStorage.getItemSync(timestampKey);

    if (!cachedData || !timestampStr) {
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const age = Date.now() - timestamp;

    // Show stale data even if expired - user wants instant UI
    // Only check userId match for security
    const data = JSON.parse(cachedData) as CachedCategoryData;
    if (data.userId !== userId) {
      logger.error(
        "🔒 [CATEGORY CACHE] SECURITY: Cache belongs to different user!",
        {
          cachedUserId: data.userId?.substring(0, 8),
          currentUserId: userId.substring(0, 8),
        }
      );
      return null;
    }

    return {
      categories: data.categories,
      hiddenCategoryKeys: new Set(data.hiddenCategoryKeys),
    };
  } catch (error) {
    logger.error("❌ [CATEGORY CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Save category groupings to cache (user-specific)
 */
export const saveGroupingsToCache = async (
  userId: string,
  groupings: CategoryGrouping[]
): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [GROUPING CACHE] Cannot save cache without userId");
      return;
    }

    const cacheData: CachedGroupingData = {
      userId,
      groupings,
      timestamp: Date.now(),
    };

    const timestamp = cacheData.timestamp.toString();
    const cacheKey = getGroupingsCacheKey(userId);
    const timestampKey = getGroupingsCacheTimestampKey(userId);

    // Use synchronous operations for better performance
    AppStorage.setItemSync(cacheKey, JSON.stringify(cacheData));
    AppStorage.setItemSync(timestampKey, timestamp);
    logger.info(
      "💾 [GROUPING CACHE] Saved",
      groupings.length,
      "groupings for user:",
      userId.substring(0, 8)
    );
  } catch (error) {
    logger.error("❌ [GROUPING CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load category groupings from cache synchronously (user-specific)
 * Returns null if cache is expired, doesn't exist, or belongs to different user
 */
export const loadGroupingsFromCache = (
  userId: string
): CategoryGrouping[] | null => {
  try {
    if (!userId) {
      return null;
    }

    const cacheKey = getGroupingsCacheKey(userId);
    const timestampKey = getGroupingsCacheTimestampKey(userId);

    // Use synchronous reads for instant cache access (MMKV advantage)
    const cachedData = AppStorage.getItemSync(cacheKey);
    const timestampStr = AppStorage.getItemSync(timestampKey);

    if (!cachedData || !timestampStr) {
      return null;
    }

    const timestamp = parseInt(timestampStr);
    const age = Date.now() - timestamp;

    // Show stale data even if expired - user wants instant UI
    // Only check userId match for security
    const data = JSON.parse(cachedData) as CachedGroupingData;
    if (data.userId !== userId) {
      logger.error(
        "🔒 [GROUPING CACHE] SECURITY: Cache belongs to different user!",
        {
          cachedUserId: data.userId?.substring(0, 8),
          currentUserId: userId.substring(0, 8),
        }
      );
      return null;
    }

    return data.groupings;
  } catch (error) {
    logger.error("❌ [GROUPING CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear category cache for a specific user
 */
export const clearCategoryCache = async (userId?: string): Promise<void> => {
  try {
    if (userId) {
      // Clear specific user's cache
      const categoriesKey = getCategoriesCacheKey(userId);
      const categoriesTimestampKey = getCategoriesCacheTimestampKey(userId);
      const groupingsKey = getGroupingsCacheKey(userId);
      const groupingsTimestampKey = getGroupingsCacheTimestampKey(userId);
      
      AppStorage.removeItemSync(categoriesKey);
      AppStorage.removeItemSync(categoriesTimestampKey);
      AppStorage.removeItemSync(groupingsKey);
      AppStorage.removeItemSync(groupingsTimestampKey);
      
      logger.info(
        "🗑️ [CATEGORY CACHE] Cache cleared for user:",
        userId.substring(0, 8)
      );
    }
  } catch (error) {
    logger.error("❌ [CATEGORY CACHE] Failed to clear cache:", error);
  }
};
