import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

interface RecurringStream {
  stream_id: string;
  description: string;
  merchant_name?: string;
  frequency: string;
  average_amount: number;
  last_amount: number;
  is_active: boolean;
}

interface RecurringTransactionsCardProps {
  subscriptions: RecurringStream[];
  bills: RecurringStream[];
  income: RecurringStream[];
  onViewAll: () => void;
  isLoading?: boolean;
}

export default function RecurringTransactionsCard({
  subscriptions,
  bills,
  income,
  onViewAll,
  isLoading = false,
}: RecurringTransactionsCardProps) {
  // Get top 3 most expensive recurring items for preview
  const allRecurring = [...subscriptions, ...bills, ...income];
  const topRecurring = allRecurring
    .filter((item) => item.is_active)
    .sort((a, b) => Math.abs(b.average_amount) - Math.abs(a.average_amount))
    .slice(0, 3);

  const totalMonthlyAmount = allRecurring
    .filter((item) => item.is_active)
    .reduce((sum, item) => {
      // Convert frequency to monthly estimate
      const monthlyMultiplier = getMonthlyMultiplier(item.frequency);
      return sum + Math.abs(item.average_amount) * monthlyMultiplier;
    }, 0);

  const getFrequencyIcon = (frequency: string) => {
    switch (frequency.toLowerCase()) {
      case "monthly":
        return "calendar-outline";
      case "weekly":
        return "time-outline";
      case "daily":
        return "today-outline";
      case "annually":
      case "yearly":
        return "calendar-number-outline";
      default:
        return "repeat-outline";
    }
  };

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

  const getRecurringTypeIcon = (item: RecurringStream) => {
    const merchant = (
      item.merchant_name ||
      item.description ||
      ""
    ).toLowerCase();

    if (
      merchant.includes("netflix") ||
      merchant.includes("spotify") ||
      merchant.includes("apple") ||
      merchant.includes("google")
    ) {
      return "play-outline";
    }
    if (
      merchant.includes("electric") ||
      merchant.includes("gas") ||
      merchant.includes("water") ||
      merchant.includes("rent")
    ) {
      return "home-outline";
    }
    if (item.average_amount < 0) {
      // Income
      return "arrow-down-outline";
    }
    return "repeat-outline";
  };

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
    <TouchableOpacity
      style={styles.container}
      onPress={onViewAll}
      activeOpacity={0.95}
    >
      <LinearGradient
        colors={["rgba(156, 39, 176, 0.05)", "rgba(156, 39, 176, 0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="refresh-circle-outline"
                size={24}
                color="#9C27B0"
              />
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
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </Text>
            <Text style={styles.totalLabel}>monthly</Text>
          </View>
        </View>

        {topRecurring.length > 0 ? (
          <View style={styles.previewContainer}>
            {topRecurring.map((item, index) => (
              <View key={item.stream_id} style={styles.previewItem}>
                <View style={styles.previewLeft}>
                  <View style={styles.previewIcon}>
                    <Ionicons
                      name={getRecurringTypeIcon(item)}
                      size={14}
                      color="#9C27B0"
                    />
                  </View>
                  <Text style={styles.previewName} numberOfLines={1}>
                    {item.merchant_name || item.description}
                  </Text>
                </View>

                <View style={styles.previewRight}>
                  <Text style={styles.previewAmount}>
                    ${Math.abs(item.average_amount).toFixed(0)}
                  </Text>
                  <View style={styles.frequencyBadge}>
                    <Ionicons
                      name={getFrequencyIcon(item.frequency)}
                      size={10}
                      color="#9C27B0"
                    />
                  </View>
                </View>
              </View>
            ))}

            {allRecurring.filter((item) => item.is_active).length > 3 && (
              <View style={styles.moreIndicator}>
                <Text style={styles.moreText}>
                  +{allRecurring.filter((item) => item.is_active).length - 3}{" "}
                  more
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#9C27B0" />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No recurring transactions found
            </Text>
            <Text style={styles.emptySubtext}>
              Connect more accounts to see patterns
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#9C27B0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
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
    backgroundColor: "rgba(156, 39, 176, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
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
    color: "#9C27B0",
    marginBottom: 2,
  },
  totalLabel: {
    fontSize: 11,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewContainer: {
    gap: 8,
  },
  previewItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  previewLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  previewIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(156, 39, 176, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  previewName: {
    fontSize: 13,
    color: "#333",
    flex: 1,
  },
  previewRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewAmount: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  frequencyBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(156, 39, 176, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(156, 39, 176, 0.1)",
    gap: 4,
  },
  moreText: {
    fontSize: 12,
    color: "#9C27B0",
    fontWeight: "500",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 11,
    color: "#999",
  },
  // Loading states
  loadingContainer: {
    padding: 16,
  },
  loadingTitle: {
    width: 80,
    height: 16,
    backgroundColor: "rgba(156, 39, 176, 0.1)",
    borderRadius: 8,
    marginBottom: 8,
  },
  loadingSubtitle: {
    width: 60,
    height: 12,
    backgroundColor: "rgba(156, 39, 176, 0.05)",
    borderRadius: 6,
    marginBottom: 16,
  },
  loadingItems: {
    gap: 8,
  },
  loadingItem: {
    width: "100%",
    height: 32,
    backgroundColor: "rgba(156, 39, 176, 0.05)",
    borderRadius: 8,
  },
});
