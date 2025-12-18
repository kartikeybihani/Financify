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
import { LinearGradient } from "expo-linear-gradient";
import IconButton from "../shared/IconButton";

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
            <IconButton onPress={onCancel} icon="close" size={24} />
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
            <TouchableOpacity onPress={onCancel} activeOpacity={0.7}>
              <LinearGradient
                colors={[
                  "rgba(255, 255, 255, 0.15)",
                  "rgba(255, 255, 255, 0.08)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSave}
              disabled={!editText.trim() || isSaving}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={["#4A90E2", "#5BA3F5", "#6BB6FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.modalButton,
                  styles.saveButton,
                  (!editText.trim() || isSaving) && styles.disabledButton,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </LinearGradient>
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
    borderRadius: 20,
    minWidth: 80,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 0,
  },
  cancelButtonText: {
    color: "#E0E0E0",
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
    letterSpacing: 0.3,
  },
  saveButton: {
    shadowColor: "#4A90E2",
    shadowOpacity: 0.4,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: responsiveFontSize(14),
    fontWeight: "600" as const,
    letterSpacing: 0.3,
  },
  disabledButton: {
    opacity: 0.5,
  },
};
