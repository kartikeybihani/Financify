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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { supabase } from "@/app/_lib/supabase/supabase";
import AccountCard from "@/app/_components/shared/AccountCard";
import AccountActionAlert from "@/app/_components/modals/AccountActionAlert";
import { deleteAccount } from "@/app/_utils/accountManagement";
import { useAuth } from "@/app/_contexts/AuthContext";
import {
  Transaction,
  Account,
  AccountDetailModalProps,
} from "@/app/_types/plaid";

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
  investmentPerformance,
}: AccountDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { session } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [showActionAlert, setShowActionAlert] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        // Only load transactions for non-investment accounts
        if (initialAccount.type !== "investment") {
          loadRecentTransactions(initialAccount.account_id);
        }
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
          // Only load transactions for non-investment accounts
          if (data.type !== "investment") {
            loadRecentTransactions(data.account_id);
          }
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
    setShowActionAlert(false);
    setDeleting(false);
    onClose();
  };

  const handleDeleteAccount = async () => {
    if (!account || !session?.user?.id) return;

    try {
      setDeleting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      await deleteAccount(account.account_id, session.user.id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowActionAlert(false);

      // Close modal and let parent component handle refresh
      handleClose();
    } catch (error) {
      console.error("Error deleting account:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      alert(
        error instanceof Error ? error.message : "Failed to delete account"
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleFilterIconPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowActionAlert(true);
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
      style={{ zIndex: 10000 }}
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
                {/* Filter Icon - Only show when account is loaded and not an investment */}
                {account && account.type !== "investment" && (
                  <TouchableOpacity
                    style={styles.filterButton}
                    onPress={handleFilterIconPress}
                    activeOpacity={0.7}
                    disabled={deleting}
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={22}
                      color="rgba(255, 255, 255, 0.8)"
                    />
                  </TouchableOpacity>
                )}
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
                    bounces={false}
                    alwaysBounceVertical={false}
                  >
                    {/* Account Card */}
                    <View style={styles.accountSection}>
                      <AccountCard
                        account={{
                          account_id: account.account_id,
                          name:
                            account.name ||
                            account.official_name ||
                            "Unknown Account",
                          mask: account.mask,
                          type: account.type,
                          subtype: account.subtype,
                          institution_name: account.institution_name,
                        }}
                        height={isSmallPhone ? 65 : isLandscape ? 105 : 85}
                      />
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
                        {isCreditCard
                          ? "Current Balance"
                          : account?.type === "investment"
                          ? "Portfolio Value"
                          : "Available Balance"}
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

                      {/* Investment Performance - Only show for investment accounts */}
                      {account?.type === "investment" &&
                        investmentPerformance && (
                          <>
                            <View style={styles.performanceRow}>
                              {/* Today's Performance */}
                              <View style={styles.performanceItem}>
                                <Text
                                  style={[
                                    styles.performanceValue,
                                    {
                                      color:
                                        investmentPerformance.todayPerformance
                                          .amount >= 0
                                          ? "#4ECDC4"
                                          : "#ff6b6b",
                                    },
                                  ]}
                                >
                                  {investmentPerformance.todayPerformance
                                    .amount >= 0
                                    ? "+"
                                    : ""}
                                  {formatCurrency(
                                    investmentPerformance.todayPerformance
                                      .amount
                                  )}
                                </Text>
                                <Text
                                  style={[
                                    styles.performancePercentage,
                                    {
                                      color:
                                        investmentPerformance.todayPerformance
                                          .amount >= 0
                                          ? "#4ECDC4"
                                          : "#ff6b6b",
                                    },
                                  ]}
                                >
                                  {investmentPerformance.todayPerformance
                                    .percentage >= 0
                                    ? "+"
                                    : ""}
                                  {investmentPerformance.todayPerformance.percentage.toFixed(
                                    2
                                  )}
                                  %
                                </Text>
                                <Text style={styles.performanceLabel}>
                                  Today
                                </Text>
                              </View>

                              {/* Total Performance */}
                              <View style={styles.performanceItem}>
                                <Text
                                  style={[
                                    styles.performanceValue,
                                    {
                                      color:
                                        investmentPerformance.totalPerformance
                                          .amount >= 0
                                          ? "#4ECDC4"
                                          : "#ff6b6b",
                                    },
                                  ]}
                                >
                                  {investmentPerformance.totalPerformance
                                    .amount >= 0
                                    ? "+"
                                    : ""}
                                  {formatCurrency(
                                    investmentPerformance.totalPerformance
                                      .amount
                                  )}
                                </Text>
                                <Text
                                  style={[
                                    styles.performancePercentage,
                                    {
                                      color:
                                        investmentPerformance.totalPerformance
                                          .amount >= 0
                                          ? "#4ECDC4"
                                          : "#ff6b6b",
                                    },
                                  ]}
                                >
                                  {investmentPerformance.totalPerformance
                                    .percentage >= 0
                                    ? "+"
                                    : ""}
                                  {investmentPerformance.totalPerformance.percentage.toFixed(
                                    2
                                  )}
                                  %
                                </Text>
                                <Text style={styles.performanceLabel}>
                                  Total
                                </Text>
                              </View>
                            </View>
                          </>
                        )}
                    </View>

                    {/* Recent Transactions - Only show for non-investment accounts */}
                    {account?.type !== "investment" && (
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
                            {recentTransactions
                              .slice(0, 5)
                              .map((transaction) => (
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
                                      ? `+$${Math.abs(
                                          transaction.amount
                                        ).toFixed(2)}`
                                      : `-$${Math.abs(
                                          transaction.amount
                                        ).toFixed(2)}`}
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
                    )}
                  </ScrollView>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {/* Account Action Alert */}
      <AccountActionAlert
        visible={showActionAlert}
        onClose={() => setShowActionAlert(false)}
        onDelete={handleDeleteAccount}
        accountName={
          account?.official_name || account?.name || "Unknown Account"
        }
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 9999,
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
    maxHeight: "90%",
    zIndex: 10000,
    alignSelf: "stretch",
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
  filterButton: {
    position: "absolute",
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
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
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    flexGrow: 1,
  },
  accountSection: {
    marginBottom: 20,
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
  performanceRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 20,
    marginTop: 20,
  },
  performanceItem: {
    alignItems: "center",
  },
  performanceValue: {
    fontSize: 17,
    fontWeight: "700",
    color: "#4ECDC4",
    marginBottom: 4,
  },
  performancePercentage: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4ECDC4",
    marginBottom: 4,
  },
  performanceLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
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
