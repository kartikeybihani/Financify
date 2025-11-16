import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import IconButton from "@/src/components/shared/IconButton";

interface AccountActionAlertProps {
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
  accountName: string;
}

export default function AccountActionAlert({
  visible,
  onClose,
  onDelete,
  accountName,
}: AccountActionAlertProps) {
  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.container}>
              {/* Close Button */}
              <IconButton
                onPress={onClose}
                icon="close"
                size={20}
                style={styles.closeButton}
              />

              {/* Warning Header */}
              <View style={styles.headerContainer}>
                <View style={styles.warningIconContainer}>
                  <Ionicons name="warning-outline" size={32} color="#ff6b6b" />
                </View>
                <Text style={styles.headerTitle}>Delete Account</Text>
                <Text style={styles.headerSubtitle}>
                  This action cannot be undone
                </Text>
              </View>

              {/* Account Info */}
              <View style={styles.accountInfoContainer}>
                <Text style={styles.accountLabel}>Account to be deleted:</Text>
                <Text style={styles.accountName}>{accountName}</Text>
              </View>

              {/* Warning Message */}
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>
                  Deleting this account will remove:
                </Text>
                <View style={styles.warningList}>
                  <View style={styles.warningListItem}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="rgba(255, 107, 107, 0.8)"
                    />
                    <Text style={styles.warningListText}>
                      All transaction history
                    </Text>
                  </View>
                  <View style={styles.warningListItem}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="rgba(255, 107, 107, 0.8)"
                    />
                    <Text style={styles.warningListText}>
                      Recurring payment streams
                    </Text>
                  </View>
                  <View style={styles.warningListItem}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="rgba(255, 107, 107, 0.8)"
                    />
                    <Text style={styles.warningListText}>
                      Connection to your bank
                    </Text>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsContainer}>
                {/* Delete Button */}
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={["#ff6b6b", "#ee5a52"]}
                    style={styles.deleteButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ffffff" />
                    <Text style={styles.deleteButtonText}>Delete Account</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
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
  accountInfoContainer: {
    marginTop: 24,
    marginHorizontal: 24,
    padding: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  accountLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  accountName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  warningContainer: {
    marginTop: 20,
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
