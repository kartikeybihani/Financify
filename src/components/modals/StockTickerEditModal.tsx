import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import IconButton from "@/src/components/shared/IconButton";

interface StockTickerEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (ticker: string) => void;
  defaultTicker?: string;
}

const sanitizeTickerInput = (value: string) =>
  value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 5);

export default function StockTickerEditModal({
  visible,
  onClose,
  onSubmit,
  defaultTicker = "",
}: StockTickerEditModalProps) {
  const [ticker, setTicker] = useState(defaultTicker);

  useEffect(() => {
    if (visible) {
      setTicker(defaultTicker);
    }
  }, [visible, defaultTicker]);

  const handleSubmit = () => {
    const cleaned = sanitizeTickerInput(ticker.trim());
    if (!cleaned) {
      Alert.alert("Ticker Required", "Enter a stock ticker (1-5 letters).");
      return;
    }
    onSubmit(cleaned);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Change Ticker</Text>
            <IconButton onPress={onClose} icon="close" size={20} />
          </View>

          <Text style={styles.helperText}>
            Enter the ticker symbol you want analyzed.
          </Text>

          <TextInput
            style={styles.input}
            value={ticker}
            onChangeText={(value) => setTicker(sanitizeTickerInput(value))}
            placeholder="e.g., AAPL"
            placeholderTextColor="#666"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            keyboardType="default"
          />

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>Update Ticker</Text>
          </TouchableOpacity>
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
    borderRadius: 24,
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
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  helperText: {
    color: "#A0A0A0",
    marginBottom: 12,
    fontSize: 14,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    fontSize: 16,
    letterSpacing: 1,
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: "#4A90E2",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
