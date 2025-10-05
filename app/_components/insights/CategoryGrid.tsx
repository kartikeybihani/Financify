import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "@/app/_styles/insightsStyles";

interface CategoryData {
  amount: number;
  percentage: number;
  color: string;
  hasRecurringTransactions: boolean;
}

interface CategoryGridProps {
  categoryBreakdown: [string, CategoryData][];
  onCategoryPress: (category: string, data: CategoryData) => void;
  formatCategoryName: (category: string) => string;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
}) => {
  // Map category names to Ionicons
  const getCategoryIcon = (
    categoryName: string
  ): keyof typeof Ionicons.glyphMap => {
    const iconMap: { [key: string]: keyof typeof Ionicons.glyphMap } = {
      Groceries: "storefront-outline",
      Food: "restaurant-outline",
      "Food & Dining": "restaurant-outline",
      "Dining Out": "restaurant-outline",
      Housing: "home-outline",
      Transportation: "car-outline",
      Shopping: "bag-outline",
      Entertainment: "film-outline",
      Subscriptions: "phone-portrait-outline",
      "Health & Fitness": "fitness-outline",
      Health: "medical-outline",
      "Bills & Utilities": "flash-outline",
      "Personal Care": "person-outline",
      Travel: "airplane-outline",
      Education: "school-outline",
      "Savings & Investments": "diamond-outline",
      Savings: "diamond-outline",
      Income: "cash-outline",
      Other: "cube-outline",
    };

    return iconMap[categoryName] || "cube-outline";
  };
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
        {categoryBreakdown.map(([category, data], idx) => (
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
                  color="white"
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
