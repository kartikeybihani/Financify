import React, { useState, useEffect, useRef } from "react";
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconButton from "@/src/components/shared/IconButton";
import * as Haptics from "expo-haptics";
import { useCategories } from "@/src/hooks/useCategories";
import { supabase } from "@/src/lib/supabase/supabase";
import { DeviceEventEmitter } from "react-native";
import { TEXT_STYLES } from "../shared/modal-constants";

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
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("📦");
  const [addCategoryLoading, setAddCategoryLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Refs for text inputs
  const nameInputRef = useRef<TextInput>(null);
  const iconInputRef = useRef<TextInput>(null);

  // Get current user ID
  useEffect(() => {
    const getUser = async () => {
      const { data: userData } = await supabase.auth.getUser();
      setCurrentUserId(userData.user?.id || null);
    };
    getUser();
  }, []);

  // Reset modal state when it becomes visible
  useEffect(() => {
    if (visible) {
      // Reset form state
      setNewCategoryName("");
      setNewCategoryIcon("📦");
      setAddCategoryLoading(false);
      setShowAddForm(false);
    }
  }, [visible]);

  const {
    categories,
    getCategoryIcon,
    getCategoryColor,
    formatCategoryName: formatCategoryFromHook,
    refreshCategories,
  } = useCategories(currentUserId || undefined);

  // Responsive layout flags
  const isLandscape = width > height;
  const isSmallPhone = height < 700;
  const isTallPhone = height >= 840;

  const handleClose = () => {
    // Reset form state when closing
    setNewCategoryName("");
    setNewCategoryIcon("📦");
    setAddCategoryLoading(false);
    setShowAddForm(false);
    onClose();
  };

  const handleAddNewCategory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddForm(true);

    // Focus on name input after a short delay
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 100);
  };

  const handleCancelAddForm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Dismiss keyboard first
    Keyboard.dismiss();
    setShowAddForm(false);
    setNewCategoryName("");
    setNewCategoryIcon("📦");
  };

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert("Error", "Please enter a category name");
      return;
    }

    if (newCategoryName.length > 25) {
      Alert.alert("Error", "Category name must be 25 characters or less");
      return;
    }

    setAddCategoryLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw new Error("User not authenticated");
      }

      // Create slug from name
      let baseSlug = newCategoryName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .trim();

      // Handle potential slug conflicts by adding a number suffix
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

      // Get the next rank (highest rank + 1)
      const { data: maxRankData } = await supabase
        .from("categories")
        .select("rank")
        .eq("user_id", userData.user.id)
        .order("rank", { ascending: false })
        .limit(1);

      const nextRank = maxRankData?.[0]?.rank ? maxRankData[0].rank + 1 : 1;

      // Generate UUID for the new category (React Native compatible)
      const categoryId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c == "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        }
      );

      const { data, error } = await supabase
        .from("categories")
        .insert({
          id: categoryId,
          user_id: userData.user.id,
          name: newCategoryName.trim(),
          slug: slug,
          icon: newCategoryIcon,
          color: "#4A90E2", // Default blue color
          rank: nextRank,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh categories to show the new category
      await refreshCategories();

      // Reset form data and hide form
      setNewCategoryName("");
      setNewCategoryIcon("📦");
      setShowAddForm(false);

      Alert.alert(
        "Success",
        `Category "${newCategoryName}" added successfully!`
      );
    } catch (error) {
      console.error("Error adding category:", error);
      Alert.alert("Error", "Failed to add category. Please try again.");
    } finally {
      setAddCategoryLoading(false);
    }
  };

  const handleCategoryLongPress = (categoryId: string) => {
    if (categoryId === "all") return; // Don't allow deleting "All Categories"

    const category = categories.find((cat) => cat.id === categoryId);
    if (!category) return;

    // Only allow deleting user-created categories (not default ones)
    if (!category.user_id) {
      Alert.alert(
        "Cannot Delete",
        "Default categories cannot be deleted. You can only delete categories you've created.",
        [{ text: "OK", style: "default" }]
      );
      return;
    }

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
      ]
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
      ]
    );
  };

  const handleUpdateOption = async (
    updateType: "single" | "similar",
    categoryId: string
  ) => {
    if (!transactionId) return;

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
        // Single transaction: Update new_category column
        const { error } = await supabase.rpc(
          "update_transaction_category_by_name",
          {
            p_transaction_id: transactionId,
            p_new_category: selectedCategory.name,
          }
        );

        if (error) throw error;

        // For single transaction, we only have one affected transaction
        affectedTransactions = [
          {
            transactionId: transactionId,
            transactionName: "Transaction", // We'll get this from the UI state
            amount: 0, // We'll get this from the UI state
            date: new Date().toISOString(),
          },
        ];

        Alert.alert("Success", `Category updated to ${selectedCategory.name}`);
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
            "Cannot update similar transactions without merchant name or transaction name"
          );
          return;
        }

        // Build the query based on which field we're using
        let updateQuery = supabase
          .from("transactions")
          .update({ new_category: selectedCategory.name })
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

        if (error) throw error;

        const data = updateResult?.length || 0;

        // Get the affected transaction IDs and details
        const matchField = useMerchantName ? "merchant_name" : "name";
        const matchValue = useMerchantName
          ? merchantName || ""
          : transactionName || "";

        console.log("🔍 Getting affected transactions for:", {
          matchField,
          matchValue,
          newCategory: selectedCategory.name,
          updatedCount: data,
        });

        const { data: affectedData, error: affectedError } =
          await selectQuery.eq("new_category", selectedCategory.name);

        console.log("📊 Affected transactions result:", {
          affectedData,
          affectedError,
          count: affectedData?.length || 0,
        });

        if (!affectedError && affectedData) {
          affectedTransactions = affectedData.map((tx: any) => ({
            transactionId: tx.id,
            transactionName: tx.name,
            amount: tx.amount,
            date: tx.date,
          }));

          console.log("✅ Mapped affected transactions:", affectedTransactions);
        } else {
          console.log("❌ No affected transactions found or error occurred");
        }

        Alert.alert(
          "Success",
          `Updated ${data} similar transactions to ${selectedCategory.name}`
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
            }
          );

          if (ruleError) {
            console.error("Error creating category rule:", ruleError);
            // Don't fail the whole operation if rule creation fails
          } else {
            console.log("✅ Category rule created/updated successfully");
          }
        } catch (ruleErr) {
          console.error("Exception creating category rule:", ruleErr);
          // Don't fail the whole operation
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

      console.log("📡 Emitting transactionCategoryUpdated event:", eventData);
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
                              category.name
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
                        {/* Show delete indicator for user-created categories */}
                        {category.user_id && (
                          <View style={styles.deleteIndicator}>
                            <Text style={styles.deleteIndicatorText}>⋯</Text>
                          </View>
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
      {showAddForm && (
        <Modal
          visible={showAddForm}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCancelAddForm}
          statusBarTranslucent={true}
          presentationStyle="overFullScreen"
        >
          <KeyboardAvoidingView
            style={styles.formOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.formBackdrop} />

            <View style={styles.formContainer}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Add New Category</Text>
                <IconButton
                  icon="close"
                  onPress={handleCancelAddForm}
                  size={16}
                  style={TEXT_STYLES.closeButton}
                />
              </View>

              <View style={styles.formContent}>
                <View style={styles.inputRow}>
                  <View style={styles.iconInputContainer}>
                    <Text style={styles.inputLabel}>Icon</Text>
                    <TextInput
                      ref={iconInputRef}
                      style={styles.iconInput}
                      value={newCategoryIcon}
                      onChangeText={setNewCategoryIcon}
                      maxLength={2}
                      placeholder="📦"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      returnKeyType="next"
                      onSubmitEditing={() => {
                        nameInputRef.current?.focus();
                      }}
                    />
                  </View>

                  <View style={styles.nameInputContainer}>
                    <Text style={styles.inputLabel}>Category Name</Text>
                    <TextInput
                      ref={nameInputRef}
                      style={styles.nameInput}
                      value={newCategoryName}
                      onChangeText={setNewCategoryName}
                      maxLength={25}
                      placeholder="Enter category name"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (newCategoryName.trim()) {
                          handleSaveCategory();
                        }
                      }}
                    />
                    <Text style={styles.characterCount}>
                      {newCategoryName.length}/25
                    </Text>
                  </View>
                </View>
                <Text style={styles.iconHint}>
                  Tap icon field to use your phone's emoji keyboard
                </Text>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelFormButton}
                  onPress={handleCancelAddForm}
                  activeOpacity={0.7}
                  disabled={addCategoryLoading}
                >
                  <Text style={styles.cancelFormButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveFormButton,
                    (!newCategoryName.trim() || addCategoryLoading) &&
                      styles.saveFormButtonDisabled,
                  ]}
                  onPress={handleSaveCategory}
                  activeOpacity={0.7}
                  disabled={!newCategoryName.trim() || addCategoryLoading}
                >
                  {addCategoryLoading ? (
                    <Text style={styles.saveFormButtonText}>Saving...</Text>
                  ) : (
                    <Text style={styles.saveFormButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
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
  // Custom Form Styles
  formOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  formBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  formContainer: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    marginHorizontal: 20,
    maxWidth: 400,
    width: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
  },
  formContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  iconInputContainer: {
    flex: 0.3,
  },
  nameInputContainer: {
    flex: 0.7,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  iconInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    color: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    textAlign: "center",
  },
  characterCount: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "right",
    marginTop: 4,
  },
  iconHint: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  formActions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  cancelFormButton: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  cancelFormButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
  },
  saveFormButton: {
    flex: 1,
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveFormButtonDisabled: {
    backgroundColor: "rgba(74, 144, 226, 0.3)",
  },
  saveFormButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
