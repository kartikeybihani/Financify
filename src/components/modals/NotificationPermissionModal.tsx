import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

interface NotificationPermissionModalProps {
  visible: boolean;
  onAllow: () => void;
  onDontAllow: () => void;
}

export default function NotificationPermissionModal({
  visible,
  onAllow,
  onDontAllow,
}: NotificationPermissionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDontAllow}
    >
      <View style={styles.container}>
        <View style={styles.modalContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="notifications-outline" size={48} color="#4A90E2" />
          </View>

          <Text style={styles.title}>Stay in the loop!</Text>

          <Text style={styles.message}>
            Get helpful reminders and alerts about your money. We'll send you
            the most important updates.
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.dontAllowButton}
              onPress={onDontAllow}
              activeOpacity={0.8}
            >
              <Text style={styles.dontAllowButtonText}>Don't Allow</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.allowButton}
              onPress={onAllow}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={["#4A90E2", "#5DA0F2"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.allowButtonGradient}
              >
                <Text style={styles.allowButtonText}>Allow</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    borderRadius: 24,
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
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    color: "#A0A0A0",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  dontAllowButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  allowButton: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  allowButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dontAllowButtonText: {
    color: "#A0A0A0",
    fontSize: 16,
    fontWeight: "600",
  },
  allowButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
