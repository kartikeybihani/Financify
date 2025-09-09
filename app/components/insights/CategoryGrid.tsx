import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../styles/insightsStyles";

interface CategoryData {
  amount: number;
  percentage: number;
  color: string;
}

interface CategoryGridProps {
  categoryBreakdown: [string, CategoryData][];
  onCategoryPress: (category: string, data: CategoryData) => void;
  formatCategoryName: (category: string) => string;
  getCategoryIcon: (category: string) => keyof typeof Ionicons.glyphMap;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
  getCategoryIcon,
}) => {
  return (
    <View style={styles.categoryGridContainer}>
      <View style={styles.totalSpendingCard}>
        <Text style={styles.totalSpendingLabel}>Total Spent</Text>
        <Text style={styles.totalSpendingAmount}>
          $
          {categoryBreakdown
            .reduce((acc, [_, data]) => acc + data.amount, 0)
            .toLocaleString("en-US", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
        </Text>
        <Text style={styles.totalSpendingPeriod}>This Month</Text>
      </View>
      <View style={styles.categoryGrid}>
        {categoryBreakdown.slice(0, 4).map(([category, data], idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.categoryGridItem}
            onPress={() => onCategoryPress(category, data)}
          >
            <View style={styles.categoryGridHeader}>
              <View
                style={[styles.categoryIcon, { backgroundColor: data.color }]}
              >
                <Ionicons
                  name={getCategoryIcon(category)}
                  size={20}
                  color="#fff"
                />
              </View>
              <Text style={styles.gridCategoryPercentage}>
                {data.percentage.toFixed(0)}%
              </Text>
            </View>
            <Text style={styles.gridCategoryLabel} numberOfLines={1}>
              {formatCategoryName(category)}
            </Text>
            <Text style={styles.gridCategoryAmount}>
              ${data.amount.toLocaleString()}
            </Text>
            <View style={styles.miniProgressBar}>
              <View
                style={[
                  styles.miniProgressFill,
                  {
                    width: `${data.percentage}%`,
                    backgroundColor: data.color,
                  },
                ]}
              />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default CategoryGrid;
