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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { styles } from "../styles/homeStyles";
import {
  getUpdateLinkToken,
  openPlaidLink,
  fetchInitialData,
} from "../utils/plaid";
import {
  Account,
  Identity,
  Investment,
  Holding,
  Security,
} from "../types/plaid";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase/supabase";
import FinancialBottomSheet from "../components/shared/FinancialBottomSheet";
import FinancialCard from "../components/shared/FinancialCard";
import AccountItem from "../components/shared/AccountItem";
import { Goal } from "../types/finny";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export default function HomeScreen() {
  const router = useRouter();

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

  const [timelineData, setTimelineData] = useState<Goal[]>([]);

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

  // Save data to AsyncStorage
  const saveDataToStorage = async (data: any) => {
    try {
      await AsyncStorage.setItem("financialData", JSON.stringify(data));
    } catch (error) {
      console.error("Error saving data to storage:", error);
    }
  };

  // Load data from AsyncStorage
  const loadDataFromStorage = async () => {
    try {
      const storedData = await AsyncStorage.getItem("financialData");
      if (storedData) {
        const data = JSON.parse(storedData);
        setAccounts(data.accounts || []);
        setIdentity(data.identity || []);
        setInvestments(data.investments || null);
        setLiabilities(data.liabilities || null);
        setInstitution(data.institution || null);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error loading data from storage:", error);
      return false;
    }
  };

  // Fetch fresh data from Plaid
  const fetchFreshData = async (token: string) => {
    try {
      // First check if update mode is required
      const accountsResponse = await fetch(
        "https://financify-rose.vercel.app/api/plaid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: "accounts", access_token: token }),
        }
      );

      const accountsData = await accountsResponse.json();

      if (accountsData.requires_update_mode) {
        console.warn("⚠️ Update mode required");
        const newUpdateToken = await getUpdateLinkToken(token);
        setUpdateToken(newUpdateToken);
        setShowUpdateBanner(true);
        return;
      }

      // Fetch all data in parallel
      const [
        identityResponse,
        investmentsResponse,
        liabilitiesResponse,
        institutionResponse,
      ] = await Promise.all([
        fetch("https://financify-rose.vercel.app/api/plaid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: "identity", access_token: token }),
        }),
        fetch("https://financify-rose.vercel.app/api/plaid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: "investments",
            access_token: token,
          }),
        }),
        fetch("https://financify-rose.vercel.app/api/plaid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: "liabilities",
            access_token: token,
          }),
        }),
        fetch("https://financify-rose.vercel.app/api/plaid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: "institution",
            access_token: token,
          }),
        }),
      ]);

      const [identityData, investmentsData, liabilitiesData, institutionData] =
        await Promise.all([
          identityResponse.json(),
          investmentsResponse.json(),
          liabilitiesResponse.json(),
          institutionResponse.json(),
        ]);

      const data = {
        accounts: accountsData.accounts || [],
        identity: identityData.identity || [],
        investments: {
          holdings: investmentsData.holdings || [],
          securities: investmentsData.securities || [],
          investmentTransactions: investmentsData.investment_transactions || [],
        },
        liabilities: liabilitiesData.liabilities || [],
        institution: institutionData.institution || null,
      };

      // Update state and save data
      setAccounts(data.accounts);
      setIdentity(data.identity);
      setInvestments(data.investments);
      setLiabilities(data.liabilities);
      setInstitution(data.institution);

      // 🔍 COMPREHENSIVE DATA LOGGING
      console.log("🏦 ===== COMPLETE FINANCIAL DATA ANALYSIS =====");
      console.log("🏢 INSTITUTION INFO:", data.institution);
      console.log("💰 ACCOUNTS SAMPLE:", data.accounts?.[0]);
      console.log("📈 INVESTMENTS SAMPLE:", {
        holdings: data.investments?.holdings?.[0],
        securities: data.investments?.securities?.[0],
      });
      console.log("💳 LIABILITIES SAMPLE:", data.liabilities?.[0]);
      console.log("🆔 IDENTITY SAMPLE:", data.identity?.[0]);
      console.log("🔍 INSTITUTION NAME:", data.institution?.name);
      console.log("🌐 INSTITUTION URL:", data.institution?.url);
      console.log("🎨 INSTITUTION LOGO:", data.institution?.logo);
      console.log("🏦 ===============================================");

      console.log("✅ Fetched fresh data");
      await saveDataToStorage(data);
      DeviceEventEmitter.emit("financialDataRefreshed", data);
    } catch (error) {
      console.log("❌ Error fetching data:", error);
    }
  };

  const handleUpdateBannerPress = () => {
    if (updateToken) {
      openPlaidLink(updateToken);
      setShowUpdateBanner(false);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = async () => {
    if (!accessToken) return;
    setRefreshing(true);

    try {
      console.log("🔄 Refreshing financial data...");
      const data = await fetchInitialData();

      if (data.accounts && data.accounts.length > 0) {
        setAccounts(data.accounts);
        setIdentity(data.identity || []);
        setInvestments(
          data.investments && data.investments.holdings
            ? data.investments
            : null
        );
        setLiabilities(data.liabilities || []);
        setInstitution(data.institution);

        await saveDataToStorage({
          accounts: data.accounts,
          identity: data.identity,
          investments: data.investments,
          liabilities: data.liabilities,
          institution: data.institution,
        });

        console.log("✅ Financial data refreshed successfully");
      }
    } catch (error) {
      console.error("❌ Error refreshing data:", error);
    }

    setRefreshing(false);
  };

  // Initial setup and data loading
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        console.log("User in home screen:", user?.email);
        setUserData(user);

        console.log(
          "🚀 Loading financial data using new multi-bank approach..."
        );

        // Use the new fetchInitialData function
        const data = await fetchInitialData();

        console.log("📊 Received data:", {
          accounts: data.accounts?.length || 0,
          institution: data.institution?.name || "None",
          investments: data.investments?.holdings?.length || 0,
          liabilities: data.liabilities?.length || 0,
        });

        if (data.accounts && data.accounts.length > 0) {
          // We have connected banks - set all the data
          setAccounts(data.accounts);
          setIdentity(data.identity || []);
          setInvestments(
            data.investments && data.investments.holdings
              ? data.investments
              : null
          );
          setLiabilities(data.liabilities || []);
          setInstitution(data.institution);
          setAccessToken("connected"); // Set a flag to show we have data

          // Save data to storage for offline access
          await saveDataToStorage({
            accounts: data.accounts,
            identity: data.identity,
            investments: data.investments,
            liabilities: data.liabilities,
            institution: data.institution,
          });

          console.log("✅ Successfully loaded financial data");
        } else {
          console.log("⚠️ No accounts found - user needs to connect a bank");
          setAccessToken(null);

          // Try to load from storage as fallback
          const dataLoaded = await loadDataFromStorage();
          if (dataLoaded) {
            console.log("📦 Loaded fallback data from storage");
          }
        }
      } catch (err) {
        console.error("❌ Error initializing app:", err);
        setAccessToken(null);

        // Try to load from storage as fallback
        const dataLoaded = await loadDataFromStorage();
        if (dataLoaded) {
          console.log("📦 Loaded fallback data from storage after error");
        }
      } finally {
        setIsInitialLoad(false);
        setIsLoading(false);
      }
    };

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

  const getMonthNumber = (monthName: string): number => {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return months.indexOf(monthName);
  };

  const findClosestGoal = (goals: Goal[]) => {
    if (!goals.length) return null;

    const now = new Date();

    return goals.reduce((closest, goal) => {
      // Create dates for comparison
      const goalDate = new Date(
        Number(goal.timeline.year),
        getMonthNumber(goal.timeline.month),
        1
      );

      const closestDate = closest
        ? new Date(
            Number(closest.timeline.year),
            getMonthNumber(closest.timeline.month),
            1
          )
        : null;

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

  useEffect(() => {
    const loadGoals = async () => {
      try {
        const storedGoals = await AsyncStorage.getItem("goals");
        if (storedGoals) {
          setTimelineData(JSON.parse(storedGoals));
        }
      } catch (error) {
        console.error("Error loading goals:", error);
      }
    };
    loadGoals();
  }, []);

  const closestGoal = findClosestGoal(timelineData);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderHeader()}

      {!accessToken ? (
        <View style={styles.disconnectedContainer}>
          <Text style={styles.disconnectedTitle}>Something went wrong</Text>
          <Text style={styles.disconnectedDescription}>
            We couldn't find your connected bank account. Please reconnect from
            settings.
          </Text>
          <ActivityIndicator size="large" color="#4A90E2" />
        </View>
      ) : (
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

          {isInitialLoad ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#4A90E2" />
            </View>
          ) : isLoading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#4A90E2" />
            </View>
          ) : (
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
                  <View
                    style={[styles.carouselSlide, { width: screenWidth - 40 }]}
                  >
                    <Text style={styles.netWorthLabel}>SPENDING</Text>
                    <View style={styles.spendingContainer}>
                      <View style={styles.spendingColumn}>
                        <Text style={styles.spendingLabel}>
                          LAST 3 MONTHS AVG
                        </Text>
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
                            style={[
                              styles.netWorthTrendText,
                              { color: "#FF6B6B" },
                            ]}
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
                          <Ionicons
                            name="trending-up"
                            size={16}
                            color="#4ECDC4"
                          />
                          <Text
                            style={[
                              styles.netWorthTrendText,
                              { color: "#4ECDC4" },
                            ]}
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
                      <Text style={styles.netWorthTrendText}>
                        +2.4% this month
                      </Text>
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
                {timelineData.length > 0 && (
                  <View style={styles.goalsSectionHeader}>
                    <View style={styles.goalsTitleContainer}>
                      <Ionicons name="trophy" size={20} color="#4A90E2" />
                      <Text style={styles.sectionTitle}>Your Focus 🎯</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push("/timeline")}
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
                        }).format(
                          (closestGoal.target || 0) *
                            ((closestGoal.progress || 0) / 100)
                        )}{" "}
                        of{" "}
                        {formatCurrency(closestGoal.target || 0, "USD", {
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
                            width: `${closestGoal.progress || 0}%`,
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
                        +{Math.round(closestGoal.progress || 0)}% Progress
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
                          Start your financial journey by setting your first
                          goal.
                        </Text>
                        <TouchableOpacity
                          style={styles.addFirstGoalButton}
                          onPress={() => {
                            router.push({
                              pathname: "/timeline",
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
              <TouchableOpacity style={styles.addAccountButton}>
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
                        balance={formatCurrency(account.balances.current || 0)}
                        icon="wallet-outline"
                        bankName={institution?.name}
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
                            account.balances.current || 0
                          )}
                          icon="card-outline"
                          bankName={institution?.name}
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
                            account.balances.current || 0
                          )}
                          icon="receipt-outline"
                          bankName={institution?.name}
                        />
                      )),
                  },
                  {
                    title: "INVESTMENTS",
                    icon: "trending-up" as keyof typeof Ionicons.glyphMap,
                    iconColor: "#4ECDC4",
                    items: (investments?.holdings || []).map(
                      (holding, index) => (
                        <AccountItem
                          key={index}
                          name={holding.security_id}
                          type="Investment"
                          balance={formatCurrency(
                            holding.institution_value || 0
                          )}
                          icon="trending-up"
                          bankName={institution?.name}
                        />
                      )
                    ),
                  },
                ]}
              />
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}
