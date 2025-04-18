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
  [key: string]: number;
}

interface Insight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  details: string;
}

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
    [string, number][]
  >([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [categories, setCategories] = useState<string[]>(["All Categories"]);
  const isMounted = useRef(false);
  const hasData = useRef(false);

  const loadData = async () => {
    // Try to load data from AsyncStorage first without setting loading state
    const storedData = await AsyncStorage.getItem("financialData");
    if (storedData) {
      const data = JSON.parse(storedData);
      if (data.transactions && data.transactions.length > 0) {
        setTransactions(data.transactions);
        processTransactionsData(data.transactions);
        hasData.current = true;
        return;
      }
    }

    // Only show loading if we need to fetch data
    setLoading(true);
    try {
      await fetchTransactions();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only load data on first mount
    if (!isMounted.current) {
      loadData();
      isMounted.current = true;
    }

    // Listen for refresh events from home screen
    const subscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      (data) => {
        if (data.transactions) {
          setTransactions(data.transactions);
          processTransactionsData(data.transactions);
          hasData.current = true;
        } else if (!hasData.current) {
          loadData();
        }
      }
    );

    // Cleanup
    return () => {
      subscription.remove();
    };
  }, []);

  const fetchTransactions = async () => {
    try {
      const token = await AsyncStorage.getItem("accessToken");
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch("http://localhost:8080/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: token }),
      });

      const data = await res.json();
      setTransactions(data.transactions);

      // Save transactions to AsyncStorage for future use
      const storedData = await AsyncStorage.getItem("financialData");
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        parsedData.transactions = data.transactions;
        await AsyncStorage.setItem("financialData", JSON.stringify(parsedData));
      }

      processTransactionsData(data.transactions);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const processTransactionsData = (transactionsData: Transaction[]) => {
    const expenses = transactionsData.filter((tx) => tx.amount > 0);
    const totalSpent = expenses.reduce((acc, tx) => acc + tx.amount, 0);

    const categoriesObj: CategoryBreakdown = {};
    for (const tx of expenses) {
      const category = tx.category?.[0] || "Other";
      categoriesObj[category] = (categoriesObj[category] || 0) + tx.amount;
    }

    const sortedCategories = Object.entries(categoriesObj).sort(
      (a, b) => b[1] - a[1]
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
        } — $${topCategory[1].toLocaleString("en-US", {
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

      {loading && !hasData.current ? (
        <ActivityIndicator
          size="large"
          color="#4A90E2"
          style={{ marginTop: 20 }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.sectionLabel}>Spending by Category</Text>
          {categoryBreakdown.map(([cat, amt], idx) => (
            <Text key={idx} style={styles.categoryText}>
              {cat}: ${amt.toFixed(2)}
            </Text>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
            Your Real Insights
          </Text>
          {[...realInsights, ...dummyInsights].map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => setSelectedCard(selectedCard === idx ? null : idx)}
            >
              <Ionicons
                name={item.icon}
                size={28}
                color="#4A90E2"
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDescription}>{item.description}</Text>
              {selectedCard === idx && (
                <Text style={styles.cardDetails}>{item.details}</Text>
              )}
            </TouchableOpacity>
          ))}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Recent Transactions</Text>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowFilterModal(true)}
            >
              <Text style={styles.filterButtonText}>{selectedCategory}</Text>
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

          {renderFilterModal()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
