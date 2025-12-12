import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  TextInput,
  Easing,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { LinearGradient } from "expo-linear-gradient";

interface AddCategoryModalProps {
  visible: boolean;
  onClose: () => void;
  onCategoryAdded: () => Promise<void>;
}

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
  { type: "emoji", value: "💪", name: "Fitness" },
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
  const screenHeight = Dimensions.get("window").height;
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const [rendered, setRendered] = useState(visible);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setRendered(true);
      slideAnim.setValue(screenHeight);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else if (rendered) {
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 100,
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
          size={isRow ? 20 : 24}
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

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.sheetOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <Animated.View
                style={[
                  styles.sheetContainer,
                  {
                    transform: [{ translateY: slideAnim }],
                    maxHeight: screenHeight * 0.85,
                    minHeight: Math.min(screenHeight * 0.5, 500),
                    paddingBottom: Math.max(insets.bottom, 20),
                  },
                ]}
              >
                <View style={styles.sheetHandle} />
                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                >
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle}>Add New Category</Text>
                  </View>

                  {/* Top Row: Icon Box + Category Name Input */}
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
                      placeholder="Category name"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      autoFocus
                      autoCapitalize="words"
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                      accessibilityLabel="Category name input"
                    />
                  </View>

                  {/* Single Row of Icons */}
                  <View style={styles.iconSection}>
                    <Text style={styles.sectionLabel}>Choose Icon</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.iconScroll}
                      contentContainerStyle={styles.iconScrollContent}
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

                  {/* Action Buttons */}
                  <View style={styles.sheetButtonsRow}>
                    <TouchableOpacity
                      style={styles.sheetSecondaryButton}
                      onPress={onClose}
                      activeOpacity={0.7}
                      accessibilityLabel="Cancel"
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={[
                          "rgba(255, 255, 255, 0.12)",
                          "rgba(255, 255, 255, 0.03)",
                        ]}
                        style={styles.glassButton}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <Text style={styles.sheetSecondaryText}>Cancel</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.sheetPrimaryButton,
                        (!categoryName.trim() || loading) &&
                          styles.buttonDisabled,
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
                          "rgba(74, 144, 226, 0.8)",
                          "rgba(74, 144, 226, 0.6)",
                        ]}
                        style={styles.glassButton}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <Text style={styles.sheetPrimaryText}>
                          {loading ? "Adding..." : "Add"}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 10,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    marginBottom: 20,
    alignItems: "center",
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
  },
  iconBoxSelected: {
    borderColor: "#4A90E2",
    backgroundColor: "rgba(74, 144, 226, 0.15)",
  },
  iconEmoji: {
    fontSize: 32,
  },
  iconEmojiRow: {
    fontSize: 24,
  },
  categoryInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 16,
    minHeight: 52,
  },
  iconSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  iconScroll: {
    marginHorizontal: -18,
    paddingHorizontal: 18,
  },
  iconScrollContent: {
    gap: 10,
    paddingRight: 18,
  },
  iconRow: {
    flexDirection: "row",
    gap: 10,
  },
  iconOption: {
    width: 52,
    height: 52,
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
  sheetButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  sheetSecondaryButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  glassButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  sheetSecondaryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  sheetPrimaryButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  sheetPrimaryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});

export default AddCategoryModal;
