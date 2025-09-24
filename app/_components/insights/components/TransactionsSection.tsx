import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Transaction {
  id?: string;
  amount: number;
  top_category?: string;
  date: string;
  name: string;
  plaid_transaction_id?: string;
}

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
  formatDate: (dateStr: string) => string;
  formatCategoryName: (cat: string) => string;
}

export default function TransactionsSection(props: Props) {
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
    formatDate,
    formatCategoryName,
  } = props;

  const [searchQuery, setSearchQuery] = useState("");

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
            >
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {totalFilteredCount > 0 && (
        <View style={transactionInfoContainerStyle}>
          <Text style={transactionInfoTextStyle}>
            Showing {displayedTransactions.length} of {totalFilteredCount}{" "}
            transactions
          </Text>
        </View>
      )}

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
              onPress={() => onPressTransaction(tx)}
              activeOpacity={0.7}
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
                <Text style={{ color: "#888", fontSize: 11, marginBottom: 1 }}>
                  {formatDate(tx.date)}
                </Text>
                <Text
                  style={{ color: "#4A90E2", fontSize: 10, fontWeight: "500" }}
                >
                  {formatCategoryName(tx.top_category || "Other")}
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
    </View>
  );
}
