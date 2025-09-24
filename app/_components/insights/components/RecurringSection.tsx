import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";

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

interface Props {
  recurringData: {
    subscriptions: RecurringStream[];
    income: RecurringStream[];
    bills: RecurringStream[];
    other: RecurringStream[];
  } | null;
  isLoading: boolean;
  titleStyle: any;
}

export default function RecurringSection({
  recurringData,
  isLoading,
  titleStyle,
}: Props) {
  // Check if we should use iOS 18+ liquid glass effect
  const isIOS = Platform.OS === "ios";
  const iosVersion = isIOS ? parseInt(Platform.Version as string, 10) : 0;
  const shouldUseLiquidGlass = isIOS && iosVersion >= 18;

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

  const getStreamTypeIcon = (stream: RecurringStream) => {
    const merchant = (
      stream.merchant_name ||
      stream.description ||
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
    if (stream.average_amount < 0) {
      return "arrow-down-outline"; // Income (negative amount = inflow)
    }
    return "repeat-outline";
  };

  const getStreamTypeColor = (stream: RecurringStream) => {
    if (stream.average_amount < 0) {
      return "#4CAF50"; // Green for income (negative amount = inflow)
    }
    return "#FF6B6B"; // Red for expenses (positive amount = outflow)
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Calculate next transaction date based on frequency
  const getNextTransactionDate = (stream: RecurringStream) => {
    const lastDate = new Date(stream.last_date);
    const frequency = stream.frequency.toLowerCase();

    let nextDate = new Date(lastDate);

    switch (frequency) {
      case "daily":
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case "weekly":
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case "monthly":
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case "quarterly":
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case "annually":
      case "yearly":
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      default:
        nextDate.setDate(nextDate.getDate() + 1);
    }

    return nextDate;
  };

  // Get all recurring items
  const allRecurring = recurringData
    ? [
        ...(recurringData.subscriptions || []),
        ...(recurringData.bills || []),
        ...(recurringData.income || []),
        ...(recurringData.other || []),
      ].filter((item) => item.is_active)
    : [];

  if (isLoading) {
    return (
      <View>
        <Text style={titleStyle}>Recurring Transactions</Text>
        <View style={styles.gridContainer}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <View key={i} style={styles.loadingBox} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={titleStyle}>Recurring Transactions</Text>
      <View style={styles.gridContainer}>
        {allRecurring.map((stream) => (
          <TouchableOpacity key={stream.stream_id} activeOpacity={0.7}>
            {shouldUseLiquidGlass ? (
              <GlassView
                glassEffectStyle="regular"
                tintColor="rgba(20, 20, 25, 0.9)"
                style={styles.transactionBox}
              >
                <View style={styles.boxHeader}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: getStreamTypeColor(stream) + "15" },
                    ]}
                  >
                    <Ionicons
                      name={getStreamTypeIcon(stream)}
                      size={20}
                      color={getStreamTypeColor(stream)}
                    />
                  </View>
                  <Text style={styles.merchantName} numberOfLines={1}>
                    {stream.merchant_name || stream.description}
                  </Text>
                </View>

                <View style={styles.boxContent}>
                  <Text
                    style={[
                      styles.amount,
                      { color: getStreamTypeColor(stream) },
                    ]}
                  >
                    {stream.average_amount < 0 ? "+" : "-"}$
                    {Math.abs(stream.average_amount).toFixed(2)}
                  </Text>
                  <Text style={styles.frequency}>{stream.frequency}</Text>
                </View>

                <View style={styles.boxFooter}>
                  <Text style={styles.nextDate}>
                    Next:{" "}
                    {formatDate(getNextTransactionDate(stream).toISOString())}
                  </Text>
                </View>
              </GlassView>
            ) : (
              <View style={styles.transactionBox}>
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.06)",
                    "rgba(255, 255, 255, 0.02)",
                    "rgba(0, 0, 0, 0.05)",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientOverlay}
                />
                <View style={styles.boxHeader}>
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: getStreamTypeColor(stream) + "15" },
                    ]}
                  >
                    <Ionicons
                      name={getStreamTypeIcon(stream)}
                      size={20}
                      color={getStreamTypeColor(stream)}
                    />
                  </View>
                  <Text style={styles.merchantName} numberOfLines={1}>
                    {stream.merchant_name || stream.description}
                  </Text>
                </View>

                <View style={styles.boxContent}>
                  <Text
                    style={[
                      styles.amount,
                      { color: getStreamTypeColor(stream) },
                    ]}
                  >
                    {stream.average_amount < 0 ? "+" : "-"}$
                    {Math.abs(stream.average_amount).toFixed(2)}
                  </Text>
                  <Text style={styles.frequency}>{stream.frequency}</Text>
                </View>

                <View style={styles.boxFooter}>
                  <Text style={styles.nextDate}>
                    Next:{" "}
                    {formatDate(getNextTransactionDate(stream).toISOString())}
                  </Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const screenWidth = Dimensions.get("window").width;
const cardWidth = (screenWidth - 48) / 2; // 20px padding on each side + 8px gap between cards

const styles = StyleSheet.create({
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    marginTop: 12,
  },
  transactionBox: {
    width: cardWidth,
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    minHeight: 120,
    marginBottom: 16,
    marginRight: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    overflow: "hidden",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  boxHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    zIndex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  merchantName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    letterSpacing: 0.2,
    opacity: 0.9,
  },
  boxContent: {
    marginBottom: 12,
    zIndex: 1,
  },
  amount: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  frequency: {
    fontSize: 12,
    color: "#888",
    textTransform: "capitalize",
    letterSpacing: 0.5,
    fontWeight: "400",
    opacity: 0.8,
  },
  boxFooter: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
    paddingTop: 10,
    marginTop: 4,
    zIndex: 1,
  },
  nextDate: {
    fontSize: 11,
    color: "#999",
    fontWeight: "400",
    letterSpacing: 0.2,
    opacity: 0.7,
  },
  loadingBox: {
    width: cardWidth,
    height: 120,
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    borderRadius: 20,
    marginBottom: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
});
