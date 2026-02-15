import React from "react";
import { ScrollView, RefreshControl } from "react-native";
import TransactionsSection from "@/src/components/insights/components/TransactionsSection";
import SharedBanners from "./SharedBanners";
import { Transaction } from "@/src/types/plaid";
import { Account, FilterOptions } from "@/src/components/EnhancedFilterModal";
import { ReAuthItem, RefreshStatus } from "@/src/types/insights";
import {
  transactionInfoStyles,
  loadMoreStyles,
} from "@/src/styles/insightsStyles";
import { styles } from "@/src/styles/insightsStyles";

interface TransactionsPageProps {
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
  onAddAccount?: () => void;
  hasAccounts?: boolean;
  isLoadingTransactions?: boolean;
  isLoadingAccounts?: boolean;
  mightHaveTransactions?: boolean;
  accounts?: Account[];
  filterOptions?: FilterOptions;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  isSearching?: boolean;
  refreshStatus: RefreshStatus;
  reAuthItems: ReAuthItem[];
  onReAuth: (item_id: string) => void;
  onDismissReAuth: (item_id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const TransactionsPage = React.memo<TransactionsPageProps>(
  ({
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
    onAddAccount,
    hasAccounts,
    isLoadingTransactions,
    isLoadingAccounts,
    mightHaveTransactions,
    accounts,
    filterOptions,
    searchQuery,
    onSearchQueryChange,
    isSearching,
    refreshStatus,
    reAuthItems,
    onReAuth,
    onDismissReAuth,
    onRefresh,
    refreshing,
  }) => {
    return (
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4A90E2"
            colors={["#4A90E2"]}
            progressBackgroundColor="#1f1f1f"
          />
        }
      >
        <SharedBanners
          refreshStatus={refreshStatus}
          reAuthItems={reAuthItems}
          onReAuth={onReAuth}
          onDismissReAuth={onDismissReAuth}
        />
        <TransactionsSection
          key="transactions-section"
          titleStyle={styles.sectionLabel}
          sectionHeaderStyle={styles.sectionHeader}
          headerButtonsContainerStyle={styles.headerButtonsContainer}
          refreshAccountsButtonStyle={styles.refreshAccountsButton}
          filterButtonStyle={styles.filterButton}
          filterButtonTextStyle={styles.filterButtonText}
          dropdownArrowStyle={styles.dropdownArrow}
          transactionInfoContainerStyle={transactionInfoStyles.container}
          transactionInfoTextStyle={transactionInfoStyles.text}
          loadMoreStyles={loadMoreStyles as any}
          filteredTransactions={filteredTransactions}
          totalFilteredCount={totalFilteredCount}
          hasMoreTransactions={hasMoreTransactions}
          loadingMore={loadingMore}
          onPressLoadMore={onPressLoadMore}
          onPressRefreshAccounts={onPressRefreshAccounts}
          onPressOpenFilter={onPressOpenFilter}
          getFilterDescription={getFilterDescription}
          onPressTransaction={onPressTransaction}
          showTransactionDetail={(transactionId: string) => {
            // Modal is handled internally by TransactionsSection
          }}
          formatDate={formatDate}
          formatCategoryName={formatCategoryName}
          onAddAccount={onAddAccount}
          hasAccounts={hasAccounts}
          isLoadingTransactions={isLoadingTransactions}
          isLoadingAccounts={isLoadingAccounts}
          mightHaveTransactions={mightHaveTransactions}
          accounts={accounts}
          filterOptions={filterOptions}
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          isSearching={isSearching}
        />
      </ScrollView>
    );
  },
);

TransactionsPage.displayName = "TransactionsPage";

export default TransactionsPage;
