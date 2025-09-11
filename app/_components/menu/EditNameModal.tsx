import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EditNameModalProps {
  visible: boolean;
  value: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSave: (val: string) => Promise<void>;
}

export default function EditNameModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
}: EditNameModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(value);

  const handleCancel = () => {
    setName(value);
    setError("");
    onCancel();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (name === value) {
      setError("Please enter a different name.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSave(name);
    } catch (e: any) {
      setError(e.message || "Error updating name");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <TouchableOpacity
            style={styles.closeIcon}
            onPress={handleCancel}
            disabled={loading}
          >
            <Ionicons name="close" size={28} color="#B4B4B4" />
          </TouchableOpacity>
          <Text style={styles.title}>Update your name</Text>
          <Text style={styles.subtitle}>This is what we will call you.</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor="#B4B4B4"
            editable={!loading}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
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
                <ActivityIndicator color="#000" />
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
    minHeight: 300,
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
  input: {
    width: "100%",
    backgroundColor: "#23283A",
    borderRadius: 12,
    borderWidth: 0,
    color: "#fff",
    fontSize: 16,
    padding: 16,
    marginBottom: 10,
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
    marginTop: "auto",
    marginBottom: 20,
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
    backgroundColor: "#fff",
    marginLeft: 8,
  },
  cancelButtonText: {
    color: "#B4B4B4",
    fontWeight: "600",
    fontSize: 16,
  },
  saveButtonText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
});
