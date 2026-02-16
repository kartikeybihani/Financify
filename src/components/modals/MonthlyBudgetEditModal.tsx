import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

interface MonthlyBudgetEditModalProps {
  visible: boolean;
  currentAmount: number;
  onClose: () => void;
  onSave: (amount: number) => Promise<boolean>;
}

export default function MonthlyBudgetEditModal({
  visible,
  currentAmount,
  onClose,
  onSave,
}: MonthlyBudgetEditModalProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount(currentAmount > 0 ? String(Math.round(currentAmount)) : "");
    }
  }, [visible, currentAmount]);

  const handleSave = async () => {
    const budgetValue = parseFloat(amount.trim().replace(/[^0-9.-]/g, ""));
    if (isNaN(budgetValue) || budgetValue <= 0) {
      return;
    }

    setLoading(true);
    try {
      const success = await onSave(budgetValue);
      if (success) {
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const budgetValue = parseFloat(amount.trim().replace(/[^0-9.-]/g, ""));
  const isValid = !isNaN(budgetValue) && budgetValue > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? () => {} : onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={["#1a1a1a", "#0f0f0f"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.modalContent}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Monthly Budget</Text>
              {!loading && (
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4A90E2" />
                <Text style={styles.loadingText}>Saving...</Text>
              </View>
            ) : (
              <>
                <View style={styles.content}>
                  <Text style={styles.label}>
                    Set your total monthly budget
                  </Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.input}
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0"
                      placeholderTextColor="rgba(255, 255, 255, 0.3)"
                      keyboardType="number-pad"
                      autoFocus
                    />
                  </View>
                  <Text style={styles.hint}>
                    This caps your total spending for the month. Category limits
                    below show how you plan to allocate it.
                  </Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    onPress={onClose}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSave}
                    style={[
                      styles.saveButton,
                      !isValid && styles.saveButtonDisabled,
                    ]}
                    disabled={!isValid}
                  >
                    <LinearGradient
                      colors={
                        isValid ? ["#4A90E2", "#5DA0F2"] : ["#666", "#888"]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.saveButtonGradient}
                    >
                      <Text style={styles.saveButtonText}>Save</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  modalContent: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
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
  loadingContainer: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
    fontFamily: "Manrope",
  },
  content: {
    marginBottom: 24,
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
    lineHeight: 18,
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
