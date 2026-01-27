import React from "react";
import { ScrollView, RefreshControl } from "react-native";
import SpendingSection from "@/src/components/insights/components/SpendingSection";
import SharedBanners from "./SharedBanners";
import { MonthOption } from "@/src/components/insights/components/MonthSelector";
import { ReAuthItem, RefreshStatus } from "@/src/types/insights";
import { styles } from "@/src/styles/insightsStyles";

interface SpendingPageProps {
  categoryBreakdown: [
    string,
    {
      amount: number;
      percentage: number;
      color: string;
      hasRecurringTransactions: boolean;
    },
  ][];
  onCategoryPress: (
    category: string,
    data: {
      amount: number;
      percentage: number;
      color: string;
      hasRecurringTransactions: boolean;
    },
  ) => void;
  formatCategoryName: (cat: string) => string;
  getCategoryIcon: (cat: string) => string;
  availableMonths: MonthOption[];
  selectedMonth: number;
  selectedYear: number;
  onMonthSelect: (month: number, year: number) => void;
  refreshStatus: RefreshStatus;
  reAuthItems: ReAuthItem[];
  onReAuth: (item_id: string) => void;
  onDismissReAuth: (item_id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const SpendingPage = React.memo<SpendingPageProps>(
  ({
    categoryBreakdown,
    onCategoryPress,
    formatCategoryName,
    getCategoryIcon,
    availableMonths,
    selectedMonth,
    selectedYear,
    onMonthSelect,
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
        <SpendingSection
          titleStyle={styles.sectionLabel}
          categoryBreakdown={categoryBreakdown}
          onCategoryPress={onCategoryPress}
          formatCategoryName={formatCategoryName}
          getCategoryIcon={getCategoryIcon}
          availableMonths={availableMonths}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onMonthSelect={onMonthSelect}
        />
      </ScrollView>
    );
  },
);

SpendingPage.displayName = "SpendingPage";

export default SpendingPage;
