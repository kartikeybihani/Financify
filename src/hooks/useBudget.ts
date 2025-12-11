// React hook for managing budgets
import { useState, useEffect, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import {
  getBudgetSummary,
  initializeBudgetForNewUserOrMonth,
  upsertBudgetEntry,
  deleteBudgetEntry,
  updateBudgetPeriodMeta,
  getHistoricalCategoryAverages,
  getCategoryGroupings,
  upsertCategoryGrouping,
  deactivateCategoryGrouping,
  softDeleteCategoryForUser,
} from "@/src/types/budget";
import {
  BudgetSummary,
  BudgetEntry,
  BudgetPeriod,
  CategoryRecord,
  CategoryGrouping,
  BudgetData,
} from "@/src/types/budget";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import logger from "@/src/utils/core/logger";
import { supabase } from "@/src/lib/supabase/supabase";

export interface UseBudgetReturn {
  // Data
  budgetSummary: BudgetSummary | null;
  budgetData: BudgetData[];
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  loading: boolean;
  error: string | null;
  categoryGroupings: CategoryGrouping[];
  categories: CategoryRecord[];
  hiddenCategoryKeys: Set<string>;

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
  groupCategory: (childCategoryId: string, parentCategoryId: string) => Promise<boolean>;
  ungroupCategory: (childCategoryId: string) => Promise<boolean>;
  deleteCategory: (categoryId: string, entryId?: string | null) => Promise<boolean>;
}

export function useBudget(): UseBudgetReturn {
  const toKey = (name?: string | null) => (name || "").trim().toLowerCase();
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

      // Backfill any missing categories without overwriting existing limits
      await initializeBudgetForNewUserOrMonth(authResult.user.id, false);

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

  // State for historical averages and categories
  const [historicalAverages, setHistoricalAverages] = useState<Map<string, { averageMonthly: number; totalSpent: number; months: number }>>(new Map());
  const [allCategories, setAllCategories] = useState<CategoryRecord[]>([]);
  const [categoryGroupings, setCategoryGroupings] = useState<CategoryGrouping[]>([]);
  const [hiddenCategoryKeys, setHiddenCategoryKeys] = useState<Set<string>>(new Set());

  // Fetch historical averages and categories
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        const authResult = await getAuthenticatedUser();
        if (!authResult?.user?.id) return;

        // Fetch historical averages
        const averages = await getHistoricalCategoryAverages(authResult.user.id, 12);
        setHistoricalAverages(averages);

        // Fetch all categories from categories table
        const { data: categories } = await supabase
          .from("categories")
          .select("id, user_id, name, icon, color, slug, is_active, rank")
          .or(`user_id.eq.${authResult.user.id},user_id.is.null`)
          .order("rank", { ascending: true });

        if (categories) {
          const hiddenKeys = new Set<string>();
          const byKey = new Map<string, CategoryRecord>();
          const addKeys = (cat: CategoryRecord) => {
            const keys = new Set<string>();
            if (cat.slug) keys.add(toKey(cat.slug));
            keys.add(toKey(cat.name));
            keys.add(toKey(cat.name.replace(/\s+/g, "-")));
            return keys;
          };

          categories
            .filter((cat: CategoryRecord) => cat.user_id === authResult.user.id && cat.is_active === false)
            .forEach((cat: CategoryRecord) => addKeys(cat).forEach((k) => hiddenKeys.add(k)));

          categories
            .filter((cat: CategoryRecord) => cat.user_id === authResult.user.id && cat.is_active !== false)
            .forEach((cat: CategoryRecord) => {
              addKeys(cat).forEach((k) => byKey.set(k, cat));
            });

          categories
            .filter((cat: CategoryRecord) => !cat.user_id)
            .forEach((cat: CategoryRecord) => {
              const keys = addKeys(cat);
              const isHidden = Array.from(keys).some((k) => hiddenKeys.has(k));
              const overridden = Array.from(keys).some((k) => byKey.has(k));
              if (isHidden || overridden || cat.is_active === false) return;
              keys.forEach((k) => byKey.set(k, cat));
            });

          setAllCategories(Array.from(byKey.values()));
          setHiddenCategoryKeys(hiddenKeys);
        }

        const groupings = await getCategoryGroupings(authResult.user.id);
        setCategoryGroupings(groupings);
      } catch (err) {
        logger.error("❌ [BUDGET] Error fetching historical data:", err);
      }
    };

    if (budgetSummary) {
      fetchHistoricalData();
    }
  }, [budgetSummary]);

  // Convert budget summary to BudgetData array for BudgetView
  // Include ALL categories that have had transactions in the past OR exist in categories table
  const budgetData: BudgetData[] = budgetSummary
    ? (() => {
        // Normalize actuals by key
        const actualsByKey = new Map<string, { amount: number; label: string }>();
        budgetSummary.actuals.byCategory.forEach((amount, label) => {
          const key = toKey(label);
          const existing = actualsByKey.get(key);
          actualsByKey.set(key, {
            amount: (existing?.amount || 0) + amount,
            label: existing?.label || label,
          });
        });

        // Normalize historical averages by key
        const historicalByKey = new Map<string, { averageMonthly: number; totalSpent: number; months: number; label: string }>();
        historicalAverages.forEach((data, label) => {
          const key = toKey(label);
          const existing = historicalByKey.get(key);
          historicalByKey.set(key, {
            averageMonthly: data.averageMonthly,
            totalSpent: data.totalSpent,
            months: data.months,
            label: existing?.label || label,
          });
        });

        // Category metadata lookup by key (slug or name)
        const categoriesByKey = new Map<string, CategoryRecord>();
        allCategories.forEach((cat) => {
          categoriesByKey.set(toKey(cat.slug || cat.name), cat);
          categoriesByKey.set(toKey(cat.name), cat);
          if (cat.slug) {
            categoriesByKey.set(toKey(cat.slug), cat);
          }
        });

        // Create a map of budget entries by category key
        const budgetEntriesMap = new Map<string, { entry: typeof budgetSummary.entries[0]; label: string }>();
        budgetSummary.entries
          .filter((entry) => entry.scope_type === "category")
          .forEach((entry) => {
            const label = entry.category?.name || entry.label.trim();
            const key = entry.category?.slug ? toKey(entry.category.slug) : toKey(label);
            budgetEntriesMap.set(key, { entry, label });
          });

        // Get all categories from multiple sources
        const allCategoryKeys = new Set<string>();
        actualsByKey.forEach((_, key) => allCategoryKeys.add(key));
        budgetEntriesMap.forEach((_, key) => allCategoryKeys.add(key));
        historicalByKey.forEach((_, key) => allCategoryKeys.add(key));
        allCategories.forEach((cat) => {
          allCategoryKeys.add(toKey(cat.slug || cat.name));
        });

        // Create flat BudgetData for each category (filtered by visibility)
        const flatBudgets = Array.from(allCategoryKeys)
          .filter((categoryKey) => !hiddenCategoryKeys.has(categoryKey))
          .map((categoryKey) => {
            const entryInfo = budgetEntriesMap.get(categoryKey);
            const historicalData = historicalByKey.get(categoryKey);
            const categoryMeta = categoriesByKey.get(categoryKey);
            const actualData = actualsByKey.get(categoryKey);

            const displayName = categoryMeta?.name || entryInfo?.label || actualData?.label || categoryKey;
            const spent = actualData?.amount || 0;
            const categoryColor = entryInfo?.entry.category?.color || categoryMeta?.color || "#607D8B";
            const categoryIcon = entryInfo?.entry.category?.icon || categoryMeta?.icon || null;
            const categoryId = entryInfo?.entry.category?.id || categoryMeta?.id || null;

            // Calculate auto-budget if no budget entry exists
            let autoBudget = 0;
            if (!entryInfo?.entry.limit_amount) {
              if (historicalData) {
                if (historicalData.months > 1) {
                  autoBudget = Math.round(historicalData.averageMonthly * 1.2);
                } else {
                  autoBudget = Math.round(historicalData.totalSpent * 1.2);
                }
              } else if (spent > 0) {
                autoBudget = Math.round(spent * 1.2);
              }
            }

            return {
              category: displayName,
              spent,
              budget: entryInfo?.entry.limit_amount || autoBudget,
              color: categoryColor,
              icon: categoryIcon,
              categoryId,
              entryId: entryInfo?.entry.id || null,
              parentCategoryId: null,
              children: [],
            } as BudgetData;
          })
          .sort((a, b) => {
            const aKey = toKey(a.category);
            const bKey = toKey(b.category);
            const aHasBudget = a.budget > 0 && budgetEntriesMap.has(aKey);
            const bHasBudget = b.budget > 0 && budgetEntriesMap.has(bKey);
            if (aHasBudget && !bHasBudget) return -1;
            if (!aHasBudget && bHasBudget) return 1;
            return b.spent - a.spent;
          });

        // Build grouping maps
        const groupingByChild = new Map<string, string>();
        categoryGroupings.forEach((g) => {
          if (!g.active) return;
          groupingByChild.set(g.child_category_id, g.parent_category_id);
        });

        // Index budgets by categoryId for grouping
        const budgetById = new Map<string, BudgetData>();
        const baseById = new Map<string, BudgetData>();
        flatBudgets.forEach((item) => {
          const key = item.categoryId || item.category;
          budgetById.set(key, { ...item, children: item.children ? [...item.children] : [] });
          baseById.set(key, { ...item, children: [] });
        });

        const childIds = new Set<string>();
        const parentsWithChildren = new Set<string>();
        // Attach children to parents and roll up totals
        flatBudgets.forEach((item) => {
          if (!item.categoryId) return;
          const parentId = groupingByChild.get(item.categoryId);
          if (!parentId) return;
          const parent = budgetById.get(parentId);
          const child = budgetById.get(item.categoryId) || item;
          if (!parent || parent.categoryId === child.categoryId) return;

          const childClone = { ...child, parentCategoryId: parentId };
          parent.children = parent.children || [];
          parent.children.push(childClone);
          parent.budget += childClone.budget;
          parent.spent += childClone.spent;
          childIds.add(item.categoryId);
          parentsWithChildren.add(parentId);
        });

        // Insert parent's own entry as first subcategory when it has children
        parentsWithChildren.forEach((parentId) => {
          const parent = budgetById.get(parentId);
          const base = baseById.get(parentId);
          if (parent && base) {
            const selfChild: BudgetData = {
              ...base,
              parentCategoryId: parentId,
              children: [],
            };
            parent.children = [selfChild, ...(parent.children || [])];
          }
        });

        const roots: BudgetData[] = [];
        budgetById.forEach((item, id) => {
          if (childIds.has(id)) return;
          if (item.children) {
            item.children.sort((a, b) => {
              if (a.categoryId === item.categoryId) return -1;
              if (b.categoryId === item.categoryId) return 1;
              return b.budget - a.budget || b.spent - a.spent;
            });
          }
          roots.push(item);
        });

        // Add any items without categoryId (can't be grouped)
        flatBudgets
          .filter((item) => !item.categoryId)
          .forEach((item) => roots.push(item));

        // Remove Income from budget UI
        const filteredRoots = roots
          .map((root) => ({
            ...root,
            children: root.children?.filter((c) => toKey(c.category) !== "income"),
          }))
          .filter((root) => toKey(root.category) !== "income");

        return filteredRoots.sort((a, b) => b.budget - a.budget || b.spent - a.spent);
      })()
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

  const groupCategory = useCallback(
    async (childCategoryId: string, parentCategoryId: string): Promise<boolean> => {
      try {
        const authResult = await getAuthenticatedUser();
        if (!authResult?.user?.id) return false;
        const success = await upsertCategoryGrouping(
          authResult.user.id,
          parentCategoryId,
          childCategoryId
        );
        if (success) {
          await refreshBudget();
        }
        return success;
      } catch (err) {
        logger.error("❌ [BUDGET] Error grouping category:", err);
        return false;
      }
    },
    [refreshBudget]
  );

  const ungroupCategory = useCallback(
    async (childCategoryId: string): Promise<boolean> => {
      try {
        const authResult = await getAuthenticatedUser();
        if (!authResult?.user?.id) return false;
        const success = await deactivateCategoryGrouping(authResult.user.id, childCategoryId);
        if (success) {
          await refreshBudget();
        }
        return success;
      } catch (err) {
        logger.error("❌ [BUDGET] Error ungrouping category:", err);
        return false;
      }
    },
    [refreshBudget]
  );

  const deleteCategory = useCallback(
    async (categoryId: string, entryId?: string | null): Promise<boolean> => {
      try {
        const authResult = await getAuthenticatedUser();
        if (!authResult?.user?.id) return false;

        // Get category name before deleting
        const { data: categoryData } = await supabase
          .from("categories")
          .select("name")
          .eq("id", categoryId)
          .maybeSingle();

        const categoryName = categoryData?.name;

        // Move all transactions from this category to "Other"
        if (categoryName) {
          // Update transactions where new_category matches the deleted category
          const { error: updateNewCategoryError } = await supabase
            .from("transactions")
            .update({ new_category: "Other" })
            .eq("user_id", authResult.user.id)
            .eq("new_category", categoryName);

          if (updateNewCategoryError) {
            logger.error("❌ [BUDGET] Error updating new_category:", updateNewCategoryError);
          }

          // Update transactions where top_category matches the deleted category
          const { error: updateTopCategoryError } = await supabase
            .from("transactions")
            .update({ top_category: "Other" })
            .eq("user_id", authResult.user.id)
            .eq("top_category", categoryName)
            .is("new_category", null);

          if (updateTopCategoryError) {
            logger.error("❌ [BUDGET] Error updating top_category:", updateTopCategoryError);
          }
        }

        const deleted = await softDeleteCategoryForUser(authResult.user.id, categoryId);
        if (deleted && entryId) {
          await deleteBudgetEntry(entryId);
        }
        if (deleted) {
          await refreshBudget();
        }
        return deleted;
      } catch (err) {
        logger.error("❌ [BUDGET] Error deleting category:", err);
        return false;
      }
    },
    [refreshBudget]
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
    groupCategory,
    ungroupCategory,
    deleteCategory,
    categoryGroupings,
    categories: allCategories,
    hiddenCategoryKeys,
  };
}

export default useBudget;
