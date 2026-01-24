import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  memo,
  useCallback,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons, AntDesign } from "@expo/vector-icons";
import { useCategories } from "@/src/hooks/useCategories";
import TransactionDetailModal from "@/src/components/modals/TransactionDetailModal";
import { Transaction } from "@/src/types/plaid";
import {
  getDisplayCategory,
  shouldShowRecurringChip,
} from "@/src/utils/categories/transactionCategory";
import { supabase } from "@/src/lib/supabase/supabase";
import { OptimisticUpdateManager } from "@/src/shared/utils/optimisticUpdates";

import {
  Account,
  FilterOptions,
} from "@/src/components/EnhancedFilterModal/types";
import {
  getSelectedAccounts,
  getAccountMask,
} from "@/src/components/EnhancedFilterModal/utils";

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
  mightHaveTransactions?: boolean;
  accounts?: Account[];
  filterOptions?: FilterOptions;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  isSearching?: boolean;
}

function TransactionsSection(props: Props) {
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
    formatDate,
    onAddAccount,
    hasAccounts = false,
    isLoadingTransactions = false,
    mightHaveTransactions = false,
    accounts = [],
    filterOptions,
    searchQuery: propSearchQuery = "",
    onSearchQueryChange,
    isSearching = false,
  } = props;

  const [searchQuery, setSearchQuery] = useState(propSearchQuery);
  const searchInputRef = useRef<TextInput>(null);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  // Fetch user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
        }
      } catch (error) {
        console.error("Error fetching user ID:", error);
      }
    };
    fetchUserId();
  }, []);

  // Use the categories hook with userId
  const { formatCategoryName: formatCategoryFromHook } = useCategories(userId);

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

  // Sync local search query with prop only when it's cleared externally
  // Don't sync during typing to avoid focus loss
  useEffect(() => {
    // Only sync if prop is cleared (empty) and local state is not
    // This handles external clears without interfering with typing
    if (propSearchQuery === "" && searchQuery !== "") {
      setSearchQuery("");
    }
  }, [propSearchQuery]);

  // Notify parent when search query changes - use useCallback to prevent recreation
  const handleSearchChange = useCallback(
    (text: string) => {
      // Update local state immediately for instant UI feedback
      setSearchQuery(text);
      // Notify parent (this will trigger the search effect)
      if (onSearchQueryChange) {
        onSearchQueryChange(text);
      }
    },
    [onSearchQueryChange],
  );

  // Transactions are already filtered by the database, so just use filteredTransactions directly
  // If search is active and we have transactions, show them; otherwise show empty state
  const displayedTransactions = filteredTransactions;

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
            {filterOptions &&
            accounts.length > 0 &&
            (filterOptions.accountIds || []).length > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                  flex: 1,
                }}
              >
                {getSelectedAccounts(
                  filterOptions.accountIds || [],
                  accounts,
                ).map((account) => (
                  <View
                    key={account.account_id}
                    style={{
                      backgroundColor: "rgba(74, 144, 226, 0.15)",
                      borderRadius: 16,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: "rgba(74, 144, 226, 0.3)",
                      minHeight: 28,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#4A90E2",
                        fontWeight: "600",
                        letterSpacing: 0.2,
                      }}
                    >
                      {getAccountMask(account)}
                    </Text>
                  </View>
                ))}
                {(() => {
                  // Helper function to format month-year period IDs
                  const formatTimePeriodName = (timePeriod: string): string => {
                    const quickPeriods: { [key: string]: string } = {
                      all: "All",
                      "7days": "7 days",
                      "30days": "30 days",
                      "3months": "3 months",
                      "6months": "6 months",
                      "12months": "12 months",
                    };

                    if (quickPeriods[timePeriod]) {
                      return quickPeriods[timePeriod];
                    }

                    // Handle month-year format (e.g., "january2024" -> "Jan 2024")
                    const monthYearMatch = timePeriod.match(
                      /^(january|february|march|april|may|june|july|august|september|october|november|december)(\d{4})$/i,
                    );
                    if (monthYearMatch) {
                      const monthName = monthYearMatch[1].toLowerCase();
                      const year = monthYearMatch[2];

                      const monthAbbrev: { [key: string]: string } = {
                        january: "Jan",
                        february: "Feb",
                        march: "Mar",
                        april: "Apr",
                        may: "May",
                        june: "Jun",
                        july: "Jul",
                        august: "Aug",
                        september: "Sep",
                        october: "Oct",
                        november: "Nov",
                        december: "Dec",
                      };

                      return `${monthAbbrev[monthName] || monthName} ${year}`;
                    }

                    return "7 days"; // Default fallback
                  };

                  const timePeriodName = formatTimePeriodName(
                    filterOptions?.timePeriod || "7days",
                  );
                  const categoryIds = filterOptions?.categoryIds || [];
                  const categoryName =
                    categoryIds.length === 0
                      ? "All Categories"
                      : categoryIds.length === 1
                        ? "1 category"
                        : `${categoryIds.length} categories`;
                  return (
                    <Text
                      style={[filterButtonTextStyle, { marginLeft: 4 }]}
                      numberOfLines={1}
                    >
                      • {timePeriodName} • {categoryName}
                    </Text>
                  );
                })()}
              </View>
            ) : (
              <Text
                style={[filterButtonTextStyle, { flex: 1 }]}
                numberOfLines={1}
              >
                {getFilterDescription()}
              </Text>
            )}
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
          {isSearching ? (
            <ActivityIndicator
              size="small"
              color="#4A90E2"
              style={{ marginRight: 8 }}
            />
          ) : (
            <Ionicons
              name="search"
              size={20}
              color="rgba(255,255,255,0.6)"
              style={{ marginRight: 8 }}
            />
          )}
          <TextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search by name or category..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            style={{ flex: 1, color: "#fff", fontSize: 15, paddingVertical: 2 }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            blurOnSubmit={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => handleSearchChange("")}
              style={{
                padding: 3,
                borderRadius: 12,
                backgroundColor: "rgba(82, 76, 76, 0.34)",
              }}
              // activeOpacity={0.7}
              delayPressIn={0}
              delayPressOut={0}
            >
              <Ionicons
                name="close"
                size={16}
                color="rgba(230, 222, 222, 0.98)"
              />
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

      {(isLoadingTransactions ||
        (mightHaveTransactions &&
          displayedTransactions.length === 0 &&
          !searchQuery.trim())) &&
      hasAccounts ? (
        // User has accounts but transactions are loading, show loading screen
        // Don't show loading if there's an active search query - we've already searched
        <View style={styles.loadingStateContainer}>
          <View style={styles.loadingStateContent}>
            <Image
              source={require("@/assets/images/finnylap3.png")}
              style={{
                width: 150,
                height: 140,
                borderRadius: 80,
              }}
              resizeMode="cover"
            />
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
        !mightHaveTransactions &&
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
        !mightHaveTransactions &&
        hasAccounts ? (
        // Has accounts but no transactions (accounts might not have transactions yet)
        // Check if search query is active - show search image if yes
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateContent}>
            <View style={styles.emptyStateIconContainer}>
              {searchQuery.trim() ? (
                <Image
                  source={require("@/assets/images/finnylap3.png")}
                  style={{
                    width: 150,
                    height: 140,
                    borderRadius: 80,
                  }}
                  resizeMode="cover"
                />
              ) : (
                <AntDesign name="wallet" size={64} color="#4A90E2" />
              )}
            </View>
            <Text style={styles.emptyStateTitle}>No Transactions Found</Text>
            <Text style={styles.emptyStateMessage}>
              {searchQuery.trim()
                ? "Try a different search term."
                : "Your connected accounts don't have any transactions matching your current filters. Try adjusting your filters or check back later."}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={displayedTransactions}
          scrollEnabled={false}
          keyExtractor={(item, index) => {
            // Ensure unique keys: use plaid_transaction_id with index fallback
            // This prevents duplicate key errors even if duplicates somehow slip through
            const baseKey = item.plaid_transaction_id || item.id;
            return baseKey ? `${baseKey}_${index}` : `tx_${index}`;
          }}
          renderItem={({ item: tx }) => {
            // Apply optimistic updates if any
            const updatedTx = OptimisticUpdateManager.applyCategoryUpdateToTransaction(tx);
            
            const amount = Math.abs(updatedTx.amount);
            const isIncome = updatedTx.amount < 0;
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
                      setSelectedTransactionId(updatedTx.id || null);
                      setShowDetailModal(true);
                      setIsModalTransitioning(false);
                    });
                  } else {
                    setSelectedTransactionId(updatedTx.id || null);
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
                    {updatedTx.name}
                  </Text>
                  <Text
                    style={{ color: "#888", fontSize: 11, marginBottom: 1 }}
                  >
                    {formatDate(updatedTx.authorized_date || updatedTx.date)}
                  </Text>
                  <Text
                    style={{
                      color: "#4A90E2",
                      fontSize: 10,
                      fontWeight: "500",
                    }}
                  >
                    {formatCategoryFromHook(getDisplayCategory(updatedTx))}{" "}
                    {shouldShowRecurringChip(updatedTx) ? "• Recurring" : ""}
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
                  <Ionicons name="chevron-forward" size={13} color="#666" />
                </View>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={() => (
            <View style={loadMoreStyles.container}>
              {loadingMore && (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 20,
                  }}
                >
                  <ActivityIndicator
                    size="small"
                    color="#4A90E2"
                    style={loadMoreStyles.indicator}
                  />
                </View>
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
            ? (() => {
                const tx = displayedTransactions.find(
                  (tx) => tx.id === selectedTransactionId,
                );
                // Apply optimistic updates if any
                return tx ? OptimisticUpdateManager.applyCategoryUpdateToTransaction(tx) : null;
              })()
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
    // backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    // borderWidth: 1,
    // borderColor: "rgba(74, 144, 226, 0.2)",
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

// Memoize component to prevent unnecessary re-renders that cause focus loss
// We want to re-render when transactions/search change, but prevent re-renders from other prop changes
export default memo(TransactionsSection);
