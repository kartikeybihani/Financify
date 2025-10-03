import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Modal,
  Alert,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useCategories } from "../../_hooks/useCategories";
import { supabase } from "../../_lib/supabase/supabase";
import { DeviceEventEmitter } from "react-native";
import CategorySelectorModal from "./CategorySelectorModal";
import AccountDetailModal from "./AccountDetailModal";

interface Transaction {
  id?: string;
  amount: number;
  category?: string;
  top_category?: string;
  new_category?: string;
  date: string;
  name: string;
  account_id?: string;
  account_name?: string;
  institution_name?: string;
  account_mask?: string;
  plaid_transaction_id?: string;
  merchant_name?: string;
}

interface TransactionDetailModalProps {
  visible: boolean;
  transactionId: string | null;
  transaction?: Transaction | null; // Pass transaction data directly to avoid DB call
  onClose: () => void;
}

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

const getCategoryEmojiForName = (categoryName: string): string => {
  const name = categoryName || "";
  const lc = name.toLowerCase();
  if (
    lc.includes("food") ||
    lc.includes("drink") ||
    lc.includes("restaurant") ||
    lc.includes("dining")
  )
    return "🍔";
  if (
    lc.includes("shop") ||
    lc.includes("retail") ||
    lc.includes("store") ||
    lc.includes("merchand")
  )
    return "🛒";
  if (lc.includes("transport") || lc.includes("car") || lc.includes("gas"))
    return "🚗";
  if (
    lc.includes("entertainment") ||
    lc.includes("recreation") ||
    lc.includes("movie") ||
    lc.includes("game")
  )
    return "🎬";
  if (lc.includes("travel") || lc.includes("hotel") || lc.includes("flight"))
    return "✈️";
  if (lc.includes("health") || lc.includes("medical") || lc.includes("care"))
    return "🏋️";
  if (lc.includes("home") || lc.includes("improvement") || lc.includes("rent"))
    return "🏠";
  if (
    lc.includes("payment") ||
    lc.includes("transfer") ||
    lc.includes("loan") ||
    lc.includes("card")
  )
    return "💳";
  if (
    lc.includes("service") ||
    lc.includes("professional") ||
    lc.includes("business")
  )
    return "💼";
  if (
    lc.includes("income") ||
    lc.includes("deposit") ||
    lc.includes("salary") ||
    lc.includes("payroll")
  )
    return "📈";
  return "📊";
};

const getCategoryBackgroundColorForName = (categoryName: string): string => {
  const map: { [key: string]: string } = {
    Payment: "#e8f5e8",
    Transfer: "#e8f5e8",
    Deposit: "#e8f4fd",
    Income: "#e8f4fd",
    "Food and Drink": "#fff3e0",
    Shops: "#f3e5f5",
    Recreation: "#ffebee",
    Transportation: "#e0f2f1",
    Travel: "#e1f5fe",
    Healthcare: "#f9fbe7",
    Service: "#fce4ec",
    Community: "#e8f5e8",
    "Government and Non-Profit": "#e3f2fd",
    Other: "#f5f5f5",
  };

  if (map[categoryName]) return map[categoryName];
  const name = categoryName.toLowerCase();
  if (
    name.includes("food") ||
    name.includes("restaurant") ||
    name.includes("dining")
  )
    return "#fff3e0";
  if (
    name.includes("shop") ||
    name.includes("retail") ||
    name.includes("store")
  )
    return "#f3e5f5";
  if (
    name.includes("transport") ||
    name.includes("car") ||
    name.includes("gas")
  )
    return "#e0f2f1";
  if (name.includes("health") || name.includes("medical")) return "#f9fbe7";
  if (name.includes("travel") || name.includes("hotel")) return "#e1f5fe";
  if (name.includes("entertainment") || name.includes("recreation"))
    return "#ffebee";
  if (name.includes("payment") || name.includes("transfer")) return "#e8f5e8";
  if (
    name.includes("income") ||
    name.includes("deposit") ||
    name.includes("salary")
  )
    return "#e8f4fd";
  return "#f8f9fa";
};

export default function TransactionDetailModal({
  visible,
  transactionId,
  transaction: initialTransaction,
  onClose,
}: TransactionDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [updatedCategory, setUpdatedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInternalTransfer, setIsInternalTransfer] = useState<boolean>(false);
  const [showCategorySelector, setShowCategorySelector] = useState(false);

  // Account Detail Modal state
  const [showAccountDetailModal, setShowAccountDetailModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null
  );
  const [selectedAccountData, setSelectedAccountData] = useState<any>(null);
  const [accountDataLoading, setAccountDataLoading] = useState(false);

  const {
    categories,
    getCategoryIcon,
    getCategoryColor,
    formatCategoryName: formatCategoryFromHook,
  } = useCategories();

  // Responsive layout flags
  const isLandscape = width > height;
  const isSmallPhone = height < 700;
  const isTallPhone = height >= 840;

  // Load transaction data - use passed data or fallback to database call
  useEffect(() => {
    const loadTransaction = async () => {
      if (!transactionId || !visible) return;

      // If we have transaction data passed as prop, use it immediately
      if (initialTransaction && initialTransaction.id === transactionId) {
        setLoading(false);
        setTransaction(initialTransaction);
        setIsInternalTransfer(
          initialTransaction.new_category === "INTERNAL_TRANSFER"
        );
        return;
      }

      // Fallback to database call if no transaction data provided
      try {
        setLoading(true);
        setTransaction(null);

        const { data, error } = await supabase
          .from("transactions")
          .select(
            `
            *,
            accounts:account_id (
              name,
              mask,
              type,
              subtype,
              item_id,
              user_items:item_id (
                institution_name
              )
            )
          `
          )
          .eq("id", transactionId)
          .single();

        if (error) throw error;

        if (visible && transactionId === data?.id) {
          const transformedTransaction = {
            ...data,
            account_name: data.accounts?.name || "Unknown Account",
            institution_name:
              data.accounts?.user_items?.institution_name ||
              "Unknown Institution",
            account_mask: data.accounts?.mask,
          };

          setTransaction(transformedTransaction);
          setIsInternalTransfer(data.new_category === "INTERNAL_TRANSFER");
        }
      } catch (error) {
        console.error("Error loading transaction:", error);
        if (visible) {
          setTransaction(null);
        }
      } finally {
        if (visible) {
          setLoading(false);
        }
      }
    };

    if (visible && transactionId) {
      loadTransaction();
    }
  }, [transactionId, visible, initialTransaction]);

  // Listen for category updates
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "transactionCategoryUpdated",
      (data) => {
        if (data.transactionId === transaction?.id) {
          setUpdatedCategory(data.newCategory);
        }

        // Handle targeted updates for similar transactions
        if (data.affectedTransactions && data.affectedTransactions.length > 0) {
          // Check if the current transaction was affected
          const affectedTx = data.affectedTransactions.find(
            (affected: any) => affected.transactionId === transaction?.id
          );

          if (affectedTx) {
            setUpdatedCategory(data.newCategory);
          }
        }
      }
    );

    return () => subscription.remove();
  }, [transaction?.id]);

  // Reset modal state when it becomes invisible
  useEffect(() => {
    if (!visible) {
      setTransaction(null);
      setUpdatedCategory(null);
      setIsInternalTransfer(false);
      setLoading(true);
      setShowCategorySelector(false);
      setShowAccountDetailModal(false);
      setSelectedAccountId(null);
      setSelectedAccountData(null);
      setAccountDataLoading(false);
    }
  }, [visible]);

  const handleClose = () => {
    // Reset state immediately without delay to prevent race conditions
    setTransaction(null);
    setUpdatedCategory(null);
    setIsInternalTransfer(false);
    setLoading(true);
    setShowCategorySelector(false);
    setShowAccountDetailModal(false);
    setSelectedAccountId(null);
    setSelectedAccountData(null);
    setAccountDataLoading(false);
    onClose();
  };

  const handleCategoryPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCategorySelector(true);
  };

  const handleAccountPress = async () => {
    if (transaction?.account_id) {
      setSelectedAccountId(transaction.account_id);
      setShowAccountDetailModal(true);
      setAccountDataLoading(true);

      // Fetch full account data from database
      try {
        const { data: accountData, error } = await supabase
          .from("accounts")
          .select(
            `
            *,
            user_items:item_id (
              institution_name
            )
          `
          )
          .eq("account_id", transaction.account_id)
          .single();

        if (error) throw error;

        if (accountData) {
          const transformedAccount = {
            ...accountData,
            institution_name:
              accountData.user_items?.institution_name ||
              transaction.institution_name ||
              "Unknown Institution",
            balances: {
              current: accountData.current_balance || 0,
              available: accountData.available_balance || 0,
            },
          };
          console.log("Account data fetched:", transformedAccount);
          setSelectedAccountData(transformedAccount);
        }
      } catch (error) {
        console.error("Error fetching account data:", error);
        // Fallback to basic account data from transaction
        setSelectedAccountData({
          account_id: transaction.account_id,
          name: transaction.account_name || "Unknown Account",
          type: "depository",
          subtype: "checking",
          institution_name:
            transaction.institution_name || "Unknown Institution",
          balances: {
            current: 0,
            available: 0,
          },
        });
      } finally {
        setAccountDataLoading(false);
      }
    }
  };

  const handleInternalTransferToggle = () => {
    const action = isInternalTransfer ? "Yes" : "mark";
    const message = isInternalTransfer
      ? "Mark this transaction as Regular Transaction?"
      : "Mark this transaction as Internal Transfer?";

    Alert.alert("Internal Transfer", message, [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: action === "mark" ? "Mark" : "Yes",
        style: "default",
        onPress: async () => {
          try {
            const newCategoryValue = isInternalTransfer
              ? null
              : "INTERNAL_TRANSFER";

            // Update the database
            const { error } = await supabase
              .from("transactions")
              .update({ new_category: newCategoryValue })
              .eq("id", transaction?.id);

            if (error) {
              console.error("Error updating transaction category:", error);
              Alert.alert(
                "Error",
                "Failed to update transaction. Please try again."
              );
              return;
            }

            // Update local state
            setIsInternalTransfer(!isInternalTransfer);
            setUpdatedCategory(newCategoryValue);

            // Emit event to notify other components
            DeviceEventEmitter.emit("transactionCategoryUpdated", {
              transactionId: transaction?.id,
              newCategory: newCategoryValue,
            });

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch (error) {
            console.error("Error updating transaction:", error);
            Alert.alert(
              "Error",
              "Failed to update transaction. Please try again."
            );
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return new Date(dateStr).toLocaleDateString("en-US", options);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.container}>
              {/* Drag Handle */}
              <View style={styles.dragHandle} />

              {/* Header with Transaction Label and Menu */}
              <View style={styles.headerContainer}>
                <Text style={styles.transactionLabel}>
                  {isInternalTransfer ? "Internal Transfer" : "Transaction"}
                </Text>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={handleInternalTransferToggle}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="filter"
                    size={20}
                    color="rgba(255, 255, 255, 0.8)"
                  />
                </TouchableOpacity>
              </View>

              {loading ? (
                <ScrollView
                  style={styles.scrollContainer}
                  contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 20 },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Core Details - Loading State */}
                  <View style={styles.coreDetailsContainer}>
                    <View style={styles.loadingTransactionName} />
                    <View style={styles.loadingAmountValue} />
                    <View style={styles.loadingDate} />
                    <View style={styles.loadingCategoryPill} />
                  </View>

                  {/* Account Card - Loading State */}
                  <View style={styles.accountSection}>
                    <View style={styles.accountCardContainer}>
                      <View style={styles.accountCard}>
                        <View style={styles.loadingAccountCard} />
                      </View>
                    </View>
                  </View>

                  {/* Loading Indicator */}
                  <View style={styles.loadingIndicatorContainer}>
                    <ActivityIndicator size="large" color="#4A90E2" />
                    <Text style={styles.loadingText}>
                      Loading transaction...
                    </Text>
                  </View>
                </ScrollView>
              ) : !transaction ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>Transaction not found</Text>
                  <TouchableOpacity
                    style={styles.errorCloseButton}
                    onPress={handleClose}
                  >
                    <Text style={styles.errorCloseButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView
                  style={styles.scrollContainer}
                  contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 20 },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Core Details */}
                  <View style={styles.coreDetailsContainer}>
                    <Text style={styles.transactionName}>
                      {transaction.name}
                    </Text>
                    <Text
                      style={[
                        styles.amountValue,
                        {
                          color: transaction.amount < 0 ? "#27AE60" : "#4A90E2",
                        },
                      ]}
                    >
                      {transaction.amount < 0
                        ? `+$${Math.abs(transaction.amount).toFixed(2)}`
                        : `-$${Math.abs(transaction.amount).toFixed(2)}`}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(transaction.date)}
                    </Text>

                    {/* Category Pill - Only show if not internal transfer */}
                    {!isInternalTransfer && (
                      <TouchableOpacity
                        style={[
                          styles.categoryPill,
                          {
                            backgroundColor: getCategoryBackgroundColorForName(
                              updatedCategory ||
                                transaction.new_category ||
                                transaction.top_category ||
                                transaction.category ||
                                "Other"
                            ),
                            borderColor:
                              getCategoryColor(
                                updatedCategory ||
                                  transaction.new_category ||
                                  transaction.top_category ||
                                  transaction.category ||
                                  "Other"
                              ) + "40",
                          },
                        ]}
                        onPress={handleCategoryPress}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.categoryEmojiText}>
                          {getCategoryEmojiForName(
                            updatedCategory ||
                              transaction.new_category ||
                              transaction.top_category ||
                              transaction.category ||
                              "Other"
                          )}
                        </Text>
                        <Text
                          style={[
                            styles.categoryPillText,
                            {
                              color: getCategoryColor(
                                updatedCategory ||
                                  transaction.new_category ||
                                  transaction.top_category ||
                                  transaction.category ||
                                  "Other"
                              ),
                            },
                          ]}
                        >
                          {formatCategoryFromHook(
                            updatedCategory ||
                              transaction.new_category ||
                              transaction.top_category ||
                              transaction.category ||
                              "Other"
                          )}
                        </Text>
                        <Text
                          style={[
                            styles.categoryArrow,
                            {
                              color: getCategoryColor(
                                updatedCategory ||
                                  transaction.new_category ||
                                  transaction.top_category ||
                                  transaction.category ||
                                  "Other"
                              ),
                            },
                          ]}
                        >
                          ▼
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Account Card */}
                  {(transaction.account_name ||
                    transaction.institution_name ||
                    transaction.account_mask) && (
                    <View style={styles.accountSection}>
                      <View style={styles.accountCardContainer}>
                        <TouchableOpacity
                          style={styles.accountCard}
                          onPress={handleAccountPress}
                          activeOpacity={0.8}
                        >
                          <LinearGradient
                            colors={getAccountGradient(
                              transaction.account_name
                            )}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                              styles.accountCardGradient,
                              {
                                height: isSmallPhone
                                  ? 45
                                  : isTallPhone
                                  ? 85
                                  : 65,
                              },
                            ]}
                          >
                            <View style={styles.accountCardOverlay} />
                            <View
                              style={[
                                styles.accountCardContent,
                                { height: "100%" },
                              ]}
                            >
                              <View style={styles.accountCardHeader}>
                                <Text style={styles.bankName}>
                                  {transaction.institution_name || "Bank"}
                                </Text>
                                <Text style={styles.cardIcon}>💳</Text>
                              </View>
                              <View style={styles.accountCardFooter}>
                                <Text
                                  style={styles.accountName}
                                  numberOfLines={1}
                                >
                                  {transaction.account_name ||
                                    transaction.institution_name ||
                                    "Account"}
                                </Text>
                                {transaction.account_mask && (
                                  <Text style={styles.accountMask}>
                                    •••{transaction.account_mask}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {/* Category Selector Modal */}
      <CategorySelectorModal
        visible={showCategorySelector}
        transactionId={transaction?.id || null}
        merchantName={transaction?.merchant_name}
        onClose={() => setShowCategorySelector(false)}
      />

      {/* Account Detail Modal */}
      <AccountDetailModal
        visible={showAccountDetailModal}
        accountId={selectedAccountId}
        account={selectedAccountData}
        loading={accountDataLoading}
        onClose={() => {
          setShowAccountDetailModal(false);
          setSelectedAccountId(null);
          setSelectedAccountData(null);
          setAccountDataLoading(false);
          // Close the parent TransactionDetailModal when AccountDetailModal is closed
          handleClose();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    maxHeight: "80%",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
    marginTop: 5,
    position: "relative",
  },
  transactionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  menuButton: {
    position: "absolute",
    right: 20,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 16,
    opacity: 0.8,
  },
  loadingIndicatorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingTransactionName: {
    width: "80%",
    height: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 8,
  },
  loadingAmountValue: {
    width: "60%",
    height: 32,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 8,
  },
  loadingDate: {
    width: "50%",
    height: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 20,
  },
  loadingCategoryPill: {
    width: "40%",
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 24,
  },
  loadingAccountCard: {
    width: "100%",
    height: 65,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
  },
  errorContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#fff",
    fontSize: 18,
    marginBottom: 20,
  },
  errorCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  errorCloseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollContainer: {
    maxHeight: 500,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  coreDetailsContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  transactionName: {
    fontSize: 20,
    color: "#ffffff",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  transactionDate: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "500",
    marginBottom: 20,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
  },
  categoryEmojiText: {
    fontSize: 14,
    marginRight: 8,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  categoryArrow: {
    marginLeft: 6,
    opacity: 0.7,
    fontSize: 14,
  },
  accountSection: {
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  accountCardContainer: {
    alignItems: "center",
  },
  accountCard: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    width: "90%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  accountCardGradient: {
    padding: 16,
    position: "relative",
  },
  accountCardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
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
    marginBottom: 8,
  },
  bankName: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.9)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardIcon: {
    fontSize: 18,
    color: "rgba(255,255,255,0.9)",
  },
  accountCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  accountName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    flex: 1,
    marginRight: 8,
  },
  accountMask: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
  },
});
