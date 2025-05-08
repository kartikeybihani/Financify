import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EditPhoneModalProps {
  visible: boolean;
  value: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSave: (val: string) => Promise<void>;
}

function formatPhoneInput(input: string) {
  // Remove all non-digit chars
  let digits = input.replace(/\D/g, "");
  if (!digits) return "";
  let formatted = "";
  if (digits.length > 0) formatted += "(" + digits.slice(0, 3);
  if (digits.length >= 4) formatted += ")-" + digits.slice(3, 6);
  if (digits.length >= 7) formatted += "-" + digits.slice(6, 10);
  return formatted;
}

function getDigitsFromFormatted(input: string) {
  return input.replace(/\D/g, "");
}

export default function EditPhoneModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
}: EditPhoneModalProps) {
  // Only store digits after country code
  const initialDigits = getDigitsFromFormatted(value.replace(/^\+1\s*/, ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [digits, setDigits] = useState(initialDigits);

  const handleSave = async () => {
    if (!digits.trim() || digits.length !== 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSave(`+1 ${formatPhoneInput(digits)}`);
    } catch (e: any) {
      setError(e.message || "Error updating phone");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text: string) => {
    const onlyDigits = getDigitsFromFormatted(text);
    setDigits(onlyDigits.slice(0, 10));
    onChange(`+1 ${formatPhoneInput(onlyDigits.slice(0, 10))}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <TouchableOpacity
            style={styles.closeIcon}
            onPress={onCancel}
            disabled={loading}
          >
            <Ionicons name="close" size={28} color="#B4B4B4" />
          </TouchableOpacity>
          <Text style={styles.title}>Update your phone</Text>
          <Text style={styles.subtitle}>
            We'll use this for account recovery and security.
          </Text>
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>+1 </Text>
            <TextInput
              value={formatPhoneInput(digits)}
              onChangeText={handleChange}
              style={styles.input}
              placeholder="(123)-456-7890"
              placeholderTextColor="#B4B4B4"
              keyboardType="phone-pad"
              editable={!loading}
              maxLength={14}
              selectionColor="#4A90E2"
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                loading && { opacity: 0.7 },
              ]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,16,30,0.85)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 500,
    minHeight: 340,
    backgroundColor: "#181C24",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  closeIcon: {
    position: "absolute",
    top: 18,
    right: 18,
    zIndex: 2,
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: 0.2,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "#B4B4B4",
    marginBottom: 22,
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
  },
  prefix: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "#23283A",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    paddingVertical: 16,
    paddingLeft: 20,
  },
  input: {
    flex: 1,
    backgroundColor: "#23283A",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 0,
    color: "#fff",
    fontSize: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  error: {
    color: "#ff4444",
    marginBottom: 8,
    textAlign: "center",
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 24,
    gap: 16,
  },
  button: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#23283A",
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: "#4A90E2",
    marginLeft: 8,
  },
  cancelButtonText: {
    color: "#B4B4B4",
    fontWeight: "600",
    fontSize: 16,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
