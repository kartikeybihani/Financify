import React from "react";
import { View, Text, StyleSheet } from "react-native";
import CategoryGrid from "@/src/components/insights/CategoryGrid";

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
  return (
    <View>
      <Text style={titleStyle}>Spending Overview - This Month</Text>
      <CategoryGrid
        categoryBreakdown={categoryBreakdown}
        onCategoryPress={onCategoryPress}
        formatCategoryName={formatCategoryName}
      />
    </View>
  );
}

const styles = StyleSheet.create({});
