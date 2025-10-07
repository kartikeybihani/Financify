import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface CashInputModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (amount: number, description?: string) => void;
}

export default function CashInputModal({
  visible,
  onClose,
  onSave,
}: CashInputModalProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const handleSave = async () => {
    const numericAmount = parseFloat(amount);

    if (isNaN(numericAmount) || numericAmount < 0) {
      Alert.alert(
        "Invalid Amount",
        "Please enter a valid amount greater than or equal to 0."
      );
      return;
    }

    if (numericAmount === 0) {
      Alert.alert("Zero Amount", "Please enter an amount greater than 0.");
      return;
    }

    setIsLoading(true);
    try {
      await onSave(numericAmount, description.trim() || undefined);
      setAmount("");
      setDescription("");
      onClose();
    } catch (error) {
      Alert.alert("Error", "Failed to save cash entry. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setAmount("");
    setDescription("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <BlurView intensity={20} style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.container}
        >
          <View style={[styles.modal, { paddingBottom: insets.bottom + 20 }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="cash-outline" size={24} color="#4A90E2" />
                </View>
                <View>
                  <Text style={styles.title}>Add Cash</Text>
                  <Text style={styles.subtitle}>Enter your cash amount</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
              >
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.15)",
                    "rgba(255, 255, 255, 0.05)",
                  ]}
                  style={styles.closeButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Amount ($)</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.dollarSign}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                    autoFocus
                    selectTextOnFocus
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description (Optional)</Text>
                <TextInput
                  style={styles.descriptionInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g., Emergency fund, Petty cash"
                  placeholderTextColor="#666"
                  multiline
                  maxLength={100}
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.button}
                onPress={handleClose}
                disabled={isLoading}
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
                  <Text style={styles.buttonText}>Cancel</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={handleSave}
                disabled={!amount || isLoading}
              >
                <LinearGradient
                  colors={
                    !amount || isLoading
                      ? [
                          "rgba(255, 255, 255, 0.08)",
                          "rgba(255, 255, 255, 0.02)",
                        ]
                      : ["#4A90E2", "#4A90E2"]
                  }
                  style={styles.glassButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={!amount || isLoading ? "#666" : "#fff"}
                  />
                  <Text
                    style={[
                      styles.buttonText,
                      (!amount || isLoading) && styles.buttonTextDisabled,
                    ]}
                  >
                    {isLoading ? "Saving..." : "Add Cash"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modal: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    width: Dimensions.get("window").width - 50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
  },
  closeButtonGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  content: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 8,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dollarSign: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4A90E2",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    padding: 0,
  },
  descriptionInput: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
    minHeight: 80,
    textAlignVertical: "top",
  },
  actions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  glassButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    gap: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonTextDisabled: {
    color: "#666",
  },
});
