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

  const loadData = async () => {
    try {
      // Try to load data from AsyncStorage first
      const storedData = await AsyncStorage.getItem("financialData");
      if (storedData) {
        const data = JSON.parse(storedData);
        if (data.transactions && data.transactions.length > 0) {
          setTransactions(data.transactions);
          processTransactionsData(data.transactions);
          hasData.current = true;
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Error loading stored data:", error);
      return false;
    }
  };

  const fetchFreshData = async () => {
    const BASE_URL = "https://financify-rose.vercel.app";
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem("accessToken");
      if (!token) return;

      const res = await fetch(`${BASE_URL}/api/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: token }),
      });

      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
        processTransactionsData(data.transactions);
        hasData.current = true;

        // Update stored data
        const storedData = await AsyncStorage.getItem("financialData");
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          parsedData.transactions = data.transactions;
          await AsyncStorage.setItem(
            "financialData",
            JSON.stringify(parsedData)
          );
        }
      }
    } catch (error) {
      console.error("Error fetching fresh data:", error);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerCentered}>
        <Ionicons
          name="stats-chart"
          size={24}
          color="#4A90E2"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.headerTitle}>Insights</Text>
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
    </SafeAreaView>
  );
}
