import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PersonalityBadge from "@/src/components/insights/PersonalityBadge";
import SpendingBreakdown from "@/src/components/insights/SpendingBreakdown";
import BudgetView from "@/src/components/insights/BudgetView";
import MonthSelector, { MonthOption } from "./MonthSelector";
import { analyzeSpendingPersonality } from "@/src/utils/analytics/personalityAnalysis";
import { useBudget } from "@/src/hooks/useBudget";

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
  availableMonths?: MonthOption[];
  selectedMonth?: number;
  selectedYear?: number;
  onMonthSelect?: (month: number, year: number) => void;
}

export default function SpendingSection({
  titleStyle,
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
  availableMonths,
  selectedMonth,
  selectedYear,
  onMonthSelect,
}: Props) {
  const [isBudgetMode, setIsBudgetMode] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Use budget hook to get real budget data
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
  } = useBudget();

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

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={titleStyle}>
          {isBudgetMode ? "Budget Overview" : "Your Spending Personality"}
        </Text>
        <View style={styles.titleRight}>
          {isBudgetMode && (
            <TouchableOpacity
              style={styles.reloadButton}
              activeOpacity={0.7}
              onPress={async () => {
                console.log(
                  "[BUDGET] Reload button pressed - force re-initializing..."
                );
                // Force re-initialize to recalculate suggestions
                await initializeBudget(true);
              }}
            >
              <Ionicons name="refresh-outline" size={16} color="#4A90E2" />
            </TouchableOpacity>
          )}
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

      {!isBudgetMode &&
        availableMonths &&
        availableMonths.length > 0 &&
        selectedMonth !== undefined &&
        selectedYear !== undefined &&
        onMonthSelect && (
          <MonthSelector
            availableMonths={availableMonths}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthSelect={onMonthSelect}
          />
        )}

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
            />
          )
        ) : (
          <SpendingBreakdown
            categoryBreakdown={categoryBreakdown}
            onCategoryPress={onCategoryPress}
            formatCategoryName={formatCategoryName}
            period={
              selectedMonth !== undefined && selectedYear !== undefined
                ? (() => {
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
                      selectedMonth === now.getMonth() &&
                      selectedYear === now.getFullYear();
                    return isCurrentMonth
                      ? "This Month"
                      : `${monthNames[selectedMonth]} ${selectedYear}`;
                  })()
                : "This Month"
            }
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  reloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
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
