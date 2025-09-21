// api/utils/simpleCache.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Simple caching system using Supabase
 * Stores scraped data with TTL and ETag support
 */

// Cache configuration
const CACHE_CONFIG = {
  // Different TTLs for different data types
  ttl: {
    creditCard: 30 * 24 * 60 * 60, // 30 days
    bank: 30 * 24 * 60 * 60, // 30 days
    investment: 7 * 24 * 60 * 60, // 7 days
    generic: 90 * 24 * 60 * 60, // 90 days
    userRecommendation: 60 * 60, // 1 hour (user-specific)
  },

  // Maximum cache size per key
  maxCacheSize: 1000000, // 1MB

  // Cleanup interval
  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Generate cache key for different data types
 */
function generateCacheKey(type, identifier, userSpecific = false) {
  const baseKey = `${type}_${identifier}`;
  return userSpecific ? `user_${baseKey}` : baseKey;
}

/**
 * Get cached data
 */
export async function getCachedData(type, identifier, userSpecific = false) {
  try {
    const cacheKey = generateCacheKey(type, identifier, userSpecific);

    const { data: cached, error } = await supabase
      .from("web_scrape_cache")
      .select("*")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (error) {
      console.error("❌ [CACHE] Error getting cached data:", error);
      return null;
    }

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const now = new Date();
    const cachedAt = new Date(cached.created_at);
    const ttl = CACHE_CONFIG.ttl[cached.data_type] || CACHE_CONFIG.ttl.generic;
    const age = (now - cachedAt) / 1000; // age in seconds

    if (age > ttl) {
      console.log(
        `🕒 [CACHE] Cache expired for ${cacheKey}, age: ${age}s, ttl: ${ttl}s`
      );
      return null;
    }

    console.log(`✅ [CACHE] Cache hit for ${cacheKey}, age: ${age}s`);
    return {
      data: cached.data_json,
      cachedAt: cached.created_at,
      ttl: ttl - age,
      source: "cache",
    };
  } catch (error) {
    console.error("❌ [CACHE] Error in getCachedData:", error);
    return null;
  }
}

/**
 * Set cached data
 */
export async function setCachedData(
  type,
  identifier,
  data,
  userSpecific = false
) {
  try {
    const cacheKey = generateCacheKey(type, identifier, userSpecific);

    // Check cache size
    const dataSize = JSON.stringify(data).length;
    if (dataSize > CACHE_CONFIG.maxCacheSize) {
      console.warn(`⚠️ [CACHE] Data too large for cache: ${dataSize} bytes`);
      return false;
    }

    const cacheData = {
      cache_key: cacheKey,
      data_type: type,
      data_json: data,
      user_specific: userSpecific,
      data_size: dataSize,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("web_scrape_cache")
      .upsert(cacheData, { onConflict: "cache_key" });

    if (error) {
      console.error("❌ [CACHE] Error setting cached data:", error);
      return false;
    }

    console.log(
      `✅ [CACHE] Cached data for ${cacheKey}, size: ${dataSize} bytes`
    );
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in setCachedData:", error);
    return false;
  }
}

/**
 * Get cached data with fallback
 */
export async function getCachedDataWithFallback(
  type,
  identifier,
  fallbackFn,
  userSpecific = false
) {
  // Try to get from cache first
  const cached = await getCachedData(type, identifier, userSpecific);
  if (cached) {
    return cached;
  }

  // If not in cache, call fallback function
  console.log(
    `🔄 [CACHE] Cache miss for ${type}_${identifier}, calling fallback`
  );
  try {
    const freshData = await fallbackFn();

    // Cache the fresh data
    await setCachedData(type, identifier, freshData, userSpecific);

    return {
      data: freshData,
      cachedAt: new Date().toISOString(),
      ttl: CACHE_CONFIG.ttl[type] || CACHE_CONFIG.ttl.generic,
      source: "fresh",
    };
  } catch (error) {
    console.error("❌ [CACHE] Fallback function failed:", error);
    throw error;
  }
}

/**
 * Invalidate cache for a specific key
 */
export async function invalidateCache(type, identifier, userSpecific = false) {
  try {
    const cacheKey = generateCacheKey(type, identifier, userSpecific);

    const { error } = await supabase
      .from("web_scrape_cache")
      .delete()
      .eq("cache_key", cacheKey);

    if (error) {
      console.error("❌ [CACHE] Error invalidating cache:", error);
      return false;
    }

    console.log(`🗑️ [CACHE] Invalidated cache for ${cacheKey}`);
    return true;
  } catch (error) {
    console.error("❌ [CACHE] Error in invalidateCache:", error);
    return false;
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache() {
  try {
    const now = new Date();

    // Get all cache entries
    const { data: allEntries, error: fetchError } = await supabase
      .from("web_scrape_cache")
      .select("*");

    if (fetchError) {
      console.error("❌ [CACHE] Error fetching cache entries:", fetchError);
      return;
    }

    const expiredKeys = [];

    for (const entry of allEntries) {
      const cachedAt = new Date(entry.created_at);
      const ttl = CACHE_CONFIG.ttl[entry.data_type] || CACHE_CONFIG.ttl.generic;
      const age = (now - cachedAt) / 1000; // age in seconds

      if (age > ttl) {
        expiredKeys.push(entry.cache_key);
      }
    }

    if (expiredKeys.length > 0) {
      const { error: deleteError } = await supabase
        .from("web_scrape_cache")
        .delete()
        .in("cache_key", expiredKeys);

      if (deleteError) {
        console.error(
          "❌ [CACHE] Error deleting expired entries:",
          deleteError
        );
      } else {
        console.log(
          `🧹 [CACHE] Cleaned up ${expiredKeys.length} expired cache entries`
        );
      }
    }
  } catch (error) {
    console.error("❌ [CACHE] Error in cleanupExpiredCache:", error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const { data: stats, error } = await supabase
      .from("web_scrape_cache")
      .select("data_type, data_size, created_at");

    if (error) {
      console.error("❌ [CACHE] Error getting cache stats:", error);
      return null;
    }

    const typeStats = {};
    let totalSize = 0;
    let totalEntries = 0;

    for (const entry of stats) {
      const type = entry.data_type;
      if (!typeStats[type]) {
        typeStats[type] = { count: 0, size: 0 };
      }
      typeStats[type].count++;
      typeStats[type].size += entry.data_size;
      totalSize += entry.data_size;
      totalEntries++;
    }

    return {
      totalEntries,
      totalSize,
      typeStats,
      config: CACHE_CONFIG,
    };
  } catch (error) {
    console.error("❌ [CACHE] Error in getCacheStats:", error);
    return null;
  }
}

// Start cleanup interval
setInterval(cleanupExpiredCache, CACHE_CONFIG.cleanupInterval);
