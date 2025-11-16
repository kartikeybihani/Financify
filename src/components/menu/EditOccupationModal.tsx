import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import IconButton from "@/src/components/shared/IconButton";

interface EditOccupationModalProps {
  visible: boolean;
  value: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSave: (val: string) => Promise<void>;
}

export default function EditOccupationModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
}: EditOccupationModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newOccupation, setNewOccupation] = useState("");

  // Refs for auto-focus
  const occupationRef = useRef<TextInput>(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (visible && occupationRef.current) {
      setTimeout(() => occupationRef.current?.focus(), 300);
    }
  }, [visible]);

  // Update local state when value prop changes
  useEffect(() => {
    if (visible) {
      setNewOccupation(value);
    }
  }, [visible, value]);

  const handleCancel = () => {
    setNewOccupation("");
    setError("");
    onCancel();
  };

  const handleSave = async () => {
    if (!newOccupation.trim()) {
      setError("Please enter your occupation.");
      return;
    }
    if (newOccupation === value) {
      setError("Please enter a different occupation.");
      return;
    }
    if (newOccupation.length > 300) {
      setError("Occupation must be 300 characters or less.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSave(newOccupation);
    } catch (e: any) {
      setError(e.message || "Error updating occupation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        enabled
      >
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <IconButton
              icon="close"
              onPress={handleCancel}
              size={22}
              style={styles.closeIcon}
              activeOpacity={loading ? 1 : 0.7}
            />
            <Text style={styles.title}>Edit Occupation</Text>
            <Text style={styles.subtitle}>
              Tell us a little about yourself and what do you profession{"\n"}
              Helps finny get to know you better!
            </Text>
            <TextInput
              ref={occupationRef}
              value={newOccupation}
              onChangeText={setNewOccupation}
              style={[styles.input, { minHeight: 50, maxHeight: 120 }]}
              placeholder="Enter your occupation"
              placeholderTextColor="#B4B4B4"
              autoCapitalize="words"
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              multiline
              textAlignVertical="top"
              maxLength={300}
            />
            <Text style={styles.characterCount}>
              {newOccupation.length}/300 characters
            </Text>
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
                  <Text style={styles.saveButtonText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "90%",
    backgroundColor: "rgba(24, 28, 36, 0.95)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  scrollContent: {
    padding: 32,
    alignItems: "center",
    minHeight: 300,
  },
  closeIcon: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
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
    lineHeight: 20,
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(35, 40, 58, 0.8)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    color: "#fff",
    fontSize: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  characterCount: {
    fontSize: 12,
    color: "#888",
    alignSelf: "flex-end",
    marginBottom: 16,
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
    marginBottom: 10,
    gap: 16,
  },
  button: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "rgba(35, 40, 58, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginRight: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  saveButton: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginLeft: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
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
