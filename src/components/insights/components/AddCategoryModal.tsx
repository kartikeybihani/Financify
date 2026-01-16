import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { LinearGradient } from "expo-linear-gradient";

export const FAB_GRADIENT_COLORS = [
  "rgba(31, 31, 31, 0.98)",
  "rgba(18, 18, 18, 0.99)",
] as const;

export const FAB_BUTTON_GRADIENT_COLORS = [
  "rgba(18, 18, 18, 1)",
  "rgba(74, 144, 226, 1)",
] as const;

interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onCategoryAdded: () => Promise<void>;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Curated set of icons - all emojis
const CURATED_ICONS = [
  { type: "emoji", value: "💰", name: "Money" },
  { type: "emoji", value: "🛒", name: "Shopping" },
  { type: "emoji", value: "🍽️", name: "Food" },
  { type: "emoji", value: "🏠", name: "Home" },
  { type: "emoji", value: "🚗", name: "Car" },
  { type: "emoji", value: "🛍️", name: "Store" },
  { type: "emoji", value: "🎬", name: "Entertainment" },
  { type: "emoji", value: "📱", name: "Phone" },
  { type: "emoji", value: "💪", name: "Fitness" },
  { type: "emoji", value: "⚡", name: "Utilities" },
  { type: "emoji", value: "✈️", name: "Travel" },
  { type: "emoji", value: "📚", name: "Education" },
  { type: "emoji", value: "💎", name: "Savings" },
  { type: "emoji", value: "🏥", name: "Health" },
  { type: "emoji", value: "🎮", name: "Gaming" },
  { type: "emoji", value: "🎵", name: "Music" },
  { type: "emoji", value: "🎬", name: "Film" },
  { type: "emoji", value: "⚡", name: "Flash" },
  { type: "emoji", value: "✨", name: "Beauty" },
  { type: "emoji", value: "📚", name: "Book" },
  { type: "emoji", value: "💎", name: "Diamond" },
  { type: "emoji", value: "🏥", name: "Medical" },
  { type: "emoji", value: "🎨", name: "Art" },
  { type: "emoji", value: "🏋️", name: "Gym" },
  { type: "emoji", value: "🌿", name: "Nature" },
  { type: "emoji", value: "🍕", name: "Pizza" },
  { type: "emoji", value: "☕", name: "Cafe" },
  { type: "emoji", value: "🍔", name: "Fast Food" },
  { type: "emoji", value: "🍺", name: "Beer" },
  { type: "emoji", value: "🍷", name: "Wine" },
  { type: "emoji", value: "🚌", name: "Bus" },
  { type: "emoji", value: "🚂", name: "Train" },
];

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  visible,
  onClose,
  onCategoryAdded,
}) => {
  const [categoryName, setCategoryName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("💰");
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      // Reset form state after modal closes
      const timer = setTimeout(() => {
        setCategoryName("");
        setSelectedIcon("💰");
        setLoading(false);
      }, 300); // Wait for animation to complete
      return () => clearTimeout(timer);
    }
  }, [visible]);

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

      // Handle potential slug conflicts (only check within user's categories)
      let slug = baseSlug;
      let counter = 1;
      let slugExists = true;

      while (slugExists) {
        const { data: existingSlug } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", slug)
          .eq("user_id", user.id)
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

  const isIconSelected = (icon: { type: string; value: string }) => {
    return selectedIcon === icon.value;
  };

  const renderIcon = (icon: { type: string; value: string }, isRow = false) => {
    if (icon.type === "emoji") {
      return (
        <Text style={isRow ? styles.iconEmojiRow : styles.iconEmoji}>
          {icon.value}
        </Text>
      );
    } else {
      return (
        <Ionicons
          name={icon.value as keyof typeof Ionicons.glyphMap}
          size={isRow ? 16 : 18}
          color="#fff"
        />
      );
    }
  };

  const renderSelectedIcon = () => {
    const selected = CURATED_ICONS.find((icon) => icon.value === selectedIcon);
    if (selected) {
      return renderIcon(selected);
    }
    // Fallback for custom icons
    if (selectedIcon.match(/[\u{1F300}-\u{1F9FF}]/u)) {
      return <Text style={styles.iconEmoji}>{selectedIcon}</Text>;
    }
    return (
      <Ionicons
        name={selectedIcon as keyof typeof Ionicons.glyphMap}
        size={24}
        color="#fff"
      />
    );
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardAvoidingView}
              keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
            >
              <LinearGradient colors={FAB_GRADIENT_COLORS} style={styles.content}>
              <View style={styles.header}>
                <View style={styles.headerTextContainer}>
                  <Text style={styles.headerTitle}>Add New Category</Text>
                </View>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.scrollContent,
                  {
                    paddingBottom:
                      Math.max(20, SCREEN_HEIGHT * 0.025) +
                      Math.max(insets.bottom, 20),
                  },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                bounces={false}
                nestedScrollEnabled={true}
              >
                {/* Category Name Section */}
                <View style={styles.nameSection}>
                  <Text style={styles.sectionLabel}>CATEGORY NAME</Text>
                  <View style={styles.topRow}>
                    <TouchableOpacity
                      style={[
                        styles.iconBox,
                        isIconSelected({
                          type: "emoji",
                          value: selectedIcon,
                        }) ||
                        CURATED_ICONS.some(
                          (icon) => icon.value === selectedIcon
                        )
                          ? styles.iconBoxSelected
                          : null,
                      ]}
                      activeOpacity={0.7}
                      accessibilityLabel="Selected icon"
                      accessibilityRole="button"
                    >
                      {renderSelectedIcon()}
                    </TouchableOpacity>
                    <TextInput
                      style={styles.categoryInput}
                      value={categoryName}
                      onChangeText={setCategoryName}
                      placeholder="Enter category name"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      autoFocus
                      autoCapitalize="words"
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                      accessibilityLabel="Category name input"
                    />
                  </View>
                </View>

                {/* Icon Selection Section */}
                <View style={styles.iconSection}>
                  <Text style={styles.sectionLabel}>CHOOSE ICON</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.iconScroll}
                    contentContainerStyle={styles.iconScrollContent}
                    bounces={false}
                  >
                    {CURATED_ICONS.map((icon, index) => (
                      <TouchableOpacity
                        key={`${icon.type}-${icon.value}-${index}`}
                        style={[
                          styles.iconOption,
                          isIconSelected(icon) && styles.iconOptionSelected,
                        ]}
                        onPress={() => setSelectedIcon(icon.value)}
                        activeOpacity={0.7}
                        accessibilityLabel={`Select ${icon.name} icon`}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: isIconSelected(icon),
                        }}
                      >
                        {renderIcon(icon, true)}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </ScrollView>

              {/* Bottom action buttons */}
              <View style={styles.bottomButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.bottomButtonContainer,
                    styles.bottomCancelButtonContainer,
                  ]}
                  onPress={handleClose}
                  disabled={loading}
                  activeOpacity={0.7}
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={[
                      "rgba(142, 142, 147, 0.15)",
                      "rgba(142, 142, 147, 0.05)",
                    ]}
                    style={styles.bottomCancelButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="close-circle" size={16} color="#fff" />
                    <Text style={[styles.bottomButtonText, { color: "#fff" }]}>
                      Cancel
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.bottomButtonContainer,
                    styles.bottomSaveButtonContainer,
                    (!categoryName.trim() || loading) && styles.buttonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={!categoryName.trim() || loading}
                  activeOpacity={0.7}
                  accessibilityLabel={
                    loading ? "Adding category" : "Add category"
                  }
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !categoryName.trim() || loading,
                  }}
                >
                  <LinearGradient
                    colors={[
                      "rgba(74, 144, 226, 0.15)",
                      "rgba(74, 145, 226, 0.41)",
                    ]}
                    style={styles.bottomSaveButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={[styles.bottomButtonText, { color: "#fff" }]}>
                      {loading ? "Adding..." : "Add Category"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  keyboardAvoidingView: {
    width: "100%",
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: SCREEN_HEIGHT * 0.5,
    maxHeight: SCREEN_HEIGHT * 0.85,
    width: SCREEN_WIDTH,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTextContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: Math.max(18, SCREEN_WIDTH * 0.05),
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    paddingVertical: 7,
  },
  scrollContent: {
    padding: Math.max(20, SCREEN_WIDTH * 0.05),
  },
  nameSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
  },
  iconBoxSelected: {
    borderColor: "#4A90E2",
    backgroundColor: "rgba(74, 144, 226, 0.15)",
  },
  iconEmoji: {
    fontSize: 28,
  },
  iconEmojiRow: {
    fontSize: 20,
  },
  categoryInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: "#fff",
    fontSize: 16,
    minHeight: 56,
    fontWeight: "500",
  },
  iconSection: {
    marginBottom: 8,
  },
  iconScroll: {
    marginHorizontal: -Math.max(20, SCREEN_WIDTH * 0.05),
    paddingHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
  },
  iconScrollContent: {
    gap: 12,
    paddingRight: Math.max(20, SCREEN_WIDTH * 0.05),
    paddingTop: 5,
    paddingBottom: 5,
  },
  iconOption: {
    width: 50,
    height: 50,
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
    transform: [{ scale: 1.05 }],
  },
  bottomButtonRow: {
    flexDirection: "row",
    marginHorizontal: Math.max(20, SCREEN_WIDTH * 0.05),
    marginBottom: Math.max(20, SCREEN_HEIGHT * 0.025),
    marginTop: 5,
    gap: 12,
  },
  bottomButtonContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  bottomCancelButtonContainer: {
    flex: 0.4,
  },
  bottomSaveButtonContainer: {
    flex: 0.6,
  },
  bottomCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(142, 142, 147, 0.3)",
    gap: 8,
  },
  bottomSaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    gap: 8,
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default AddCategoryModal;
