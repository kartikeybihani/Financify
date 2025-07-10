import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

interface GoalConfirmationModalProps {
  visible: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

export default function GoalConfirmationModal({
  visible,
  onConfirm,
  onDecline,
}: GoalConfirmationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient
            colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.messageBubble}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="flag" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.messageText}>
              Hmm, sounds like you're thinking about saving for something. Want
              to turn this into a goal I can track for you?
            </Text>
          </LinearGradient>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#4CD964", "#34C759"]}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Yes</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#FF3B30", "#FF2D55"]}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Not Yet</Text>
              </LinearGradient>
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  container: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  messageBubble: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    fontWeight: "400",
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
});
