import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  DeviceEventEmitter,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { styles } from "../styles/insightsStyles";
import CategoryGrid from "../components/CategoryGrid";
import CategoryDetailModal from "../components/CategoryDetailModal";
import FilterModal from "../components/FilterModal";
import EnhancedFilterModal, {
  FilterOptions,
  Account,
} from "../components/EnhancedFilterModal";
import TransactionDetailModal from "../components/TransactionDetailModal";
import { supabase } from "../lib/supabase/supabase";
import {
  fetchInitialData,
  getPrimaryItemId,
  syncAllUserTransactions,
  getUpdateLinkToken,
  openPlaidLink,
  getRecentTransactions,
  getSpendingByCategory,
  getFilteredTransactions,
  getFilteredTransactionsCount,
  getUserAccountsForFilter,
} from "../utils/plaid";
import {
  debugTransactionCategories,
  getCurrentMonthCategoryBreakdown,
  countNullCategories,
  forceFullResync,
} from "../utils/categoryFix";
const screenWidth = Dimensions.get("window").width;

// Define types
interface Transaction {
  id?: string;
  amount: number;
  category?: string; // This is the primary category from Plaid stored as string
  date: string;
  name: string;
  personal_finance_category?: {
    primary: string;
  };
  plaid_transaction_id?: string;
  account_name?: string;
  institution_name?: string;
  account_mask?: string;
}

interface CategoryBreakdown {
  [key: string]: {
    amount: number;
    percentage: number;
    color: string;
  };
}

interface Insight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  details: string;
}

// Add some nice colors for categories
const categoryColors = {
  FOOD_AND_DRINK: "#FF6B6B",
  GENERAL_MERCHANDISE: "#4ECDC4",
  TRANSPORTATION: "#45B7D1",
  ENTERTAINMENT: "#96CEB4",
  LOAN_PAYMENTS: "#FFEEAD",
  TRAVEL: "#4A90E2",
  PERSONAL_CARE: "#D4A5A5",
  GENERAL_SERVICES: "#9B786F",
  INCOME: "#A8E6CF",
  Other: "#4A90E2",
};

const formatCategoryName = (category: string): string => {
  const categoryMap: { [key: string]: string } = {
    FOOD_AND_DRINK: "Food & Drink",
    GENERAL_MERCHANDISE: "Shopping",
    TRANSPORTATION: "Transportation",
    ENTERTAINMENT: "Entertainment",
    LOAN_PAYMENTS: "Loan Payments",
    TRAVEL: "Travel",
    PERSONAL_CARE: "Personal Care",
    GENERAL_SERVICES: "Services",
    INCOME: "Income",
    Other: "Other",
  };
  return categoryMap[category] || category;
};

// Dummy insights with proper typing
const dummyInsights: Insight[] = [
  {
    icon: "trending-up",
    title: "Spending Up 12% This Month",
    description:
      "Your spending has increased compared to last month, especially in dining and transport.",
    details:
      "Try reviewing your discretionary expenses and set category-based limits using our Advisor tool.",
  },
];

export default function InsightsScreen() {
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [realInsights, setRealInsights] = useState<Insight[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<
    [string, { amount: number; percentage: number; color: string }][]
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

  // Enhanced filtering state
  const [showEnhancedFilterModal, setShowEnhancedFilterModal] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    accountIds: [],
    timePeriod: "30days",
  });
  const [filteredTransactions, setFilteredTransactions] = useState<
    Transaction[]
  >([]);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(true);

  // Transaction detail modal state
  const [showTransactionDetail, setShowTransactionDetail] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

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
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Initialize data and check for update flags on mount
  useEffect(() => {
    const initializeScreen = async () => {
      setIsInitialLoad(true);

      // Load accounts for filter modal
      await loadUserAccounts(true);

      // Load stored data first
      const hasStoredData = await loadData();

      if (!hasStoredData) {
        // If no stored data, try fetching fresh data
        setIsLoading(true);
        await fetchFreshData();
        setIsLoading(false);
      }

      // Load filtered transactions with default filters
      await loadFilteredTransactions(filterOptions, true);

      // Check for update flags (Option A - polling approach)
      await checkForUpdateFlags();

      setIsInitialLoad(false);
    };

    initializeScreen();
  }, []);

  // Load filtered transactions when filter options change
  useEffect(() => {
    if (hasData.current && !showEnhancedFilterModal) {
      loadFilteredTransactions(filterOptions, true);
    }
  }, [filterOptions]);

  const loadData = async () => {
    try {
      console.log("💡 Insights: Loading data from Supabase...");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.log("❌ Auth error:", authError.message);
        return false;
      }

      if (!user?.id) {
        console.log("❌ No authenticated user");
        return false;
      }

      // Fetch recent transactions using the new plaid utils
      const transactions = await getRecentTransactions(user.id, 100);

      if (transactions && transactions.length > 0) {
        console.log(
          `✅ Insights: Loaded ${transactions.length} transactions from Supabase`
        );
        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;
        return true;
      }

      console.log("ℹ️ Insights: No transaction data found");
      return false;
    } catch (error) {
      console.error("❌ Insights: Error loading data:", error);
      return false;
    }
  };

  const fetchFreshData = async () => {
    try {
      setIsLoading(true);
      console.log("💡 Insights: Fetching fresh data from Supabase...");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.log("❌ Auth error:", authError.message);
        return;
      }

      if (!user?.id) {
        console.log("❌ No authenticated user");
        return;
      }

      // Fetch latest transactions using the new plaid utils
      const transactions = await getRecentTransactions(user.id, 100);

      if (transactions && transactions.length > 0) {
        console.log(
          `✅ Insights: Loaded ${transactions.length} fresh transactions`
        );
        setTransactions(transactions);
        processTransactionsData(transactions);
        hasData.current = true;
      } else {
        console.log("ℹ️ Insights: No transactions found");
      }
    } catch (error) {
      console.error("❌ Insights: Error fetching fresh data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load user accounts for filter modal
  const loadUserAccounts = async (debug: boolean = false) => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.id) {
        if (debug)
          console.log("❌ Auth error loading accounts:", authError?.message);
        return;
      }

      const userAccounts = await getUserAccountsForFilter(user.id);
      setAccounts(userAccounts);

      if (debug) {
        console.log(
          `📊 Loaded ${userAccounts.length} user accounts for filtering:`
        );
        userAccounts.forEach((acc, idx) => {
          console.log(
            `  ${idx + 1}. ${acc.institution_name} - ${acc.name} (${
              acc.subtype
            })`
          );
        });
      }
    } catch (error) {
      console.error("❌ Error loading user accounts:", error);
    }
  };

  // Helper functions for caching
  const getCacheKey = (filters: FilterOptions, offset: number = 0) => {
    const accountsKey =
      (filters.accountIds || []).length === 0
        ? "all"
        : (filters.accountIds || []).sort().join(",");
    return `${accountsKey}_${filters.timePeriod}_${offset}`;
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
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.id) {
        console.log(
          "❌ Auth error loading filtered transactions:",
          authError?.message
        );
        return;
      }

      const offset = reset ? 0 : filteredTransactions.length;
      const cacheKey = getCacheKey(filters, offset);

      // Check cache first (only for initial load, not pagination)
      if (reset) {
        const cached = getCachedData(getCacheKey(filters, 0));
        if (cached) {
          console.log(`📦 Using cached data for filters: ${cacheKey}`);
          setFilteredTransactions(cached.transactions);
          setTotalFilteredCount(cached.count);
          setHasMoreTransactions(cached.transactions.length < cached.count);
          return;
        }
      }

      const limit = 50;

      // Get filtered transactions
      const newTransactions = await getFilteredTransactions(user.id, {
        accountIds: filters.accountIds,
        timePeriod: filters.timePeriod,
        limit,
        offset,
      });

      // Get total count for pagination (only on initial load)
      let totalCount = totalFilteredCount;
      if (reset) {
        totalCount = await getFilteredTransactionsCount(user.id, {
          accountIds: filters.accountIds,
          timePeriod: filters.timePeriod,
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

      console.log(
        `📊 Loaded ${newTransactions.length} filtered transactions (${updatedTransactions.length}/${totalCount})`
      );
    } catch (error) {
      console.error("❌ Error loading filtered transactions:", error);
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
        console.log("🔄 Financial data refreshed event received");

        if (data.transactions) {
          setTransactions(data.transactions);
          processTransactionsData(data.transactions);
          hasData.current = true;
        }

        // Only refresh accounts if we're not in the middle of filtering
        if (!showEnhancedFilterModal) {
          await loadUserAccounts(true); // Debug when financial data changes
          await loadFilteredTransactions(filterOptions, true);
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [showEnhancedFilterModal]);

  const processTransactionsData = (transactionsData: Transaction[]) => {
    // Filter for current month expenses only
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

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
      // Use the category field from database
      const category = tx.category || "Other";

      if (!categoriesObj[category]) {
        categoriesObj[category] = {
          amount: 0,
          percentage: 0,
          color:
            categoryColors[category as keyof typeof categoryColors] ||
            "#4A90E2",
        };
      }
      categoriesObj[category].amount += tx.amount;
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
    setCategoryBreakdown(sortedCategories);

    const uniqueCategories = [
      "All Categories",
      ...new Set(currentMonthExpenses.map((tx) => tx.category || "Other")),
    ].map((cat) => (cat === "All Categories" ? cat : formatCategoryName(cat)));

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
          ? `Top category: ${formatCategoryName(topCategory[0])}`
          : "Building your spending insights...",
        details: topCategory
          ? `You've spent the most on ${formatCategoryName(
              topCategory[0]
            )} — $${topCategory[1].amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}. Try setting a limit or exploring cheaper alternatives.`
          : "We're analyzing your spending patterns. More insights will appear as you use the app.",
      },
    ];

    setRealInsights(newInsights);
  };

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
      "7days": "7 days",
      "30days": "30 days",
      "3months": "3 months",
      "6months": "6 months",
      "12months": "12 months",
      december2024: "Dec 2024",
      november2024: "Nov 2024",
      october2024: "Oct 2024",
    };

    const timePeriodName = timePeriodMap[filterOptions.timePeriod] || "30 days";

    return `${accountName} • ${timePeriodName}`;
  };

  const onRefresh = async () => {
    if (!hasData.current) return;
    setRefreshing(true);
    try {
      // Clear cache when refreshing
      clearCache();
      await fetchFreshData();
      // Reload current filters after refresh
      await loadFilteredTransactions(filterOptions, true);
    } finally {
      setRefreshing(false);
    }
  };

  const getCategoryIcon = (
    category: string
  ): keyof typeof Ionicons.glyphMap => {
    const iconMap: { [key: string]: keyof typeof Ionicons.glyphMap } = {
      FOOD_AND_DRINK: "restaurant",
      GENERAL_MERCHANDISE: "cart",
      TRANSPORTATION: "car",
      ENTERTAINMENT: "game-controller",
      LOAN_PAYMENTS: "card",
      TRAVEL: "airplane",
      PERSONAL_CARE: "fitness",
      GENERAL_SERVICES: "briefcase",
      INCOME: "cash",
      Other: "apps",
    };
    return iconMap[category] || "apps";
  };

  const handleCategoryPress = (
    category: string,
    data: { amount: number; percentage: number; color: string }
  ) => {
    setSelectedCategoryDetail({ category, data });
    setShowCategoryDetail(true);
  };

  // Handle transaction click
  const handleTransactionPress = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setShowTransactionDetail(true);
  };

  // Check for update mode flags
  const checkForUpdateFlags = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const { data: userItems, error } = await supabase
        .from("user_items")
        .select(
          "item_id, has_new_accounts, requires_update_mode, institution_name"
        )
        .eq("user_id", user.id);

      if (error) {
        console.error("Error checking update flags:", error);
        return;
      }

      // Check for items requiring
      for (const item of userItems || []) {
        if (item.has_new_accounts) {
          setUpdateModalInfo({
            type: "new_accounts",
            message: `New accounts are available for ${
              item.institution_name || "your bank"
            }. Would you like to add them?`,
            item_id: item.item_id,
          });
          setShowUpdateModal(true);
          return; // Show one at a time
        }

        if (item.requires_update_mode) {
          setUpdateModalInfo({
            type: "re_auth",
            message: `${
              item.institution_name || "Your bank"
            } requires re-authentication. Please update your connection.`,
            item_id: item.item_id,
          });
          setShowUpdateModal(true);
          return; // Show one at a time
        }
      }
    } catch (error) {
      console.error("Error checking update flags:", error);
    }
  };

  // Handle manual refresh with comprehensive debugging
  const handleManualRefresh = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      console.log("🔄 Manual refresh: Syncing transactions...");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.id) {
        console.error("❌ Auth error in refresh:", authError?.message);
        return;
      }

      // Debug existing data first
      console.log("🔍 BEFORE SYNC - Category Analysis:");
      await debugTransactionCategories(user.id, 10);
      const nullCountBefore = await countNullCategories(user.id);
      console.log(
        `⚠️ BEFORE: ${nullCountBefore} transactions with null categories`
      );

      // Clear cache before syncing
      clearCache();

      await syncAllUserTransactions();

      // Debug data after sync
      console.log("🔍 AFTER SYNC - Category Analysis:");
      await debugTransactionCategories(user.id, 10);
      const nullCountAfter = await countNullCategories(user.id);
      console.log(
        `⚠️ AFTER: ${nullCountAfter} transactions with null categories`
      );

      // Get current month breakdown
      await getCurrentMonthCategoryBreakdown(user.id);

      // Reload data after sync
      await fetchFreshData();
      await loadFilteredTransactions(filterOptions, true);

      console.log("✅ Manual refresh completed with detailed analysis");
    } catch (error) {
      console.error("❌ Manual refresh failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle full resync (fixes null categories)
  const handleFullResync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      console.log("🔄 Starting FULL re-sync to fix categories...");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.id) {
        console.error("❌ Auth error in full resync:", authError?.message);
        return;
      }

      // Force full resync by resetting cursors
      const success = await forceFullResync(user.id);

      if (!success) {
        console.error("❌ Failed to reset cursors for full resync");
        return;
      }

      // Clear cache before syncing
      clearCache();

      // Now sync with reset cursors (will get ALL transactions fresh)
      await syncAllUserTransactions();

      // Debug and reload
      console.log("🔍 AFTER FULL RESYNC - Category Analysis:");
      await debugTransactionCategories(user.id, 10);
      await getCurrentMonthCategoryBreakdown(user.id);

      // Reload data
      await fetchFreshData();
      await loadFilteredTransactions(filterOptions, true);

      console.log("✅ Full resync completed - categories should now be fixed!");
    } catch (error) {
      console.error("❌ Full resync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle update mode flow
  const handleUpdateMode = async () => {
    if (!updateModalInfo) return;

    try {
      console.log("🔄 Starting update mode for item:", updateModalInfo.item_id);

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

      console.log("✅ Update mode completed");
    } catch (error) {
      console.error("❌ Update mode failed:", error);
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
      </View>

      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
        </View>
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
            <ActivityIndicator
              size="large"
              color="#4A90E2"
              style={{ marginTop: 20 }}
            />
          )}

          {(!isLoading || hasData.current) && (
            <>
              {/* Compact Refresh Section */}
              <View style={refreshContainerStyles.container}>
                <View style={refreshContainerStyles.glassmorphismCard}>
                  {/* Glassmorphism background */}
                  <LinearGradient
                    colors={
                      [
                        "rgba(255, 255, 255, 0.05)",
                        "rgba(255, 255, 255, 0.02)",
                        "rgba(74, 144, 226, 0.03)",
                      ] as const
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={refreshContainerStyles.gradientBackground}
                  />

                  {/* Buttons Only */}
                  <View style={refreshContainerStyles.cardContent}>
                    <View style={refreshContainerStyles.buttonRow}>
                      <TouchableOpacity
                        style={[
                          refreshContainerStyles.button,
                          isSyncing && refreshContainerStyles.buttonDisabled,
                        ]}
                        onPress={handleManualRefresh}
                        disabled={isSyncing}
                      >
                        <LinearGradient
                          colors={["#4A90E2", "#357AFF"] as const}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={refreshContainerStyles.primaryButtonGradient}
                        >
                          <Ionicons
                            name={
                              isSyncing
                                ? "hourglass-outline"
                                : "refresh-outline"
                            }
                            size={16}
                            color="#fff"
                          />
                          <Text style={refreshContainerStyles.primaryText}>
                            {isSyncing ? "Syncing..." : "Refresh"}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          refreshContainerStyles.button,
                          isSyncing && refreshContainerStyles.buttonDisabled,
                        ]}
                        onPress={handleFullResync}
                        disabled={isSyncing}
                      >
                        <View
                          style={refreshContainerStyles.secondaryButtonContent}
                        >
                          <Ionicons
                            name={
                              isSyncing ? "hourglass-outline" : "sync-outline"
                            }
                            size={16}
                            color="#4A90E2"
                          />
                          <Text style={refreshContainerStyles.secondaryText}>
                            {isSyncing ? "Syncing..." : "Fix Categories"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Subtle shine effect */}
                  <View style={refreshContainerStyles.shineEffect} />
                </View>
              </View>

              <Text style={styles.sectionLabel}>Spending Overview</Text>
              <CategoryGrid
                categoryBreakdown={categoryBreakdown}
                onCategoryPress={handleCategoryPress}
                formatCategoryName={formatCategoryName}
                getCategoryIcon={getCategoryIcon}
              />

              <Text style={[styles.sectionLabel, { marginTop: 32 }]}>
                Smart Insights
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.insightsScrollContainer}
              >
                {[...realInsights, ...dummyInsights].map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.insightCard,
                      selectedCard === idx && styles.selectedInsightCard,
                    ]}
                    activeOpacity={0.9}
                    onPress={() =>
                      setSelectedCard(selectedCard === idx ? null : idx)
                    }
                  >
                    <View style={styles.insightIconContainer}>
                      <Ionicons name={item.icon} size={24} color="#fff" />
                    </View>
                    <Text style={styles.insightTitle}>{item.title}</Text>
                    <Text style={styles.insightDescription}>
                      {item.description}
                    </Text>
                    {selectedCard === idx && (
                      <View style={styles.insightDetailsContainer}>
                        <Text style={styles.insightDetails}>
                          {item.details}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Transactions</Text>
                <View style={styles.headerButtonsContainer}>
                  <TouchableOpacity
                    style={styles.refreshAccountsButton}
                    onPress={() => loadUserAccounts(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="reload" size={12} color="#4A90E2" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => setShowEnhancedFilterModal(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="funnel"
                      size={14}
                      color="#667eea"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.filterButtonText}>
                      {getFilterDescription()}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color="#667eea"
                      style={styles.dropdownArrow}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Transaction Count Info */}
              {totalFilteredCount > 0 && (
                <View style={transactionInfoStyles.container}>
                  <Text style={transactionInfoStyles.text}>
                    Showing {filteredTransactions.length} of{" "}
                    {totalFilteredCount} transactions
                  </Text>
                </View>
              )}

              {/* Filtered Transactions List */}
              <FlatList
                data={filteredTransactions}
                scrollEnabled={false}
                keyExtractor={(item, index) =>
                  `${item.plaid_transaction_id || item.id || index}`
                }
                renderItem={({ item: tx }) => {
                  // Handle transaction amount display logic
                  const amount = Math.abs(tx.amount);
                  const isIncome = tx.amount < 0; // Negative amounts are actually income/credits
                  const amountColor = isIncome ? "#4CAF50" : "#ff6b6b"; // Green for income, red for expenses
                  const amountText = isIncome
                    ? `+$${amount.toFixed(2)}`
                    : `-$${amount.toFixed(2)}`;

                  return (
                    <TouchableOpacity
                      style={styles.txItem}
                      onPress={() => handleTransactionPress(tx)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.txInfo}>
                        <Text style={styles.txName}>{tx.name}</Text>
                        <Text style={styles.txMeta}>{formatDate(tx.date)}</Text>
                        <Text style={styles.txCategory}>
                          {formatCategoryName(tx.category || "Other")}
                        </Text>
                      </View>
                      <View style={styles.txAmountContainer}>
                        <Text style={[styles.txAmount, { color: amountColor }]}>
                          {amountText}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#666"
                        />
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListFooterComponent={() => (
                  <View style={loadMoreStyles.container}>
                    {loadingMore && (
                      <ActivityIndicator
                        size="small"
                        color="#4A90E2"
                        style={loadMoreStyles.indicator}
                      />
                    )}
                    {hasMoreTransactions && !loadingMore && (
                      <TouchableOpacity
                        style={loadMoreStyles.button}
                        onPress={loadMoreTransactions}
                      >
                        <Text style={loadMoreStyles.buttonText}>Load More</Text>
                        <Ionicons
                          name="chevron-down"
                          size={16}
                          color="#4A90E2"
                        />
                      </TouchableOpacity>
                    )}
                    {!hasMoreTransactions &&
                      filteredTransactions.length > 0 && (
                        <Text style={loadMoreStyles.endText}>
                          No more transactions to load
                        </Text>
                      )}
                  </View>
                )}
              />
            </>
          )}

          <EnhancedFilterModal
            visible={showEnhancedFilterModal}
            onClose={() => setShowEnhancedFilterModal(false)}
            accounts={accounts}
            selectedFilters={filterOptions}
            onFiltersChange={(newFilters) => {
              setFilterOptions(newFilters);
            }}
          />

          {selectedCategoryDetail && (
            <CategoryDetailModal
              visible={showCategoryDetail}
              onClose={() => setShowCategoryDetail(false)}
              category={selectedCategoryDetail.category}
              data={selectedCategoryDetail.data}
              transactions={transactions}
              formatCategoryName={formatCategoryName}
              getCategoryIcon={getCategoryIcon}
              formatDate={formatDate}
            />
          )}

          {/* Transaction Detail Modal */}
          <TransactionDetailModal
            visible={showTransactionDetail}
            onClose={() => {
              setShowTransactionDetail(false);
              setSelectedTransaction(null);
            }}
            transaction={selectedTransaction}
            formatCategoryName={formatCategoryName}
            formatDate={formatDate}
          />
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

// Compact Glassmorphism Refresh Container Styles
const refreshContainerStyles = StyleSheet.create({
  container: {
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  glassmorphismCard: {
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  gradientBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
  },
  shineEffect: {
    position: "absolute",
    top: -10,
    left: -10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    transform: [{ rotate: "45deg" }],
  },
  cardContent: {
    position: "relative",
    zIndex: 2,
    padding: 14,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 5,
  },
  secondaryButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 5,
    backgroundColor: "rgba(74, 144, 226, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    borderRadius: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
    transform: [{ scale: 0.98 }],
  },
  primaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  secondaryText: {
    color: "#4A90E2",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

// Update Modal Styles
const updateModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "#333",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#333",
  },
  updateButton: {
    backgroundColor: "#4A90E2",
  },
  cancelButtonText: {
    color: "#A0A0A0",
    fontSize: 16,
    fontWeight: "600",
  },
  updateButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

// Transaction Info Styles
const transactionInfoStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#16213E",
    borderRadius: 8,
    marginBottom: 16,
  },
  text: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
  },
});

// Load More Button Styles
const loadMoreStyles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  indicator: {
    marginVertical: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#16213E",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4A90E2",
    gap: 8,
  },
  buttonText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "600",
  },
  endText: {
    color: "#666",
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 8,
  },
});
