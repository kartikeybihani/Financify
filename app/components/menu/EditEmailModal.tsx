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
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EditEmailModalProps {
  visible: boolean;
  value: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSave: (val: string) => Promise<void>;
}

export default function EditEmailModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
}: EditEmailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(value);
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [slideAnim] = useState(new Animated.Value(0));

  const handleCancel = () => {
    setShowVerification(false);
    setVerificationCode("");
    setEmail(value);
    setError("");
    slideAnim.setValue(0);
    onCancel();
  };

  const handleContinue = async () => {
    if (!email.trim()) {
      setError("Please enter an email address.");
      return;
    }
    if (email === value) {
      setError("Please enter a different email address.");
      return;
    }
    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Here you would typically trigger sending verification code
      // For now we'll just simulate it
      setShowVerification(true);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } catch (e: any) {
      setError(e.message || "Error sending verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Here you would verify the code before saving
      await onSave(email);
    } catch (e: any) {
      setError(e.message || "Error updating email");
    } finally {
      setLoading(false);
    }
  };

  const renderEmailInput = () => (
    <Animated.View
      style={[
        styles.inputContainer,
        {
          transform: [
            {
              translateX: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -500],
              }),
            },
          ],
          opacity: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        },
      ]}
    >
      <Text style={styles.subtitle}>
        We'll send a confirmation to your new address.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholder="Enter new email"
        placeholderTextColor="#B4B4B4"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />
    </Animated.View>
  );

  const renderVerificationInput = () => (
    <Animated.View
      style={[
        styles.inputContainer,
        {
          transform: [
            {
              translateX: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [500, 0],
              }),
            },
          ],
          opacity: slideAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          }),
        },
      ]}
    >
      <Text style={styles.subtitle}>
        Please enter the verification code we sent to you
      </Text>
      <TextInput
        value={verificationCode}
        onChangeText={(text) =>
          setVerificationCode(text.replace(/[^0-9]/g, "").slice(0, 6))
        }
        style={styles.input}
        placeholder="Enter 6-digit code"
        placeholderTextColor="#B4B4B4"
        keyboardType="number-pad"
        maxLength={6}
        editable={!loading}
      />
    </Animated.View>
  );

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
          <Text style={styles.title}>Update your email</Text>
          {renderEmailInput()}
          {renderVerificationInput()}
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
              onPress={showVerification ? handleSave : handleContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {showVerification ? "Save" : "Continue"}
                </Text>
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
  inputContainer: {
    width: "100%",
    position: "absolute",
    top: 100,
    left: 32,
    right: 32,
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
