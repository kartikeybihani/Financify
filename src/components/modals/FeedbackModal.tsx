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
import { Ionicons, AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { submitGeneralFeedback } from "@/src/utils/reports";

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  userName: string;
}

export default function FeedbackModal({
  visible,
  onClose,
  userName,
}: FeedbackModalProps) {
  const [name, setName] = useState(userName || "");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setName(userName || "");
  }, [visible, userName]);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      Alert.alert("Error", "Please provide your feedback");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitGeneralFeedback({
        reportText: feedback.trim(),
        userName: name.trim() || undefined,
      });

      if (result.success) {
        Alert.alert(
          "Thank You!",
          "Your feedback has been submitted successfully. We appreciate your input!",
          [
            {
              text: "OK",
              onPress: () => {
                setFeedback("");
                onClose();
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Error",
          result.error || "Failed to submit feedback. Please try again."
        );
      }
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      Alert.alert("Error", "Failed to submit feedback. Please try again.");
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
            <Text style={styles.title}>Send Feedback</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={[
                  "rgba(255, 255, 255, 0.15)",
                  "rgba(255, 255, 255, 0.05)",
                ]}
                style={styles.closeButtonCircle}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Name (Optional)</Text>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#666"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Feedback</Text>
              <TextInput
                style={styles.feedbackInput}
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Share your thoughts, suggestions, or report issues..."
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
                  <Text style={styles.submitText}>Submit Feedback</Text>
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
  closeButton: {
    padding: 8,
  },
  closeButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
    color: "#888",
    marginLeft: 4,
  },
  nameInput: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    color: "#fff",
    fontSize: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  feedbackInput: {
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
