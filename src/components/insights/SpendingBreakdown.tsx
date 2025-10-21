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

      {/* Top 3 Categories - Hero Display */}
      <View style={styles.heroSection}>
        <Text style={styles.sectionTitle}>Top Spending Categories</Text>
        <View style={styles.heroGrid}>
          {topCategories.map(([category, data], index) => (
            <TouchableOpacity
              key={category}
              style={[styles.heroCard, { borderLeftColor: data.color }]}
              onPress={() => onCategoryPress(category, data)}
              activeOpacity={0.8}
            >
              <View style={styles.heroCardHeader}>
                <View
                  style={[
                    styles.heroIcon,
                    { backgroundColor: `${data.color}15` },
                  ]}
                >
                  <Ionicons
                    name={getCategoryIcon(category)}
                    size={24}
                    color={data.color}
                  />
                </View>
                <View style={styles.heroRank}>
                  <Text style={[styles.rankNumber, { color: data.color }]}>
                    #{index + 1}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroCategoryName} numberOfLines={1}>
                {formatCategoryName(category)}
              </Text>

              <Text style={styles.heroAmount}>
                ${data.amount.toLocaleString()}
              </Text>

              <View style={styles.heroProgressContainer}>
                <View style={styles.heroProgressBar}>
                  <View
                    style={[
                      styles.heroProgressFill,
                      {
                        width: `${Math.min(data.percentage, 100)}%`,
                        backgroundColor: data.color,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.heroPercentage, { color: data.color }]}>
                  {data.percentage.toFixed(0)}%
                </Text>
              </View>
            </TouchableOpacity>
          ))}
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
  heroSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ccc",
    marginBottom: 16,
  },
  heroGrid: {
    flexDirection: "row",
    gap: 12,
  },
  heroCard: {
    flex: 1,
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  heroCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  heroRank: {
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  rankNumber: {
    fontSize: 12,
    fontWeight: "600",
  },
  heroCategoryName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  heroProgressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    marginRight: 8,
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  heroPercentage: {
    fontSize: 12,
    fontWeight: "600",
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
