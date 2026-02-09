// Cache utility for onboarding progress
import AppStorage from "@/src/utils/storage/storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";
import { OnboardingStatus } from "@/src/utils/onboarding/onboardingProgress";

const ONBOARDING_CACHE_KEY = "onboarding_progress_cache";
const ONBOARDING_CACHE_TIMESTAMP_KEY = "onboarding_progress_cache_timestamp";
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 7 days - event-based invalidation

interface CachedOnboardingData {
  userId: string;
  status: OnboardingStatus;
  timestamp: number;
}

/**
 * Save onboarding status to cache
 */
export const saveOnboardingToCache = async (
  userId: string,
  status: OnboardingStatus
): Promise<void> => {
  try {
    if (!userId) {
      logger.error("❌ [ONBOARDING CACHE] Cannot save cache without userId");
      return;
    }

    const cacheData: CachedOnboardingData = {
      userId,
      status,
      timestamp: Date.now(),
    };

    const cacheKey = `${ONBOARDING_CACHE_KEY}_${userId}`;
    const timestampKey = `${ONBOARDING_CACHE_TIMESTAMP_KEY}_${userId}`;

    // Use synchronous operations for better performance
    AppStorage.setItemSync(cacheKey, JSON.stringify(cacheData));
    AppStorage.setItemSync(timestampKey, cacheData.timestamp.toString());
    logger.debug(`💾 [ONBOARDING CACHE] Saved onboarding status for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [ONBOARDING CACHE] Failed to save to cache:", error);
  }
};

/**
 * Load onboarding status from cache synchronously
 */
export const loadOnboardingFromCache = (userId: string): OnboardingStatus | null => {
  try {
    if (!userId) {
      return null;
    }

    const cacheKey = `${ONBOARDING_CACHE_KEY}_${userId}`;
    const timestampKey = `${ONBOARDING_CACHE_TIMESTAMP_KEY}_${userId}`;

    // Use synchronous reads for instant cache access (MMKV advantage)
    const cachedDataStr = AppStorage.getItemSync(cacheKey);
    const timestampStr = AppStorage.getItemSync(timestampKey);

    if (!cachedDataStr || !timestampStr) {
      return null;
    }

    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    const cacheAge = now - timestamp;

    if (cacheAge > CACHE_DURATION) {
      logger.debug(`⏰ [ONBOARDING CACHE] Cache expired, age: ${Math.round(cacheAge / 1000)}s`);
      return null;
    }

    const cachedData = JSON.parse(cachedDataStr) as CachedOnboardingData;

    // CRITICAL SECURITY CHECK: Verify cache belongs to current user
    if (cachedData.userId !== userId) {
      logger.error("🔒 [ONBOARDING CACHE] SECURITY: Cache belongs to different user! Clearing cache.", {
        cachedUserId: cachedData.userId?.substring(0, 8),
        currentUserId: userId.substring(0, 8)
      });
      clearOnboardingCache(userId);
      return null;
    }

    logger.debug(`📦 [ONBOARDING CACHE] Loaded from cache for user: ${userId.substring(0, 8)}, age: ${Math.round(cacheAge / 1000)}s`);
    return cachedData.status;
  } catch (error) {
    logger.error("❌ [ONBOARDING CACHE] Failed to load from cache:", error);
    return null;
  }
};

/**
 * Clear onboarding cache for a specific user
 */
export const clearOnboardingCache = (userId?: string): void => {
  try {
    if (userId) {
      // Clear specific user's cache
      const cacheKey = `${ONBOARDING_CACHE_KEY}_${userId}`;
      const timestampKey = `${ONBOARDING_CACHE_TIMESTAMP_KEY}_${userId}`;
      AppStorage.removeItemSync(cacheKey);
      AppStorage.removeItemSync(timestampKey);
      logger.debug(`🗑️ [ONBOARDING CACHE] Cache cleared for user: ${userId.substring(0, 8)}`);
    } else {
      // Clear all user caches
      const allKeys = AppStorage.getAllKeysSync();
      const onboardingKeys = allKeys.filter(key => 
        key.startsWith(ONBOARDING_CACHE_KEY) ||
        key.startsWith(ONBOARDING_CACHE_TIMESTAMP_KEY)
      );
      if (onboardingKeys.length > 0) {
        AppStorage.multiRemoveSync(onboardingKeys);
        logger.debug(`🗑️ [ONBOARDING CACHE] Cleared all user caches: ${onboardingKeys.length} keys`);
      }
    }
  } catch (error) {
    logger.error("❌ [ONBOARDING CACHE] Failed to clear cache:", error);
  }
};

// Default export
export default {
  saveOnboardingToCache,
  loadOnboardingFromCache,
  clearOnboardingCache,
};
