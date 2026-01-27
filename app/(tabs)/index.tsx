import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  UIManager,
  ScrollView,
  RefreshControl,
  DeviceEventEmitter,
  Alert,
  InteractionManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/src/lib/supabase/supabase";
import { getPrimaryItemId, addNewBankAccount } from "@/src/utils/plaid/plaid";
import { getAccountBalance } from "@/src/utils/accountBalance";
import { Goal } from "@/src/types/finny";
import { useUnifiedFinancialData } from "@/src/hooks/useUnifiedFinancialData";
import { useSpendingData } from "@/src/hooks/useSpendingData";
import logger from "@/src/utils/core/logger";

// New optimized components
import { HomeHeader } from "@/src/components/home/HomeHeader";
import { QuickStats } from "@/src/components/home/QuickStats";
import { FinancialCards } from "@/src/components/home/FinancialCards";
import { GoalsSection } from "@/src/components/home/GoalsSection";
import { ActionButtons } from "@/src/components/home/ActionButtons";
import { FinnyMessage } from "@/src/components/home/FinnyMessage";
import { OnboardingProgressBox } from "@/src/components/home/OnboardingProgressBox";
import { HomeScreenSkeleton } from "@/src/components/home/LoadingSkeletons";
import OnboardingTimelineModal from "@/src/components/modals/OnboardingTimelineModal";
import { useModalManager } from "@/src/components/modals/ModalFactory";

// Legacy components (will be optimized in Phase 3)
import FinancialBottomSheet from "@/src/components/shared/FinancialBottomSheet";
import AccountItem from "@/src/components/shared/AccountItem";

// Modal components
import CategorySelectionModal from "@/src/components/modals/CategorySelectionModal";
import CashDepositInstitutionModal from "@/src/components/modals/CashDepositInstitutionModal";
import CreditCardInstitutionModal from "@/src/components/modals/CreditCardInstitutionModal";
import InstitutionSelectionModal from "@/src/components/modals/InstitutionSelectionModal";
import AccountDetailModal from "@/src/components/modals/AccountDetailModal";
import CashInputModal from "@/src/components/modals/CashInputModal";

import { styles } from "@/src/styles/homeStyles";
import AppStorage from "@/src/utils/storage/storage";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
import {
  getOnboardingStatus,
  dismissOnboardingProgress,
  resetOnboardingDismissal,
  OnboardingStatus,
} from "@/src/utils/onboarding/onboardingProgress";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// Check for unified cache synchronously before first render (like insights tab)
// This allows instant UI without loading skeleton when cache exists
const checkUnifiedCacheSync = (): boolean => {
  try {
    const cacheString = AppStorage.getItemSync("unified_financial_data");
    const timestampString = AppStorage.getItemSync(
      "unified_financial_data_timestamp",
    );

    if (!cacheString || !timestampString) {
      return false;
    }

    const timestamp = parseInt(timestampString, 10);
    const now = Date.now();
    const cacheAge = now - timestamp;

    // Cache duration is 5 minutes (300000ms) - same as CACHE_CONFIG.DURATIONS.MEDIUM
    if (cacheAge > 300000) {
      return false;
    }

    const cachedData = JSON.parse(cacheString);
    // Check if we have any meaningful data
    const hasData =
      (cachedData.accounts && cachedData.accounts.length > 0) ||
      (cachedData.goals && cachedData.goals.length > 0) ||
      (cachedData.cashEntries && cachedData.cashEntries.length > 0);

    return hasData;
  } catch (error) {
    return false;
  }
};

export default function HomeScreen() {
  const router = useRouter();

  // Check cache synchronously before first render
  const hasInitialCache = checkUnifiedCacheSync();
  logger.info(
    `🏠 [HOME] Initial cache check: ${hasInitialCache ? "HIT" : "MISS"}`,
  );

  // Unified financial data hook - replaces 3 separate hooks
  const {
    // Data
    accounts,
    goals,
    cashEntries,

    // Categorized
    categorizedDeposits,
    categorizedLiabilities,
    categorizedInvestments,

    // Totals (pre-calculated and memoized)
    accountsTotal,
    investmentsTotal,
    liabilitiesTotal,
    totalCash,
    totalBalance,

    // Loading states
    loading: financialLoading,
    isInitialLoad: financialInitialLoad,

    // Actions
    refreshAll: refreshFinancialData,
  } = useUnifiedFinancialData();

  // Removed verbose logging - only log on significant state changes

  // Modal management with lazy loading
  const { activeModal, modalProps, openModal, closeModal } = useModalManager();

  // Core states - initialize based on cache availability for instant UI
  const [accessToken, setAccessToken] = useState<string | null>(null);
  // If we have cache, start with loading states as false (no skeleton needed)
  const [isLoading, setIsLoading] = useState(!hasInitialCache);
  const [isInitialLoad, setIsInitialLoad] = useState(!hasInitialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [updateToken, setUpdateToken] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [hasTriedLoading, setHasTriedLoading] = useState(false);

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [showCashInputModal, setShowCashInputModal] = useState(false);

  const [userData, setUserData] = useState<any>(null);
  const [firstName, setFirstName] = useState<string | null>(null);

  // Account Detail Modal state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [selectedAccountData, setSelectedAccountData] = useState<any>(null);
  const [selectedAccountPerformance, setSelectedAccountPerformance] =
    useState<any>(null);

  // Real spending data from transactions
  const {
    spendingData,
    loading: spendingLoading,
    refresh: refreshSpendingData,
  } = useSpendingData(totalBalance);

  // Onboarding state
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  // Removed verbose logging

  // Currency formatter cache
  const formatterCache = useRef(new Map<string, Intl.NumberFormat>());

  // Helper functions
  const formatCurrency = (
    amount: number,
    currency = "USD",
    options = { decimals: 1, useKM: true },
  ) => {
    const cacheKey = `${currency}-${options.decimals}-${options.useKM}`;

    // Get or create formatter from cache
    let formatter = formatterCache.current.get(cacheKey);
    if (!formatter) {
      formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: options.decimals,
        maximumFractionDigits: options.decimals,
      });
      formatterCache.current.set(cacheKey, formatter);
    }

    if (options.useKM) {
      if (Math.abs(amount) >= 1000000) {
        return formatter.format(amount / 1000000) + "M";
      }
      if (Math.abs(amount) >= 1000) {
        return formatter.format(amount / 1000) + "K";
      }
    }
    return formatter.format(amount);
  };

  // Cash entry management functions
  const addCashEntry = async (
    amount: number,
    description?: string,
  ): Promise<void> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const { error } = await supabase.from("cash_entries").insert({
        user_id: user.id,
        amount,
        description,
        entry_type: "cash",
        is_active: true,
      });

      if (error) {
        logger.error("❌ Failed to add cash entry:", error);
        throw error;
      }

      logger.info("✅ Cash entry added successfully");
      await refreshFinancialData();
    } catch (error) {
      logger.error("❌ Error adding cash entry:", error);
      throw error;
    }
  };

  const deleteCashEntry = async (entryId: string): Promise<void> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const { error } = await supabase
        .from("cash_entries")
        .update({ is_active: false })
        .eq("id", entryId)
        .eq("user_id", user.id);

      if (error) {
        logger.error("❌ Failed to delete cash entry:", error);
        throw error;
      }

      logger.info("✅ Cash entry deleted successfully");
      await refreshFinancialData();
    } catch (error) {
      logger.error("❌ Error deleting cash entry:", error);
      throw error;
    }
  };

  const handleAccountPress = async (account: any) => {
    // Close the FinancialBottomSheet first
    closeModal();

    // Set account data immediately
    setSelectedAccountData(account);
    setSelectedAccountId(account.account_id);

    // Fetch performance data for investment accounts
    if (account?.type === "investment") {
      const performanceData = await getInvestmentPerformance(account);
      setSelectedAccountPerformance(performanceData);
    } else {
      setSelectedAccountPerformance(null);
    }

    // Open the AccountDetailModal using the modal factory
    openModal("accountDetail", {
      accountId: account.account_id,
      account: account,
      investmentPerformance: selectedAccountPerformance,
    });
  };

  // Fetch real investment performance data from Supabase
  const getInvestmentPerformance = async (account: any) => {
    if (account?.type !== "investment") return null;

    try {
      // First, get the snaptrade connection for this account
      const { data: connection, error: connectionError } = await supabase
        .from("snaptrade_connections")
        .select("snaptrade_user_id, account_id")
        .eq("user_id", userData?.id)
        .eq("account_id", account.account_id)
        .eq("is_active", true)
        .single();

      if (connectionError || !connection) {
        console.log(
          "No Snaptrade connection found for account:",
          account.account_id,
        );
        return null;
      }

      // Fetch the latest investment balance data
      const { data: balanceData, error: balanceError } = await supabase
        .from("investment_balances")
        .select(
          "day_change, day_change_percent, total_change, total_change_percent, total_value",
        )
        .eq("user_id", userData?.id)
        .eq("snaptrade_user_id", connection.snaptrade_user_id)
        .eq("account_id", connection.account_id)
        .eq("is_current", true)
        .single();

      if (balanceError || !balanceData) {
        console.log(
          "No investment balance data found for account:",
          account.account_id,
        );
        return null;
      }

      return {
        todayPerformance: {
          amount: balanceData.day_change || 0,
          percentage: balanceData.day_change_percent || 0,
        },
        totalPerformance: {
          amount: balanceData.total_change || 0,
          percentage: balanceData.total_change_percent || 0,
        },
      };
    } catch (error) {
      console.error("Error fetching investment performance:", error);
      return null;
    }
  };

  // Load additional data in background (non-blocking for UI)
  const loadBackgroundData = async () => {
    try {
      logger.info("Home: Loading background data...");
      logger.info("Home: Background data loaded");
    } catch (error) {
      logger.error("Error loading background data:", error);
    }
  };

  // Fetch fresh data using unified approach
  const fetchFreshData = async () => {
    try {
      logger.info("Refreshing financial data with unified hook...");
      // Single unified refresh instead of 2-3 separate calls
      await refreshFinancialData();

      // Refresh spending data
      await refreshSpendingData();

      // Load background data
      await loadBackgroundData();

      logger.info("Financial data refreshed successfully");
      // Emit event for other components (like insights)
      DeviceEventEmitter.emit("financialDataRefreshed", {
        accounts,
        transactions: [], // Transactions loaded separately in insights
      });
    } catch (error) {
      logger.error("Error refreshing data:", error);
    }
  };

  const handleUpdateBannerPress = () => {
    if (updateToken) {
      // This will be handled by the modal system in Phase 3
      setShowUpdateBanner(false);
    }
  };

  // Retry loading function
  const retryLoading = async () => {
    setLoadingError(false);
    setIsLoading(true);
    await initializeApp();
  };

  // Handle pull-to-refresh
  const onRefresh = async () => {
    if (!accessToken) return;
    setRefreshing(true);

    try {
      // Single unified refresh
      await fetchFreshData();
    } catch (error) {
      logger.error("Error during refresh:", error);
    }

    setRefreshing(false);
  };

  // Simplified initialization - instant UI with cached data
  const initializeApp = async () => {
    try {
      setLoadingError(false);
      setHasTriedLoading(true);

      // If we have initial cache, we can show UI immediately
      // Still need to get user data, but don't block UI
      if (hasInitialCache) {
        // Set loading states to false immediately if we have cache
        // This allows UI to render instantly while we fetch user data in background
        setIsInitialLoad(false);
        setIsLoading(false);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      logger.info("User in home screen:", user?.email);
      setUserData(user);

      if (!user?.id) {
        logger.error("No authenticated user found");
        setAccessToken(null);
        setIsInitialLoad(false);
        setIsLoading(false);
        return;
      }

      // Fetch first name from profiles table (non-blocking)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.first_name) {
          setFirstName(profile.first_name);
        }
      } catch (error) {
        logger.error("Error fetching profile first name:", error);
      }

      logger.info("Home screen initialized with cached data");

      // Set access token based on whether we have any accounts (from cache or fresh)
      // The hook loads cache synchronously before first render, so accounts should be available
      // But we'll also set up a watcher to update when hook finishes loading
      if (accounts.length > 0) {
        setAccessToken("connected");
        logger.info("User has connected accounts");
      } else {
        // Don't warn yet - wait for hook to finish initial load
        // This prevents false warnings when checking before cache is loaded
        setAccessToken(null);
      }

      // Load background data without blocking UI
      loadBackgroundData();

      // Load onboarding status
      loadOnboardingStatus(user.id);
    } catch (err) {
      logger.error("Error initializing app:", err);
      setLoadingError(true);
      setAccessToken(null);
    } finally {
      // Only set to false if we haven't already (for cache case)
      if (!hasInitialCache) {
        setIsInitialLoad(false);
        setIsLoading(false);
      }
    }
  };

  // Load onboarding status
  const loadOnboardingStatus = async (userId: string) => {
    try {
      // Reset dismissal on app start if incomplete
      await resetOnboardingDismissal(userId);

      // Get current status
      const status = await getOnboardingStatus(userId);
      setOnboardingStatus(status);
    } catch (error) {
      logger.error("Error loading onboarding status:", error);
    }
  };

  // Handle onboarding step press
  const handleOnboardingStepPress = (step: 1 | 2 | 3) => {
    setShowOnboardingModal(false);

    if (step === 1) {
      // Already connected, do nothing or show message
      return;
    } else if (step === 2) {
      // Navigate to Insights tab, scroll to budget section
      router.push("/(tabs)/insights");
      // Note: BudgetSection will handle showing empty state
    } else if (step === 3) {
      // Navigate to chat tab
      router.push("/(tabs)/chat");
    }
  };

  // Handle onboarding dismiss
  const handleOnboardingDismiss = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      await dismissOnboardingProgress(user.id);
      // Update local state
      if (onboardingStatus) {
        setOnboardingStatus({
          ...onboardingStatus,
          progress: onboardingStatus.progress
            ? {
                ...onboardingStatus.progress,
                dismissed: true,
              }
            : null,
          shouldShow: false,
        });
      }
    }
  };

  // Watch for when financial hook finishes loading to set access token correctly
  // This prevents false "No accounts found" warnings when cache is still loading
  useEffect(() => {
    // Only check accounts after hook has finished initial load
    if (!financialInitialLoad) {
      if (accounts.length > 0) {
        setAccessToken("connected");
        logger.info("User has connected accounts (from hook)");
      } else {
        // Only warn after hook has confirmed no accounts exist
        logger.warn("No accounts found - user needs to connect a bank");
        setAccessToken(null);
      }
    }
  }, [financialInitialLoad, accounts.length]);

  // Refresh onboarding status when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      const refreshOnboarding = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          await loadOnboardingStatus(user.id);
        }
      };
      refreshOnboarding();
    }, []),
  );

  useEffect(() => {
    initializeApp();

    // Defer financial data refresh to after interactions complete
    // This ensures Home UI renders immediately with cached data
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      // Refresh financial data in background after UI is interactive
      const hasCachedFinancialData =
        accounts.length > 0 || goals.length > 0 || cashEntries.length > 0;
      if (hasCachedFinancialData) {
        refreshFinancialData().catch((error) => {
          logger.error("Background financial data refresh failed:", error);
        });
      }

      // Background prefetch for other tabs after Home is interactive
      // Prefetch goals data (low priority - already cached-first)
      setTimeout(() => {
        DeviceEventEmitter.emit("prefetchGoals", {});
      }, 1000);

      // Prefetch insights transactions (medium priority)
      setTimeout(() => {
        DeviceEventEmitter.emit("prefetchInsightsTransactions", {});
      }, 2000);
    });

    // Set up event listener for financial data updates
    const financialSubscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      (data) => {
        // Accounts are now managed by useUnifiedFinancialData hook
        logger.info("Financial data refreshed event received");
      },
    );

    // Set up event listener for goals updates
    const goalsSubscription = DeviceEventEmitter.addListener(
      "goalsUpdated",
      (data) => {
        if (
          data &&
          (data.action === "deleted" ||
            data.action === "updated" ||
            data.action === "created")
        ) {
          logger.info("Goals updated event received:", data.action);
          // Unified hook automatically refreshes on goalsUpdated event
        }
      },
    );

    // Set up event listener for auth state changes (token refresh)
    const authSubscription = DeviceEventEmitter.addListener(
      "authStateChanged",
      async (data) => {
        if (data && data.event === "TOKEN_REFRESHED" && data.validated) {
          logger.info(
            "🔄 [HOME] Token refreshed and validated, reinitializing app...",
          );
          // Add small delay to ensure session is fully propagated
          setTimeout(async () => {
            await initializeApp();
          }, 200);
        }
      },
    );

    return () => {
      interactionTask.cancel();
      financialSubscription.remove();
      goalsSubscription.remove();
      authSubscription.remove();
    };
  }, []); // Empty deps - only run once on mount

  const findClosestGoal = (goals: Goal[]) => {
    if (!goals.length) return null;

    // Filter out completed goals (100% done)
    const activeGoals = goals.filter((goal) => {
      const isCompleted =
        goal.status === "completed" ||
        (goal.target_amount > 0 && goal.current_amount >= goal.target_amount);
      return !isCompleted;
    });

    if (!activeGoals.length) return null;

    const now = new Date();

    return activeGoals.reduce(
      (closest, goal) => {
        const goalDate = new Date(goal.target_date);
        const closestDate = closest ? new Date(closest.target_date) : null;

        // If the goal is in the past, ignore it
        if (goalDate < now) return closest;

        // If we don't have a closest yet, use this goal
        if (!closest) return goal;

        // If the current closest is in the past, use this goal
        if (closestDate && closestDate < now) return goal;

        // Compare the time difference
        const goalDiff = Math.abs(goalDate.getTime() - now.getTime());
        const closestDiff = Math.abs(closestDate!.getTime() - now.getTime());

        return goalDiff < closestDiff ? goal : closest;
      },
      null as Goal | null,
    );
  };

  // Memoized closest goal calculation - use unified goals data
  const closestGoal = useMemo(() => findClosestGoal(goals), [goals]);

  // Calculate category totals
  const checkingsSavingsTotal = useMemo(() => {
    return categorizedDeposits.reduce(
      (sum, account) => sum + getAccountBalance(account),
      0,
    );
  }, [categorizedDeposits]);

  const investmentsCategoryTotal = useMemo(() => {
    return categorizedInvestments.reduce(
      (sum, account) => sum + getAccountBalance(account),
      0,
    );
  }, [categorizedInvestments]);

  const creditCardsTotal = useMemo(() => {
    return categorizedLiabilities
      .filter(
        (acc) =>
          acc.type === "credit" || (acc as any).subtype === "credit card",
      )
      .reduce((sum, account) => sum + getAccountBalance(account), 0);
  }, [categorizedLiabilities]);

  const loansTotal = useMemo(() => {
    return categorizedLiabilities
      .filter(
        (acc) => acc.type === "loan" || (acc as any).subtype?.includes("loan"),
      )
      .reduce((sum, account) => sum + getAccountBalance(account), 0);
  }, [categorizedLiabilities]);

  const cashTotal = useMemo(() => {
    return cashEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  }, [cashEntries]);

  // Show loading skeleton only during initial authentication check (very brief)
  // Only show skeleton if we have no cached data AND no user data
  // Use both initial cache check and current data to determine if we should show skeleton
  const hasCachedData =
    hasInitialCache ||
    accounts.length > 0 ||
    goals.length > 0 ||
    cashEntries.length > 0;

  // Skip skeleton if we have cached data (instant UI)
  if (isInitialLoad && !userData && !hasCachedData) {
    return <HomeScreenSkeleton showError={false} />;
  }

  // Show error state only if we have a critical error and no cached data
  if (
    loadingError &&
    !accessToken &&
    accounts.length === 0 &&
    hasTriedLoading &&
    !hasCachedData
  ) {
    return <HomeScreenSkeleton showError={true} onRetry={retryLoading} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <HomeHeader
        userName={firstName || userData?.user_metadata?.full_name}
        onAddAccount={() => setShowCategoryModal(true)}
      />

      <>
        {showUpdateBanner && (
          <TouchableOpacity
            style={styles.updateBanner}
            onPress={handleUpdateBannerPress}
          >
            <Text style={styles.updateBannerText}>
              ⚠️ Your bank connection needs updating. Tap here.
            </Text>
          </TouchableOpacity>
        )}

        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#4A90E2"]}
              tintColor="#4A90E2"
              progressBackgroundColor="#1f1f1f"
            />
          }
        >
          {/* Finny Message */}
          <FinnyMessage
            goals={goals}
            spendingData={spendingData}
            totalBalance={totalBalance}
            investmentsTotal={investmentsTotal}
            liabilitiesTotal={liabilitiesTotal}
            netWorthChange={spendingData.netWorthChange}
            onboardingStatus={onboardingStatus}
          />

          {/* Net Worth Carousel */}
          <QuickStats
            totalBalance={totalBalance}
            spendingData={{
              threeMonths: spendingData.threeMonths,
              lastMonth: spendingData.lastMonth,
              threeMonthsChange: spendingData.threeMonthsChange,
              lastMonthChange: spendingData.lastMonthChange,
              netWorthChange: spendingData.netWorthChange,
            }}
            formatCurrency={formatCurrency}
            isLoading={
              financialLoading || financialInitialLoad || spendingLoading
            }
          />

          {/* Summary Cards */}
          <FinancialCards
            accountsTotal={accountsTotal}
            investmentsTotal={investmentsTotal}
            liabilitiesTotal={liabilitiesTotal}
            formatCurrency={formatCurrency}
            isLoading={financialLoading || financialInitialLoad}
            isInitialLoad={financialInitialLoad}
            onCardPress={(cardType) => {
              openModal("accounts", {
                initialExpandedCategory: cardType,
                onAccountAdded: async () => {
                  logger.info(
                    "New account added, refreshing financial data...",
                  );
                  await fetchFreshData();
                  logger.info("Financial data refreshed after new account");
                },
                onCashAdded: () => {
                  openModal("cashInput");
                },
              });
            }}
          />

          {/* Onboarding Progress Box */}
          {onboardingStatus && (
            <OnboardingProgressBox
              status={onboardingStatus}
              onPress={() => setShowOnboardingModal(true)}
              onDismiss={handleOnboardingDismiss}
            />
          )}

          {/* Goals Progress */}
          <GoalsSection
            goals={goals.filter((goal) => {
              const isCompleted =
                goal.status === "completed" ||
                (goal.target_amount > 0 &&
                  goal.current_amount >= goal.target_amount);
              return !isCompleted;
            })}
            closestGoal={closestGoal}
            formatCurrency={formatCurrency}
            isInitialLoad={financialInitialLoad}
          />

          {/* Add Account Button */}
          <ActionButtons
            onAddAccount={() => {
              setShowCategoryModal(true);
            }}
          />

          {/* Bottom Sheets */}
          <FinancialBottomSheet
            visible={activeModal === "accounts"}
            onClose={() => {
              closeModal();
            }}
            title="Your Financial Accounts"
            icon="wallet-outline"
            initialExpandedCategory={modalProps?.initialExpandedCategory}
            onAccountAdded={modalProps?.onAccountAdded}
            onCashAdded={() => {
              setShowCashInputModal(true);
            }}
            categories={[
              {
                title: "CHECKINGS & SAVINGS",
                icon: "wallet-outline" as keyof typeof Ionicons.glyphMap,
                iconColor: "#4A90E2",
                items: categorizedDeposits.map((account, index) => (
                  <AccountItem
                    key={index}
                    name={account.name}
                    type={account.type}
                    balance={formatCurrency(getAccountBalance(account), "USD", {
                      decimals: 0,
                      useKM: false,
                    })}
                    icon="wallet-outline"
                    bankName={account.institution_name || "Unknown Bank"}
                    accountId={account.account_id}
                    accountData={account}
                    onPress={() => handleAccountPress(account)}
                  />
                )),
                totalAmount: checkingsSavingsTotal,
              },
              {
                title: "INVESTMENTS",
                icon: "trending-up" as keyof typeof Ionicons.glyphMap,
                iconColor: "#4ECDC4",
                items: categorizedInvestments.map((account, index) => (
                  <AccountItem
                    key={index}
                    name={account.name}
                    type={account.type}
                    balance={formatCurrency(getAccountBalance(account), "USD", {
                      decimals: 0,
                      useKM: false,
                    })}
                    icon="trending-up"
                    bankName={account.institution_name || "Investment Broker"}
                    accountId={account.account_id}
                    accountData={account}
                    onPress={() => handleAccountPress(account)}
                  />
                )),
                totalAmount: investmentsCategoryTotal,
              },
              {
                title: "CREDIT CARDS",
                icon: "card-outline" as keyof typeof Ionicons.glyphMap,
                iconColor: "#FF6B6B",
                items: categorizedLiabilities
                  .filter(
                    (acc) =>
                      acc.type === "credit" ||
                      (acc as any).subtype === "credit card",
                  )
                  .map((account, index) => (
                    <AccountItem
                      key={index}
                      name={account.name}
                      type={account.type}
                      balance={formatCurrency(
                        getAccountBalance(account),
                        "USD",
                        { decimals: 0, useKM: false },
                      )}
                      icon="card-outline"
                      bankName={account.institution_name || "Unknown Bank"}
                      accountId={account.account_id}
                      accountData={account}
                      onPress={() => handleAccountPress(account)}
                    />
                  )),
                totalAmount: creditCardsTotal,
              },
              {
                title: "LOANS",
                icon: "receipt-outline" as keyof typeof Ionicons.glyphMap,
                iconColor: "#FF9F43",
                items: categorizedLiabilities
                  .filter(
                    (acc) =>
                      acc.type === "loan" ||
                      (acc as any).subtype?.includes("loan"),
                  )
                  .map((account, index) => (
                    <AccountItem
                      key={index}
                      name={account.name}
                      type={account.type}
                      balance={formatCurrency(
                        getAccountBalance(account),
                        "USD",
                        { decimals: 0, useKM: false },
                      )}
                      icon="receipt-outline"
                      bankName={account.institution_name || "Unknown Bank"}
                      accountId={account.account_id}
                      accountData={account}
                      onPress={() => handleAccountPress(account)}
                    />
                  )),
                totalAmount: loansTotal,
              },
              {
                title: "CASH",
                icon: "cash-outline" as keyof typeof Ionicons.glyphMap,
                iconColor: "#4ECDC4",
                items: cashEntries.map((entry, index) => (
                  <AccountItem
                    key={index}
                    name={entry.description || "Cash"}
                    type="cash"
                    balance={formatCurrency(entry.amount, "USD", {
                      decimals: 0,
                      useKM: false,
                    })}
                    icon="cash-outline"
                    bankName="Manual Entry"
                    accountId={entry.id}
                    accountData={entry}
                    onPress={() => {
                      Alert.alert(
                        "Delete Cash Entry",
                        `Are you sure you want to delete "${
                          entry.description || "Cash"
                        }" (${formatCurrency(entry.amount, "USD", {
                          decimals: 0,
                          useKM: false,
                        })})?`,
                        [
                          {
                            text: "Cancel",
                            style: "cancel",
                          },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: async () => {
                              try {
                                await deleteCashEntry(entry.id);
                                logger.info(
                                  "✅ Cash entry deleted successfully:",
                                  entry.id,
                                );

                                // Refresh all financial data to update UI and net worth
                                await fetchFreshData();
                                logger.info(
                                  "🔄 Financial data refreshed after cash deletion",
                                );
                              } catch (error) {
                                logger.error(
                                  "❌ Failed to delete cash entry:",
                                  error,
                                );
                                Alert.alert(
                                  "Error",
                                  "Failed to delete cash entry. Please try again.",
                                  [{ text: "OK" }],
                                );
                              }
                            },
                          },
                        ],
                      );
                    }}
                  />
                )),
                totalAmount: cashTotal,
              },
              {
                title: "REAL ESTATE",
                icon: "home-outline" as keyof typeof Ionicons.glyphMap,
                iconColor: "#8E8AFF",
                items: [],
              },
            ]}
          />

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
                if (institutionId === "other") {
                  // Handle other institutions for cash deposits
                  await addNewBankAccount(
                    async (itemId) => {
                      logger.info(
                        "Successfully added new cash account:",
                        itemId,
                      );
                      await fetchFreshData();
                    },
                    (error) => {
                      logger.error("Failed to add new cash account:", error);
                    },
                  );
                } else {
                  // Use standard bank account addition flow
                  await addNewBankAccount(
                    async (itemId) => {
                      logger.info(
                        "Successfully added new cash account:",
                        itemId,
                      );
                      await fetchFreshData();
                    },
                    (error) => {
                      logger.error("Failed to add new cash account:", error);
                    },
                  );
                }
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

          {/* Account Detail Modal */}
          <AccountDetailModal
            visible={activeModal === "accountDetail"}
            accountId={selectedAccountId}
            account={selectedAccountData}
            investmentPerformance={selectedAccountPerformance}
            onClose={async () => {
              closeModal();
              setSelectedAccountId(null);
              setSelectedAccountData(null);
              setSelectedAccountPerformance(null);
              // Refresh financial data to reflect any account deletions
              await refreshFinancialData();
            }}
          />

          {/* Cash Input Modal */}
          <CashInputModal
            visible={showCashInputModal}
            onClose={() => setShowCashInputModal(false)}
            onSave={async (amount, description) => {
              logger.info("Adding new cash entry:", { amount, description });
              try {
                await addCashEntry(amount, description);
                logger.info("Cash entry added successfully");

                // Refresh financial data to update the FinancialBottomSheet and net worth
                // Note: addCashEntry already refreshes cash entries internally
                await refreshFinancialData();

                // Emit event to notify other components of the data refresh
                DeviceEventEmitter.emit("financialDataRefreshed", {
                  accounts: null, // Will be refreshed by the listener
                  transactions: null, // Will be refreshed by the listener
                });

                setShowCashInputModal(false);
              } catch (error) {
                logger.error("Failed to add cash entry:", error);
                throw error;
              }
            }}
          />

          {/* Onboarding Timeline Modal */}
          <OnboardingTimelineModal
            visible={showOnboardingModal}
            progress={onboardingStatus?.progress || null}
            onClose={() => setShowOnboardingModal(false)}
            onStepPress={handleOnboardingStepPress}
          />
        </ScrollView>
      </>
    </SafeAreaView>
  );
}
