import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import RecurringTransactionsModal from "./RecurringTransactionsModal";

interface RecurringStream {
  stream_id: string;
  description: string;
  merchant_name?: string;
  category: string;
  frequency: string;
  average_amount: number;
  last_amount: number;
  last_date: string;
  first_date: string;
  is_active: boolean;
  account_id: string;
  transaction_ids: string[];
  iso_currency_code: string;
}

interface RecurringTransactionsCardProps {
  subscriptions: RecurringStream[];
  bills: RecurringStream[];
  income: RecurringStream[];
  other: RecurringStream[];
  onViewAll: () => void;
  isLoading?: boolean;
}

export default function RecurringTransactionsCard({
  subscriptions,
  bills,
  income,
  other,
  onViewAll,
  isLoading = false,
}: RecurringTransactionsCardProps) {
  const [showModal, setShowModal] = useState(false);
  // Helper function to convert frequency to monthly multiplier
  const getMonthlyMultiplier = (frequency: string): number => {
    switch (frequency.toLowerCase()) {
      case "daily":
        return 30;
      case "weekly":
        return 4.33;
      case "monthly":
        return 1;
      case "quarterly":
        return 0.33;
      case "annually":
      case "yearly":
        return 0.083;
      default:
        return 1;
    }
  };

  // Get all recurring items for count
  const allRecurring = [...subscriptions, ...bills, ...income, ...other];

  const totalMonthlyAmount = allRecurring
    .filter((item) => item.is_active)
    .reduce((sum, item) => {
      // Convert frequency to monthly estimate
      const monthlyMultiplier = getMonthlyMultiplier(item.frequency);
      return sum + Math.abs(item.average_amount) * monthlyMultiplier;
    }, 0);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingTitle} />
          <View style={styles.loadingSubtitle} />
          <View style={styles.loadingItems}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.loadingItem} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.container}
        onPress={() => setShowModal(true)}
        activeOpacity={0.95}
      >
        <LinearGradient
          colors={["rgba(74, 144, 226, 0.08)", "rgba(74, 144, 226, 0.04)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="repeat" size={24} color="#4A90E2" />
              </View>
              <View>
                <Text style={styles.title}>Recurring</Text>
                <Text style={styles.subtitle}>
                  {allRecurring.filter((item) => item.is_active).length} active
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <Text style={styles.totalAmount}>
                ~$
                {totalMonthlyAmount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <Text style={styles.totalLabel}>monthly</Text>
            </View>
          </View>

          <View style={styles.tapToViewContainer}>
            <Text style={styles.tapToViewText}>
              Tap to view all recurring transactions
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#4A90E2" />
          </View>
        </LinearGradient>
      </TouchableOpacity>

      <RecurringTransactionsModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        subscriptions={subscriptions}
        bills={bills}
        income={income}
        other={other}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  gradient: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(74, 144, 226, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: "#666",
  },
  headerRight: {
    alignItems: "flex-end",
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A90E2",
    marginBottom: 2,
  },
  totalLabel: {
    fontSize: 11,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Tap to view styles
  tapToViewContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(74, 144, 226, 0.05)",
    borderRadius: 12,
    marginTop: 8,
  },
  tapToViewText: {
    fontSize: 13,
    color: "#4A90E2",
    fontWeight: "500",
    marginRight: 8,
  },
  // Loading states
  loadingContainer: {
    padding: 16,
  },
  loadingTitle: {
    width: 80,
    height: 16,
    backgroundColor: "rgba(74, 144, 226, 0.12)",
    borderRadius: 8,
    marginBottom: 8,
  },
  loadingSubtitle: {
    width: 60,
    height: 12,
    backgroundColor: "rgba(74, 144, 226, 0.06)",
    borderRadius: 6,
    marginBottom: 16,
  },
  loadingItems: {
    gap: 8,
  },
  loadingItem: {
    width: "100%",
    height: 32,
    backgroundColor: "rgba(74, 144, 226, 0.06)",
    borderRadius: 8,
  },
});
