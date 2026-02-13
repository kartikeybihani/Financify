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
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { LinearGradient } from "expo-linear-gradient";
import {
  getOrCreateCurrentBudgetPeriod,
  upsertBudgetEntry,
  updateBudgetPeriodMeta,
} from "@/src/types/budget";
import { CURATED_ICONS } from "@/src/components/shared/modal-constants";

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

// Fallback for when Modal renders outside SafeAreaProvider (insets can be 0)
const FALLBACK_BOTTOM_INSET = Platform.OS === "ios" ? 34 : 0;

const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  visible,
  onClose,
  onCategoryAdded,
}) => {
  const [categoryName, setCategoryName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("💰");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const rawInsets = useSafeAreaInsets();
  const insets = {
    bottom: rawInsets.bottom || FALLBACK_BOTTOM_INSET,
  };

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      // Reset form state after modal closes
      const timer = setTimeout(() => {
        setCategoryName("");
        setSelectedIcon("💰");
        setBudgetAmount("");
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

      // Check for duplicate category name (case-insensitive, trimmed)
      const { data: existingCategory } = await supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .ilike("name", categoryName.trim());

      if (existingCategory && existingCategory.length > 0) {
        Alert.alert(
          "Duplicate Category",
          `A category named "${categoryName.trim()}" already exists. Please choose a different name.`,
        );
        setLoading(false);
        return;
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
        },
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

      // Log category creation
      logger.info(
        `[CATEGORY] Created category: "${categoryName.trim()}" (${categoryId})${budgetAmount.trim() ? ` with budget $${budgetAmount.trim()}` : ""}`,
      );

      // Create budget entry if budget amount is provided
      if (budgetAmount.trim()) {
        const budgetValue = parseFloat(budgetAmount.trim());
        if (!isNaN(budgetValue) && budgetValue > 0) {
          try {
            const period = await getOrCreateCurrentBudgetPeriod(user.id);
            if (period) {
              await upsertBudgetEntry(period.id, {
                scope_type: "category",
                category_id: categoryId,
                label: categoryName.trim(),
                limit_amount: budgetValue,
              });

              // Update period status to "active" if it's currently "draft"
              // This ensures the budget shows up immediately after creation
              if (period.status === "draft") {
                await updateBudgetPeriodMeta(period.id, {
                  status: "active",
                });
              }
            }
          } catch (budgetError) {
            // Log error but don't fail the category creation
            logger.error(
              "[BUDGET] Error creating budget entry for new category:",
              budgetError,
            );
          }
        }
      }

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
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardAvoidingView}
            >
              <LinearGradient
                colors={FAB_GRADIENT_COLORS}
                style={styles.sheet}
              >
                {/* Drag handle */}
                <View style={styles.handleContainer}>
                  <View style={styles.handle} />
                </View>

                {/* Header */}
                <View style={styles.header}>
                  <Text style={styles.headerTitle}>Add New Category</Text>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>

                {/* Category Name */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>CATEGORY NAME</Text>
                  <View style={styles.nameRow}>
                    <TouchableOpacity
                      style={[
                        styles.iconBox,
                        (isIconSelected({ type: "emoji", value: selectedIcon }) ||
                          CURATED_ICONS.some((icon) => icon.value === selectedIcon)) &&
                          styles.iconBoxSelected,
                      ]}
                      activeOpacity={0.7}
                    >
                      {renderSelectedIcon()}
                    </TouchableOpacity>
                    <TextInput
                      style={styles.categoryInput}
                      value={categoryName}
                      onChangeText={setCategoryName}
                      placeholder="Enter category name"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      autoFocus
                      autoCapitalize="words"
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                    />
                  </View>
                </View>

                {/* Budget */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>BUDGET</Text>
                  <View style={styles.budgetInputRow}>
                    <Text style={styles.budgetPrefix}>$</Text>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="decimal-pad"
                      value={budgetAmount}
                      onChangeText={setBudgetAmount}
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                    />
                  </View>
                  <Text style={styles.budgetHint}>
                    Set a monthly budget limit for this category
                  </Text>
                </View>

                {/* Icon Selection */}
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>CHOOSE ICON</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
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
                      >
                        {renderIcon(icon, true)}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Buttons */}
                <View
                  style={[
                    styles.buttonRow,
                    { paddingBottom: Math.max(insets.bottom, 20) },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.btn, styles.cancelBtn]}
                    onPress={handleClose}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(142, 142, 147, 0.15)",
                        "rgba(142, 142, 147, 0.05)",
                      ]}
                      style={styles.btnInner}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#fff" />
                      <Text style={styles.btnText}>Cancel</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.btn,
                      styles.saveBtn,
                      (!categoryName.trim() || loading) && styles.btnDisabled,
                    ]}
                    onPress={handleSave}
                    disabled={!categoryName.trim() || loading}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={[
                        "rgba(74, 144, 226, 0.15)",
                        "rgba(74, 145, 226, 0.41)",
                      ]}
                      style={styles.btnInner}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.btnText}>
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

const PADDING_H = 20;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  keyboardAvoidingView: {
    width: "100%",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: PADDING_H,
    overflow: "hidden",
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    paddingTop: 20,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
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
    fontSize: 26,
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
    paddingVertical: 14,
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    height: 52,
  },
  budgetInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 16,
    height: 52,
  },
  budgetPrefix: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 18,
    fontWeight: "700",
    marginRight: 8,
  },
  budgetInput: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  budgetHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 6,
  },
  iconScrollContent: {
    gap: 10,
    paddingVertical: 2,
  },
  iconOption: {
    width: 46,
    height: 46,
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
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 24,
  },
  btn: {
    borderRadius: 12,
    overflow: "hidden",
  },
  cancelBtn: {
    flex: 0.4,
  },
  saveBtn: {
    flex: 0.6,
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 8,
  },
  btnText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

export default AddCategoryModal;
