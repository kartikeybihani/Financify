import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";

export interface BudgetPeriod {
  id: string;
  user_id: string;
  name: string | null;
  period_start: string;
  period_end: string;
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
  };
}

export interface SuggestedBudgetEntry {
  category_id: string | null;
  category_name: string;
  suggested_amount: number;
  average_monthly_spend: number;
  color: string;
}

export type CategoryRecord = {
  id: string;
  user_id?: string | null;
  name: string;
  slug?: string | null;
  color?: string | null;
  icon?: string | null;
  rank?: number | null;
  is_active?: boolean | null;
};

export interface CategoryGrouping {
  id: string;
  user_id: string;
  parent_category_id: string;
  child_category_id: string;
  active: boolean;
  parent?: CategoryRecord;
  child?: CategoryRecord;
}

export interface CategoryTransaction {
  id: string;
  plaid_transaction_id?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  amount: number;
  date: string;
  authorized_date?: string | null;
  category_label: string;
}

export interface BudgetData {
  category: string;
  spent: number;
  budget: number;
  color: string;
  icon?: string | null;
  categoryId?: string | null;
  entryId?: string | null;
  parentCategoryId?: string | null;
  children?: BudgetData[];
}

export interface CategoryData {
  amount: number;
  percentage: number;
  color: string;
  hasRecurringTransactions: boolean;
}

export interface BudgetViewProps {
  categoryBreakdown: [string, CategoryData][];
  onCategoryPress: (category: string, data: CategoryData) => void;
  formatCategoryName: (category: string) => string;
  budgets?: BudgetData[];
  totalBudget?: number;
  totalSpent?: number;
  budgetSummary?: any;
  onUpdateBudget?: (
    categoryId: string | null,
    categoryName: string,
    amount: number,
    color: string
  ) => Promise<boolean>;
  onDeleteBudget?: (entryId: string) => Promise<boolean>;
  onGroupCategory?: (childCategoryId: string, parentCategoryId: string) => Promise<boolean>;
  onRemoveGrouping?: (childCategoryId: string) => Promise<boolean>;
  onDeleteCategory?: (categoryId: string, entryId?: string | null) => Promise<boolean>;
  refreshBudget?: () => Promise<void>;
}

export interface CategoryBudgetCardProps {
  category: string;
  spent: number;
  budget: number;
  progress: number;
  color: string;
  icon?: string | null;
  statusColor: string;
  isOverBudget: boolean;
  formatCategoryName: (category: string) => string;
  onPress: () => void;
  entryId?: string;
  categoryId?: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
  delay: number;
  onOpenActions: () => void;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export interface SubcategoryRowProps {
  item: BudgetData;
  statusColor: string;
  formatCategoryName: (category: string) => string;
  onOpenActions: () => void;
}

export interface CategoryActionSheetProps {
  visible: boolean;
  category: BudgetData | null;
  parentLabel?: string | null;
  categories: BudgetData[];
  onClose: () => void;
  onEditRequest?: (category: BudgetData) => void;
  onGroupCategory?: (childCategoryId: string, parentCategoryId: string) => Promise<boolean>;
  onRemoveGrouping?: (childCategoryId: string) => Promise<boolean>;
  onDeleteCategory?: (categoryId: string, entryId?: string | null) => Promise<boolean>;
}

type CategoryIndex = {
  list: CategoryRecord[];
  byKey: Map<string, CategoryRecord>;
  byId: Map<string, CategoryRecord>;
  hiddenKeys: Set<string>;
};

type TxLike = {
  name?: string | null;
  merchant_name?: string | null;
  amount?: number | string | null;
  top_category?: string | null;
  new_category?: string | null;
  transaction_type?: string | null;
};

/** 
 * Fetch active category groupings for a user
 */
export async function getCategoryGroupings(
  userId: string
): Promise<CategoryGrouping[]> {
  try {
    const { data, error } = await supabase
      .from("category_groupings")
      .select(
        `
        id,
        user_id,
        parent_category_id,
        child_category_id,
        active,
        parent:parent_category_id ( id, name, slug, color, icon, user_id, rank, is_active ),
        child:child_category_id ( id, name, slug, color, icon, user_id, rank, is_active )
      `
      )
      .eq("user_id", userId)
      .eq("active", true);

    if (error) {
      logger.error("[BUDGET] Error fetching category groupings:", error);
      return [];
    }

    return (data || []) as unknown as CategoryGrouping[];
  } catch (err) {
    logger.error("[BUDGET] Error in getCategoryGroupings:", err);
    return [];
  }
}

/**
 * Upsert a category grouping (assign a child to a parent)
 */
export async function upsertCategoryGrouping(
  userId: string,
  parentCategoryId: string,
  childCategoryId: string
): Promise<boolean> {
  if (parentCategoryId === childCategoryId) {
    logger.error("[BUDGET] Cannot group a category with itself");
    return false;
  }

  try {
    const { data: existing } = await supabase
      .from("category_groupings")
      .select("id")
      .eq("user_id", userId)
      .eq("child_category_id", childCategoryId)
      .eq("active", true)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("category_groupings")
        .update({
          parent_category_id: parentCategoryId,
          active: true,
        })
        .eq("id", existing.id);

      if (error) {
        logger.error("[BUDGET] Error updating category grouping:", error);
        return false;
      }
      return true;
    }

    const { error } = await supabase.from("category_groupings").insert({
      user_id: userId,
      parent_category_id: parentCategoryId,
      child_category_id: childCategoryId,
      active: true,
    });

    if (error) {
      logger.error("[BUDGET] Error creating category grouping:", error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error("[BUDGET] Error in upsertCategoryGrouping:", err);
    return false;
  }
}

/**
 * Deactivate a grouping (remove child from parent)
 */
export async function deactivateCategoryGrouping(
  userId: string,
  childCategoryId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("category_groupings")
      .update({ active: false })
      .eq("user_id", userId)
      .eq("child_category_id", childCategoryId)
      .eq("active", true);

    if (error) {
      logger.error("[BUDGET] Error deactivating category grouping:", error);
      return false;
    }
    return true;
  } catch (err) {
    logger.error("[BUDGET] Error in deactivateCategoryGrouping:", err);
    return false;
  }
}

/**
 * Soft delete a category for a user.
 * If the category belongs to the user, mark it inactive.
 * If it's a default category, clone it as a user-owned inactive row to override the default.
 */
export async function softDeleteCategoryForUser(
  userId: string,
  categoryId: string
): Promise<boolean> {
  try {
    const { data: category, error } = await supabase
      .from("categories")
      .select("id, user_id, name, slug, color, icon, rank, is_active")
      .eq("id", categoryId)
      .maybeSingle();

    if (error || !category) {
      logger.error("[BUDGET] Category not found for delete:", error);
      return false;
    }

    if (category.user_id === userId) {
      const { error: updateError } = await supabase
        .from("categories")
        .update({ is_active: false })
        .eq("id", categoryId);
      if (updateError) {
        logger.error("[BUDGET] Error deactivating user category:", updateError);
        return false;
      }
      return true;
    }

    // Clone default category as a user-specific inactive override
    const newSlug = category.slug ? `${category.slug}-${userId}` : null;
    const { error: insertError } = await supabase.from("categories").insert({
      id: generateLocalUUID(),
      user_id: userId,
      name: category.name,
      slug: newSlug,
      color: category.color,
      icon: category.icon,
      rank: category.rank,
      is_active: false,
    });

    if (insertError) {
      logger.error("[BUDGET] Error creating inactive override for category:", insertError);
      return false;
    }

    return true;
  } catch (err) {
    logger.error("[BUDGET] Error in softDeleteCategoryForUser:", err);
    return false;
  }
}

/**
 * Fetch transactions for a specific category (all time), filtered by resolved category label.
 * FIXED: Queries all transactions and filters by resolved category key to catch all variations.
 */
export async function getTransactionsForCategory(
  userId: string,
  targetCategoryLabel: string
): Promise<CategoryTransaction[]> {
  try {
    const categoryIndex = await buildCategoryIndex(userId);
    const targetResolved = resolveCategoryLabel(
      targetCategoryLabel,
      categoryIndex
    );


    // Query ALL transactions (with basic filters) and filter by resolved category key in JavaScript
    // This ensures we catch all category name variations and don't miss transactions due to exact string matching
    const today = new Date();
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setMonth(twoYearsAgo.getMonth() - 24);
    const startDateStr = formatLocalDate(twoYearsAgo);

    // Build base query - fetch all transactions (excluding transfers and internal transfers)
    let query = supabase
      .from("transactions")
      .select(
        "id, plaid_transaction_id, amount, new_category, top_category, date, authorized_date, name, merchant_name, transaction_type"
      )
      .eq("user_id", userId)
      .gt("amount", 0)
      .neq("transaction_type", "transfer")
      .gte("date", startDateStr)
      .order("authorized_date", { ascending: false, nullsFirst: false })
      .order("date", { ascending: false })
      .limit(1000);

    // Don't filter by category name at database level - we'll filter by resolved key in JavaScript
    // This catches all variations: "Transportation", "Transport", "Travel", etc. that resolve to the same key

    const { data, error } = await query;

    if (error) {
      logger.error("[BUDGET] Error fetching transactions for category:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }


    // Filter transactions by resolved category key
    // This matches the same logic used in getActualsForBudgetPeriod and spending breakdown
    const results: CategoryTransaction[] = [];
    let matchedCount = 0;
    let skippedCount = 0;

    data.forEach((tx: any) => {
      // Determine effective category (priority: new_category > top_category)
      const effectiveCategory = tx.new_category || tx.top_category;
      
      // Skip if no category
      if (!effectiveCategory) {
        skippedCount++;
        return;
      }
      
      // Skip INTERNAL_TRANSFER
      if (effectiveCategory === "INTERNAL_TRANSFER") {
        skippedCount++;
        return;
      }
      
      // Resolve the transaction's category to its canonical key
      const txResolved = resolveCategoryLabel(effectiveCategory, categoryIndex);
      
      // Match by resolved key (not exact string match) - this handles all variations
      if (txResolved.key !== targetResolved.key) {
        skippedCount++;
        return;
      }

      // Valid match - add to results
      const amount = Math.abs(Number(tx.amount || 0));
      if (!Number.isFinite(amount)) {
        skippedCount++;
        return;
      }

      results.push({
        id: tx.id,
        plaid_transaction_id: tx.plaid_transaction_id,
        name: tx.name,
        merchant_name: tx.merchant_name,
        amount,
        date: tx.date,
        authorized_date: tx.authorized_date,
        category_label: targetResolved.label, // Use resolved label for consistency
      });
      
      matchedCount++;
    });


    // Results are already sorted by database query, but ensure consistency
    results.sort((a, b) => {
      const aDate = a.authorized_date || a.date;
      const bDate = b.authorized_date || b.date;
      return bDate.localeCompare(aDate);
    });

    return results;
  } catch (err) {
    logger.error("[BUDGET] Error in getTransactionsForCategory:", err);
    return [];
  }
}

/**
 * Get or create the current month's budget period for a user
 */
/**
 * Format date as YYYY-MM-DD in local timezone (not UTC)
 * This prevents timezone shifts that cause dates to appear one day off
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string (YYYY-MM-DD) as local date (not UTC)
 * This prevents timezone shifts when parsing dates from database
 */
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

// Lightweight UUID generator that does not rely on crypto (works in RN)
function generateLocalUUID() {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

export async function getOrCreateCurrentBudgetPeriod(
  userId: string,
  today: Date = new Date()
): Promise<BudgetPeriod | null> {
  try {
    // Calculate current month boundaries in LOCAL timezone
    const year = today.getFullYear();
    const month = today.getMonth();
    const periodStart = new Date(year, month, 1);
    const periodEnd = new Date(year, month + 1, 0); // Last day of month

    // Use local date strings to avoid timezone shifts
    const periodStartStr = formatLocalDate(periodStart);
    const periodEndStr = formatLocalDate(periodEnd);

    // Try to find existing period for this month
    // First, try exact match
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

    // If no exact match, check if there's a period that overlaps with this month
    // (in case dates are slightly off due to timezone issues)
    const { data: overlappingPeriod } = await supabase
      .from("budget_periods")
      .select("*")
      .eq("user_id", userId)
      .lte("period_start", periodEndStr)
      .gte("period_end", periodStartStr)
      .maybeSingle();

    if (overlappingPeriod) {
      // Update the period with correct dates
      const { data: updatedPeriod, error: updateError } = await supabase
        .from("budget_periods")
        .update({
          period_start: periodStartStr,
          period_end: periodEndStr,
        })
        .eq("id", overlappingPeriod.id)
        .select()
        .single();
      
      if (!updateError && updatedPeriod) {
        return updatedPeriod as BudgetPeriod;
      }
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
 * Generate a stable key for category matching (case/whitespace-insensitive)
 */
const categoryKey = (name?: string | null) =>
  (name || "")
    .trim()
    .toLowerCase();

/**
 * Build a fast lookup for categories (system + user-defined)
 */
async function buildCategoryIndex(userId: string): Promise<CategoryIndex> {
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, user_id, name, slug, color, icon, rank, is_active")
    .or(`user_id.eq.${userId},user_id.is.null`);

  if (error || !categories) {
    logger.error("[BUDGET] Error fetching categories for index:", error);
    return { list: [], byKey: new Map(), byId: new Map(), hiddenKeys: new Set() };
  }

  const byKey = new Map<string, CategoryRecord>();
  const byId = new Map<string, CategoryRecord>();
  const hiddenKeys = new Set<string>();

  const addKeys = (cat: CategoryRecord) => {
    const keys = new Set<string>();
    if (cat.slug) keys.add(categoryKey(cat.slug));
    keys.add(categoryKey(cat.name));
    keys.add(categoryKey(cat.name.replace(/\s+/g, "-")));
    return keys;
  };

  // Track hidden keys from user-specific inactive rows
  categories
    .filter((cat: CategoryRecord) => cat.user_id === userId && cat.is_active === false)
    .forEach((cat: CategoryRecord) => {
      addKeys(cat).forEach((k) => hiddenKeys.add(k));
      byId.set(cat.id, cat);
    });

  // Add user-specific active categories first (override defaults)
  categories
    .filter((cat: CategoryRecord) => cat.user_id === userId && cat.is_active !== false)
    .forEach((cat: CategoryRecord) => {
      const keys = addKeys(cat);
      keys.forEach((k) => byKey.set(k, cat));
      byId.set(cat.id, cat);
    });

  // Add default categories if not hidden or overridden
  categories
    .filter((cat: CategoryRecord) => !cat.user_id)
    .forEach((cat: CategoryRecord) => {
      const keys = addKeys(cat);
      const isHidden = Array.from(keys).some((k) => hiddenKeys.has(k));
      const alreadyOverridden = Array.from(keys).some((k) => byKey.has(k));
      if (isHidden || alreadyOverridden || cat.is_active === false) {
        byId.set(cat.id, cat);
        return;
      }
      keys.forEach((k) => byKey.set(k, cat));
      byId.set(cat.id, cat);
    });

  const list = Array.from(byKey.values()).sort((a, b) => (a.rank || 0) - (b.rank || 0));

  return { list, byKey, byId, hiddenKeys };
}

/**
 * Resolve a raw category label to a known category record (if possible)
 * Returns a canonical display label and key to keep matching consistent.
 */
function resolveCategoryLabel(rawLabel: string | null | undefined, index: CategoryIndex) {
  const trimmed = (rawLabel || "").trim();
  const key = categoryKey(trimmed);
  const category = index.byKey.get(key) || null;
  const resolvedLabel = category?.name || trimmed || "Other";
  const resolvedKey = category?.slug ? categoryKey(category.slug) : key || "other";

  return { category, label: resolvedLabel, key: resolvedKey };
}

/**
 * Heuristic to drop transfer-like transactions that aren't marked as transfers.
 */
function isLikelyInternalTransfer(tx: TxLike): boolean {
  const name = (tx.merchant_name || tx.name || "").toLowerCase();
  const amount = Math.abs(Number(tx.amount || 0));
  const looksLikeP2P =
    name.includes("zelle") ||
    name.includes("venmo") ||
    name.includes("cash app") ||
    name.includes("cashapp") ||
    name.includes("paypal") ||
    name.includes("p2p") ||
    name.includes("transfer") ||
    name.includes("payment to") ||
    name.includes("payment from") ||
    name.includes("ach credit") ||
    name.includes("ach debit");

  // Treat large uncategorized Other with no merchant name as transfer-like to avoid blowing up "Other"
  const isLargeUncategorizedOther =
    (tx.top_category || tx.new_category || "").toLowerCase() === "other" &&
    !tx.merchant_name &&
    amount >= 500;

  return looksLikeP2P || isLargeUncategorizedOther;
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
    const categoryIndex = await buildCategoryIndex(userId);

    // Look back 12 months from today to get enough data for accurate averages
    // This ensures we capture recurring monthly expenses even if they're not perfectly monthly
    const today = new Date();
    const lookbackStart = new Date(today);
    lookbackStart.setMonth(lookbackStart.getMonth() - 12);
    lookbackStart.setDate(1); // Start of month for cleaner calculation


    // Get transactions from the past 12 months (up to today) - use new_category directly (don't rely on recurring_streams)
    // IMPORTANT: Use effective date (authorized_date || date) for consistency with actuals calculation
    // Fetch wider range to account for date differences, then filter by effective date
    const extendedLookbackStart = new Date(lookbackStart);
    extendedLookbackStart.setMonth(extendedLookbackStart.getMonth() - 1);
    const extendedToday = new Date(today);
    extendedToday.setMonth(extendedToday.getMonth() + 1);
    
    const { data: transactionsRaw, error: txError } = await supabase
      .from("transactions")
      .select("amount, top_category, new_category, date, authorized_date, transaction_type, name, merchant_name")
      .eq("user_id", userId)
      .gte("date", formatLocalDate(extendedLookbackStart)) // Use date for initial filter (wider range)
      .lte("date", formatLocalDate(extendedToday))
      .gt("amount", 0) // Only expenses
      .neq("transaction_type", "transfer"); // Exclude transfers at source

    if (txError) {
      console.error("[BUDGET] Error fetching transactions for suggestions:", txError);
      logger.error("[BUDGET] Error fetching transactions for suggestions:", txError);
      return [];
    }

    // Filter by effective date (authorized_date || date) within the actual lookback period
    const lookbackStartStr = formatLocalDate(lookbackStart);
    const todayStr = formatLocalDate(today);
    const transactions = (transactionsRaw || []).filter((tx) => {
      if (tx.transaction_type === "transfer") return false;
      if (isLikelyInternalTransfer(tx)) return false;
      const effectiveDate = tx.authorized_date || tx.date;
      return effectiveDate >= lookbackStartStr && effectiveDate <= todayStr;
    });

    if (!transactions || transactions.length === 0) {
      return [];
    }

    // Calculate actual months of data (not all 6 months may have data)
    // Use unique months that have transactions (using effective date)
    const uniqueMonths = new Set<string>();
    transactions
      .filter((tx) => tx.transaction_type !== "transfer")
      .filter((tx) => !isLikelyInternalTransfer(tx))
      .filter((tx) => tx.new_category !== "INTERNAL_TRANSFER" && tx.top_category !== "INTERNAL_TRANSFER")
      .forEach((tx) => {
      // Use effective date (authorized_date || date) for month calculation
      const effectiveDateStr = tx.authorized_date || tx.date;
      const date = new Date(effectiveDateStr);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      uniqueMonths.add(monthKey);
      });
    const actualMonths = Math.max(1, uniqueMonths.size); // Use actual number of months with data


    // Aggregate spending by category - prioritize new_category (user's manual categorization)
    // Track both resolved category (by slug) and original subcategories
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

    transactions
      .filter((tx) => tx.transaction_type !== "transfer")
      .filter((tx) => tx.new_category !== "INTERNAL_TRANSFER" && tx.top_category !== "INTERNAL_TRANSFER")
      .forEach((tx) => {
      // Use same category logic as getDisplayCategory() - ensures consistency with spending breakdown
      // Priority: new_category (user override) > top_category > "Other"
      let displayCategory: string;
      if (tx.new_category && tx.new_category !== "INTERNAL_TRANSFER") {
        displayCategory = tx.new_category;
      } else if (tx.top_category && tx.top_category !== "INTERNAL_TRANSFER") {
        displayCategory = tx.top_category;
      } else {
        displayCategory = "Other";
      }
      
      // Skip INTERNAL_TRANSFER
      if (displayCategory === "INTERNAL_TRANSFER") {
        return;
      }

      const resolved = resolveCategoryLabel(displayCategory, categoryIndex);

      const existing = categorySpending.get(resolved.key) || {
        total: 0,
        count: 0,
        categoryName: resolved.label,
        transactions: [],
        months: new Set<string>(),
        subcategories: new Map<string, { total: number; count: number; months: Set<string> }>(),
      };
      
      const amount = Math.abs(parseFloat(tx.amount.toString()));
      existing.total += amount;
      existing.count += 1;
      existing.transactions.push(tx);
      
      // Track which months have transactions for this category (using effective date)
      const effectiveDateStr = tx.authorized_date || tx.date;
      const date = new Date(effectiveDateStr);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      existing.months.add(monthKey);
      
      categorySpending.set(resolved.key, existing);
      });

    // Calculate average monthly spend and suggest budgets (1.1x average)
    const suggestions: SuggestedBudgetEntry[] = [];

    categorySpending.forEach((data, categoryKeyValue) => {
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

      const category = categoryIndex.byKey.get(categoryKeyValue) || null;

      // Debug logging - log to both logger and console for visibility
      const debugInfo = {
        categoryName: data.categoryName,
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


      suggestions.push({
        category_id: category?.id || null,
        category_name: category?.name || data.categoryName,
        suggested_amount: suggested,
        average_monthly_spend: avgMonthly,
        color: category?.color || "#607D8B",
      });
    });

    // Sort by suggested amount (highest first) - no limit, show all categories
    const sortedSuggestions = suggestions
      .sort((a, b) => b.suggested_amount - a.suggested_amount);
    
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
    const categoryIndex = await buildCategoryIndex(userId);
    
    const period = await getOrCreateCurrentBudgetPeriod(userId);
    if (!period) {
      return null;
    }

    // Check if entries already exist
    const existingEntries = await getBudgetEntriesForPeriod(period.id);
    // If entries exist and we're NOT forcing, we'll later backfill only missing categories (no overwrite)

    // If forcing re-initialize, delete existing entries first
    if (forceReinitialize && existingEntries.length > 0) {
      
      const entryIds = existingEntries.map(e => e.id);
      const { error: deleteError } = await supabase
        .from("budget_entries")
        .delete()
        .in("id", entryIds);
      
      if (deleteError) {
        console.error("[BUDGET] Error deleting existing entries:", deleteError);
        logger.error("[BUDGET] Error deleting existing entries:", deleteError);
      } else {
      }
      // Reset entries cache after deletion
      existingEntries.length = 0;
    }

    // Attempt to convert legacy group entries to category entries if we can resolve them
    const groupEntries = existingEntries.filter((e) => e.scope_type === "group");
    if (groupEntries.length > 0 && !forceReinitialize) {
      for (const entry of groupEntries) {
        const resolved = resolveCategoryLabel(entry.label, categoryIndex);
        if (resolved.category && entry.category_id !== resolved.category.id) {
          const { error } = await supabase
            .from("budget_entries")
            .update({
              scope_type: "category",
              category_id: resolved.category.id,
              group_key: null,
              label: resolved.label,
            })
            .eq("id", entry.id);
          if (error) {
            logger.error("[BUDGET] Error converting group entry to category:", error);
          } else {
            // Reflect conversion locally
            entry.scope_type = "category";
            entry.category_id = resolved.category.id;
            entry.label = resolved.label;
          }
        }
      }
    }

    // Get suggestions
    // Parse period dates as local dates to avoid timezone shifts
    const periodStart = parseLocalDate(period.period_start);
    const periodEnd = parseLocalDate(period.period_end);
    const suggestions = await suggestInitialBudgetEntries(
      userId,
      periodStart,
      periodEnd
    );


    // Build set of existing category keys to avoid overwriting
    const existingKeys = new Set<string>();
    existingEntries
      .filter((e) => e.scope_type === "category")
      .forEach((entry) => {
        const label = entry.category?.name || entry.label;
        const resolved = resolveCategoryLabel(label, categoryIndex);
        existingKeys.add(resolved.key);
      });

    // Create budget entries from suggestions, but only for categories not already present
    const entries = suggestions
      .filter((suggestion) => {
        const resolved = resolveCategoryLabel(suggestion.category_name, categoryIndex);
        return !existingKeys.has(resolved.key);
      })
      .map((suggestion, index) => {
        const resolved = resolveCategoryLabel(suggestion.category_name, categoryIndex);
        return {
          budget_period_id: period.id,
          scope_type: "category" as const,
          category_id: resolved.category?.id || suggestion.category_id,
          group_key: null,
          label: resolved.label,
          limit_amount: suggestion.suggested_amount,
          sort_index: existingEntries.length + index,
        };
      })
      .filter((entry) => entry.category_id || entry.label);

    if (entries.length > 0) {
      const { error: insertError } = await supabase
        .from("budget_entries")
        .insert(entries);

      if (insertError) {
        console.error("[BUDGET] Error creating initial budget entries:", insertError);
        logger.error("[BUDGET] Error creating initial budget entries:", insertError);
      } else {
      }
    } else {
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
): Promise<{ overall: number; byCategory: Map<string, number> }> {
  try {
    const categoryIndex = await buildCategoryIndex(userId);

    // Use local date strings to avoid timezone shifts
    const startStr = formatLocalDate(periodStart);
    const endStr = formatLocalDate(periodEnd);

    // IMPORTANT: Use authorized_date if available (when user actually made transaction),
    // otherwise use date (posted date). This matches how the UI displays transactions.
    // We need to fetch a wider range because authorized_date and date can differ.
    // Fetch transactions from 2 months before to 2 months after to catch all relevant transactions
    // This ensures we catch transactions where date is outside period but authorized_date is inside (or vice versa)
    const extendedStart = new Date(periodStart);
    extendedStart.setMonth(extendedStart.getMonth() - 2);
    const extendedEnd = new Date(periodEnd);
    extendedEnd.setMonth(extendedEnd.getMonth() + 2);
    const extendedStartStr = formatLocalDate(extendedStart);
    const extendedEndStr = formatLocalDate(extendedEnd);

    // Query transactions in extended range (we'll filter by effective date in JavaScript)
    // We query by 'date' field with wide range, then filter by effective date (authorized_date || date)
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("plaid_transaction_id, amount, new_category, top_category, date, authorized_date, transaction_type, name, merchant_name")
      .eq("user_id", userId)
      .gte("date", extendedStartStr) // Wide range on date field
      .lte("date", extendedEndStr)
      .gt("amount", 0) // Only expenses
      .neq("transaction_type", "transfer"); // Exclude transfers at source
    
    // Also query by authorized_date to catch transactions where date is outside range but authorized_date is in range
    const { data: transactionsByAuthDate } = await supabase
      .from("transactions")
      .select("plaid_transaction_id, amount, new_category, top_category, date, authorized_date, transaction_type, name, merchant_name")
      .eq("user_id", userId)
      .not("authorized_date", "is", null) // Only where authorized_date exists
      .gte("authorized_date", extendedStartStr)
      .lte("authorized_date", extendedEndStr)
      .gt("amount", 0)
      .neq("transaction_type", "transfer");
    
    // Combine and deduplicate transactions (by plaid_transaction_id if available, or by all fields)
    const allTransactions = [...(transactions || []), ...(transactionsByAuthDate || [])];
    const uniqueTransactions = Array.from(
      new Map(allTransactions.map(tx => {
        // Use a combination of fields as key to deduplicate
        const key = tx.plaid_transaction_id || `${tx.date}_${tx.authorized_date}_${tx.amount}_${tx.new_category}`;
        return [key, tx];
      })).values()
    );

    if (error) {
      logger.error("Error fetching actuals:", error);
      return { overall: 0, byCategory: new Map() };
    }

    // Filter transactions by effective date (authorized_date || date) within the actual period
    const filteredTransactions = uniqueTransactions
      .filter((tx) => tx.transaction_type !== "transfer")
      .filter((tx) => !isLikelyInternalTransfer(tx))
      .filter((tx) => tx.new_category !== "INTERNAL_TRANSFER" && tx.top_category !== "INTERNAL_TRANSFER")
      .filter((tx) => {
        // Use authorized_date if available, otherwise use date (matches UI logic)
        const effectiveDate = tx.authorized_date || tx.date;
        // Compare date strings directly (YYYY-MM-DD format)
        const inRange = effectiveDate >= startStr && effectiveDate <= endStr;
        
        
        return inRange;
      });
    

    let overall = 0;
    const byCategory = new Map<string, number>();

    // Now process current period transactions (already filtered by effective date)
    // Use the same category logic as spending breakdown (getDisplayCategory equivalent)
    // Priority: new_category (user override) > top_category > "Other"
    filteredTransactions.forEach((tx) => {
      const amount = Math.abs(parseFloat(tx.amount.toString()));
      overall += amount;

      // Get category using same logic as getDisplayCategory() in spending breakdown
      // This ensures categories match between spending breakdown and budget view
      let displayCategory: string;
      if (tx.new_category && tx.new_category !== "INTERNAL_TRANSFER") {
        displayCategory = tx.new_category;
      } else if (tx.top_category && tx.top_category !== "INTERNAL_TRANSFER") {
        displayCategory = tx.top_category;
      } else {
        displayCategory = "Other";
      }
      
      // Skip INTERNAL_TRANSFER
      if (displayCategory === "INTERNAL_TRANSFER") {
        return;
      }
      
      const resolved = resolveCategoryLabel(displayCategory, categoryIndex);
      const current = byCategory.get(resolved.label) || 0;
      byCategory.set(resolved.label, current + amount);
      
    });

    return { overall, byCategory };
  } catch (error) {
    console.error("[BUDGET] Error in getActualsForBudgetPeriod:", error);
    logger.error("[BUDGET] Error in getActualsForBudgetPeriod:", error);
    return { overall: 0, byCategory: new Map() };
  }
}

/**
 * Calculate average monthly spending for categories from historical data
 * Looks back up to 12 months to calculate averages
 */
export async function getHistoricalCategoryAverages(
  userId: string,
  lookbackMonths: number = 12
): Promise<Map<string, { averageMonthly: number; totalSpent: number; months: number }>> {
  try {
    const categoryIndex = await buildCategoryIndex(userId);
    const today = new Date();
    const lookbackStart = new Date(today);
    lookbackStart.setMonth(lookbackStart.getMonth() - lookbackMonths);
    lookbackStart.setDate(1); // Start of month

    const lookbackStartStr = formatLocalDate(lookbackStart);
    const todayStr = formatLocalDate(today);

    // Fetch transactions from lookback period
    const extendedStart = new Date(lookbackStart);
    extendedStart.setMonth(extendedStart.getMonth() - 1);
    const extendedStartStr = formatLocalDate(extendedStart);

    const { data: transactionsRaw } = await supabase
      .from("transactions")
      .select("amount, new_category, top_category, date, authorized_date, transaction_type, name, merchant_name")
      .eq("user_id", userId)
      .gte("date", extendedStartStr)
      .lte("date", todayStr)
      .gt("amount", 0)
      .neq("transaction_type", "transfer");

    if (!transactionsRaw || transactionsRaw.length === 0) {
      return new Map();
    }

    // Filter by effective date
    const transactions = transactionsRaw.filter((tx) => {
      if (isLikelyInternalTransfer(tx)) return false;
      const effectiveDate = tx.authorized_date || tx.date;
      return effectiveDate >= lookbackStartStr && effectiveDate <= todayStr;
    });

    // Aggregate by category
    const categoryData = new Map<string, { total: number; months: Set<string> }>();

    transactions.forEach((tx) => {
      if (isLikelyInternalTransfer(tx)) return;
      // Use same category logic as getDisplayCategory()
      let displayCategory: string;
      if (tx.new_category && tx.new_category !== "INTERNAL_TRANSFER") {
        displayCategory = tx.new_category;
      } else if (tx.top_category && tx.top_category !== "INTERNAL_TRANSFER") {
        displayCategory = tx.top_category;
      } else {
        return;
      }

      const resolved = resolveCategoryLabel(displayCategory, categoryIndex);

      const amount = Math.abs(parseFloat(tx.amount.toString()));
      const effectiveDate = tx.authorized_date || tx.date;
      const date = new Date(effectiveDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      const existing = categoryData.get(resolved.label) || {
        total: 0,
        months: new Set<string>(),
      };
      existing.total += amount;
      existing.months.add(monthKey);
      categoryData.set(resolved.label, existing);
    });

    // Calculate averages
    const averages = new Map<string, { averageMonthly: number; totalSpent: number; months: number }>();
    categoryData.forEach((data, categoryName) => {
      const months = Math.max(1, data.months.size);
      const averageMonthly = data.total / months;
      averages.set(categoryName, {
        averageMonthly,
        totalSpent: data.total,
        months,
      });
    });

    return averages;
  } catch (error) {
    console.error("[BUDGET] Error calculating historical averages:", error);
    logger.error("[BUDGET] Error calculating historical averages:", error);
    return new Map();
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
    // Parse period dates as local dates to avoid timezone shifts
    const periodStart = parseLocalDate(period.period_start);
    const periodEnd = parseLocalDate(period.period_end);
    
    // Debug: Log period dates
    
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
