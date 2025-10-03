import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Modal,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { supabase } from "../../_lib/supabase/supabase";
import { FontAwesome } from "@expo/vector-icons";

interface Account {
  account_id: string;
  name: string;
  mask?: string;
  type: string;
  subtype: string;
  official_name?: string;
  current_balance?: number;
  available_balance?: number;
  institution_name?: string;
  balances?: {
    current: number;
    available: number;
  };
}

interface Transaction {
  id: string;
  amount: number;
  name: string;
  date: string;
  category?: string;
  merchant_name?: string;
}

interface AccountDetailModalProps {
  visible: boolean;
  accountId: string | null;
  account?: Account | null;
  onClose: () => void;
  loading?: boolean;
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

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  return new Date(dateStr).toLocaleDateString("en-US", options);
};

export default function AccountDetailModal({
  visible,
  accountId,
  account: initialAccount,
  onClose,
  loading: externalLoading = false,
}: AccountDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [account, setAccount] = useState<Account | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // Responsive layout flags
  const isLandscape = width > height;
  const isSmallPhone = height < 700;

  // Load account data
  useEffect(() => {
    const loadAccountData = async () => {
      if (!accountId || !visible) return;

      // If we have account data passed as prop, use it immediately
      if (initialAccount) {
        setAccount(initialAccount);
        setLoading(false);
        loadRecentTransactions(initialAccount.account_id);
        return;
      }

      // Fallback to database call if no account data provided
      try {
        setLoading(true);
        setAccount(null);

        const { data, error } = await supabase
          .from("accounts")
          .select(
            `
            *,
            user_items:item_id (
              institution_name
            )
          `
          )
          .eq("account_id", accountId)
          .single();

        if (error) throw error;

        if (visible && accountId === data?.account_id) {
          const transformedAccount = {
            ...data,
            institution_name:
              data.user_items?.institution_name || "Unknown Institution",
          };

          setAccount(transformedAccount);
          loadRecentTransactions(data.account_id);
        }
      } catch (error) {
        console.error("Error loading account:", error);
        if (visible) {
          setAccount(null);
        }
      } finally {
        if (visible) {
          setLoading(false);
        }
      }
    };

    if (visible && accountId) {
      loadAccountData();
    }
  }, [accountId, visible, initialAccount]);

  const loadRecentTransactions = async (accountId: string) => {
    try {
      setTransactionsLoading(true);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("account_id", accountId)
        .order("date", { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentTransactions(data || []);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  // Reset modal state when it becomes invisible
  useEffect(() => {
    if (!visible) {
      setAccount(null);
      setRecentTransactions([]);
      setLoading(true);
      setTransactionsLoading(false);
    }
  }, [visible]);

  const handleClose = () => {
    setAccount(null);
    setRecentTransactions([]);
    setLoading(true);
    setTransactionsLoading(false);
    onClose();
  };

  const isCreditCard =
    account?.type?.toLowerCase().includes("credit") ||
    account?.subtype?.toLowerCase().includes("credit");

  const currentBalance =
    account?.current_balance || account?.balances?.current || 0;
  const availableBalance =
    account?.available_balance || account?.balances?.available || 0;
  const creditLimit = isCreditCard ? currentBalance + availableBalance : 0;
  const availableCredit = isCreditCard ? availableBalance : 0;

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

              {/* Header */}
              <View style={styles.headerContainer}>
                <Text style={styles.headerTitle}>
                  {account
                    ? (account.subtype || account.type).toUpperCase()
                    : "ACCOUNT DETAILS"}
                </Text>
              </View>

              {loading || externalLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#4A90E2" />
                  <Text style={styles.loadingText}>Loading account...</Text>
                </View>
              ) : !account ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>Account not found</Text>
                </View>
              ) : (
                <>
                  <ScrollView
                    style={styles.scrollContainer}
                    contentContainerStyle={[
                      styles.scrollContent,
                      { paddingBottom: insets.bottom + 20 },
                    ]}
                    showsVerticalScrollIndicator={false}
                  >
                    {/* Account Card */}
                    <View style={styles.accountSection}>
                      <View style={styles.accountCardContainer}>
                        <View style={styles.accountCard}>
                          <LinearGradient
                            colors={getAccountGradient(account.name)}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                              styles.accountCardGradient,
                              {
                                height: isSmallPhone
                                  ? 65
                                  : isLandscape
                                  ? 105
                                  : 85,
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
                                  {account.institution_name || "Bank"}
                                </Text>
                                <Text style={styles.cardIcon}>💳</Text>
                              </View>
                              <View style={styles.accountCardFooter}>
                                <Text
                                  style={styles.accountName}
                                  numberOfLines={1}
                                >
                                  {account.name ||
                                    account.official_name ||
                                    "Account"}
                                </Text>
                                {account.mask && (
                                  <Text style={styles.accountMask}>
                                    •••{account.mask}
                                  </Text>
                                )}
                              </View>
                            </View>
                          </LinearGradient>
                        </View>
                      </View>
                    </View>

                    {/* Account Name */}
                    <View style={styles.accountNameSection}>
                      <Text style={styles.accountNameText}>
                        {account.official_name || account.name}
                      </Text>
                    </View>

                    {/* Balance Information */}
                    <View style={styles.balanceSection}>
                      <Text
                        style={[
                          styles.mainBalanceText,
                          { color: isCreditCard ? "#4f94e8" : "#4ade80" },
                        ]}
                      >
                        {formatCurrency(Math.abs(currentBalance))}
                      </Text>
                      <Text style={styles.mainBalanceLabel}>
                        {isCreditCard ? "Current Balance" : "Available Balance"}
                      </Text>

                      {isCreditCard && (
                        <View style={styles.creditInfoRow}>
                          <View style={styles.creditInfoItem}>
                            <Text style={styles.creditInfoValue}>
                              {formatCurrency(availableCredit)}
                            </Text>
                            <Text style={styles.creditInfoLabel}>
                              Available Credit
                            </Text>
                          </View>
                          <View style={styles.creditInfoItem}>
                            <Text style={styles.creditInfoValue}>
                              {(
                                (Math.abs(currentBalance) / creditLimit) *
                                100
                              ).toFixed(1)}
                              %
                            </Text>
                            <Text style={styles.creditInfoLabel}>
                              Utilization
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>

                    {/* Recent Transactions */}
                    <View style={styles.transactionsSection}>
                      <Text style={styles.sectionTitle}>
                        Recent Transactions
                      </Text>

                      {transactionsLoading ? (
                        <View style={styles.transactionsLoading}>
                          <ActivityIndicator size="small" color="#4A90E2" />
                          <Text style={styles.transactionsLoadingText}>
                            Loading transactions...
                          </Text>
                        </View>
                      ) : recentTransactions.length > 0 ? (
                        <View style={styles.transactionsList}>
                          {recentTransactions.slice(0, 5).map((transaction) => (
                            <View
                              key={transaction.id}
                              style={styles.transactionItem}
                            >
                              <View style={styles.transactionLeft}>
                                <View style={styles.transactionIcon}>
                                  <Ionicons
                                    name={
                                      transaction.amount < 0
                                        ? "arrow-up"
                                        : "arrow-down"
                                    }
                                    size={16}
                                    color={
                                      transaction.amount < 0
                                        ? "#4ade80"
                                        : "#ff6b6b"
                                    }
                                  />
                                </View>
                                <View style={styles.transactionDetails}>
                                  <Text
                                    style={styles.transactionName}
                                    numberOfLines={1}
                                  >
                                    {transaction.name}
                                  </Text>
                                  <Text style={styles.transactionDate}>
                                    {formatDate(transaction.date)}
                                  </Text>
                                </View>
                              </View>
                              <Text
                                style={[
                                  styles.transactionAmount,
                                  {
                                    color:
                                      transaction.amount < 0
                                        ? "#4ade80"
                                        : "#ff6b6b",
                                  },
                                ]}
                              >
                                {transaction.amount < 0
                                  ? `+$${Math.abs(transaction.amount).toFixed(
                                      2
                                    )}`
                                  : `-$${Math.abs(transaction.amount).toFixed(
                                      2
                                    )}`}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.noTransactions}>
                          <Text style={styles.noTransactionsText}>
                            No recent transactions
                          </Text>
                        </View>
                      )}
                    </View>
                  </ScrollView>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
    maxHeight: "85%",
    minHeight: "60%",
    flex: 1,
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
  headerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
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
  errorContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#fff",
    fontSize: 18,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  accountSection: {
    marginBottom: 20,
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
    padding: 12,
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
    fontSize: 12,
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
  accountNameSection: {
    alignItems: "center",
    marginBottom: 10,
  },
  accountNameText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 4,
  },
  accountTypeText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  infoItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  infoLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    color: "#ffffff",
    fontWeight: "600",
  },
  balanceSection: {
    marginBottom: 24,
    alignItems: "center",
  },
  mainBalanceText: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  mainBalanceLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    marginBottom: 20,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  creditInfoRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 20,
  },
  creditInfoItem: {
    alignItems: "center",
  },
  creditInfoValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4ade80",
    marginBottom: 4,
  },
  creditInfoLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
  },
  additionalBalanceInfo: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  additionalBalanceLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    marginRight: 8,
  },
  additionalBalanceValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  transactionsSection: {
    marginBottom: 24,
  },
  transactionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  transactionsLoadingText: {
    color: "rgba(255, 255, 255, 0.7)",
    marginLeft: 8,
    fontSize: 14,
  },
  transactionsList: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  transactionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "700",
  },
  noTransactions: {
    padding: 40,
    alignItems: "center",
  },
  noTransactionsText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 14,
  },
});
