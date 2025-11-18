import React from "react";
import { View, Text, StyleSheet } from "react-native";
import PersonalityBadge from "@/src/components/insights/PersonalityBadge";
import SpendingBreakdown from "@/src/components/insights/SpendingBreakdown";
import {
  analyzeSpendingPersonality,
  SpendingPersonality,
} from "@/src/utils/analytics/personalityAnalysis";

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
      <Text style={titleStyle}>Your Spending Personality</Text>

      <PersonalityBadge personality={personality} showDetails={true} />

      <SpendingBreakdown
        categoryBreakdown={categoryBreakdown}
        onCategoryPress={onCategoryPress}
        formatCategoryName={formatCategoryName}
      />
    </View>
  );
}

const styles = StyleSheet.create({});
