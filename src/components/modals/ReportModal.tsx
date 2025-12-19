import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { submitChatMessageReport } from "@/src/utils/analytics/reports";
import IconButton from "@/src/components/shared/IconButton";
import { authenticatedFetch } from "@/src/utils/auth/authToken";

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  messageId?: string;
  messageContent?: string;
  messageSender?: "user" | "finny";
  chatSessionId?: string | null;
  messageMetadata?: Record<string, any>;
  userMessage?: string; // User's message that prompted this Finny response
}

export default function ReportModal({
  visible,
  onClose,
  messageId,
  messageContent,
  messageSender,
  chatSessionId,
  messageMetadata,
  userMessage,
}: ReportModalProps) {
  const [report, setReport] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setReport("");
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!report.trim()) {
      Alert.alert("Error", "Please describe the issue");
      return;
    }

    if (!messageId || !messageContent || !messageSender) {
      Alert.alert("Error", "Missing message information. Please try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Submit report to database (existing flow)
      const result = await submitChatMessageReport({
        reportText: report.trim(),
        messageId,
        messageContent,
        messageSender,
        chatSessionId,
        messageMetadata,
      });

      if (result.success) {
        // Store negative feedback in Supermemory (Phase 1.1)
        try {
          const BASE_URL =
            process.env.EXPO_PUBLIC_APP_BASE_URL ||
            "https://financify-rose.vercel.app";

          await authenticatedFetch(`${BASE_URL}/api/memory`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "message_feedback",
              messageId,
              feedbackType: "negative",
              finnyResponse: messageContent,
              userMessage: userMessage || "Unknown user message",
              messageMetadata: messageMetadata || {},
              reportText: report.trim(),
            }),
          });

          console.log("✅ Negative feedback stored in Supermemory");
        } catch (error) {
          console.error(
            "Error storing negative feedback in Supermemory:",
            error
          );
          // Non-critical, don't break user experience
        }

        Alert.alert(
          "Thank You!",
          "Your report has been submitted successfully. We'll review it shortly.",
          [
            {
              text: "OK",
              onPress: () => {
                setReport("");
                onClose();
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Error",
          result.error || "Failed to submit report. Please try again."
        );
      }
    } catch (error: any) {
      console.error("Error submitting report:", error);
      Alert.alert("Error", "Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Report Message</Text>
            <IconButton onPress={onClose} icon="close" size={22} />
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>What's wrong with this message?</Text>
              <TextInput
                style={styles.reportInput}
                value={report}
                onChangeText={setReport}
                placeholder="Please describe why you're reporting this message..."
                placeholderTextColor="#666"
                multiline
                textAlignVertical="top"
                numberOfLines={8}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <AntDesign
                    name="check"
                    size={20}
                    color="#fff"
                    style={styles.submitIcon}
                  />
                  <Text style={styles.submitText}>Submit Report</Text>
                </>
              )}
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
    padding: 32,
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
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 12,
  },
  label: {
    fontSize: 18,
    fontWeight: "500",
    color: "#fff",
    marginLeft: 4,
  },
  reportInput: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    color: "#fff",
    fontSize: 16,
    minHeight: 160,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  submitButton: {
    backgroundColor: "rgba(74, 144, 226, 0.9)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    padding: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitIcon: {
    marginRight: 8,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
