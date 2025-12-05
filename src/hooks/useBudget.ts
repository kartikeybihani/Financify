// React hook for managing budgets
import { useState, useEffect, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import {
  getBudgetSummary,
  initializeBudgetForNewUserOrMonth,
  upsertBudgetEntry,
  deleteBudgetEntry,
  updateBudgetPeriodMeta,
  BudgetSummary,
  BudgetEntry,
  BudgetPeriod,
} from "@/src/services/budgets";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import logger from "@/src/utils/core/logger";

export interface SubcategoryBudgetData {
  name: string;
  spent: number;
  averageMonthly: number;
}

export interface BudgetData {
  category: string;
  spent: number;
  budget: number;
  color: string;
  icon?: string | null; // Icon/emoji from categories table
  subcategories?: SubcategoryBudgetData[]; // Subcategories that were combined into this category
}

export interface UseBudgetReturn {
  // Data
  budgetSummary: BudgetSummary | null;
  budgetData: BudgetData[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  loading: boolean;
  error: string | null;

  // Actions
  refreshBudget: () => Promise<void>;
  updateCategoryBudget: (
    categoryId: string | null,
    categoryName: string,
    amount: number,
    color: string
  ) => Promise<boolean>;
  deleteCategoryBudget: (entryId: string) => Promise<boolean>;
  updateTotalLimit: (amount: number | null) => Promise<boolean>;
  initializeBudget: (forceReinitialize?: boolean) => Promise<boolean>;
}

export function useBudget(): UseBudgetReturn {
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load budget data
  const loadBudget = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        logger.error("❌ [BUDGET] User not authenticated");
        setError("Not authenticated");
        return;
      }

      const summary = await getBudgetSummary(authResult.user.id);
      setBudgetSummary(summary);
    } catch (err) {
      logger.error("❌ [BUDGET] Error loading budget:", err);
      setError(err instanceof Error ? err.message : "Failed to load budget");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  // Listen for auth state changes
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "authStateChanged",
      async (data) => {
        if (data && data.event === "TOKEN_REFRESHED" && data.validated) {
          logger.info("🔄 [BUDGET] Token refreshed, reloading budget...");
          setTimeout(async () => {
            await loadBudget();
          }, 200);
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [loadBudget]);

  // Convert budget summary to BudgetData array for BudgetView
  const budgetData: BudgetData[] = budgetSummary
    ? budgetSummary.entries
        .filter((entry) => entry.scope_type === "category")
        .map((entry) => {
          const categoryName = entry.category?.name || entry.label;
          const categoryColor = entry.category?.color || "#607D8B";
          const spent =
            budgetSummary.actuals.byCategory.get(categoryName) || 0;

          // Get subcategories if they exist
          const subcategories: SubcategoryBudgetData[] | undefined = 
            budgetSummary.actuals.bySubcategory?.get(categoryName) && budgetSummary.actuals.bySubcategory.get(categoryName)!.size > 0
              ? Array.from(budgetSummary.actuals.bySubcategory.get(categoryName)!.entries())
                  .map(([subcatName, subcatSpent]) => ({
                    name: subcatName,
                    spent: subcatSpent,
                    averageMonthly: subcatSpent, // For current period, spent = average (we can enhance this later)
                  }))
                  .sort((a, b) => b.spent - a.spent) // Sort by spent amount, highest first
              : undefined;
          
          if (subcategories && subcategories.length > 0) {
            console.log(`[BUDGET] Category: ${categoryName}, Subcategories: ${subcategories.map(s => `${s.name} ($${s.spent})`).join(", ")}`);
          }

          return {
            category: categoryName,
            spent,
            budget: entry.limit_amount,
            color: categoryColor,
            icon: entry.category?.icon || null,
            subcategories: subcategories && subcategories.length > 0 ? subcategories : undefined,
          };
        })
    : [];

  // Calculate totals
  const totalBudget =
    budgetSummary?.period.total_limit ||
    budgetData.reduce((sum, b) => sum + b.budget, 0);

  const totalSpent = budgetSummary?.actuals.overall || 0;
  const totalRemaining = totalBudget - totalSpent;

  // Actions
  const refreshBudget = useCallback(async () => {
    await loadBudget();
  }, [loadBudget]);

  const updateCategoryBudget = useCallback(
    async (
      categoryId: string | null,
      categoryName: string,
      amount: number,
      color: string
    ): Promise<boolean> => {
      if (!budgetSummary) return false;

      try {
        const entry = await upsertBudgetEntry(budgetSummary.period.id, {
          scope_type: categoryId ? "category" : "group",
          category_id: categoryId,
          label: categoryName,
          limit_amount: amount,
        });

        if (entry) {
          await refreshBudget();
          return true;
        }
        return false;
      } catch (err) {
        logger.error("❌ [BUDGET] Error updating category budget:", err);
        return false;
      }
    },
    [budgetSummary, refreshBudget]
  );

  const deleteCategoryBudget = useCallback(
    async (entryId: string): Promise<boolean> => {
      try {
        const success = await deleteBudgetEntry(entryId);
        if (success) {
          await refreshBudget();
        }
        return success;
      } catch (err) {
        logger.error("❌ [BUDGET] Error deleting category budget:", err);
        return false;
      }
    },
    [refreshBudget]
  );

  const updateTotalLimit = useCallback(
    async (amount: number | null): Promise<boolean> => {
      if (!budgetSummary) return false;

      try {
        const updated = await updateBudgetPeriodMeta(
          budgetSummary.period.id,
          {
            total_limit: amount,
          }
        );

        if (updated) {
          await refreshBudget();
          return true;
        }
        return false;
      } catch (err) {
        logger.error("❌ [BUDGET] Error updating total limit:", err);
        return false;
      }
    },
    [budgetSummary, refreshBudget]
  );

  const initializeBudget = useCallback(async (forceReinitialize: boolean = false): Promise<boolean> => {
    try {
      console.log("[BUDGET] Hook: Initializing budget, force:", forceReinitialize);
      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        console.log("[BUDGET] Hook: User not authenticated");
        return false;
      }

      const period = await initializeBudgetForNewUserOrMonth(
        authResult.user.id,
        forceReinitialize
      );
      if (period) {
        console.log("[BUDGET] Hook: Budget initialized, refreshing...");
        await refreshBudget();
        console.log("[BUDGET] Hook: Budget refreshed successfully");
        return true;
      }
      console.log("[BUDGET] Hook: Failed to initialize budget");
      return false;
    } catch (err) {
      console.error("[BUDGET] Hook: Error initializing budget:", err);
      logger.error("[BUDGET] Hook: Error initializing budget:", err);
      return false;
    }
  }, [refreshBudget]);

  return {
    budgetSummary,
    budgetData,
    totalBudget,
    totalSpent,
    totalRemaining,
    loading,
    error,
    refreshBudget,
    updateCategoryBudget,
    deleteCategoryBudget,
    updateTotalLimit,
    initializeBudget,
  };
}

export default useBudget;


