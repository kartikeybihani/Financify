import { supabase } from "@/src/lib/supabase/supabase";
import {
  refreshBothBalancesAndTransactions,
  syncAllUserTransactions,
  refreshRecurringTransactions,
  getUpdateLinkToken,
  openPlaidLink,
} from "@/src/utils/plaid/plaid";
import { clearRecurringCache } from "@/src/shared/utils/recurringCache";
import { clearTransactionsCache } from "@/src/shared/utils/transactionCache";
import { clearSpendingCache } from "@/src/shared/utils/spendingCache";
import logger from "@/src/utils/core/logger";
import { ReAuthItem } from "@/src/types/insights";
import { FilterOptions } from "@/src/components/EnhancedFilterModal";

/**
 * Check if error indicates login required
 */
const isLoginRequired = (res: any): boolean => {
  return (
    res.requires_update_mode === true ||
    res.error_code === "ITEM_LOGIN_REQUIRED" ||
    res.error?.includes("ITEM_LOGIN_REQUIRED") ||
    res.error?.includes("login details of this item have changed") ||
    res.error?.includes("OAuth connection") ||
    res.error?.includes("re-authentication") ||
    res.error?.includes("use Link's update mode")
  );
};

/**
 * Handle API errors that indicate re-auth needed
 */
export const handleApiReAuthError = async (
  item_id: string,
  institution_name: string,
  setReAuthItems: (updater: (prev: ReAuthItem[]) => ReAuthItem[]) => void,
): Promise<void> => {
  try {
    // Update database flag so checkForReAuthNeeds will pick it up
    const { error: updateError } = await supabase
      .from("user_items")
      .update({ requires_update_mode: true })
      .eq("item_id", item_id);

    if (updateError) {
      logger.error(
        `Failed to update requires_update_mode for ${item_id}:`,
        updateError,
      );
    } else {
      logger.info(
        `✅ Updated requires_update_mode flag for ${item_id} (${institution_name})`,
      );
    }

    // Show re-auth banner immediately
    setReAuthItems((prev) => {
      const exists = prev.find((item) => item.item_id === item_id);
      if (exists) return prev;

      return [
        ...prev,
        {
          item_id,
          institution_name: institution_name || "Unknown Bank",
          dismissed: false,
          type: "re_auth" as const,
        },
      ];
    });
  } catch (error) {
    logger.error("Error updating requires_update_mode flag:", error);
  }
};

/**
 * Process re-auth errors from API results
 */
export const processReAuthErrors = async (
  results: any[],
  setReAuthItems: (updater: (prev: ReAuthItem[]) => ReAuthItem[]) => void,
): Promise<void> => {
  const reAuthPromises: Promise<void>[] = [];
  results.forEach((res: any) => {
    if (!res.success || res.error) {
      if (isLoginRequired(res) && res.item_id) {
        reAuthPromises.push(
          handleApiReAuthError(
            res.item_id,
            res.institution_name || "Unknown Bank",
            setReAuthItems,
          ),
        );
      }
    }
  });
  if (reAuthPromises.length > 0) {
    await Promise.all(reAuthPromises);
  }
};

/**
 * Check for re-auth needs from database
 */
export const checkForReAuthNeeds = async (
  userId: string,
  setReAuthItems: (items: ReAuthItem[]) => void,
): Promise<void> => {
  try {
    const { data: userItems, error } = await supabase
      .from("user_items")
      .select(
        "item_id, has_new_accounts, requires_update_mode, institution_name",
      )
      .eq("user_id", userId);

    if (error) {
      logger.error("Error checking update flags:", error);
      return;
    }

    const reAuthNeeded: ReAuthItem[] = [];

    // Check for items requiring re-auth or new accounts
    for (const item of userItems || []) {
      if (item.requires_update_mode) {
        reAuthNeeded.push({
          item_id: item.item_id,
          institution_name: item.institution_name || "Unknown Bank",
          dismissed: false,
          type: "re_auth",
        });
      }

      // Handle new accounts via banner
      if (item.has_new_accounts) {
        reAuthNeeded.push({
          item_id: item.item_id,
          institution_name: item.institution_name || "Unknown Bank",
          dismissed: false,
          type: "new_accounts",
        });
      }
    }

    setReAuthItems(reAuthNeeded);
  } catch (error) {
    logger.error("Error checking re-auth needs:", error);
  }
};

/**
 * Handle re-auth banner actions - Complete flow: Re-auth → Sync → Update UI
 */
export const handleReAuth = async (
  item_id: string,
  filterOptions: FilterOptions,
  callbacks: {
    fetchFreshData: () => Promise<void>;
    loadFilteredTransactions: (
      filters: FilterOptions,
      clearCache: boolean,
      searchQuery?: string,
    ) => Promise<void>;
    loadRecurringTransactions: () => Promise<void>;
    setReAuthItems: (updater: (prev: ReAuthItem[]) => ReAuthItem[]) => void;
    searchQuery?: string;
  },
): Promise<void> => {
  try {
    logger.info(
      "🔐 RE-AUTH FLOW: Starting re-authentication for item:",
      item_id,
    );

    // Step 1: Re-authenticate with Plaid
    const linkToken = await getUpdateLinkToken(item_id);
    await openPlaidLink(linkToken);
    logger.info("✅ Re-authentication successful");

    // Step 2: Clear re-auth and new accounts flags in database
    await supabase
      .from("user_items")
      .update({
        requires_update_mode: false,
        has_new_accounts: false,
        last_synced_at: new Date().toISOString(),
      })
      .eq("item_id", item_id);

    // Step 3: Remove from banner list (optimistic update)
    callbacks.setReAuthItems((prev) =>
      prev.filter((item) => item.item_id !== item_id),
    );

    logger.info("🔄 POST RE-AUTH: Comprehensive data refresh...");

    // Step 4: Comprehensive data refresh
    // 4a. Refresh both balances and transactions from Plaid
    await refreshBothBalancesAndTransactions(item_id);

    // 4b. Sync all transactions (manual flow: skip enrichment jobs)
    await syncAllUserTransactions({ skipEnrichment: true });

    // Step 5: Refresh UI from database (the single source of truth)
    await callbacks.fetchFreshData();
    await callbacks.loadFilteredTransactions(filterOptions, true);
    await callbacks.loadRecurringTransactions();

    logger.info(
      "✅ RE-AUTH COMPLETE: All data synced and UI updated from database",
    );
  } catch (error) {
    logger.error("❌ Re-auth flow failed:", error);

    // On error, try to at least refresh UI from existing database data
    try {
      await callbacks.fetchFreshData();
      await callbacks.loadFilteredTransactions(
        filterOptions,
        true,
        callbacks.searchQuery,
      );
    } catch (fallbackError) {
      logger.error("❌ Fallback data refresh also failed:", fallbackError);
    }
  }
};

/**
 * Dismiss re-auth banner
 */
export const dismissReAuthBanner = (
  item_id: string,
  setReAuthItems: (updater: (prev: ReAuthItem[]) => ReAuthItem[]) => void,
): void => {
  setReAuthItems((prev) =>
    prev.map((item) =>
      item.item_id === item_id ? { ...item, dismissed: true } : item,
    ),
  );
};

/**
 * Cloud refresh: The primary data refresh flow (Plaid → Supabase → UI)
 */
export const handleRefreshLatestData = async (
  setIsSyncing: (syncing: boolean) => void,
  setRefreshStatus: (status: { type: "cloud" | null; message: string }) => void,
  setReAuthItems: (updater: (prev: ReAuthItem[]) => ReAuthItem[]) => void,
  filterOptions: FilterOptions,
  callbacks: {
    fetchFreshData: () => Promise<void>;
    loadFilteredTransactions: (
      filters: FilterOptions,
      clearCache: boolean,
      searchQuery?: string,
    ) => Promise<void>;
    loadRecurringTransactions: () => Promise<void>;
    searchQuery?: string;
  },
): Promise<void> => {
  setIsSyncing(true);
  setRefreshStatus({
    type: "cloud",
    message: "Requesting latest data from banks...",
  });

  try {
    logger.info("☁️ CLOUD REFRESH: Starting comprehensive data refresh...");

    // Step 1: Refresh both balances and transactions from Plaid
    setRefreshStatus({
      type: "cloud",
      message: "Refreshing balances and transactions...",
    });
    logger.info("🔄 Step 1: Calling refreshBothBalancesAndTransactions()...");
    const result = await refreshBothBalancesAndTransactions();
    logger.info("📦 refreshBothBalancesAndTransactions result:", result);

    // Step 2: Check for re-auth errors and handle them
    if (result.results) {
      await processReAuthErrors(result.results, setReAuthItems);
    }

    logger.info("✅ Combined refresh completed:", result.message);

    // Step 3: Sync transactions to Supabase
    setRefreshStatus({
      type: "cloud",
      message: "Syncing transactions to database...",
    });
    logger.info(
      "🔄 Step 3: Calling syncAllUserTransactions(skipEnrichment=true)...",
    );
    const syncResult = await syncAllUserTransactions({
      skipEnrichment: true,
    });
    logger.info("📦 syncAllUserTransactions result:", syncResult);

    // Check for re-auth errors in sync results
    if (syncResult.results) {
      await processReAuthErrors(syncResult.results, setReAuthItems);
    }

    // Step 4: Refresh recurring transactions
    setRefreshStatus({
      type: "cloud",
      message: "Analyzing recurring transactions...",
    });
    logger.info("🔄 Step 4: Calling refreshRecurringTransactions()...");
    const recurringResult = await refreshRecurringTransactions();
    logger.info("📦 refreshRecurringTransactions result:", recurringResult);

    // Check for re-auth errors in recurring refresh results
    if (recurringResult.results) {
      await processReAuthErrors(recurringResult.results, setReAuthItems);
    }

    // Clear caches since we have fresh data
    await clearRecurringCache();
    await clearTransactionsCache();
    await clearSpendingCache();

    // Step 5: Refresh UI from Supabase (single source of truth)
    setRefreshStatus({ type: "cloud", message: "Updating interface..." });
    await callbacks.fetchFreshData();
    await callbacks.loadFilteredTransactions(filterOptions, true);
    await callbacks.loadRecurringTransactions();

    setRefreshStatus({
      type: "cloud",
      message: "Data refreshed successfully!",
    });
    logger.info("✅ CLOUD REFRESH COMPLETE: Fresh data → Supabase → UI");

    // Clear success message after 3 seconds
    setTimeout(() => {
      setRefreshStatus({ type: null, message: "" });
    }, 3000);
  } catch (error) {
    logger.error("❌ Cloud refresh failed:", error);
    setRefreshStatus({
      type: "cloud",
      message: "Refresh failed, loading cached data...",
    });

    // Fallback: reload current data from Supabase
    try {
      await callbacks.fetchFreshData();
      await callbacks.loadFilteredTransactions(
        filterOptions,
        true,
        callbacks.searchQuery,
      );
      await callbacks.loadRecurringTransactions();
    } catch (fallbackError) {
      logger.error("❌ Fallback refresh failed:", fallbackError);
      setRefreshStatus({ type: "cloud", message: "Unable to refresh data" });
    }

    // Clear error message after 5 seconds
    setTimeout(() => {
      setRefreshStatus({ type: null, message: "" });
    }, 5000);
  } finally {
    setIsSyncing(false);
  }
};
