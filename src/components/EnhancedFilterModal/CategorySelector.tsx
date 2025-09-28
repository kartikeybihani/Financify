import * as React from "react";
import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Category, FilterOptions } from "./types";
import { styles } from "./styles";
import {
  getSelectedCategoriesDescription,
  toggleCategorySelection,
} from "./utils";

interface CategorySelectorProps {
  categories: Category[];
  localFilters: FilterOptions;
  setLocalFilters: React.Dispatch<React.SetStateAction<FilterOptions>>;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  localFilters,
  setLocalFilters,
}) => {
  const [showModal, setShowModal] = useState(false);

  const handleToggleCategorySelection = (categoryId: string) => {
    setLocalFilters((prev) => toggleCategorySelection(categoryId, prev));
  };

  const selectAllCategories = () => {
    setLocalFilters((prev) => ({ ...prev, categoryIds: [] }));
  };

  return (
    <>
      <TouchableOpacity
        style={styles.verticalSelector}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.verticalSelectedContent}>
          <Text style={styles.verticalSelectorEmoji}>
            {(localFilters.categoryIds || []).length === 0 ? "🏷️" : "📊"}
          </Text>
          <View style={styles.verticalTextContainer}>
            <Text style={styles.verticalSelectedLabel}>All categories</Text>
            <Text style={styles.verticalSelectedDescription}>
              {(localFilters.categoryIds || []).length === 0
                ? "Spending categories"
                : (localFilters.categoryIds || []).length === 1
                ? "Single category selected"
                : `${
                    (localFilters.categoryIds || []).length
                  } categories selected`}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Category Selection Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
        statusBarTranslucent={true}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.8)"] as const}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.modalGradientOverlay}
          />

          <TouchableOpacity
            style={[styles.modalContainer, styles.categoryModalContainer]}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Close Icon */}
            <TouchableOpacity
              onPress={() => setShowModal(false)}
              style={[
                styles.closeButton,
                {
                  position: "absolute",
                  top: 16,
                  right: 16,
                  zIndex: 10,
                },
              ]}
            >
              <View style={styles.closeButtonContainer}>
                <Ionicons
                  name="close"
                  size={18}
                  color="rgba(255,255,255,0.8)"
                />
              </View>
            </TouchableOpacity>
            <View style={{ height: 45 }} />
            {/* Modal Content */}
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.modalScrollContent,
                { flexGrow: 1 },
              ]}
              bounces={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Adaptive Category Grid */}
              <View style={styles.adaptiveCategoryGrid}>
                {/* All Categories as first item */}
                <TouchableOpacity
                  style={[
                    styles.adaptiveCategoryBox,
                    (localFilters.categoryIds || []).length === 0 &&
                      styles.categoryBoxSelected,
                    {
                      backgroundColor: "#e8f4fd", // Light blue background
                      borderWidth:
                        (localFilters.categoryIds || []).length === 0 ? 2 : 1,
                      borderColor:
                        (localFilters.categoryIds || []).length === 0
                          ? "#4A90E2"
                          : "rgba(74,144,226,0.3)",
                    },
                  ]}
                  onPress={selectAllCategories}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryEmoji}>🏷️</Text>
                  <Text
                    style={[
                      styles.adaptiveCategoryText,
                      {
                        color:
                          (localFilters.categoryIds || []).length === 0
                            ? "#4A90E2"
                            : "#333",
                        fontWeight:
                          (localFilters.categoryIds || []).length === 0
                            ? "700"
                            : "600",
                      },
                    ]}
                  >
                    All Categories
                  </Text>
                  {(localFilters.categoryIds || []).length === 0 && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#4A90E2"
                      style={styles.categoryCheckmark}
                    />
                  )}
                </TouchableOpacity>

                {/* Regular Categories */}
                {categories.map((category) => {
                  const isSelected = (localFilters.categoryIds || []).includes(
                    category.id
                  );

                  // Get predefined light background color for categories
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

                      // Default fallback
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
                    if (
                      name.includes("entertainment") ||
                      name.includes("recreation")
                    ) {
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
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.adaptiveCategoryBox,
                        isSelected && styles.categoryBoxSelected,
                        {
                          backgroundColor: getCategoryBackgroundColor(
                            category.name
                          ),

                          borderColor: isSelected
                            ? category.color
                            : category.color + "40",
                        },
                      ]}
                      onPress={() => handleToggleCategorySelection(category.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.categoryEmoji}>{category.icon}</Text>
                      <Text
                        style={[
                          styles.adaptiveCategoryText,
                          {
                            color: isSelected ? category.color : "#333",
                            fontWeight: isSelected ? "700" : "600",
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {category.name}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={category.color}
                          style={styles.categoryCheckmark}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {/* Add New Category Button - Part of the grid */}
                <TouchableOpacity
                  style={styles.adaptiveAddNewBox}
                  onPress={() => {
                    // Future: Add new category functionality
                    console.log("Add new category pressed");
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryEmoji}>➕</Text>
                  <Text style={styles.adaptiveAddNewText}>Add New</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};
