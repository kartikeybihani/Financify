import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { Category } from "./types";
import { styles } from "./styles";

interface CategorySelectorSheetProps {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  selectedCategoryIds?: string[];
  onCategorySelect?: (categoryIds: string[]) => void;
  onAddCategory?: (category: {
    name: string;
    emoji: string;
    color: string;
  }) => void;
}

// Random colors for new categories
const CATEGORY_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEEAD",
  "#D4A5A5",
  "#9B786F",
  "#8E44AD",
  "#27AE60",
  "#E67E22",
  "#F39C12",
  "#E74C3C",
  "#9B59B6",
  "#3498DB",
  "#1ABC9C",
  "#34495E",
  "#F1C40F",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
];

export const CategorySelectorSheet: React.FC<CategorySelectorSheetProps> = ({
  visible,
  onClose,
  categories,
  selectedCategoryIds = [],
  onCategorySelect,
  onAddCategory,
}) => {
  const [localSelectedIds, setLocalSelectedIds] =
    useState<string[]>(selectedCategoryIds);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("");

  const slideAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const addFormAnim = React.useRef(new Animated.Value(0)).current;
  const gridOpacityAnim = React.useRef(new Animated.Value(1)).current;
  const gridScaleAnim = React.useRef(new Animated.Value(1)).current;

  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();

  // Responsive layout flags (same as TransactionDetailModal)
  const isLandscape = width > height;
  const isSmallPhone = height < 700;
  const isTallPhone = height >= 840;

  // Compute modal height (same logic as TransactionDetailModal)
  const { maxModalHeight, compact } = useMemo(() => {
    const safeCap =
      height - Math.max(insets.top, 8) - Math.max(insets.bottom, 8);

    let baseRatio = 0.7; // default
    if (isSmallPhone) baseRatio = 0.6;
    if (isTallPhone) baseRatio = 0.78;
    if (isLandscape) baseRatio = 0.86;

    const maxH = Math.min(safeCap, height * baseRatio);
    const useCompact = isSmallPhone || isLandscape;

    return { maxModalHeight: maxH, compact: useCompact };
  }, [
    height,
    insets.top,
    insets.bottom,
    isSmallPhone,
    isTallPhone,
    isLandscape,
  ]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      setShowAddForm(false);
      setNewCategoryName("");
      setNewCategoryEmoji("");
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(addFormAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (showAddForm) {
      // Hide grid with scale and fade out
      Animated.parallel([
        Animated.timing(gridOpacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(gridScaleAnim, {
          toValue: 0.95,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Show add form with subtle pop animation
        Animated.spring(addFormAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }).start();
      });
    } else {
      // Hide add form quickly
      Animated.timing(addFormAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Show grid with scale and fade in
        Animated.parallel([
          Animated.timing(gridOpacityAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(gridScaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  }, [showAddForm]);

  const handleToggleCategorySelection = (categoryId: string) => {
    // Add haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newIds = localSelectedIds.includes(categoryId)
      ? localSelectedIds.filter((id) => id !== categoryId)
      : [...localSelectedIds, categoryId];

    setLocalSelectedIds(newIds);
    onCategorySelect?.(newIds);
  };

  const selectAllCategories = () => {
    // Add haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setLocalSelectedIds([]);
    onCategorySelect?.([]);
  };

  const handleClose = () => {
    setLocalSelectedIds(selectedCategoryIds); // Reset to original state
    setShowAddForm(false);
    setNewCategoryName("");
    setNewCategoryEmoji("");
    onClose();
  };

  const handleAddNewPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowAddForm(true);
  };

  const handleSaveNewCategory = () => {
    if (newCategoryName.trim() && newCategoryEmoji.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Console log the new category data
      console.log("New category created:", {
        name: newCategoryName.trim(),
        emoji: newCategoryEmoji.trim(),
        timestamp: new Date().toISOString(),
      });

      const randomColor =
        CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];

      onAddCategory?.({
        name: newCategoryName.trim(),
        emoji: newCategoryEmoji.trim(),
        color: randomColor,
      });

      setShowAddForm(false);
      setNewCategoryName("");
      setNewCategoryEmoji("");
    }
  };

  const handleCancelAddCategory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddForm(false);
    setNewCategoryName("");
    setNewCategoryEmoji("");
  };

  // Convert Ionicon to emoji for better visual appeal
  const getEmojiForCategory = (icon: string, name: string) => {
    const emojiMap: { [key: string]: string } = {
      restaurant: "🍔",
      storefront: "🛒",
      car: "🚗",
      "game-controller": "🎬",
      airplane: "✈️",
      fitness: "🏋️",
      construct: "🏠",
      card: "💳",
      briefcase: "💼",
      "trending-up": "📈",
      apps: "📱",
    };
    return emojiMap[icon] || "📊";
  };

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
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          zIndex: 1000,
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={1}
        onPress={handleClose}
      />

      <Animated.View
        style={[
          {
            position: "absolute",
            bottom: 0,
            right: 0,
            width: "100%",
            maxHeight: maxModalHeight,
            backgroundColor: "#1a1a1a",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
            elevation: 20,
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.15)",
            overflow: "hidden",
            paddingBottom: Math.max(insets.bottom, compact ? 8 : 12),
            transform: [
              {
                translateX: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width, 0],
                }),
              },
            ],
          },
        ]}
      >
        {/* Glass effect back button in top left */}
        <View
          style={{
            position: "absolute",
            top: compact ? 16 : 20,
            left: compact ? 16 : 20,
            zIndex: 10,
          }}
        >
          <TouchableOpacity
            onPress={handleClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(20px)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color="rgba(255,255,255,0.9)"
            />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: compact ? 16 : 20,
            paddingBottom: compact ? 16 : 24,
            paddingTop: compact ? 50 : 60, // Add top padding to account for floating back button
          }}
          bounces={true}
          keyboardShouldPersistTaps="handled"
        >
          {/* Add New Category Form */}
          {showAddForm && (
            <Animated.View
              style={[
                {
                  // backgroundColor: "rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 20,
                  // borderWidth: 1,
                  // borderColor: "rgba(255,255,255,0.15)",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.3,
                  shadowRadius: 16,
                  elevation: 12,
                  transform: [
                    {
                      translateY: addFormAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [30, 0],
                      }),
                    },
                    {
                      scale: addFormAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1],
                      }),
                    },
                  ],
                  opacity: addFormAnim,
                },
              ]}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: compact ? 14 : 16,
                  fontWeight: "600",
                  marginBottom: compact ? 8 : 12,
                  textAlign: "center",
                }}
              >
                Add New Category
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  gap: compact ? 8 : 12,
                  marginBottom: compact ? 8 : 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontSize: compact ? 10 : 12,
                      marginBottom: compact ? 4 : 6,
                      fontWeight: "500",
                    }}
                  >
                    Emoji
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: "rgba(255,255,255,0.1)",
                      borderRadius: compact ? 10 : 12,
                      padding: compact ? 10 : 12,
                      color: "#fff",
                      fontSize: compact ? 18 : 20,
                      textAlign: "center",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.2)",
                    }}
                    value={newCategoryEmoji}
                    onChangeText={setNewCategoryEmoji}
                    placeholder="😊"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    maxLength={2}
                  />
                </View>

                <View style={{ flex: 2 }}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontSize: compact ? 10 : 12,
                      marginBottom: compact ? 4 : 6,
                      fontWeight: "500",
                    }}
                  >
                    Category Name
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: "rgba(255,255,255,0.1)",
                      borderRadius: compact ? 10 : 12,
                      padding: compact ? 10 : 12,
                      color: "#fff",
                      fontSize: compact ? 14 : 16,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.2)",
                    }}
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    placeholder="Category name"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    maxLength={20}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: compact ? 6 : 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    borderRadius: compact ? 10 : 12,
                    padding: compact ? 10 : 12,
                    alignItems: "center",
                  }}
                  onPress={handleCancelAddCategory}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: "600",
                      fontSize: compact ? 13 : 14,
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: "#4A90E2",
                    borderRadius: compact ? 10 : 12,
                    padding: compact ? 10 : 12,
                    alignItems: "center",
                    opacity:
                      newCategoryName.trim() && newCategoryEmoji.trim()
                        ? 1
                        : 0.5,
                  }}
                  onPress={handleSaveNewCategory}
                  activeOpacity={0.7}
                  disabled={
                    !(newCategoryName.trim() && newCategoryEmoji.trim())
                  }
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "600",
                      fontSize: compact ? 13 : 14,
                    }}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* Adaptive Category Grid */}
          {!showAddForm && (
            <Animated.View
              style={[
                styles.adaptiveCategoryGrid,
                {
                  opacity: gridOpacityAnim,
                  transform: [{ scale: gridScaleAnim }],
                },
              ]}
            >
              {/* All Categories as first item */}
              <TouchableOpacity
                style={[
                  styles.adaptiveCategoryBox,
                  localSelectedIds.length === 0 && styles.categoryBoxSelected,
                  {
                    backgroundColor: "#e8f4fd", // Light blue background
                    borderWidth: localSelectedIds.length === 0 ? 2 : 1,
                    borderColor:
                      localSelectedIds.length === 0
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
                      color: localSelectedIds.length === 0 ? "#4A90E2" : "#333",
                      fontWeight: localSelectedIds.length === 0 ? "700" : "600",
                    },
                  ]}
                >
                  All Categories
                </Text>
                {localSelectedIds.length === 0 && (
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
                const isSelected = localSelectedIds.includes(category.id);

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
                    <Text style={styles.categoryEmoji}>
                      {getEmojiForCategory(category.icon, category.name)}
                    </Text>
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
                onPress={handleAddNewPress}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryEmoji}>➕</Text>
                <Text style={styles.adaptiveAddNewText}>Add New</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
};
