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
const screenWidth = Dimensions.get("window").width;

// Define types
interface Transaction {
  amount: number;
  category?: string[];
  date: string;
  name: string;
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
  Food: "#FF6B6B",
  Shopping: "#4ECDC4",
  Transportation: "#45B7D1",
  Entertainment: "#96CEB4",
  Bills: "#FFEEAD",
  Other: "#4A90E2",
  Housing: "#D4A5A5",
  Travel: "#9B786F",
  Healthcare: "#A8E6CF",
  Education: "#FFD3B6",
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
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem("accessToken");
      if (!token) return;

      const res = await fetch("http://localhost:8080/api/transactions", {
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
    const expenses = transactionsData.filter((tx) => tx.amount > 0);
    const totalSpent = expenses.reduce((acc, tx) => acc + tx.amount, 0);

    const categoriesObj: CategoryBreakdown = {};
    for (const tx of expenses) {
      const category = tx.category?.[0] || "Other";
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
        (categoriesObj[category].amount / totalSpent) * 100;
    });

    const sortedCategories = Object.entries(categoriesObj).sort(
      (a, b) => b[1].amount - a[1].amount
    );
    setCategoryBreakdown(sortedCategories);

    const uniqueCategories = [
      "All Categories",
      ...new Set(expenses.map((tx) => tx.category?.[0] || "Other")),
    ];
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
    return tx.category?.[0] === selectedCategory;
  });

  // Render the filter modal
  const renderFilterModal = () => {
    return (
      <Modal
        visible={showFilterModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Category</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={categories}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.filterItem,
                    selectedCategory === item && styles.selectedFilterItem,
                  ]}
                  onPress={() => {
                    setSelectedCategory(item);
                    setShowFilterModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.filterItemText,
                      selectedCategory === item &&
                        styles.selectedFilterItemText,
                    ]}
                  >
                    {item}
                  </Text>
                  {selectedCategory === item && (
                    <Ionicons name="checkmark" size={20} color="#4A90E2" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

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
      Food: "restaurant",
      Shopping: "cart",
      Transportation: "car",
      Entertainment: "game-controller",
      Bills: "document-text",
      Housing: "home",
      Travel: "airplane",
      Healthcare: "medical",
      Education: "school",
      Other: "apps",
    };
    return iconMap[category] || "apps";
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
              <View style={styles.categoryGridContainer}>
                <View style={styles.totalSpendingCard}>
                  <Text style={styles.totalSpendingLabel}>Total Spent</Text>
                  <Text style={styles.totalSpendingAmount}>
                    $
                    {categoryBreakdown
                      .reduce((acc, [_, data]) => acc + data.amount, 0)
                      .toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                  </Text>
                  <Text style={styles.totalSpendingPeriod}>This Month</Text>
                </View>
                <View style={styles.categoryGrid}>
                  {categoryBreakdown
                    .slice(0, 4)
                    .map(([category, data], idx) => (
                      <View key={idx} style={styles.categoryGridItem}>
                        <View style={styles.categoryGridHeader}>
                          <View
                            style={[
                              styles.categoryIcon,
                              { backgroundColor: data.color },
                            ]}
                          >
                            <Ionicons
                              name={getCategoryIcon(category)}
                              size={16}
                              color="#fff"
                            />
                          </View>
                          <Text style={styles.gridCategoryPercentage}>
                            {data.percentage.toFixed(0)}%
                          </Text>
                        </View>
                        <Text
                          style={styles.gridCategoryLabel}
                          numberOfLines={1}
                        >
                          {category}
                        </Text>
                        <Text style={styles.gridCategoryAmount}>
                          ${data.amount.toLocaleString()}
                        </Text>
                        <View style={styles.miniProgressBar}>
                          <View
                            style={[
                              styles.miniProgressFill,
                              {
                                width: `${data.percentage}%`,
                                backgroundColor: data.color,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    ))}
                </View>
              </View>

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
                      {tx.category?.[0] || "Other"} • {formatDate(tx.date)}
                    </Text>
                  </View>
                  <Text style={styles.txAmount}>-${tx.amount.toFixed(2)}</Text>
                </View>
              ))}
            </>
          )}

          {renderFilterModal()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
