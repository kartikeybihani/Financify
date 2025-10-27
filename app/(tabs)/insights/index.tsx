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
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  DeviceEventEmitter,
  RefreshControl,
  Animated,
  Platform,
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
} from "./insightsStyles";
import CategoryDetailModal from "@/src/components/insights/CategoryDetailModal";
import EnhancedFilterModal, {
  FilterOptions,
  Account,
} from "@/src/components/EnhancedFilterModal";
import ReAuthBanner from "@/src/components/ui/ReAuthBanner";
import InsightsLoadingSkeleton from "@/src/components/insights/InsightsLoadingSkeleton";
import SpendingSection from "@/src/components/insights/components/SpendingSection";
import TransactionsSection from "@/src/components/insights/components/TransactionsSection";
import CashFlowSection from "@/src/components/insights/components/CashFlowSection";
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
} from "@/src/utils/plaid";
import {
  getSnaptradeHoldingsFromDB,
  getSnaptradeOptionsFromDB,
  getSnaptradeBalancesFromDB,
  getSnaptradeConnectionsFromDB,
} from "@/src/utils/snaptrade";
import { forceFullResync } from "@/src/utils/categoryFix";
import logger from "@/src/utils/logger";
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

  // Use the categories hook for database-driven categories
  const {
    categories: dbCategories,
    getCategoryColor,
    formatCategoryName: formatCategoryFromHook,
    getCategoryIcon,
  } = useCategories();
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
  const hasData = useRef(false);
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
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    accountIds: [],
    categoryIds: [],
    timePeriod: "30days",
  });
  const [filteredTransactions, setFilteredTransactions] = useState<
    Transaction[]
  >([]);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);

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

  // Listen for transaction category updates
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "transactionCategoryUpdated",
      (data) => {
        console.log("🔄 Transaction category updated:", data);

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

            return updatedTransactions;
          });
        } else {
          console.log(
            "⚠️ No affected transactions found, falling back to full refresh"
          );
          // Fallback: refresh all data if no specific transactions provided
          loadData();
        }
      }
    );

    return () => subscription.remove();
  }, []);

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
        await loadFilteredTransactions(filterOptions, true);
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

  // Load cached data immediately on mount to prevent flinching
  useEffect(() => {
    const loadCachedData = async () => {
      try {
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

  // Initialize minimal data on mount: recent transactions + accounts only
  useEffect(() => {
    const initializeScreen = async () => {
      setIsInitialLoad(true);

      try {
        const hasStoredData = await loadData();
        // Load accounts for filter modal (non-blocking for first paint)
        loadUserAccounts(false);
        // Load sync status
        loadSyncStatus();

        if (!hasStoredData) {
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

    initializeScreen();
  }, [getUserId]);

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
      loadFilteredTransactions(filterOptions, true);
    }
  }, [filterOptions, activeSection, showEnhancedFilterModal]);

  // Gate data loads by active section and trigger smart preloading
  useEffect(() => {
    if (activeSection === "transactions") {
      loadFilteredTransactions(filterOptions, true);
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
      logger.info("Insights: Loading data from Supabase...");

      const userId = await getUserId();
      if (!userId) {
        logger.error("No authenticated user");
        return false;
      }

      // Fetch recent transactions using the new plaid utils
      const transactions = await getRecentTransactions(userId, 100);

      if (transactions && transactions.length > 0) {
        logger.info(
          `Insights: Loaded ${transactions.length} transactions from Supabase`
        );

        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;
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
      setIsLoading(true);
      logger.info("Insights: Fetching fresh data from Supabase...");

      const userId = await getUserId();
      if (!userId) {
        logger.error("No authenticated user");
        return;
      }

      // Fetch latest transactions using the new plaid utils
      const transactions = await getRecentTransactions(userId, 100);

      if (transactions && transactions.length > 0) {
        logger.info(
          `Insights: Loaded ${transactions.length} fresh transactions`
        );
        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;
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
  };

  // Load filtered transactions with pagination and caching
  const loadFilteredTransactions = async (
    filters: FilterOptions,
    reset: boolean = false
  ) => {
    try {
      const userId = await getUserId();
      if (!userId) {
        logger.info("❌ No authenticated user loading filtered transactions");
        return;
      }

      const offset = reset ? 0 : filteredTransactions.length;
      const cacheKey = getCacheKey(filters, offset);

      // Check cache first (only for initial load, not pagination)
      if (reset) {
        const cached = getCachedData(getCacheKey(filters, 0));
        if (cached) {
          logger.info(`📦 Using cached data for filters: ${cacheKey}`);
          setFilteredTransactions(cached.transactions);
          setTotalFilteredCount(cached.count);
          setHasMoreTransactions(cached.transactions.length < cached.count);
          return;
        }
      }

      const limit = 50;

      // Get filtered transactions
      // logger.info(`🔍 Loading filtered transactions with:`, {
      //   accountIds: filters.accountIds,
      //   timePeriod: filters.timePeriod,
      //   categoryIds: filters.categoryIds,
      //   limit,
      //   offset,
      //   accountIdsLength: filters.accountIds?.length || 0,
      //   categoryIdsLength: filters.categoryIds?.length || 0,
      // });

      const newTransactions = await getFilteredTransactions(userId, {
        accountIds: filters.accountIds,
        timePeriod: filters.timePeriod,
        categoryIds: filters.categoryIds,
        limit,
        offset,
      });

      // logger.info(
      //   `📊 getFilteredTransactions returned ${newTransactions.length} transactions`
      // );

      // Get total count for pagination (only on initial load)
      let totalCount = totalFilteredCount;
      if (reset) {
        totalCount = await getFilteredTransactionsCount(userId, {
          accountIds: filters.accountIds,
          timePeriod: filters.timePeriod,
          categoryIds: filters.categoryIds,
        });
      }

      const updatedTransactions = reset
        ? newTransactions
        : [...filteredTransactions, ...newTransactions];

      if (reset) {
        setFilteredTransactions(updatedTransactions);
        setTotalFilteredCount(totalCount);

        // Cache the initial load
        setCachedData(getCacheKey(filters, 0), updatedTransactions, totalCount);
      } else {
        setFilteredTransactions(updatedTransactions);
      }

      setHasMoreTransactions(updatedTransactions.length < totalCount);

      logger.info(
        `📊 Loaded ${newTransactions.length} filtered transactions (${updatedTransactions.length}/${totalCount})`
      );
    } catch (error) {
      logger.error("❌ Error loading filtered transactions:", error);
    }
  };

  // Load more transactions for infinite scroll
  const loadMoreTransactions = async () => {
    if (loadingMore || !hasMoreTransactions) return;

    setLoadingMore(true);
    await loadFilteredTransactions(filterOptions, false);
    setLoadingMore(false);
  };

  // Listen for financial data updates
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      async (data) => {
        logger.info("🔄 Financial data refreshed event received");

        if (data && data.transactions) {
          setTransactions(data.transactions);
          processTransactionsData(data.transactions);
          hasData.current = true;
        }

        // Only refresh accounts if we're not in the middle of filtering
        if (!showEnhancedFilterModal) {
          await loadUserAccounts(true); // Debug when financial data changes
          await loadFilteredTransactions(filterOptions, true);

          // Clear caches since financial data has changed
          await clearRecurringCache();
          await clearInvestmentCache();
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
  }, [showEnhancedFilterModal]);

  // Memoized date calculations to avoid repeated Date object creation
  const currentDateInfo = useMemo(() => {
    const now = new Date();
    return {
      now,
      currentMonth: now.getMonth(),
      currentYear: now.getFullYear(),
    };
  }, []);

  // Memoized transaction processing to prevent expensive recomputations
  const processTransactionsData = useCallback(
    (transactionsData: Transaction[]) => {
      // Filter for current month expenses only
      const { now, currentMonth, currentYear } = currentDateInfo;

      const expenses = transactionsData.filter((tx) => tx.amount > 0);

      // Filter for current month (with fallback to most recent month if no current month data)
      let currentMonthExpenses = expenses.filter((tx) => {
        const txDate = new Date(tx.date);
        const isCurrentMonth =
          txDate.getMonth() === currentMonth &&
          txDate.getFullYear() === currentYear;
        return isCurrentMonth;
      });

      // If no current month data, use most recent month's data
      if (currentMonthExpenses.length === 0 && expenses.length > 0) {
        // Find the most recent month with data
        const mostRecentDate = new Date(expenses[0].date);
        const mostRecentMonth = mostRecentDate.getMonth();
        const mostRecentYear = mostRecentDate.getFullYear();

        currentMonthExpenses = expenses.filter((tx) => {
          const txDate = new Date(tx.date);
          return (
            txDate.getMonth() === mostRecentMonth &&
            txDate.getFullYear() === mostRecentYear
          );
        });
      }

      const totalSpent = currentMonthExpenses.reduce(
        (acc, tx) => acc + tx.amount,
        0
      );

      const categoriesObj: CategoryBreakdown = {};
      for (const tx of currentMonthExpenses) {
        // Prioritize new_category (user overrides), then fall back to top_category
        const category = tx.new_category || tx.top_category || "Other";

        if (!categoriesObj[category]) {
          categoriesObj[category] = {
            amount: 0,
            percentage: 0,
            color: getCategoryColor(category),
            hasRecurringTransactions: false,
          };
        }
        categoriesObj[category].amount += tx.amount;

        // Check if this transaction is recurring
        if (tx.if_recurring === "yes") {
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

      // Debug: Log all categories found
      console.log("🔍 DEBUG: All categories found in current month expenses:");
      console.log("Total categories:", filteredCategories.length);
      filteredCategories.forEach(([category, data], index) => {
        console.log(
          `${index + 1}. ${category}: $${data.amount.toFixed(
            2
          )} (${data.percentage.toFixed(1)}%)`
        );
      });

      setCategoryBreakdown(filteredCategories);

      // Store current month transactions for category detail modal
      setCurrentMonthTransactions(currentMonthExpenses);

      const uniqueCategories = [
        "All Categories",
        ...new Set(
          currentMonthExpenses.map(
            (tx) => tx.new_category || tx.top_category || "Other"
          )
        ),
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
    },
    [currentDateInfo]
  );

  const formatDate = (dateStr: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return new Date(dateStr).toLocaleDateString("en-US", options);
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

    const timePeriodMap: { [key: string]: string } = {
      all: "All",
      "7days": "7 days",
      "30days": "30 days",
      "3months": "3 months",
      "6months": "6 months",
      "12months": "12 months",
      december2024: "Dec 2024",
      november2024: "Nov 2024",
      october2024: "Oct 2024",
    };

    const timePeriodName = timePeriodMap[filterOptions.timePeriod] || "7 days";

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
      await fetchFreshData();
      // Only reload filtered transactions if on Transactions section
      if (activeSection === "transactions") {
        await loadFilteredTransactions(filterOptions, true);
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

      logger.info("🔍 DEBUG: Checking database state...");

      // 1. Check all user items
      const { data: userItems, error: itemsError } = await supabase
        .from("user_items")
        .select("*")
        .eq("user_id", userId);

      if (itemsError) {
        logger.error("❌ Error fetching user items:", itemsError);
        return;
      }

      logger.info(`🏦 DEBUG: Found ${userItems?.length || 0} user items:`);
      userItems?.forEach((item, idx) => {
        logger.info(
          `  ${idx + 1}. ${item.institution_name} (${
            item.item_id
          }) - Last synced: ${item.last_synced_at}`
        );
      });

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

        logger.info(
          `📊 DEBUG: ${item.institution_name} (${item.item_id}) has ${
            accounts?.length || 0
          } accounts:`
        );
        accounts?.forEach((acc, idx) => {
          logger.info(
            `    ${idx + 1}. ${acc.name} (${acc.account_id}) - ${acc.type}/${
              acc.subtype
            }`
          );
        });

        if (accounts?.length === 0) {
          logger.info(
            `⚠️  DEBUG: ${item.institution_name} has NO ACCOUNTS - this explains missing recurring transactions`
          );
        }
      }

      // 3. Check if there's any item_id mismatch
      const allItems = userItems?.map((i) => i.item_id) || [];
      logger.info("🔍 DEBUG: All item_ids:", allItems);
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
        await loadFilteredTransactions(filterOptions, true);
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
        await loadFilteredTransactions(filterOptions, true);
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

      {isInitialLoad ? (
        <InsightsLoadingSkeleton />
      ) : (
        <ScrollView
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
                    key={`transactions-${filteredTransactions.length}`}
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
            categories={dbCategories}
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
        </ScrollView>
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
