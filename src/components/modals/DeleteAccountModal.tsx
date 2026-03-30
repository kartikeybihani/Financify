import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import IconButton from "@/src/components/shared/IconButton";

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
}

const WARNING_ITEMS = [
  "All connected bank accounts",
  "All investment accounts",
  "Transaction history & recurring streams",
  "Budgets, goals, and financial insights",
  "Chat history and Finny conversations",
];

export default function DeleteAccountModal({
  visible,
  onClose,
  onDelete,
  isDeleting = false,
}: DeleteAccountModalProps) {
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowFinalConfirmation(false);
    }
  }, [visible]);

  const handleClose = () => {
    if (isDeleting) return;
    setShowFinalConfirmation(false);
    onClose();
  };

  const handleDelete = () => {
    if (isDeleting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    if (!showFinalConfirmation) {
      setShowFinalConfirmation(true);
      return;
    }

    Alert.alert(
      "Delete account permanently?",
      "This will permanently remove your account and financial data. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: onDelete,
        },
      ],
    );
  };

  const handleCancel = () => {
    if (isDeleting) return;
    if (showFinalConfirmation) {
      setShowFinalConfirmation(false);
      return;
    }
    handleClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.container}>
              {/* Close Button */}
              <IconButton
                onPress={handleClose}
                icon="close"
                size={20}
                style={styles.closeButton}
                disabled={isDeleting}
              />

              {/* Warning Header */}
              <View style={styles.headerContainer}>
                <View style={styles.warningIconContainer}>
                  <Ionicons name="trash-outline" size={32} color="#ff6b6b" />
                </View>
                <Text style={styles.headerTitle}>Delete Account</Text>
                <Text style={styles.headerSubtitle}>
                  {showFinalConfirmation
                    ? "Are you sure? This action cannot be undone"
                    : "This action cannot be undone"}
                </Text>
              </View>

              {/* Warning Message */}
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>
                  Deleting your account will permanently remove:
                </Text>
                <View style={styles.warningList}>
                  {WARNING_ITEMS.map((item) => (
                    <View key={item} style={styles.warningListItem}>
                      <Ionicons
                        name="remove-circle"
                        size={16}
                        color="rgba(255, 107, 107, 0.8)"
                      />
                      <Text style={styles.warningListText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsContainer}>
                {/* Delete Button */}
                <TouchableOpacity
                  style={[
                    styles.deleteButton,
                    isDeleting && styles.deleteButtonDisabled,
                  ]}
                  onPress={handleDelete}
                  activeOpacity={0.8}
                  disabled={isDeleting}
                >
                  <LinearGradient
                    colors={
                      isDeleting ? ["#555", "#444"] : ["#ff6b6b", "#ee5a52"]
                    }
                    style={styles.deleteButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ffffff" />
                    <Text style={styles.deleteButtonText}>
                      {isDeleting
                        ? "Deleting..."
                        : showFinalConfirmation
                          ? "Yes, Delete Account"
                          : "Delete Account"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancel}
                  activeOpacity={0.8}
                  disabled={isDeleting}
                >
                  <Text style={styles.cancelButtonText}>
                    {showFinalConfirmation ? "Go Back" : "Cancel"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1,
  },
  headerContainer: {
    alignItems: "center",
    paddingTop: 32,
    paddingHorizontal: 24,
  },
  warningIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
  },
  warningContainer: {
    marginTop: 24,
    marginHorizontal: 24,
  },
  warningText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 12,
    fontWeight: "500",
  },
  warningList: {
    gap: 8,
  },
  warningListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  warningListText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
  },
  actionsContainer: {
    padding: 24,
    gap: 12,
  },
  deleteButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
  },
});
