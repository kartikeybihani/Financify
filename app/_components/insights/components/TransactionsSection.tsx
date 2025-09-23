import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
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
    titleStyle,
    sectionHeaderStyle,
    headerButtonsContainerStyle,
    refreshAccountsButtonStyle,
    filterButtonStyle,
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
    onPressRefreshAccounts,
    onPressOpenFilter,
    getFilterDescription,
    onPressTransaction,
    formatDate,
    formatCategoryName,
  } = props;

  return (
    <View>
      <View style={sectionHeaderStyle}>
        <Text style={titleStyle}>Transactions</Text>
        <View style={headerButtonsContainerStyle}>
          <TouchableOpacity
            style={refreshAccountsButtonStyle}
            onPress={onPressRefreshAccounts}
            activeOpacity={0.7}
          >
            <Ionicons name="reload" size={12} color="#4A90E2" />
          </TouchableOpacity>
          <TouchableOpacity
            style={filterButtonStyle}
            onPress={onPressOpenFilter}
            activeOpacity={0.7}
          >
            <Ionicons
              name="funnel"
              size={14}
              color="#667eea"
              style={{ marginRight: 6 }}
            />
            <Text style={filterButtonTextStyle}>{getFilterDescription()}</Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color="#667eea"
              style={dropdownArrowStyle}
            />
          </TouchableOpacity>
        </View>
      </View>

      {totalFilteredCount > 0 && (
        <View style={transactionInfoContainerStyle}>
          <Text style={transactionInfoTextStyle}>
            Showing {filteredTransactions.length} of {totalFilteredCount}{" "}
            transactions
          </Text>
        </View>
      )}

      <FlatList
        data={filteredTransactions}
        scrollEnabled={false}
        keyExtractor={(item, index) =>
          `${item.plaid_transaction_id || item.id || index}`
        }
        renderItem={({ item: tx }) => {
          const amount = Math.abs(tx.amount);
          const isIncome = tx.amount < 0;
          const amountColor = isIncome ? "#4CAF50" : "#ff6b6b";
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
                paddingVertical: 12,
                paddingHorizontal: 4,
              }}
              onPress={() => onPressTransaction(tx)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "500",
                    marginBottom: 4,
                  }}
                >
                  {tx.name}
                </Text>
                <Text style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>
                  {formatDate(tx.date)}
                </Text>
                <Text
                  style={{ color: "#4A90E2", fontSize: 11, fontWeight: "500" }}
                >
                  {formatCategoryName(tx.top_category || "Other")}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: amountColor,
                  }}
                >
                  {amountText}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#666" />
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
