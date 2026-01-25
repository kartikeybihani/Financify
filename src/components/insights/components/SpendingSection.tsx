import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import PersonalityBadge from "@/src/components/insights/PersonalityBadge";
import SpendingBreakdown from "@/src/components/insights/SpendingBreakdown";
import { MonthOption } from "./MonthSelector";
import MonthPickerModal from "@/src/components/modals/MonthPickerModal";
import { analyzeSpendingPersonality } from "@/src/utils/analytics/personalityAnalysis";

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
  getCategoryIcon?: (categoryName: string) => string; // Function to get icon from database
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
  getCategoryIcon,
  availableMonths,
  selectedMonth,
  selectedYear,
  onMonthSelect,
}: Props) {
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // Calculate total spent from category breakdown
  const totalSpent = categoryBreakdown.reduce(
    (sum, [_, data]) => sum + data.amount,
    0,
  );

  // Analyze spending personality
  const personality = analyzeSpendingPersonality(categoryBreakdown, totalSpent);

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

  return (
    <View style={styles.container}>
      <Text style={titleStyle}>Your Spending Personality</Text>

      <PersonalityBadge personality={personality} showDetails={true} />

      <SpendingBreakdown
        categoryBreakdown={categoryBreakdown}
        onCategoryPress={onCategoryPress}
        formatCategoryName={formatCategoryName}
        getCategoryIcon={getCategoryIcon}
        period={formatPeriodDisplay()}
        onPeriodPress={() => setMonthPickerVisible(true)}
      />

      {/* Month Picker Modal */}
      {onMonthSelect && (
        <MonthPickerModal
          visible={monthPickerVisible}
          onClose={() => setMonthPickerVisible(false)}
          selectedMonth={
            selectedMonth !== undefined ? selectedMonth : new Date().getMonth()
          }
          selectedYear={
            selectedYear !== undefined ? selectedYear : new Date().getFullYear()
          }
          onMonthSelect={(month, year) => {
            onMonthSelect?.(month, year);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
});
