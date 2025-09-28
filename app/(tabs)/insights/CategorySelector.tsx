import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Alert,
  StyleSheet,
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

  const {
    categories,
    getCategoryIcon,
    getCategoryColor,
    formatCategoryName: formatCategoryFromHook,
  } = useCategories();

  // Responsive layout flags
  const isLandscape = width > height;
  const isSmallPhone = height < 700;
  const isTallPhone = height >= 840;

  const handleClose = () => {
    router.back();
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
        const { data, error } = await supabase.rpc(
          "update_similar_transactions_by_name",
          {
            p_merchant_name: Array.isArray(params.merchantName)
              ? params.merchantName[0]
              : params.merchantName,
            p_new_category: selectedCategory.name,
            p_user_id: (await supabase.auth.getUser()).data.user?.id,
          }
        );

        if (error) throw error;

        // Get the affected transaction IDs and details
        const merchantName = Array.isArray(params.merchantName)
          ? params.merchantName[0]
          : params.merchantName;

        console.log("🔍 Getting affected transactions for:", {
          merchantName,
          newCategory: selectedCategory.name,
          updatedCount: data,
        });

        const { data: affectedData, error: affectedError } = await supabase.rpc(
          "get_affected_transaction_ids",
          {
            p_user_id: (await supabase.auth.getUser()).data.user?.id,
            p_merchant_name: merchantName,
            p_new_category: selectedCategory.name,
          }
        );

        console.log("📊 Affected transactions result:", {
          affectedData,
          affectedError,
          count: affectedData?.length || 0,
        });

        if (!affectedError && affectedData) {
          affectedTransactions = affectedData.map((tx: any) => ({
            transactionId: tx.transaction_id,
            transactionName: tx.transaction_name,
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
      <View style={styles.container}>
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
                </TouchableOpacity>
              );
            })}

            {/* Add New Category Button */}
            <TouchableOpacity
              style={styles.addNewChip}
              onPress={() => {
                console.log("Add new category pressed");
              }}
              activeOpacity={0.7}
              disabled={loading}
            >
              <Text style={styles.chipIcon}>➕</Text>
              <Text style={styles.addNewChipText}>Add New</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
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
    height: "40%",
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
    // backgroundColor: "rgba(255, 0, 0, 0.1)", // Debug: red background to see container
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
});
