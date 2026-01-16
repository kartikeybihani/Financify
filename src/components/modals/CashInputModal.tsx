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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import IconButton from "../shared/IconButton";

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
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Cash</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <IconButton onPress={handleClose} icon="close" size={20} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Enter your cash amount to track in your portfolio
          </Text>

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
              activeOpacity={0.7}
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
              activeOpacity={0.7}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
  },
  modalContent: {
    backgroundColor: "#0F0F0F",
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
  },
  description: {
    fontSize: 16,
    color: "#888",
    lineHeight: 24,
    marginBottom: 24,
  },
  content: {
    marginBottom: 24,
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
