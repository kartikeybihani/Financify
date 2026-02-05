// Unified cache configuration for consistent data loading across the app
export const CACHE_CONFIG = {
  // Standard cache durations (in milliseconds)
  DURATIONS: {
    SHORT: 2 * 60 * 1000,    // 2 minutes - for frequently changing data
    MEDIUM: 5 * 60 * 1000,   // 5 minutes - for moderately changing data (current default)
    LONG: 15 * 60 * 1000,    // 15 minutes - for stable data
    VERY_LONG: 7 * 24 * 60 * 60 * 1000, // 7 days - event-based invalidation (not time-based expiry)
  },
  
  // Cache keys for different data types
  KEYS: {
    ACCOUNT_BALANCES: 'cached_account_balances',
    ACCOUNT_BALANCES_TIMESTAMP: 'cached_account_balances_timestamp',
    GOALS: 'cached_goals',
    GOALS_TIMESTAMP: 'cached_goals_timestamp',
    TRANSACTIONS: 'cached_transactions',
    TRANSACTIONS_TIMESTAMP: 'cached_transactions_timestamp',
    FILTERED_TRANSACTIONS: 'cached_filtered_transactions',
    RECURRING_TRANSACTIONS: 'cached_recurring_transactions',
    RECURRING_TRANSACTIONS_TIMESTAMP: 'cached_recurring_transactions_timestamp',
    INVESTMENT_DATA: 'cached_investment_data',
    INVESTMENT_DATA_TIMESTAMP: 'cached_investment_data_timestamp',
    CATEGORIES: 'cached_categories',
    CATEGORIES_TIMESTAMP: 'cached_categories_timestamp',
    CATEGORY_GROUPINGS: 'cached_category_groupings',
    CATEGORY_GROUPINGS_TIMESTAMP: 'cached_category_groupings_timestamp',
    SPENDING_BREAKDOWN: 'cached_spending_breakdown',
    SPENDING_BREAKDOWN_TIMESTAMP: 'cached_spending_breakdown_timestamp',
    BUDGET_DATA: 'cached_budget_data',
    BUDGET_DATA_TIMESTAMP: 'cached_budget_data_timestamp',
    // Home screen cache (firstName, budgetProgress)
    HOME_SCREEN: 'home_screen_cache',
    HOME_SCREEN_TIMESTAMP: 'home_screen_cache_timestamp',
    // Home insights (budget progress, category alerts)
    HOME_INSIGHTS: 'home_insights',
    HOME_INSIGHTS_TIMESTAMP: 'home_insights_timestamp',
  },
  
  // Cache strategies for different data types
  STRATEGIES: {
    ACCOUNT_BALANCES: 'MEDIUM',      // 5 minutes - balances change moderately
    GOALS: 'VERY_LONG',              // 7 days - goals are very stable (event-based invalidation)
    TRANSACTIONS: 'VERY_LONG',       // 7 days - transactions cached for smooth UX (invalidated on sync)
    FILTERED_TRANSACTIONS: 'SHORT',  // 2 minutes - filtered results change with filters
    RECURRING_TRANSACTIONS: 'VERY_LONG', // 7 days - recurring patterns are very stable
    INVESTMENT_DATA: 'VERY_LONG',    // 7 days - investment data is stable for daily use
    CATEGORIES: 'VERY_LONG',         // 7 days - categories rarely change
    SPENDING_BREAKDOWN: 'VERY_LONG', // 7 days - spending breakdown (invalidated on category updates)
    BUDGET_DATA: 'VERY_LONG',        // 7 days - budget data is stable (event-based invalidation)
    HOME_SCREEN: 'VERY_LONG',        // 7 days - firstName and budgetProgress (event-based invalidation)
    HOME_INSIGHTS: 'VERY_LONG',      // 7 days - budget progress (invalidated on transaction sync)
  }
} as const;

// Helper function to get cache duration for a data type
export const getCacheDuration = (dataType: keyof typeof CACHE_CONFIG.STRATEGIES): number => {
  const strategy = CACHE_CONFIG.STRATEGIES[dataType];
  return CACHE_CONFIG.DURATIONS[strategy as keyof typeof CACHE_CONFIG.DURATIONS];
};

// Helper function to get cache key for a data type
export const getCacheKey = (dataType: keyof typeof CACHE_CONFIG.KEYS): string => {
  return CACHE_CONFIG.KEYS[dataType];
};

// Default export for Expo Router compatibility
export default CACHE_CONFIG;
