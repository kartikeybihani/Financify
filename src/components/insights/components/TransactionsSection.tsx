import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  StyleSheet,
} from "react-native";
import { Ionicons, AntDesign } from "@expo/vector-icons";
import { useCategories } from "@/src/hooks/useCategories";
import TransactionDetailModal from "@/src/components/modals/TransactionDetailModal";
import { Transaction } from "@/src/types/plaid";

interface Props {
  titleStyle: any;
  sectionHeaderStyle: any;
  headerButtonsContainerStyle: any;
  refreshAccountsButtonStyle: any;
  filterButtonStyle: any;
  filterButtonTextStyle: any;
  dropdownArrowStyle: any;
  transactionInfoContainerStyle: any;
  transactionInfoTextStyle: any;
  loadMoreStyles: {
    container: any;
    indicator: any;
    button: any;
    buttonText: any;
    endText: any;
  };
  filteredTransactions: Transaction[];
  totalFilteredCount: number;
  hasMoreTransactions: boolean;
  loadingMore: boolean;
  onPressLoadMore: () => void;
  onPressRefreshAccounts: () => void;
  onPressOpenFilter: () => void;
  getFilterDescription: () => string;
  onPressTransaction: (tx: Transaction) => void;
  showTransactionDetail: (transactionId: string) => void;
  formatDate: (dateStr: string) => string;
  formatCategoryName: (cat: string) => string;
  onAddAccount?: () => void;
  hasAccounts?: boolean;
  isLoadingTransactions?: boolean;
}

export default function TransactionsSection(props: Props) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isModalTransitioning, setIsModalTransitioning] = useState(false);
  const {
    titleStyle: _titleStyle,
    sectionHeaderStyle: _sectionHeaderStyle,
    headerButtonsContainerStyle: _headerButtonsContainerStyle,
    refreshAccountsButtonStyle: _refreshAccountsButtonStyle,
    filterButtonStyle: _filterButtonStyle,
    filterButtonTextStyle,
    dropdownArrowStyle,
    transactionInfoContainerStyle,
    transactionInfoTextStyle,
    loadMoreStyles,
    filteredTransactions,
    totalFilteredCount,
    hasMoreTransactions,
    loadingMore,
    onPressLoadMore,
    onPressRefreshAccounts: _onPressRefreshAccounts,
    onPressOpenFilter,
    getFilterDescription,
    onPressTransaction,
    showTransactionDetail,
    formatDate,
    formatCategoryName,
    onAddAccount,
    hasAccounts = false,
    isLoadingTransactions = false,
  } = props;

  const [searchQuery, setSearchQuery] = useState("");

  // Use the categories hook
  const { formatCategoryName: formatCategoryFromHook } = useCategories();

  // Ensure modal state is properly reset
  useEffect(() => {
    if (!showDetailModal) {
      setSelectedTransactionId(null);
    }
  }, [showDetailModal]);

  // Reset modal state when component unmounts or when transactions change
  useEffect(() => {
    return () => {
      setSelectedTransactionId(null);
      setShowDetailModal(false);
      setIsModalTransitioning(false);
    };
  }, []);

  const displayedTransactions = useMemo(() => {
    if (!searchQuery.trim()) return filteredTransactions;
    const q = searchQuery.trim().toLowerCase();
    return filteredTransactions.filter((tx) => {
      const name = (tx.name || "").toLowerCase();
      const category = (tx.top_category || "").toLowerCase();
      return name.includes(q) || category.includes(q);
    });
  }, [filteredTransactions, searchQuery]);

  return (
    <View>
      {/* Filter Bar */}
      <View style={{ paddingHorizontal: 4, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={onPressOpenFilter}
          activeOpacity={0.8}
          delayPressIn={0}
          delayPressOut={0}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "rgba(102, 126, 234, 0.08)",
            borderRadius: 14,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: "rgba(102, 126, 234, 0.2)",
            shadowColor: "#667eea",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <Ionicons
              name="funnel"
              size={16}
              color="#667eea"
              style={{ marginRight: 8 }}
            />
            <Text
              style={[filterButtonTextStyle, { flex: 1 }]}
              numberOfLines={1}
            >
              {getFilterDescription()}
            </Text>
          </View>
          <Ionicons
            name="chevron-down"
            size={16}
            color="#667eea"
            style={dropdownArrowStyle}
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 4, marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "rgba(255,255,255,0.08)",
            borderRadius: 24,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 4,
          }}
        >
          <Ionicons
            name="search"
            size={20}
            color="rgba(255,255,255,0.6)"
            style={{ marginRight: 8 }}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name or category..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={{ flex: 1, color: "#fff", fontSize: 15, paddingVertical: 2 }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={{
                padding: 6,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
              activeOpacity={0.7}
              delayPressIn={0}
              delayPressOut={0}
            >
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* {totalFilteredCount > 0 && (
        <View style={transactionInfoContainerStyle}>
          <Text style={transactionInfoTextStyle}>
            Showing {displayedTransactions.length} of {totalFilteredCount}{" "}
            transactions
          </Text>
        </View>
      )} */}

      {isLoadingTransactions && hasAccounts ? (
        // User has accounts but transactions are loading, show loading screen
        <View style={styles.loadingStateContainer}>
          <View style={styles.loadingStateContent}>
            <View style={styles.loadingStateIconContainer}>
              <ActivityIndicator size="large" color="#4A90E2" />
            </View>
            <Text style={styles.loadingStateTitle}>
              Pulling up your transactions now
            </Text>
            <Text style={styles.loadingStateMessage}>
              We're fetching your latest transaction data...
            </Text>
          </View>
        </View>
      ) : displayedTransactions.length === 0 &&
        !isLoadingTransactions &&
        !hasAccounts ? (
        // No accounts, show empty state
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateContent}>
            <View style={styles.emptyStateIconContainer}>
              <AntDesign name="wallet" size={64} color="#4A90E2" />
            </View>
            <Text style={styles.emptyStateTitle}>No Transactions Yet</Text>
            <Text style={styles.emptyStateMessage}>
              Connect accounts that have transactions and they'll show up here.
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => {
                if (onAddAccount) {
                  onAddAccount();
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="add-circle"
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.emptyStateButtonText}>Connect Account</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : displayedTransactions.length === 0 &&
        !isLoadingTransactions &&
        hasAccounts ? (
        // Has accounts but no transactions (accounts might not have transactions yet)
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateContent}>
            <View style={styles.emptyStateIconContainer}>
              <AntDesign name="wallet" size={64} color="#4A90E2" />
            </View>
            <Text style={styles.emptyStateTitle}>No Transactions Found</Text>
            <Text style={styles.emptyStateMessage}>
              Your connected accounts don't have any transactions matching your
              current filters. Try adjusting your filters or check back later.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={displayedTransactions}
          scrollEnabled={false}
          keyExtractor={(item, index) =>
            `${item.plaid_transaction_id || item.id || index}`
          }
          renderItem={({ item: tx }) => {
            const amount = Math.abs(tx.amount);
            const isIncome = tx.amount < 0;
            // Psychology: use soft blue for expenses instead of red
            const amountColor = isIncome ? "#4CAF50" : "#4A90E2";
            const amountText = isIncome
              ? `+$${amount.toFixed(2)}`
              : `-$${amount.toFixed(2)}`;

            return (
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  borderBottomWidth: 1,
                  borderBottomColor: "#2a2a2a",
                  paddingVertical: 8,
                  paddingHorizontal: 2,
                }}
                onPress={() => {
                  // Prevent rapid clicks during modal transitions
                  if (isModalTransitioning) return;

                  setIsModalTransitioning(true);

                  // Ensure clean state before opening modal
                  if (showDetailModal) {
                    setShowDetailModal(false);
                    setSelectedTransactionId(null);
                    // Use requestAnimationFrame to ensure state is reset before opening new modal
                    requestAnimationFrame(() => {
                      setSelectedTransactionId(tx.id || null);
                      setShowDetailModal(true);
                      setIsModalTransitioning(false);
                    });
                  } else {
                    setSelectedTransactionId(tx.id || null);
                    setShowDetailModal(true);
                    setIsModalTransitioning(false);
                  }
                }}
                activeOpacity={0.7}
                delayPressIn={0}
                delayPressOut={0}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: "500",
                      marginBottom: 2,
                    }}
                  >
                    {tx.name}
                  </Text>
                  <Text
                    style={{ color: "#888", fontSize: 11, marginBottom: 1 }}
                  >
                    {formatDate(tx.date)}
                  </Text>
                  <Text
                    style={{
                      color: "#4A90E2",
                      fontSize: 10,
                      fontWeight: "500",
                    }}
                  >
                    {formatCategoryFromHook(
                      tx.new_category || tx.top_category || "Other"
                    )}{" "}
                    {tx.if_recurring === "yes" ? "• Recurring" : ""}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: amountColor,
                      opacity: isIncome ? 1 : 0.95,
                    }}
                  >
                    {amountText}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#666" />
                </View>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={() => (
            <View style={loadMoreStyles.container}>
              {loadingMore && (
                <ActivityIndicator
                  size="small"
                  color="#4A90E2"
                  style={loadMoreStyles.indicator}
                />
              )}
              {hasMoreTransactions && !loadingMore && (
                <TouchableOpacity
                  style={loadMoreStyles.button}
                  onPress={onPressLoadMore}
                  delayPressIn={0}
                  delayPressOut={0}
                >
                  <Text style={loadMoreStyles.buttonText}>Load More</Text>
                  <Ionicons name="chevron-down" size={16} color="#4A90E2" />
                </TouchableOpacity>
              )}
              {!hasMoreTransactions && filteredTransactions.length > 0 && (
                <Text style={loadMoreStyles.endText}>
                  No more transactions to load
                </Text>
              )}
            </View>
          )}
        />
      )}

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        key={`modal-${selectedTransactionId || "closed"}`}
        visible={showDetailModal}
        transactionId={selectedTransactionId}
        transaction={
          selectedTransactionId
            ? displayedTransactions.find(
                (tx) => tx.id === selectedTransactionId
              ) || null
            : null
        }
        onClose={() => {
          // Reset state immediately without delay to prevent race conditions
          setShowDetailModal(false);
          setSelectedTransactionId(null);
          setIsModalTransitioning(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  loadingStateContent: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 320,
  },
  loadingStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  loadingStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  loadingStateMessage: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyStateContent: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 320,
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateMessage: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyStateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4A90E2",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyStateButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
