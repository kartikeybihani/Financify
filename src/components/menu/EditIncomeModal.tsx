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
  TouchableWithoutFeedback,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconButton from "@/src/components/shared/IconButton";

interface EditIncomeModalProps {
  visible: boolean;
  value: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSave: (val: string) => Promise<void>;
}

export default function EditIncomeModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
}: EditIncomeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newIncome, setNewIncome] = useState("");
  const insets = useSafeAreaInsets();
  const incomeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && incomeRef.current) {
      setTimeout(() => incomeRef.current?.focus(), 300);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setNewIncome(value);
    }
  }, [visible, value]);

  const handleCancel = () => {
    setNewIncome("");
    setError("");
    onCancel();
  };

  const handleSave = async () => {
    const sanitized = newIncome.replace(/[^0-9.]/g, "").trim();
    if (!sanitized) {
      setError("Please enter your monthly income.");
      return;
    }
    const parsed = Number(sanitized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Please enter a valid monthly income amount.");
      return;
    }
    if (Math.round(parsed).toString() === value.trim()) {
      setError("Please enter a different income.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onSave(sanitized);
    } catch (e: any) {
      setError(e.message || "Error updating monthly income");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={handleCancel}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          enabled
        >
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["rgba(31, 31, 31, 0.98)", "rgba(18, 18, 18, 0.99)"]}
              style={styles.sheet}
            >
              <ScrollView
                contentContainerStyle={[
                  styles.scrollContent,
                  {
                    paddingBottom: Math.max(32, insets.bottom + 16),
                    flexGrow: 1,
                  },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                <View style={styles.headerRow}>
                  <Text style={styles.title}>Edit Monthly Income</Text>
                  <IconButton
                    icon="close"
                    onPress={handleCancel}
                    size={18}
                    style={styles.closeIcon}
                    activeOpacity={loading ? 1 : 0.7}
                  />
                </View>
                <Text style={styles.subtitle}>
                  This helps Finny personalize advice and budgets.
                </Text>

                <View style={styles.inputContainer}>
                  <Text style={styles.dollarSign}>$</Text>
                  <TextInput
                    ref={incomeRef}
                    value={newIncome}
                    onChangeText={setNewIncome}
                    style={styles.input}
                    placeholder="Enter monthly income"
                    placeholderTextColor="#B4B4B4"
                    keyboardType="numeric"
                    editable={!loading}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    maxLength={10}
                  />
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleCancel}
                    disabled={loading}
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
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, loading && { opacity: 0.7 }]}
                    onPress={handleSave}
                    disabled={loading}
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
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.saveButtonText}>Update</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </LinearGradient>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 32,
    alignItems: "stretch",
  },
  headerRow: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    minHeight: 24,
  },
  closeIcon: {
    position: "absolute",
    right: 0,
  },
  title: {
    fontSize: 21,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    color: "#B4B4B4",
    marginBottom: 22,
    textAlign: "center",
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  dollarSign: {
    color: "#9BC4FF",
    fontSize: 20,
    fontWeight: "700",
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    paddingVertical: 14,
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
  cancelButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
