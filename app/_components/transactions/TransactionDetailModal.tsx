import React, { useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import logger from "../../_utils/logger";

interface Transaction {
  id?: string;
  amount: number;
  category?: string;
  top_category?: string;
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

  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();

  // Responsive layout flags
  const isLandscape = width > height;
  const isSmallPhone = height < 700;
  const isTallPhone = height >= 840;

  // Compute a tight but safe modal height
  const { maxModalHeight, compact } = useMemo(() => {
    // Cap by safe area so we never collide with the notch or home indicator
    const safeCap =
      height - Math.max(insets.top, 8) - Math.max(insets.bottom, 8);

    // Base ratios by device class
    let baseRatio = 0.7; // default (slightly taller)
    if (isSmallPhone) baseRatio = 0.6; // shorten less to gain height
    if (isTallPhone) baseRatio = 0.78; // show more on tall phones
    if (isLandscape) baseRatio = 0.86; // landscape still gets more height

    const maxH = Math.min(safeCap, height * baseRatio);

    // Use compact paddings if we are on small devices or landscape
    const useCompact = isSmallPhone || isLandscape;

    return { maxModalHeight: maxH, compact: useCompact };
  }, [
    height,
    insets.top,
    insets.bottom,
    isSmallPhone,
    isTallPhone,
    isLandscape,
  ]);

  // Deterministic account card height
  const accountCardHeight = isSmallPhone ? 45 : isTallPhone ? 85 : 65;

  const amount = Math.abs(transaction.amount);
  const isIncome = transaction.amount < 0;
  // Use green for income, soft blue for expenses
  const amountColor = isIncome ? "#27AE60" : "#4A90E2";
  const amountText = isIncome
    ? `+$${amount.toFixed(2)}`
    : `-$${amount.toFixed(2)}`;

  // Prefer simplified top_category for consistency with list UI
  const category = transaction.top_category || transaction.category || "Other";
  const categoryIcon = getCategoryIcon(category);
  const categoryColor = getCategoryColor(category);
  const accountGradient = getAccountGradient(transaction.account_name);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.safeAreaContainer}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.modalContainer,
              {
                maxHeight: maxModalHeight,
                paddingBottom: Math.max(insets.bottom, compact ? 8 : 12),
              },
            ]}
          >
            {/* Handle */}
            <View
              style={[
                styles.handleContainer,
                compact && { paddingVertical: 10 },
              ]}
            >
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <View
              style={[
                styles.header,
                {
                  paddingHorizontal: compact ? 20 : 24,
                  paddingBottom: compact ? 10 : 14,
                },
              ]}
            >
              <View style={styles.headerLeft}>
                <LinearGradient
                  colors={[categoryColor + "20", categoryColor + "10"] as const}
                  style={[
                    styles.categoryIconContainer,
                    {
                      borderColor: categoryColor + "30",
                      width: compact ? 28 : 32,
                      height: compact ? 28 : 32,
                      borderRadius: compact ? 14 : 16,
                      marginRight: compact ? 8 : 10,
                    },
                  ]}
                >
                  <Ionicons
                    name={categoryIcon}
                    size={compact ? 14 : 16}
                    color={categoryColor}
                  />
                </LinearGradient>
                <View>
                  <Text
                    style={[styles.modalTitle, compact && { fontSize: 14 }]}
                    numberOfLines={1}
                  >
                    Transaction Details
                  </Text>
                  <Text
                    style={[styles.modalSubtitle, compact && { fontSize: 11 }]}
                    numberOfLines={1}
                  >
                    {formatCategoryName(category)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <LinearGradient
                  colors={
                    [
                      "rgba(255, 255, 255, 0.15)",
                      "rgba(255, 255, 255, 0.05)",
                    ] as const
                  }
                  style={styles.closeButtonCircle}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Scrollable Content */}
            <ScrollView
              style={styles.scrollContainer}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingHorizontal: compact ? 20 : 24,
                  paddingTop: compact ? 6 : 8,
                  paddingBottom: compact ? 24 : 32,
                },
              ]}
              showsVerticalScrollIndicator={false}
              bounces
              scrollEnabled
            >
              {/* Amount Section */}
              <View
                style={[
                  styles.amountSection,
                  compact && { marginBottom: 16, paddingVertical: 10 },
                ]}
              >
                <Text
                  style={[
                    styles.amountLabel,
                    compact && { fontSize: 10, marginBottom: 4 },
                  ]}
                >
                  {isIncome ? "Amount Received" : "Amount Spent"}
                </Text>
                <Text
                  style={[
                    styles.amountValue,
                    { color: amountColor },
                    compact && { fontSize: 22 },
                  ]}
                >
                  {amountText}
                </Text>
              </View>

              {/* Transaction Details */}
              <View
                style={[styles.detailsSection, compact && { marginBottom: 16 }]}
              >
                <View
                  style={[
                    styles.transactionNameContainer,
                    compact && { marginBottom: 12, paddingBottom: 12 },
                  ]}
                >
                  <Text
                    style={[
                      styles.transactionName,
                      compact && { fontSize: 17 },
                    ]}
                    numberOfLines={2}
                  >
                    {transaction.name}
                  </Text>
                  <Text
                    style={[
                      styles.transactionDate,
                      compact && { fontSize: 13 },
                    ]}
                  >
                    {formatDate(transaction.date)}
                  </Text>
                </View>

                {/* Category Badge */}
                <View style={styles.categoryContainer}>
                  <TouchableOpacity
                    style={[
                      styles.categoryBadge,
                      { backgroundColor: categoryColor + "20" },
                      compact && { paddingHorizontal: 10, paddingVertical: 6 },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => logger.info("Category pressed:", category)}
                  >
                    <Ionicons
                      name={categoryIcon}
                      size={compact ? 13 : 14}
                      color={categoryColor}
                      style={styles.categoryIcon}
                    />
                    <Text
                      style={[
                        styles.categoryText,
                        { color: categoryColor },
                        compact && { fontSize: 12 },
                      ]}
                    >
                      {formatCategoryName(category)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Account Card */}
              {transaction.account_name && (
                <View
                  style={[
                    styles.accountSection,
                    compact && { marginBottom: 2 },
                  ]}
                >
                  <Text
                    style={[
                      styles.accountSectionLabel,
                      compact && { fontSize: 10, marginBottom: 8 },
                    ]}
                  >
                    Paid with
                  </Text>
                  <View
                    style={[
                      styles.accountCard,
                      compact && { borderRadius: 10 },
                    ]}
                  >
                    <LinearGradient
                      colors={accountGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.accountCardGradient,
                        { height: accountCardHeight },
                        compact && { padding: 10 },
                      ]}
                    >
                      <View style={styles.accountCardOverlay} />

                      <View
                        style={[styles.accountCardContent, { height: "100%" }]}
                      >
                        <View
                          style={[
                            styles.accountCardHeader,
                            compact && { marginBottom: 2 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.bankName,
                              compact && { fontSize: 9 },
                            ]}
                          >
                            {transaction.institution_name || "Bank"}
                          </Text>
                          <Ionicons
                            name="card"
                            size={16}
                            color="rgba(255,255,255,0.8)"
                          />
                        </View>

                        <View style={styles.accountCardFooter}>
                          <Text
                            style={[
                              styles.accountName,
                              compact && { fontSize: 12 },
                            ]}
                            numberOfLines={1}
                          >
                            {transaction.account_name}
                          </Text>
                          {transaction.account_mask && (
                            <Text
                              style={[
                                styles.accountMask,
                                compact && { fontSize: 10 },
                              ]}
                            >
                              •••{transaction.account_mask}
                            </Text>
                          )}
                        </View>
                      </View>
                    </LinearGradient>
                  </View>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
    alignSelf: "flex-end",
    width: "100%",
  },
  scrollContainer: {
    // Let content determine height; do not force flex expansion
  },
  scrollContent: {
    // Removed flexGrow to let content drive height naturally
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
    minWidth: 0,
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
  closeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  closeButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center",
    alignItems: "center",
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
