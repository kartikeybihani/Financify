import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import BudgetView from "@/src/components/insights/BudgetView";
import AddCategoryModal from "./AddCategoryModal";
import { useBudget } from "@/src/hooks/useBudget";
import logger from "@/src/utils/core/logger";

interface Props {
  titleStyle: any;
  categoryBreakdown: [
    string,
    {
      amount: number;
      percentage: number;
      color: string;
      hasRecurringTransactions: boolean;
    }
  ][];
  onCategoryPress: (
    category: string,
    data: {
      amount: number;
      percentage: number;
      color: string;
      hasRecurringTransactions: boolean;
    }
  ) => void;
  formatCategoryName: (cat: string) => string;
  onOpenAddCategoryModalRef?: (openFn: () => void) => void;
  onRefreshBudgetRef?: (refreshFn: () => Promise<void>) => void;
  refreshCategories?: () => void;
}

export default function BudgetSection({
  titleStyle,
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
  onOpenAddCategoryModalRef,
  onRefreshBudgetRef,
  refreshCategories,
}: Props) {
  const [addCategoryModalVisible, setAddCategoryModalVisible] = useState(false);

  // Use budget hook to get real budget data
  // Pass categoryBreakdown so spent amounts use accurate data from spending breakdown
  const {
    budgetData,
    totalBudget,
    totalSpent: budgetTotalSpent,
    loading: budgetLoading,
    initializeBudget,
    refreshBudget,
    updateCategoryBudget,
    deleteCategoryBudget,
    budgetSummary,
    groupCategory,
    ungroupCategory,
    deleteCategory,
  } = useBudget(categoryBreakdown);

  // Initialize budget on first mount if needed
  useEffect(() => {
    if (budgetData.length === 0 && !budgetLoading) {
      // Try to initialize budget if user enters budget section and has no budgets
      initializeBudget();
    }
  }, [budgetData.length, budgetLoading, initializeBudget]);

  // Calculate total spent from category breakdown (fallback)
  const totalSpent = categoryBreakdown.reduce(
    (sum, [_, data]) => sum + data.amount,
    0
  );

  // Use budget total spent if available, otherwise use category breakdown total
  const displayTotalSpent =
    budgetTotalSpent > 0 ? budgetTotalSpent : totalSpent;

  // Expose function to open add category modal to parent
  const openAddCategoryModal = useCallback(() => {
    setAddCategoryModalVisible(true);
  }, []);

  // Use a ref to store the function and avoid calling setState during render
  const openAddCategoryModalRef = useRef(openAddCategoryModal);
  openAddCategoryModalRef.current = openAddCategoryModal;

  // Set up the ref callback in useEffect to avoid calling during render
  useEffect(() => {
    if (onOpenAddCategoryModalRef) {
      // Pass a stable function that calls the current ref value
      // This function is stored in parent's ref, not called immediately
      const stableCallback = () => {
        openAddCategoryModalRef.current();
      };
      onOpenAddCategoryModalRef(stableCallback);
    }
  }, [onOpenAddCategoryModalRef]);

  // Expose refreshBudget function to parent for pull-to-refresh
  useEffect(() => {
    if (onRefreshBudgetRef && refreshBudget) {
      onRefreshBudgetRef(refreshBudget);
    }
  }, [onRefreshBudgetRef, refreshBudget]);

  return (
    <View style={styles.container}>
      <Text style={titleStyle}>Budget Overview</Text>

      {/* Always show BudgetView immediately - never show loading spinner */}
      {/* Cached/stale data is shown instantly, fresh data loads in background */}
      <BudgetView
        categoryBreakdown={categoryBreakdown}
        onCategoryPress={onCategoryPress}
        formatCategoryName={formatCategoryName}
        budgets={budgetData}
        totalBudget={totalBudget}
        totalSpent={displayTotalSpent}
        budgetSummary={budgetSummary}
        onUpdateBudget={updateCategoryBudget}
        onDeleteBudget={deleteCategoryBudget}
        onGroupCategory={groupCategory}
        onRemoveGrouping={ungroupCategory}
        onDeleteCategory={deleteCategory}
        refreshBudget={refreshBudget}
        refreshCategories={refreshCategories}
      />

      {/* Add Category Modal */}
      <AddCategoryModal
        visible={addCategoryModalVisible}
        onClose={() => setAddCategoryModalVisible(false)}
        onCategoryAdded={async () => {
          // Refresh budget data after adding category
          if (refreshBudget) {
            await refreshBudget();
          }
          setAddCategoryModalVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
});
