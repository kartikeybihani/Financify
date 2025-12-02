import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import PersonalityBadge from "@/src/components/insights/PersonalityBadge";
import SpendingBreakdown from "@/src/components/insights/SpendingBreakdown";
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
}

export default function SpendingSection({
  titleStyle,
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
}: Props) {
  // Calculate total spent
  const totalSpent = categoryBreakdown.reduce(
    (sum, [_, data]) => sum + data.amount,
    0
  );

  // Analyze spending personality
  const personality = analyzeSpendingPersonality(categoryBreakdown, totalSpent);

  return (
    <View>
      <View style={styles.titleRow}>
        <Text style={titleStyle}>Your Spending Personality</Text>
        <TouchableOpacity
          style={styles.budgetChip}
          activeOpacity={0.7}
          onPress={() => {
            // TODO: Handle budget navigation
          }}
        >
          <Text style={styles.budgetChipText}>My Budget</Text>
        </TouchableOpacity>
      </View>

      <PersonalityBadge personality={personality} showDetails={true} />

      <SpendingBreakdown
        categoryBreakdown={categoryBreakdown}
        onCategoryPress={onCategoryPress}
        formatCategoryName={formatCategoryName}
      />
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
  budgetChipText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
