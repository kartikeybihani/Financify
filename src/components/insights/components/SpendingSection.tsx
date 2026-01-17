import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from "react-native";
import PersonalityBadge from "@/src/components/insights/PersonalityBadge";
import SpendingBreakdown from "@/src/components/insights/SpendingBreakdown";
import BudgetView from "@/src/components/insights/BudgetView";
import { MonthOption } from "./MonthSelector";
import AddCategoryModal from "./AddCategoryModal";
import MonthPickerModal from "@/src/components/modals/MonthPickerModal";
import { analyzeSpendingPersonality } from "@/src/utils/analytics/personalityAnalysis";
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
  getCategoryIcon?: (categoryName: string) => string; // Function to get icon from database
  availableMonths?: MonthOption[];
  selectedMonth?: number;
  selectedYear?: number;
  onMonthSelect?: (month: number, year: number) => void;
  onBudgetModeChange?: (isBudgetMode: boolean) => void;
  onOpenAddCategoryModalRef?: (openFn: () => void) => void;
  onRefreshBudgetRef?: (refreshFn: () => Promise<void>) => void;
  refreshCategories?: () => void; // Refresh categories hook when category name changes
}

export default function SpendingSection({
  titleStyle,
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
  getCategoryIcon,
  availableMonths,
  selectedMonth,
  selectedYear,
  onMonthSelect,
  onBudgetModeChange,
  onOpenAddCategoryModalRef,
  onRefreshBudgetRef,
  refreshCategories,
}: Props) {
  const [isBudgetMode, setIsBudgetMode] = useState(false);
  const [addCategoryModalVisible, setAddCategoryModalVisible] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

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

  // Log categoryBreakdown when it changes
  useEffect(() => {
    logger.info("📊 [SPENDING_SECTION] categoryBreakdown received:", {
      count: categoryBreakdown.length,
      categories: categoryBreakdown.map(([name, data]) => ({
        name,
        amount: data.amount,
        color: data.color,
      })),
      duplicateCheck: (() => {
        const names = categoryBreakdown.map(([name]) => name.toLowerCase().trim());
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        return duplicates.length > 0 ? { duplicates } : { duplicates: [] };
      })(),
    });
  }, [categoryBreakdown]);

  // Initialize budget on first mount if needed
  useEffect(() => {
    if (isBudgetMode && budgetData.length === 0 && !budgetLoading) {
      // Try to initialize budget if user enters budget mode and has no budgets
      initializeBudget();
    }
  }, [isBudgetMode, budgetData.length, budgetLoading, initializeBudget]);


  // Calculate total spent from category breakdown (fallback)
  const totalSpent = categoryBreakdown.reduce(
    (sum, [_, data]) => sum + data.amount,
    0
  );

  // Use budget total spent if available, otherwise use category breakdown total
  const displayTotalSpent =
    budgetTotalSpent > 0 ? budgetTotalSpent : totalSpent;

  // Analyze spending personality
  const personality = analyzeSpendingPersonality(categoryBreakdown, totalSpent);

  // Handle mode toggle with smooth animations
  const handleModeToggle = () => {
    // Fade out current view
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Switch mode
      setIsBudgetMode((prev) => !prev);

      // Prepare slide-in position
      slideAnim.setValue(-20);

      // Fade in new view
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

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

  // Notify parent of initial budget mode state
  useEffect(() => {
    onBudgetModeChange?.(isBudgetMode);
  }, [isBudgetMode, onBudgetModeChange]);

  // Expose refreshBudget function to parent for pull-to-refresh
  useEffect(() => {
    if (onRefreshBudgetRef && refreshBudget) {
      onRefreshBudgetRef(refreshBudget);
    }
  }, [onRefreshBudgetRef, refreshBudget]);

  // Get current month/year or use defaults
  const currentMonth =
    selectedMonth !== undefined ? selectedMonth : new Date().getMonth();
  const currentYear =
    selectedYear !== undefined ? selectedYear : new Date().getFullYear();

  // Format period display
  const formatPeriodDisplay = () => {
    if (selectedMonth === undefined || selectedYear === undefined) {
      return "This Month";
    }
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const now = new Date();
    const isCurrentMonth =
      selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
    return isCurrentMonth
      ? "This Month"
      : `${monthNames[selectedMonth]} ${selectedYear}`;
  };

  const handleMonthSelect = (month: number, year: number) => {
    onMonthSelect?.(month, year);
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={titleStyle}>
          {isBudgetMode ? "Budget Overview" : "Your Spending Personality"}
        </Text>
        <View style={styles.titleRight}>
          <TouchableOpacity
            style={[styles.budgetChip, isBudgetMode && styles.budgetChipActive]}
            activeOpacity={0.7}
            onPress={handleModeToggle}
          >
            <Text style={styles.budgetChipText}>
              {isBudgetMode ? "Spending" : "My Budget"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {!isBudgetMode && (
        <PersonalityBadge personality={personality} showDetails={true} />
      )}

      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {isBudgetMode ? (
          budgetLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4A90E2" />
              <Text style={styles.loadingText}>Loading your budget...</Text>
            </View>
          ) : (
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
          )
        ) : (
          <SpendingBreakdown
            categoryBreakdown={categoryBreakdown}
            onCategoryPress={onCategoryPress}
            formatCategoryName={formatCategoryName}
            getCategoryIcon={getCategoryIcon}
            period={formatPeriodDisplay()}
            onPeriodPress={() => setMonthPickerVisible(true)}
          />
        )}
      </Animated.View>

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

      {/* Month Picker Modal */}
      {onMonthSelect && (
        <MonthPickerModal
          visible={monthPickerVisible}
          onClose={() => setMonthPickerVisible(false)}
          selectedMonth={currentMonth}
          selectedYear={currentYear}
          onMonthSelect={handleMonthSelect}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 0,
  },
  titleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  budgetChip: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginTop: -2,
  },
  budgetChipActive: {
    backgroundColor: "rgba(74, 144, 226, 0.25)",
    borderColor: "rgba(74, 144, 226, 0.5)",
  },
  budgetChipText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
  },
});
