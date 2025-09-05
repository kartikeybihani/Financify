import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

interface Transaction {
  id?: string;
  amount: number;
  category?: string;
  date: string;
  name: string;
  account_name?: string;
  institution_name?: string;
  account_mask?: string;
  plaid_transaction_id?: string;
}

interface TransactionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  formatCategoryName: (category: string) => string;
  formatDate: (date: string) => string;
}

// Get category icon
const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
  const iconMap: { [key: string]: keyof typeof Ionicons.glyphMap } = {
    FOOD_AND_DRINK: "restaurant",
    GENERAL_MERCHANDISE: "storefront",
    TRANSPORTATION: "car",
    ENTERTAINMENT: "game-controller",
    LOAN_PAYMENTS: "card",
    TRAVEL: "airplane",
    PERSONAL_CARE: "fitness",
    GENERAL_SERVICES: "briefcase",
    HOME_IMPROVEMENT: "construct",
    INCOME: "trending-up",
    Other: "apps",
  };
  return iconMap[category] || "receipt";
};

// Get category color
const getCategoryColor = (category: string): string => {
  const colorMap: { [key: string]: string } = {
    FOOD_AND_DRINK: "#FF6B6B",
    GENERAL_MERCHANDISE: "#4ECDC4",
    TRANSPORTATION: "#45B7D1",
    ENTERTAINMENT: "#96CEB4",
    LOAN_PAYMENTS: "#FFEEAD",
    TRAVEL: "#4A90E2",
    PERSONAL_CARE: "#D4A5A5",
    GENERAL_SERVICES: "#9B786F",
    HOME_IMPROVEMENT: "#8E44AD",
    INCOME: "#27AE60",
    Other: "#4A90E2",
  };
  return colorMap[category] || "#4A90E2";
};

// Get account gradient based on type
const getAccountGradient = (accountName?: string) => {
  if (!accountName) return ["#4a5568", "#2d3748"] as const;

  if (accountName.toLowerCase().includes("checking")) {
    return ["#4a5568", "#2d3748"] as const;
  } else if (accountName.toLowerCase().includes("savings")) {
    return ["#9333ea", "#7c2d12"] as const;
  } else if (accountName.toLowerCase().includes("credit")) {
    return ["#1e40af", "#0f172a"] as const;
  }
  return ["#374151", "#1f2937"] as const;
};

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  visible,
  onClose,
  transaction,
  formatCategoryName,
  formatDate,
}) => {
  if (!transaction) return null;

  const amount = Math.abs(transaction.amount);
  const isIncome = transaction.amount < 0; // Negative amounts are income/credits
  const amountColor = isIncome ? "#27AE60" : "#E74C3C";
  const amountText = isIncome
    ? `+$${amount.toFixed(2)}`
    : `-$${amount.toFixed(2)}`;

  const category = transaction.category || "Other";
  const categoryIcon = getCategoryIcon(category);
  const categoryColor = getCategoryColor(category);
  const accountGradient = getAccountGradient(transaction.account_name);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <SafeAreaView style={styles.safeAreaContainer}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}} // Prevent closing when tapping on modal content
            style={styles.modalContainer}
          >
            {/* Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <LinearGradient
                  colors={[categoryColor + "20", categoryColor + "10"] as const}
                  style={[
                    styles.categoryIconContainer,
                    { borderColor: categoryColor + "30" },
                  ]}
                >
                  <Ionicons
                    name={categoryIcon}
                    size={16}
                    color={categoryColor}
                  />
                </LinearGradient>
                <View>
                  <Text style={styles.modalTitle}>Transaction Details</Text>
                  <Text style={styles.modalSubtitle}>
                    {formatCategoryName(category)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <View style={styles.closeButtonContainer}>
                  <Ionicons name="close" size={18} color="#888" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Transaction Info */}
            <View style={styles.content}>
              {/* Amount Section */}
              <View style={styles.amountSection}>
                <Text style={styles.amountLabel}>
                  {isIncome ? "Amount Received" : "Amount Spent"}
                </Text>
                <Text style={[styles.amountValue, { color: amountColor }]}>
                  {amountText}
                </Text>
              </View>

              {/* Transaction Details */}
              <View style={styles.detailsSection}>
                {/* Transaction Name - Clean without label */}
                <View style={styles.transactionNameContainer}>
                  <Text style={styles.transactionName}>{transaction.name}</Text>
                  <Text style={styles.transactionDate}>
                    {formatDate(transaction.date)}
                  </Text>
                </View>

                {/* Category Badge */}
                <View style={styles.categoryContainer}>
                  <TouchableOpacity
                    style={[
                      styles.categoryBadge,
                      { backgroundColor: categoryColor + "20" },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      // Optional: Add haptic feedback or category filter action
                      console.log("Category pressed:", category);
                    }}
                  >
                    <Ionicons
                      name={categoryIcon}
                      size={14}
                      color={categoryColor}
                      style={styles.categoryIcon}
                    />
                    <Text
                      style={[styles.categoryText, { color: categoryColor }]}
                    >
                      {formatCategoryName(category)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Account Card */}
              {transaction.account_name && (
                <View style={styles.accountSection}>
                  <Text style={styles.accountSectionLabel}>Paid with</Text>
                  <View style={styles.accountCard}>
                    <LinearGradient
                      colors={accountGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.accountCardGradient}
                    >
                      {/* Glassmorphism overlay */}
                      <View style={styles.accountCardOverlay} />

                      <View style={styles.accountCardContent}>
                        <View style={styles.accountCardHeader}>
                          <Text style={styles.bankName}>
                            {transaction.institution_name || "Bank"}
                          </Text>
                          <Ionicons
                            name="card"
                            size={16}
                            color="rgba(255,255,255,0.8)"
                          />
                        </View>

                        <View style={styles.accountCardFooter}>
                          <Text style={styles.accountName} numberOfLines={1}>
                            {transaction.account_name}
                          </Text>
                          {transaction.account_mask && (
                            <Text style={styles.accountMask}>
                              •••{transaction.account_mask}
                            </Text>
                          )}
                        </View>
                      </View>
                    </LinearGradient>
                  </View>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "55%",
    minHeight: 450,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 0.1,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  amountSection: {
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
  },
  amountLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.5)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "400",
  },
  amountValue: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  detailsSection: {
    marginBottom: 20,
  },
  transactionNameContainer: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  transactionName: {
    fontSize: 18,
    color: "#ffffff",
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  transactionDate: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "400",
  },
  categoryContainer: {
    alignItems: "flex-start",
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  categoryIcon: {
    marginRight: 6,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  accountSection: {
    marginBottom: 4,
  },
  accountSectionLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "500",
  },
  accountCard: {
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  accountCardGradient: {
    padding: 12,
    minHeight: 60,
    position: "relative",
  },
  accountCardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  accountCardContent: {
    position: "relative",
    zIndex: 2,
    flex: 1,
    justifyContent: "space-between",
  },
  accountCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  bankName: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accountCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  accountName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#ffffff",
    flex: 1,
    marginRight: 8,
  },
  accountMask: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
  },
});

export default TransactionDetailModal;
