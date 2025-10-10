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
  Image,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { styles } from "@/app/_styles/homeStyles";
import { supabase } from "@/app/_lib/supabase/supabase";
import {
  openPlaidLink,
  getPrimaryItemId,
  addNewBankAccount,
} from "@/app/_utils/plaid";
import { Identity, Investment } from "@/app/_types/plaid";
import { useRouter } from "expo-router";
import FinancialBottomSheet from "@/app/_components/shared/FinancialBottomSheet";
import FinancialCard from "@/app/_components/shared/FinancialCard";
import AccountItem from "@/app/_components/shared/AccountItem";
import CategorySelectionModal from "@/app/_components/modals/CategorySelectionModal";
import CashDepositInstitutionModal from "@/app/_components/modals/CashDepositInstitutionModal";
import CreditCardInstitutionModal from "@/app/_components/modals/CreditCardInstitutionModal";
import InstitutionSelectionModal from "@/app/_components/modals/InstitutionSelectionModal";
import AccountDetailModal from "@/app/_components/modals/AccountDetailModal";
import CashInputModal from "@/app/_components/modals/CashInputModal";
import { LoadingSkeleton } from "@/src/components/LoadingSkeleton";
import { Goal } from "@/app/_types/finny";
import { useGoals } from "@/app/_hooks/useGoals";
import { useAccountBalances } from "@/app/_hooks/useAccountBalances";
import { useCashEntries } from "@/app/_hooks/useCashEntries";
import logger from "@/app/_utils/logger";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export default function HomeScreen() {
  const router = useRouter();
  const { goalsData, loading: goalsLoading, refreshGoals } = useGoals(() => {});
  const {
    accounts,
    loading: balancesLoading,
    isInitialLoad: balancesInitialLoad,
    refreshBalances,
    categorizedLiabilities,
    categorizedDeposits,
    categorizedInvestments,
    cashEntries,
    totalCash,
    refreshCash,
    accountsTotal,
    investmentsTotal,
    liabilitiesTotal,
    totalBalance,
  } = useAccountBalances();

  // Cash entries hook for managing cash operations
  const { addCashEntry, deleteCashEntry } = useCashEntries();

  // Add encouraging messages array
  const encouragingMessages = [
    "Keep going! You got this bro 💪",
    "Making progress every day! 🚀",
    "You're crushing it! 🔥",
    "Small steps, big results 🎯",
    "Building wealth, one day at a time 💎",
    "Stay focused, stay winning 🏆",
    "Your future self will thank you 🙌",
    "Financial freedom, here we come! 💫",
  ];

  // Get random message
  const randomMessage =
    encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];

  // Core states
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [updateToken, setUpdateToken] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [hasTriedLoading, setHasTriedLoading] = useState(false);

  // Modal states
  const [activeModal, setActiveModal] = useState<"accounts" | null>(null);
  const [clickedCard, setClickedCard] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [showCashInputModal, setShowCashInputModal] = useState(false);

  // Legacy states for compatibility (will be removed after migration)
  const [identity, setIdentity] = useState<Identity[]>([]);
  const [investments, setInvestments] = useState<Investment | null>(null);
  const [liabilities, setLiabilities] = useState<any>(null);
  const [institution, setInstitution] = useState<any>(null);

  const [hasNewAccounts, setHasNewAccounts] = useState(false);

  const hasLoadedOnce = useRef(false);
  const [userData, setUserData] = useState<any>(null);

  // Account Detail Modal state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [selectedAccountData, setSelectedAccountData] = useState<any>(null);
  const [selectedAccountPerformance, setSelectedAccountPerformance] =
    useState<any>(null);
  const [showAccountDetailModal, setShowAccountDetailModal] = useState(false);

  const [activeSlide, setActiveSlide] = useState(0);
  const screenWidth = Dimensions.get("window").width;

  // Dummy spending data
  const spendingData = {
    threeMonths: 12450,
    lastMonth: 3890,
  };

  const handleScroll = (event: any) => {
    const slideIndex = Math.round(
      event.nativeEvent.contentOffset.x / screenWidth
    );
    setActiveSlide(slideIndex);
  };

  const handleAccountPress = async (account: any) => {
    // Close the FinancialBottomSheet first
    setActiveModal(null);

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

    // Open the AccountDetailModal
    setShowAccountDetailModal(true);
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
          account.account_id
        );
        return null;
      }

      // Fetch the latest investment balance data
      const { data: balanceData, error: balanceError } = await supabase
        .from("investment_balances")
        .select(
          "day_change, day_change_percent, total_change, total_change_percent, total_equity"
        )
        .eq("user_id", userData?.id)
        .eq("snaptrade_user_id", connection.snaptrade_user_id)
        .eq("account_id", connection.account_id)
        .eq("is_current", true)
        .single();

      if (balanceError || !balanceData) {
        console.log(
          "No investment balance data found for account:",
          account.account_id
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

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        logger.error("Auth error:", authError?.message);
        return;
      }

      // Investment accounts are already included in getAllUserAccounts()
      // No need to populate synthetic accounts in home screen

      // Get institution info from primary item (for compatibility)
      const item_id = await getPrimaryItemId();
      let institution = null;

      if (item_id) {
        const { data: userItem, error } = await supabase
          .from("user_items")
          .select("institution_name, institution_id")
          .eq("item_id", item_id)
          .single();

        institution =
          userItem && !error
            ? {
                name: userItem.institution_name,
                institution_id: userItem.institution_id,
              }
            : null;
      }

      setInstitution(institution);

      // Set basic data for compatibility
      setIdentity([]);
      setInvestments({
        holdings: [],
        securities: [],
        investmentTransactions: [],
      });
      setLiabilities([]);

      logger.info("Home: Background data loaded", {
        institution: institution?.name || "Multiple/Unknown",
      });
    } catch (error) {
      logger.error("Error loading background data:", error);
    }
  };

  // Fetch fresh data using new cached approach
  const fetchFreshData = async () => {
    try {
      logger.info("Refreshing financial data...");
      await refreshBalances();
      await refreshGoals();

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
      openPlaidLink(updateToken);
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
      await Promise.all([fetchFreshData(), refreshGoals()]);
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

      logger.info("Home screen initialized with cached data");

      // Set access token based on whether we have any accounts (from cache or fresh)
      if (accounts.length > 0) {
        setAccessToken("connected");
        logger.info("User has connected accounts");
      } else {
        logger.warn("No accounts found - user needs to connect a bank");
        setAccessToken(null);
      }

      // Load background data without blocking UI
      loadBackgroundData();
    } catch (err) {
      logger.error("Error initializing app:", err);
      setLoadingError(true);
      setAccessToken(null);
    } finally {
      setIsInitialLoad(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initializeApp();

    // Set up event listener for financial data updates
    const subscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      (data) => {
        if (data) {
          // Accounts are now managed by useAccountBalances hook
          setIdentity(data.identity || []);
          setInvestments(data.investments || null);
          setLiabilities(data.liabilities || null);
          setInstitution(data.institution || null);
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const findClosestGoal = (goals: Goal[]) => {
    if (!goals.length) return null;

    const now = new Date();

    return goals.reduce((closest, goal) => {
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
    }, null as Goal | null);
  };

  // Memoized closest goal calculation
  const closestGoal = useMemo(() => findClosestGoal(goalsData), [goalsData]);

  // Currency formatter cache
  const formatterCache = useRef(new Map<string, Intl.NumberFormat>());

  // Helper functions
  const formatCurrency = (
    amount: number,
    currency = "USD",
    options = { decimals: 1, useKM: true }
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

  // Debug: Log all account types
  // logger.debug(
  //   "All account types:",
  //   accounts.map((acc) => ({
  //     name: acc.name,
  //     type: acc.type,
  //     subtype: (acc as any).subtype,
  //   }))
  // );

  // Financial totals are now provided by useAccountBalances hook

  // Render functions
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.push("/settings")}>
        <View style={styles.headerIconContainer}>
          <Feather name="menu" size={24} color="#4A90E2" />
        </View>
      </TouchableOpacity>
      <View style={styles.headerTextContainer}>
        <Text style={styles.greetingText}>
          Hi {userData?.user_metadata?.full_name?.split(" ")[0] || "there"}
        </Text>
        <Text style={styles.subGreeting}>Welcome Back!</Text>
      </View>
    </View>
  );

  // Show loading skeleton only during initial authentication check (very brief)
  if (isInitialLoad && !userData) {
    return <LoadingSkeleton showError={false} />;
  }

  // Show error state only if we have a critical error and no cached data
  if (
    loadingError &&
    !accessToken &&
    accounts.length === 0 &&
    hasTriedLoading
  ) {
    return <LoadingSkeleton showError={true} onRetry={retryLoading} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderHeader()}

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
        {hasNewAccounts && updateToken && (
          <TouchableOpacity
            style={styles.updateBanner}
            onPress={() => {
              openPlaidLink(updateToken);
              setHasNewAccounts(false);

              // Clear flag in Supabase after user interaction
              supabase
                .from("user_tokens")
                .update({ has_new_accounts: false })
                .eq("id", userData?.id);
            }}
          >
            <Text style={styles.updateBannerText}>
              🆕 New accounts are available. Tap here to add them.
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
          <View style={styles.finnyMessageContainer}>
            <View style={styles.finnyMessage}>
              <View style={styles.finnyIconContainer}>
                <Image
                  source={require("../assets/mascot1.jpg")}
                  style={{
                    width: 45,
                    height: 50,
                    borderRadius: 20,
                    // borderWidth: 0.2,
                    // borderColor: "#4A90E2",
                    resizeMode: "contain",
                    transform: [{ scaleX: -1 }, { rotate: "0deg" }],
                  }}
                />
              </View>
              <View style={styles.finnyMessageContent}>
                <Text style={styles.finnyMessageTitle}>Daily Progress</Text>
                <Text style={styles.finnyMessageText}>{randomMessage}</Text>
              </View>
            </View>
          </View>

          {/* Net Worth Carousel */}
          <View style={[styles.netWorthCard, { padding: 0 }]}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              style={{ width: screenWidth - 40 }} // Adjust for container padding
            >
              {/* Spending Slide */}
              <View style={[styles.carouselSlide, { width: screenWidth - 40 }]}>
                <Text style={styles.netWorthLabel}>SPENDING</Text>
                <View style={styles.spendingContainer}>
                  <View style={styles.spendingColumn}>
                    <Text style={styles.spendingLabel}>LAST 3 MONTHS AVG</Text>
                    <Text style={styles.spendingAmount}>
                      {formatCurrency(spendingData.threeMonths, "USD", {
                        decimals: 0,
                        useKM: true,
                      })}
                    </Text>
                    <View style={styles.spendingTrend}>
                      <Ionicons
                        name="trending-down"
                        size={16}
                        color="#FF6B6B"
                      />
                      <Text
                        style={[styles.netWorthTrendText, { color: "#FF6B6B" }]}
                      >
                        +12.4% vs prev
                      </Text>
                    </View>
                  </View>
                  <View style={styles.spendingDivider} />
                  <View style={styles.spendingColumn}>
                    <Text style={styles.spendingLabel}>LAST MONTH</Text>
                    <Text style={styles.spendingAmount}>
                      {formatCurrency(spendingData.lastMonth, "USD", {
                        decimals: 0,
                        useKM: true,
                      })}
                    </Text>
                    <View style={styles.spendingTrend}>
                      <Ionicons name="trending-up" size={16} color="#4ECDC4" />
                      <Text
                        style={[styles.netWorthTrendText, { color: "#4ECDC4" }]}
                      >
                        -8.2% vs prev
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Net Worth Slide */}
              <View
                style={[
                  styles.carouselSlide,
                  { width: screenWidth - 40, paddingTop: 15 },
                ]}
              >
                <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
                <Text style={styles.netWorthText}>
                  {formatCurrency(totalBalance, "USD", {
                    decimals: 2,
                    useKM: false,
                  })}
                </Text>
                <View style={styles.netWorthTrend}>
                  <Ionicons name="trending-up" size={16} color="#4ECDC4" />
                  <Text style={styles.netWorthTrendText}>+2.4% this month</Text>
                </View>
              </View>
            </ScrollView>

            {/* Carousel Dots */}
            <View style={styles.carouselDots}>
              {[0, 1].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.carouselDot,
                    activeSlide === index && styles.carouselDotActive,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <FinancialCard
              title="Accounts"
              amount={formatCurrency(accountsTotal, "USD", {
                decimals: 1,
                useKM: true,
              })}
              icon="wallet-outline"
              onPress={() => {
                setClickedCard("accounts");
                setActiveModal("accounts");
              }}
              iconColor="#4A90E2"
            />
            <FinancialCard
              title="Investments"
              amount={formatCurrency(investmentsTotal, "USD", {
                decimals: 1,
                useKM: true,
              })}
              icon="trending-up"
              onPress={() => {
                setClickedCard("investments");
                setActiveModal("accounts");
              }}
              iconColor="#4ECDC4"
            />
            <FinancialCard
              title="Liabilities"
              amount={formatCurrency(liabilitiesTotal, "USD", {
                decimals: 1,
                useKM: true,
              })}
              icon="card-outline"
              onPress={() => {
                setClickedCard("liabilities");
                setActiveModal("accounts");
              }}
              iconColor="#FF6B6B"
            />
          </View>

          {/* Goals Progress */}
          <View style={styles.goalsSection}>
            {goalsData.length > 0 && (
              <View style={styles.goalsSectionHeader}>
                <View style={styles.goalsTitleContainer}>
                  <Ionicons name="trophy" size={20} color="#4A90E2" />
                  <Text style={styles.sectionTitle}>Your Focus 🎯</Text>
                </View>
                <TouchableOpacity
                  onPress={() => router.push("/goals")}
                  style={styles.viewAllButton}
                >
                  <Text style={styles.viewAllText}>View all goals</Text>
                </TouchableOpacity>
              </View>
            )}
            {closestGoal ? (
              <View style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalTitle}>{closestGoal.label}</Text>
                  <Text style={styles.goalAmount}>
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }).format(closestGoal.current_amount || 0)}{" "}
                    of{" "}
                    {formatCurrency(closestGoal.target_amount || 0, "USD", {
                      decimals: 0,
                      useKM: true,
                    })}
                  </Text>
                </View>
                <View style={styles.progressBarBackground}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${
                          closestGoal.target_amount > 0
                            ? Math.min(
                                (closestGoal.current_amount /
                                  closestGoal.target_amount) *
                                  100,
                                100
                              )
                            : 0
                        }%`,
                      },
                    ]}
                  />
                </View>
                <View style={styles.goalPercentContainer}>
                  <Ionicons name="trending-up" size={14} color="#4ECDC4" />
                  <Text
                    style={{
                      fontWeight: "600",
                      color: "#4ECDC4",
                      fontSize: 12,
                      marginLeft: 2,
                    }}
                  >
                    {closestGoal.target_amount > 0
                      ? Math.round(
                          (closestGoal.current_amount /
                            closestGoal.target_amount) *
                            100
                        )
                      : 0}
                    % Progress
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyGoalsContainer}>
                <View style={styles.emptyGoalsContent}>
                  <View style={styles.emptyGoalsImageContainer}>
                    <Image
                      source={require("../assets/mascot1.jpg")}
                      style={[
                        styles.emptyGoalsImage,
                        {
                          transform: [{ scaleX: -1 }, { rotate: "0deg" }],
                        },
                      ]}
                      resizeMode="contain"
                    />
                  </View>
                  <View style={styles.emptyGoalsTextContainer}>
                    <Text style={styles.emptyGoalsTitle}>No Goals Yet</Text>
                    <Text style={styles.emptyGoalsDescription}>
                      Start your financial journey by setting your first goal.
                    </Text>
                    <TouchableOpacity
                      style={styles.addFirstGoalButton}
                      onPress={() => {
                        router.push({
                          pathname: "/goals",
                          params: { openAddGoal: "true" },
                        });
                      }}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.addFirstGoalText}>
                        Add Your First Goal
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Add Account Button */}
          <TouchableOpacity
            style={styles.addAccountButton}
            onPress={() => {
              logger.info("Add Another Account pressed from home screen");
              setShowCategoryModal(true);
            }}
          >
            <Text style={styles.addAccountButtonText}>
              + Add Another Account
            </Text>
          </TouchableOpacity>

          {/* Bottom Sheets */}
          <FinancialBottomSheet
            visible={activeModal === "accounts"}
            onClose={() => {
              setActiveModal(null);
              setClickedCard(null);
            }}
            title="Your Financial Accounts"
            icon="wallet-outline"
            initialExpandedCategory={clickedCard || undefined}
            onAccountAdded={async () => {
              logger.info("New account added, refreshing financial data...");
              await fetchFreshData();
              logger.info("Financial data refreshed after new account");
            }}
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
                    balance={formatCurrency(
                      account.balances?.current || 0,
                      "USD",
                      { decimals: 0, useKM: false }
                    )}
                    icon="wallet-outline"
                    bankName={account.institution_name || "Unknown Bank"}
                    accountId={account.account_id}
                    accountData={account}
                    onPress={() => handleAccountPress(account)}
                  />
                )),
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
                    balance={formatCurrency(
                      account.balances?.current || 0,
                      "USD",
                      { decimals: 0, useKM: false }
                    )}
                    icon="trending-up"
                    bankName={account.institution_name || "Investment Broker"}
                    accountId={account.account_id}
                    accountData={account}
                    onPress={() => handleAccountPress(account)}
                  />
                )),
              },
              {
                title: "CREDIT CARDS",
                icon: "card-outline" as keyof typeof Ionicons.glyphMap,
                iconColor: "#FF6B6B",
                items: categorizedLiabilities
                  .filter(
                    (acc) =>
                      acc.type === "credit" ||
                      (acc as any).subtype === "credit card"
                  )
                  .map((account, index) => (
                    <AccountItem
                      key={index}
                      name={account.name}
                      type={account.type}
                      balance={formatCurrency(
                        account.balances?.current || 0,
                        "USD",
                        { decimals: 0, useKM: false }
                      )}
                      icon="card-outline"
                      bankName={account.institution_name || "Unknown Bank"}
                      accountId={account.account_id}
                      accountData={account}
                      onPress={() => handleAccountPress(account)}
                    />
                  )),
              },
              {
                title: "LOANS",
                icon: "receipt-outline" as keyof typeof Ionicons.glyphMap,
                iconColor: "#FF9F43",
                items: categorizedLiabilities
                  .filter(
                    (acc) =>
                      acc.type === "loan" ||
                      (acc as any).subtype?.includes("loan")
                  )
                  .map((account, index) => (
                    <AccountItem
                      key={index}
                      name={account.name}
                      type={account.type}
                      balance={formatCurrency(
                        account.balances?.current || 0,
                        "USD",
                        { decimals: 0, useKM: false }
                      )}
                      icon="receipt-outline"
                      bankName={account.institution_name || "Unknown Bank"}
                      accountId={account.account_id}
                      accountData={account}
                      onPress={() => handleAccountPress(account)}
                    />
                  )),
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
                                  entry.id
                                );

                                // Refresh all financial data to update UI and net worth
                                await fetchFreshData();
                                logger.info(
                                  "🔄 Financial data refreshed after cash deletion"
                                );
                              } catch (error) {
                                logger.error(
                                  "❌ Failed to delete cash entry:",
                                  error
                                );
                                Alert.alert(
                                  "Error",
                                  "Failed to delete cash entry. Please try again.",
                                  [{ text: "OK" }]
                                );
                              }
                            },
                          },
                        ]
                      );
                    }}
                  />
                )),
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
                        itemId
                      );
                      await fetchFreshData();
                    },
                    (error) => {
                      logger.error("Failed to add new cash account:", error);
                    }
                  );
                } else {
                  // Use standard bank account addition flow
                  await addNewBankAccount(
                    async (itemId) => {
                      logger.info(
                        "Successfully added new cash account:",
                        itemId
                      );
                      await fetchFreshData();
                    },
                    (error) => {
                      logger.error("Failed to add new cash account:", error);
                    }
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
                      itemId
                    );
                    await fetchFreshData();
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

          {/* Account Detail Modal */}
          <AccountDetailModal
            visible={showAccountDetailModal}
            accountId={selectedAccountId}
            account={selectedAccountData}
            investmentPerformance={selectedAccountPerformance}
            onClose={async () => {
              setShowAccountDetailModal(false);
              setSelectedAccountId(null);
              setSelectedAccountData(null);
              setSelectedAccountPerformance(null);
              // Refresh balances to reflect any account deletions
              await refreshBalances();
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

                // Refresh account balances to update the FinancialBottomSheet and net worth
                // Note: addCashEntry already refreshes cash entries internally
                await refreshBalances();

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
        </ScrollView>
      </>
    </SafeAreaView>
  );
}
