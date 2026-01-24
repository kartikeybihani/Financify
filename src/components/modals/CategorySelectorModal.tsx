import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Alert,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconButton from "@/src/components/shared/IconButton";
import * as Haptics from "expo-haptics";
import { useCategories } from "@/src/hooks/useCategories";
import { supabase } from "@/src/lib/supabase/supabase";
import { DeviceEventEmitter } from "react-native";
import AddCategoryModal from "@/src/components/insights/components/AddCategoryModal";
import { OptimisticUpdateManager } from "@/src/shared/utils/optimisticUpdates";

interface CategorySelectorModalProps {
  visible: boolean;
  transactionId: string | null;
  merchantName?: string;
  transactionName?: string;
  currentCategoryName?: string;
  onClose: () => void;
}

export default function CategorySelectorModal({
  visible,
  transactionId,
  merchantName,
  transactionName,
  currentCategoryName,
  onClose,
}: CategorySelectorModalProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  // Get current user ID - fetch when modal becomes visible
  useEffect(() => {
    if (visible) {
      const getUser = async () => {
        const { data: userData } = await supabase.auth.getUser();
        setCurrentUserId(userData.user?.id || null);
      };
      getUser();
      // Reset add category modal state
      setShowAddCategoryModal(false);
    }
  }, [visible]);

  const {
    categories,
    formatCategoryName: formatCategoryFromHook,
    refreshCategories,
  } = useCategories(currentUserId || undefined);

  // Responsive layout flags
  const isLandscape = width > height;
  const isSmallPhone = height < 700;
  const isTallPhone = height >= 840;

  const handleClose = () => {
    setShowAddCategoryModal(false);
    onClose();
  };

  const handleAddNewCategory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddCategoryModal(true);
  };

  const handleCategoryLongPress = (categoryId: string) => {
    if (categoryId === "all") return; // Don't allow deleting "All Categories"

    const category = categories.find((cat) => cat.id === categoryId);
    if (!category) return;

    // All categories are user-owned now, so allow deletion
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${category.name}"? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDeleteCategory(categoryId),
        },
      ],
    );
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId)
        .eq("user_id", currentUserId); // Ensure user can only delete their own categories

      if (error) throw error;

      // Refresh categories to update the grid
      await refreshCategories();

      Alert.alert("Success", "Category deleted successfully!");
    } catch (error) {
      console.error("Error deleting category:", error);
      Alert.alert("Error", "Failed to delete category. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = async (categoryId: string) => {
    if (!transactionId) return;

    let selectedCategory;
    if (categoryId === "all") {
      selectedCategory = {
        id: "all",
        name: "All Categories",
        icon: "🏷️",
        color: "#4A90E2",
      };
    } else {
      selectedCategory = categories.find((cat) => cat.id === categoryId);
    }

    if (!selectedCategory) return;

    // Show iOS-style alert with options
    Alert.alert(
      "Update Category",
      `How would you like to update this transaction to "${selectedCategory.name}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "This Transaction Only",
          onPress: () => handleUpdateOption("single", categoryId),
        },
        {
          text: "All Similar Transactions",
          onPress: () => handleUpdateOption("similar", categoryId),
        },
      ],
    );
  };

  const handleUpdateOption = async (
    updateType: "single" | "similar",
    categoryId: string,
  ) => {
    if (!transactionId) return;

    // Handle "all" category - this should clear the category (set to null)
    if (categoryId === "all") {
      // Store optimistic update to clear category
      OptimisticUpdateManager.storeCategoryUpdate(
        transactionId,
        "", // Empty string to indicate clearing
        "All Categories"
      );

      const { error } = await supabase
        .from("transactions")
        .update({ category_id: null })
        .eq("id", transactionId);

      if (error) {
        OptimisticUpdateManager.clearCategoryUpdate(transactionId);
        throw error;
      }

      setTimeout(() => {
        OptimisticUpdateManager.clearCategoryUpdate(transactionId);
      }, 1000);

      DeviceEventEmitter.emit("transactionCategoryUpdated", {
        transactionId: transactionId,
        newCategory: "All Categories",
        updateType: "single",
        affectedTransactions: [{ transactionId }],
      });

      handleClose();
      return;
    }

    const selectedCategory = categories.find((cat) => cat.id === categoryId);
    if (!selectedCategory) return;

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let affectedTransactions: Array<{
        transactionId: string;
        transactionName: string;
        amount: number;
        date: string;
      }> = [];

      if (updateType === "single") {
        // Store optimistic update IMMEDIATELY for instant UI feedback
        OptimisticUpdateManager.storeCategoryUpdate(
          transactionId,
          selectedCategory.id,
          selectedCategory.name
        );

        // Single transaction: Update ONLY category_id (not new_category)
        // Category name will be resolved via join with categories table
        const { error } = await supabase
          .from("transactions")
          .update({
            category_id: selectedCategory.id, // Use ID only - name comes from categories table
          })
          .eq("id", transactionId);

        if (error) {
          // Revert optimistic update on error
          OptimisticUpdateManager.clearCategoryUpdate(transactionId);
          throw error;
        }

        // Clear optimistic update after successful DB update (with small delay to ensure UI has updated)
        setTimeout(() => {
          OptimisticUpdateManager.clearCategoryUpdate(transactionId);
        }, 1000);

        // For single transaction, we only have one affected transaction
        affectedTransactions = [
          {
            transactionId: transactionId,
            transactionName: "Transaction", // We'll get this from the UI state
            amount: 0, // We'll get this from the UI state
            date: new Date().toISOString(),
          },
        ];

        // Alert.alert("Success", `Category updated to ${selectedCategory.name}`);
      } else {
        // Similar transactions: Update new_category for all similar + create rules
        const userResponse = await supabase.auth.getUser();
        const userId = userResponse.data.user?.id;

        if (!userId) {
          throw new Error("User not authenticated");
        }

        // Determine which field to use for matching: merchant_name first, then transaction name
        const useMerchantName = merchantName && merchantName.trim() !== "";
        const useTransactionName =
          !useMerchantName && transactionName && transactionName.trim() !== "";

        if (!useMerchantName && !useTransactionName) {
          Alert.alert(
            "Error",
            "Cannot update similar transactions without merchant name or transaction name",
          );
          return;
        }

        // Store optimistic updates for all affected transactions IMMEDIATELY
        // First, get the list of transactions that will be updated
        let selectQueryForIds = supabase
          .from("transactions")
          .select("id")
          .eq("user_id", userId);

        if (useMerchantName && merchantName) {
          selectQueryForIds = selectQueryForIds.eq("merchant_name", merchantName);
        } else if (useTransactionName && transactionName) {
          selectQueryForIds = selectQueryForIds.eq("name", transactionName);
        }

        const { data: transactionIds } = await selectQueryForIds;
        
        // Store optimistic updates for all affected transactions
        if (transactionIds && transactionIds.length > 0) {
          transactionIds.forEach((tx: any) => {
            OptimisticUpdateManager.storeCategoryUpdate(
              tx.id,
              selectedCategory.id,
              selectedCategory.name
            );
          });
        }

        // Build the query based on which field we're using
        // Update ONLY category_id (not new_category) - name comes from categories table
        let updateQuery = supabase
          .from("transactions")
          .update({
            category_id: selectedCategory.id, // Use ID only - name comes from categories table
          })
          .eq("user_id", userId);

        let selectQuery = supabase
          .from("transactions")
          .select("id, name, amount, date")
          .eq("user_id", userId);

        if (useMerchantName && merchantName) {
          updateQuery = updateQuery.eq("merchant_name", merchantName);
          selectQuery = selectQuery.eq("merchant_name", merchantName);
        } else if (useTransactionName && transactionName) {
          updateQuery = updateQuery.eq("name", transactionName);
          selectQuery = selectQuery.eq("name", transactionName);
        }

        const { data: updateResult, error } = await updateQuery.select("id");

        if (error) {
          // Revert optimistic updates on error
          if (transactionIds && transactionIds.length > 0) {
            const ids = transactionIds.map((tx: any) => tx.id);
            OptimisticUpdateManager.clearCategoryUpdates(ids);
          }
          throw error;
        }

        const data = updateResult?.length || 0;

        // Get the affected transaction IDs and details
        const matchField = useMerchantName ? "merchant_name" : "name";
        const matchValue = useMerchantName
          ? merchantName || ""
          : transactionName || "";

        // Filter by category_id instead of new_category name
        const { data: affectedData, error: affectedError } =
          await selectQuery.eq("category_id", selectedCategory.id);

        if (!affectedError && affectedData) {
          affectedTransactions = affectedData.map((tx: any) => ({
            transactionId: tx.id,
            transactionName: tx.name,
            amount: tx.amount,
            date: tx.date,
          }));
        }

        Alert.alert(
          "Success",
          `Updated ${data} similar transactions to ${selectedCategory.name}`,
        );

        // Create or update category rule for future transactions
        try {
          const matchValue = useMerchantName ? merchantName : transactionName;
          const matchField = useMerchantName ? "merchant_name" : "name";

          const { error: ruleError } = await supabase.rpc(
            "create_or_update_category_rule",
            {
              p_user_id: userId,
              p_match_field: matchField,
              p_match_value: matchValue,
              p_category_name: selectedCategory.name,
            },
          );

          if (ruleError) {
            console.error("Error creating category rule:", ruleError);
            // Don't fail the whole operation if rule creation fails
          }
        } catch (ruleErr) {
          console.error("Exception creating category rule:", ruleErr);
          // Don't fail the whole operation
        }

        // Clear optimistic updates after successful DB update (with small delay)
        if (transactionIds && transactionIds.length > 0) {
          setTimeout(() => {
            const ids = transactionIds.map((tx: any) => tx.id);
            OptimisticUpdateManager.clearCategoryUpdates(ids);
          }, 1000);
        }
      }

      // Emit enhanced global event with affected transaction data
      const eventData = {
        transactionId: transactionId,
        newCategory: selectedCategory.name,
        updateType,
        affectedTransactions,
        merchantName: merchantName,
        transactionName: transactionName,
      };

      DeviceEventEmitter.emit("transactionCategoryUpdated", eventData);

      // Close the modal and return to transaction detail
      handleClose();
    } catch (error) {
      console.error("Error updating category:", error);
      Alert.alert("Error", "Failed to update category. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBackgroundColor = (categoryName: string) => {
    const colorMap: { [key: string]: string } = {
      // Financial categories
      Payment: "#e8f5e8", // Light green
      Transfer: "#e8f5e8", // Light green
      Deposit: "#e8f4fd", // Light blue
      Income: "#e8f4fd", // Light blue

      // Expense categories
      "Food and Drink": "#fff3e0", // Light orange
      Shops: "#f3e5f5", // Light purple
      Recreation: "#ffebee", // Light pink
      Transportation: "#e0f2f1", // Light teal
      Travel: "#e1f5fe", // Light cyan
      Healthcare: "#f9fbe7", // Light lime
      Service: "#fce4ec", // Light pink
      Community: "#e8f5e8", // Light green
      "Government and Non-Profit": "#e3f2fd", // Light blue
      Other: "#f5f5f5", // Light gray
    };

    // Try exact match first
    if (colorMap[categoryName]) {
      return colorMap[categoryName];
    }

    // Try partial matches for common keywords
    const name = categoryName.toLowerCase();
    if (
      name.includes("food") ||
      name.includes("restaurant") ||
      name.includes("dining")
    ) {
      return "#fff3e0"; // Light orange
    }
    if (
      name.includes("shop") ||
      name.includes("retail") ||
      name.includes("store")
    ) {
      return "#f3e5f5"; // Light purple
    }
    if (
      name.includes("transport") ||
      name.includes("car") ||
      name.includes("gas")
    ) {
      return "#e0f2f1"; // Light teal
    }
    if (name.includes("health") || name.includes("medical")) {
      return "#f9fbe7"; // Light lime
    }
    if (name.includes("travel") || name.includes("hotel")) {
      return "#e1f5fe"; // Light cyan
    }
    if (name.includes("entertainment") || name.includes("recreation")) {
      return "#ffebee"; // Light pink
    }
    if (name.includes("payment") || name.includes("transfer")) {
      return "#e8f5e8"; // Light green
    }
    if (
      name.includes("income") ||
      name.includes("deposit") ||
      name.includes("salary")
    ) {
      return "#e8f4fd"; // Light blue
    }

    // Default fallback
    return "#f8f9fa"; // Very light gray
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.container}>
              {/* Drag Handle */}
              <View style={styles.dragHandle} />

              {/* Header with Categories Label and Back Button */}
              <View style={styles.headerContainer}>
                <Text style={styles.categoriesLabel}>Categories</Text>
                <IconButton
                  icon="chevron-back"
                  onPress={handleClose}
                  size={22}
                  style={styles.backButton}
                />
              </View>

              {/* Content */}
              <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingBottom: insets.bottom + 20 },
                ]}
                showsVerticalScrollIndicator={false}
              >
                {/* Category Chips Grid */}
                <View style={styles.categoryChipsContainer}>
                  {/* All Categories as first chip */}
                  <TouchableOpacity
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: "#e8f4fd", // Light blue background
                        borderColor: "#4A90E2",
                        borderWidth: 1,
                      },
                    ]}
                    onPress={() => handleCategorySelect("all")}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={styles.chipIcon}>🏷️</Text>
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: "#4A90E2",
                          fontWeight: "500",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      All Categories
                    </Text>
                  </TouchableOpacity>

                  {/* Regular Categories */}
                  {categories?.map((category) => {
                    // Check if this category is currently selected
                    // Compare raw category names (case-insensitive) to handle variations
                    const isSelected =
                      currentCategoryName &&
                      category.name.toLowerCase() ===
                        currentCategoryName.toLowerCase();
                    // console.log("Rendering category:", category);
                    return (
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.categoryChip,
                          {
                            backgroundColor: getCategoryBackgroundColor(
                              category.name,
                            ),
                            borderColor: isSelected
                              ? category.color
                              : category.color + "40",
                            borderWidth: isSelected ? 3 : 2,
                          },
                          isSelected && styles.selectedCategoryChip,
                        ]}
                        onPress={() => handleCategorySelect(category.id)}
                        onLongPress={() => handleCategoryLongPress(category.id)}
                        activeOpacity={0.7}
                        disabled={loading}
                      >
                        <Text style={styles.chipIcon}>{category.icon}</Text>
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: isSelected ? category.color : "#000000",
                              fontWeight: isSelected ? "700" : "500",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {formatCategoryFromHook(category.name)}
                        </Text>
                        {/* Show checkmark for selected category */}
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={category.color}
                            style={styles.checkmarkIcon}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {/* Add New Category Button */}
                  <TouchableOpacity
                    style={styles.addNewChip}
                    onPress={handleAddNewCategory}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={styles.chipIcon}>➕</Text>
                    <Text style={styles.addNewChipText}>Add New</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {/* Custom Add Category Form Overlay */}
      <AddCategoryModal
        visible={showAddCategoryModal}
        onClose={() => setShowAddCategoryModal(false)}
        onCategoryAdded={async () => {
          await refreshCategories();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    height: "50%",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
    marginTop: 5,
    position: "relative",
  },
  categoriesLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  backButton: {
    position: "absolute",
    left: 12,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  categoryChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    minHeight: 100, // Debug: ensure container has height
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  selectedCategoryChip: {
    shadowColor: "#4A90E2",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  addNewChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderStyle: "dashed",
    marginBottom: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  chipIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    flexShrink: 1,
  },
  checkmarkIcon: {
    marginLeft: 4,
  },
  addNewChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    marginLeft: 2,
  },
  // Delete indicator styles
  deleteIndicator: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "rgba(255, 0, 0, 0.8)",
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteIndicatorText: {
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
  },
});
