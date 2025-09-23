import React from "react";
import { View, Text, StyleSheet } from "react-native";
import CategoryGrid from "../../insights/CategoryGrid";

interface Props {
  titleStyle: any;
  categoryBreakdown: [
    string,
    { amount: number; percentage: number; color: string }
  ][];
  onCategoryPress: (
    category: string,
    data: { amount: number; percentage: number; color: string }
  ) => void;
  formatCategoryName: (cat: string) => string;
  getCategoryIcon: (cat: string) => any;
}

export default function SpendingSection({
  titleStyle,
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
  getCategoryIcon,
}: Props) {
  return (
    <View>
      <Text style={titleStyle}>Spending Overview - This Month</Text>
      <CategoryGrid
        categoryBreakdown={categoryBreakdown}
        onCategoryPress={onCategoryPress}
        formatCategoryName={formatCategoryName}
        getCategoryIcon={getCategoryIcon}
      />
    </View>
  );
}

const styles = StyleSheet.create({});
