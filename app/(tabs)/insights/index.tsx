import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { router, useFocusEffect } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { styles } from "@/src/styles/insightsStyles";
import {
  headerRefreshStyles,
  transactionInfoStyles,
  loadMoreStyles,
  sectionContentStyles,
  fabStyles,
} from "@/src/styles/insightsStyles";
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
import AppStorage from "@/src/utils/storage/storage";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
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
  RefreshStatus as RefreshStatusComponent,
} from "@/src/shared/components/LoadingStates";
import {
  Transaction,
  RecurringStream,
  CategoryBreakdown,
  Insight,
} from "@/src/types/plaid";
import {
  InsightsSection,
  ReAuthItem,
  RecurringData,
  RefreshStatus,
  SyncStatus,
  CategoryDetailData,
  InitialCache,
} from "@/src/types/insights";
import {
  getUserIdSync,
  loadInitialCache,
  parseTransactionDate,
  formatDate,
  formatTransactionDate,
  getTransactionDisplayDate,
  generateAvailableMonths,
  filterTransactionsByMonth,
  getFilterDescription,
  handleRefreshLatestData,
  handleApiReAuthError,
  checkForReAuthNeeds,
  handleReAuth,
  dismissReAuthBanner,
} from "@/src/utils/insights";
import InsightsHeader from "@/src/components/insights/InsightsHeader";
import InsightsFAB from "@/src/components/insights/InsightsFAB";

export default function InsightsScreen() {
  // Get userId synchronously for initial cache load
  const initialUserId = getUserIdSync();

  // Load cache synchronously before first render (like unified hook does)
  const initialCache = loadInitialCache(initialUserId);

  const [transactions, setTransactions] = useState<Transaction[]>(
    initialCache.transactions,
  );
  const [realInsights, setRealInsights] = useState<Insight[]>([]);
  const [userId, setUserId] = useState<string | undefined>(
    initialUserId || undefined,
  );

  // Get userId asynchronously (for validation and fallback)
  const getUserId = useCallback(async (): Promise<string | null> => {
    if (userIdRef.current) {
      return userIdRef.current;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        userIdRef.current = user.id;
        return user.id;
      }
      return null;
    } catch (error) {
      logger.error("Error getting user ID:", error);
      return null;
    }
  }, []);

  // Fetch user ID on mount (for validation and fallback)
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);

          // If we loaded cache with a different userId, clear it
          if (initialUserId && initialUserId !== user.id) {
            logger.warn("🔒 [INSIGHTS] Cache userId mismatch, clearing cache");
            setTransactions([]);
            hasCachedData.current = false;
          } else if (initialCache.hasCache && !hasCachedData.current) {
            // Cache was loaded, mark it
            hasCachedData.current = true;
            hasData.current = true;
          }
        }
      } catch (error) {
        console.error("Error fetching user ID:", error);
      }
    };

    // Only fetch if we don't have userId from sync
    if (!initialUserId) {
      fetchUserId();
    } else {
      // Validate the sync userId is correct
      fetchUserId();
    }
  }, []);

  // Use the categories hook for database-driven categories
  // Pass userId to get user-specific categories
  const {
    categories: dbCategories,
    getCategoryColor,
    formatCategoryName: formatCategoryFromHook,
    getCategoryIcon,
    refreshCategories,
  } = useCategories(userId);
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    [
      string,
      {
        amount: number;
        percentage: number;
        color: string;
        hasRecurringTransactions: boolean;
      },
    ][]
  >([]);
  // If we loaded cache synchronously, we're not in initial load state
  const [isInitialLoad, setIsInitialLoad] = useState(!initialCache.hasCache);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCategoryDetail, setShowCategoryDetail] = useState(false);
  const [selectedCategoryDetail, setSelectedCategoryDetail] =
    useState<CategoryDetailData | null>(null);
  const [currentMonthTransactions, setCurrentMonthTransactions] = useState<
    Transaction[]
  >([]);
  const [categories, setCategories] = useState<string[]>(["All Categories"]);

  // Month selection state
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth(),
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [availableMonths, setAvailableMonths] = useState<MonthOption[]>([]);

  const hasData = useRef(false);
  const hasCachedData = useRef(false); // Track if we have cached data to avoid skeleton
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Re-auth banner state (handles both re-auth and new accounts)
  const [reAuthItems, setReAuthItems] = useState<ReAuthItem[]>([]);

  // Recurring transactions state
  const [recurringData, setRecurringData] = useState<RecurringData | null>(
    null,
  );
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>({
    type: null,
    message: "",
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSync: null,
    nextSync: null,
    isAutomated: false,
  });

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
  const openAddCategoryModalRef = useRef<(() => void) | null>(null);
  const [hasOpenAddCategoryModal, setHasOpenAddCategoryModal] = useState(false);
  const refreshBudgetRef = useRef<(() => Promise<void>) | null>(null);

  // Wrapper function that calls the ref
  const openAddCategoryModal = useCallback(() => {
    if (openAddCategoryModalRef.current) {
      openAddCategoryModalRef.current();
    }
  }, []);

  // Handler for receiving the modal open function from child
  const handleOpenAddCategoryModalRef = useCallback((openFn: () => void) => {
    // Store in ref immediately (safe during render)
    openAddCategoryModalRef.current = openFn;
    // Update flag after render completes to trigger re-render for button visibility
    setTimeout(() => {
      setHasOpenAddCategoryModal(true);
    }, 0);
  }, []);

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
  const [activeSection, setActiveSection] = useState<InsightsSection>("spending");

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
    null,
  );

  // Listen for transaction category updates - clear cache and refresh smoothly
  // Note: Using ref to avoid re-subscription when processTransactionsData changes
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "transactionCategoryUpdated",
      async (data) => {
        // Clear caches since categories have changed
        await Promise.all([clearTransactionsCache(), clearSpendingCache()]);

        if (data.affectedTransactions && data.affectedTransactions.length > 0) {
          // Apply optimistic updates to filtered transactions
          setFilteredTransactions((prevTransactions) => {
            let updatedTransactions = prevTransactions;

            // Apply optimistic updates for each affected transaction
            data.affectedTransactions.forEach((affectedTx: any) => {
              updatedTransactions = OptimisticUpdateManager.applyCategoryChange(
                updatedTransactions,
                affectedTx.transactionId,
                data.newCategory,
              );
            });

            return updatedTransactions;
          });

          // Also update main transactions list for consistency
          setTransactions((prevTransactions) => {
            let updatedTransactions = prevTransactions;

            data.affectedTransactions.forEach((affectedTx: any) => {
              updatedTransactions = OptimisticUpdateManager.applyCategoryChange(
                updatedTransactions,
                affectedTx.transactionId,
                data.newCategory,
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
          // Fallback: refresh all data if no specific transactions provided
          await loadData();
        }
      },
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
    const handleRecurringUpdate = async () => {
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
        logger.info("🔄 Refreshing recurring transactions after status update");
        if (loadRecurringTransactionsRef.current) {
          await loadRecurringTransactionsRef.current();
        }
      } else {
        // If not on recurring section, just clear cache - will load fresh when user navigates
        logger.info(
          "📦 Cleared recurring cache (will load fresh when user navigates to recurring section)",
        );
      }
    };

    const singleUpdateSubscription = DeviceEventEmitter.addListener(
      "transactionRecurringUpdated",
      async (data) => {
        console.log("🔄 Transaction recurring status updated:", data);
        await handleRecurringUpdate();
      },
    );

    const bulkUpdateSubscription = DeviceEventEmitter.addListener(
      "recurringBulkUpdate",
      async (data) => {
        console.log(
          `🔄 Bulk recurring update: ${data.count} transactions updated`,
        );
        await handleRecurringUpdate();
      },
    );

    return () => {
      singleUpdateSubscription.remove();
      bulkUpdateSubscription.remove();
    };
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
  // Skip if we already loaded from initial synchronous cache
  useEffect(() => {
    const loadCachedData = async () => {
      try {
        // If we already loaded cache synchronously, skip this
        if (initialCache.hasCache && transactions.length > 0) {
          hasData.current = true;
          hasCachedData.current = true;
          // Still need to process transactions for spending breakdown
          if (processTransactionsDataRef.current) {
            processTransactionsDataRef.current(transactions);
          }
          return;
        }

        // Wait for userId to be available
        if (!userId) {
          logger.info("⏳ Waiting for userId before loading cache...");
          return;
        }

        // Clear spending cache on mount to force recalculation with new date parsing logic
        // This ensures old cached data with buggy date logic doesn't persist
        await clearSpendingCache(userId);

        // Don't load cached spending breakdown anymore - it's month-specific and may have
        // been calculated with old buggy date logic. Always reprocess from transactions.

        // Load cached transactions (most important for smooth UX)
        const cachedTransactions = await loadTransactionsFromCache(userId);
        if (cachedTransactions && cachedTransactions.length > 0) {
          logger.info(
            "📦 Loading cached transactions on mount:",
            cachedTransactions.length,
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
        const cachedInvestmentData = await loadInvestmentFromCache(userId);
        if (cachedInvestmentData) {
          logger.info("📦 Loading cached investment data on mount");
          setInvestmentHoldings(cachedInvestmentData.holdings);
          setInvestmentOptions(cachedInvestmentData.options);
          setInvestmentBalances(cachedInvestmentData.balances);
          setInvestmentConnections(cachedInvestmentData.connections);
        }

        // Load cached recurring data
        const cachedRecurringData = await loadRecurringFromCache(userId);
        if (cachedRecurringData) {
          logger.info("📦 Loading cached recurring data on mount");
          setRecurringData(cachedRecurringData);
        }
      } catch (error) {
        logger.error("Error loading cached data:", error);
      }
    };

    loadCachedData();
  }, [userId]);

  // Load accounts and sync status on mount (non-blocking, lightweight)
  useEffect(() => {
    loadUserAccounts(false);
    loadSyncStatus();

    // Listen for prefetch events from Home tab
    const prefetchSubscription = DeviceEventEmitter.addListener(
      "prefetchInsightsTransactions",
      async () => {
        // Silently prefetch transactions in background if not already loaded
        if (!hasData.current && !isLoading) {
          try {
            await loadData();
            logger.info("📦 [INSIGHTS] Prefetched transactions in background");
          } catch (error) {
            logger.error("Prefetch failed silently:", error);
          }
        }
      },
    );

    return () => {
      prefetchSubscription.remove();
    };
  }, []);

  // Initialize data when tab is focused: use cache first, then refresh in background
  useFocusEffect(
    useCallback(() => {
      let isCancelled = false;

      const initializeScreen = async () => {
        // If we already have cached data from synchronous load, skip initial load state
        if (initialCache.hasCache && transactions.length > 0) {
          hasCachedData.current = true;
          hasData.current = true;
          setIsInitialLoad(false);

          // Refresh fresh data silently in background
          fetchFreshData().catch((error) => {
            if (!isCancelled) {
              logger.error("Background refresh failed:", error);
            }
          });
          return;
        }

        // Only show initial load if we don't have cached data
        if (!hasCachedData.current) {
          setIsInitialLoad(true);
        }

        try {
          // Try to load from database (will use cache if available)
          const hasStoredData = await loadData();

          // If we have cached data, refresh in background without showing loading state
          if (hasCachedData.current) {
            // Refresh fresh data silently in background
            fetchFreshData().catch((error) => {
              if (!isCancelled) {
                logger.error("Background refresh failed:", error);
              }
            });
          } else if (!hasStoredData && !isCancelled) {
            // No cache and no stored data - show loading and fetch
            setIsLoading(true);
            await fetchFreshData();
            if (!isCancelled) {
              setIsLoading(false);
            }
          }

          if (!isCancelled) {
            setIsInitialLoad(false);
          }
        } catch (error) {
          if (!isCancelled) {
            logger.error("Error during initialization:", error);
            setIsInitialLoad(false);
          }
        }
      };

      // No delay needed if we have initial cache - execute immediately
      let timer: ReturnType<typeof setTimeout> | null = null;
      
      if (initialCache.hasCache && transactions.length > 0) {
        initializeScreen();
      } else {
        // Small delay to ensure cached data is loaded first
        timer = setTimeout(() => {
          initializeScreen();
        }, 50);
      }

      return () => {
        isCancelled = true;
        if (timer) {
          clearTimeout(timer);
        }
      };
    }, [getUserId]),
  );

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
      checkForReAuthNeedsWrapper();
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
        cachedSearch.transactions.length < cachedSearch.count,
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

        const currentUserId = userId || (await getUserId());
        const hasCache = currentUserId
          ? await hasValidTransactionsCache(currentUserId)
          : false;
        // Only update state if this effect hasn't been cancelled
        if (!isCancelled) {
          setMightHaveTransactions(hasCache);
          if (hasCache) {
            logger.info(
              "📦 Cache exists, showing loading state instead of empty state",
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
    userId,
    getUserId,
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
      const currentUserId = userId || (await getUserId());
      if (!currentUserId) {
        logger.error("No authenticated user");
        return false;
      }

      // First check cache (already loaded in mount effect, but check again)
      const cachedTransactions = await loadTransactionsFromCache(currentUserId);
      if (cachedTransactions && cachedTransactions.length > 0) {
        logger.info(
          "Insights: Using cached transactions:",
          cachedTransactions.length,
        );
        setTransactions(cachedTransactions);
        processTransactionsData(cachedTransactions);
        hasData.current = true;
        return true;
      }

      logger.info("Insights: Loading data from Supabase...");

      // Fetch recent transactions using the new plaid utils
      // Fetch more transactions to support 2 years of month history (estimate ~1000 transactions)
      const transactions = await getRecentTransactions(currentUserId, 1000);

      if (transactions && transactions.length > 0) {
        logger.info(
          `Insights: Loaded ${transactions.length} transactions from Supabase`,
        );

        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;

        // Save to cache for next time
        await saveTransactionsToCache(currentUserId, transactions);
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
          `Insights: Loaded ${transactions.length} fresh transactions`,
        );
        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;

        // Save to cache for smooth next load
        await saveTransactionsToCache(userId, transactions);
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
          `Loaded ${userAccounts.length} user accounts for filtering:`,
        );
        userAccounts.forEach((acc, idx) => {
          logger.debug(
            `  ${idx + 1}. ${acc.institution_name} - ${acc.name} (${
              acc.subtype
            }) [Account ID: ${acc.account_id}]`,
          );
        });

        // Additional debug - check for institution name mismatches
        const uniqueInstitutions = [
          ...new Set(userAccounts.map((acc) => acc.institution_name)),
        ];

        // Check which accounts belong to which institution
        uniqueInstitutions.forEach((institution) => {
          const accountsForInstitution = userAccounts.filter(
            (acc) => acc.institution_name === institution,
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
    count: number,
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
    search: string = "",
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
          filters,
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
            cachedSearch.transactions.length < cachedSearch.count,
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

      // Deduplicate transactions by plaid_transaction_id to prevent duplicate keys in FlatList
      // Use a Map to track unique transactions (latest version wins if duplicates exist)
      const uniqueTransactionsMap = new Map<string, Transaction>();
      const transactionsWithoutId: Transaction[] = []; // Track transactions without IDs

      const addTransaction = (tx: Transaction) => {
        const key = tx.plaid_transaction_id || tx.id;
        if (key) {
          uniqueTransactionsMap.set(key, tx);
        } else {
          // Transactions without IDs are rare but possible - include them but can't deduplicate
          transactionsWithoutId.push(tx);
        }
      };

      if (reset) {
        // Reset: only use new transactions, but still deduplicate them
        newTransactions.forEach(addTransaction);
      } else {
        // Append: add existing transactions first, then new ones (new ones overwrite if duplicate)
        filteredTransactions.forEach(addTransaction);
        newTransactions.forEach(addTransaction);
      }

      // Combine deduplicated transactions with transactions without IDs
      const updatedTransactions = [
        ...Array.from(uniqueTransactionsMap.values()),
        ...transactionsWithoutId,
      ];

      // Sort by date descending to maintain correct order (newest first)
      // Note: Database already sorts, but re-sorting ensures consistency after deduplication
      updatedTransactions.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

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
            totalCount,
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
        }/${totalCount})${search.trim() ? ` for search: "${search}"` : ""}`,
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
              (id) => id !== deletedAccountId,
            );
            logger.info(
              `🧹 Removed deleted account from filter options. Remaining: ${updatedAccountIds.length}`,
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
      },
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

  // Memoized transaction processing to prevent expensive recomputations
  const processTransactionsData = useCallback(
    (
      transactionsData: Transaction[],
      targetMonth?: number,
      targetYear?: number,
    ) => {
      // Use selected month/year or default to current month
      const monthToUse =
        targetMonth !== undefined ? targetMonth : selectedMonth;
      const yearToUse = targetYear !== undefined ? targetYear : selectedYear;

      // Filter out INTERNAL_TRANSFER transactions - they should not be counted in spending
      const expenses = transactionsData.filter(
        (tx) => tx.amount > 0 && tx.new_category !== "INTERNAL_TRANSFER",
      );

      // Filter for selected month
      let currentMonthExpenses = filterTransactionsByMonth(
        expenses,
        monthToUse,
        yearToUse,
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
          mostRecentYear,
        );

        // Update selected month/year to match most recent month with data
        if (targetMonth === undefined && targetYear === undefined) {
          setSelectedMonth(mostRecentMonth);
          setSelectedYear(mostRecentYear);
        }
      }

      const totalSpent = currentMonthExpenses.reduce(
        (acc, tx) => acc + tx.amount,
        0,
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
        (a, b) => b[1].amount - a[1].amount,
      );

      // Filter out Internal Transfer categories
      const filteredCategories = sortedCategories.filter(
        ([category]) => category !== "INTERNAL_TRANSFER",
      );

      setCategoryBreakdown(filteredCategories);

      // Store current month transactions for category detail modal
      setCurrentMonthTransactions(currentMonthExpenses);

      const uniqueCategories = [
        "All Categories",
        ...new Set(currentMonthExpenses.map((tx) => getDisplayCategory(tx))),
      ].map((cat) =>
        cat === "All Categories" ? cat : formatCategoryFromHook(cat),
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
                topCategory[0],
              )} — $${topCategory[1].amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} this month. Try setting a limit or exploring cheaper alternatives.`
            : "We're analyzing your spending patterns. More insights will appear as you use the app.",
        },
      ];

      setRealInsights(newInsights);

      // Save spending breakdown to cache for smooth UX
      if (userId) {
        const spendingCacheData = {
          categoryBreakdown: filteredCategories,
          currentMonthTransactions: currentMonthExpenses,
          totalSpent,
          displayPeriod,
        };
        saveSpendingToCache(userId, spendingCacheData).catch((error) => {
          logger.error("Failed to save spending to cache:", error);
        });
      }
    },
    [
      selectedMonth,
      selectedYear,
      getCategoryColor,
      formatCategoryFromHook,
    ],
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
          (m) => m.month === selectedMonth && m.year === selectedYear,
        );
        if (!currentSelectedExists) {
          // Default to most recent month (first in array)
          setSelectedMonth(months[0].month);
          setSelectedYear(months[0].year);
        }
      }
    }
  }, [transactions, selectedMonth, selectedYear]);

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

  // Helper function to get filter description
  const getFilterDescriptionMemo = useCallback(() => {
    return getFilterDescription(filterOptions, accounts);
  }, [filterOptions, accounts]);

  const onRefresh = async () => {
    if (!hasData.current) return;
    setRefreshing(true);
    try {
      // Clear cache when refreshing
      clearCache();
      await clearTransactionsCache();
      await clearSpendingCache();
      await fetchFreshData();

      // Refresh budget data if in budget mode
      if (isBudgetMode && refreshBudgetRef.current) {
        await refreshBudgetRef.current();
      }

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
    data: { amount: number; percentage: number; color: string },
  ) => {
    setSelectedCategoryDetail({
      category,
      data: { ...data, hasRecurringTransactions: false },
    });
    setShowCategoryDetail(true);
  };

  // Handle transaction click - show transaction detail modal
  const handleTransactionPress = (transaction: Transaction) => {
    // This is now handled by the TransactionsSection component itself
    // No navigation needed - pure modal approach
  };

  // Handle smooth section transitions
  const handleSectionChange = (
    newSection: "cashflow" | "spending" | "transactions" | "recurring",
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
      const currentUserId = userId || (await getUserId());
      if (!currentUserId) {
        logger.error("No authenticated user loading investment data");
        return false;
      }

      logger.info("Insights: Loading investment data...");

      // First, try to load from cache
      const cachedData = await loadInvestmentFromCache(currentUserId);
      if (cachedData) {
        logger.info("📦 Using cached investment data");
        setInvestmentHoldings(cachedData.holdings);
        setInvestmentOptions(cachedData.options);
        setInvestmentBalances(cachedData.balances);
        setInvestmentConnections(cachedData.connections);

        // Load fresh data in background and update cache (no loading state)
        // But don't await it - let it update the state when it completes
        loadInvestmentDataFromDB().catch((err) =>
          logger.error("Background investment data refresh failed:", err),
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
          }, Connections: ${connections?.length || 0}`,
        );
        setInvestmentHoldings(investmentData.holdings);
        setInvestmentOptions(investmentData.options);
        setInvestmentBalances(investmentData.balances);
        setInvestmentConnections(investmentData.connections);

        // Save to cache for future use
        const currentUserId = userId || (await getUserId());
        if (currentUserId) {
          await saveInvestmentToCache(currentUserId, investmentData);
        }
        return true;
      }

      logger.info("Insights: No investment data found");
      setInvestmentHoldings([]);
      setInvestmentOptions([]);
      setInvestmentBalances([]);
      setInvestmentConnections([]);

      // Save empty data to cache to avoid repeated DB calls
      const currentUserId = userId || (await getUserId());
      if (currentUserId) {
        await saveInvestmentToCache(currentUserId, investmentData);
      }
      return false;
    } catch (err) {
      logger.error("Failed to load investment data:", err);
      return false;
    }
  };

  // Check for re-auth needs (both database flags and API errors)
  const checkForReAuthNeedsWrapper = async () => {
    const currentUserId = await getUserId();
    if (!currentUserId) return;
    await checkForReAuthNeeds(currentUserId, setReAuthItems);
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
            accountsError,
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
      const currentUserId = userId || (await getUserId());
      if (!currentUserId) {
        logger.error("No authenticated user loading recurring transactions");
        return;
      }

      logger.info("🔄 Loading recurring transactions...");

      // First, try to load from cache
      const cachedData = await loadRecurringFromCache(currentUserId);
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
      const currentUserId = userId || (await getUserId());
      if (currentUserId) {
        await saveRecurringToCache(currentUserId, data);
      }

      logger.info(
        "✅ Recurring transactions loaded from database:",
        data.summary,
      );
    } catch (error) {
      logger.error(
        "❌ Error loading recurring transactions from database:",
        error,
      );
    }
  };

  // Keep ref updated with latest loadRecurringTransactions function
  // This allows the event listener to always use the latest version without re-subscribing
  useEffect(() => {
    loadRecurringTransactionsRef.current = loadRecurringTransactions;
  }, [loadRecurringTransactions]);

  // Handle re-auth banner actions
  const handleReAuthWrapper = useCallback(
    async (item_id: string) => {
      await handleReAuth(item_id, filterOptions, {
        fetchFreshData,
        loadFilteredTransactions,
        loadRecurringTransactions,
        loadInvestmentData: async () => {
          await loadInvestmentData();
        },
        setReAuthItems,
        searchQuery,
      });
    },
    [filterOptions, searchQuery, fetchFreshData, loadFilteredTransactions, loadRecurringTransactions, loadInvestmentData, setReAuthItems],
  );

  // Dismiss re-auth banner
  const dismissReAuthBannerWrapper = useCallback(
    (item_id: string) => {
      dismissReAuthBanner(item_id, setReAuthItems);
    },
    [setReAuthItems],
  );

  // Cloud refresh handler
  const handleRefreshLatestDataWrapper = useCallback(async () => {
    if (isSyncing) return;
    await handleRefreshLatestData(
      setIsSyncing,
      setRefreshStatus,
      setReAuthItems,
      filterOptions,
      {
        fetchFreshData,
        loadFilteredTransactions,
        loadRecurringTransactions,
        loadInvestmentData: async () => {
          await loadInvestmentData();
        },
        searchQuery,
      },
    );
  }, [isSyncing, filterOptions, searchQuery, fetchFreshData, loadFilteredTransactions, loadRecurringTransactions, loadInvestmentData, setReAuthItems]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <InsightsHeader
        isSyncing={isSyncing}
        syncStatus={syncStatus}
        onRefresh={handleRefreshLatestDataWrapper}
      />

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
                <RefreshStatusComponent
                  message={refreshStatus.message}
                  type="loading"
                />
              )}

              {/* Re-auth and new accounts banners */}
              {reAuthItems
                .filter((item) => !item.dismissed)
                .map((item) => (
                  <ReAuthBanner
                    key={item.item_id}
                    institutionName={item.institution_name}
                    onReAuth={() => handleReAuthWrapper(item.item_id)}
                    onDismiss={() => dismissReAuthBannerWrapper(item.item_id)}
                    type={item.type || "re_auth"}
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
                            sectionAnimations.cashflow,
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
                            sectionAnimations.spending,
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
                    getCategoryIcon={getCategoryIcon}
                    availableMonths={availableMonths}
                    selectedMonth={selectedMonth}
                    selectedYear={selectedYear}
                    onMonthSelect={handleMonthSelect}
                    onBudgetModeChange={setIsBudgetMode}
                    onOpenAddCategoryModalRef={handleOpenAddCategoryModalRef}
                    onRefreshBudgetRef={(refreshFn) => {
                      refreshBudgetRef.current = refreshFn;
                    }}
                    refreshCategories={refreshCategories}
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
                            sectionAnimations.transactions,
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
                    getFilterDescription={getFilterDescriptionMemo}
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
                            sectionAnimations.recurring,
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
                            sectionAnimations.investments,
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
                      searchQuery,
                    );
                  },
                  (error) => {
                    logger.error("Failed to add new cash account:", error);
                  },
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
                      itemId,
                    );
                    await fetchFreshData();
                    await loadFilteredTransactions(
                      filterOptions,
                      true,
                      searchQuery,
                    );
                  },
                  (error) => {
                    logger.error(
                      "Failed to add new credit card account:",
                      error,
                    );
                  },
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
      {isBudgetMode &&
        activeSection === "spending" &&
        hasOpenAddCategoryModal && (
          <InsightsFAB onPress={openAddCategoryModal} />
        )}
    </SafeAreaView>
  );
}
