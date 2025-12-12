import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Easing,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PersonalityBadge from "@/src/components/insights/PersonalityBadge";
import SpendingBreakdown from "@/src/components/insights/SpendingBreakdown";
import BudgetView from "@/src/components/insights/BudgetView";
import MonthSelector, { MonthOption } from "./MonthSelector";
import { analyzeSpendingPersonality } from "@/src/utils/analytics/personalityAnalysis";
import { useBudget } from "@/src/hooks/useBudget";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";

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
  availableMonths?: MonthOption[];
  selectedMonth?: number;
  selectedYear?: number;
  onMonthSelect?: (month: number, year: number) => void;
  onBudgetModeChange?: (isBudgetMode: boolean) => void;
  onOpenAddCategoryModalRef?: (openFn: () => void) => void;
}

export default function SpendingSection({
  titleStyle,
  categoryBreakdown,
  onCategoryPress,
  formatCategoryName,
  availableMonths,
  selectedMonth,
  selectedYear,
  onMonthSelect,
  onBudgetModeChange,
  onOpenAddCategoryModalRef,
}: Props) {
  const [isBudgetMode, setIsBudgetMode] = useState(false);
  const [addCategoryModalVisible, setAddCategoryModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Use budget hook to get real budget data
  const {
    budgetData,
    totalBudget,
    totalSpent: budgetTotalSpent,
    loading: budgetLoading,
    initializeBudget,
    refreshBudget,
    updateCategoryBudget,
    deleteCategoryBudget,
    budgetSummary,
    groupCategory,
    ungroupCategory,
    deleteCategory,
  } = useBudget();

  // Initialize budget on first mount if needed
  useEffect(() => {
    if (isBudgetMode && budgetData.length === 0 && !budgetLoading) {
      // Try to initialize budget if user enters budget mode and has no budgets
      initializeBudget();
    }
  }, [isBudgetMode, budgetData.length, budgetLoading, initializeBudget]);

  // Calculate total spent from category breakdown (fallback)
  const totalSpent = categoryBreakdown.reduce(
    (sum, [_, data]) => sum + data.amount,
    0
  );

  // Use budget total spent if available, otherwise use category breakdown total
  const displayTotalSpent =
    budgetTotalSpent > 0 ? budgetTotalSpent : totalSpent;

  // Analyze spending personality
  const personality = analyzeSpendingPersonality(categoryBreakdown, totalSpent);

  // Handle mode toggle with smooth animations
  const handleModeToggle = () => {
    // Fade out current view
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 20,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Switch mode
      setIsBudgetMode((prev) => {
        const newMode = !prev;
        // Notify parent of budget mode change
        onBudgetModeChange?.(newMode);
        return newMode;
      });

      // Prepare slide-in position
      slideAnim.setValue(-20);

      // Fade in new view
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // Expose function to open add category modal to parent
  const openAddCategoryModal = useCallback(() => {
    setAddCategoryModalVisible(true);
  }, []);

  // Use a ref to store the function and avoid calling setState during render
  const openAddCategoryModalRef = useRef(openAddCategoryModal);
  openAddCategoryModalRef.current = openAddCategoryModal;

  // Set up the ref callback in useEffect to avoid calling during render
  useEffect(() => {
    if (onOpenAddCategoryModalRef) {
      // Pass a stable function that calls the current ref value
      onOpenAddCategoryModalRef(() => {
        openAddCategoryModalRef.current();
      });
    }
  }, [onOpenAddCategoryModalRef]);

  // Notify parent of initial budget mode state
  useEffect(() => {
    onBudgetModeChange?.(isBudgetMode);
  }, [isBudgetMode, onBudgetModeChange]);

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={titleStyle}>
          {isBudgetMode ? "Budget Overview" : "Your Spending Personality"}
        </Text>
        <View style={styles.titleRight}>
          <TouchableOpacity
            style={[styles.budgetChip, isBudgetMode && styles.budgetChipActive]}
            activeOpacity={0.7}
            onPress={handleModeToggle}
          >
            <Text style={styles.budgetChipText}>
              {isBudgetMode ? "Spending" : "My Budget"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {!isBudgetMode &&
        availableMonths &&
        availableMonths.length > 0 &&
        selectedMonth !== undefined &&
        selectedYear !== undefined &&
        onMonthSelect && (
          <MonthSelector
            availableMonths={availableMonths}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthSelect={onMonthSelect}
          />
        )}

      {!isBudgetMode && (
        <PersonalityBadge personality={personality} showDetails={true} />
      )}

      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        {isBudgetMode ? (
          budgetLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4A90E2" />
              <Text style={styles.loadingText}>Loading your budget...</Text>
            </View>
          ) : (
            <BudgetView
              categoryBreakdown={categoryBreakdown}
              onCategoryPress={onCategoryPress}
              formatCategoryName={formatCategoryName}
              budgets={budgetData}
              totalBudget={totalBudget}
              totalSpent={displayTotalSpent}
              budgetSummary={budgetSummary}
              onUpdateBudget={updateCategoryBudget}
              onDeleteBudget={deleteCategoryBudget}
              onGroupCategory={groupCategory}
              onRemoveGrouping={ungroupCategory}
              onDeleteCategory={deleteCategory}
              refreshBudget={refreshBudget}
            />
          )
        ) : (
          <SpendingBreakdown
            categoryBreakdown={categoryBreakdown}
            onCategoryPress={onCategoryPress}
            formatCategoryName={formatCategoryName}
            period={
              selectedMonth !== undefined && selectedYear !== undefined
                ? (() => {
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
                      selectedMonth === now.getMonth() &&
                      selectedYear === now.getFullYear();
                    return isCurrentMonth
                      ? "This Month"
                      : `${monthNames[selectedMonth]} ${selectedYear}`;
                  })()
                : "This Month"
            }
          />
        )}
      </Animated.View>

      {/* Add Category Modal */}
      <AddCategoryModal
        visible={addCategoryModalVisible}
        onClose={() => setAddCategoryModalVisible(false)}
        onCategoryAdded={async () => {
          // Refresh budget data after adding category
          if (refreshBudget) {
            await refreshBudget();
          }
          setAddCategoryModalVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 0,
  },
  titleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  budgetChipActive: {
    backgroundColor: "rgba(74, 144, 226, 0.25)",
    borderColor: "rgba(74, 144, 226, 0.5)",
  },
  budgetChipText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
  },
});

// Add Category Modal Component
interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onCategoryAdded: () => Promise<void>;
}

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  visible,
  onClose,
  onCategoryAdded,
}) => {
  const [categoryName, setCategoryName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("💰");
  const [loading, setLoading] = useState(false);
  const screenHeight = Dimensions.get("window").height;
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const [rendered, setRendered] = useState(visible);

  const commonIcons = [
    "💰",
    "🛒",
    "🍽️",
    "🏠",
    "🚗",
    "🛍️",
    "🎬",
    "📱",
    "💪",
    "⚡",
    "💄",
    "✈️",
    "📚",
    "💎",
    "🏥",
    "🎮",
    "🎵",
    "🎨",
    "🏋️",
    "🧘",
    "🍕",
    "☕",
    "🍔",
    "🍰",
    "🥗",
    "🍺",
    "🍷",
    "🚕",
    "🚌",
    "🚇",
  ];

  const ionicons = [
    "home",
    "restaurant",
    "car",
    "shirt",
    "film",
    "phone-portrait",
    "fitness",
    "flash",
    "beauty",
    "airplane",
    "book",
    "diamond",
    "medical",
    "game-controller",
    "musical-notes",
    "color-palette",
    "barbell",
    "leaf",
    "pizza",
    "cafe",
    "fast-food",
    "ice-cream",
    "nutrition",
    "beer",
    "wine",
    "taxi",
    "bus",
    "train",
  ];

  useEffect(() => {
    if (visible) {
      setRendered(true);
      slideAnim.setValue(screenHeight);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 250,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setRendered(false);
        setCategoryName("");
        setSelectedIcon("💰");
      });
    }
  }, [visible, rendered, slideAnim, screenHeight]);

  if (!rendered) return null;

  const handleSave = async () => {
    if (!categoryName.trim()) {
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error("Not authenticated");
      }

      // Create slug from name
      let baseSlug = categoryName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .trim();

      // Handle potential slug conflicts
      let slug = baseSlug;
      let counter = 1;
      let slugExists = true;

      while (slugExists) {
        const { data: existingSlug } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", slug)
          .limit(1);

        if (!existingSlug || existingSlug.length === 0) {
          slugExists = false;
        } else {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
      }

      // Get the next rank
      const { data: maxRankData } = await supabase
        .from("categories")
        .select("rank")
        .eq("user_id", user.id)
        .order("rank", { ascending: false })
        .limit(1);

      const nextRank = maxRankData?.[0]?.rank ? maxRankData[0].rank + 1 : 1;

      // Generate UUID
      const categoryId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c == "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        }
      );

      const { error } = await supabase.from("categories").insert({
        id: categoryId,
        user_id: user.id,
        name: categoryName.trim(),
        slug: slug,
        icon: selectedIcon,
        color: "#4A90E2",
        rank: nextRank,
        is_active: true,
      });

      if (error) throw error;

      await onCategoryAdded();
      onClose();
    } catch (error) {
      logger.error("[BUDGET] Error adding category:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={modalStyles.sheetOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[
                modalStyles.sheetContainer,
                {
                  transform: [{ translateY: slideAnim }],
                  maxHeight: screenHeight * 0.9,
                },
              ]}
            >
              <View style={modalStyles.sheetHandle} />
              <ScrollView
                style={modalStyles.scrollView}
                contentContainerStyle={modalStyles.scrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
              >
                <View style={modalStyles.sheetHeader}>
                  <Text style={modalStyles.sheetTitle}>Add New Category</Text>
                </View>

                <View style={modalStyles.section}>
                  <Text style={modalStyles.label}>Category Name</Text>
                  <TextInput
                    style={modalStyles.inputRow}
                    value={categoryName}
                    onChangeText={setCategoryName}
                    placeholder="Enter category name"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    autoFocus
                  />
                </View>

                <View style={modalStyles.section}>
                  <Text style={modalStyles.label}>Icon</Text>
                  <View style={modalStyles.iconSelector}>
                    <Text style={modalStyles.selectedIcon}>{selectedIcon}</Text>
                    <Text style={modalStyles.iconLabel}>
                      {ionicons.includes(selectedIcon) ? "Ionicons" : "Emoji"}
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={modalStyles.iconScroll}
                  >
                    <View style={modalStyles.iconRow}>
                      {commonIcons.map((icon) => (
                        <TouchableOpacity
                          key={icon}
                          style={[
                            modalStyles.iconOption,
                            selectedIcon === icon &&
                              modalStyles.iconOptionSelected,
                          ]}
                          onPress={() => setSelectedIcon(icon)}
                        >
                          <Text style={modalStyles.iconOptionText}>{icon}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={modalStyles.iconScroll}
                  >
                    <View style={modalStyles.iconRow}>
                      {ionicons.map((icon) => (
                        <TouchableOpacity
                          key={icon}
                          style={[
                            modalStyles.iconOption,
                            selectedIcon === icon &&
                              modalStyles.iconOptionSelected,
                          ]}
                          onPress={() => setSelectedIcon(icon)}
                        >
                          <Ionicons
                            name={icon as keyof typeof Ionicons.glyphMap}
                            size={24}
                            color="#fff"
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={modalStyles.sheetButtonsRow}>
                  <TouchableOpacity
                    style={modalStyles.sheetSecondaryButton}
                    onPress={onClose}
                  >
                    <Text style={modalStyles.sheetSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      modalStyles.sheetPrimaryButton,
                      (!categoryName.trim() || loading) && { opacity: 0.5 },
                    ]}
                    onPress={handleSave}
                    disabled={!categoryName.trim() || loading}
                  >
                    <Text style={modalStyles.sheetPrimaryText}>
                      {loading ? "Adding..." : "Add Category"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    width: "100%",
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    minHeight: 400,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetHeader: {
    marginBottom: 16,
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  section: {
    marginTop: 4,
    marginBottom: 16,
  },
  label: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 16,
  },
  iconSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  selectedIcon: {
    fontSize: 32,
    marginRight: 8,
  },
  iconLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  iconScroll: {
    marginBottom: 12,
  },
  iconRow: {
    flexDirection: "row",
    gap: 8,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconOptionSelected: {
    borderColor: "#4A90E2",
    backgroundColor: "rgba(74, 144, 226, 0.2)",
  },
  iconOptionText: {
    fontSize: 24,
  },
  sheetButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
    paddingBottom: 10,
  },
  sheetSecondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sheetSecondaryText: {
    color: "#fff",
    fontWeight: "600",
  },
  sheetPrimaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#4A90E2",
  },
  sheetPrimaryText: {
    color: "#0b121a",
    fontWeight: "700",
  },
});
