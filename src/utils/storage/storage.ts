/**
 * Unified storage wrapper using MMKV for synchronous, high-performance storage
 * Maintains AsyncStorage-compatible API for easy migration
 */

import { createMMKV } from "react-native-mmkv";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";

// Create MMKV instance
const storage = createMMKV({
  id: "financify-storage",
  encryptionKey: "financify-encryption-key", // Optional: for encrypted storage
});

// Track if migration has been completed
const MIGRATION_COMPLETE_KEY = "__mmkv_migration_complete";

// Helper functions for sync operations
const getItemSync = (key: string): string | null => {
  try {
    const value = storage.getString(key);
    return value ?? null;
  } catch (error) {
    logger.error(`[STORAGE] Error getting item ${key}:`, error);
    return null;
  }
};

const setItemSync = (key: string, value: string): void => {
  try {
    storage.set(key, value);
  } catch (error) {
    logger.error(`[STORAGE] Error setting item ${key}:`, error);
  }
};

const removeItemSync = (key: string): void => {
  try {
    storage.remove(key);
  } catch (error) {
    logger.error(`[STORAGE] Error removing item ${key}:`, error);
  }
};

const getAllKeysSync = (): string[] => {
  try {
    return storage.getAllKeys();
  } catch (error) {
    logger.error("[STORAGE] Error getting all keys:", error);
    return [];
  }
};

const clearSync = (): void => {
  try {
    storage.clearAll();
  } catch (error) {
    logger.error("[STORAGE] Error clearing storage:", error);
  }
};

/**
 * Storage wrapper that uses MMKV but maintains AsyncStorage API
 * This allows synchronous reads while maintaining async API for compatibility
 */
export const AppStorage = {
  /**
   * Get item synchronously (MMKV advantage)
   */
  getItemSync,

  /**
   * Set item synchronously (MMKV advantage)
   */
  setItemSync,

  /**
   * Remove item synchronously
   */
  removeItemSync,

  /**
   * Check if key exists synchronously
   */
  containsSync: (key: string): boolean => {
    try {
      return storage.contains(key);
    } catch (error) {
      logger.error(`[STORAGE] Error checking key ${key}:`, error);
      return false;
    }
  },

  /**
   * Get all keys synchronously
   */
  getAllKeysSync,

  /**
   * Clear all data synchronously
   */
  clearSync,

  /**
   * Batch remove multiple keys synchronously
   * Note: MMKV doesn't have native batch operations, so we loop through keys
   */
  multiRemoveSync: (keys: string[]): void => {
    keys.forEach((key) => storage.remove(key));
  },

  /**
   * Batch set multiple key-value pairs synchronously
   */
  multiSetSync: (entries: [string, string][]): void => {
    entries.forEach(([key, value]) => storage.set(key, value));
  },

  /**
   * Batch get multiple keys synchronously
   */
  multiGetSync: (keys: string[]): [string, string | null][] => {
    return keys.map((key) => [key, storage.getString(key) ?? null]);
  },

  // Async API for compatibility (uses sync operations but returns promises)
  getItem: async (key: string): Promise<string | null> => {
    return Promise.resolve(getItemSync(key));
  },

  setItem: async (key: string, value: string): Promise<void> => {
    setItemSync(key, value);
    return Promise.resolve();
  },

  removeItem: async (key: string): Promise<void> => {
    removeItemSync(key);
    return Promise.resolve();
  },

  getAllKeys: async (): Promise<string[]> => {
    return Promise.resolve(getAllKeysSync());
  },

  clear: async (): Promise<void> => {
    clearSync();
    return Promise.resolve();
  },
};

/**
 * Migrate existing AsyncStorage data to MMKV
 * This runs once on app startup
 */
export const migrateAsyncStorageToMMKV = async (): Promise<void> => {
  try {
    // Check if migration already completed
    if (storage.contains(MIGRATION_COMPLETE_KEY)) {
      logger.info("✅ [STORAGE] Migration already completed");
      return;
    }

    logger.info("🔄 [STORAGE] Starting AsyncStorage → MMKV migration...");

    // Get all keys from AsyncStorage
    const keys = await AsyncStorage.getAllKeys();
    logger.info(`📦 [STORAGE] Found ${keys.length} keys to migrate`);

    if (keys.length === 0) {
      // No data to migrate, mark as complete
      storage.set(MIGRATION_COMPLETE_KEY, "true");
      logger.info("✅ [STORAGE] No data to migrate");
      return;
    }

    // Get all values in parallel
    const values = await AsyncStorage.multiGet(keys);

    // Migrate to MMKV
    let migratedCount = 0;
    for (const [key, value] of values) {
      if (value !== null) {
        try {
          storage.set(key, value);
          migratedCount++;
        } catch (error) {
          logger.error(`❌ [STORAGE] Failed to migrate key ${key}:`, error);
        }
      }
    }

    // Mark migration as complete
    storage.set(MIGRATION_COMPLETE_KEY, "true");

    logger.info(
      `✅ [STORAGE] Migration complete: ${migratedCount}/${keys.length} keys migrated`
    );

    // Optional: Clear AsyncStorage after successful migration
    // Uncomment if you want to free up space (data is now in MMKV)
    // await AsyncStorage.clear();
  } catch (error) {
    logger.error("❌ [STORAGE] Migration failed:", error);
    // Don't mark as complete if migration failed - will retry next time
  }
};

export default AppStorage;
