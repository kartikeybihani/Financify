import AppStorage from "@/src/utils/storage/storage";
import logger from "@/src/utils/core/logger";

const PROFILE_STYLE_KEY = "cached_finny_style";
const PROFILE_CHECKIN_KEY = "cached_checkin_frequency";

type FinnyStyle = "conversational" | "direct" | "witty";
type CheckinFrequency = "daily" | "3times" | "weekly" | "never";

// In-memory cache for instant synchronous access (session-level)
let memoryStyleCache: FinnyStyle | null = null;
let memoryCheckinCache: CheckinFrequency | null = null;
let memoryCacheInitialized = false;

/**
 * Initialize in-memory cache from AsyncStorage (call on app startup)
 * This provides truly instant reads within the same session
 */
export const initializeProfileCache = async (): Promise<void> => {
  if (memoryCacheInitialized) return;

  try {
    // Use synchronous reads (no Promise.all needed)
    const style = AppStorage.getItemSync(PROFILE_STYLE_KEY);
    const checkin = AppStorage.getItemSync(PROFILE_CHECKIN_KEY);

    if (style && ["conversational", "direct", "witty"].includes(style)) {
      memoryStyleCache = style as FinnyStyle;
    }
    if (
      checkin &&
      ["daily", "3times", "weekly", "never"].includes(checkin)
    ) {
      memoryCheckinCache = checkin as CheckinFrequency;
    }
    memoryCacheInitialized = true;
  } catch (error) {
    logger.warn("[ProfileCache] Error initializing cache:", error);
    memoryCacheInitialized = true; // Mark as initialized even on error
  }
};

/**
 * Get cached finny style (instant synchronous read from memory)
 * Returns null if not cached
 */
export const getCachedFinnyStyle = (): FinnyStyle | null => {
  return memoryStyleCache;
};

/**
 * Get cached checkin frequency (instant synchronous read from memory)
 * Returns null if not cached
 */
export const getCachedCheckinFrequency = (): CheckinFrequency | null => {
  return memoryCheckinCache;
};

/**
 * Cache finny style (updates both memory and AsyncStorage)
 */
export const cacheFinnyStyle = async (style: FinnyStyle): Promise<void> => {
  // Update memory cache immediately (synchronous)
  memoryStyleCache = style;

  // Persist to AsyncStorage (async, fire and forget)
  try {
    AppStorage.setItemSync(PROFILE_STYLE_KEY, style);
    logger.info(`[ProfileCache] Cached finny_style: ${style}`);
  } catch (error) {
    logger.error("[ProfileCache] Error caching finny_style:", error);
  }
};

/**
 * Cache checkin frequency (updates both memory and AsyncStorage)
 */
export const cacheCheckinFrequency = async (
  frequency: CheckinFrequency
): Promise<void> => {
  // Update memory cache immediately (synchronous)
  memoryCheckinCache = frequency;

  // Persist to AsyncStorage (async, fire and forget)
  try {
    AppStorage.setItemSync(PROFILE_CHECKIN_KEY, frequency);
    logger.info(`[ProfileCache] Cached checkin_frequency: ${frequency}`);
  } catch (error) {
    logger.error("[ProfileCache] Error caching checkin_frequency:", error);
  }
};

/**
 * Clear all profile caches (memory + AsyncStorage, useful on logout)
 */
export const clearProfileCache = async (): Promise<void> => {
  // Clear memory cache immediately (synchronous)
  memoryStyleCache = null;
  memoryCheckinCache = null;
  memoryCacheInitialized = false;

  // Clear AsyncStorage (async)
  try {
    AppStorage.multiRemoveSync([PROFILE_STYLE_KEY, PROFILE_CHECKIN_KEY]);
    logger.info("[ProfileCache] Cleared all profile caches");
  } catch (error) {
    logger.error("[ProfileCache] Error clearing profile cache:", error);
  }
};

