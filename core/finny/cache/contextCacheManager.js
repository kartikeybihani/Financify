const DEFAULT_CACHE_TTL = {
  financial_summary: 50 * 60 * 1000,
  summary_min: 50 * 60 * 1000,
  net_worth: 50 * 60 * 1000,
  spend_data: 50 * 60 * 1000,
  goals_overview: 50 * 60 * 1000,
  cashflow_monthly: 50 * 60 * 1000,
  investments_all: 50 * 60 * 1000,
  category_transactions: 50 * 60 * 1000,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createContextCacheManager({
  supabase,
  withTimeout,
  logDebug,
  logInfo,
  logWarn,
  logError,
  cacheStrategy,
  cacheTtl = DEFAULT_CACHE_TTL,
}) {
  const dataCache = new Map();
  let inMemoryCleanupInterval = null;
  let supabaseCleanupInterval = null;
  let lifecycleInitialized = false;

  function generateDataCacheKey(dataType, userId, params = {}) {
    const keyParts = [dataType, userId];
    if (params.period) {
      keyParts.push(`period_${params.period.start}_${params.period.end}`);
    }
    if (params.category) {
      keyParts.push(`category_${params.category}`);
    }
    if (params.limit) {
      keyParts.push(`limit_${params.limit}`);
    }
    if (params.months) {
      keyParts.push(`months_${params.months}`);
    }
    return keyParts.join("_");
  }

  async function cleanupDuplicateCacheEntries(cacheKey, userId) {
    try {
      if (!userId || typeof userId !== "string" || !UUID_RE.test(userId)) {
        logWarn(
          `⚠️ [CACHE] Invalid userId format in cleanupDuplicateCacheEntries: ${userId}`,
        );
        return;
      }

      const { data: allEntries, error } = await supabase
        .from("context_cache")
        .select("*")
        .eq("cache_key", cacheKey)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        logError("❌ [CACHE] Error fetching duplicate entries:", error);
        return;
      }
      if (!allEntries || allEntries.length <= 1) {
        return;
      }

      const entriesToDelete = allEntries.slice(1);
      if (entriesToDelete.length === 0) {
        return;
      }

      const idsToDelete = entriesToDelete.map((entry) => entry.id);
      const { error: deleteError } = await supabase
        .from("context_cache")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) {
        logError("❌ [CACHE] Error deleting duplicate entries:", deleteError);
      } else {
        logDebug(
          `🧹 [CACHE] Cleaned up ${entriesToDelete.length} duplicate cache entries for key: ${cacheKey}`,
        );
      }
    } catch (error) {
      logError("❌ [CACHE] Error in cleanupDuplicateCacheEntries:", error);
    }
  }

  async function getPersistentCache(dataType, userId, params = {}) {
    try {
      const key = generateDataCacheKey(dataType, userId, params);
      logDebug(`🔍 [PERSISTENT_CACHE] Looking for ${dataType} with key: ${key}`);

      const queryPromise = supabase
        .from("context_cache")
        .select("*")
        .eq("cache_key", key)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      const queryResult = await withTimeout(queryPromise, 2500, null);
      if (!queryResult) {
        logWarn(`⏰ [PERSISTENT_CACHE] Timeout reading ${dataType} (${key})`);
        return null;
      }
      const { data, error } = queryResult;

      if (error) {
        logError(
          `❌ [PERSISTENT_CACHE] Database error for ${dataType}:`,
          error.message,
        );
        return null;
      }
      if (!data || data.length === 0) {
        logDebug(`❌ [PERSISTENT_CACHE] No data found for ${dataType} (${key})`);
        return null;
      }

      const cacheEntry = data[0];
      const now = Date.now();
      console.log(
        `🔍 [PERSISTENT_CACHE] Checking expiration for ${dataType}: now=${now}, expires=${
          cacheEntry.expires_at
        }, expired=${now > cacheEntry.expires_at}`,
      );

      if (now > cacheEntry.expires_at) {
        logDebug(`⏰ [PERSISTENT_CACHE] Cache EXPIRED for ${dataType} (${key})`);
        setImmediate(() => {
          cleanupDuplicateCacheEntries(key, userId).catch((err) => {
            logError("❌ [PERSISTENT_CACHE] Cleanup failed:", err);
          });
        });
        return null;
      }

      if (data.length > 1) {
        console.log(
          `🧹 [PERSISTENT_CACHE] Found ${data.length} duplicate entries, cleaning up...`,
        );
        setImmediate(() => {
          cleanupDuplicateCacheEntries(key, userId).catch((err) => {
            logError("❌ [PERSISTENT_CACHE] Cleanup failed:", err);
          });
        });
      }

      console.log(`✅ [PERSISTENT_CACHE] Cache HIT for ${dataType} (${key})`);
      return cacheEntry.cache_data;
    } catch (error) {
      logError(`❌ [PERSISTENT_CACHE] Error getting cache for ${dataType}:`, error);
      return null;
    }
  }

  async function setPersistentCache(dataType, userId, data, params = {}) {
    try {
      const key = generateDataCacheKey(dataType, userId, params);
      const ttl = params.ttl || cacheTtl[dataType] || 5 * 60 * 1000;
      const expires_at = Date.now() + ttl;

      logDebug(
        `💾 [PERSISTENT_CACHE] Setting cache for ${dataType} with key: ${key}, expires: ${new Date(
          expires_at,
        ).toISOString()}, TTL: ${ttl}ms`,
      );

      const deletePromise = supabase
        .from("context_cache")
        .delete()
        .eq("cache_key", key)
        .eq("user_id", userId);
      await withTimeout(deletePromise, 2500, null);

      const insertPromise = supabase.from("context_cache").insert({
        cache_key: key,
        user_id: userId,
        data_type: dataType,
        cache_data: data,
        expires_at,
        created_at: new Date().toISOString(),
      });

      const insertResult = await withTimeout(insertPromise, 2500, null);
      const error = insertResult?.error;
      if (insertResult === null) {
        logWarn(`⏰ [PERSISTENT_CACHE] Timeout setting cache for ${dataType} (${key})`);
      } else if (error) {
        logError(`❌ [PERSISTENT_CACHE] Error setting cache for ${dataType}:`, error);
      } else {
        console.log(`✅ [PERSISTENT_CACHE] Cache SET for ${dataType} (${key})`);
      }
    } catch (error) {
      logError(`❌ [PERSISTENT_CACHE] Error setting cache for ${dataType}:`, error);
    }
  }

  async function getCachedUserData(dataType, userId, params = {}, silent = false) {
    const key = generateDataCacheKey(dataType, userId, params);
    const cached = dataCache.get(key);

    if (cached && Date.now() < cached.expires_at) {
      if (!silent) {
        console.log(`✅ [DATA_CACHE] In-memory cache HIT for ${dataType} (${key})`);
      }
      return cached.data;
    }

    if (cached) {
      if (!silent) {
        logDebug(`⏰ [DATA_CACHE] In-memory cache EXPIRED for ${dataType} (${key})`);
      }
      dataCache.delete(key);
    }

    if (!silent) {
      console.log(`🔍 [DATA_CACHE] Checking persistent cache for ${dataType} (${key})`);
    }

    const persistentData = await getPersistentCache(dataType, userId, params);
    if (!persistentData) return null;

    const ttl = params.ttl || cacheTtl[dataType] || 5 * 60 * 1000;
    dataCache.set(key, {
      data: persistentData,
      expires_at: Date.now() + ttl,
      cached_at: Date.now(),
      dataType,
      userId,
      params,
    });
    return persistentData;
  }

  async function cleanupInMemoryCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of dataCache.entries()) {
      if (now >= value.expires_at) {
        dataCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logDebug(`🧹 [CACHE] Cleaned up ${cleaned} expired in-memory entries`);
    }

    return cleaned;
  }

  async function cleanupSupabaseCache() {
    try {
      const { error, count } = await supabase
        .from("context_cache")
        .delete()
        .lt("expires_at", Date.now())
        .select("id", { count: "exact" });

      if (error) {
        logError("❌ [CACHE] Error cleaning Supabase cache:", error);
        return 0;
      }

      logDebug(`🧹 [CACHE] Cleaned up ${count || 0} expired Supabase cache entries`);
      return count || 0;
    } catch (error) {
      logError("❌ [CACHE] Supabase cleanup failed:", error);
      return 0;
    }
  }

  async function setCachedUserData(dataType, userId, data, params = {}) {
    const key = generateDataCacheKey(dataType, userId, params);
    const ttl = params.ttl || cacheTtl[dataType] || 5 * 60 * 1000;
    const expires_at = Date.now() + ttl;

    dataCache.set(key, {
      data,
      expires_at,
      cached_at: Date.now(),
      dataType,
      userId,
      params,
    });

    setImmediate(() => {
      setPersistentCache(dataType, userId, data, params).catch((error) => {
        logError(
          `❌ [PERSISTENT_CACHE] Background set failed for ${dataType} (${key}):`,
          error,
        );
      });
    });

    const ttlMinutes = Math.round(ttl / (60 * 1000));
    logDebug(`💾 [DATA_CACHE] Cached ${dataType} (${key}) - expires in ${ttlMinutes} minutes`);

    if (dataCache.size > cacheStrategy.in_memory.max_size) {
      logDebug("🧹 [CACHE] Cache size exceeded limit, triggering cleanup");
      setImmediate(() => {
        cleanupInMemoryCache().catch((error) => {
          logError("❌ [CACHE] In-memory cleanup failed:", error);
        });
      });
    }
  }

  async function invalidateUserCache(userId, dataType = null) {
    let invalidatedCount = 0;

    if (dataType) {
      const keyPattern = `${dataType}_${userId}`;

      for (const [key] of dataCache.entries()) {
        if (key.startsWith(keyPattern)) {
          dataCache.delete(key);
          invalidatedCount++;
        }
      }

      try {
        const { error } = await supabase
          .from("context_cache")
          .delete()
          .eq("user_id", userId)
          .eq("data_type", dataType);

        if (error) {
          logError("❌ [CACHE] Error invalidating Supabase cache:", error);
        }
      } catch (error) {
        console.error("❌ [CACHE] Supabase invalidation failed:", error);
      }
    } else {
      for (const [key] of dataCache.entries()) {
        if (key.includes(userId)) {
          dataCache.delete(key);
          invalidatedCount++;
        }
      }

      try {
        const { error } = await supabase
          .from("context_cache")
          .delete()
          .eq("user_id", userId);

        if (error) {
          logError("❌ [CACHE] Error invalidating all user cache:", error);
        }
      } catch (error) {
        console.error("❌ [CACHE] Supabase invalidation failed:", error);
      }

      logInfo(`🗑️ [CACHE] Invalidated all cache for user ${userId}`);
    }

    return invalidatedCount;
  }

  async function cleanupExistingDuplicates() {
    try {
      const { data: allEntries, error } = await supabase
        .from("context_cache")
        .select("cache_key, user_id");

      if (error) {
        console.error("❌ [CACHE] Error finding duplicates:", error);
        return;
      }
      if (!allEntries || allEntries.length === 0) {
        return;
      }

      const duplicates = {};
      for (const entry of allEntries) {
        const key = `${entry.cache_key}_${entry.user_id}`;
        if (!duplicates[key]) duplicates[key] = [];
        duplicates[key].push(entry);
      }

      const duplicateKeys = Object.keys(duplicates).filter(
        (key) => duplicates[key].length > 1,
      );

      if (duplicateKeys.length === 0) {
        console.log("✅ [CACHE] No existing duplicates found");
        return;
      }

      console.log(`🧹 [CACHE] Found ${duplicateKeys.length} cache keys with duplicates`);
      for (const key of duplicateKeys) {
        const firstEntry = duplicates[key][0];
        const cacheKey = firstEntry.cache_key;
        const userId = firstEntry.user_id;

        if (userId && typeof userId === "string" && UUID_RE.test(userId)) {
          await cleanupDuplicateCacheEntries(cacheKey, userId);
        } else {
          logWarn(`⚠️ [CACHE] Skipping cleanup for invalid userId: ${userId}`);
        }
      }
      console.log("✅ [CACHE] Existing duplicates cleaned up");
    } catch (error) {
      console.error("❌ [CACHE] Error cleaning up existing duplicates:", error);
    }
  }

  function initializeLifecycle() {
    if (lifecycleInitialized) return;
    lifecycleInitialized = true;

    logInfo("🔄 [CACHE] Initializing periodic cache cleanup...");

    setImmediate(() => {
      cleanupExistingDuplicates().catch((error) => {
        logError("❌ [CACHE] Startup cleanup failed:", error);
      });
    });

    inMemoryCleanupInterval = setInterval(async () => {
      await cleanupInMemoryCache();
    }, cacheStrategy.in_memory.cleanup_interval);

    supabaseCleanupInterval = setInterval(async () => {
      await cleanupSupabaseCache();
    }, cacheStrategy.persistent.cleanup_interval);

    logInfo("✅ [CACHE] Periodic cleanup initialized");
  }

  function stopLifecycle() {
    if (inMemoryCleanupInterval) clearInterval(inMemoryCleanupInterval);
    if (supabaseCleanupInterval) clearInterval(supabaseCleanupInterval);
    inMemoryCleanupInterval = null;
    supabaseCleanupInterval = null;
    lifecycleInitialized = false;
  }

  return {
    getCachedUserData,
    setCachedUserData,
    invalidateUserCache,
    cleanupInMemoryCache,
    cleanupSupabaseCache,
    cleanupExistingDuplicates,
    initializeLifecycle,
    stopLifecycle,
  };
}
