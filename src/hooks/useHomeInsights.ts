// hooks/useHomeInsights.ts
// Hook to get actionable insights for the home screen carousel

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/src/lib/supabase/supabase";
import { getBudgetSummary, getCurrentBudgetPeriodIfExists } from "@/src/types/budget";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import { getDisplayCategory } from "@/src/utils/categories/transactionCategory";
import { Transaction } from "@/src/types/plaid";
import logger from "@/src/utils/core/logger";

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
 * Get actionable insights for home screen carousel
 * Prioritizes: Budget progress > Category alert (>30%) > Spending summary
 */
export function useHomeInsights(): HomeInsightsData {
  const [insight, setInsight] = useState<HomeInsight | null>(null);
  const [loading, setLoading] = useState(true);

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
  const isExpense = (tx: Transaction): boolean => {
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
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const monthStartStr = formatDate(monthStart);
        const monthEndStr = formatDate(monthEnd);
        const todayStr = formatDate(now);

        // Fetch current month transactions
        const { data: transactions, error } = await supabase
          .from("transactions")
          .select(
            "amount, date, authorized_date, transaction_type, new_category, top_category"
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

        const txList = (transactions || []) as Transaction[];

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

  // Calculate insight
  const calculateInsight = useCallback(async () => {
    try {
      setLoading(true);

      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        setInsight(null);
        setLoading(false);
        return;
      }

      const userId = authResult.user.id;
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
          if (totalBudget > 100 && totalSpent > 0) {
            const percentage = (totalSpent / totalBudget) * 100;
            const remaining = totalBudget - totalSpent;

            setInsight({
              type: "budget_progress",
              budgetProgress: {
                spent: totalSpent,
                total: totalBudget,
                percentage,
                remaining,
                daysLeft,
              },
            });
            setLoading(false);
            return;
          }
        }
      }

      // Priority 2: Check for category alert (>30%)
      const { totalSpent, categoryBreakdown } =
        await getCurrentMonthCategoryBreakdown(userId);

      if (categoryBreakdown.length > 0) {
        const topCategory = categoryBreakdown[0];
        if (topCategory.percentage > 30) {
          // Get category color - try to fetch from DB first, then fallback
          let categoryColor = "#FF6B6B"; // Default red
          
          try {
            // Try to get color from categories table
            const { data: categoryData } = await supabase
              .from("categories")
              .select("color")
              .eq("user_id", userId)
              .ilike("name", topCategory.category)
              .eq("is_active", true)
              .maybeSingle();
            
            if (categoryData?.color) {
              categoryColor = categoryData.color;
            } else {
              // Use fallback mapping
              categoryColor = getCategoryColor(topCategory.category);
            }
          } catch (error) {
            // Use fallback mapping on error
            categoryColor = getCategoryColor(topCategory.category);
          }

          setInsight({
            type: "category_alert",
            categoryAlert: {
              category: topCategory.category,
              amount: topCategory.amount,
              percentage: topCategory.percentage,
              color: categoryColor,
            },
          });
          setLoading(false);
          return;
        }
      }

      // Priority 3: Fallback to spending summary
      if (totalSpent > 0) {
        setInsight({
          type: "spending_summary",
          spendingSummary: {
            totalSpent,
            daysInMonth,
            currentDay,
          },
        });
      } else {
        setInsight(null);
      }

      setLoading(false);
    } catch (error) {
      logger.error("Error calculating home insights:", error);
      setInsight(null);
      setLoading(false);
    }
  }, [getCurrentMonthCategoryBreakdown]);

  // Refresh function
  const refresh = useCallback(async () => {
    await calculateInsight();
  }, [calculateInsight]);

  // Initialize on mount
  useEffect(() => {
    calculateInsight();
  }, [calculateInsight]);

  return {
    insight,
    loading,
    refresh,
  };
}
