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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { styles } from "../styles/insightsStyles";
import CategoryGrid from "../components/CategoryGrid";
import CategoryDetailModal from "../components/CategoryDetailModal";
import FilterModal from "../components/FilterModal";
import { supabase } from "../lib/supabase/supabase";
import {
  fetchInitialData,
  getPrimaryItemId,
  syncAllUserTransactions,
  getUpdateLinkToken,
  openPlaidLink,
} from "../utils/plaid";
const screenWidth = Dimensions.get("window").width;

// Define types
interface Transaction {
  amount: number;
  category?: string[];
  date: string;
  name: string;
  personal_finance_category?: {
    primary: string;
  };
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

  // Initialize data and check for update flags on mount
  useEffect(() => {
    const initializeScreen = async () => {
      setIsInitialLoad(true);

      // Load stored data first
      const hasStoredData = await loadData();

      if (!hasStoredData) {
        // If no stored data, try fetching fresh data
        setIsLoading(true);
        await fetchFreshData();
        setIsLoading(false);
      }

      // Check for update flags (Option A - polling approach)
      await checkForUpdateFlags();

      setIsInitialLoad(false);
    };

    initializeScreen();
  }, []);

  const loadData = async () => {
    try {
      console.log("💡 Insights: Loading stored data...");

      // Try to load financial data using new approach
      const data = await fetchInitialData();

      if (data.accounts && data.accounts.length > 0) {
        console.log(
          "✅ Insights: Found account data, attempting to load transactions"
        );

        // Also try to load from AsyncStorage for transactions
        const storedData = await AsyncStorage.getItem("financialData");
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          if (parsedData.transactions && parsedData.transactions.length > 0) {
            setTransactions(parsedData.transactions);
            processTransactionsData(parsedData.transactions);
            hasData.current = true;
            console.log("✅ Insights: Loaded transactions from storage");
            return true;
          }
        }
      }

      console.log("ℹ️ Insights: No stored transaction data found");
      return false;
    } catch (error) {
      console.error("❌ Insights: Error loading stored data:", error);
      return false;
    }
  };

  const fetchFreshData = async () => {
    const BASE_URL = "https://financify-rose.vercel.app";
    try {
      setIsLoading(true);

      console.log(
        "💡 Insights: Fetching transactions using new multi-bank approach..."
      );

      // Get the current item_id
      const item_id = await getPrimaryItemId();

      if (!item_id) {
        console.log("⚠️ No item_id found - user needs to connect a bank");
        return;
      }

      console.log("💡 Insights: Fetching transactions for item_id:", item_id);

      // Fetch transactions using new API approach
      const res = await fetch(`${BASE_URL}/api/transactions_sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ item_id }),
      });

      const transactionData = await res.json();
      console.log("💡 Insights: Transaction data received:", {
        added: transactionData.added?.length || 0,
        modified: transactionData.modified?.length || 0,
        removed: transactionData.removed?.length || 0,
      });

      // Use added transactions (most recent ones)
      if (transactionData.added && transactionData.added.length > 0) {
        setTransactions(transactionData.added);
        processTransactionsData(transactionData.added);
        hasData.current = true;

        // Update stored data
        const storedData = await AsyncStorage.getItem("financialData");
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          parsedData.transactions = transactionData.added;
          await AsyncStorage.setItem(
            "financialData",
            JSON.stringify(parsedData)
          );
        }

        console.log("✅ Insights: Successfully processed transactions");
      } else {
        console.log("ℹ️ Insights: No transactions found");
      }
    } catch (error) {
      console.error("❌ Insights: Error fetching transactions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial setup
  useEffect(() => {
    const initializeData = async () => {
      const dataLoaded = await loadData();
      if (!dataLoaded) {
        await fetchFreshData();
      }
      setIsInitialLoad(false);
    };

    initializeData();

    // Listen for financial data updates
    const subscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      async (data) => {
        if (data.transactions) {
          setTransactions(data.transactions);
          processTransactionsData(data.transactions);
          hasData.current = true;
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const processTransactionsData = (transactionsData: Transaction[]) => {
    // console.log("Processing transactions:", transactionsData);
    const expenses = transactionsData.filter((tx) => tx.amount > 0);
    // console.log("Filtered expenses:", expenses);
    const totalSpent = expenses.reduce((acc, tx) => acc + tx.amount, 0);

    const categoriesObj: CategoryBreakdown = {};
    for (const tx of expenses) {
      const category = tx.personal_finance_category?.primary || "Other";
      // console.log(
      //   "Transaction category:",
      //   category,
      //   "for transaction:",
      //   tx.name
      // );
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

    // console.log("Categories object:", categoriesObj);

    // Calculate percentages
    Object.keys(categoriesObj).forEach((category) => {
      categoriesObj[category].percentage =
        (categoriesObj[category].amount / totalSpent) * 100;
    });

    const sortedCategories = Object.entries(categoriesObj).sort(
      (a, b) => b[1].amount - a[1].amount
    );
    setCategoryBreakdown(sortedCategories);

    const uniqueCategories = [
      "All Categories",
      ...new Set(
        expenses.map((tx) => tx.personal_finance_category?.primary || "Other")
      ),
    ].map((cat) => (cat === "All Categories" ? cat : formatCategoryName(cat)));
    // console.log("Unique categories:", uniqueCategories);
    setCategories(uniqueCategories);

    const topCategory = sortedCategories[0];
    if (!topCategory) return;

    const newInsights: Insight[] = [
      {
        icon: "cash-outline",
        title: `You spent $${totalSpent.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} this month`,
        description: `Top category: ${topCategory[0]}`,
        details: `You've spent the most on ${
          topCategory[0]
        } — $${topCategory[1].amount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}. Try setting a limit or exploring cheaper alternatives.`,
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

  // Filter transactions based on selected category
  const filteredTransactions = transactions.filter((tx) => {
    if (selectedCategory === "All Categories") return true;
    const txCategory = tx.personal_finance_category?.primary || "Other";
    const formattedTxCategory = formatCategoryName(txCategory);
    console.log(
      "Filtering transaction:",
      tx.name,
      "Category:",
      formattedTxCategory,
      "Selected:",
      selectedCategory
    );
    return formattedTxCategory === selectedCategory;
  });

  const onRefresh = async () => {
    if (!hasData.current) return;
    setRefreshing(true);
    try {
      await fetchFreshData();
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

      // Check for items requiring attention
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

  // Handle manual refresh
  const handleManualRefresh = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      console.log("🔄 Manual refresh: Syncing transactions...");
      await syncAllUserTransactions();

      // Reload data after sync
      await fetchFreshData();

      console.log("✅ Manual refresh completed");
    } catch (error) {
      console.error("❌ Manual refresh failed:", error);
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

      {/* Refresh Button */}
      <View style={refreshButtonStyles.container}>
        <TouchableOpacity
          style={[
            refreshButtonStyles.button,
            isSyncing && refreshButtonStyles.buttonDisabled,
          ]}
          onPress={handleManualRefresh}
          disabled={isSyncing}
        >
          <Ionicons
            name={isSyncing ? "hourglass-outline" : "refresh-outline"}
            size={20}
            color="#fff"
          />
          <Text style={refreshButtonStyles.text}>
            {isSyncing ? "Syncing..." : "Refresh Data"}
          </Text>
        </TouchableOpacity>
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
                <Text style={styles.sectionLabel}>Recent Transactions</Text>
                <TouchableOpacity
                  style={styles.filterButton}
                  onPress={() => setShowFilterModal(true)}
                >
                  <Text style={styles.filterButtonText}>
                    {selectedCategory}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color="#4A90E2"
                    style={styles.dropdownArrow}
                  />
                </TouchableOpacity>
              </View>

              {filteredTransactions.map((tx, idx) => (
                <View key={idx} style={styles.txItem}>
                  <View>
                    <Text style={styles.txName}>{tx.name}</Text>
                    <Text style={styles.txMeta}>
                      {formatCategoryName(
                        tx.personal_finance_category?.primary || "Other"
                      )}{" "}
                      • {formatDate(tx.date)}
                    </Text>
                  </View>
                  <Text style={styles.txAmount}>-${tx.amount.toFixed(2)}</Text>
                </View>
              ))}
            </>
          )}

          <FilterModal
            visible={showFilterModal}
            onClose={() => setShowFilterModal(false)}
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            formatCategoryName={formatCategoryName}
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

// Refresh Button Styles
const refreshButtonStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#1A1A2E",
  },
  button: {
    backgroundColor: "#4A90E2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: "#666",
    opacity: 0.7,
  },
  text: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
