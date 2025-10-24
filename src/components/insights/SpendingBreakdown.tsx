import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface CategoryData {
  amount: number;
  percentage: number;
  color: string;
  hasRecurringTransactions: boolean;
}

interface SpendingBreakdownProps {
  categoryBreakdown: [string, CategoryData][];
  onCategoryPress: (category: string, data: CategoryData) => void;
  formatCategoryName: (category: string) => string;
}

const SpendingBreakdown: React.FC<SpendingBreakdownProps> = ({
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
}) => {
  const totalSpent = categoryBreakdown.reduce(
    (sum, [_, data]) => sum + data.amount,
    0
  );

  // Get top 3 categories for the main display
  const topCategories = categoryBreakdown
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 3);

  const remainingCategories = categoryBreakdown
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(3);

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

  const getSpendingMood = (total: number) => {
    if (total < 500) return { mood: "Mindful", emoji: "🧘", color: "#4ECDC4" };
    if (total < 1000)
      return { mood: "Balanced", emoji: "⚖️", color: "#96CEB4" };
    if (total < 2000) return { mood: "Active", emoji: "🚀", color: "#FF9500" };
    return { mood: "Luxurious", emoji: "💎", color: "#FF6B6B" };
  };

  const spendingMood = getSpendingMood(totalSpent);

  return (
    <View style={styles.container}>
      {/* Spending Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.moodContainer}>
            <Text style={styles.moodEmoji}>{spendingMood.emoji}</Text>
            <View>
              <Text style={styles.moodLabel}>Spending Mood</Text>
              <Text style={[styles.moodText, { color: spendingMood.color }]}>
                {spendingMood.mood}
              </Text>
            </View>
          </View>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total Spent</Text>
            <Text style={styles.totalAmount}>
              ${totalSpent.toLocaleString()}
            </Text>
            <Text style={styles.totalPeriod}>This Month</Text>
          </View>
        </View>
      </View>

      {/* Money Flow - Visual Storytelling */}
      <View style={styles.moneyFlowSection}>
        <Text style={styles.flowTitle}>Where Your Money Flows</Text>
        <View style={styles.flowContainer}>
          {/* Flowing Categories */}
          <View style={styles.flowCategories}>
            {topCategories.map(([category, data], index) => (
              <View
                key={`container-${category}`}
                style={styles.flowCardContainer}
              >
                {/* Connection Line */}
                <View
                  style={[
                    styles.flowLine,
                    {
                      backgroundColor: data.color,
                    },
                  ]}
                />

                <TouchableOpacity
                  key={category}
                  style={[
                    styles.flowCard,
                    {
                      backgroundColor: data.color,
                      transform: [
                        { scale: 0.8 + (data.percentage / 100) * 0.4 },
                      ],
                    },
                  ]}
                  onPress={() => onCategoryPress(category, data)}
                  activeOpacity={0.8}
                >
                  <View style={styles.flowCardContent}>
                    <View style={styles.flowIconContainer}>
                      <Ionicons
                        name={getCategoryIcon(category)}
                        size={18}
                        color="#fff"
                      />
                    </View>

                    <Text style={styles.flowCategoryName} numberOfLines={1}>
                      {formatCategoryName(category)}
                    </Text>

                    <Text style={styles.flowAmount}>
                      ${data.amount.toLocaleString()}
                    </Text>

                    <View style={styles.flowPercentageContainer}>
                      <Text style={styles.flowPercentage}>
                        {data.percentage.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Remaining Categories - Compact List */}
      {remainingCategories.length > 0 && (
        <View style={styles.remainingSection}>
          <Text style={styles.sectionTitle}>Other Categories</Text>
          <View style={styles.remainingList}>
            {remainingCategories.map(([category, data]) => (
              <TouchableOpacity
                key={category}
                style={styles.remainingItem}
                onPress={() => onCategoryPress(category, data)}
                activeOpacity={0.7}
              >
                <View style={styles.remainingLeft}>
                  <View
                    style={[
                      styles.remainingIcon,
                      { backgroundColor: `${data.color}15` },
                    ]}
                  >
                    <Ionicons
                      name={getCategoryIcon(category)}
                      size={16}
                      color={data.color}
                    />
                  </View>
                  <Text style={styles.remainingName} numberOfLines={1}>
                    {formatCategoryName(category)}
                  </Text>
                </View>

                <View style={styles.remainingRight}>
                  <Text style={styles.remainingAmount}>
                    ${data.amount.toLocaleString()}
                  </Text>
                  <Text
                    style={[styles.remainingPercentage, { color: data.color }]}
                  >
                    {data.percentage.toFixed(0)}%
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  summaryCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moodContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  moodEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  moodLabel: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
  moodText: {
    fontSize: 13,
    fontWeight: "600",
  },
  totalContainer: {
    alignItems: "flex-end",
  },
  totalLabel: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  totalPeriod: {
    fontSize: 12,
    color: "#4A90E2",
  },
  moneyFlowSection: {
    marginBottom: 32,
  },
  flowTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
    textAlign: "center",
  },
  flowContainer: {
    alignItems: "center",
    paddingTop: 8,
    position: "relative",
  },
  flowCategories: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
  },
  flowCardContainer: {
    position: "relative",
    alignItems: "center",
  },
  flowLine: {
    position: "absolute",
    top: -30,
    left: "50%",
    width: 2,
    height: 30,
    opacity: 0.6,
    zIndex: 1,
    transform: [{ translateX: -1 }],
  },
  flowCard: {
    borderRadius: 20,
    padding: 16,
    minWidth: 80,
    alignItems: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  flowCardContent: {
    alignItems: "center",
  },
  flowIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  flowCategoryName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
  },
  flowAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
  },
  flowPercentageContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  flowPercentage: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ccc",
    marginBottom: 16,
  },
  remainingSection: {
    marginBottom: 16,
  },
  remainingList: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
    overflow: "hidden",
  },
  remainingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  remainingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  remainingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  remainingName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#fff",
    flex: 1,
  },
  remainingRight: {
    alignItems: "flex-end",
  },
  remainingAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  remainingPercentage: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
});

export default SpendingBreakdown;
