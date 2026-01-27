import React from "react";
import { ScrollView, RefreshControl } from "react-native";
import BudgetSection from "@/src/components/insights/components/BudgetSection";
import SharedBanners from "./SharedBanners";
import { ReAuthItem, RefreshStatus } from "@/src/types/insights";
import { styles } from "@/src/styles/insightsStyles";

interface BudgetPageProps {
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
  onOpenAddCategoryModalRef?: (openFn: () => void) => void;
  onRefreshBudgetRef?: (refreshFn: () => Promise<void>) => void;
  refreshCategories?: () => void;
  refreshStatus: RefreshStatus;
  reAuthItems: ReAuthItem[];
  onReAuth: (item_id: string) => void;
  onDismissReAuth: (item_id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const BudgetPage = React.memo<BudgetPageProps>(
  ({
    categoryBreakdown,
    onCategoryPress,
    formatCategoryName,
    onOpenAddCategoryModalRef,
    onRefreshBudgetRef,
    refreshCategories,
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
        <BudgetSection
          titleStyle={styles.sectionLabel}
          categoryBreakdown={categoryBreakdown}
          onCategoryPress={onCategoryPress}
          formatCategoryName={formatCategoryName}
          onOpenAddCategoryModalRef={onOpenAddCategoryModalRef}
          onRefreshBudgetRef={onRefreshBudgetRef}
          refreshCategories={refreshCategories}
        />
      </ScrollView>
    );
  },
);

BudgetPage.displayName = "BudgetPage";

export default BudgetPage;
