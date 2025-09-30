import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Alert,
  StyleSheet,
  TextInput,
  Animated,
  Keyboard,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCategories } from "../../_hooks/useCategories";
import { supabase } from "../../_lib/supabase/supabase";
import { DeviceEventEmitter } from "react-native";

export default function CategorySelectorScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("📦");
  const [addCategoryLoading, setAddCategoryLoading] = useState(false);
  const [slideAnim] = useState(new Animated.Value(0));
  const [heightAnim] = useState(new Animated.Value(0));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Refs for text inputs
  const categoryNameInputRef = useRef<TextInput>(null);
  const categoryIconInputRef = useRef<TextInput>(null);

  // Get current user ID
  useEffect(() => {
    const getUser = async () => {
      const { data: userData } = await supabase.auth.getUser();
      setCurrentUserId(userData.user?.id || null);
    };
    getUser();
  }, []);

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
    router.back();
  };

  const handleAddNewCategory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddCategory(true);

    // Animate both slide and height
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false, // Height animation needs layout
      }),
      Animated.timing(heightAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Focus on category name input after animation completes
      setTimeout(() => {
        categoryNameInputRef.current?.focus();
      }, 100);
    });
  };

  const handleCancelAddCategory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Reset form data
    setNewCategoryName("");
    setNewCategoryIcon("📦");
    setAddCategoryLoading(false);

    // Dismiss keyboard first
    Keyboard.dismiss();

    // Animate both slide and height back to original state
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(heightAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Hide the form after animation completes
      setShowAddCategory(false);
    });
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

      // Dismiss keyboard first
      Keyboard.dismiss();

      // Animate both slide and height back to original state
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start(() => {
        // Reset form and hide after animation completes
        setNewCategoryName("");
        setNewCategoryIcon("📦");
        setShowAddCategory(false);
      });

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
    if (!params.transactionId) return;

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
    if (!params.transactionId) return;

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
            p_transaction_id: Array.isArray(params.transactionId)
              ? params.transactionId[0]
              : params.transactionId,
            p_new_category: selectedCategory.name,
          }
        );

        if (error) throw error;

        // For single transaction, we only have one affected transaction
        affectedTransactions = [
          {
            transactionId: Array.isArray(params.transactionId)
              ? params.transactionId[0]
              : params.transactionId,
            transactionName: Array.isArray(params.transactionName)
              ? params.transactionName[0]
              : params.transactionName || "Transaction",
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

        // Update all transactions with the same merchant name
        const merchantName = Array.isArray(params.merchantName)
          ? params.merchantName[0]
          : params.merchantName;

        const { data: updateResult, error } = await supabase
          .from("transactions")
          .update({ new_category: selectedCategory.name })
          .eq("user_id", userId)
          .eq("merchant_name", merchantName)
          .select("id");

        if (error) throw error;

        const data = updateResult?.length || 0;

        // Get the affected transaction IDs and details
        console.log("🔍 Getting affected transactions for:", {
          merchantName,
          newCategory: selectedCategory.name,
          updatedCount: data,
        });

        const { data: affectedData, error: affectedError } = await supabase
          .from("transactions")
          .select("id, name, amount, date")
          .eq("user_id", userId)
          .eq("merchant_name", merchantName)
          .eq("new_category", selectedCategory.name);

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
      }

      // Emit enhanced global event with affected transaction data
      const eventData = {
        transactionId: Array.isArray(params.transactionId)
          ? params.transactionId[0]
          : params.transactionId,
        newCategory: selectedCategory.name,
        updateType,
        affectedTransactions,
        merchantName: Array.isArray(params.merchantName)
          ? params.merchantName[0]
          : params.merchantName,
      };

      console.log("📡 Emitting transactionCategoryUpdated event:", eventData);
      DeviceEventEmitter.emit("transactionCategoryUpdated", eventData);

      // Go back to transaction detail
      router.back();
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

  return (
    <View style={styles.overlay}>
      {/* Very subtle blur overlay */}
      <BlurView intensity={10} tint="dark" style={styles.blurOverlay} />
      <TouchableOpacity
        style={styles.overlayTouchable}
        activeOpacity={1}
        onPress={handleClose}
      />
      <Animated.View
        style={[
          styles.container,
          {
            height: heightAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ["40%", "70%"], // Expand from 40% to 70% of screen height
            }),
          },
        ]}
      >
        {/* Header with back button */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <BlurView intensity={20} tint="light" style={styles.backButtonBlur}>
              <Ionicons name="chevron-back" size={24} color="#ffffff" />
            </BlurView>
          </TouchableOpacity>
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
                    fontWeight: "600",
                  },
                ]}
                numberOfLines={1}
              >
                All Categories
              </Text>
            </TouchableOpacity>

            {/* Regular Categories */}
            {categories?.map((category) => {
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
                      borderColor: category.color + "40",
                    },
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
                        color: "#000000",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {formatCategoryFromHook(category.name)}
                  </Text>
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
              disabled={loading || showAddCategory}
            >
              <Text style={styles.chipIcon}>➕</Text>
              <Text style={styles.addNewChipText}>Add New</Text>
            </TouchableOpacity>
          </View>

          {/* Add Category Input Form */}
          {showAddCategory && (
            <Animated.View
              style={[
                styles.addCategoryForm,
                {
                  transform: [
                    {
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [100, 0],
                      }),
                    },
                  ],
                  opacity: slideAnim,
                },
              ]}
            >
              <View style={styles.addCategoryContainer}>
                <Text style={styles.addCategoryTitle}>Add New Category</Text>

                <View style={styles.addCategoryInputContainer}>
                  {/* Emoji Input */}
                  <View style={styles.emojiInputContainer}>
                    <Text style={styles.emojiLabel}>Icon</Text>
                    <TextInput
                      ref={categoryIconInputRef}
                      style={styles.emojiInput}
                      value={newCategoryIcon}
                      onChangeText={setNewCategoryIcon}
                      maxLength={2}
                      placeholder="📦"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      returnKeyType="next"
                      onSubmitEditing={() => {
                        categoryNameInputRef.current?.focus();
                      }}
                    />
                  </View>

                  {/* Category Name Input */}
                  <View style={styles.nameInputContainer}>
                    <Text style={styles.nameLabel}>Name</Text>
                    <TextInput
                      ref={categoryNameInputRef}
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

                {/* Action Buttons */}
                <View style={styles.addCategoryButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancelAddCategory}
                    activeOpacity={0.7}
                    disabled={addCategoryLoading}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      (!newCategoryName.trim() || addCategoryLoading) &&
                        styles.saveButtonDisabled,
                    ]}
                    onPress={handleSaveCategory}
                    activeOpacity={0.7}
                    disabled={!newCategoryName.trim() || addCategoryLoading}
                  >
                    {addCategoryLoading ? (
                      <Text style={styles.saveButtonText}>Saving...</Text>
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  blurOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlayTouchable: {
    flex: 1,
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
  },
  header: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    borderRadius: 20,
    overflow: "hidden",
  },
  backButtonBlur: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
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
    borderWidth: 2, // Debug: thicker border
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)", // Debug: white background
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
  addNewChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    marginLeft: 2,
  },
  // Add Category Form Styles
  addCategoryForm: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  addCategoryContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  addCategoryTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 20,
  },
  addCategoryInputContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  emojiInputContainer: {
    flex: 0.3,
  },
  emojiLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    marginBottom: 8,
  },
  emojiInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 20,
    color: "#ffffff",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  nameInputContainer: {
    flex: 0.7,
  },
  nameLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  characterCount: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "right",
    marginTop: 4,
  },
  addCategoryButtons: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#4A90E2",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "rgba(74, 144, 226, 0.3)",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
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
