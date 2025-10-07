import AsyncStorage from '@react-native-async-storage/async-storage';
import { CACHE_CONFIG, getCacheDuration, getCacheKey } from '../constants/cacheConfig';
import logger from '@/app/_utils/logger';

export interface CachedData<T> {
  data: T;
  timestamp: number;
}

export class CacheManager {
  /**
   * Save data to cache with timestamp
   */
  static async save<T>(
    dataType: keyof typeof CACHE_CONFIG.KEYS,
    data: T
  ): Promise<void> {
    try {
      const cacheKey = getCacheKey(dataType);
      const timestampKey = getCacheKey(`${dataType}_TIMESTAMP` as keyof typeof CACHE_CONFIG.KEYS);
      
      const cacheData: CachedData<T> = {
        data,
        timestamp: Date.now(),
      };
      
      await Promise.all([
        AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData)),
        AsyncStorage.setItem(timestampKey, cacheData.timestamp.toString())
      ]);
      
      logger.info(`💾 [CACHE] Saved ${dataType}:`, Array.isArray(data) ? `${data.length} items` : '1 item');
    } catch (error) {
      logger.error(`❌ [CACHE] Failed to save ${dataType}:`, error);
    }
  }

  /**
   * Load data from cache if valid
   */
  static async load<T>(
    dataType: keyof typeof CACHE_CONFIG.STRATEGIES
  ): Promise<T | null> {
    try {
      const cacheKey = getCacheKey(dataType);
      const timestampKey = getCacheKey(`${dataType}_TIMESTAMP` as keyof typeof CACHE_CONFIG.KEYS);
      
      const [cachedDataString, timestampString] = await Promise.all([
        AsyncStorage.getItem(cacheKey),
        AsyncStorage.getItem(timestampKey)
      ]);

      if (!cachedDataString || !timestampString) {
        logger.info(`📭 [CACHE] No cached data found for ${dataType}`);
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;
      const maxAge = getCacheDuration(dataType);

      logger.info(`📱 [CACHE] ${dataType} cache age: ${Math.round(cacheAge / 1000)}s (max: ${maxAge / 1000}s)`);

      if (cacheAge < maxAge) {
        const cachedData: CachedData<T> = JSON.parse(cachedDataString);
        logger.info(`✅ [CACHE] Using cached ${dataType}:`, Array.isArray(cachedData.data) ? `${cachedData.data.length} items` : '1 item');
        return cachedData.data;
      } else {
        logger.info(`⏰ [CACHE] ${dataType} cache expired, will refresh`);
        return null;
      }
    } catch (error) {
      logger.error(`❌ [CACHE] Failed to load ${dataType}:`, error);
      return null;
    }
  }

  /**
   * Check if cache is valid without loading data
   */
  static async isValid(dataType: keyof typeof CACHE_CONFIG.STRATEGIES): Promise<boolean> {
    try {
      const timestampKey = getCacheKey(`${dataType}_TIMESTAMP` as keyof typeof CACHE_CONFIG.KEYS);
      const timestampString = await AsyncStorage.getItem(timestampKey);
      
      if (!timestampString) return false;

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;
      const maxAge = getCacheDuration(dataType);

      return cacheAge < maxAge;
    } catch (error) {
      logger.error(`❌ [CACHE] Failed to check validity for ${dataType}:`, error);
      return false;
    }
  }

  /**
   * Clear cache for a specific data type
   */
  static async clear(dataType: keyof typeof CACHE_CONFIG.KEYS): Promise<void> {
    try {
      const cacheKey = getCacheKey(dataType);
      const timestampKey = getCacheKey(`${dataType}_TIMESTAMP` as keyof typeof CACHE_CONFIG.KEYS);
      
      await Promise.all([
        AsyncStorage.removeItem(cacheKey),
        AsyncStorage.removeItem(timestampKey)
      ]);
      
      logger.info(`🗑️ [CACHE] Cleared ${dataType} cache`);
    } catch (error) {
      logger.error(`❌ [CACHE] Failed to clear ${dataType}:`, error);
    }
  }

  /**
   * Clear all caches
   */
  static async clearAll(): Promise<void> {
    try {
      const keys = Object.values(CACHE_CONFIG.KEYS);
      await AsyncStorage.multiRemove(keys);
      logger.info(`🗑️ [CACHE] Cleared all caches`);
    } catch (error) {
      logger.error(`❌ [CACHE] Failed to clear all caches:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<Record<string, { age: number; valid: boolean; size?: number }>> {
    const stats: Record<string, any> = {};
    
    for (const [key, dataType] of Object.entries(CACHE_CONFIG.STRATEGIES)) {
      try {
        const timestampKey = getCacheKey(`${key.toUpperCase()}_TIMESTAMP` as keyof typeof CACHE_CONFIG.KEYS);
        const timestampString = await AsyncStorage.getItem(timestampKey);
        
        if (timestampString) {
          const timestamp = parseInt(timestampString, 10);
          const age = Date.now() - timestamp;
          const maxAge = getCacheDuration(dataType as keyof typeof CACHE_CONFIG.STRATEGIES);
          
          stats[key] = {
            age: Math.round(age / 1000), // seconds
            valid: age < maxAge,
            maxAge: Math.round(maxAge / 1000) // seconds
          };
        }
      } catch (error: any) {
        stats[key] = { age: 0, valid: false, error: error.message };
      }
    }
    
    return stats;
  }
}
