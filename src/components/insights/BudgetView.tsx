import React, { useEffect, useRef, useState } from "react";
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

interface SubcategoryBudgetData {
  name: string;
  spent: number;
  averageMonthly: number;
  icon?: string | null; // Icon/emoji for subcategory
  color?: string; // Color for subcategory
}

interface BudgetData {
  category: string;
  spent: number;
  budget: number;
  color: string;
  icon?: string | null; // Icon/emoji from categories table
  subcategories?: SubcategoryBudgetData[]; // Subcategories that were combined into this category
}

interface BudgetViewProps {
  categoryBreakdown: [string, CategoryData][];
  onCategoryPress: (category: string, data: CategoryData) => void;
  formatCategoryName: (category: string) => string;
  budgets?: BudgetData[]; // Optional: if budgets are set
  totalBudget?: number; // Optional: total monthly budget limit
  totalSpent?: number; // Optional: total spent (from actuals)
  budgetSummary?: any; // Budget summary with entry IDs
  onUpdateBudget?: (
    categoryId: string | null,
    categoryName: string,
    amount: number,
    color: string
  ) => Promise<boolean>;
  onDeleteBudget?: (entryId: string) => Promise<boolean>;
}

const BudgetView: React.FC<BudgetViewProps> = ({
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
  budgets = [],
  totalBudget: providedTotalBudget,
  totalSpent: providedTotalSpent,
  budgetSummary,
  onUpdateBudget,
  onDeleteBudget,
}) => {
  // Use provided totals if available (from real budget data), otherwise calculate from categoryBreakdown
  const totalSpent =
    providedTotalSpent !== undefined
      ? providedTotalSpent
      : categoryBreakdown.reduce((sum, [_, data]) => sum + data.amount, 0);

  // Build budget map: prefer real budgets if provided, otherwise infer from spending
  const budgetMap = new Map<string, BudgetData>();

  if (budgets.length > 0) {
    // Use real budget data
    budgets.forEach((budget) => {
      budgetMap.set(budget.category, budget);
    });
  } else {
    // Fallback: Create inferred budgets (1.2x current spending as a starting point)
    categoryBreakdown.forEach(([category, data]) => {
      budgetMap.set(category, {
        category,
        spent: data.amount,
        budget: Math.round(data.amount * 1.2),
        color: data.color,
      });
    });
  }

  // Calculate total budget: prefer provided total, otherwise sum of entries
  const totalBudget =
    providedTotalBudget !== undefined
      ? providedTotalBudget
      : Array.from(budgetMap.values()).reduce((sum, b) => sum + b.budget, 0);

  const remaining = totalBudget - totalSpent;
  const budgetProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Get status color based on progress
  const getStatusColor = (progress: number) => {
    if (progress < 70) return "#4ECDC4"; // Green - on track
    if (progress < 90) return "#FFB84D"; // Yellow - getting close
    if (progress < 100) return "#FF9500"; // Orange - warning
    return "#FF6B6B"; // Red - over budget
  };

  const getStatusEmoji = (progress: number) => {
    if (progress < 70) return "✨";
    if (progress < 90) return "⚡";
    if (progress < 100) return "⚠️";
    return "🚨";
  };

  const getStatusText = (progress: number) => {
    if (progress < 70) return "On Track";
    if (progress < 90) return "Watch It";
    if (progress < 100) return "Almost There";
    return "Over Budget";
  };

  const statusColor = getStatusColor(budgetProgress);
  const statusEmoji = getStatusEmoji(budgetProgress);
  const statusText = getStatusText(budgetProgress);

  // Sort categories by budget amount (highest first)
  const sortedBudgets = Array.from(budgetMap.values()).sort(
    (a, b) => b.budget - a.budget
  );

  // Create a map of category name to entry ID and category ID for edit/delete
  const categoryToEntry = new Map<
    string,
    { entryId: string; categoryId: string | null }
  >();
  if (budgetSummary?.entries) {
    budgetSummary.entries
      .filter((e: any) => e.scope_type === "category")
      .forEach((entry: any) => {
        const categoryName = entry.category?.name || entry.label;
        categoryToEntry.set(categoryName, {
          entryId: entry.id,
          categoryId: entry.category_id || null,
        });
      });
  }

  return (
    <View style={styles.container}>
      {/* Glassy Summary Header Box */}
      <View style={styles.glassHeader}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryLabel}>Monthly Budget</Text>
            <Text style={styles.summaryAmount}>
              ${totalBudget.toLocaleString()}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: `${statusColor}15` },
            ]}
          >
            <Text style={styles.statusEmoji}>{statusEmoji}</Text>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Compact Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(budgetProgress, 100)}%`,
                  backgroundColor: statusColor,
                },
              ]}
            />
          </View>
          <View style={styles.progressInfo}>
            <Text style={styles.progressLabel}>
              ${totalSpent.toLocaleString()} spent
            </Text>
            <Text
              style={[
                styles.progressRemaining,
                { color: remaining >= 0 ? "#4ECDC4" : "#FF6B6B" },
              ]}
            >
              ${Math.abs(remaining).toLocaleString()}{" "}
              {remaining >= 0 ? "left" : "over"}
            </Text>
          </View>
        </View>
      </View>

      {/* Compact Categories List - No ScrollView, No Header */}
      {sortedBudgets.length > 0 ? (
        <View style={styles.categoriesBox}>
          {/* Budget Label Header */}
          <View style={styles.budgetLabelHeader}>
            <Text style={styles.budgetLabelText}>Budget</Text>
          </View>
          <View style={styles.categoriesList}>
            {sortedBudgets.map((budget, index) => {
              const categoryProgress =
                budget.budget > 0 ? (budget.spent / budget.budget) * 100 : 0;
              const categoryStatusColor = getStatusColor(categoryProgress);
              const isOverBudget = categoryProgress >= 100;

              const entryInfo = categoryToEntry.get(budget.category);

              return (
                <CategoryBudgetCard
                  key={budget.category}
                  category={budget.category}
                  spent={budget.spent}
                  budget={budget.budget}
                  progress={categoryProgress}
                  color={budget.color}
                  icon={budget.icon}
                  statusColor={categoryStatusColor}
                  isOverBudget={isOverBudget}
                  formatCategoryName={formatCategoryName}
                  entryId={entryInfo?.entryId}
                  categoryId={entryInfo?.categoryId || null}
                  subcategories={budget.subcategories}
                  onPress={() => {
                    const categoryData = categoryBreakdown.find(
                      ([cat]) => cat === budget.category
                    )?.[1];
                    if (categoryData) {
                      onCategoryPress(budget.category, categoryData);
                    }
                  }}
                  onEdit={
                    onUpdateBudget && entryInfo
                      ? async () => {
                          // TODO: Open edit modal
                          console.log(
                            "Edit budget for:",
                            budget.category,
                            "Current:",
                            budget.budget
                          );
                        }
                      : undefined
                  }
                  onDelete={
                    entryInfo?.entryId && onDeleteBudget
                      ? async () => {
                          if (entryInfo.entryId) {
                            await onDeleteBudget(entryInfo.entryId);
                          }
                        }
                      : undefined
                  }
                  delay={index * 30}
                />
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={32} color="#666" />
          <Text style={styles.emptyText}>No budgets set</Text>
        </View>
      )}
    </View>
  );
};

// Individual Category Budget Card Component
interface CategoryBudgetCardProps {
  category: string;
  spent: number;
  budget: number;
  progress: number;
  color: string;
  icon?: string | null;
  statusColor: string;
  isOverBudget: boolean;
  formatCategoryName: (category: string) => string;
  onPress: () => void;
  entryId?: string;
  categoryId?: string | null;
  subcategories?: SubcategoryBudgetData[];
  onEdit?: () => void;
  onDelete?: () => void;
  delay: number;
}

const CategoryBudgetCard: React.FC<CategoryBudgetCardProps> = ({
  category,
  spent,
  budget,
  progress,
  color,
  icon,
  statusColor,
  isOverBudget,
  formatCategoryName,
  onPress,
  entryId,
  categoryId,
  subcategories,
  onEdit,
  onDelete,
  delay,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [isExpanded, setIsExpanded] = useState(true); // Always expanded by default

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  // Helper function to get icon for subcategory by name
  const getSubcategoryIcon = (
    subcatName: string
  ): { icon: string | null; color: string } => {
    // Map common subcategory names to icons/emojis
    const iconMap: { [key: string]: { icon: string; color: string } } = {
      Groceries: { icon: "🛒", color: "#4ECDC4" },
      "Dining Out": { icon: "🍽️", color: "#FFB84D" },
      Restaurants: { icon: "🍽️", color: "#FFB84D" },
      "Food & Dining": { icon: "🍽️", color: "#FFB84D" },
      Food: { icon: "🍔", color: "#FFB84D" },
      Health: { icon: "🏥", color: "#FF6B6B" },
      "Health & Fitness": { icon: "💪", color: "#FF6B6B" },
      Medical: { icon: "🏥", color: "#FF6B6B" },
      Fitness: { icon: "💪", color: "#FF6B6B" },
    };

    const normalized = subcatName.trim();
    const match =
      iconMap[normalized] ||
      iconMap[
        Object.keys(iconMap).find(
          (key) =>
            normalized.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(normalized.toLowerCase())
        ) || ""
      ];

    return match || { icon: "💰", color: color };
  };

  // Use icon from database if available, otherwise fallback to emoji or default
  const getCategoryIconDisplay = (
    iconValue?: string | null,
    defaultColor?: string
  ) => {
    if (iconValue) {
      // Check if it's an emoji (contains emoji unicode ranges)
      const emojiRegex =
        /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
      if (emojiRegex.test(iconValue)) {
        return { type: "emoji" as const, value: iconValue };
      }
      // Otherwise treat as Ionicons name
      return {
        type: "ionicon" as const,
        value: iconValue as keyof typeof Ionicons.glyphMap,
      };
    }
    // Fallback to default emoji
    return { type: "emoji" as const, value: "💰" };
  };

  const iconDisplay = getCategoryIconDisplay(icon, color);

  const remaining = budget - spent;
  const overspent = isOverBudget ? spent - budget : 0;

  return (
    <Animated.View
      style={[
        styles.categoryCard,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <View style={styles.categoryCardContent}>
        {/* Compact Row Layout */}
        <View style={styles.categoryRow}>
          {/* Dropdown Arrow or Dot Indicator */}
          {subcategories && subcategories.length > 0 ? (
            <TouchableOpacity
              onPress={() => setIsExpanded(!isExpanded)}
              style={styles.dropdownButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View
                style={[
                  styles.dropdownTriangle,
                  isExpanded
                    ? styles.dropdownTriangleExpanded
                    : styles.dropdownTriangleCollapsed,
                ]}
              />
            </TouchableOpacity>
          ) : (
            <View style={[styles.dotIndicator, { backgroundColor: color }]} />
          )}

          {/* Category Content */}
          <View style={styles.categoryRowContent}>
            {/* Icon - No Box, Just Colorful Icon/Emoji */}
            {iconDisplay.type === "emoji" ? (
              <Text style={styles.categoryIconEmoji}>{iconDisplay.value}</Text>
            ) : (
              <Ionicons
                name={iconDisplay.value}
                size={20}
                color={color}
                style={styles.categoryIconIonicon}
              />
            )}

            {/* Category Name */}
            <Text
              style={styles.categoryName}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {formatCategoryName(category)}
            </Text>

            {/* Spacer to push progress bar to fixed position */}
            <View style={styles.spacer} />

            {/* Progress Bar Section - Fixed Width and Position (aligned from right) */}
            <View style={styles.progressBarSection}>
              {/* Spent Amount on Left */}
              <Text style={styles.progressAmountLeft}>
                ${spent.toLocaleString()}
              </Text>

              {/* Progress Bar */}
              <View style={styles.categoryProgressBarBackground}>
                <Animated.View
                  style={[
                    styles.categoryProgressBarFill,
                    {
                      width: `${Math.min(progress, 100)}%`,
                      backgroundColor: statusColor,
                    },
                  ]}
                />
              </View>

              {/* Budget Amount on Right */}
              <Text style={styles.progressAmountRight}>
                ${budget.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Subcategories - Expandable */}
      {subcategories && subcategories.length > 0 && isExpanded && (
        <View style={styles.subcategoriesContainer}>
          {subcategories.map((subcat, subcatIndex) => {
            // Calculate total of all subcategories - they should add up to main category spent
            const totalSubcatSpent = subcategories.reduce(
              (sum, s) => sum + s.spent,
              0
            );
            // Use the sum of subcategories as the main category total (they should match)
            const mainCategorySpent =
              totalSubcatSpent > 0 ? totalSubcatSpent : spent;

            // Calculate subcategory's portion of the main budget proportionally
            // Based on their spending ratio
            const subcatBudgetPortion =
              mainCategorySpent > 0
                ? (subcat.spent / mainCategorySpent) * budget
                : budget / subcategories.length;

            // Calculate progress: subcategory spent vs its allocated budget portion
            const subcatProgress =
              subcatBudgetPortion > 0
                ? (subcat.spent / subcatBudgetPortion) * 100
                : 0;

            const subcatRemaining = subcatBudgetPortion - subcat.spent;
            const subcatIsOverBudget = subcat.spent > subcatBudgetPortion;

            // Get status color helper function (same as main category)
            const getSubcatStatusColor = (progress: number) => {
              if (progress < 70) return "#4ECDC4";
              if (progress < 90) return "#FFB84D";
              if (progress < 100) return "#FF9500";
              return "#FF6B6B";
            };
            const subcatStatusColor = getSubcatStatusColor(subcatProgress);

            // Get subcategory icon and color
            const subcatIconData = subcat.icon
              ? { icon: subcat.icon, color: subcat.color || color }
              : getSubcategoryIcon(subcat.name);

            const subcatIconDisplay = getCategoryIconDisplay(
              subcatIconData.icon,
              subcatIconData.color
            );
            const subcatIconColor = subcatIconData.color;

            return (
              <View key={subcatIndex} style={styles.subcategoryCard}>
                {/* Subcategory Row - Same style as main category but smaller */}
                <View style={styles.subcategoryRow}>
                  {/* Dot indicator for subcategories */}
                  <View
                    style={[
                      styles.dotIndicator,
                      { backgroundColor: subcatIconColor },
                    ]}
                  />

                  {/* Icon - Real Icon/Emoji */}
                  {subcatIconDisplay.type === "emoji" ? (
                    <Text style={styles.subcategoryIconEmoji}>
                      {subcatIconDisplay.value}
                    </Text>
                  ) : (
                    <Ionicons
                      name={subcatIconDisplay.value}
                      size={16}
                      color={subcatIconColor}
                      style={styles.subcategoryIconIonicon}
                    />
                  )}

                  {/* Subcategory Name */}
                  <Text
                    style={styles.subcategoryName}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {formatCategoryName(subcat.name)}
                  </Text>

                  {/* Spacer to push progress bar to fixed position */}
                  <View style={styles.spacer} />

                  {/* Progress Bar Section - Fixed Width and Position (aligned with main category) */}
                  <View style={styles.progressBarSection}>
                    {/* Spent Amount on Left */}
                    <Text style={styles.progressAmountLeft}>
                      ${subcat.spent.toLocaleString()}
                    </Text>

                    {/* Progress Bar */}
                    <View style={styles.categoryProgressBarBackground}>
                      <Animated.View
                        style={[
                          styles.categoryProgressBarFill,
                          {
                            width: `${Math.min(subcatProgress, 100)}%`,
                            backgroundColor: subcatStatusColor,
                          },
                        ]}
                      />
                    </View>

                    {/* Budget Amount on Right */}
                    <Text style={styles.progressAmountRight}>
                      ${Math.round(subcatBudgetPortion).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  // Glassy Header Box
  glassHeader: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Glass effect
    backdropFilter: "blur(10px)",
  },
  // Compact Summary Header
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryLeft: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "500",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.3,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  statusEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  // Compact Progress
  progressContainer: {
    marginBottom: 0,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: "#2a2a2a",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
  progressRemaining: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Categories Box (glassy style)
  categoriesBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    // Glass effect
    backdropFilter: "blur(10px)",
  },
  budgetLabelHeader: {
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingLeft: 4,
    marginBottom: 12,
  },
  budgetLabelText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Compact Categories List
  categoriesList: {
    gap: 4,
  },
  categoryCard: {
    marginBottom: 0,
  },
  categoryCardContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    paddingRight: 0, // No right padding to ensure alignment
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  dropdownButton: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  dropdownButtonPlaceholder: {
    width: 20,
    marginRight: 6,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
    marginLeft: 7,
  },
  dropdownTriangle: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
  },
  dropdownTriangleCollapsed: {
    // Pointing right when collapsed
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 5,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FF9500",
    borderRightColor: "transparent",
  },
  dropdownTriangleExpanded: {
    // Pointing down when expanded
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FF9500",
    borderBottomColor: "transparent",
  },
  categoryRowContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0, // Allow flex shrinking
    paddingRight: 0, // Ensure no extra padding
  },
  categoryIconEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  categoryIconIonicon: {
    marginRight: 10,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    marginRight: 8,
  },
  spacer: {
    flex: 1,
  },
  progressBarSection: {
    flexDirection: "row",
    alignItems: "center",
    width: 175,
    gap: 6,
    flexShrink: 0, // Prevent shrinking
    marginLeft: "auto", // Push to right edge
    position: "relative",
  },
  budgetLabelInline: {
    fontSize: 9,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    position: "absolute",
    top: -14,
    right: 0,
  },
  progressAmountLeft: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    minWidth: 45,
    textAlign: "right",
  },
  progressAmountRight: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    minWidth: 45,
    textAlign: "left",
  },
  categoryProgressBarBackground: {
    height: 4,
    width: 75,
    backgroundColor: "#2a2a2a",
    borderRadius: 2,
    overflow: "hidden",
  },
  categoryProgressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  categoryFooter: {
    marginTop: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft: {
    flex: 1,
  },
  footerActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  categoryRemaining: {
    fontSize: 11,
    fontWeight: "500",
  },
  // Subcategories - Same style as main category but smaller
  subcategoriesContainer: {
    marginTop: 0,
    paddingLeft: 40, // More indentation for subcategories (inner alignment)
    paddingTop: 0,
    paddingBottom: 0,
  },
  subcategoryCard: {
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 0,
    paddingRight: 0, // No right padding to ensure alignment
  },
  subcategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 0,
    minWidth: 0, // Allow flex shrinking
    paddingRight: 0, // Ensure no extra padding
  },
  subcategorySpacer: {
    width: 20, // Match the width of dropdown button + margin
    marginRight: 6,
  },
  subcategoryIconEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  subcategoryIconIonicon: {
    marginRight: 8,
  },
  subcategoryName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#DDD",
    marginRight: 8,
  },
  // Compact Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 13,
    color: "#888",
    marginTop: 8,
  },
});

export default BudgetView;
