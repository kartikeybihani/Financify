import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { router } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  DeviceEventEmitter,
  RefreshControl,
  Animated,
  Alert,
} from "react-native";
import { InteractionManager } from "react-native";
import * as Haptics from "expo-haptics";
import TopChips from "@/src/components/insights/components/TopChips";
import RecurringSection from "@/src/components/insights/components/RecurringSection";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "@/src/styles/insightsStyles";
import {
  headerRefreshStyles,
  updateModalStyles,
  transactionInfoStyles,
  loadMoreStyles,
  sectionContentStyles,
  fabStyles,
} from "./insightsStyles";
import CategoryDetailModal from "@/src/components/insights/CategoryDetailModal";
import EnhancedFilterModal, {
  FilterOptions,
  Account,
} from "@/src/components/EnhancedFilterModal";
import ReAuthBanner from "@/src/components/ui/ReAuthBanner";
import InsightsLoadingSkeleton from "@/src/components/insights/InsightsLoadingSkeleton";
import SpendingSection from "@/src/components/insights/components/SpendingSection";
import { MonthOption } from "@/src/components/insights/components/MonthSelector";
import IconButton from "@/src/components/shared/IconButton";
import TransactionsSection from "@/src/components/insights/components/TransactionsSection";
import CashFlowSection from "@/src/components/insights/components/CashFlowSection";
import CategorySelectionModal from "@/src/components/modals/CategorySelectionModal";
import CashDepositInstitutionModal from "@/src/components/modals/CashDepositInstitutionModal";
import CreditCardInstitutionModal from "@/src/components/modals/CreditCardInstitutionModal";
import InstitutionSelectionModal from "@/src/components/modals/InstitutionSelectionModal";
import { addNewBankAccount } from "@/src/utils/plaid/plaid";
import { supabase } from "@/src/lib/supabase/supabase";
import InvestmentsScreen from "@/app/investments";
import {
  syncAllUserTransactions,
  refreshBothBalancesAndTransactions,
  getAllRecurringTransactions,
  refreshRecurringTransactions,
  getUpdateLinkToken,
  openPlaidLink,
  getRecentTransactions,
  getFilteredTransactions,
  getFilteredTransactionsCount,
  getUserAccountsForFilter,
} from "@/src/utils/plaid/plaid";
import {
  getDisplayCategory,
  shouldShowRecurringChip,
} from "@/src/utils/categories/transactionCategory";
import {
  getSnaptradeHoldingsFromDB,
  getSnaptradeOptionsFromDB,
  getSnaptradeBalancesFromDB,
  getSnaptradeConnectionsFromDB,
  syncSnaptradeInvestments,
} from "@/src/utils/integrations/snaptrade";
import { forceFullResync } from "@/src/utils/categories/categoryFix";
import logger from "@/src/utils/core/logger";
import { useCategories } from "@/src/hooks/useCategories";
import { OptimisticUpdateManager } from "@/src/shared/utils/optimisticUpdates";
import { InsightsAnimationManager } from "@/src/shared/utils/insightsAnimations";
import { SmartPreloader } from "@/src/shared/utils/smartPreloader";
import {
  loadRecurringFromCache,
  saveRecurringToCache,
  clearRecurringCache,
  CachedRecurringData,
} from "@/src/shared/utils/recurringCache";
import {
  loadInvestmentFromCache,
  saveInvestmentToCache,
  clearInvestmentCache,
  CachedInvestmentData,
} from "@/src/shared/utils/investmentCache";
import {
  loadTransactionsFromCache,
  saveTransactionsToCache,
  clearTransactionsCache,
  hasValidTransactionsCache,
} from "@/src/shared/utils/transactionCache";
import {
  loadSpendingFromCache,
  saveSpendingToCache,
  clearSpendingCache,
  CachedSpendingData,
} from "@/src/shared/utils/spendingCache";
import {
  LoadingIndicator,
  ErrorState,
  EmptyState,
  RefreshStatus,
} from "@/src/shared/components/LoadingStates";
import {
  Transaction,
  RecurringStream,
  CategoryBreakdown,
  Insight,
} from "@/src/types/plaid";

// Define types

// Add some nice colors for categories
// Removed hardcoded category colors and formatCategoryName - now using database via useCategories hook

export default function InsightsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [realInsights, setRealInsights] = useState<Insight[]>([]);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  // Fetch user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
        }
      } catch (error) {
        console.error("Error fetching user ID:", error);
      }
    };
    fetchUserId();
  }, []);

  // Use the categories hook for database-driven categories
  // Pass userId to get user-specific categories
  const {
    categories: dbCategories,
    getCategoryColor,
    formatCategoryName: formatCategoryFromHook,
    getCategoryIcon,
  } = useCategories(userId);
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    [
      string,
      {
        amount: number;
        percentage: number;
        color: string;
        hasRecurringTransactions: boolean;
      }
    ][]
  >([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCategoryDetail, setShowCategoryDetail] = useState(false);
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<{
    category: string;
    data: { amount: number; percentage: number; color: string };
  } | null>(null);
  const [currentMonthTransactions, setCurrentMonthTransactions] = useState<
    Transaction[]
  >([]);
  const [categories, setCategories] = useState<string[]>(["All Categories"]);

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth()
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [availableMonths, setAvailableMonths] = useState<MonthOption[]>([]);

  const hasData = useRef(false);
  const hasCachedData = useRef(false); // Track if we have cached data to avoid skeleton
  const [refreshing, setRefreshing] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateModalInfo, setUpdateModalInfo] = useState<{
    type: "new_accounts" | "re_auth";
    message: string;
    item_id: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Re-auth banner state
  const [reAuthItems, setReAuthItems] = useState<
    Array<{
      item_id: string;
      institution_name: string;
      dismissed: boolean;
    }>
  >([]);

  // Recurring transactions state
  const [recurringData, setRecurringData] = useState<{
    subscriptions: RecurringStream[];
    income: RecurringStream[];
    bills: RecurringStream[];
    other: RecurringStream[];
    summary: {
      subscriptions: number;
      income: number;
      bills: number;
      other: number;
      total: number;
    };
  } | null>(null);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<{
    type: "cloud" | "manual" | "category_fix" | null;
    message: string;
  }>({ type: null, message: "" });
  const [syncStatus, setSyncStatus] = useState<{
    lastSync: string | null;
    nextSync: string | null;
    isAutomated: boolean;
  }>({ lastSync: null, nextSync: null, isAutomated: false });

  // Enhanced filtering state
  const [showEnhancedFilterModal, setShowEnhancedFilterModal] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Account addition modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    accountIds: [],
    categoryIds: [],
    timePeriod: "all",
  });
  const [filteredTransactions, setFilteredTransactions] = useState<
    Transaction[]
  >([]);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);
  const [mightHaveTransactions, setMightHaveTransactions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollViewRef = useRef<ScrollView>(null);
  const [isBudgetMode, setIsBudgetMode] = useState(false);
  const [openAddCategoryModal, setOpenAddCategoryModal] = useState<
    (() => void) | null
  >(null);
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const [isNearBottom, setIsNearBottom] = useState(false);
  const lastLoadTriggerRef = useRef(0);

  // Investment data state
  // Initialize investment data with cached data if available
  const [investmentHoldings, setInvestmentHoldings] = useState<any[]>([]);
  const [investmentOptions, setInvestmentOptions] = useState<any[]>([]);
  const [investmentBalances, setInvestmentBalances] = useState<any[]>([]);
  const [investmentConnections, setInvestmentConnections] = useState<any[]>([]);

  // Top bar section state
  const [activeSection, setActiveSection] = useState<
    "investments" | "spending" | "transactions" | "recurring" | "cashflow"
  >("spending");

  // Animation values for smooth transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Section entrance animations
  const [sectionAnimations, setSectionAnimations] = useState<{
    spending: Animated.Value;
    transactions: Animated.Value;
    recurring: Animated.Value;
    investments: Animated.Value;
    cashflow: Animated.Value;
  } | null>(null);

  // Simple cache for filtered results
  const filterCache = useRef<
    Map<
      string,
      {
        transactions: Transaction[];
        count: number;
        timestamp: number;
      }
    >
  >(new Map());
  const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes - using SHORT duration for filtered transactions

  // Search cache for instant repeat searches
  const searchCache = useRef<
    Map<
      string,
      {
        transactions: Transaction[];
        count: number;
        timestamp: number;
      }
    >
  >(new Map());
  const SEARCH_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for search results

  // Track if we're currently searching (for optimistic UI)
  const [isSearching, setIsSearching] = useState(false);

  // Store unfiltered transactions for instant client-side search
  const unfilteredTransactionsRef = useRef<Transaction[]>([]);

  // Cached userId to avoid repeated supabase.auth.getUser() calls
  const userIdRef = useRef<string | null>(null);
  const getUserId = useCallback(async (): Promise<string | null> => {
    if (userIdRef.current) return userIdRef.current;
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      logger.error("Auth error:", error.message);
      return null;
    }
    userIdRef.current = user?.id || null;
    return userIdRef.current;
  }, []);

  // Track user behavior for smart preloading
  const [userBehavior, setUserBehavior] = useState<{
    sectionVisits: Record<string, number>;
    lastVisited: string;
    visitOrder: string[];
  }>({
    sectionVisits: {},
    lastVisited: "spending",
    visitOrder: ["spending"],
  });

  // Use ref to store latest processTransactionsData to avoid re-subscription
  // Initialize as null, will be set after processTransactionsData is defined
  const processTransactionsDataRef = useRef<
    ((transactionsData: Transaction[]) => void) | null
  >(null);

  // Use refs to track current section and recurring data state for event listeners
  const activeSectionRef = useRef<
    "investments" | "spending" | "transactions" | "recurring" | "cashflow"
  >("spending");
  const recurringDataRef = useRef<typeof recurringData>(null);

  // Use ref to store latest loadRecurringTransactions function to avoid re-subscription
  const loadRecurringTransactionsRef = useRef<(() => Promise<void>) | null>(
    null
  );

  // Listen for transaction category updates - clear cache and refresh smoothly
  // Note: Using ref to avoid re-subscription when processTransactionsData changes
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "transactionCategoryUpdated",
      async (data) => {
        console.log("🔄 Transaction category updated:", data);

        // Clear caches since categories have changed
        await Promise.all([clearTransactionsCache(), clearSpendingCache()]);
        logger.info(
          "🗑️ Cleared transactions and spending cache after category update"
        );

        // Handle targeted transaction updates
        console.log("🔄 Processing transaction category update:", {
          updateType: data.updateType,
          affectedTransactionsCount: data.affectedTransactions?.length || 0,
          newCategory: data.newCategory,
        });

        if (data.affectedTransactions && data.affectedTransactions.length > 0) {
          console.log("📝 Updating filtered transactions with new categories");

          // Apply optimistic updates to filtered transactions
          setFilteredTransactions((prevTransactions) => {
            let updatedTransactions = prevTransactions;

            // Apply optimistic updates for each affected transaction
            data.affectedTransactions.forEach((affectedTx: any) => {
              updatedTransactions = OptimisticUpdateManager.applyCategoryChange(
                updatedTransactions,
                affectedTx.transactionId,
                data.newCategory
              );
            });

            console.log(
              "📊 Updated transactions count:",
              updatedTransactions.length
            );
            return updatedTransactions;
          });

          // Also update main transactions list for consistency
          setTransactions((prevTransactions) => {
            let updatedTransactions = prevTransactions;

            data.affectedTransactions.forEach((affectedTx: any) => {
              updatedTransactions = OptimisticUpdateManager.applyCategoryChange(
                updatedTransactions,
                affectedTx.transactionId,
                data.newCategory
              );
            });

            // Re-process spending breakdown with updated categories using ref
            // Use setTimeout to ensure state update completes first
            setTimeout(() => {
              if (processTransactionsDataRef.current) {
                processTransactionsDataRef.current(updatedTransactions);
              }
            }, 0);

            return updatedTransactions;
          });
        } else {
          console.log(
            "⚠️ No affected transactions found, falling back to full refresh"
          );
          // Fallback: refresh all data if no specific transactions provided
          await loadData();
        }
      }
    );

    return () => subscription.remove();
  }, []); // Empty deps - listener only set up once, uses ref for latest function

  // Keep refs updated with latest values
  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    recurringDataRef.current = recurringData;
  }, [recurringData]);

  // Listen for transaction recurring status updates - refresh recurring section
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "transactionRecurringUpdated",
      async (data) => {
        console.log("🔄 Transaction recurring status updated:", data);

        // Clear recurring cache since recurring status has changed
        await clearRecurringCache();
        logger.info("🗑️ Cleared recurring cache after recurring status update");

        // Refresh recurring transactions data
        // Only refresh if we're on the recurring section or if we have recurring data loaded
        // This prevents unnecessary refreshes when user is on other sections
        if (
          activeSectionRef.current === "recurring" ||
          recurringDataRef.current !== null
        ) {
          logger.info(
            "🔄 Refreshing recurring transactions after status update"
          );
          if (loadRecurringTransactionsRef.current) {
            await loadRecurringTransactionsRef.current();
          }
        } else {
          // If not on recurring section, just clear cache - will load fresh when user navigates
          logger.info(
            "📦 Cleared recurring cache (will load fresh when user navigates to recurring section)"
          );
        }
      }
    );

    return () => subscription.remove();
  }, []); // Empty deps - listener only set up once, uses refs for latest values

  // Initialize section animations and preload tasks
  useEffect(() => {
    setSectionAnimations({
      spending: InsightsAnimationManager.createSectionFadeIn(0),
      transactions: InsightsAnimationManager.createSectionFadeIn(100),
      recurring: InsightsAnimationManager.createSectionFadeIn(200),
      investments: InsightsAnimationManager.createSectionFadeIn(300),
      cashflow: InsightsAnimationManager.createSectionFadeIn(400),
    });

    // Register preload tasks for each section
    SmartPreloader.registerTask({
      id: "transactions",
      priority: "high",
      execute: async () => {
        await loadFilteredTransactions(filterOptions, true, searchQuery);
        return {
          transactions: filteredTransactions,
          count: totalFilteredCount,
        };
      },
    });

    SmartPreloader.registerTask({
      id: "recurring",
      priority: "medium",
      execute: async () => {
        await loadRecurringTransactions();
        return { recurringData };
      },
    });

    SmartPreloader.registerTask({
      id: "investments",
      priority: "medium",
      execute: async () => {
        await loadInvestmentData();
        return {
          holdings: investmentHoldings,
          options: investmentOptions,
          balances: investmentBalances,
          connections: investmentConnections,
        };
      },
    });

    SmartPreloader.registerTask({
      id: "accounts",
      priority: "high",
      execute: async () => {
        await loadUserAccounts(false);
        return { accounts };
      },
    });

    // Start preloading for current section
    SmartPreloader.preloadForSection(activeSection);
  }, []);

  // Load cached data immediately on mount to prevent flinching and show instant UI
  useEffect(() => {
    const loadCachedData = async () => {
      try {
        // Clear spending cache on mount to force recalculation with new date parsing logic
        // This ensures old cached data with buggy date logic doesn't persist
        await clearSpendingCache();

        // Don't load cached spending breakdown anymore - it's month-specific and may have
        // been calculated with old buggy date logic. Always reprocess from transactions.

        // Load cached transactions (most important for smooth UX)
        const cachedTransactions = await loadTransactionsFromCache();
        if (cachedTransactions && cachedTransactions.length > 0) {
          logger.info(
            "📦 Loading cached transactions on mount:",
            cachedTransactions.length
          );
          setTransactions(cachedTransactions);
          hasData.current = true;
          hasCachedData.current = true;

          // Always reprocess transactions to calculate spending breakdown with correct date logic
          // Use ref if available, otherwise will be processed in normal flow
          if (processTransactionsDataRef.current) {
            processTransactionsDataRef.current(cachedTransactions);
          }
          // If ref not set yet, normal initialization will handle it
        }

        // Load cached investment data
        const cachedInvestmentData = await loadInvestmentFromCache();
        if (cachedInvestmentData) {
          logger.info("📦 Loading cached investment data on mount");
          setInvestmentHoldings(cachedInvestmentData.holdings);
          setInvestmentOptions(cachedInvestmentData.options);
          setInvestmentBalances(cachedInvestmentData.balances);
          setInvestmentConnections(cachedInvestmentData.connections);
        }

        // Load cached recurring data
        const cachedRecurringData = await loadRecurringFromCache();
        if (cachedRecurringData) {
          logger.info("📦 Loading cached recurring data on mount");
          setRecurringData(cachedRecurringData);
        }
      } catch (error) {
        logger.error("Error loading cached data:", error);
      }
    };

    loadCachedData();
  }, []);

  // Initialize data on mount: use cache first, then refresh in background
  useEffect(() => {
    const initializeScreen = async () => {
      // Only show initial load if we don't have cached data
      if (!hasCachedData.current) {
        setIsInitialLoad(true);
      }

      try {
        // Try to load from database (will use cache if available)
        const hasStoredData = await loadData();

        // Load accounts for filter modal (non-blocking for first paint)
        loadUserAccounts(false);
        // Load sync status
        loadSyncStatus();

        // If we have cached data, refresh in background without showing loading state
        if (hasCachedData.current) {
          // Refresh fresh data silently in background
          fetchFreshData().catch((error) => {
            logger.error("Background refresh failed:", error);
          });
        } else if (!hasStoredData) {
          // No cache and no stored data - show loading and fetch
          setIsLoading(true);
          await fetchFreshData();
          setIsLoading(false);
        }
      } catch (error) {
        logger.error("Error during initialization:", error);
      } finally {
        setIsInitialLoad(false);
      }
    };

    // Small delay to ensure cached data is loaded first
    const timer = setTimeout(() => {
      initializeScreen();
    }, 50);

    return () => clearTimeout(timer);
  }, [getUserId]);

  // Auto-refresh stale investment data (>24 hours old)
  useEffect(() => {
    const checkAndAutoSyncInvestments = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const connections = await getSnaptradeConnectionsFromDB();
        if (!connections || connections.length === 0) return;

        // Check if any connection has stale data (>24 hours)
        const now = new Date();
        const staleConnections = connections.filter((conn: any) => {
          if (!conn.last_synced_at) return true; // Never synced
          const lastSynced = new Date(conn.last_synced_at);
          const hoursSinceSync =
            (now.getTime() - lastSynced.getTime()) / (1000 * 60 * 60);
          return hoursSinceSync > 24;
        });

        if (staleConnections.length > 0) {
          // Sync silently in background - don't show loading UI
          for (const conn of staleConnections) {
            try {
              await syncSnaptradeInvestments(user.id, conn.account_id);
            } catch (error) {
              // Silently handle errors - don't show to user
            }
          }
        }
      } catch (error) {
        // Silently handle errors - don't show to user
        logger.error("Auto-refresh check failed silently:", error);
      }
    };

    // Run check after component mounts, with a small delay to not block initial render
    const timeoutId = setTimeout(checkAndAutoSyncInvestments, 1000);
    return () => clearTimeout(timeoutId);
  }, []);

  // Post-first-frame: check re-auth needs without blocking initial render
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      checkForReAuthNeeds();
    });
    return () => {
      // @ts-ignore cancel may not exist in some RN versions
      if (task && typeof task.cancel === "function") task.cancel();
    };
  }, []);

  // Load filtered transactions when filter options change (only in Transactions section)
  useEffect(() => {
    if (
      activeSection === "transactions" &&
      hasData.current &&
      !showEnhancedFilterModal
    ) {
      loadFilteredTransactions(filterOptions, true, searchQuery);
    }
  }, [filterOptions, activeSection, showEnhancedFilterModal]);

  // Load filtered transactions when search query changes (debounced with instant client-side filtering)
  useEffect(() => {
    if (activeSection !== "transactions" || !hasData.current) return;

    // If search query is empty, just reload normal filtered transactions
    if (!searchQuery.trim()) {
      setIsSearching(false);
      loadFilteredTransactions(filterOptions, true, "");
      return;
    }

    // Check search cache first for instant results
    const searchCacheKey = `${searchQuery
      .trim()
      .toLowerCase()}_${JSON.stringify(filterOptions)}`;
    const cachedSearch = searchCache.current.get(searchCacheKey);
    if (
      cachedSearch &&
      Date.now() - cachedSearch.timestamp < SEARCH_CACHE_DURATION
    ) {
      logger.info(`⚡ Using cached search results for: "${searchQuery}"`);
      setFilteredTransactions(cachedSearch.transactions);
      setTotalFilteredCount(cachedSearch.count);
      setHasMoreTransactions(
        cachedSearch.transactions.length < cachedSearch.count
      );
      setIsSearching(false);
      return;
    }

    // Instant client-side filtering for immediate feedback
    // Use unfiltered transactions ref for consistent instant results
    const baseTransactions =
      unfilteredTransactionsRef.current.length > 0
        ? unfilteredTransactionsRef.current
        : filteredTransactions;

    // Only update if we have base transactions to filter
    if (baseTransactions.length > 0) {
      const searchTerm = searchQuery.trim().toLowerCase();
      const instantResults = baseTransactions.filter((tx) => {
        const name = (tx.name || "").toLowerCase();
        // Use effective category (new_category if exists, else top_category) - matches getDisplayCategory logic
        const effectiveCategory = getDisplayCategory(tx).toLowerCase();
        return (
          name.includes(searchTerm) || effectiveCategory.includes(searchTerm)
        );
      });

      // Show instant results immediately (optimistic UI) - use functional update to avoid stale closure
      setFilteredTransactions((prev) => {
        // Only update if results are different to avoid unnecessary re-renders
        if (
          prev.length !== instantResults.length ||
          prev[0]?.id !== instantResults[0]?.id
        ) {
          return instantResults;
        }
        return prev;
      });
      setIsSearching(true);
    } else {
      setIsSearching(true);
    }

    // Debounce database search to avoid too many queries
    const timeoutId = setTimeout(() => {
      loadFilteredTransactions(filterOptions, true, searchQuery).then(() => {
        setIsSearching(false);
      });
    }, 400); // 400ms debounce for database search (balance between responsiveness and query count)

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchQuery, activeSection, filterOptions]);

  // Check cache when transactions section is active and we have accounts but no filtered transactions yet
  useEffect(() => {
    let isCancelled = false;

    const checkCacheIfNeeded = async () => {
      if (
        activeSection === "transactions" &&
        accounts.length > 0 &&
        filteredTransactions.length === 0
      ) {
        // If there's an active search query and we have 0 results,
        // we've already confirmed there are no results - don't show loading state
        if (searchQuery.trim() && !isSearching) {
          // Search completed with 0 results - show empty state, not loading
          if (!isCancelled) {
            setMightHaveTransactions(false);
          }
          return;
        }

        const hasCache = await hasValidTransactionsCache();
        // Only update state if this effect hasn't been cancelled
        if (!isCancelled) {
          setMightHaveTransactions(hasCache);
          if (hasCache) {
            logger.info(
              "📦 Cache exists, showing loading state instead of empty state"
            );
          }
        }
      } else {
        // Only update state if this effect hasn't been cancelled
        if (!isCancelled) {
          setMightHaveTransactions(false);
        }
      }
    };
    checkCacheIfNeeded();

    // Cleanup function to cancel pending async operations
    return () => {
      isCancelled = true;
    };
  }, [
    activeSection,
    accounts.length,
    filteredTransactions.length,
    searchQuery,
    isSearching,
  ]);

  // Gate data loads by active section and trigger smart preloading
  useEffect(() => {
    if (activeSection === "transactions") {
      loadFilteredTransactions(filterOptions, true, searchQuery);
    } else if (activeSection === "recurring") {
      // Only load recurring data if we don't have any data yet
      if (!recurringData) {
        loadRecurringTransactions();
      } else {
        logger.info("📦 Recurring data already loaded, skipping reload");
      }
    } else if (activeSection === "investments") {
      // Only load investment data if we don't have any data yet
      const hasInvestmentData =
        investmentHoldings.length > 0 ||
        investmentOptions.length > 0 ||
        investmentBalances.length > 0 ||
        investmentConnections.length > 0;

      if (!hasInvestmentData) {
        loadInvestmentData();
      } else {
        logger.info("📦 Investment data already loaded, skipping reload");
      }
    }

    // Trigger smart preloading for likely next sections
    SmartPreloader.preloadForSection(activeSection);
  }, [activeSection]);

  const loadData = async () => {
    try {
      // First check cache (already loaded in mount effect, but check again)
      const cachedTransactions = await loadTransactionsFromCache();
      if (cachedTransactions && cachedTransactions.length > 0) {
        logger.info(
          "Insights: Using cached transactions:",
          cachedTransactions.length
        );
        setTransactions(cachedTransactions);
        processTransactionsData(cachedTransactions);
        hasData.current = true;
        return true;
      }

      logger.info("Insights: Loading data from Supabase...");

      const userId = await getUserId();
      if (!userId) {
        logger.error("No authenticated user");
        return false;
      }

      // Fetch recent transactions using the new plaid utils
      // Fetch more transactions to support 2 years of month history (estimate ~1000 transactions)
      const transactions = await getRecentTransactions(userId, 1000);

      if (transactions && transactions.length > 0) {
        logger.info(
          `Insights: Loaded ${transactions.length} transactions from Supabase`
        );

        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;

        // Save to cache for next time
        await saveTransactionsToCache(transactions);
        return true;
      }

      logger.info("Insights: No transaction data found");
      return false;
    } catch (error) {
      logger.error("Insights: Error loading data:", error);
      return false;
    }
  };

  const fetchFreshData = async () => {
    try {
      // Only show loading state if we don't have cached data
      if (!hasCachedData.current) {
        setIsLoading(true);
      }
      logger.info("Insights: Fetching fresh data from Supabase...");

      const userId = await getUserId();
      if (!userId) {
        logger.error("No authenticated user");
        return;
      }

      // Fetch latest transactions using the new plaid utils
      // Fetch more transactions to support 2 years of month history (estimate ~1000 transactions)
      const transactions = await getRecentTransactions(userId, 1000);

      if (transactions && transactions.length > 0) {
        logger.info(
          `Insights: Loaded ${transactions.length} fresh transactions`
        );
        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;

        // Save to cache for smooth next load
        await saveTransactionsToCache(transactions);
      } else {
        logger.info("Insights: No transactions found");
      }
    } catch (error) {
      logger.error("Insights: Error fetching fresh data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load sync status for automated syncs
  const loadSyncStatus = async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;

      const { data, error } = await supabase
        .from("user_items")
        .select("last_synced_at, last_automated_sync")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("last_automated_sync", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return;

      const lastSync = data.last_automated_sync || data.last_synced_at;
      if (lastSync) {
        const lastSyncDate = new Date(lastSync);
        const nextSyncDate = new Date(lastSyncDate);
        nextSyncDate.setDate(nextSyncDate.getDate() + 1);
        nextSyncDate.setHours(8, 0, 0, 0); // 8 AM ET

        setSyncStatus({
          lastSync: lastSyncDate.toLocaleString(),
          nextSync: nextSyncDate.toLocaleString(),
          isAutomated: !!data.last_automated_sync,
        });
      }
    } catch (error) {
      console.error("Error loading sync status:", error);
    }
  };

  // Load user accounts for filter modal
  const loadUserAccounts = async (debug: boolean = false) => {
    try {
      const userId = await getUserId();
      if (!userId) {
        if (debug) logger.error("No authenticated user loading accounts");
        return;
      }

      const userAccounts = await getUserAccountsForFilter(userId);
      setAccounts(userAccounts);

      if (debug) {
        logger.debug(
          `Loaded ${userAccounts.length} user accounts for filtering:`
        );
        userAccounts.forEach((acc, idx) => {
          logger.debug(
            `  ${idx + 1}. ${acc.institution_name} - ${acc.name} (${
              acc.subtype
            }) [Account ID: ${acc.account_id}]`
          );
        });

        // Additional debug - check for institution name mismatches
        const uniqueInstitutions = [
          ...new Set(userAccounts.map((acc) => acc.institution_name)),
        ];

        // Check which accounts belong to which institution
        uniqueInstitutions.forEach((institution) => {
          const accountsForInstitution = userAccounts.filter(
            (acc) => acc.institution_name === institution
          );
          accountsForInstitution.forEach((acc) => {
            logger.debug(`    - ${acc.name} (${acc.subtype})`);
          });
        });
      }
    } catch (error) {
      logger.error("Error loading user accounts:", error);
    }
  };

  // Helper functions for caching
  const getCacheKey = (filters: FilterOptions, offset: number = 0) => {
    const accountsKey =
      (filters.accountIds || []).length === 0
        ? "all"
        : (filters.accountIds || []).sort().join(",");
    const categoriesKey =
      (filters.categoryIds || []).length === 0
        ? "all"
        : (filters.categoryIds || []).sort().join(",");
    return `${accountsKey}_${filters.timePeriod}_${categoriesKey}_${offset}`;
  };

  const getCachedData = (cacheKey: string) => {
    const cached = filterCache.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached;
    }
    return null;
  };

  const setCachedData = (
    cacheKey: string,
    transactions: Transaction[],
    count: number
  ) => {
    filterCache.current.set(cacheKey, {
      transactions,
      count,
      timestamp: Date.now(),
    });
  };

  const clearCache = () => {
    filterCache.current.clear();
    searchCache.current.clear(); // Also clear search cache when filters/data change
  };

  // Load filtered transactions with pagination and caching
  const loadFilteredTransactions = async (
    filters: FilterOptions,
    reset: boolean = false,
    search: string = ""
  ) => {
    try {
      const userId = await getUserId();
      if (!userId) {
        logger.info("❌ No authenticated user loading filtered transactions");
        return;
      }

      const offset = reset ? 0 : filteredTransactions.length;
      const cacheKey = getCacheKey(filters, offset);

      // Check search cache first for instant results
      if (reset && search.trim()) {
        const searchCacheKey = `${search.trim().toLowerCase()}_${JSON.stringify(
          filters
        )}`;
        const cachedSearch = searchCache.current.get(searchCacheKey);
        if (
          cachedSearch &&
          Date.now() - cachedSearch.timestamp < SEARCH_CACHE_DURATION
        ) {
          logger.info(`⚡ Using cached search results for: "${search}"`);
          setFilteredTransactions(cachedSearch.transactions);
          setTotalFilteredCount(cachedSearch.count);
          setHasMoreTransactions(
            cachedSearch.transactions.length < cachedSearch.count
          );
          setIsSearching(false);
          return;
        }
      }

      // Don't use cache when searching - always fetch fresh results
      // Check cache first (only for initial load, not pagination, and not when searching)
      if (reset && !search.trim()) {
        const cached = getCachedData(getCacheKey(filters, 0));
        if (cached) {
          logger.info(`📦 Using cached data for filters: ${cacheKey}`);
          setFilteredTransactions(cached.transactions);
          setTotalFilteredCount(cached.count);
          setHasMoreTransactions(cached.transactions.length < cached.count);
          return;
        }
      }

      // When searching, load more results at once (up to 200) to show most matches quickly
      // Otherwise use normal pagination (50 at a time)
      // Using 200 instead of 500 for faster initial load - can paginate if needed
      const limit = search.trim() ? 200 : 50;

      // Get filtered transactions
      // logger.info(`🔍 Loading filtered transactions with:`, {
      //   accountIds: filters.accountIds,
      //   timePeriod: filters.timePeriod,
      //   categoryIds: filters.categoryIds,
      //   searchQuery: search,
      //   limit,
      //   offset,
      //   accountIdsLength: filters.accountIds?.length || 0,
      //   categoryIdsLength: filters.categoryIds?.length || 0,
      // });

      const newTransactions = await getFilteredTransactions(userId, {
        accountIds: filters.accountIds,
        timePeriod: filters.timePeriod,
        categoryIds: filters.categoryIds,
        searchQuery: search,
        limit,
        offset,
      });

      // logger.info(
      //   `📊 getFilteredTransactions returned ${newTransactions.length} transactions`
      // );

      // Get total count for pagination (only on initial load or when search changes)
      let totalCount = totalFilteredCount;
      if (reset) {
        totalCount = await getFilteredTransactionsCount(userId, {
          accountIds: filters.accountIds,
          timePeriod: filters.timePeriod,
          categoryIds: filters.categoryIds,
          searchQuery: search,
        });
      }

      const updatedTransactions = reset
        ? newTransactions
        : [...filteredTransactions, ...newTransactions];

      if (reset) {
        setFilteredTransactions(updatedTransactions);
        setTotalFilteredCount(totalCount);

        // Store unfiltered transactions for instant client-side search
        if (!search.trim()) {
          unfilteredTransactionsRef.current = updatedTransactions;
        }

        // Cache the initial load (only if not searching)
        if (!search.trim()) {
          setCachedData(
            getCacheKey(filters, 0),
            updatedTransactions,
            totalCount
          );
        } else {
          // Cache search results for instant repeat searches
          const searchCacheKey = `${search
            .trim()
            .toLowerCase()}_${JSON.stringify(filters)}`;
          searchCache.current.set(searchCacheKey, {
            transactions: updatedTransactions,
            count: totalCount,
            timestamp: Date.now(),
          });
          logger.info(`💾 Cached search results for: "${search}"`);
        }
      } else {
        setFilteredTransactions(updatedTransactions);
        // Update ref when appending
        if (!search.trim()) {
          unfilteredTransactionsRef.current = updatedTransactions;
        }
      }

      setHasMoreTransactions(updatedTransactions.length < totalCount);

      logger.info(
        `📊 Loaded ${newTransactions.length} filtered transactions (${
          updatedTransactions.length
        }/${totalCount})${search.trim() ? ` for search: "${search}"` : ""}`
      );
    } catch (error) {
      logger.error("❌ Error loading filtered transactions:", error);
    }
  };

  // Load more transactions for infinite scroll
  const loadMoreTransactions = async () => {
    if (loadingMore || !hasMoreTransactions) return;

    setLoadingMore(true);
    await loadFilteredTransactions(filterOptions, false, searchQuery);
    setLoadingMore(false);

    // Note: When appending items below the current scroll position,
    // React Native ScrollView naturally maintains the scroll position.
    // No manual adjustment needed - the scroll stays in place.
  };

  // Listen for financial data updates
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      async (data) => {
        logger.info("🔄 Financial data refreshed event received");

        // Handle account deletion - clean up filter options if deleted account was selected
        let updatedFilterOptions = filterOptions;
        if (data && data.accountDeleted) {
          const deletedAccountId = data.accountDeleted;
          logger.info(`🗑️ Account deleted: ${deletedAccountId}`);

          // Remove deleted account from filter options if it was selected
          const currentAccountIds = filterOptions.accountIds || [];
          if (currentAccountIds.includes(deletedAccountId)) {
            const updatedAccountIds = currentAccountIds.filter(
              (id) => id !== deletedAccountId
            );
            logger.info(
              `🧹 Removed deleted account from filter options. Remaining: ${updatedAccountIds.length}`
            );
            updatedFilterOptions = {
              ...filterOptions,
              accountIds: updatedAccountIds,
            };
            setFilterOptions(updatedFilterOptions);
          }
        }

        if (data && data.transactions) {
          setTransactions(data.transactions);
          // Use ref for consistency and to ensure we have latest function
          if (processTransactionsDataRef.current) {
            processTransactionsDataRef.current(data.transactions);
          } else {
            // Fallback: processTransactionsData should be defined by now, but use direct call
            processTransactionsData(data.transactions);
          }
          hasData.current = true;
        }

        // Only refresh accounts if we're not in the middle of filtering
        if (!showEnhancedFilterModal) {
          await loadUserAccounts(true); // Debug when financial data changes
          // Use updated filter options (with deleted account removed if applicable)
          await loadFilteredTransactions(updatedFilterOptions, true);

          // Clear caches since financial data has changed
          await clearRecurringCache();
          await clearInvestmentCache();
          await clearTransactionsCache();
          await clearSpendingCache();
          // Also reload recurring transactions from database when data changes
          await loadRecurringTransactions();
          // Also reload investment data if financial data changes
          await loadInvestmentData();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [showEnhancedFilterModal, filterOptions]);

  // Memoized date calculations to avoid repeated Date object creation
  const currentDateInfo = useMemo(() => {
    const now = new Date();
    return {
      now,
      currentMonth: now.getMonth(),
      currentYear: now.getFullYear(),
    };
  }, []);

  // Helper function to parse transaction date as local date (not UTC)
  // Uses authorized_date if available (when user actually made transaction),
  // otherwise uses posted date (date)
  const parseTransactionDate = useCallback(
    (tx: Transaction): { year: number; month: number } => {
      // Use authorized_date if available (when user actually made the transaction)
      // Fallback to date (posted date) if authorized_date is not available
      const dateStr = tx.authorized_date || tx.date;
      // Parse date string directly: "2024-11-30" -> year=2024, month=10 (0-indexed)
      const parts = dateStr.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Convert 1-12 to 0-11
      return { year, month };
    },
    []
  );

  // Generate available months from transactions (last 24 months max)
  const generateAvailableMonths = useCallback(
    (transactionsData: Transaction[]): MonthOption[] => {
      // Filter out INTERNAL_TRANSFER transactions
      const expenses = transactionsData.filter(
        (tx) => tx.amount > 0 && tx.new_category !== "INTERNAL_TRANSFER"
      );

      // Create a map of month-year to total spent
      const monthMap = new Map<
        string,
        { month: number; year: number; total: number }
      >();

      expenses.forEach((tx) => {
        const { year, month } = parseTransactionDate(tx);
        const key = `${year}-${month}`;

        if (!monthMap.has(key)) {
          monthMap.set(key, { month, year, total: 0 });
        }
        monthMap.get(key)!.total += tx.amount;
      });

      // Convert to array and sort by date (most recent first)
      const monthsArray: MonthOption[] = Array.from(monthMap.values())
        .sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        })
        .slice(0, 24) // Limit to last 24 months
        .map(({ month, year, total }) => ({
          month,
          year,
          totalSpent: total,
        }));

      return monthsArray;
    },
    [parseTransactionDate]
  );

  // Filter transactions by selected month/year
  const filterTransactionsByMonth = useCallback(
    (
      transactionsData: Transaction[],
      month: number,
      year: number
    ): Transaction[] => {
      return transactionsData.filter((tx) => {
        const { year: txYear, month: txMonth } = parseTransactionDate(tx);
        return (
          txMonth === month &&
          txYear === year &&
          tx.amount > 0 &&
          tx.new_category !== "INTERNAL_TRANSFER"
        );
      });
    },
    [parseTransactionDate]
  );

  // Memoized transaction processing to prevent expensive recomputations
  const processTransactionsData = useCallback(
    (
      transactionsData: Transaction[],
      targetMonth?: number,
      targetYear?: number
    ) => {
      // Use selected month/year or default to current month
      const monthToUse =
        targetMonth !== undefined ? targetMonth : selectedMonth;
      const yearToUse = targetYear !== undefined ? targetYear : selectedYear;

      // Filter out INTERNAL_TRANSFER transactions - they should not be counted in spending
      const expenses = transactionsData.filter(
        (tx) => tx.amount > 0 && tx.new_category !== "INTERNAL_TRANSFER"
      );

      // Filter for selected month
      let currentMonthExpenses = filterTransactionsByMonth(
        expenses,
        monthToUse,
        yearToUse
      );

      // If no data for selected month, try to find the most recent month with data
      if (currentMonthExpenses.length === 0 && expenses.length > 0) {
        // Sort expenses by date (most recent first) - compare date strings directly
        const sortedExpenses = [...expenses].sort((a, b) => {
          // YYYY-MM-DD format sorts correctly as strings
          return b.date.localeCompare(a.date);
        });

        // Find the most recent month with data using transaction date parsing
        const { year: mostRecentYear, month: mostRecentMonth } =
          parseTransactionDate(sortedExpenses[0]);

        currentMonthExpenses = filterTransactionsByMonth(
          expenses,
          mostRecentMonth,
          mostRecentYear
        );

        // Update selected month/year to match most recent month with data
        if (targetMonth === undefined && targetYear === undefined) {
          setSelectedMonth(mostRecentMonth);
          setSelectedYear(mostRecentYear);
        }
      }

      const totalSpent = currentMonthExpenses.reduce(
        (acc, tx) => acc + tx.amount,
        0
      );

      const categoriesObj: CategoryBreakdown = {};
      for (const tx of currentMonthExpenses) {
        // Use the unified category display logic
        const category = getDisplayCategory(tx);

        if (!categoriesObj[category]) {
          categoriesObj[category] = {
            amount: 0,
            percentage: 0,
            color: getCategoryColor(category),
            hasRecurringTransactions: false,
          };
        }
        categoriesObj[category].amount += tx.amount;

        // Check if this transaction is recurring using the unified logic
        if (shouldShowRecurringChip(tx)) {
          categoriesObj[category].hasRecurringTransactions = true;
        }
      }

      // Calculate percentages
      Object.keys(categoriesObj).forEach((category) => {
        categoriesObj[category].percentage =
          totalSpent > 0
            ? (categoriesObj[category].amount / totalSpent) * 100
            : 0;
      });

      const sortedCategories = Object.entries(categoriesObj).sort(
        (a, b) => b[1].amount - a[1].amount
      );

      // Filter out Internal Transfer categories
      const filteredCategories = sortedCategories.filter(
        ([category]) => category !== "INTERNAL_TRANSFER"
      );

      setCategoryBreakdown(filteredCategories);

      // Store current month transactions for category detail modal
      setCurrentMonthTransactions(currentMonthExpenses);

      const uniqueCategories = [
        "All Categories",
        ...new Set(currentMonthExpenses.map((tx) => getDisplayCategory(tx))),
      ].map((cat) =>
        cat === "All Categories" ? cat : formatCategoryFromHook(cat)
      );

      setCategories(uniqueCategories);

      const topCategory = sortedCategories[0];
      const displayTotal =
        totalSpent > 0
          ? totalSpent
          : expenses.reduce((acc, tx) => acc + tx.amount, 0);
      const displayPeriod = totalSpent > 0 ? "this month" : "recently";

      const newInsights: Insight[] = [
        {
          icon: "cash-outline",
          title: `You spent $${displayTotal.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ${displayPeriod}`,
          description: topCategory
            ? `Top category: ${formatCategoryFromHook(topCategory[0])}`
            : "Building your spending insights...",
          details: topCategory
            ? `You've spent the most on ${formatCategoryFromHook(
                topCategory[0]
              )} — $${topCategory[1].amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} this month. Try setting a limit or exploring cheaper alternatives.`
            : "We're analyzing your spending patterns. More insights will appear as you use the app.",
        },
      ];

      setRealInsights(newInsights);

      // Save spending breakdown to cache for smooth UX
      const spendingCacheData = {
        categoryBreakdown: filteredCategories,
        currentMonthTransactions: currentMonthExpenses,
        totalSpent,
        displayPeriod,
      };
      saveSpendingToCache(spendingCacheData).catch((error) => {
        logger.error("Failed to save spending to cache:", error);
      });
    },
    [
      selectedMonth,
      selectedYear,
      filterTransactionsByMonth,
      parseTransactionDate,
      getCategoryColor,
      formatCategoryFromHook,
    ]
  );

  // Keep ref updated with latest processTransactionsData function
  // This allows the event listener to always use the latest version without re-subscribing
  useEffect(() => {
    processTransactionsDataRef.current = processTransactionsData;
  }, [processTransactionsData]);

  // Generate available months when transactions change
  useEffect(() => {
    if (transactions.length > 0) {
      const months = generateAvailableMonths(transactions);
      setAvailableMonths(months);

      // If current selected month is not in available months, default to most recent month
      if (months.length > 0) {
        const currentSelectedExists = months.some(
          (m) => m.month === selectedMonth && m.year === selectedYear
        );
        if (!currentSelectedExists) {
          // Default to most recent month (first in array)
          setSelectedMonth(months[0].month);
          setSelectedYear(months[0].year);
        }
      }
    }
  }, [transactions, generateAvailableMonths, selectedMonth, selectedYear]);

  // Handle month selection
  const handleMonthSelect = useCallback((month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  }, []);

  // Reprocess transactions when selected month/year changes
  useEffect(() => {
    if (transactions.length > 0) {
      processTransactionsData(transactions, selectedMonth, selectedYear);
    }
  }, [selectedMonth, selectedYear, transactions, processTransactionsData]);

  // Helper to get display date from transaction (uses authorized_date if available)
  const getTransactionDisplayDate = (tx: Transaction): string => {
    return tx.authorized_date || tx.date;
  };

  const formatDate = (dateStr: string) => {
    // Parse date string directly to avoid timezone shifts
    // dateStr format: "YYYY-MM-DD"
    const parts = dateStr.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parseInt(parts[2], 10);

    // Create date in local timezone
    const date = new Date(year, month, day);

    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return date.toLocaleDateString("en-US", options);
  };

  // Format transaction date using display date (authorized_date if available)
  const formatTransactionDate = (tx: Transaction): string => {
    return formatDate(getTransactionDisplayDate(tx));
  };

  // Helper function to get filter description
  const getFilterDescription = () => {
    const accountIds = filterOptions.accountIds || [];
    const accountName =
      accountIds.length === 0
        ? "All Accounts"
        : accountIds.length === 1
        ? accounts.find((acc) => acc.account_id === accountIds[0])
            ?.institution_name || "Selected Account"
        : `${accountIds.length} accounts`;

    // Helper function to format month-year period IDs
    const formatTimePeriodName = (timePeriod: string): string => {
      const quickPeriods: { [key: string]: string } = {
        all: "All",
        "7days": "7 days",
        "30days": "30 days",
        "3months": "3 months",
        "6months": "6 months",
        "12months": "12 months",
      };

      if (quickPeriods[timePeriod]) {
        return quickPeriods[timePeriod];
      }

      // Handle month-year format (e.g., "january2024" -> "Jan 2024")
      const monthYearMatch = timePeriod.match(
        /^(january|february|march|april|may|june|july|august|september|october|november|december)(\d{4})$/i
      );
      if (monthYearMatch) {
        const monthName = monthYearMatch[1].toLowerCase();
        const year = monthYearMatch[2];

        const monthAbbrev: { [key: string]: string } = {
          january: "Jan",
          february: "Feb",
          march: "Mar",
          april: "Apr",
          may: "May",
          june: "Jun",
          july: "Jul",
          august: "Aug",
          september: "Sep",
          october: "Oct",
          november: "Nov",
          december: "Dec",
        };

        return `${monthAbbrev[monthName] || monthName} ${year}`;
      }

      return "7 days"; // Default fallback
    };

    const timePeriodName = formatTimePeriodName(filterOptions.timePeriod);

    const categoryIds = filterOptions.categoryIds || [];
    const categoryName =
      categoryIds.length === 0
        ? "All Categories"
        : categoryIds.length === 1
        ? "1 category"
        : `${categoryIds.length} categories`;

    return `${accountName} • ${timePeriodName} • ${categoryName}`;
  };

  const onRefresh = async () => {
    if (!hasData.current) return;
    setRefreshing(true);
    try {
      // Clear cache when refreshing
      clearCache();
      await clearTransactionsCache();
      await clearSpendingCache();
      await fetchFreshData();
      // Only reload filtered transactions if on Transactions section
      if (activeSection === "transactions") {
        await loadFilteredTransactions(filterOptions, true, searchQuery);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Removed hardcoded getCategoryIcon - now using database version from useCategories hook

  const handleCategoryPress = (
    category: string,
    data: { amount: number; percentage: number; color: string }
  ) => {
    setSelectedCategoryDetail({ category, data });
    setShowCategoryDetail(true);
  };

  // Handle transaction click - show transaction detail modal
  const handleTransactionPress = (transaction: Transaction) => {
    // This is now handled by the TransactionsSection component itself
    // No navigation needed - pure modal approach
  };

  // Handle smooth section transitions
  const handleSectionChange = (
    newSection: "cashflow" | "spending" | "transactions" | "recurring"
  ) => {
    if (newSection === activeSection) return;

    // Track user behavior
    setUserBehavior((prev) => ({
      sectionVisits: {
        ...prev.sectionVisits,
        [newSection]: (prev.sectionVisits[newSection] || 0) + 1,
      },
      lastVisited: newSection,
      visitOrder: [...prev.visitOrder, newSection].slice(-5), // Keep last 5 visits
    }));

    // Fade out current content
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      // Change section
      setActiveSection(newSection);

      // Fade in new content
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });

    // Light haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Load investment data with AsyncStorage cache
  const loadInvestmentData = async () => {
    try {
      logger.info("Insights: Loading investment data...");

      // First, try to load from cache
      const cachedData = await loadInvestmentFromCache();
      if (cachedData) {
        logger.info("📦 Using cached investment data");
        setInvestmentHoldings(cachedData.holdings);
        setInvestmentOptions(cachedData.options);
        setInvestmentBalances(cachedData.balances);
        setInvestmentConnections(cachedData.connections);

        // Load fresh data in background and update cache (no loading state)
        // But don't await it - let it update the state when it completes
        loadInvestmentDataFromDB().catch((err) =>
          logger.error("Background investment data refresh failed:", err)
        );
        return true;
      }

      // No cache available, load from database
      return await loadInvestmentDataFromDB();
    } catch (err) {
      logger.error("Failed to load investment data:", err);
      return false;
    }
  };

  // Load investment data from database and update cache
  const loadInvestmentDataFromDB = async () => {
    try {
      logger.info("Insights: Loading investment data from Supabase...");

      const userId = await getUserId();
      if (!userId) {
        logger.error("No authenticated user loading investment data");
        return false;
      }

      const [holdings, options, balances, connections] = await Promise.all([
        getSnaptradeHoldingsFromDB(),
        getSnaptradeOptionsFromDB(),
        getSnaptradeBalancesFromDB(),
        getSnaptradeConnectionsFromDB(),
      ]);

      const hasAnyData =
        (holdings && holdings.length > 0) ||
        (options && options.length > 0) ||
        (balances && balances.length > 0) ||
        (connections && connections.length > 0);

      const investmentData = {
        holdings: holdings || [],
        options: options || [],
        balances: balances || [],
        connections: connections || [],
      };

      if (hasAnyData) {
        logger.info(
          `Insights: Loaded investment data from Supabase - Holdings: ${
            holdings?.length || 0
          }, Options: ${options?.length || 0}, Balances: ${
            balances?.length || 0
          }, Connections: ${connections?.length || 0}`
        );
        setInvestmentHoldings(investmentData.holdings);
        setInvestmentOptions(investmentData.options);
        setInvestmentBalances(investmentData.balances);
        setInvestmentConnections(investmentData.connections);

        // Save to cache for future use
        await saveInvestmentToCache(investmentData);
        return true;
      }

      logger.info("Insights: No investment data found");
      setInvestmentHoldings([]);
      setInvestmentOptions([]);
      setInvestmentBalances([]);
      setInvestmentConnections([]);

      // Save empty data to cache to avoid repeated DB calls
      await saveInvestmentToCache(investmentData);
      return false;
    } catch (err) {
      logger.error("Failed to load investment data:", err);
      return false;
    }
  };

  // Check for re-auth needs (both database flags and API errors)
  const checkForReAuthNeeds = async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;

      const { data: userItems, error } = await supabase
        .from("user_items")
        .select(
          "item_id, has_new_accounts, requires_update_mode, institution_name"
        )
        .eq("user_id", userId);

      if (error) {
        logger.error("Error checking update flags:", error);
        return;
      }

      const reAuthNeeded: Array<{
        item_id: string;
        institution_name: string;
        dismissed: boolean;
      }> = [];

      // Check for items requiring re-auth or new accounts
      for (const item of userItems || []) {
        if (item.requires_update_mode) {
          reAuthNeeded.push({
            item_id: item.item_id,
            institution_name: item.institution_name || "Unknown Bank",
            dismissed: false,
          });
        }

        // Still handle new accounts via modal (less urgent)
        if (item.has_new_accounts && reAuthNeeded.length === 0) {
          setUpdateModalInfo({
            type: "new_accounts",
            message: `New accounts are available for ${
              item.institution_name || "your bank"
            }. Would you like to add them?`,
            item_id: item.item_id,
          });
          setShowUpdateModal(true);
        }
      }

      setReAuthItems(reAuthNeeded);
    } catch (error) {
      logger.error("Error checking re-auth needs:", error);
    }
  };

  // Debug function to diagnose database state
  const debugDatabaseState = async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;

      // 1. Check all user items
      const { data: userItems, error: itemsError } = await supabase
        .from("user_items")
        .select("*")
        .eq("user_id", userId);

      if (itemsError) {
        logger.error("❌ Error fetching user items:", itemsError);
        return;
      }

      // 2. Check accounts for each item
      for (const item of userItems || []) {
        const { data: accounts, error: accountsError } = await supabase
          .from("accounts")
          .select("*")
          .eq("item_id", item.item_id);

        if (accountsError) {
          logger.error(
            `❌ Error fetching accounts for ${item.institution_name}:`,
            accountsError
          );
          continue;
        }
      }

      // 3. Check if there's any item_id mismatch
      const allItems = userItems?.map((i) => i.item_id) || [];
    } catch (error) {
      logger.error("❌ Debug database state error:", error);
    }
  };

  // Load recurring transactions with AsyncStorage cache
  const loadRecurringTransactions = async () => {
    try {
      logger.info("🔄 Loading recurring transactions...");

      // First, try to load from cache
      const cachedData = await loadRecurringFromCache();
      if (cachedData) {
        logger.info("📦 Using cached recurring transactions data");
        setRecurringData(cachedData);

        // Load fresh data in background and update cache (no loading state)
        loadRecurringTransactionsFromDB();
        return;
      }

      // No cache available, show loading state and load from database
      setRecurringLoading(true);
      await loadRecurringTransactionsFromDB();
    } catch (error) {
      logger.error("❌ Error loading recurring transactions:", error);
      // Set empty data on error
      setRecurringData({
        subscriptions: [],
        income: [],
        bills: [],
        other: [],
        summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 },
      });
    } finally {
      setRecurringLoading(false);
    }
  };

  // Load recurring transactions from database and update cache
  const loadRecurringTransactionsFromDB = async () => {
    try {
      logger.info("🔄 Loading recurring transactions from database...");

      const data = await getAllRecurringTransactions();
      setRecurringData(data);

      // Save to cache for future use
      await saveRecurringToCache(data);

      logger.info(
        "✅ Recurring transactions loaded from database:",
        data.summary
      );
    } catch (error) {
      logger.error(
        "❌ Error loading recurring transactions from database:",
        error
      );
    }
  };

  // Keep ref updated with latest loadRecurringTransactions function
  // This allows the event listener to always use the latest version without re-subscribing
  useEffect(() => {
    loadRecurringTransactionsRef.current = loadRecurringTransactions;
  }, [loadRecurringTransactions]);

  // Handle re-auth banner actions - Complete flow: Re-auth → Sync → Update UI
  const handleReAuth = async (item_id: string) => {
    try {
      logger.info(
        "🔐 RE-AUTH FLOW: Starting re-authentication for item:",
        item_id
      );

      // Step 1: Re-authenticate with Plaid
      const linkToken = await getUpdateLinkToken(item_id);
      await openPlaidLink(linkToken);
      logger.info("✅ Re-authentication successful");

      // Step 2: Clear re-auth flags in database
      await supabase
        .from("user_items")
        .update({
          requires_update_mode: false,
          last_synced_at: new Date().toISOString(),
        })
        .eq("item_id", item_id);

      // Step 3: Remove from banner list (optimistic update)
      setReAuthItems((prev) => prev.filter((item) => item.item_id !== item_id));

      logger.info("🔄 POST RE-AUTH: Comprehensive data refresh...");

      // Step 4: Comprehensive data refresh
      // 4a. Refresh both balances and transactions from Plaid
      await refreshBothBalancesAndTransactions(item_id);

      // 4b. Sync all transactions
      await syncAllUserTransactions();

      // Step 5: Refresh UI from database (the single source of truth)
      await fetchFreshData();
      await loadFilteredTransactions(filterOptions, true);
      await loadRecurringTransactions();
      await loadInvestmentData();

      logger.info(
        "✅ RE-AUTH COMPLETE: All data synced and UI updated from database"
      );
    } catch (error) {
      logger.error("❌ Re-auth flow failed:", error);

      // On error, try to at least refresh UI from existing database data
      try {
        await fetchFreshData();
        await loadFilteredTransactions(filterOptions, true, searchQuery);
        await loadInvestmentData();
      } catch (fallbackError) {
        logger.error("❌ Fallback data refresh also failed:", fallbackError);
      }
    }
  };

  // Dismiss re-auth banner
  const dismissReAuthBanner = (item_id: string) => {
    setReAuthItems((prev) =>
      prev.map((item) =>
        item.item_id === item_id ? { ...item, dismissed: true } : item
      )
    );
  };

  // Handle API errors that indicate re-auth needed
  const handleApiReAuthError = (item_id: string, institution_name: string) => {
    setReAuthItems((prev) => {
      const exists = prev.find((item) => item.item_id === item_id);
      if (exists) return prev;

      return [
        ...prev,
        {
          item_id,
          institution_name: institution_name || "Unknown Bank",
          dismissed: false,
        },
      ];
    });
  };

  // 🔄 MANUAL REFRESH: Sync existing data from Supabase cursors
  const handleManualRefresh = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setRefreshStatus({ type: "manual", message: "Syncing existing data..." });

    try {
      logger.info("🔄 MANUAL REFRESH: Syncing from stored cursors...");

      const userId = await getUserId();
      if (!userId) {
        logger.error("❌ No authenticated user in refresh");
        setRefreshStatus({ type: "manual", message: "Authentication error" });
        return;
      }

      // Clear cache before syncing
      clearCache();
      await clearRecurringCache();
      await clearInvestmentCache();
      await clearTransactionsCache();
      await clearSpendingCache();

      setRefreshStatus({
        type: "manual",
        message: "Syncing transactions from Plaid...",
      });
      logger.info("🔄 MANUAL REFRESH: Calling syncAllUserTransactions()...");
      const syncResult = await syncAllUserTransactions();
      logger.info(
        "📦 MANUAL REFRESH syncAllUserTransactions result:",
        syncResult
      );

      setRefreshStatus({ type: "manual", message: "Updating interface..." });
      // Reload data after sync (UI reads from Supabase)
      await fetchFreshData();
      await loadFilteredTransactions(filterOptions, true);
      await loadRecurringTransactions();
      await loadInvestmentData();

      setRefreshStatus({ type: "manual", message: "Sync completed!" });
      logger.info(
        "✅ MANUAL REFRESH COMPLETE: Data synced from cursors → UI updated"
      );

      // Clear success message
      setTimeout(() => {
        setRefreshStatus({ type: null, message: "" });
      }, 3000);
    } catch (error) {
      logger.error("❌ Manual refresh failed:", error);
      setRefreshStatus({ type: "manual", message: "Sync failed" });

      setTimeout(() => {
        setRefreshStatus({ type: null, message: "" });
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // 🔧 CATEGORY FIX: Full resync to fix category issues
  const handleFullResync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setRefreshStatus({
      type: "category_fix",
      message: "Fixing transaction categories...",
    });

    try {
      logger.info("🔧 CATEGORY FIX: Starting full resync...");

      const userId = await getUserId();
      if (!userId) {
        logger.error("❌ No authenticated user in full resync");
        setRefreshStatus({
          type: "category_fix",
          message: "Authentication error",
        });
        return;
      }

      // Force full resync by resetting cursors
      setRefreshStatus({
        type: "category_fix",
        message: "Resetting sync cursors...",
      });
      const success = await forceFullResync(userId);

      if (!success) {
        logger.error("❌ Failed to reset cursors for full resync");
        setRefreshStatus({
          type: "category_fix",
          message: "Failed to reset cursors",
        });
        return;
      }

      // Clear cache before syncing
      clearCache();
      await clearRecurringCache();
      await clearInvestmentCache();
      await clearTransactionsCache();
      await clearSpendingCache();

      setRefreshStatus({
        type: "category_fix",
        message: "Re-syncing all transactions...",
      });
      // Now sync with reset cursors (will get ALL transactions fresh)
      await syncAllUserTransactions();

      setRefreshStatus({
        type: "category_fix",
        message: "Updating interface...",
      });
      // Reload data (UI reads from Supabase)
      await fetchFreshData();
      await loadFilteredTransactions(filterOptions, true);
      await loadRecurringTransactions();
      await loadInvestmentData();

      setRefreshStatus({ type: "category_fix", message: "Categories fixed!" });
      logger.info(
        "✅ CATEGORY FIX COMPLETE: All transactions re-synced → UI updated"
      );

      // Clear success message
      setTimeout(() => {
        setRefreshStatus({ type: null, message: "" });
      }, 3000);
    } catch (error) {
      logger.error("❌ Full resync failed:", error);
      setRefreshStatus({
        type: "category_fix",
        message: "Category fix failed",
      });

      setTimeout(() => {
        setRefreshStatus({ type: null, message: "" });
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // 🌟 CLOUD REFRESH: The primary data refresh flow (Plaid → Supabase → UI)
  const handleRefreshLatestData = async () => {
    if (isSyncing) return;

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
        result.results.forEach((res: any) => {
          if (!res.success && res.error?.includes("re-authentication")) {
            handleApiReAuthError(res.item_id, res.institution_name);
          }
        });
      }

      logger.info("✅ Combined refresh completed:", result.message);

      // Step 3: Sync transactions to Supabase
      setRefreshStatus({
        type: "cloud",
        message: "Syncing transactions to database...",
      });
      logger.info("🔄 Step 3: Calling syncAllUserTransactions()...");
      const syncResult = await syncAllUserTransactions();
      logger.info("📦 syncAllUserTransactions result:", syncResult);

      // Step 4: Refresh recurring transactions
      setRefreshStatus({
        type: "cloud",
        message: "Analyzing recurring transactions...",
      });
      logger.info("🔄 Step 4: Calling refreshRecurringTransactions()...");
      const recurringResult = await refreshRecurringTransactions();
      logger.info("📦 refreshRecurringTransactions result:", recurringResult);

      // Clear caches since we have fresh data
      await clearRecurringCache();
      await clearInvestmentCache();
      await clearTransactionsCache();
      await clearSpendingCache();

      // Step 5: Refresh UI from Supabase (single source of truth)
      setRefreshStatus({ type: "cloud", message: "Updating interface..." });
      await fetchFreshData();
      await loadFilteredTransactions(filterOptions, true);
      await loadRecurringTransactions();
      await loadInvestmentData();

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
        await fetchFreshData();
        await loadFilteredTransactions(filterOptions, true, searchQuery);
        await loadRecurringTransactions();
        await loadInvestmentData();
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

  // Handle update mode flow
  const handleUpdateMode = async () => {
    if (!updateModalInfo) return;

    try {
      logger.info("🔄 Starting update mode for item:", updateModalInfo.item_id);

      // Get update link token
      const linkToken = await getUpdateLinkToken(updateModalInfo.item_id);

      // Open Plaid Link in update mode
      await openPlaidLink(linkToken);

      // Clear the flag after successful update
      await supabase
        .from("user_items")
        .update({
          has_new_accounts: false,
          requires_update_mode: false,
        })
        .eq("item_id", updateModalInfo.item_id);

      setShowUpdateModal(false);
      setUpdateModalInfo(null);

      // Refresh data after update
      await fetchFreshData();

      logger.info("✅ Update mode completed");
    } catch (error) {
      logger.error("❌ Update mode failed:", error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.titleContainer}>
          <View style={styles.iconContainer}>
            <Ionicons name="stats-chart" size={24} color="#4A90E2" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Insights</Text>
            <Text style={styles.headerSubtitle}>Your Financial Analytics</Text>
          </View>
        </View>

        {/* Header Refresh Icons */}
        <View style={headerRefreshStyles.container}>
          <TouchableOpacity
            style={[
              headerRefreshStyles.iconButton,
              isSyncing && headerRefreshStyles.iconButtonDisabled,
            ]}
            onPress={handleRefreshLatestData}
            disabled={isSyncing}
          >
            <Ionicons
              name={isSyncing ? "hourglass-outline" : "cloud-download-outline"}
              size={18}
              color="#4A90E2"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              headerRefreshStyles.iconButton,
              isSyncing && headerRefreshStyles.iconButtonDisabled,
            ]}
            onPress={handleFullResync}
            disabled={isSyncing}
          >
            <Ionicons
              name={isSyncing ? "hourglass-outline" : "sync-outline"}
              size={18}
              color="#4A90E2"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              headerRefreshStyles.iconButton,
              isSyncing && headerRefreshStyles.iconButtonDisabled,
            ]}
            onPress={handleManualRefresh}
            disabled={isSyncing}
          >
            <Ionicons
              name={isSyncing ? "hourglass-outline" : "refresh-outline"}
              size={18}
              color="#4A90E2"
            />
          </TouchableOpacity>

          {/* Sync Status Indicator */}
          {syncStatus.lastSync && (
            <TouchableOpacity
              style={headerRefreshStyles.syncStatusButton}
              onPress={() => {
                // Show sync status details
                Alert.alert(
                  "Sync Status",
                  `Last sync: ${syncStatus.lastSync}\nNext sync: ${syncStatus.nextSync}\n\nData syncs automatically every day at 8 AM ET.`,
                  [{ text: "OK" }]
                );
              }}
            >
              <Ionicons
                name={syncStatus.isAutomated ? "time-outline" : "sync-outline"}
                size={16}
                color="#4CAF50"
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Render chips immediately so first paint is instant */}
      <TopChips
        activeSection={activeSection as any}
        onChange={handleSectionChange as any}
      />

      {isInitialLoad && !hasCachedData.current ? (
        <InsightsLoadingSkeleton />
      ) : (
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4A90E2"
              colors={["#4A90E2"]}
              progressBackgroundColor="#1f1f1f"
            />
          }
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } =
              event.nativeEvent;
            scrollOffsetRef.current = contentOffset.y;
            contentHeightRef.current = contentSize.height;
            scrollViewHeightRef.current = layoutMeasurement.height;

            // Detect if user is near bottom (within 300px)
            const distanceFromBottom =
              contentSize.height - (contentOffset.y + layoutMeasurement.height);
            const nearBottom = distanceFromBottom < 300;

            setIsNearBottom(nearBottom);

            // Auto-load when near bottom and has more transactions
            // Add debounce to prevent multiple simultaneous loads
            const now = Date.now();
            if (
              nearBottom &&
              hasMoreTransactions &&
              !loadingMore &&
              activeSection === "transactions" &&
              filteredTransactions.length > 0 &&
              now - lastLoadTriggerRef.current > 1000 // Debounce: wait 1 second between loads
            ) {
              lastLoadTriggerRef.current = now;
              loadMoreTransactions();
            }
          }}
          scrollEventThrottle={400}
          onContentSizeChange={(contentWidth, contentHeight) => {
            contentHeightRef.current = contentHeight;
          }}
          onLayout={(event) => {
            scrollViewHeightRef.current = event.nativeEvent.layout.height;
          }}
        >
          {isLoading && !hasData.current && (
            <LoadingIndicator
              message="Loading your financial insights..."
              style={{ marginTop: 20 }}
            />
          )}

          {(!isLoading || hasData.current) && (
            <>
              {/* Refresh Status Indicator */}
              {refreshStatus.type && (
                <RefreshStatus
                  message={refreshStatus.message}
                  type={
                    refreshStatus.type === "cloud"
                      ? "loading"
                      : refreshStatus.type === "manual"
                      ? "info"
                      : refreshStatus.type === "category_fix"
                      ? "loading"
                      : "info"
                  }
                />
              )}

              {/* Re-auth banners */}
              {reAuthItems
                .filter((item) => !item.dismissed)
                .map((item) => (
                  <ReAuthBanner
                    key={item.item_id}
                    institutionName={item.institution_name}
                    onReAuth={() => handleReAuth(item.item_id)}
                    onDismiss={() => dismissReAuthBanner(item.item_id)}
                  />
                ))}

              {/* Cash Flow Section */}
              {activeSection === "cashflow" && (
                <Animated.View
                  style={[
                    sectionContentStyles.container,
                    {
                      opacity: fadeAnim,
                      ...(sectionAnimations?.cashflow
                        ? InsightsAnimationManager.getInterpolatedStyles(
                            sectionAnimations.cashflow
                          )
                        : {}),
                    },
                  ]}
                >
                  <CashFlowSection />
                </Animated.View>
              )}

              {/* Spending Section */}
              {activeSection === "spending" && (
                <Animated.View
                  style={[
                    sectionContentStyles.container,
                    {
                      opacity: fadeAnim,
                      ...(sectionAnimations?.spending
                        ? InsightsAnimationManager.getInterpolatedStyles(
                            sectionAnimations.spending
                          )
                        : {}),
                    },
                  ]}
                >
                  <SpendingSection
                    titleStyle={styles.sectionLabel}
                    categoryBreakdown={categoryBreakdown}
                    onCategoryPress={handleCategoryPress}
                    formatCategoryName={formatCategoryFromHook}
                    availableMonths={availableMonths}
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    onMonthSelect={handleMonthSelect}
                    onBudgetModeChange={setIsBudgetMode}
                    onOpenAddCategoryModalRef={(openFn) =>
                      setOpenAddCategoryModal(() => openFn)
                    }
                  />
                </Animated.View>
              )}

              {/* Transactions Section */}
              {activeSection === "transactions" && (
                <Animated.View
                  style={[
                    sectionContentStyles.container,
                    {
                      opacity: fadeAnim,
                      ...(sectionAnimations?.transactions
                        ? InsightsAnimationManager.getInterpolatedStyles(
                            sectionAnimations.transactions
                          )
                        : {}),
                    },
                  ]}
                >
                  <TransactionsSection
                    key="transactions-section"
                    titleStyle={styles.sectionLabel}
                    sectionHeaderStyle={styles.sectionHeader}
                    headerButtonsContainerStyle={styles.headerButtonsContainer}
                    refreshAccountsButtonStyle={styles.refreshAccountsButton}
                    filterButtonStyle={styles.filterButton}
                    filterButtonTextStyle={styles.filterButtonText}
                    dropdownArrowStyle={styles.dropdownArrow}
                    transactionInfoContainerStyle={
                      transactionInfoStyles.container
                    }
                    transactionInfoTextStyle={transactionInfoStyles.text}
                    loadMoreStyles={loadMoreStyles as any}
                    filteredTransactions={filteredTransactions}
                    totalFilteredCount={totalFilteredCount}
                    hasMoreTransactions={hasMoreTransactions}
                    loadingMore={loadingMore}
                    onPressLoadMore={loadMoreTransactions}
                    onPressRefreshAccounts={() => loadUserAccounts(true)}
                    onPressOpenFilter={() => setShowEnhancedFilterModal(true)}
                    getFilterDescription={getFilterDescription}
                    onPressTransaction={handleTransactionPress}
                    showTransactionDetail={(transactionId: string) => {
                      // Modal is handled internally by TransactionsSection
                    }}
                    formatDate={formatDate}
                    formatCategoryName={formatCategoryFromHook}
                    onAddAccount={() => setShowCategoryModal(true)}
                    hasAccounts={accounts.length > 0}
                    isLoadingTransactions={
                      isLoading && activeSection === "transactions"
                    }
                    mightHaveTransactions={mightHaveTransactions}
                    accounts={accounts}
                    filterOptions={filterOptions}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    isSearching={isSearching}
                  />
                </Animated.View>
              )}

              {/* Recurring Section */}
              {activeSection === "recurring" && (
                <Animated.View
                  style={[
                    sectionContentStyles.container,
                    {
                      opacity: fadeAnim,
                      ...(sectionAnimations?.recurring
                        ? InsightsAnimationManager.getInterpolatedStyles(
                            sectionAnimations.recurring
                          )
                        : {}),
                    },
                  ]}
                >
                  <RecurringSection
                    recurringData={recurringData}
                    isLoading={recurringLoading}
                    titleStyle={styles.sectionLabel}
                  />
                </Animated.View>
              )}

              {/* Investments Section */}
              {activeSection === "investments" && (
                <Animated.View
                  style={[
                    sectionContentStyles.container,
                    {
                      opacity: fadeAnim,
                      ...(sectionAnimations?.investments
                        ? InsightsAnimationManager.getInterpolatedStyles(
                            sectionAnimations.investments
                          )
                        : {}),
                    },
                  ]}
                >
                  <InvestmentsScreen
                    preloadedData={{
                      holdings: investmentHoldings,
                      options: investmentOptions,
                      balances: investmentBalances,
                      connections: investmentConnections,
                    }}
                  />
                </Animated.View>
              )}
            </>
          )}

          <EnhancedFilterModal
            key="enhanced-filter-modal"
            visible={showEnhancedFilterModal}
            onClose={() => setShowEnhancedFilterModal(false)}
            accounts={accounts}
            selectedFilters={filterOptions}
            onFiltersChange={(newFilters) => {
              // Clear cache when filters change to ensure fresh data
              clearCache();
              setFilterOptions(newFilters);
            }}
          />

          {selectedCategoryDetail && (
            <CategoryDetailModal
              key="category-detail-modal"
              visible={showCategoryDetail}
              onClose={() => setShowCategoryDetail(false)}
              category={selectedCategoryDetail.category}
              data={selectedCategoryDetail.data}
              transactions={currentMonthTransactions}
              formatCategoryName={formatCategoryFromHook}
              formatDate={formatDate}
            />
          )}

          {/* Category Selection Modal */}
          <CategorySelectionModal
            visible={showCategoryModal}
            onClose={() => setShowCategoryModal(false)}
            onCategorySelect={(category) => {
              setShowCategoryModal(false);
              if (category === "cash_deposit") {
                setShowCashModal(true);
              } else if (category === "liabilities") {
                setShowCreditModal(true);
              } else if (category === "investments") {
                setShowInvestmentModal(true);
              } else if (category === "retirement") {
                setShowInvestmentModal(true);
              }
            }}
          />

          {/* Cash Deposit Institution Modal */}
          <CashDepositInstitutionModal
            visible={showCashModal}
            onClose={() => setShowCashModal(false)}
            onInstitutionSelect={async (institutionId) => {
              logger.info("Cash deposit institution selected:", institutionId);
              try {
                await addNewBankAccount(
                  async (itemId) => {
                    logger.info("Successfully added new cash account:", itemId);
                    await fetchFreshData();
                    await loadFilteredTransactions(
                      filterOptions,
                      true,
                      searchQuery
                    );
                  },
                  (error) => {
                    logger.error("Failed to add new cash account:", error);
                  }
                );
              } catch (error) {
                logger.error("Error adding cash account:", error);
              }
            }}
          />

          {/* Credit Card Institution Modal */}
          <CreditCardInstitutionModal
            visible={showCreditModal}
            onClose={() => setShowCreditModal(false)}
            onInstitutionSelect={async (institutionId) => {
              logger.info("Credit card institution selected:", institutionId);
              try {
                await addNewBankAccount(
                  async (itemId) => {
                    logger.info(
                      "Successfully added new credit card account:",
                      itemId
                    );
                    await fetchFreshData();
                    await loadFilteredTransactions(
                      filterOptions,
                      true,
                      searchQuery
                    );
                  },
                  (error) => {
                    logger.error(
                      "Failed to add new credit card account:",
                      error
                    );
                  }
                );
              } catch (error) {
                logger.error("Error adding credit card account:", error);
              }
            }}
          />

          {/* Investment Institution Modal */}
          <InstitutionSelectionModal
            visible={showInvestmentModal}
            onClose={() => setShowInvestmentModal(false)}
            onInstitutionSelect={async (institutionId) => {
              logger.info("Investment institution selected:", institutionId);
              // Investment institutions are handled by the InstitutionSelectionModal itself
              // which calls the Snaptrade connection logic
            }}
          />
        </ScrollView>
      )}

      {/* Floating Action Button for Adding Category - Fixed to screen, only visible in budget mode */}
      {isBudgetMode && activeSection === "spending" && openAddCategoryModal && (
        <View style={fabStyles.container}>
          <TouchableOpacity
            onPress={openAddCategoryModal}
            style={fabStyles.addButton}
            activeOpacity={0.8}
          >
            <Ionicons name="add-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Update Mode Notification Modal */}
      <Modal
        visible={showUpdateModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUpdateModal(false)}
      >
        <View style={updateModalStyles.overlay}>
          <View style={updateModalStyles.container}>
            <View style={updateModalStyles.iconContainer}>
              <Ionicons
                key={updateModalInfo?.type || "default"}
                name={
                  updateModalInfo?.type === "new_accounts"
                    ? "add-circle-outline"
                    : "warning-outline"
                }
                size={32}
                color={
                  updateModalInfo?.type === "new_accounts"
                    ? "#4CAF50"
                    : "#FF9500"
                }
              />
            </View>

            <Text style={updateModalStyles.title}>
              {updateModalInfo?.type === "new_accounts"
                ? "New Accounts Available"
                : "Authentication Required"}
            </Text>

            <Text style={updateModalStyles.message}>
              {updateModalInfo?.message}
            </Text>

            <View style={updateModalStyles.buttonContainer}>
              <TouchableOpacity
                style={[
                  updateModalStyles.button,
                  updateModalStyles.cancelButton,
                ]}
                onPress={() => setShowUpdateModal(false)}
              >
                <Text style={updateModalStyles.cancelButtonText}>Later</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  updateModalStyles.button,
                  updateModalStyles.updateButton,
                ]}
                onPress={handleUpdateMode}
              >
                <Text style={updateModalStyles.updateButtonText}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
