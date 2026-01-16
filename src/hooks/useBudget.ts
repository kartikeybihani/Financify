// React hook for managing budgets
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import {
  getBudgetSummary,
  initializeBudgetForNewUserOrMonth,
  normalizeLegacyBudgetEntriesForCurrentPeriodIfExists,
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

type CategoryBreakdown = [
  string,
  {
    amount: number;
    percentage: number;
    color: string;
    hasRecurringTransactions: boolean;
  }
][];

export function useBudget(categoryBreakdown?: CategoryBreakdown): UseBudgetReturn {
  const toKey = (name?: string | null) => (name || "").trim().toLowerCase();
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track if we've done the initial load - only show loading spinner on initial load, not refreshes
  const hasInitiallyLoadedRef = useRef(false);

  // Load budget data
  const loadBudget = useCallback(async (isRefresh: boolean = false) => {
    try {
      // Only set loading state on initial load, not on refreshes
      if (!isRefresh && !hasInitiallyLoadedRef.current) {
        setLoading(true);
      }
      setError(null);

      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        logger.error("❌ [BUDGET] User not authenticated");
        setError("Not authenticated");
        return;
      }

      // Legacy safety: normalize older budget entry shapes without creating any new periods.
      await normalizeLegacyBudgetEntriesForCurrentPeriodIfExists(authResult.user.id);

      const summary = await getBudgetSummary(authResult.user.id);
      setBudgetSummary(summary);
      hasInitiallyLoadedRef.current = true;
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

        // Fetch all categories from categories table (user-specific only)
        const { data: categories } = await supabase
          .from("categories")
          .select("id, user_id, name, icon, color, slug, is_active, rank")
          .eq("user_id", authResult.user.id)
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

          // Track hidden keys from inactive categories
          categories
            .filter((cat: CategoryRecord) => cat.is_active === false)
            .forEach((cat: CategoryRecord) => addKeys(cat).forEach((k) => hiddenKeys.add(k)));

          // Add active categories
          categories
            .filter((cat: CategoryRecord) => cat.is_active !== false)
            .forEach((cat: CategoryRecord) => {
              addKeys(cat).forEach((k) => byKey.set(k, cat));
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
  // Use categoryBreakdown as source of truth for spent amounts (most accurate)
  const budgetData: BudgetData[] = useMemo(() => {
    if (!budgetSummary) return [];
    
    return (() => {
        // Build map from categoryBreakdown (source of truth for spent amounts)
        const breakdownByKey = new Map<string, { amount: number; label: string; color: string }>();
        if (categoryBreakdown) {
          categoryBreakdown.forEach(([categoryName, data]) => {
            const key = toKey(categoryName);
            breakdownByKey.set(key, {
              amount: data.amount,
              label: categoryName,
              color: data.color,
            });
          });
        }

        // Normalize actuals by key (fallback if categoryBreakdown not provided)
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
        // Prioritize categoryBreakdown keys (source of truth)
        if (categoryBreakdown) {
          breakdownByKey.forEach((_, key) => allCategoryKeys.add(key));
        }
        actualsByKey.forEach((_, key) => allCategoryKeys.add(key));
        budgetEntriesMap.forEach((_, key) => allCategoryKeys.add(key));
        historicalByKey.forEach((_, key) => allCategoryKeys.add(key));
        allCategories.forEach((cat) => {
          allCategoryKeys.add(toKey(cat.slug || cat.name));
        });

        // CRITICAL: Add parent categories from groupings even if they have no transactions
        // This ensures parent categories exist in flatBudgets so children can attach to them
        categoryGroupings.forEach((g) => {
          if (!g.active) return;
          // Add parent category by ID lookup
          const parentCat = allCategories.find((cat) => cat.id === g.parent_category_id);
          if (parentCat) {
            allCategoryKeys.add(toKey(parentCat.slug || parentCat.name));
          }
          // Add child category by ID lookup
          const childCat = allCategories.find((cat) => cat.id === g.child_category_id);
          if (childCat) {
            allCategoryKeys.add(toKey(childCat.slug || childCat.name));
          }
        });

        // Create flat BudgetData for each category (filtered by visibility)
        const flatBudgets = Array.from(allCategoryKeys)
          .filter((categoryKey) => !hiddenCategoryKeys.has(categoryKey))
          .map((categoryKey) => {
            const entryInfo = budgetEntriesMap.get(categoryKey);
            const historicalData = historicalByKey.get(categoryKey);
            const categoryMeta = categoriesByKey.get(categoryKey);
            const actualData = actualsByKey.get(categoryKey);
            const breakdownData = breakdownByKey.get(categoryKey);

            // Use categoryBreakdown as source of truth for spent amounts (most accurate)
            // Fallback to actualsByKey if categoryBreakdown not available
            const spent = breakdownData?.amount ?? actualData?.amount ?? 0;
            
            // Use display name from breakdown if available, otherwise use other sources
            const displayName = breakdownData?.label || categoryMeta?.name || entryInfo?.label || actualData?.label || categoryKey;
            
            // Use color from breakdown if available, otherwise use other sources
            const categoryColor = breakdownData?.color || entryInfo?.entry.category?.color || categoryMeta?.color || "#607D8B";
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
        // CRITICAL: Use categoryId as primary key, fallback to category name only if no ID
        const budgetById = new Map<string, BudgetData>();
        const baseById = new Map<string, BudgetData>();
        flatBudgets.forEach((item) => {
          // Create a fresh object with empty children array
          const itemWithChildren = { ...item, children: [] as BudgetData[] };
          const itemBase = { ...item, children: [] as BudgetData[] };
          
          // Use categoryId as primary key when available (for proper parent-child matching)
          if (item.categoryId) {
            budgetById.set(item.categoryId, itemWithChildren);
            baseById.set(item.categoryId, itemBase);
          }
          
          // Also index by category name as fallback (for categories without IDs)
          const nameKey = item.category;
          if (!budgetById.has(nameKey)) {
            budgetById.set(nameKey, itemWithChildren);
            baseById.set(nameKey, itemBase);
          }
        });

        const childIds = new Set<string>();
        const parentsWithChildren = new Set<string>();
        
        // First pass: ensure all parent categories exist in budgetById
        // This handles cases where parent categories don't have transactions but have children
        categoryGroupings.forEach((g) => {
          if (!g.active) return;
          const parentId = g.parent_category_id;
          
          // Check if parent already exists in budgetById
          let parent = budgetById.get(parentId);
          if (parent) return; // Parent already exists
          
          // Try to find parent in flatBudgets by matching categoryId
          parent = flatBudgets.find((item) => item.categoryId === parentId);
          if (parent) {
            // Parent exists in flatBudgets but wasn't indexed by UUID - add it
            // Get the existing entry if it was indexed by name, or create new one
            const existingEntry = budgetById.get(parent.category) || { ...parent, children: [] };
            const parentWithChildren = { ...existingEntry, children: existingEntry.children ? [...existingEntry.children] : [] };
            const parentBase = { ...existingEntry, children: [] };
            
            // Index by UUID
            budgetById.set(parentId, parentWithChildren);
            baseById.set(parentId, parentBase);
            
            // Also ensure it's indexed by name if not already
            if (!budgetById.has(parent.category)) {
              budgetById.set(parent.category, parentWithChildren);
              baseById.set(parent.category, parentBase);
            }
            
            return;
          }
          
          // Parent not found - create it from grouping data
          if (g.parent) {
            const parentCat = g.parent;
            const parentKey = toKey(parentCat.slug || parentCat.name);
            const parentEntryInfo = budgetEntriesMap.get(parentKey);
            const parentHistoricalData = historicalByKey.get(parentKey);
            const parentBreakdownData = breakdownByKey.get(parentKey);
            const parentActualData = actualsByKey.get(parentKey);
            
            const parentSpent = parentBreakdownData?.amount ?? parentActualData?.amount ?? 0;
            let parentAutoBudget = 0;
            if (!parentEntryInfo?.entry.limit_amount) {
              if (parentHistoricalData) {
                if (parentHistoricalData.months > 1) {
                  parentAutoBudget = Math.round(parentHistoricalData.averageMonthly * 1.2);
                } else {
                  parentAutoBudget = Math.round(parentHistoricalData.totalSpent * 1.2);
                }
              } else if (parentSpent > 0) {
                parentAutoBudget = Math.round(parentSpent * 1.2);
              }
            }
            
            const newParent: BudgetData = {
              category: parentCat.name,
              spent: parentSpent,
              budget: parentEntryInfo?.entry.limit_amount || parentAutoBudget,
              color: parentCat.color || "#607D8B",
              icon: parentCat.icon || null,
              categoryId: parentCat.id,
              entryId: parentEntryInfo?.entry.id || null,
              parentCategoryId: null,
              children: [],
            };
            
            const parentWithChildren = { ...newParent, children: [] };
            const parentBase = { ...newParent, children: [] };
            
            // Index by UUID (primary)
            budgetById.set(parentId, parentWithChildren);
            baseById.set(parentId, parentBase);
            
            // Also index by name for fallback
            budgetById.set(parentCat.name, parentWithChildren);
            baseById.set(parentCat.name, parentBase);
            
          }
        });
        
        // Second pass: attach children to parents and roll up totals
        flatBudgets.forEach((item) => {
          if (!item.categoryId) return;
          const parentId = groupingByChild.get(item.categoryId);
          if (!parentId) return;
          
          // Get parent by UUID (from grouping)
          const parent = budgetById.get(parentId);
          // Get child by UUID
          const child = budgetById.get(item.categoryId);
          
          if (!parent || !child) {
            return;
          }
          
          if (parent.categoryId === child.categoryId) {
            return;
          }

          // Clone child and attach to parent
          const childClone = { ...child, parentCategoryId: parentId };
          if (!parent.children) {
            parent.children = [];
          }
          parent.children.push(childClone);
          
          // Roll up totals
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
        const addedRootIds = new Set<string>();
        
        // Build roots - only include items that aren't children
        // Use categoryId as the unique identifier to avoid duplicates
        budgetById.forEach((item, id) => {
          // Skip if this is a child category - check by categoryId (UUID) not by map key
          // The map key could be UUID or category name, but childIds only contains UUIDs
          if (item.categoryId && childIds.has(item.categoryId)) {
            return;
          }
          
          // Skip if we've already added this root (by categoryId)
          if (item.categoryId && addedRootIds.has(item.categoryId)) return;
          if (!item.categoryId && addedRootIds.has(id)) return;
          
          // Sort children if they exist
          if (item.children && item.children.length > 0) {
            item.children.sort((a, b) => {
              if (a.categoryId === item.categoryId) return -1;
              if (b.categoryId === item.categoryId) return 1;
              return b.budget - a.budget || b.spent - a.spent;
            });
          }
          
          // Mark as added
          if (item.categoryId) {
            addedRootIds.add(item.categoryId);
          } else {
            addedRootIds.add(id);
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

        const sortedRoots = filteredRoots.sort((a, b) => b.budget - a.budget || b.spent - a.spent);

        return sortedRoots;
      })();
  }, [budgetSummary, historicalAverages, allCategories, categoryGroupings, hiddenCategoryKeys, categoryBreakdown]);

  // Calculate totals
  const totalBudget =
    budgetSummary?.period.total_limit ||
    budgetData.reduce((sum, b) => sum + b.budget, 0);

  const totalSpent = budgetSummary?.actuals.overall || 0;
  const totalRemaining = totalBudget - totalSpent;

  // Actions
  const refreshBudget = useCallback(async () => {
    // Pass isRefresh=true to prevent showing loading spinner on refresh
    await loadBudget(true);
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
        if (!authResult?.user?.id) {
          logger.error("❌ [BUDGET] User not authenticated for category deletion");
          return false;
        }

        const userId = authResult.user.id;

        // Step 1: Ensure "Other" category exists before moving transactions
        const {
          ensureOtherCategoryExists,
          getTransactionsByResolvedCategory,
          deactivateCategoryGroupingsForCategory,
          deactivateCategoryRulesForCategory,
          updateTransactionsToOtherCategory,
          deleteBudgetEntriesForCategory,
        } = await import("@/src/types/budget");

        const otherCategoryId = await ensureOtherCategoryExists(userId);
        if (!otherCategoryId) {
          logger.error("❌ [BUDGET] Failed to ensure Other category exists");
          return false;
        }

        // Step 2: Get all transaction IDs that match this category using category resolution
        // This catches all variations: name, slug, resolved keys, etc.
        const matchingTransactionIds = await getTransactionsByResolvedCategory(userId, categoryId);

        // Step 3: Update transactions to "Other" category (if any exist)
        if (matchingTransactionIds.length > 0) {
          const updatedCount = await updateTransactionsToOtherCategory(
            userId,
            matchingTransactionIds
          );

          if (updatedCount === -1) {
            logger.error("❌ [BUDGET] Failed to update transactions to Other category");
            return false;
          }

        }

        // Step 4: Deactivate category groupings involving this category
        const groupingsDeactivated = await deactivateCategoryGroupingsForCategory(
          userId,
          categoryId
        );
        if (!groupingsDeactivated) {
          // Don't fail the whole operation for this
        }

        // Step 5: Deactivate category rules referencing this category
        const rulesDeactivated = await deactivateCategoryRulesForCategory(userId, categoryId);
        if (!rulesDeactivated) {
          // Don't fail the whole operation for this
        }

        // Step 6: Delete all budget entries for this category (across all periods)
        const budgetEntriesDeleted = await deleteBudgetEntriesForCategory(categoryId);
        if (!budgetEntriesDeleted) {
          // Don't fail the whole operation for this
        }

        // Step 7: Soft delete the category (mark as inactive)
        const deleted = await softDeleteCategoryForUser(userId, categoryId);
        if (!deleted) {
          logger.error("❌ [BUDGET] Failed to soft delete category");
          return false;
        }

        // Step 8: Refresh budget data
        await refreshBudget();

        return true;
      } catch (err) {
        logger.error("❌ [BUDGET] Error deleting category:", err);
        return false;
      }
    },
    [refreshBudget]
  );

  const initializeBudget = useCallback(async (forceReinitialize: boolean = false): Promise<boolean> => {
    try {
      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        return false;
      }

      const period = await initializeBudgetForNewUserOrMonth(
        authResult.user.id,
        forceReinitialize
      );
      if (period) {
        await refreshBudget();
        return true;
      }
      return false;
    } catch (err) {
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
