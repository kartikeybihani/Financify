// hooks/useHomeInsights.ts
// Hook to get actionable insights for the home screen carousel
// OPTIMIZED: Uses VERY_LONG cache (7 days) with event-based invalidation
// Shows stale data immediately, refreshes in background

import { useState, useEffect, useCallback, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import { supabase } from "@/src/lib/supabase/supabase";
import { getBudgetSummary, getCurrentBudgetPeriodIfExists } from "@/src/types/budget";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import { getDisplayCategory } from "@/src/utils/categories/transactionCategory";
import { Transaction } from "@/src/types/plaid";
import logger from "@/src/utils/core/logger";
import AppStorage from "@/src/utils/storage/storage";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
import {
  updateBudgetProgressInCache,
  loadBudgetProgressFromCache,
  BudgetProgressData,
} from "@/src/shared/utils/homeScreenCache";
import { getUserIdSync } from "@/src/utils/insights/cacheUtils";

// Cache keys - user-specific
const INSIGHTS_CACHE_KEY = "home_insights";
const getInsightsCacheKey = (userId: string) => `${INSIGHTS_CACHE_KEY}_${userId}`;
const getInsightsTimestampKey = (userId: string) => `${INSIGHTS_CACHE_KEY}_timestamp_${userId}`;

// CHANGED: Use VERY_LONG (7 days) with event-based invalidation
// Budget changes when: transactions sync (every 2h) or budget is edited
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG;

// Helper to get category color (fallback mapping)
const getCategoryColor = (categoryName: string): string => {
  const colorMap: { [key: string]: string } = {
    Groceries: "#4CAF50",
    Food: "#FF6B6B",
    "Dining Out": "#FF6B6B",
    Housing: "#8E44AD",
    Transportation: "#45B7D1",
    Shopping: "#4ECDC4",
    Entertainment: "#96CEB4",
    Subscriptions: "#9C27B0",
    "Health & Fitness": "#2E7D32",
    "Bills & Utilities": "#FF9800",
    "Personal Care": "#E91E63",
    Travel: "#2196F3",
    Education: "#795548",
    "Savings & Investments": "#27AE60",
    Income: "#1B5E20",
    Other: "#607D8B",
  };

  return colorMap[categoryName] || "#607D8B";
};

export interface HomeInsight {
  type: "budget_progress" | "category_alert" | "spending_summary";
  // Budget progress
  budgetProgress?: {
    spent: number;
    total: number;
    percentage: number;
    remaining: number;
    daysLeft: number;
  };
  // Category alert
  categoryAlert?: {
    category: string;
    amount: number;
    percentage: number;
    color: string;
  };
  // Spending summary
  spendingSummary?: {
    totalSpent: number;
    daysInMonth: number;
    currentDay: number;
  };
}

export interface HomeInsightsData {
  insight: HomeInsight | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Load cached insight synchronously
 * Always returns stale data if available for instant UI
 * Tries multiple cache sources for maximum hit rate
 */
const loadCachedInsight = (userId: string | null): HomeInsight | null => {
  try {
    // If we have userId, try the dedicated insights cache first
    if (userId) {
      const cacheKey = getInsightsCacheKey(userId);
      const cacheString = AppStorage.getItemSync(cacheKey);

      if (cacheString) {
        const cachedData = JSON.parse(cacheString) as HomeInsight & { userId?: string };
        // Security check
        if (!cachedData.userId || cachedData.userId === userId) {
          return cachedData;
        }
      }

      // Try homeScreenCache as fallback
      const homeCache = loadBudgetProgressFromCache(userId);
      if (homeCache?.hasBudget && homeCache.budgetProgress) {
        return {
          type: "budget_progress",
          budgetProgress: homeCache.budgetProgress,
        };
      }
    }

    // If no userId yet, we can't load user-specific cache
    // The parent component should pass initialBudgetProgress prop instead
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Get actionable insights for home screen carousel
 * Prioritizes: Budget progress > Category alert (>30%) > Spending summary
 * 
 * OPTIMIZED:
 * - Uses 7-day cache (event-based invalidation)
 * - Shows stale data immediately for instant UI
 * - Refreshes in background without blocking UI
 * - Listens to financialDataRefreshed events for invalidation
 */
export function useHomeInsights(): HomeInsightsData {
  // Get userId synchronously for cache loading
  const userIdRef = useRef<string | null>(getUserIdSync());
  
  // Load cache synchronously before first render (MMKV advantage)
  // CHANGED: Always show stale data for instant UI
  const initialCache = loadCachedInsight(userIdRef.current);

  // Initialize state with cached data if available (instant UI)
  const [insight, setInsight] = useState<HomeInsight | null>(initialCache);
  // CHANGED: If we have ANY cached data, don't show loading state
  const [loading, setLoading] = useState(!initialCache);
  const isRefreshingRef = useRef(false);

  // Helper to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper to get effective date (authorized_date || date)
  const getEffectiveDate = (tx: Transaction): string => {
    return tx.authorized_date || tx.date;
  };

  // Helper to check if transaction is an expense
  const isExpense = (tx: Transaction & { transaction_type?: string }): boolean => {
    return (
      tx.amount > 0 &&
      tx.transaction_type !== "transfer" &&
      tx.new_category !== "INTERNAL_TRANSFER"
    );
  };

  // Get current month category breakdown
  const getCurrentMonthCategoryBreakdown = useCallback(
    async (userId: string) => {
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthStartStr = formatDate(monthStart);
        const todayStr = formatDate(now);

        // Fetch current month transactions
        const { data: transactions, error } = await supabase
          .from("transactions")
          .select(
            "amount, date, authorized_date, transaction_type, new_category, top_category, name"
          )
          .eq("user_id", userId)
          .gte("date", monthStartStr)
          .lte("date", todayStr)
          .gt("amount", 0)
          .neq("transaction_type", "transfer");

        if (error) {
          logger.error("Error fetching transactions for insights:", error);
          return { totalSpent: 0, categoryBreakdown: [] };
        }

        const txList = (transactions || []) as (Transaction & { transaction_type?: string })[];

        // Filter by effective date and calculate breakdown
        const categoryMap = new Map<string, { amount: number; count: number }>();
        let totalSpent = 0;

        txList.forEach((tx) => {
          if (!isExpense(tx)) return;

          const effectiveDate = getEffectiveDate(tx);
          if (effectiveDate < monthStartStr || effectiveDate > todayStr) return;

          const category = getDisplayCategory(tx);
          const amount = tx.amount;

          totalSpent += amount;

          if (!categoryMap.has(category)) {
            categoryMap.set(category, { amount: 0, count: 0 });
          }

          const existing = categoryMap.get(category)!;
          existing.amount += amount;
          existing.count += 1;
        });

        // Convert to array and calculate percentages
        const categoryBreakdown = Array.from(categoryMap.entries())
          .map(([category, data]) => ({
            category,
            amount: data.amount,
            percentage: totalSpent > 0 ? (data.amount / totalSpent) * 100 : 0,
          }))
          .sort((a, b) => b.amount - a.amount);

        return { totalSpent, categoryBreakdown };
      } catch (error) {
        logger.error("Error in getCurrentMonthCategoryBreakdown:", error);
        return { totalSpent: 0, categoryBreakdown: [] };
      }
    },
    []
  );

  // Save to both caches
  const saveToCache = useCallback((userId: string, data: HomeInsight | null): void => {
    try {
      if (data) {
        const cacheKey = getInsightsCacheKey(userId);
        const timestampKey = getInsightsTimestampKey(userId);
        
        // Save with userId for security validation
        const cacheData = { ...data, userId };
        AppStorage.setItemSync(cacheKey, JSON.stringify(cacheData));
        AppStorage.setItemSync(timestampKey, Date.now().toString());

        // Also update homeScreenCache for cross-component access
        if (data.type === "budget_progress" && data.budgetProgress) {
          updateBudgetProgressInCache(userId, data.budgetProgress, true);
        } else {
          // No budget - update cache accordingly
          updateBudgetProgressInCache(userId, null, false);
        }
      }
    } catch (error) {
      logger.error("❌ [INSIGHTS CACHE] Failed to save:", error);
    }
  }, []);

  // Calculate insight - OPTIMIZED to run in background
  const calculateInsight = useCallback(async (hasCache: boolean = false) => {
    // Prevent multiple simultaneous refreshes
    if (isRefreshingRef.current) {
      return;
    }
    
    try {
      isRefreshingRef.current = true;
      
      // CHANGED: Only show loading if we have NO cached data at all
      if (!hasCache) {
        setLoading(true);
      }

      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        setInsight(null);
        setLoading(false);
        return;
      }

      const userId = authResult.user.id;
      userIdRef.current = userId;
      
      const now = new Date();
      const daysInMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).getDate();
      const currentDay = now.getDate();
      const daysLeft = daysInMonth - currentDay;

      // Priority 1: Check for budget progress
      const budgetPeriod = await getCurrentBudgetPeriodIfExists(userId, now);
      if (budgetPeriod) {
        const budgetSummary = await getBudgetSummary(userId, now);
        if (budgetSummary) {
          // Calculate total budget from entries or total_limit
          let totalBudget = budgetSummary.period.total_limit || 0;

          // If no total_limit, sum up category budgets
          if (totalBudget === 0 || totalBudget === null) {
            totalBudget = budgetSummary.entries.reduce(
              (sum, entry) => sum + Number(entry.limit_amount || 0),
              0
            );
          }

          const totalSpent = budgetSummary.actuals.overall;

          // Only show budget progress if budget is meaningful (> $100)
          if (totalBudget > 100) {
            const percentage = totalSpent > 0 ? (totalSpent / totalBudget) * 100 : 0;
            const remaining = totalBudget - totalSpent;

            const budgetInsight: HomeInsight = {
              type: "budget_progress",
              budgetProgress: {
                spent: totalSpent,
                total: totalBudget,
                percentage,
                remaining,
                daysLeft,
              },
            };
            setInsight(budgetInsight);
            saveToCache(userId, budgetInsight);
            setLoading(false);
            return;
          }
        }
      }

      // No budget - update homeScreenCache
      updateBudgetProgressInCache(userId, null, false);

      // Priority 2: Check for category alert (>30%)
      const { totalSpent, categoryBreakdown } =
        await getCurrentMonthCategoryBreakdown(userId);

      if (categoryBreakdown.length > 0) {
        const topCategory = categoryBreakdown[0];
        if (topCategory.percentage > 30) {
          // Get category color - use fallback mapping (skip DB query for speed)
          const categoryColor = getCategoryColor(topCategory.category);

          const categoryInsight: HomeInsight = {
            type: "category_alert",
            categoryAlert: {
              category: topCategory.category,
              amount: topCategory.amount,
              percentage: topCategory.percentage,
              color: categoryColor,
            },
          };
          setInsight(categoryInsight);
          saveToCache(userId, categoryInsight);
          setLoading(false);
          return;
        }
      }

      // Priority 3: Fallback to spending summary
      if (totalSpent > 0) {
        const spendingInsight: HomeInsight = {
          type: "spending_summary",
          spendingSummary: {
            totalSpent,
            daysInMonth,
            currentDay,
          },
        };
        setInsight(spendingInsight);
        saveToCache(userId, spendingInsight);
      } else {
        setInsight(null);
      }

      setLoading(false);
    } catch (error) {
      logger.error("Error calculating home insights:", error);
      // CHANGED: Don't clear insight on error - keep stale data
      setLoading(false);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [getCurrentMonthCategoryBreakdown, saveToCache]);

  // Refresh function
  const refresh = useCallback(async () => {
    await calculateInsight(!!insight);
  }, [calculateInsight, insight]);

  // Initialize on mount - only run once
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    // Prevent multiple initializations
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    // CHANGED: Always refresh in background, but don't block UI
    // Cache was already loaded synchronously above
    calculateInsight(!!initialCache);
  }, [calculateInsight, initialCache]);

  // Listen for data refresh events to invalidate cache
  useEffect(() => {
    const financialSub = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      () => {
        calculateInsight(true);
      }
    );
    const budgetSub = DeviceEventEmitter.addListener("budgetUpdated", () => {
      // Budget total/category updated - refetch for QuickStats
      calculateInsight(true);
    });

    return () => {
      financialSub.remove();
      budgetSub.remove();
    };
  }, [calculateInsight]);

  return {
    insight,
    loading,
    refresh,
  };
}

/**
 * Clear insights cache for user
 */
export const clearInsightsCache = (userId: string): void => {
  try {
    const cacheKey = getInsightsCacheKey(userId);
    const timestampKey = getInsightsTimestampKey(userId);
    AppStorage.removeItemSync(cacheKey);
    AppStorage.removeItemSync(timestampKey);
    logger.info(`🗑️ [INSIGHTS CACHE] Cleared for user: ${userId.substring(0, 8)}`);
  } catch (error) {
    logger.error("❌ [INSIGHTS CACHE] Failed to clear:", error);
  }
};
