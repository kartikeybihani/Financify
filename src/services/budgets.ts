// Budget service layer for managing budgets in Supabase
import { supabase } from "@/src/lib/supabase/supabase";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import logger from "@/src/utils/core/logger";
import { getDisplayCategory } from "@/src/utils/categories/transactionCategory";

// Types
export interface BudgetPeriod {
  id: string;
  user_id: string;
  name: string | null;
  period_start: string; // ISO date string
  period_end: string; // ISO date string
  period_type: "monthly";
  currency_code: string;
  total_limit: number | null;
  rollover_mode: "none" | "carry_remaining" | "carry_overspend";
  status: "draft" | "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface BudgetEntry {
  id: string;
  budget_period_id: string;
  scope_type: "overall" | "category" | "group";
  category_id: string | null;
  group_key: string | null;
  label: string;
  limit_amount: number;
  is_flexible: boolean;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetEntryWithCategory extends BudgetEntry {
  category?: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
  };
}

export interface BudgetSummary {
  period: BudgetPeriod;
  entries: BudgetEntryWithCategory[];
  actuals: {
    overall: number;
    byCategory: Map<string, number>;
    bySubcategory?: Map<string, Map<string, number>>; // normalized category -> original category -> amount
  };
}

export interface SubcategoryData {
  name: string;
  total: number;
  count: number;
  months: number;
  averageMonthly: number;
}

export interface SuggestedBudgetEntry {
  category_id: string | null;
  category_name: string;
  suggested_amount: number;
  average_monthly_spend: number;
  color: string;
  subcategories?: SubcategoryData[]; // Subcategories that were combined into this category
}

/**
 * Get or create the current month's budget period for a user
 */
export async function getOrCreateCurrentBudgetPeriod(
  userId: string,
  today: Date = new Date()
): Promise<BudgetPeriod | null> {
  try {
    // Calculate current month boundaries
    const year = today.getFullYear();
    const month = today.getMonth();
    const periodStart = new Date(year, month, 1);
    const periodEnd = new Date(year, month + 1, 0); // Last day of month

    const periodStartStr = periodStart.toISOString().split("T")[0];
    const periodEndStr = periodEnd.toISOString().split("T")[0];

    // Try to find existing period
    const { data: existing, error: fetchError } = await supabase
      .from("budget_periods")
      .select("*")
      .eq("user_id", userId)
      .eq("period_start", periodStartStr)
      .eq("period_end", periodEndStr)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 is "not found" which is fine
      logger.error("Error fetching budget period:", fetchError);
      return null;
    }

    if (existing) {
      return existing as BudgetPeriod;
    }

    // Create new period
    const periodName = periodStart.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }) + " Budget";

    const { data: newPeriod, error: createError } = await supabase
      .from("budget_periods")
      .insert({
        user_id: userId,
        name: periodName,
        period_start: periodStartStr,
        period_end: periodEndStr,
        period_type: "monthly",
        status: "draft", // Start as draft until user confirms
      })
      .select()
      .single();

    if (createError) {
      logger.error("Error creating budget period:", createError);
      return null;
    }

    return newPeriod as BudgetPeriod;
  } catch (error) {
    logger.error("Error in getOrCreateCurrentBudgetPeriod:", error);
    return null;
  }
}

/**
 * Get all budget entries for a budget period, joined with category info
 */
export async function getBudgetEntriesForPeriod(
  budgetPeriodId: string
): Promise<BudgetEntryWithCategory[]> {
  try {
    const { data, error } = await supabase
      .from("budget_entries")
      .select(
        `
        *,
        categories:category_id (
          id,
          name,
          color,
          icon
        )
      `
      )
      .eq("budget_period_id", budgetPeriodId)
      .order("sort_index", { ascending: true });

    if (error) {
      logger.error("Error fetching budget entries:", error);
      return [];
    }

    // Transform the data to flatten category info
    return (data || []).map((entry: any) => ({
      ...entry,
      category: entry.categories
        ? {
            id: entry.categories.id,
            name: entry.categories.name,
            color: entry.categories.color,
            icon: entry.categories.icon,
          }
        : undefined,
    })) as BudgetEntryWithCategory[];
  } catch (error) {
    logger.error("Error in getBudgetEntriesForPeriod:", error);
    return [];
  }
}

/**
 * Normalize category names by combining related categories
 * Case-insensitive matching
 */
function normalizeCategoryName(categoryName: string): string {
  if (!categoryName) return "Other";
  
  const normalized = categoryName.trim();
  const lower = normalized.toLowerCase();
  
  // Food-related categories → "Food"
  const foodCategories = [
    "food",
    "dining out",
    "restaurants",
    "groceries",
    "food & dining",
  ];
  if (foodCategories.includes(lower)) {
    return "Food";
  }
  
  // Health-related categories → "Health"
  const healthCategories = [
    "health",
    "health & fitness",
    "medical",
  ];
  if (healthCategories.includes(lower)) {
    return "Health";
  }
  
  // Return original if no normalization needed
  return normalized;
}

/**
 * Suggest initial budget entries based on past spending
 */
export async function suggestInitialBudgetEntries(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<SuggestedBudgetEntry[]> {
  try {
    // Look back 12 months from today to get enough data for accurate averages
    // This ensures we capture recurring monthly expenses even if they're not perfectly monthly
    const today = new Date();
    const lookbackStart = new Date(today);
    lookbackStart.setMonth(lookbackStart.getMonth() - 12);
    lookbackStart.setDate(1); // Start of month for cleaner calculation

    console.log(`[BUDGET] Looking back from ${today.toISOString().split("T")[0]} to ${lookbackStart.toISOString().split("T")[0]}`);
    logger.info(`[BUDGET] Looking back from ${today.toISOString().split("T")[0]} to ${lookbackStart.toISOString().split("T")[0]}`);

    // Get transactions from the past 12 months (up to today) - use new_category directly (don't rely on recurring_streams)
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("amount, top_category, new_category, date")
      .eq("user_id", userId)
      .gte("date", lookbackStart.toISOString().split("T")[0])
      .lte("date", today.toISOString().split("T")[0]) // Include up to today
      .gt("amount", 0) // Only expenses
      .neq("new_category", "INTERNAL_TRANSFER") // Exclude transfers
      .neq("top_category", "INTERNAL_TRANSFER"); // Also exclude if top_category is INTERNAL_TRANSFER

    if (txError) {
      console.error("[BUDGET] Error fetching transactions for suggestions:", txError);
      logger.error("[BUDGET] Error fetching transactions for suggestions:", txError);
      return [];
    }

    if (!transactions || transactions.length === 0) {
      console.log("[BUDGET] No transactions found for budget suggestions");
      logger.info("[BUDGET] No transactions found for budget suggestions");
      return [];
    }

    // Calculate actual months of data (not all 6 months may have data)
    // Use unique months that have transactions
    const uniqueMonths = new Set<string>();
    transactions.forEach((tx) => {
      const date = new Date(tx.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      uniqueMonths.add(monthKey);
    });
    const actualMonths = Math.max(1, uniqueMonths.size); // Use actual number of months with data

    console.log(`[BUDGET] Found ${transactions.length} transactions across ${actualMonths} unique months`);
    logger.info(`[BUDGET] Found ${transactions.length} transactions across ${actualMonths} unique months`);

    // Get categories to map names to IDs and colors
    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name, color")
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq("is_active", true);

    if (catError) {
      console.error("[BUDGET] Error fetching categories:", catError);
      logger.error("[BUDGET] Error fetching categories:", catError);
    }

    // Aggregate spending by category - prioritize new_category (user's manual categorization)
    // Track both normalized category and original subcategories
    const categorySpending = new Map<
      string,
      { 
        total: number; 
        count: number; 
        categoryName: string; 
        transactions: any[]; 
        months: Set<string>;
        subcategories: Map<string, { total: number; count: number; months: Set<string> }>; // Track original categories
      }
    >();

    transactions.forEach((tx) => {
      // Priority: new_category (user override) > top_category > "Other"
      let originalCategoryName: string;
      if (tx.new_category && tx.new_category !== "INTERNAL_TRANSFER") {
        originalCategoryName = tx.new_category;
      } else if (tx.top_category && tx.top_category !== "INTERNAL_TRANSFER") {
        originalCategoryName = tx.top_category;
      } else {
        originalCategoryName = "Other";
      }
      
      // Skip INTERNAL_TRANSFER
      if (originalCategoryName === "INTERNAL_TRANSFER") {
        return;
      }
      
      // Normalize category name (combine related categories)
      const normalizedCategoryName = normalizeCategoryName(originalCategoryName);

      const existing = categorySpending.get(normalizedCategoryName) || {
        total: 0,
        count: 0,
        categoryName: normalizedCategoryName,
        transactions: [],
        months: new Set<string>(),
        subcategories: new Map<string, { total: number; count: number; months: Set<string> }>(),
      };
      
      const amount = Math.abs(parseFloat(tx.amount.toString()));
      existing.total += amount;
      existing.count += 1;
      existing.transactions.push(tx);
      
      // Track which months have transactions for this category
      const date = new Date(tx.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      existing.months.add(monthKey);
      
      // Track subcategory (original category) if it's different from normalized
      if (originalCategoryName !== normalizedCategoryName || normalizedCategoryName === "Food" || normalizedCategoryName === "Health") {
        const subcat = existing.subcategories.get(originalCategoryName) || {
          total: 0,
          count: 0,
          months: new Set<string>(),
        };
        subcat.total += amount;
        subcat.count += 1;
        subcat.months.add(monthKey);
        existing.subcategories.set(originalCategoryName, subcat);
      }
      
      categorySpending.set(normalizedCategoryName, existing);
    });

    // Calculate average monthly spend and suggest budgets (1.1x average)
    const suggestions: SuggestedBudgetEntry[] = [];

    categorySpending.forEach((data, categoryName) => {
      // Calculate average: use actual months if we have enough data, otherwise use transaction count
      // For recurring expenses (like rent), we want monthly average
      // For one-time expenses, we want to spread across available months
      const actualMonths = Math.max(1, data.months.size);
      
      // If we have transactions across multiple months, use monthly average
      // If we only have 1-2 months of data, still calculate monthly average
      const avgMonthly = data.total / actualMonths;
      
      // For categories with many transactions (likely recurring), use monthly average
      // For categories with few transactions, still use monthly average but be more conservative
      const suggested = Math.round(avgMonthly * 1.1); // 10% buffer

      // Find matching category from DB (case-insensitive, flexible matching)
      const category = categories?.find((c) => {
        const dbName = c.name.toLowerCase().trim();
        const txName = categoryName.toLowerCase().trim();
        return dbName === txName || 
               dbName.includes(txName) || 
               txName.includes(dbName);
      });

      // Debug logging - log to both logger and console for visibility
      const debugInfo = {
        categoryName,
        totalTransactions: data.count,
        totalAmount: parseFloat(data.total.toFixed(2)),
        uniqueMonths: Array.from(data.months).sort(),
        actualMonths,
        avgMonthly: parseFloat(avgMonthly.toFixed(2)),
        suggested,
        allTransactions: data.transactions.map(tx => ({
          date: tx.date,
          amount: parseFloat(tx.amount.toString()),
          new_category: tx.new_category,
          top_category: tx.top_category,
        })),
      };

      // Log to both logger (backend) and console (frontend visible) with [BUDGET] prefix
      // Build subcategories array if there are any
      const subcategories: SubcategoryData[] = [];
      if (data.subcategories.size > 0) {
        data.subcategories.forEach((subcatData, subcatName) => {
          const subcatMonths = Math.max(1, subcatData.months.size);
          const subcatAvgMonthly = subcatData.total / subcatMonths;
          subcategories.push({
            name: subcatName,
            total: subcatData.total,
            count: subcatData.count,
            months: subcatMonths,
            averageMonthly: subcatAvgMonthly,
          });
        });
        // Sort subcategories by total (highest first)
        subcategories.sort((a, b) => b.total - a.total);
      }

      if (categoryName.toLowerCase().includes("housing")) {
        console.log("[BUDGET] 🏠 HOUSING DEBUG:", JSON.stringify(debugInfo, null, 2));
        logger.info(`[BUDGET] 🏠 HOUSING DEBUG:`, debugInfo);
      } else {
        console.log(`[BUDGET] Category: ${categoryName}, Total: $${data.total.toFixed(2)}, Months: ${actualMonths}, Avg: $${avgMonthly.toFixed(2)}, Suggested: $${suggested}${subcategories.length > 0 ? `, Subcategories: ${subcategories.length}` : ""}`);
        logger.info(`[BUDGET] Category: ${categoryName}, Total: $${data.total.toFixed(2)}, Months: ${actualMonths}, Avg: $${avgMonthly.toFixed(2)}, Suggested: $${suggested}`);
      }

      suggestions.push({
        category_id: category?.id || null,
        category_name: categoryName,
        suggested_amount: suggested,
        average_monthly_spend: avgMonthly,
        color: category?.color || "#607D8B",
        subcategories: subcategories.length > 0 ? subcategories : undefined,
      });
    });

    // Sort by suggested amount (highest first) and take top 8
    const sortedSuggestions = suggestions
      .sort((a, b) => b.suggested_amount - a.suggested_amount)
      .slice(0, 8);
    
    console.log(`[BUDGET] Returning ${sortedSuggestions.length} sorted suggestions`);
    return sortedSuggestions;
  } catch (error) {
    console.error("[BUDGET] Error in suggestInitialBudgetEntries:", error);
    logger.error("[BUDGET] Error in suggestInitialBudgetEntries:", error);
    return [];
  }
}

/**
 * Initialize budget for a new user or new month
 */
export async function initializeBudgetForNewUserOrMonth(
  userId: string,
  forceReinitialize: boolean = false
): Promise<BudgetPeriod | null> {
  try {
    console.log("[BUDGET] Initializing budget for user:", userId, "force:", forceReinitialize);
    logger.info("[BUDGET] Initializing budget for user:", userId, "force:", forceReinitialize);
    
    const period = await getOrCreateCurrentBudgetPeriod(userId);
    if (!period) {
      console.log("[BUDGET] Failed to get or create budget period");
      return null;
    }

    // Check if entries already exist
    const existingEntries = await getBudgetEntriesForPeriod(period.id);
    if (existingEntries.length > 0 && !forceReinitialize) {
      // Already initialized, skip
      console.log("[BUDGET] Budget already initialized, skipping. Use forceReinitialize=true to recalculate.");
      logger.info("[BUDGET] Budget already initialized, skipping");
      return period;
    }

    // If forcing re-initialize, delete existing entries first
    if (forceReinitialize && existingEntries.length > 0) {
      console.log(`[BUDGET] Force re-initializing: deleting ${existingEntries.length} existing entries`);
      logger.info(`[BUDGET] Force re-initializing: deleting ${existingEntries.length} existing entries`);
      
      const entryIds = existingEntries.map(e => e.id);
      const { error: deleteError } = await supabase
        .from("budget_entries")
        .delete()
        .in("id", entryIds);
      
      if (deleteError) {
        console.error("[BUDGET] Error deleting existing entries:", deleteError);
        logger.error("[BUDGET] Error deleting existing entries:", deleteError);
      } else {
        console.log("[BUDGET] Successfully deleted existing entries");
      }
    }

    // Get suggestions
    const periodStart = new Date(period.period_start);
    const periodEnd = new Date(period.period_end);
    console.log("[BUDGET] Getting budget suggestions...");
    const suggestions = await suggestInitialBudgetEntries(
      userId,
      periodStart,
      periodEnd
    );

    console.log(`[BUDGET] Received ${suggestions.length} budget suggestions`);
    logger.info(`[BUDGET] Received ${suggestions.length} budget suggestions`);

    // Create budget entries from suggestions
    const entries = suggestions.map((suggestion, index) => ({
      budget_period_id: period.id,
      scope_type: suggestion.category_id ? "category" : "group",
      category_id: suggestion.category_id,
      group_key: suggestion.category_id ? null : suggestion.category_name.toLowerCase().replace(/\s+/g, "_"),
      label: suggestion.category_name,
      limit_amount: suggestion.suggested_amount,
      sort_index: index,
    }));

    if (entries.length > 0) {
      const { error: insertError } = await supabase
        .from("budget_entries")
        .insert(entries);

      if (insertError) {
        console.error("[BUDGET] Error creating initial budget entries:", insertError);
        logger.error("[BUDGET] Error creating initial budget entries:", insertError);
      } else {
        console.log(`[BUDGET] Successfully created ${entries.length} budget entries`);
        logger.info(`[BUDGET] Successfully created ${entries.length} budget entries`);
      }
    }

    return period;
  } catch (error) {
    console.error("[BUDGET] Error in initializeBudgetForNewUserOrMonth:", error);
    logger.error("[BUDGET] Error in initializeBudgetForNewUserOrMonth:", error);
    return null;
  }
}

/**
 * Upsert a budget entry (create or update)
 */
export async function upsertBudgetEntry(
  budgetPeriodId: string,
  entry: {
    scope_type: "overall" | "category" | "group";
    category_id?: string | null;
    group_key?: string | null;
    label: string;
    limit_amount: number;
    is_flexible?: boolean;
    sort_index?: number;
  }
): Promise<BudgetEntry | null> {
  try {
    // Check if entry exists (for category entries, check by category_id)
    let existingId: string | null = null;

    if (entry.scope_type === "category" && entry.category_id) {
      const { data: existing } = await supabase
        .from("budget_entries")
        .select("id")
        .eq("budget_period_id", budgetPeriodId)
        .eq("scope_type", "category")
        .eq("category_id", entry.category_id)
        .maybeSingle();

      existingId = existing?.id || null;
    }

    if (existingId) {
      // Update existing
      const { data, error } = await supabase
        .from("budget_entries")
        .update({
          label: entry.label,
          limit_amount: entry.limit_amount,
          is_flexible: entry.is_flexible ?? false,
          sort_index: entry.sort_index ?? 0,
        })
        .eq("id", existingId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating budget entry:", error);
        return null;
      }

      return data as BudgetEntry;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from("budget_entries")
        .insert({
          budget_period_id: budgetPeriodId,
          scope_type: entry.scope_type,
          category_id: entry.category_id || null,
          group_key: entry.group_key || null,
          label: entry.label,
          limit_amount: entry.limit_amount,
          is_flexible: entry.is_flexible ?? false,
          sort_index: entry.sort_index ?? 0,
        })
        .select()
        .single();

      if (error) {
        logger.error("Error creating budget entry:", error);
        return null;
      }

      return data as BudgetEntry;
    }
  } catch (error) {
    logger.error("Error in upsertBudgetEntry:", error);
    return null;
  }
}

/**
 * Delete a budget entry
 */
export async function deleteBudgetEntry(entryId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("budget_entries")
      .delete()
      .eq("id", entryId);

    if (error) {
      logger.error("Error deleting budget entry:", error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error in deleteBudgetEntry:", error);
    return false;
  }
}

/**
 * Update budget period metadata (total_limit, status, etc.)
 */
export async function updateBudgetPeriodMeta(
  periodId: string,
  updates: {
    total_limit?: number | null;
    status?: "draft" | "active" | "archived";
    name?: string;
    rollover_mode?: "none" | "carry_remaining" | "carry_overspend";
  }
): Promise<BudgetPeriod | null> {
  try {
    const { data, error } = await supabase
      .from("budget_periods")
      .update(updates)
      .eq("id", periodId)
      .select()
      .single();

    if (error) {
      logger.error("Error updating budget period:", error);
      return null;
    }

    return data as BudgetPeriod;
  } catch (error) {
    logger.error("Error in updateBudgetPeriodMeta:", error);
    return null;
  }
}

/**
 * Get actual spending for a budget period
 */
export async function getActualsForBudgetPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ overall: number; byCategory: Map<string, number>; bySubcategory?: Map<string, Map<string, number>> }> {
  try {
    const startStr = periodStart.toISOString().split("T")[0];
    const endStr = periodEnd.toISOString().split("T")[0];

    // Get all transactions in the period
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("amount, new_category, top_category")
      .eq("user_id", userId)
      .gte("date", startStr)
      .lte("date", endStr)
      .gt("amount", 0) // Only expenses
      .neq("new_category", "INTERNAL_TRANSFER"); // Exclude transfers

    if (error) {
      logger.error("Error fetching actuals:", error);
      return { overall: 0, byCategory: new Map(), bySubcategory: new Map() };
    }

    // Also get historical transactions to determine subcategory structure
    // Look back 12 months to see which subcategories exist
    const historicalStart = new Date(periodStart);
    historicalStart.setMonth(historicalStart.getMonth() - 12);
    const historicalStartStr = historicalStart.toISOString().split("T")[0];

    const { data: historicalTransactions } = await supabase
      .from("transactions")
      .select("new_category, top_category")
      .eq("user_id", userId)
      .gte("date", historicalStartStr)
      .lt("date", startStr) // Before current period
      .gt("amount", 0)
      .neq("new_category", "INTERNAL_TRANSFER");

    let overall = 0;
    const byCategory = new Map<string, number>();
    const bySubcategory = new Map<string, Map<string, number>>();

    // First, initialize subcategory structure from historical data for Food/Health
    if (historicalTransactions) {
      const seenSubcategories = new Map<string, Set<string>>(); // normalized -> set of original categories
      
      historicalTransactions.forEach((tx) => {
        let originalCategory: string;
        if (tx.new_category && tx.new_category !== "INTERNAL_TRANSFER") {
          originalCategory = tx.new_category;
        } else if (tx.top_category && tx.top_category !== "INTERNAL_TRANSFER") {
          originalCategory = tx.top_category;
        } else {
          return;
        }
        
        const normalizedCategory = normalizeCategoryName(originalCategory);
        
        // Track subcategories for Food and Health
        if (normalizedCategory === "Food" || normalizedCategory === "Health") {
          if (!seenSubcategories.has(normalizedCategory)) {
            seenSubcategories.set(normalizedCategory, new Set());
          }
          seenSubcategories.get(normalizedCategory)!.add(originalCategory);
        }
      });
      
      // Initialize subcategory maps for Food/Health with all seen subcategories
      seenSubcategories.forEach((subcats, normalizedCat) => {
        if (!bySubcategory.has(normalizedCat)) {
          bySubcategory.set(normalizedCat, new Map());
        }
        const subcatMap = bySubcategory.get(normalizedCat)!;
        subcats.forEach((subcatName) => {
          if (!subcatMap.has(subcatName)) {
            subcatMap.set(subcatName, 0); // Initialize with 0, will be updated with current period data
          }
        });
      });
    }

    // Now process current period transactions
    transactions?.forEach((tx) => {
      const amount = Math.abs(parseFloat(tx.amount.toString()));
      overall += amount;

      // Priority: new_category (user override) > top_category > "Other"
      let originalCategory: string;
      if (tx.new_category && tx.new_category !== "INTERNAL_TRANSFER") {
        originalCategory = tx.new_category;
      } else if (tx.top_category && tx.top_category !== "INTERNAL_TRANSFER") {
        originalCategory = tx.top_category;
      } else {
        originalCategory = "Other";
      }
      
      // Skip INTERNAL_TRANSFER
      if (originalCategory === "INTERNAL_TRANSFER") {
        return;
      }
      
      // Normalize category name (combine related categories)
      const normalizedCategory = normalizeCategoryName(originalCategory);
      
      // Track normalized category total
      const current = byCategory.get(normalizedCategory) || 0;
      byCategory.set(normalizedCategory, current + amount);
      
      // Track subcategories for Food, Health, or when original differs from normalized
      if (normalizedCategory === "Food" || normalizedCategory === "Health" || originalCategory !== normalizedCategory) {
        if (!bySubcategory.has(normalizedCategory)) {
          bySubcategory.set(normalizedCategory, new Map());
        }
        const subcatMap = bySubcategory.get(normalizedCategory)!;
        const subcatCurrent = subcatMap.get(originalCategory) || 0;
        subcatMap.set(originalCategory, subcatCurrent + amount);
      }
    });

    console.log(`[BUDGET] Actuals: ${byCategory.size} categories, subcategories for: ${Array.from(bySubcategory.keys()).join(", ")}`);
    return { overall, byCategory, bySubcategory };
  } catch (error) {
    console.error("[BUDGET] Error in getActualsForBudgetPeriod:", error);
    logger.error("[BUDGET] Error in getActualsForBudgetPeriod:", error);
    return { overall: 0, byCategory: new Map(), bySubcategory: new Map() };
  }
}

/**
 * Get complete budget summary (period + entries + actuals)
 */
export async function getBudgetSummary(
  userId: string,
  today: Date = new Date()
): Promise<BudgetSummary | null> {
  try {
    const period = await getOrCreateCurrentBudgetPeriod(userId, today);
    if (!period) {
      return null;
    }

    const entries = await getBudgetEntriesForPeriod(period.id);
    const periodStart = new Date(period.period_start);
    const periodEnd = new Date(period.period_end);
    const actuals = await getActualsForBudgetPeriod(
      userId,
      periodStart,
      periodEnd
    );

    return {
      period,
      entries,
      actuals,
    };
  } catch (error) {
    logger.error("Error in getBudgetSummary:", error);
    return null;
  }
}


