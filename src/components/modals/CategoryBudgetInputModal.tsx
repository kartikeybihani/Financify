import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase/supabase";
import { generateUUID } from "@/src/utils/core/uuid";
import {
  getOrCreateCurrentBudgetPeriod,
  upsertBudgetEntry,
  updateBudgetPeriodMeta,
} from "@/src/types/budget";
import logger from "@/src/utils/core/logger";
import { getColorForCategoryName } from "@/lib/categoryColors";

interface CategoryBudgetInputModalProps {
  visible: boolean;
  category: {
    name: string;
    icon: string;
    slug: string;
  };
  onClose: () => void;
  onBudgetCreated: () => void;
}

export default function CategoryBudgetInputModal({
  visible,
  category,
  onClose,
  onBudgetCreated,
}: CategoryBudgetInputModalProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const budgetValue = parseFloat(amount.trim());
    if (isNaN(budgetValue) || budgetValue <= 0) {
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Check if category exists, create if not
      const { data: existingCategory } = await supabase
        .from("categories")
        .select("id")
        .eq("user_id", user.id)
        .eq("slug", category.slug)
        .maybeSingle();

      let categoryId = existingCategory?.id;

      if (!categoryId) {
        // Create category
        const newCategoryId = generateUUID();
        const { error: categoryError } = await supabase
          .from("categories")
          .insert({
            id: newCategoryId,
            user_id: user.id,
            name: category.name,
            slug: category.slug,
            icon: category.icon,
            color: getColorForCategoryName(category.name),
            rank: 0,
            is_active: true,
          });

        if (categoryError) {
          throw categoryError;
        }

        categoryId = newCategoryId;
      }

      // Create budget entry
      const period = await getOrCreateCurrentBudgetPeriod(user.id);
      if (!period) {
        throw new Error("Failed to create budget period");
      }

      await upsertBudgetEntry(period.id, {
        scope_type: "category",
        category_id: categoryId,
        label: category.name,
        limit_amount: budgetValue,
      });

      // Update period status to "active" if it's currently "draft"
      // This ensures the budget shows up immediately after creation
      if (period.status === "draft") {
        await updateBudgetPeriodMeta(period.id, {
          status: "active",
        });
      }

      logger.info(
        `[BUDGET] Created budget for ${category.name}: $${budgetValue}`,
      );

      setAmount("");
      onBudgetCreated();
      onClose();
    } catch (error) {
      logger.error("[BUDGET] Error creating category budget:", error);
    } finally {
      setLoading(false);
    }
  };

  const budgetValue = parseFloat(amount.trim());
  const isValid = !isNaN(budgetValue) && budgetValue > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={["#1a1a1a", "#0f0f0f"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.modalContent}
          >
            <View style={styles.header}>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={styles.categoryName}>{category.name}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <Text style={styles.label}>Monthly Budget</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor="rgba(255, 255, 255, 0.3)"
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>
              <Text style={styles.hint}>Enter your monthly budget limit</Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.cancelButton}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[
                  styles.saveButton,
                  !isValid && styles.saveButtonDisabled,
                ]}
                disabled={!isValid || loading}
              >
                <LinearGradient
                  colors={isValid ? ["#4A90E2", "#5DA0F2"] : ["#666", "#888"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveButtonGradient}
                >
                  <Text style={styles.saveButtonText}>
                    {loading ? "Saving..." : "Save"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  modalContent: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 24,
    minHeight: 300,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  categoryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryIcon: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    marginBottom: 24,
    minHeight: 120,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: "Manrope",
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  dollarSign: {
    fontSize: 24,
    fontWeight: "600",
    color: "#4A90E2",
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
    padding: 0,
  },
  hint: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    fontFamily: "Manrope",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
  },
});
