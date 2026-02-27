// core/finny/utils/constants/cacheConfig.js
// Extracted from api/finny.js lines 857-869
// Cache configuration constants

// Classification cache - in-memory cache for classification results
export const CLASSIFICATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
export const CLASSIFICATION_CACHE_MAX_SIZE = 2000; // Maximum number of entries

// Memory cache - in-memory cache for memory search results (to avoid duplicate loads)
export const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes - memories can change, but same query within 5min should reuse
export const MEMORY_CACHE_MAX_SIZE = 5000; // Maximum number of entries
