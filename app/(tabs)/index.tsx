import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  UIManager,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  DeviceEventEmitter,
  Image,
  Dimensions,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { styles } from "../_styles/homeStyles";
import { supabase } from "../_lib/supabase/supabase";
import {
  getUpdateLinkToken,
  openPlaidLink,
  getAllUserAccounts,
  getPrimaryItemId,
  clearOldPlaidData,
  getItemIds,
  addNewBankAccount,
} from "../_utils/plaid";
import {
  Account,
  Identity,
  Investment,
  Holding,
  Security,
} from "../_types/plaid";
import { useRouter } from "expo-router";
import FinancialBottomSheet from "../_components/shared/FinancialBottomSheet";
import FinancialCard from "../_components/shared/FinancialCard";
import AccountItem from "../_components/shared/AccountItem";
import { LoadingSkeleton } from "../../src/components/LoadingSkeleton";
import { Goal } from "../_types/finny";
import { useGoals } from "../_hooks/useGoals";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export default function HomeScreen() {
  const router = useRouter();
  const { goalsData, loading: goalsLoading, refreshGoals } = useGoals(() => {});

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
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [updateToken, setUpdateToken] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState(false);
  const [hasTriedLoading, setHasTriedLoading] = useState(false);

  // Modal states
  const [activeModal, setActiveModal] = useState<"accounts" | null>(null);

  // Financial data states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [identity, setIdentity] = useState<Identity[]>([]);
  const [investments, setInvestments] = useState<Investment | null>(null);
  const [liabilities, setLiabilities] = useState<any>(null);
  const [institution, setInstitution] = useState<any>(null);

  const [hasNewAccounts, setHasNewAccounts] = useState(false);

  const hasLoadedOnce = useRef(false);
  const [userData, setUserData] = useState<any>(null);

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

  // Load data directly from Supabase database (secure method)
  const loadDataFromDatabase = async () => {
    try {
      console.log("🏠 Home: Loading data from Supabase database...");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        console.log("❌ Auth error:", authError?.message);
        return false;
      }

      // Get accounts directly from database (same as insights)
      const accounts = await getAllUserAccounts(user.id);
      setAccounts(accounts || []);

      // Get institution info from primary item
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

      console.log("✅ Home: Data loaded from database", {
        institution: institution?.name || "Multiple/Unknown",
        accounts: accounts?.length || 0,
      });

      return accounts && accounts.length > 0;
    } catch (error) {
      console.error("❌ Error loading data from database:", error);
      return false;
    }
  };

  // Fetch fresh data using new Supabase approach (secure method)
  const fetchFreshData = async () => {
    try {
      console.log("🔄 Refreshing financial data from database...");
      const hasData = await loadDataFromDatabase();
      if (hasData) {
        console.log("✅ Financial data refreshed successfully");
        // Emit event for other components (like insights)
        DeviceEventEmitter.emit("financialDataRefreshed", {
          accounts,
          transactions: [], // Transactions loaded separately in insights
        });
      } else {
        console.log("⚠️ No data available after refresh");
      }
    } catch (error) {
      console.error("❌ Error refreshing data:", error);
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
      console.error("❌ Error during refresh:", error);
    }

    setRefreshing(false);
  };

  // Initial setup and data loading
  const initializeApp = async () => {
    try {
      setLoadingError(false);
      setHasTriedLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log("User in home screen:", user?.email);
      setUserData(user);

      if (!user?.id) {
        console.log("❌ No authenticated user found");
        setAccessToken(null);
        return;
      }

      console.log("🚀 Loading financial data from secure database...");

      // Load data directly from database (secure method)
      const hasData = await loadDataFromDatabase();

      if (hasData) {
        setAccessToken("connected");
        console.log("✅ Successfully loaded financial data from database");
      } else {
        console.log("⚠️ No accounts found - user needs to connect a bank");
        setAccessToken(null);
      }
    } catch (err) {
      console.error("❌ Error initializing app:", err);
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
          setAccounts(data.accounts || []);
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

  const closestGoal = findClosestGoal(goalsData);

  // Helper functions
  const formatCurrency = (
    amount: number,
    currency = "USD",
    options = { decimals: 1, useKM: true }
  ) => {
    if (options.useKM) {
      if (Math.abs(amount) >= 1000000) {
        return (
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            minimumFractionDigits: options.decimals,
            maximumFractionDigits: options.decimals,
          }).format(amount / 1000000) + "M"
        );
      }
      if (Math.abs(amount) >= 1000) {
        return (
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            minimumFractionDigits: options.decimals,
            maximumFractionDigits: options.decimals,
          }).format(amount / 1000) + "K"
        );
      }
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: options.decimals,
      maximumFractionDigits: options.decimals,
    }).format(amount);
  };

  // Debug: Log all account types
  console.log(
    "🔍 All account types:",
    accounts.map((acc) => ({
      name: acc.name,
      type: acc.type,
      subtype: (acc as any).subtype,
    }))
  );

  const categorizedLiabilities = accounts.filter(
    (acc) => acc.type === "loan" || acc.type === "credit"
  );

  const categorizedDeposits = accounts.filter(
    (acc) => acc.type === "depository"
  );

  // Debug: Log categorization results
  console.log("💰 Categorized Deposits:", categorizedDeposits.length);
  console.log("💳 Categorized Liabilities:", categorizedLiabilities.length);
  console.log("📈 Investment Holdings:", investments?.holdings?.length || 0);

  const accountsTotal = categorizedDeposits.reduce(
    (acc, a) => acc + (a.balances.current || 0),
    0
  );

  const investmentsTotal =
    investments?.holdings?.reduce(
      (acc, h) => acc + (h.institution_value || 0),
      0
    ) || 0;

  const liabilitiesTotal = categorizedLiabilities.reduce(
    (acc, a) => acc + (a.balances.current || 0),
    0
  );

  const totalBalance = accountsTotal + investmentsTotal - liabilitiesTotal;

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

  // Show loading skeleton during initial load or when loading
  if (isInitialLoad || isLoading) {
    return <LoadingSkeleton showError={false} />;
  }

  // Show error state if we have an error and no cached data
  if (loadingError && !accessToken) {
    return <LoadingSkeleton showError={true} onRetry={retryLoading} />;
  }

  // Show error state if we've tried loading but have no access token and no cached data
  if (hasTriedLoading && !accessToken && accounts.length === 0) {
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
              onPress={() => setActiveModal("accounts")}
              iconColor="#4A90E2"
            />
            <FinancialCard
              title="Investments"
              amount={formatCurrency(investmentsTotal, "USD", {
                decimals: 1,
                useKM: true,
              })}
              icon="trending-up"
              onPress={() => setActiveModal("accounts")}
              iconColor="#4ECDC4"
            />
            <FinancialCard
              title="Liabilities"
              amount={formatCurrency(liabilitiesTotal, "USD", {
                decimals: 1,
                useKM: true,
              })}
              icon="card-outline"
              onPress={() => setActiveModal("accounts")}
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
            onPress={async () => {
              console.log("🏦 Add Another Account pressed from home screen");
              try {
                await addNewBankAccount(
                  async (itemId) => {
                    console.log(
                      "✅ Successfully added new bank account from home:",
                      itemId
                    );
                    await fetchFreshData();
                  },
                  (error) => {
                    console.error(
                      "❌ Failed to add new bank account from home:",
                      error
                    );
                  }
                );
              } catch (error) {
                console.error("❌ Error calling addNewBankAccount:", error);
              }
            }}
          >
            <Text style={styles.addAccountButtonText}>
              + Add Another Account
            </Text>
          </TouchableOpacity>

          {/* Bottom Sheets */}
          <FinancialBottomSheet
            visible={activeModal === "accounts"}
            onClose={() => setActiveModal(null)}
            title="Your Financial Accounts"
            icon="wallet-outline"
            onAccountAdded={async () => {
              console.log("🔄 New account added, refreshing financial data...");
              await fetchFreshData();
              console.log("✅ Financial data refreshed after new account");
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
                      account.balances.current || 0,
                      "USD",
                      { decimals: 0, useKM: false }
                    )}
                    icon="wallet-outline"
                    bankName={account.institution_name || "Unknown Bank"}
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
                        account.balances.current || 0,
                        "USD",
                        { decimals: 0, useKM: false }
                      )}
                      icon="card-outline"
                      bankName={account.institution_name || "Unknown Bank"}
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
                        account.balances.current || 0,
                        "USD",
                        { decimals: 0, useKM: false }
                      )}
                      icon="receipt-outline"
                      bankName={account.institution_name || "Unknown Bank"}
                    />
                  )),
              },
              {
                title: "INVESTMENTS",
                icon: "trending-up" as keyof typeof Ionicons.glyphMap,
                iconColor: "#4ECDC4",
                items: (investments?.holdings || []).map((holding, index) => (
                  <AccountItem
                    key={index}
                    name={holding.security_id}
                    type="Investment"
                    balance={formatCurrency(
                      holding.institution_value || 0,
                      "USD",
                      { decimals: 0, useKM: false }
                    )}
                    icon="trending-up"
                    bankName={institution?.name || "Investment Account"}
                  />
                )),
              },
            ]}
          />
        </ScrollView>
      </>
    </SafeAreaView>
  );
}
