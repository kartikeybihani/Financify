// core/finny/utils/constants/needConfig.js
// Extracted from api/finny.js lines 1020-1065
// Configuration for data pack requirements and cache mappings

/**
 * Maps data pack needs to their corresponding cache types and pack keys.
 * This configuration is used to determine which data to fetch and how to cache it.
 */
export const NEED_CONFIG = {
  summary_min: {
    packKey: "base",
    cacheType: "summary_min",
  },
  invest_holdings: {
    packKey: "invest",
    cacheType: "investments_all",
  },
  goals_overview: {
    packKey: "goals",
    cacheType: "goals_overview",
  },
  cashflow_monthly: {
    packKey: "cashflow",
    cacheType: "cashflow_monthly",
  },
  spend_total: {
    packKey: "spend",
    cacheType: "spend_data",
  },
  txns_by_category: {
    packKey: "spend", // merged into spend_total pack
    cacheType: "category_transactions",
  },
  category_details: {
    packKey: "categoryDetails",
    cacheType: "category_transactions",
  },
};

/**
 * Cache strategy configuration for in-memory and persistent caching
 */
export const CACHE_STRATEGY = {
  // In-memory cache settings
  in_memory: {
    max_size: 2000, // Maximum number of entries
    cleanup_interval: 10 * 60 * 1000, // Cleanup every 10 minutes
    ttl_multiplier: 0.5, // In-memory TTL is 50% of persistent TTL
  },

  // Persistent cache settings
  persistent: {
    cleanup_interval: 30 * 60 * 1000, // Cleanup every 30 minutes
    batch_cleanup_size: 100, // Clean up 100 expired entries at a time
  },
};
