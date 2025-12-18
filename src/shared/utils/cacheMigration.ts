// Migration utility to clear old global cache keys on first launch after update
// This ensures old cache data (without user_id) is cleared to prevent data leakage

import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "../constants/cacheConfig";

const MIGRATION_COMPLETE_KEY = "cache_migration_v2_complete";

/**
 * Old global cache keys that need to be cleared (without user_id)
 */
const OLD_GLOBAL_CACHE_KEYS = [
  // Investment cache
  CACHE_CONFIG.KEYS.INVESTMENT_DATA,
  CACHE_CONFIG.KEYS.INVESTMENT_DATA_TIMESTAMP,
  // Recurring cache
  CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS,
  CACHE_CONFIG.KEYS.RECURRING_TRANSACTIONS_TIMESTAMP,
  // Account balances cache
  CACHE_CONFIG.KEYS.ACCOUNT_BALANCES,
  CACHE_CONFIG.KEYS.ACCOUNT_BALANCES_TIMESTAMP,
  // Transactions cache
  CACHE_CONFIG.KEYS.TRANSACTIONS,
  CACHE_CONFIG.KEYS.TRANSACTIONS_TIMESTAMP,
  // Spending cache
  CACHE_CONFIG.KEYS.SPENDING_BREAKDOWN,
  CACHE_CONFIG.KEYS.SPENDING_BREAKDOWN_TIMESTAMP,
  // Goals cache (if exists)
  CACHE_CONFIG.KEYS.GOALS,
  CACHE_CONFIG.KEYS.GOALS_TIMESTAMP,
];

/**
 * Run cache migration to clear old global cache keys
 * This should be called once on app startup after the update
 */
export const runCacheMigration = async (): Promise<void> => {
  try {
    // Check if migration has already been completed
    const migrationComplete = await AsyncStorage.getItem(MIGRATION_COMPLETE_KEY);
    if (migrationComplete === "true") {
      logger.info("✅ [CACHE MIGRATION] Migration already completed, skipping");
      return;
    }

    logger.info("🔄 [CACHE MIGRATION] Starting cache migration to clear old global cache keys...");

    // Get all AsyncStorage keys
    const allKeys = await AsyncStorage.getAllKeys();
    
    // Find old global cache keys that exist
    const keysToRemove = OLD_GLOBAL_CACHE_KEYS.filter(key => allKeys.includes(key));

    if (keysToRemove.length > 0) {
      logger.info(`🗑️ [CACHE MIGRATION] Found ${keysToRemove.length} old global cache keys to remove:`, keysToRemove);
      await AsyncStorage.multiRemove(keysToRemove);
      logger.info("✅ [CACHE MIGRATION] Old global cache keys cleared successfully");
    } else {
      logger.info("ℹ️ [CACHE MIGRATION] No old global cache keys found");
    }

    // Also clear any keys that match old patterns but aren't in our list
    // This catches any edge cases or variations
    const oldPatternKeys = allKeys.filter(key => {
      // Match old cache patterns (without user_id suffix)
      return (
        key === "cached_investment_data" ||
        key === "cached_investment_data_timestamp" ||
        key === "cached_recurring_transactions" ||
        key === "cached_recurring_transactions_timestamp" ||
        key === "cached_account_balances" ||
        key === "cached_account_balances_timestamp" ||
        key === "cached_transactions" ||
        key === "cached_transactions_timestamp" ||
        key === "cached_spending_breakdown" ||
        key === "cached_spending_breakdown_timestamp" ||
        key === "cached_goals" ||
        key === "cached_goals_timestamp" ||
        // Also catch old hardcoded keys
        key === "@investment_cache" ||
        key === "@recurring_cache" ||
        key === "@balances_cache" ||
        key === "@goals_cache" ||
        key === "@cash_cache"
      );
    });

    if (oldPatternKeys.length > 0) {
      logger.info(`🗑️ [CACHE MIGRATION] Found ${oldPatternKeys.length} additional old cache keys to remove:`, oldPatternKeys);
      await AsyncStorage.multiRemove(oldPatternKeys);
    }

    // Mark migration as complete
    await AsyncStorage.setItem(MIGRATION_COMPLETE_KEY, "true");
    logger.info("✅ [CACHE MIGRATION] Migration completed successfully");
  } catch (error) {
    logger.error("❌ [CACHE MIGRATION] Failed to run cache migration:", error);
    // Don't throw - migration failure shouldn't break the app
  }
};

/**
 * Check if cache migration has been completed
 */
export const isCacheMigrationComplete = async (): Promise<boolean> => {
  try {
    const migrationComplete = await AsyncStorage.getItem(MIGRATION_COMPLETE_KEY);
    return migrationComplete === "true";
  } catch (error) {
    logger.error("❌ [CACHE MIGRATION] Failed to check migration status:", error);
    return false;
  }
};

// Default export
export default {
  runCacheMigration,
  isCacheMigrationComplete,
};
