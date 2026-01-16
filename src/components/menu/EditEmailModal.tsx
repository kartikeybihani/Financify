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
  Animated,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconButton from "@/src/components/shared/IconButton";
import { useEmailVerification } from "@/src/hooks/useEmailVerification";

interface EditEmailModalProps {
  visible: boolean;
  value: string;
  onChange: (val: string) => void;
  onCancel: () => void;
  onSave: (val: string) => Promise<void>;
  onVerified?: (email: string) => void;
}

export default function EditEmailModal({
  visible,
  value,
  onChange,
  onCancel,
  onSave,
  onVerified,
}: EditEmailModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showVerificationView, setShowVerificationView] = useState(false);
  const insets = useSafeAreaInsets();

  // Email verification hook
  const {
    status: verificationStatus,
    errorMessage: verificationError,
    pendingEmail,
    startVerification,
    stopVerification,
    resetVerification,
    manualCheck,
  } = useEmailVerification();

  const [isCheckingManually, setIsCheckingManually] = useState(false);

  // Animation refs
  const formOpacity = useRef(new Animated.Value(1)).current;
  const verificationOpacity = useRef(new Animated.Value(0)).current;

  // Refs for auto-focus
  const newEmailRef = useRef<TextInput>(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (visible && newEmailRef.current) {
      setTimeout(() => newEmailRef.current?.focus(), 300);
    }
  }, [visible]);

  // Update local state when value prop changes
  useEffect(() => {
    if (visible) {
      setNewEmail(value);
      setError("");
      // Check if there's a pending verification
      if (pendingEmail && verificationStatus === "verifying") {
        setShowVerificationView(true);
        formOpacity.setValue(0);
        verificationOpacity.setValue(1);
      } else {
        setShowVerificationView(false);
        formOpacity.setValue(1);
        verificationOpacity.setValue(0);
        if (verificationStatus !== "verifying") {
          resetVerification();
        }
      }
    }
  }, [visible, value, pendingEmail, verificationStatus, resetVerification]);

  // Handle verification status changes
  useEffect(() => {
    if (verificationStatus === "verified") {
      const verifiedEmail = pendingEmail || newEmail;
      // Notify parent of successful verification
      if (onVerified) {
        onVerified(verifiedEmail);
      }
      onChange(verifiedEmail);
      // Show success message briefly, then close
      setTimeout(() => {
        handleCancel();
      }, 2000);
    } else if (verificationStatus === "timeout") {
      // Timeout - modal will close automatically
      setTimeout(() => {
        handleCancel();
      }, 3000);
    }
  }, [verificationStatus, pendingEmail, newEmail, onChange, onVerified]);

  const handleCancel = () => {
    setNewEmail("");
    setError("");
    setShowVerificationView(false);
    resetVerification();
    onCancel();
  };

  const handleBackToForm = () => {
    setShowVerificationView(false);
    stopVerification();
    // Animate back to form
    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(verificationOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleManualCheck = async () => {
    setIsCheckingManually(true);
    setError(""); // Clear any previous errors

    // Add a timeout wrapper to ensure loading state is always cleared
    const timeoutId = setTimeout(() => {
      console.warn(
        "[EditEmailModal] Manual check taking too long, clearing loading state"
      );
      setIsCheckingManually(false);
      setError(
        "Verification check is taking longer than expected. Please try again."
      );
    }, 25000); // 25 second timeout

    try {
      const result = await manualCheck();
      clearTimeout(timeoutId);

      if (!result) {
        // If check returned false but didn't throw, email isn't verified yet
        setError(
          "Email not yet verified. Please make sure you clicked the confirmation link in your email and wait a few seconds before checking again."
        );
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error("[EditEmailModal] Error in handleManualCheck:", err);
      setError(
        err?.message || "Failed to check verification status. Please try again."
      );
    } finally {
      clearTimeout(timeoutId);
      setIsCheckingManually(false);
    }
  };

  const handleSave = async () => {
    if (!newEmail.trim()) {
      setError("Please enter a new email address.");
      return;
    }
    if (newEmail === value) {
      setError("Please enter a different email address.");
      return;
    }
    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onSave(newEmail);
      // Start verification polling
      await startVerification(newEmail);
      // Animate to verification view
      setShowVerificationView(true);
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(verificationOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (e: any) {
      setError(e.message || "Error updating email");
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
              {!showVerificationView ? (
                <Animated.View
                  style={[
                    styles.viewContainer,
                    {
                      opacity: formOpacity,
                    },
                  ]}
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
                    <IconButton
                      icon="close"
                      onPress={handleCancel}
                      size={22}
                      style={styles.closeIcon}
                      activeOpacity={loading ? 1 : 0.7}
                    />
                    <Text style={styles.title}>Change Email Address</Text>
                    <Text style={styles.subtitle}>
                      We'll send a confirmation link to verify the change.
                    </Text>
                    <TextInput
                      ref={newEmailRef}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      style={styles.input}
                      placeholder="Enter new email"
                      placeholderTextColor="#B4B4B4"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!loading}
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                    />
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
                            <Text style={styles.saveButtonText}>
                              Update Email
                            </Text>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </Animated.View>
              ) : (
                <Animated.View
                  style={[
                    styles.viewContainer,
                    {
                      opacity: verificationOpacity,
                    },
                  ]}
                >
                  <ScrollView
                    contentContainerStyle={[
                      styles.verificationContent,
                      {
                        paddingBottom: Math.max(24, insets.bottom + 16),
                        flexGrow: 1,
                      },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled={true}
                  >
                    <IconButton
                      icon="close"
                      onPress={handleCancel}
                      size={22}
                      style={styles.closeIcon}
                      activeOpacity={0.7}
                    />

                    {verificationStatus === "verifying" && (
                      <>
                        <View style={styles.mascotContainer}>
                          <Image
                            source={require("../../../assets/images/finnylap1.png")}
                            style={styles.mascotImage}
                            resizeMode="cover"
                          />
                        </View>
                        <Text style={styles.verificationTitle}>
                          Currently verifying you...
                        </Text>
                        <Text style={styles.verificationSubtitle}>
                          We've sent a confirmation link to{"\n"}
                          <Text style={styles.emailHighlight}>
                            {pendingEmail || newEmail}
                          </Text>
                          {"\n\n"}
                          Please check your email and click the confirmation
                          link.
                        </Text>
                        {error ? (
                          <Text style={styles.verificationError}>{error}</Text>
                        ) : null}
                        <View style={styles.actionButtonsRow}>
                          <TouchableOpacity
                            style={styles.checkButton}
                            onPress={handleManualCheck}
                            disabled={isCheckingManually}
                            activeOpacity={0.7}
                          >
                            <LinearGradient
                              colors={[
                                "rgba(74, 144, 226, 0.8)",
                                "rgba(74, 144, 226, 0.6)",
                              ]}
                              style={styles.checkButtonGradient}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                            >
                              {isCheckingManually ? (
                                <ActivityIndicator color="#fff" size="small" />
                              ) : (
                                <Text style={styles.checkButtonText}>
                                  Check Verification
                                </Text>
                              )}
                            </LinearGradient>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.changeEmailButton}
                            onPress={handleBackToForm}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.changeEmailText}>
                              Change email
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}

                    {verificationStatus === "verified" && (
                      <>
                        <View style={styles.mascotContainer}>
                          <Image
                            source={require("../../../assets/images/finnylap1.png")}
                            style={styles.mascotImage}
                            resizeMode="cover"
                          />
                        </View>
                        <Text style={styles.successTitle}>Email Verified!</Text>
                        <Text style={styles.successSubtitle}>
                          Your email has been successfully updated.
                        </Text>
                      </>
                    )}

                    {verificationStatus === "timeout" && (
                      <>
                        <View style={styles.mascotContainer}>
                          <Image
                            source={require("../../../assets/images/finnylap1.png")}
                            style={styles.mascotImage}
                            resizeMode="cover"
                          />
                        </View>
                        <Text style={styles.timeoutTitle}>
                          Verification Timeout
                        </Text>
                        <Text style={styles.timeoutSubtitle}>
                          The verification link has expired. Please try again.
                        </Text>
                      </>
                    )}

                    {verificationStatus === "error" && (
                      <>
                        <View style={styles.mascotContainer}>
                          <Image
                            source={require("../../../assets/images/finnylap1.png")}
                            style={styles.mascotImage}
                            resizeMode="cover"
                          />
                        </View>
                        <Text style={styles.errorTitle}>
                          Verification Error
                        </Text>
                        <Text style={styles.errorSubtitle}>
                          {verificationError ||
                            "Something went wrong. Please try again."}
                        </Text>
                        <TouchableOpacity
                          style={styles.retryButton}
                          onPress={handleBackToForm}
                          activeOpacity={0.7}
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
                            <Text style={styles.retryButtonText}>
                              Try Again
                            </Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </>
                    )}
                  </ScrollView>
                </Animated.View>
              )}
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
  viewContainer: {
    width: "100%",
  },
  scrollContent: {
    paddingHorizontal: 32,
    paddingTop: 32,
    alignItems: "center",
  },
  verificationContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    color: "#fff",
    fontSize: 16,
    padding: 16,
    marginBottom: 25,
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
  mascotContainer: {
    width: 150,
    height: 150,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 75,
    overflow: "hidden",
  },
  mascotImage: {
    width: "100%",
    height: "100%",
  },
  verificationTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  verificationSubtitle: {
    fontSize: 14,
    color: "#B4B4B4",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  emailHighlight: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
  },
  checkButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  checkButtonGradient: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  checkButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  changeEmailButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changeEmailText: {
    color: "#888",
    fontSize: 14,
    textDecorationLine: "underline",
  },
  verificationError: {
    color: "#FF9500",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#32D74B",
    marginBottom: 8,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 14,
    color: "#B4B4B4",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  timeoutTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FF9500",
    marginBottom: 8,
    textAlign: "center",
  },
  timeoutSubtitle: {
    fontSize: 14,
    color: "#B4B4B4",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FF3B30",
    marginBottom: 8,
    textAlign: "center",
  },
  errorSubtitle: {
    fontSize: 14,
    color: "#B4B4B4",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    width: "100%",
    maxWidth: 200,
    borderRadius: 12,
    overflow: "hidden",
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
