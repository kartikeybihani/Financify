import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BudgetSection from "@/src/components/insights/components/BudgetSection";
import SpendingSection from "@/src/components/insights/components/SpendingSection";
import SharedBanners from "./SharedBanners";
import {
  BudgetSectionMode,
  ReAuthItem,
  RefreshStatus,
} from "@/src/types/insights";
import { styles } from "@/src/styles/insightsStyles";
import { MonthOption } from "@/src/components/insights/components/MonthSelector";

type CategoryBreakdownItem = [
  string,
  {
    amount: number;
    percentage: number;
    color: string;
    hasRecurringTransactions: boolean;
  },
];

interface BudgetPageProps {
  budgetCategoryBreakdown: CategoryBreakdownItem[];
  onBudgetCategoryPress: (
    category: string,
    data: {
      amount: number;
      percentage: number;
      color: string;
      hasRecurringTransactions: boolean;
    },
  ) => void;
  formatCategoryName: (cat: string) => string;
  onOpenAddCategoryModalRef?: (openFn: (() => void) | null) => void;
  onRefreshBudgetRef?: (refreshFn: (() => Promise<void>) | null) => void;
  refreshCategories?: () => void;
  categoryBreakdown: CategoryBreakdownItem[];
  onSpendingCategoryPress: (
    category: string,
    data: {
      amount: number;
      percentage: number;
      color: string;
      hasRecurringTransactions: boolean;
    },
  ) => void;
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
  mode: BudgetSectionMode;
  onModeChange: (mode: BudgetSectionMode) => void;
}

const BudgetPage = React.memo<BudgetPageProps>(
  ({
    budgetCategoryBreakdown,
    onBudgetCategoryPress,
    formatCategoryName,
    onOpenAddCategoryModalRef,
    onRefreshBudgetRef,
    refreshCategories,
    categoryBreakdown,
    onSpendingCategoryPress,
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
    mode,
    onModeChange,
  }) => {
    const isBudgetView = mode === "budget";

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

        {isBudgetView ? (
          <BudgetSection
            titleStyle={styles.sectionLabel}
            categoryBreakdown={budgetCategoryBreakdown}
            onCategoryPress={onBudgetCategoryPress}
            formatCategoryName={formatCategoryName}
            onOpenAddCategoryModalRef={onOpenAddCategoryModalRef}
            onRefreshBudgetRef={onRefreshBudgetRef}
            refreshCategories={refreshCategories}
            onViewPersonality={() => onModeChange("spending")}
          />
        ) : (
          <>
            <View style={localStyles.switchRow}>
              <TouchableOpacity
                style={localStyles.switchAction}
                activeOpacity={0.8}
                onPress={() => onModeChange("budget")}
              >
                <Text style={localStyles.switchActionText}>Back to budget</Text>
              </TouchableOpacity>
            </View>
            <SpendingSection
              titleStyle={styles.sectionLabel}
              categoryBreakdown={categoryBreakdown}
              onCategoryPress={onSpendingCategoryPress}
              formatCategoryName={formatCategoryName}
              getCategoryIcon={getCategoryIcon}
              availableMonths={availableMonths}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onMonthSelect={onMonthSelect}
            />
          </>
        )}
      </ScrollView>
    );
  },
);

BudgetPage.displayName = "BudgetPage";

export default BudgetPage;

const localStyles = StyleSheet.create({
  switchRow: {
    marginTop: 8,
    marginHorizontal: 20,
    marginBottom: 2,
    alignItems: "center",
  },
  switchAction: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  switchActionText: {
    color: "#B9D7FF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
