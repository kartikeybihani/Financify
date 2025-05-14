import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Goal } from "../types/finny";

interface GoalDetailModalProps {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (goal: Goal) => void;
  onEdit?: (goal: Goal) => void;
}

const GoalDetailModal: React.FC<GoalDetailModalProps> = ({
  goal,
  visible,
  onClose,
  onDelete,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedGoal, setEditedGoal] = useState<Goal | null>(null);

  React.useEffect(() => {
    if (goal) {
      setEditedGoal(goal);
    }
  }, [goal]);

  if (!goal || !editedGoal) return null;

  const handleSave = () => {
    if (onEdit && editedGoal) {
      onEdit(editedGoal);
      setIsEditing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={["rgba(31, 31, 31, 0.95)", "rgba(18, 18, 18, 0.98)"]}
          style={styles.content}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.titleContainer}>
                <View style={styles.iconContainer}>
                  <Ionicons name="flag" size={20} color="#4A90E2" />
                </View>
                {isEditing ? (
                  <TextInput
                    style={styles.titleInput}
                    value={editedGoal.label}
                    onChangeText={(text) =>
                      setEditedGoal({ ...editedGoal, label: text })
                    }
                    placeholder="Goal Name"
                    placeholderTextColor="#666"
                  />
                ) : (
                  <Text style={styles.title}>{goal.label}</Text>
                )}
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Timeline</Text>
              <View style={styles.timelineContainer}>
                <Ionicons name="calendar-outline" size={20} color="#4A90E2" />
                <Text style={styles.sectionText}>
                  {`${goal.timeline.month} ${goal.timeline.year}`}
                </Text>
              </View>
            </View>

            {typeof goal.progress === "number" && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Progress</Text>
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <LinearGradient
                      colors={
                        goal.progress >= 100
                          ? ["#4CD964", "#32D74B"]
                          : ["#4A90E2", "#357ABD"]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.progressFill,
                        { width: `${goal.progress}%` },
                      ]}
                    />
                  </View>
                  {isEditing ? (
                    <TextInput
                      style={styles.progressInput}
                      value={String(editedGoal.progress)}
                      onChangeText={(text) =>
                        setEditedGoal({
                          ...editedGoal,
                          progress: parseInt(text) || 0,
                        })
                      }
                      keyboardType="numeric"
                      maxLength={3}
                    />
                  ) : (
                    <Text style={styles.progressText}>{goal.progress}%</Text>
                  )}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <View style={styles.descriptionContainer}>
                {isEditing ? (
                  <TextInput
                    style={styles.descriptionInput}
                    value={editedGoal.description}
                    onChangeText={(text) =>
                      setEditedGoal({ ...editedGoal, description: text })
                    }
                    multiline
                    placeholder="Enter goal description"
                    placeholderTextColor="#666"
                  />
                ) : (
                  <Text style={styles.description}>{goal.description}</Text>
                )}
              </View>
            </View>

            <View style={styles.buttonContainer}>
              {isEditing ? (
                <>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => {
                      setIsEditing(false);
                      setEditedGoal(goal);
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.saveButton]}
                    onPress={handleSave}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Save</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.button, styles.editButton]}
                    onPress={() => setIsEditing(true)}
                  >
                    <Ionicons name="pencil" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Edit Goal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.deleteButton]}
                    onPress={() => {
                      onDelete(goal);
                      onClose();
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Delete Goal</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    padding: 8,
    borderRadius: 10,
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    borderBottomWidth: 1,
    borderBottomColor: "#4A90E2",
    paddingBottom: 4,
  },
  closeButton: {
    padding: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#888",
    marginBottom: 12,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  timelineContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    padding: 12,
    borderRadius: 12,
  },
  sectionText: {
    fontSize: 16,
    color: "#fff",
    marginLeft: 10,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  descriptionContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  description: {
    fontSize: 15,
    color: "#fff",
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  descriptionInput: {
    fontSize: 15,
    color: "#fff",
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    minHeight: 100,
    textAlignVertical: "top",
  },
  progressContainer: {
    marginVertical: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 15,
    color: "#fff",
    marginTop: 6,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  progressInput: {
    fontSize: 15,
    color: "#fff",
    marginTop: 6,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    borderBottomWidth: 1,
    borderBottomColor: "#4A90E2",
    paddingBottom: 4,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editButton: {
    backgroundColor: "#4A90E2",
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
  },
  saveButton: {
    backgroundColor: "#32D74B",
  },
  cancelButton: {
    backgroundColor: "#8E8E93",
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
});

export default GoalDetailModal;
