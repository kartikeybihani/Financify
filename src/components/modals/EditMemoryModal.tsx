import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width: screenWidth } = Dimensions.get("window");

// Responsive calculations
const isSmallScreen = screenWidth < 375;
const isLargeScreen = screenWidth >= 414;

const responsiveFontSize = (baseSize: number) => {
  if (isSmallScreen) return baseSize * 0.9;
  if (isLargeScreen) return baseSize * 1.1;
  return baseSize;
};

const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.8;
  if (isLargeScreen) return basePadding * 1.2;
  return basePadding;
};

interface EditMemoryModalProps {
  visible: boolean;
  editText: string;
  onTextChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export default function EditMemoryModal({
  visible,
  editText,
  onTextChange,
  onSave,
  onCancel,
  isSaving = false,
}: EditMemoryModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Memory</Text>
            <TouchableOpacity
              onPress={onCancel}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={onTextChange}
            multiline
            numberOfLines={6}
            placeholder="Enter memory text..."
            placeholderTextColor="rgba(255, 255, 255, 0.5)"
            autoFocus
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton]}
              onPress={onSave}
              disabled={!editText.trim() || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: responsivePadding(20),
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: responsivePadding(20),
    width: screenWidth * 0.9,
    maxWidth: 500,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: responsivePadding(16),
  },
  modalTitle: {
    fontSize: responsiveFontSize(20),
    fontWeight: "600" as const,
    color: "#fff",
  },
  modalCloseButton: {
    padding: 4,
  },
  editInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    padding: responsivePadding(12),
    color: "#fff",
    fontSize: responsiveFontSize(14),
    minHeight: 120,
    textAlignVertical: "top" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginBottom: responsivePadding(16),
  },
  modalActions: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    gap: 12,
  },
  modalButton: {
    paddingVertical: responsivePadding(10),
    paddingHorizontal: responsivePadding(20),
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cancelButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
  },
  saveButton: {
    backgroundColor: "#4A90E2",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
  },
};
