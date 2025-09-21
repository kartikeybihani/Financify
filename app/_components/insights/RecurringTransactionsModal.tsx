import React from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../_styles/insightsStyles";

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

interface RecurringTransactionsModalProps {
  visible: boolean;
  onClose: () => void;
  subscriptions: RecurringStream[];
  bills: RecurringStream[];
  income: RecurringStream[];
  other: RecurringStream[];
}

const RecurringTransactionsModal: React.FC<RecurringTransactionsModalProps> = ({
  visible,
  onClose,
  subscriptions,
  bills,
  income,
  other,
}) => {
  const allStreams = [...subscriptions, ...bills, ...income, ...other].filter(
    (stream) => stream.is_active
  );

  const totalMonthlyAmount = allStreams.reduce((sum, stream) => {
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
    const monthlyMultiplier = getMonthlyMultiplier(stream.frequency);
    return sum + Math.abs(stream.average_amount) * monthlyMultiplier;
  }, 0);

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
    return "#4A90E2"; // Blue for expenses (positive amount = outflow)
  };

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.categoryDetailModal}>
          <View style={styles.categoryDetailHeader}>
            <View
              style={[
                styles.categoryDetailIcon,
                { backgroundColor: "#4A90E2" },
              ]}
            >
              <Ionicons name="refresh-circle-outline" size={24} color="#fff" />
            </View>
            <View>
              <Text style={styles.categoryDetailTitle}>
                Recurring Transactions
              </Text>
              <Text style={styles.categoryDetailSubtitle}>
                {allStreams.length} active recurring streams
              </Text>
            </View>
          </View>

          <View style={styles.categoryDetailStats}>
            <View style={styles.categoryDetailStat}>
              <Text style={styles.categoryDetailStatLabel}>Monthly Total</Text>
              <Text style={styles.categoryDetailStatValue}>
                ${totalMonthlyAmount.toFixed(2)}
              </Text>
            </View>
            <View style={styles.categoryDetailStat}>
              <Text style={styles.categoryDetailStatLabel}>Subscriptions</Text>
              <Text style={styles.categoryDetailStatValue}>
                {
                  subscriptions.filter(
                    (s) => s.is_active && s.average_amount > 0
                  ).length
                }
              </Text>
            </View>
          </View>

          <View style={styles.categoryTransactionsList}>
            {allStreams.length > 0 ? (
              <ScrollView>
                {allStreams.map((stream) => (
                  <View
                    key={stream.stream_id}
                    style={styles.categoryTransactionItem}
                  >
                    <View style={styles.categoryTransactionInfo}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            backgroundColor: getStreamTypeColor(stream) + "20",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 8,
                          }}
                        >
                          <Ionicons
                            name={getStreamTypeIcon(stream)}
                            size={12}
                            color={getStreamTypeColor(stream)}
                          />
                        </View>
                        <Text style={styles.categoryTransactionName}>
                          {stream.merchant_name || stream.description}
                        </Text>
                      </View>
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Ionicons
                          name={getFrequencyIcon(stream.frequency)}
                          size={12}
                          color="#888"
                        />
                        <Text
                          style={[
                            styles.categoryTransactionDate,
                            { marginLeft: 4 },
                          ]}
                        >
                          {stream.frequency} • Last:{" "}
                          {formatDate(stream.last_date)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.categoryTransactionAmount,
                        {
                          color:
                            stream.average_amount < 0 ? "#4CAF50" : "#ff6b6b",
                        },
                      ]}
                    >
                      {stream.average_amount < 0 ? "+" : "-"}$
                      {Math.abs(stream.average_amount).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyTransactionsContainer}>
                <Text style={styles.emptyTransactionsText}>
                  No recurring transactions found
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export default RecurringTransactionsModal;
