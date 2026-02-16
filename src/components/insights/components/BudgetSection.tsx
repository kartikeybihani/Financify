import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import BudgetView from "@/src/components/insights/BudgetView";
import AddCategoryModal from "./AddCategoryModal";
import BudgetEmptyState from "./BudgetEmptyState";
import ManualBudgetCreationModal from "@/src/components/modals/ManualBudgetCreationModal";
import BudgetCreationModal from "@/src/components/modals/BudgetCreationModal";
import MonthlyBudgetEditModal from "@/src/components/modals/MonthlyBudgetEditModal";
import { useBudget } from "@/src/hooks/useBudget";
import { LoadingIndicator } from "@/src/shared/components/LoadingStates";
import logger from "@/src/utils/core/logger";
import { useDemoMode } from "@/src/contexts/DemoContext";
import {
  demoBudgetData,
  demoBudgetTotalBudget,
  demoBudgetTotalSpent,
  demoBudgetCategoryBreakdown,
} from "@/src/data/demo/demoData";

interface Props {
  titleStyle: any;
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
  const { isDemoMode } = useDemoMode();
  const [addCategoryModalVisible, setAddCategoryModalVisible] = useState(false);
  const [addCategoryInitialName, setAddCategoryInitialName] = useState<
    string | null
  >(null);
  const [showManualBudgetModal, setShowManualBudgetModal] = useState(false);
  const [showFinnyBudgetModal, setShowFinnyBudgetModal] = useState(false);
  const [showMonthlyBudgetModal, setShowMonthlyBudgetModal] = useState(false);

  // Use budget hook to get real budget data
  // Pass categoryBreakdown so spent amounts use accurate data from spending breakdown
  const {
    budgetData,
    orphanCategories,
    totalBudget,
    totalSpent: budgetTotalSpent,
    loading: budgetLoading,
    initializeBudget,
    refreshBudget,
    updateCategoryBudget,
    deleteCategoryBudget,
    updateTotalLimit,
    budgetSummary,
    groupCategory,
    ungroupCategory,
    deleteCategory,
  } = useBudget(categoryBreakdown);

  // Check if user has an active budget period with entries
  const hasActiveBudget =
    isDemoMode ||
    (budgetSummary?.period?.status === "active" &&
      budgetData.length > 0 &&
      !budgetLoading);

  // Calculate total spent from category breakdown (fallback)
  const totalSpent = categoryBreakdown.reduce(
    (sum, [_, data]) => sum + data.amount,
    0,
  );

  // Use budget total spent if available, otherwise use category breakdown total
  const displayTotalSpent =
    budgetTotalSpent > 0 ? budgetTotalSpent : totalSpent;

  // Expose function to open add category modal to parent (optionally with initial category name for orphans)
  const openAddCategoryModal = useCallback((initialName?: string | null) => {
    setAddCategoryInitialName(initialName ?? null);
    setAddCategoryModalVisible(true);
  }, []);

  // Use a ref to store the function and avoid calling setState during render
  const openAddCategoryModalRef = useRef(openAddCategoryModal);
  openAddCategoryModalRef.current = openAddCategoryModal;

  // Only expose the FAB callback when user has an active budget
  useEffect(() => {
    if (onOpenAddCategoryModalRef) {
      if (hasActiveBudget) {
        const stableCallback = () => {
          openAddCategoryModalRef.current();
        };
        onOpenAddCategoryModalRef(stableCallback);
      } else {
        // Pass null to hide the FAB when no budget exists
        (onOpenAddCategoryModalRef as (fn: (() => void) | null) => void)(null);
      }
    }
  }, [onOpenAddCategoryModalRef, hasActiveBudget]);

  // Expose refreshBudget function to parent for pull-to-refresh
  useEffect(() => {
    if (onRefreshBudgetRef && refreshBudget) {
      onRefreshBudgetRef(refreshBudget);
    }
  }, [onRefreshBudgetRef, refreshBudget]);

  const handleCreateWithFinny = () => {
    setShowFinnyBudgetModal(true);
  };

  const handleCreateManually = () => {
    setShowManualBudgetModal(true);
  };

  const handleBudgetCreated = async () => {
    // Refresh budget data after creating budget
    if (refreshBudget) {
      await refreshBudget();
    }
  };

  return (
    <View style={styles.container}>
      {/* Show loading when fetching with no cache; empty state when loaded but no budget; otherwise BudgetView */}
      {isDemoMode ? (
        <BudgetView
          categoryBreakdown={demoBudgetCategoryBreakdown}
          onCategoryPress={onCategoryPress}
          formatCategoryName={formatCategoryName}
          budgets={demoBudgetData}
          totalBudget={demoBudgetTotalBudget}
          totalSpent={demoBudgetTotalSpent}
          budgetSummary={null}
        />
      ) : budgetLoading ? (
        <LoadingIndicator
          message="Loading your budget..."
          style={styles.loadingIndicator}
        />
      ) : !hasActiveBudget ? (
        <BudgetEmptyState
          onCreateWithFinny={handleCreateWithFinny}
          onCreateManually={handleCreateManually}
        />
      ) : (
        /* Always show BudgetView immediately - never show loading spinner */
        /* Cached/stale data is shown instantly, fresh data loads in background */
        <BudgetView
          categoryBreakdown={categoryBreakdown}
          onCategoryPress={onCategoryPress}
          formatCategoryName={formatCategoryName}
          budgets={budgetData}
          orphanCategories={orphanCategories}
          onAddOrphanToBudget={openAddCategoryModal}
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
          onEditMonthlyBudget={() => setShowMonthlyBudgetModal(true)}
        />
      )}

      {/* Add Category Modal */}
      <AddCategoryModal
        visible={addCategoryModalVisible}
        initialCategoryName={addCategoryInitialName}
        onClose={() => {
          setAddCategoryModalVisible(false);
          setAddCategoryInitialName(null);
        }}
        onCategoryAdded={async () => {
          // Refresh budget data after adding category
          if (refreshBudget) {
            await refreshBudget();
          }
          setAddCategoryModalVisible(false);
        }}
      />

      {/* Manual Budget Creation Modal */}
      <ManualBudgetCreationModal
        visible={showManualBudgetModal}
        onClose={() => setShowManualBudgetModal(false)}
        onBudgetCreated={handleBudgetCreated}
      />

      {/* Finny Budget Creation Modal */}
      <BudgetCreationModal
        visible={showFinnyBudgetModal}
        onClose={() => setShowFinnyBudgetModal(false)}
        onBudgetCreated={handleBudgetCreated}
      />

      {/* Monthly Budget Edit Modal */}
      <MonthlyBudgetEditModal
        visible={showMonthlyBudgetModal}
        currentAmount={totalBudget}
        onClose={() => setShowMonthlyBudgetModal(false)}
        onSave={async (amount) => updateTotalLimit(amount)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 65,
  },
  loadingIndicator: {
    marginTop: 24,
  },
});
