import React, { useState, useEffect } from "react";
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
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import IconButton from "@/src/components/shared/IconButton";

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

function formatPhoneUS(digits: string) {
  if (!digits) return "";
  let formatted = "";
  if (digits.length > 0) formatted += "(" + digits.slice(0, 3);
  if (digits.length >= 4) formatted += ")-" + digits.slice(3, 6);
  if (digits.length >= 7) formatted += "-" + digits.slice(6, 10);
  return formatted;
}

export default function EditPhoneModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
}: EditPhoneModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [digits, setDigits] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [slideAnim] = useState(new Animated.Value(0));
  const originalPhoneDigitsRef = React.useRef("");

  useEffect(() => {
    if (visible) {
      const rawDigits = getDigitsFromFormatted(value);
      setDigits(rawDigits);
      setInputValue(formatPhoneUS(rawDigits));
      if (!originalPhoneDigitsRef.current) {
        originalPhoneDigitsRef.current = rawDigits;
      }
      setError("");
      setShowVerification(false);
      setVerificationCode("");
      slideAnim.setValue(0);
    } else {
      // Reset ref when modal closes
      originalPhoneDigitsRef.current = "";
    }
  }, [visible]);

  const handleCancel = () => {
    setShowVerification(false);
    setVerificationCode("");
    const rawDigits = getDigitsFromFormatted(value);
    setDigits(rawDigits);
    setInputValue(formatPhoneUS(rawDigits));
    setError("");
    slideAnim.setValue(0);
    onCancel();
  };

  const handleChange = (text: string) => {
    const onlyDigits = getDigitsFromFormatted(text);
    setDigits(onlyDigits.slice(0, 10));
    setInputValue(formatPhoneUS(onlyDigits.slice(0, 10)));
    onChange(formatPhoneUS(onlyDigits.slice(0, 10)));
  };

  const handleContinue = async () => {
    const formattedDigits = digits.replace(/\D/g, "");
    if (!formattedDigits || formattedDigits.length !== 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }
    if (formattedDigits === originalPhoneDigitsRef.current) {
      setError("Please enter a different phone number.");
      return;
    }
    setLoading(true);
    setError("");
    try {
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
      await onSave(`+1 ${formatPhoneInput(digits)}`);
    } catch (e: any) {
      setError(e.message || "Error updating phone");
    } finally {
      setLoading(false);
    }
  };

  const renderPhoneInput = () => (
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
        We'll use this for account recovery and security.
      </Text>
      <View style={styles.inputRow}>
        <Text style={styles.prefix}>+1 </Text>
        <TextInput
          value={inputValue}
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
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.sheet}>
          <IconButton
            icon="close"
            onPress={handleCancel}
            size={22}
            style={styles.closeIcon}
            activeOpacity={loading ? 1 : 0.7}
          />
          <Text style={styles.title}>Update your phone</Text>
          {renderPhoneInput()}
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
    minHeight: 340,
    backgroundColor: "rgba(24, 28, 36, 0.95)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
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
  },
  inputContainer: {
    width: "100%",
    position: "absolute",
    top: 100,
    left: 32,
    right: 32,
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
    backgroundColor: "rgba(35, 40, 58, 0.8)",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRightWidth: 0,
    paddingVertical: 16,
    paddingLeft: 20,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(35, 40, 58, 0.8)",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderLeftWidth: 0,
    color: "#fff",
    fontSize: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
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
