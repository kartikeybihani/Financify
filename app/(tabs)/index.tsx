import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  DeviceEventEmitter,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { styles } from "../styles/homeStyles";
import {
  fetchLinkToken,
  handlePlaidConnect,
  fetchInitialData,
  triggerWebhook,
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
import { LinearGradient } from "expo-linear-gradient";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export default function HomeScreen() {
  const router = useRouter();

  // Core states
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Financial data states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [identity, setIdentity] = useState<Identity[]>([]);
  const [investments, setInvestments] = useState<Investment | null>(null);
  const [liabilities, setLiabilities] = useState<any>(null);
  const [institution, setInstitution] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const hasLoadedOnce = useRef(false);

  const [userData, setUserData] = useState<any>(null);

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
      const data = await fetchInitialData(token);
      if (data) {
        setAccounts(data.accounts || []);
        setIdentity(data.identity || []);
        setInvestments(data.investments || null);
        setLiabilities(data.liabilities || null);
        setInstitution(data.institution || null);
        await saveDataToStorage(data);
        DeviceEventEmitter.emit("financialDataRefreshed", data);
        await triggerWebhook(token);
        console.log("Webhook triggered");
      }
    } catch (error) {
      console.error("Error fetching fresh data:", error);
    }
  };

  // Handle pull-to-refresh
  const onRefresh = async () => {
    if (!accessToken) return;
    setRefreshing(true);
    await fetchFreshData(accessToken);
    setRefreshing(false);
  };

  // Handle Plaid connection
  const handleConnect = async () => {
    if (!linkToken) return;
    await handlePlaidConnect(linkToken, async (token) => {
      await AsyncStorage.setItem("accessToken", token);
      setAccessToken(token);
      await fetchFreshData(token);
    });
  };

  // Toggle section expansion
  const toggleSection = (section: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  // Initial setup and data loading
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Fetch user data from Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUserData(user);

        const token = await AsyncStorage.getItem("accessToken");
        if (token) {
          setAccessToken(token);
          const dataLoaded = await loadDataFromStorage();
          if (!dataLoaded) {
            await fetchFreshData(token);
          }
        } else {
          const newLinkToken = await fetchLinkToken();
          setLinkToken(newLinkToken);
        }
      } catch (error) {
        console.error("Error during initialization:", error);
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

  // Helper functions
  const formatCurrency = (amount: number, currency = "USD", decimals = 2) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  };

  const userName = identity?.[0]?.owners?.[0]?.names?.[0] || "there";

  // Render functions
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.push("/settings")}>
        <Feather name="menu" size={28} color="#fff" />
      </TouchableOpacity>
      <View style={styles.headerTextContainer}>
        <Text style={styles.greetingText}>
          Hi {userData?.user_metadata?.full_name || "there"}
        </Text>
        <Text style={styles.subGreeting}>Welcome Back!</Text>
      </View>
    </View>
  );

  const renderDisconnectedState = () => (
    <View style={styles.disconnectedContainer}>
      <View style={styles.disconnectedContent}>
        <Ionicons name="wallet-outline" size={80} color="#4A90E2" />
        <Text style={styles.disconnectedTitle}>Connect Your Bank Account</Text>
        <Text style={styles.disconnectedDescription}>
          Link your bank accounts to see your financial overview, track your net
          worth, and manage your investments all in one place.
        </Text>
        <TouchableOpacity
          style={styles.connectButton}
          onPress={handleConnect}
          disabled={!linkToken}
        >
          <Text style={styles.connectButtonText}>
            {linkToken ? "Connect Bank Account" : "Loading..."}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConnectedState = () => (
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
      <Text style={styles.title}>Net Worth</Text>
      <View style={styles.netWorthCard}>
        <Text style={styles.netWorthText}>{formatCurrency(totalBalance)}</Text>
        <View style={styles.netWorthBreakdown}>
          <View style={styles.breakdownItem}>
            <Ionicons
              name="wallet-outline"
              size={16}
              color="#4A90E2"
              style={styles.breakdownIcon}
            />
            <Text style={styles.breakdownLabel}>Accounts</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(accountsTotal, "USD", 1)}
            </Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownItem}>
            <Ionicons
              name="trending-up-outline"
              size={16}
              color="#4A90E2"
              style={styles.breakdownIcon}
            />
            <Text style={styles.breakdownLabel}>Investments</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(investmentsTotal, "USD", 1)}
            </Text>
          </View>
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownItem}>
            <Ionicons
              name="card-outline"
              size={16}
              color="#4A90E2"
              style={styles.breakdownIcon}
            />
            <Text style={styles.breakdownLabel}>Liabilities</Text>
            <Text style={styles.breakdownValue}>
              {formatCurrency(liabilitiesTotal, "USD", 1)}
            </Text>
          </View>
        </View>
      </View>

      {/* Goals Progress */}
      <View style={styles.goalsSection}>
        <Text style={styles.sectionTitle}>Active Goals</Text>
        {dummyGoals.map((goal, idx) => (
          <View key={idx} style={styles.goalCard}>
            <Text style={styles.goalTitle}>{goal.title}</Text>
            <View style={styles.progressBarBackground}>
              <LinearGradient
                colors={["#4A90E2", "#007AFF"]}
                start={[0, 0]}
                end={[1, 0]}
                style={[
                  styles.progressBarFill,
                  { width: `${goal.progress * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.goalPercent}>
              {Math.round(goal.progress * 100)}%
            </Text>
          </View>
        ))}
      </View>

      {/* Bank Accounts */}
      <View style={styles.section}>
        <TouchableOpacity
          onPress={() => toggleSection("accounts")}
          style={styles.sectionHeader}
        >
          <Text style={styles.sectionTitle}>Bank Accounts</Text>
          <Ionicons
            name={
              expandedSections.includes("accounts")
                ? "chevron-up"
                : "chevron-down"
            }
            size={20}
            color="#888"
          />
        </TouchableOpacity>
        {expandedSections.includes("accounts") && (
          <View style={styles.sectionContent}>
            <View style={styles.cardRow}>
              {categorizedDeposits.map((acc, idx) => (
                <View key={idx} style={styles.accountCard}>
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      {/* <View style={styles.cardIconContainer}>
                        <Ionicons
                          name="wallet-outline"
                          size={16}
                          color="#4A90E2"
                        />
                      </View> */}
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardName} numberOfLines={1}>
                          {acc.name}
                        </Text>
                        <Text style={styles.cardType}>{acc.subtype}</Text>
                      </View>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardBalance}>
                        {formatCurrency(acc.balances.current)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Investments */}
      <View style={styles.section}>
        <TouchableOpacity
          onPress={() => toggleSection("investments")}
          style={styles.sectionHeader}
        >
          <Text style={styles.sectionTitle}>Investments</Text>
          <Ionicons
            name={
              expandedSections.includes("investments")
                ? "chevron-up"
                : "chevron-down"
            }
            size={20}
            color="#888"
          />
        </TouchableOpacity>
        {expandedSections.includes("investments") && investments && (
          <View style={styles.sectionContent}>
            {investments.holdings && investments.holdings.length > 0 ? (
              <View style={styles.cardRow}>
                {investments.holdings.map((h: Holding, idx: number) => {
                  const security = investments.securities?.find(
                    (s: Security) => s.security_id === h.security_id
                  );
                  return (
                    <View key={idx} style={styles.accountCard}>
                      <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                          <View style={styles.cardIconContainer}>
                            <Ionicons
                              name="trending-up-outline"
                              size={16}
                              color="#4A90E2"
                            />
                          </View>
                          <View style={styles.cardInfo}>
                            <Text style={styles.cardName}>
                              {security?.name}
                            </Text>
                            <Text style={styles.cardType}>
                              {security?.ticker_symbol || "N/A"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.cardFooter}>
                          <Text style={styles.cardBalance}>
                            {formatCurrency(h.institution_value)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.itemText}>No investments available.</Text>
            )}
          </View>
        )}
      </View>

      {/* Liabilities */}
      <View style={styles.section}>
        <TouchableOpacity
          onPress={() => toggleSection("liabilities")}
          style={styles.sectionHeader}
        >
          <Text style={styles.sectionTitle}>Liabilities</Text>
          <Ionicons
            name={
              expandedSections.includes("liabilities")
                ? "chevron-up"
                : "chevron-down"
            }
            size={20}
            color="#888"
          />
        </TouchableOpacity>
        {expandedSections.includes("liabilities") && (
          <View style={styles.sectionContent}>
            {categorizedLiabilities.length > 0 ? (
              <View style={styles.cardRow}>
                {categorizedLiabilities.map((acc, idx) => (
                  <View key={idx} style={styles.accountCard}>
                    <View style={styles.cardContent}>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardIconContainer}>
                          <Ionicons
                            name="card-outline"
                            size={16}
                            color="#4A90E2"
                          />
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardName}>{acc.name}</Text>
                          <Text style={styles.cardType}>{acc.subtype}</Text>
                        </View>
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.cardBalance}>
                          {formatCurrency(acc.balances.current)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.itemText}>No liabilities found.</Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const categorizedLiabilities = accounts.filter(
    (acc) => acc.type === "loan" || acc.type === "credit"
  );

  const categorizedDeposits = accounts.filter(
    (acc) => acc.type === "depository"
  );

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

  const dummyGoals = [
    {
      title: "Emergency Fund",
      progress: 0.6,
    },
    {
      title: "New Car Down Payment",
      progress: 0.45,
    },
    {
      title: "Student Loan Payoff",
      progress: 0.25,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={["#1A1A2E", "#16213E", "#0D1117"]}
        style={styles.gradientBackground}
      >
        {renderHeader()}
        {isInitialLoad ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4A90E2" />
          </View>
        ) : !accessToken ? (
          renderDisconnectedState()
        ) : (
          <>
            {isLoading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#4A90E2" />
              </View>
            ) : (
              renderConnectedState()
            )}
          </>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}
