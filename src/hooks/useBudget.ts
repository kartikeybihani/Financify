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
import {
  loadCategoriesFromCache,
  saveCategoriesToCache,
  loadGroupingsFromCache,
  saveGroupingsToCache,
} from "@/src/shared/utils/categoryCache";
import {
  saveBudgetToCache,
  loadBudgetFromCache,
} from "@/src/shared/utils/budgetCache";
import { getUserIdSync } from "@/src/utils/insights/cacheUtils";

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
  
  // Get userId synchronously for cache loading
  const initialUserId = getUserIdSync();
  
  // Load cached budget data synchronously on mount for instant UI
  // Show stale data immediately, refresh in background
  const initialCachedBudget = useMemo(() => {
    if (!initialUserId) return null;
    return loadBudgetFromCache(initialUserId);
  }, [initialUserId]);
  
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(
    initialCachedBudget?.budgetSummary || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track if we've done the initial load - mark as loaded if we have cache
  const hasInitiallyLoadedRef = useRef(!!initialCachedBudget);

  // Load budget data from database
  const loadBudgetFromDB = useCallback(async () => {
    try {
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
      
      // Note: budgetData will be computed and cached in useEffect below
    } catch (err) {
      logger.error("❌ [BUDGET] Error loading budget:", err);
      setError(err instanceof Error ? err.message : "Failed to load budget");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load budget data - show cache immediately, refresh in background
  const loadBudget = useCallback(async (isRefresh: boolean = false) => {
    // If we have cached data and this is not a manual refresh, show cache and refresh in background
    if (initialCachedBudget && !isRefresh) {
      // Show cached data immediately (already set in state initialization)
      hasInitiallyLoadedRef.current = true;
      
      // Refresh in background without blocking UI
      loadBudgetFromDB().catch((err) =>
        logger.error("Background budget refresh failed:", err)
      );
      return;
    }

    // No cache or manual refresh - load from database
    await loadBudgetFromDB();
  }, [initialCachedBudget, loadBudgetFromDB]);

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

  // Load cached categories and groupings synchronously on mount for instant UI
  const initialCachedCategories = useMemo(() => {
    if (!initialUserId) return null;
    return loadCategoriesFromCache(initialUserId);
  }, [initialUserId]);
  
  const initialCachedGroupings = useMemo(() => {
    if (!initialUserId) return null;
    return loadGroupingsFromCache(initialUserId);
  }, [initialUserId]);

  // State for historical averages and categories
  // Initialize historical averages from cache if available
  const [historicalAverages, setHistoricalAverages] = useState<Map<string, { averageMonthly: number; totalSpent: number; months: number }>>(
    initialCachedBudget?.historicalAverages || new Map()
  );
  const [allCategories, setAllCategories] = useState<CategoryRecord[]>(
    initialCachedCategories?.categories || []
  );
  const [categoryGroupings, setCategoryGroupings] = useState<CategoryGrouping[]>(
    initialCachedGroupings || []
  );
  const [hiddenCategoryKeys, setHiddenCategoryKeys] = useState<Set<string>>(
    initialCachedCategories?.hiddenCategoryKeys || new Set()
  );
  // Track if categories/groupings have been fetched to prevent incorrect initial render
  // Mark as fetched if we have cached data
  const categoriesFetchedRef = useRef(!!(initialCachedCategories && initialCachedGroupings));

  // Fetch historical averages and categories
  // Only fetch historical averages if we don't have them cached (optimization)
  const fetchHistoricalData = useCallback(async () => {
    try {
      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) return;

      // Only fetch historical averages if we don't have them cached
      // Check both cached budget data and current state to avoid expensive recalculation
      const cachedAveragesSize = initialCachedBudget?.historicalAverages?.size ?? 0;
      const hasCachedAverages = cachedAveragesSize > 0 || historicalAverages.size > 0;
      
      if (!hasCachedAverages) {
        const averages = await getHistoricalCategoryAverages(authResult.user.id, 12);
        setHistoricalAverages(averages);
      }

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

          const categoriesArray = Array.from(byKey.values());
          setAllCategories(categoriesArray);
          setHiddenCategoryKeys(hiddenKeys);
          
          // Save to cache after fetching
          await saveCategoriesToCache(authResult.user.id, categoriesArray, hiddenKeys);
        }

      const groupings = await getCategoryGroupings(authResult.user.id);
      setCategoryGroupings(groupings);
      
      // Save to cache after fetching
      await saveGroupingsToCache(authResult.user.id, groupings);
      
      // Mark as fetched after both categories and groupings are loaded
      categoriesFetchedRef.current = true;
    } catch (err) {
      logger.error("❌ [BUDGET] Error fetching historical data:", err);
      // Still mark as fetched even on error to prevent infinite waiting
      categoriesFetchedRef.current = true;
    }
  }, [historicalAverages]);

  // Load categories and groupings immediately on mount, not waiting for budgetSummary
  // This ensures they're ready when budgetSummary loads, preventing incorrect initial render
  useEffect(() => {
    fetchHistoricalData();
  }, [fetchHistoricalData]);

  // Convert budget summary to BudgetData array for BudgetView
  // Include ALL categories that have had transactions in the past OR exist in categories table
  // CRITICAL: Use actuals from budgetSummary for spent amounts (not categoryBreakdown prop)
  // This ensures cached data doesn't depend on changing props
  // CRITICAL: Don't apply grouping until categories/groupings have been fetched to prevent incorrect grouping/flashing
  const computedBudgetData: BudgetData[] = useMemo(() => {
    if (!budgetSummary) return [];
    
    return (() => {
      // CRITICAL: If categories/groupings haven't been fetched yet, skip grouping logic
      // This prevents "one category with all items" bug while still showing ungrouped data immediately
      const shouldApplyGrouping = categoriesFetchedRef.current;
        
        // Build map from categoryBreakdown ONLY for color (not spent amounts)
        // Spent amounts come from budgetSummary.actuals (database source of truth)
        const breakdownByKey = new Map<string, { amount: number; label: string; color: string }>();
        if (categoryBreakdown) {
          categoryBreakdown.forEach(([categoryName, data]) => {
            const key = toKey(categoryName);
            breakdownByKey.set(key, {
              amount: data.amount, // Keep for fallback, but prefer actuals
              label: categoryName,
              color: data.color, // Use color from breakdown
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
        // CRITICAL: Deduplicate by categoryId first, then by key to prevent duplicates
        const budgetEntriesMap = new Map<string, { entry: typeof budgetSummary.entries[0]; label: string }>();
        const entriesByCategoryId = new Map<string, typeof budgetSummary.entries[0]>();
        
        budgetSummary.entries
          .filter((entry) => entry.scope_type === "category")
          .forEach((entry) => {
            // If entry has a category_id, use it for deduplication
            if (entry.category_id) {
              // Only keep the first entry per category_id (prefer entries with budgets)
              const existing = entriesByCategoryId.get(entry.category_id);
              if (!existing || (entry.limit_amount > 0 && existing.limit_amount === 0)) {
                entriesByCategoryId.set(entry.category_id, entry);
              }
            }
          });
        
        // Now build the key map from deduplicated entries
        entriesByCategoryId.forEach((entry) => {
          const label = entry.category?.name || entry.label.trim();
          // Use categoryId as primary key when available, fallback to slug/name
          const key = entry.category_id 
            ? `cat_${entry.category_id}` 
            : (entry.category?.slug ? toKey(entry.category.slug) : toKey(label));
          budgetEntriesMap.set(key, { entry, label });
        });
        
        // Also add entries without category_id (legacy entries)
        budgetSummary.entries
          .filter((entry) => entry.scope_type === "category" && !entry.category_id)
          .forEach((entry) => {
            const label = entry.category?.name || entry.label.trim();
            const key = entry.category?.slug ? toKey(entry.category.slug) : toKey(label);
            // Only add if not already in map
            if (!budgetEntriesMap.has(key)) {
              budgetEntriesMap.set(key, { entry, label });
            }
          });

        // Get all categories from multiple sources
        // CRITICAL: Use categoryId as the primary key to prevent duplicates
        const allCategoryKeys = new Set<string>();
        const categoryIdsSeen = new Set<string>();
        const nameToCategoryId = new Map<string, string>(); // Map name keys to categoryIds
        
        // Helper function to find matching category by name variations
        const findCategoryByName = (name: string): CategoryRecord | undefined => {
          const normalizedName = toKey(name);
          // Try exact match first
          let match = categoriesByKey.get(normalizedName);
          if (match) return match;
          
          // Try matching against all category names/slugs with fuzzy matching
          // Match if one is a prefix of the other (e.g., "transport" matches "transportation")
          match = allCategories.find(cat => {
            const catName = toKey(cat.name || '');
            const catSlug = toKey(cat.slug || '');
            
            // Exact match
            if (catName === normalizedName || catSlug === normalizedName) return true;
            
            // One is a prefix of the other (minimum 6 chars to avoid false matches)
            const minLength = Math.min(normalizedName.length, Math.max(catName.length, catSlug.length));
            if (minLength >= 6) {
              if (normalizedName.startsWith(catName) || catName.startsWith(normalizedName)) return true;
              if (normalizedName.startsWith(catSlug) || catSlug.startsWith(normalizedName)) return true;
            }
            
            return false;
          });
          return match;
        };

        // First, add all categories by their IDs (primary key)
        allCategories.forEach((cat) => {
          if (cat.id && !categoryIdsSeen.has(cat.id)) {
            categoryIdsSeen.add(cat.id);
            allCategoryKeys.add(`cat_${cat.id}`);
            // Map all name variations to this categoryId
            const nameKey = toKey(cat.slug || cat.name);
            const altNameKey = toKey(cat.name);
            nameToCategoryId.set(nameKey, cat.id);
            if (altNameKey !== nameKey) {
              nameToCategoryId.set(altNameKey, cat.id);
            }
          }
        });
        
        // Add budget entries by categoryId (they should already be in the map)
        budgetEntriesMap.forEach((_, key) => {
          if (key.startsWith('cat_')) {
            allCategoryKeys.add(key);
            const categoryId = key.replace('cat_', '');
            categoryIdsSeen.add(categoryId);
          }
        });

        // Process categoryBreakdown ONLY for color mapping (not for spent amounts or keys)
        // Spent amounts come from actuals (database source), not categoryBreakdown prop
        // This ensures cached data doesn't depend on changing props
        if (categoryBreakdown) {
          breakdownByKey.forEach((_, key) => {
            const matchingCategory = findCategoryByName(key);
            if (matchingCategory?.id) {
              // Use categoryId key
              if (!categoryIdsSeen.has(matchingCategory.id)) {
                allCategoryKeys.add(`cat_${matchingCategory.id}`);
                categoryIdsSeen.add(matchingCategory.id);
              }
              nameToCategoryId.set(key, matchingCategory.id);
            }
            // Don't add name keys from categoryBreakdown - only use actuals and budget entries
          });
        }
        
        actualsByKey.forEach((_, key) => {
          const matchingCategory = findCategoryByName(key);
          if (matchingCategory?.id) {
            if (!categoryIdsSeen.has(matchingCategory.id)) {
              allCategoryKeys.add(`cat_${matchingCategory.id}`);
              categoryIdsSeen.add(matchingCategory.id);
            }
            nameToCategoryId.set(key, matchingCategory.id);
          } else {
            allCategoryKeys.add(key);
          }
        });
        
        historicalByKey.forEach((_, key) => {
          const matchingCategory = findCategoryByName(key);
          if (matchingCategory?.id) {
            if (!categoryIdsSeen.has(matchingCategory.id)) {
              allCategoryKeys.add(`cat_${matchingCategory.id}`);
              categoryIdsSeen.add(matchingCategory.id);
            }
            nameToCategoryId.set(key, matchingCategory.id);
          } else {
            allCategoryKeys.add(key);
          }
        });

        // CRITICAL: Add parent/child categories from groupings by ID only
        categoryGroupings.forEach((g) => {
          if (!g.active) return;
          // Add parent category by ID
          const parentCat = allCategories.find((cat) => cat.id === g.parent_category_id);
          if (parentCat?.id && !categoryIdsSeen.has(parentCat.id)) {
            allCategoryKeys.add(`cat_${parentCat.id}`);
            categoryIdsSeen.add(parentCat.id);
          }
          // Add child category by ID
          const childCat = allCategories.find((cat) => cat.id === g.child_category_id);
          if (childCat?.id && !categoryIdsSeen.has(childCat.id)) {
            allCategoryKeys.add(`cat_${childCat.id}`);
            categoryIdsSeen.add(childCat.id);
          }
        });

        // Create flat BudgetData for each category (filtered by visibility)
        // CRITICAL: Deduplicate by categoryId to prevent showing the same category multiple times
        const seenCategoryIdsInFlat = new Set<string>();
        const seenCategoryNamesInFlat = new Set<string>();
        const flatBudgets = Array.from(allCategoryKeys)
          .filter((categoryKey) => !hiddenCategoryKeys.has(categoryKey))
          .map((categoryKey) => {
            // Handle categoryId-based keys
            let entryInfo = budgetEntriesMap.get(categoryKey);
            let categoryMeta: CategoryRecord | undefined;
            let actualData = actualsByKey.get(categoryKey);
            let breakdownData = breakdownByKey.get(categoryKey);
            let historicalData = historicalByKey.get(categoryKey);
            
            // If key is categoryId-based, extract the ID and find the category
            if (categoryKey.startsWith('cat_')) {
              const categoryId = categoryKey.replace('cat_', '');
              categoryMeta = allCategories.find(cat => cat.id === categoryId);
              
              // Find entry info by categoryId (already in map with cat_ prefix)
              entryInfo = budgetEntriesMap.get(categoryKey) || entryInfo;
              
              if (categoryMeta) {
                const metaKey = toKey(categoryMeta.slug || categoryMeta.name);
                // Also try entry info by name key
                entryInfo = budgetEntriesMap.get(metaKey) || entryInfo;
                
                // Try to find data by category name/slug key
                if (!breakdownData) {
                  breakdownData = breakdownByKey.get(metaKey);
                }
                if (!actualData) {
                  actualData = actualsByKey.get(metaKey);
                }
                if (!historicalData) {
                  historicalData = historicalByKey.get(metaKey);
                }
              }
              
              // Find data by checking all name keys that map to this categoryId
              // This handles cases where breakdown uses a different name (e.g., "Transportation" vs "Transport")
              if (!breakdownData && categoryBreakdown) {
                for (const [breakdownKey, data] of breakdownByKey.entries()) {
                  if (nameToCategoryId.get(breakdownKey) === categoryId) {
                    breakdownData = data;
                    break;
                  }
                }
              }
              if (!actualData) {
                for (const [actualKey, data] of actualsByKey.entries()) {
                  if (nameToCategoryId.get(actualKey) === categoryId) {
                    actualData = data;
                    break;
                  }
                }
              }
              if (!historicalData) {
                for (const [historicalKey, data] of historicalByKey.entries()) {
                  if (nameToCategoryId.get(historicalKey) === categoryId) {
                    historicalData = data;
                    break;
                  }
                }
              }
            } else {
              // Regular key lookup (name-based, no categoryId)
              categoryMeta = categoriesByKey.get(categoryKey);
            }

            // Use actuals from budgetSummary as source of truth for spent amounts (database source)
            // This ensures cached data doesn't depend on categoryBreakdown prop which changes
            // categoryBreakdown is only used for color fallback
            const spent = actualData?.amount ?? breakdownData?.amount ?? 0;
            
            // Use display name from breakdown if available, otherwise use other sources
            const displayName = breakdownData?.label || categoryMeta?.name || entryInfo?.label || actualData?.label || categoryKey;
            
            // Use color from breakdown if available, otherwise use other sources
            const categoryColor = breakdownData?.color || entryInfo?.entry.category?.color || categoryMeta?.color || "#607D8B";
            // CRITICAL: Always get icon from current categories (not cached) to ensure icons are up-to-date
            // Icons can change when categories are updated, so we resolve them dynamically
            const categoryIcon = categoryMeta?.icon || entryInfo?.entry.category?.icon || null;
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
          .filter((item) => {
            // Deduplicate by categoryId first - only keep first occurrence
            // Since we're using categoryId as primary key, this should catch most duplicates
            if (item.categoryId) {
              if (seenCategoryIdsInFlat.has(item.categoryId)) {
                return false; // Skip duplicate
              }
              seenCategoryIdsInFlat.add(item.categoryId);
              // Track the category's actual name to prevent name-based duplicates
              const categoryMeta = allCategories.find(c => c.id === item.categoryId);
              if (categoryMeta) {
                const catNameKey = toKey(categoryMeta.name || categoryMeta.slug || '');
                seenCategoryNamesInFlat.add(catNameKey);
              }
            }
            
            // Deduplicate by normalized name for categories without IDs (legacy/uncategorized)
            const normalizedName = toKey(item.category);
            if (!item.categoryId) {
              if (seenCategoryNamesInFlat.has(normalizedName)) {
                return false;
              }
              // Check if this name matches any existing category with an ID
              const matchingCategory = allCategories.find(cat => {
                if (!cat.id || !seenCategoryIdsInFlat.has(cat.id)) return false;
                const catName = toKey(cat.name || '');
                const catSlug = toKey(cat.slug || '');
                return catName === normalizedName || catSlug === normalizedName;
              });
              if (matchingCategory) {
                return false;
              }
              seenCategoryNamesInFlat.add(normalizedName);
            }
            
            return true;
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
        // CRITICAL: Only apply grouping if categories/groupings have been fetched
        // This prevents incorrect grouping when data is still loading
        const groupingByChild = new Map<string, string>();
        if (shouldApplyGrouping) {
          categoryGroupings.forEach((g) => {
            if (!g.active) return;
            groupingByChild.set(g.child_category_id, g.parent_category_id);
          });
        }

        // Index budgets by categoryId for grouping
        // CRITICAL: Deduplicate by categoryId first to prevent duplicates
        const budgetById = new Map<string, BudgetData>();
        const baseById = new Map<string, BudgetData>();
        const seenCategoryIds = new Set<string>();
        
        flatBudgets.forEach((item) => {
          // Deduplicate by categoryId - only keep one entry per categoryId
          if (item.categoryId) {
            if (seenCategoryIds.has(item.categoryId)) {
              // Skip duplicate - prefer entry with budget over entry without
              const existing = budgetById.get(item.categoryId);
              if (existing && existing.budget > 0 && item.budget === 0) {
                return; // Keep existing entry with budget
              }
              if (existing && existing.budget === 0 && item.budget > 0) {
                // Replace existing with this one (has budget)
                seenCategoryIds.delete(item.categoryId);
                budgetById.delete(item.categoryId);
                baseById.delete(item.categoryId);
              } else {
                return; // Skip duplicate
              }
            }
            seenCategoryIds.add(item.categoryId);
          }
          
          // Create a fresh object with empty children array
          const itemWithChildren = { ...item, children: [] as BudgetData[] };
          const itemBase = { ...item, children: [] as BudgetData[] };
          
          // Use categoryId as primary key when available (for proper parent-child matching)
          if (item.categoryId) {
            budgetById.set(item.categoryId, itemWithChildren);
            baseById.set(item.categoryId, itemBase);
          }
          
          // Also index by category name as fallback (for categories without IDs)
          // But only if we haven't seen this categoryId already
          const nameKey = item.category;
          if (!item.categoryId || !budgetById.has(nameKey)) {
            budgetById.set(nameKey, itemWithChildren);
            baseById.set(nameKey, itemBase);
          }
        });

        const childIds = new Set<string>();
        const parentsWithChildren = new Set<string>();
        
        // First pass: ensure all parent categories exist in budgetById
        // This handles cases where parent categories don't have transactions but have children
        // CRITICAL: Only run grouping logic if categories/groupings have been fetched
        if (shouldApplyGrouping) {
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
        }
        
        // Second pass: attach children to parents and roll up totals
        // CRITICAL: Only run if grouping should be applied
        if (shouldApplyGrouping) {
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
        }

        // Insert parent's own entry as first subcategory when it has children
        // CRITICAL: Only run if grouping should be applied
        if (shouldApplyGrouping) {
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
        }

        const roots: BudgetData[] = [];
        const addedRootIds = new Set<string>();
        
        // Track added category names (for deduplication of items without categoryId)
        const addedCategoryNames = new Set<string>();
        // Track category IDs to names mapping for matching renamed categories
        const categoryIdToName = new Map<string, string>();
        allCategories.forEach(cat => {
          if (cat.id) {
            categoryIdToName.set(cat.id, toKey(cat.name));
          }
        });
        
        // Build roots - only include items that aren't children
        // Use categoryId as the unique identifier to avoid duplicates
        // PRIORITY: Categories with categoryId take precedence over those without
        budgetById.forEach((item, id) => {
          // Skip if this is a child category - check by categoryId (UUID) not by map key
          // The map key could be UUID or category name, but childIds only contains UUIDs
          if (item.categoryId && childIds.has(item.categoryId)) {
            return;
          }
          
          // Skip if we've already added this root (by categoryId)
          if (item.categoryId && addedRootIds.has(item.categoryId)) return;
          
          // For items without categoryId, check if a category with the same name already exists WITH an ID
          // If so, skip this one (prioritize categories with IDs)
          if (!item.categoryId) {
            const normalizedName = toKey(item.category);
            // Check if this name matches an existing category with an ID (case-insensitive)
            const matchingCategoryId = Array.from(categoryIdToName.entries()).find(
              ([_, catName]) => catName === normalizedName
            )?.[0];
            if (matchingCategoryId && addedRootIds.has(matchingCategoryId)) {
              return;
            }
            // Also check if we've already added a root with this name
            if (addedRootIds.has(id) || addedCategoryNames.has(normalizedName)) {
              return;
            }
            addedCategoryNames.add(normalizedName);
          }
          
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
            // Track the normalized name for this categoryId
            const normalizedName = toKey(item.category);
            addedCategoryNames.add(normalizedName);
          } else {
            addedRootIds.add(id);
          }
          
          roots.push(item);
        });

        // Add any items without categoryId that weren't already in budgetById map
        // CRITICAL: Skip items without categoryId if a category with the same name exists WITH an ID
        const flatBudgetsWithoutId = flatBudgets.filter((item) => !item.categoryId);
        flatBudgetsWithoutId.forEach((item) => {
          const normalizedName = toKey(item.category);
          
          // PRIORITY: If a category with this name already exists WITH an ID, skip this one
          const matchingCategoryId = Array.from(categoryIdToName.entries()).find(
            ([_, catName]) => catName === normalizedName
          )?.[0];
          if (matchingCategoryId && addedRootIds.has(matchingCategoryId)) {
            return;
          }
          
          // Check if a category with this name already exists in roots (with or without ID)
          const existingWithSameName = roots.find(r => toKey(r.category) === normalizedName);
          if (existingWithSameName) {
            // If the existing one has an ID and this one doesn't, skip this one
            if (existingWithSameName.categoryId && !item.categoryId) {
              return;
            }
            // If both don't have IDs, skip duplicate
            if (!existingWithSameName.categoryId && !item.categoryId) {
              return;
            }
          }
          
          // Skip if already added by name
          if (addedCategoryNames.has(normalizedName)) {
            return;
          }
          
          addedCategoryNames.add(normalizedName);
          roots.push(item);
        });

        // Remove Income from budget UI
        let filteredRoots = roots
          .map((root) => ({
            ...root,
            children: root.children?.filter((c) => toKey(c.category) !== "income"),
          }))
          .filter((root) => toKey(root.category) !== "income");

        // FINAL FILTER: Remove ALL categories without categoryId
        // Simple rule: if categoryId is null/undefined, remove it
        filteredRoots = filteredRoots.filter((root) => !!root.categoryId);

        const sortedRoots = filteredRoots.sort((a, b) => b.budget - a.budget || b.spent - a.spent);

        return sortedRoots;
      })();
  }, [budgetSummary, historicalAverages, allCategories, categoryGroupings, hiddenCategoryKeys]);
  // NOTE: categoryBreakdown removed from dependencies - we use actuals from budgetSummary instead
  // This ensures cached data doesn't become stale when categoryBreakdown prop changes

  // Use cached budgetData immediately, fallback to computed when ready
  // This ensures instant UI like spending/investment sections
  // Track if we have fresh computed data ready
  const hasFreshComputedData = computedBudgetData.length > 0 && budgetSummary !== null;
  
  // Always resolve icons dynamically from current categories (never use cached icons)
  // This ensures icons are always correct, even when using cached budgetData
  const budgetData: BudgetData[] = useMemo(() => {
    // Get the base data (fresh computed or cached)
    let baseData: BudgetData[] = [];
    if (hasFreshComputedData) {
      baseData = computedBudgetData;
    } else if (initialCachedBudget) {
      baseData = initialCachedBudget.budgetData;
    } else {
      return [];
    }
    
    // If no categories loaded yet, return base data without icons (will resolve when categories load)
    if (allCategories.length === 0) {
      return baseData.map(item => ({ ...item, icon: null }));
    }
    
    // Create a map of categories by ID for fast lookup
    const categoriesById = new Map<string, CategoryRecord>();
    allCategories.forEach(cat => {
      if (cat.id) {
        categoriesById.set(cat.id, cat);
      }
    });
    
    // Always resolve icons from current categories (never use cached icons)
    return baseData.map(item => {
      // Resolve icon from current categories using categoryId
      let resolvedIcon: string | null = null;
      if (item.categoryId) {
        const freshCategory = categoriesById.get(item.categoryId);
        if (freshCategory) {
          resolvedIcon = freshCategory.icon || null;
        }
      }
      
      // Also resolve color from current categories (prefer fresh, fallback to cached)
      let resolvedColor = item.color;
      if (item.categoryId) {
        const freshCategory = categoriesById.get(item.categoryId);
        if (freshCategory?.color) {
          resolvedColor = freshCategory.color;
        }
      }
      
      return {
        ...item,
        icon: resolvedIcon, // Always use resolved icon (never cached)
        color: resolvedColor, // Prefer fresh color
      };
    });
  }, [hasFreshComputedData, computedBudgetData, initialCachedBudget, allCategories]);

  // Calculate totals - use cached if available, otherwise compute
  // Always use exact values to prevent visual switching
  const totalBudget = useMemo(() => {
    // If we have fresh computed data, use it
    if (hasFreshComputedData && budgetSummary) {
      // Prefer exact value from period.total_limit if available
      if (budgetSummary.period.total_limit !== null && budgetSummary.period.total_limit !== undefined) {
        return budgetSummary.period.total_limit;
      }
      // Otherwise calculate from budgetData (preserve exact decimals)
      return computedBudgetData.reduce((sum, b) => sum + b.budget, 0);
    }
    // Otherwise use cached total if available (exact value from cache)
    if (initialCachedBudget) {
      return initialCachedBudget.totalBudget;
    }
    return 0;
  }, [hasFreshComputedData, budgetSummary, computedBudgetData, initialCachedBudget]);

  const totalSpent = useMemo(() => {
    // If we have fresh computed data, use it
    if (hasFreshComputedData) {
      return budgetSummary?.actuals.overall || 0;
    }
    // Otherwise use cached total if available
    if (initialCachedBudget) {
      return initialCachedBudget.totalSpent;
    }
    return 0;
  }, [hasFreshComputedData, budgetSummary, initialCachedBudget]);

  const totalRemaining = totalBudget - totalSpent;

  // Save computed budgetData to cache when it's ready
  useEffect(() => {
    if (computedBudgetData.length > 0 && budgetSummary && initialUserId && historicalAverages.size > 0) {
      // Only save if we have fresh computed data
      // Use exact same calculation method as totalBudget to ensure consistency
      const computedTotalBudget = budgetSummary.period.total_limit !== null && budgetSummary.period.total_limit !== undefined
        ? budgetSummary.period.total_limit
        : computedBudgetData.reduce((sum, b) => sum + b.budget, 0);
      const computedTotalSpent = budgetSummary.actuals.overall || 0;
      saveBudgetToCache(
        initialUserId,
        computedBudgetData,
        computedTotalBudget,
        computedTotalSpent,
        budgetSummary,
        historicalAverages
      );
    }
  }, [computedBudgetData, budgetSummary, initialUserId, historicalAverages]);

  // Actions
  const refreshBudget = useCallback(async () => {
    // Force refresh from database (isRefresh=true)
    await loadBudget(true);
    // Also refresh categories and historical data to ensure consistency
    // Force refresh historical averages on manual refresh
    const authResult = await getAuthenticatedUser();
    if (authResult?.user?.id) {
      const averages = await getHistoricalCategoryAverages(authResult.user.id, 12);
      setHistoricalAverages(averages);
    }
    await fetchHistoricalData();
  }, [loadBudget, fetchHistoricalData]);

  const updateCategoryBudget = useCallback(
    async (
      categoryId: string | null,
      categoryName: string,
      amount: number,
      color: string
    ): Promise<boolean> => {
      if (!budgetSummary) return false;

      try {
        // If categoryId is provided, fetch the category name from database
        let label = categoryName;
        if (categoryId) {
          const { data: category } = await supabase
            .from("categories")
            .select("name")
            .eq("id", categoryId)
            .single();
          if (category?.name) {
            label = category.name;
          }
        }

        const entry = await upsertBudgetEntry(budgetSummary.period.id, {
          scope_type: categoryId ? "category" : "group",
          category_id: categoryId,
          label: label,
          limit_amount: amount,
        });

        if (entry) {
          await refreshBudget();
          return true;
        }
        return false;
      } catch (err) {
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
        // This removes the category from all budget periods
        const budgetEntriesDeleted = await deleteBudgetEntriesForCategory(categoryId);
        if (!budgetEntriesDeleted) {
          // Don't fail the whole operation for this
        }
        
        // Step 7: Soft delete the category (mark as inactive in categories table)
        // This preserves the category record but hides it from the user
        const deleted = await softDeleteCategoryForUser(userId, categoryId);
        if (!deleted) {
          return false;
        }

        // Step 8: Refresh budget data
        await refreshBudget();

        return true;
      } catch (err) {
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
