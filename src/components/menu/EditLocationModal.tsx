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

interface EditLocationModalProps {
  visible: boolean;
  value: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSave: (val: string) => Promise<void>;
}

export default function EditLocationModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
}: EditLocationModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const insets = useSafeAreaInsets();
  const locationRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && locationRef.current) {
      setTimeout(() => locationRef.current?.focus(), 300);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setNewLocation(value);
    }
  }, [visible, value]);

  const handleCancel = () => {
    setNewLocation("");
    setError("");
    onCancel();
  };

  const handleSave = async () => {
    if (!newLocation.trim()) {
      setError("Please enter your location.");
      return;
    }
    if (newLocation === value) {
      setError("Please enter a different location.");
      return;
    }
    if (newLocation.length > 120) {
      setError("Location must be 120 characters or less.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const trimmedLocation = newLocation.trim();
      await onSave(trimmedLocation);
      onChange(trimmedLocation);
    } catch (e: any) {
      setError(e.message || "Error updating location");
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
                  <Text style={styles.title}>Edit Location</Text>
                  <IconButton
                    icon="close"
                    onPress={handleCancel}
                    size={20}
                    style={styles.closeIcon}
                    activeOpacity={loading ? 1 : 0.7}
                  />
                </View>
                <TextInput
                  ref={locationRef}
                  value={newLocation}
                  onChangeText={setNewLocation}
                  style={styles.input}
                  placeholder="City, State"
                  placeholderTextColor="#B4B4B4"
                  autoCapitalize="words"
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  maxLength={120}
                />
                <Text style={styles.characterCount}>
                  {newLocation.length}/120 characters
                </Text>
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
    marginBottom: 40,
    minHeight: 34,
  },
  closeIcon: {
    position: "absolute",
    right: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  input: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    color: "#fff",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  characterCount: {
    marginTop: 8,
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    alignSelf: "flex-end",
  },
  error: {
    color: "#ff6b6b",
    marginTop: 8,
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    width: "100%",
  },
  button: {
    flex: 1,
  },
  glassButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "500",
    fontSize: 15,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
