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
  Dimensions,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Goal } from "../types/finny";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const getMonthNumber = (monthName: string): number => {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months.indexOf(monthName);
};

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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  React.useEffect(() => {
    if (goal) {
      setEditedGoal(goal);
      // Set the selected date based on goal's timeline
      const date = new Date();
      const monthIndex = getMonthNumber(goal.timeline.month);
      date.setMonth(monthIndex);
      date.setFullYear(goal.timeline.year);
      setSelectedDate(date);
    }
  }, [goal]);

  if (!goal || !editedGoal) return null;

  const handleSave = () => {
    if (onEdit && editedGoal) {
      const month = selectedDate.toLocaleString("default", { month: "long" });
      const year = selectedDate.getFullYear();

      // Create a complete updated goal object with all fields
      const updatedGoal: Goal = {
        ...editedGoal,
        label: editedGoal.label.trim(),
        target: editedGoal.target || 0,
        progress: editedGoal.progress || 0,
        timeline: {
          month,
          year,
        },
      };

      // Only save if there are actual changes
      if (
        updatedGoal.label !== goal.label ||
        updatedGoal.target !== goal.target ||
        updatedGoal.progress !== goal.progress ||
        updatedGoal.timeline.month !== goal.timeline.month ||
        updatedGoal.timeline.year !== goal.timeline.year
      ) {
        onEdit(updatedGoal);
      }

      setIsEditing(false);
    }
  };

  const renderProgressBar = () => {
    const progress = goal.progress || 0;
    const target = goal.target || 0;
    const currentAmount = (progress / 100) * target;

    return (
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Progress</Text>
          <Text style={styles.progressAmount}>
            ${currentAmount.toLocaleString()} of ${target.toLocaleString()}
          </Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            <LinearGradient
              colors={
                progress >= 100
                  ? ["#4CD964", "#32D74B"]
                  : ["#4A90E2", "#357ABD"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progress}%` }]}
            />
          </View>
          <Text style={styles.progressPercentage}>{progress}%</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["rgba(31, 31, 31, 0.98)", "rgba(18, 18, 18, 0.99)"]}
              style={styles.content}
            >
              <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
                <View style={styles.headerTextContainer}>
                  <Text style={styles.headerTitle}>
                    {isEditing ? `Edit Goal` : goal.label}
                  </Text>
                </View>
                <View style={{ width: 40 }} />
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {/* {isEditing && (
                  <View style={styles.goalTitleSection}>
                    <TextInput
                      style={styles.titleInput}
                      value={editedGoal.label}
                      onChangeText={(text) =>
                        setEditedGoal({ ...editedGoal, label: text })
                      }
                      placeholder="Goal Name"
                      placeholderTextColor="#666"
                    />
                  </View>
                )} */}

                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Target Amount</Text>
                      {isEditing ? (
                        <View style={styles.editAmountContainer}>
                          <Text style={styles.currencySymbol}>$</Text>
                          <TextInput
                            style={styles.amountInput}
                            value={String(editedGoal.target || 0)}
                            onChangeText={(text) =>
                              setEditedGoal({
                                ...editedGoal,
                                target: parseFloat(text) || 0,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#666"
                          />
                        </View>
                      ) : (
                        <Text style={styles.infoValue}>
                          ${(goal.target || 0).toLocaleString()}
                        </Text>
                      )}
                    </View>

                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Target Date</Text>
                      {isEditing ? (
                        <TouchableOpacity
                          style={styles.dateButton}
                          onPress={() => setShowDatePicker(true)}
                        >
                          <Text style={styles.dateButtonText}>
                            {selectedDate.toLocaleString("default", {
                              month: "long",
                              year: "numeric",
                            })}
                          </Text>
                          <Ionicons name="calendar" size={20} color="#4A90E2" />
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.infoValue}>
                          {`${goal.timeline.month} ${goal.timeline.year}`}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {renderProgressBar()}

                {isEditing && (
                  <View style={styles.editProgressSection}>
                    <Text style={styles.editProgressLabel}>
                      Update Progress
                    </Text>
                    <View style={styles.progressInputContainer}>
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
                      <Text style={styles.progressSymbol}>%</Text>
                    </View>
                  </View>
                )}

                <View style={styles.actionButtons}>
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
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#fff"
                        />
                        <Text style={styles.buttonText}>Save Changes</Text>
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
                        <Text style={styles.buttonText}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </ScrollView>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (date) {
                      setSelectedDate(date);
                    }
                  }}
                  minimumDate={new Date()}
                  textColor="#fff"
                  style={
                    Platform.OS === "ios" ? styles.datePickerIOS : undefined
                  }
                />
              )}
            </LinearGradient>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
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
    minHeight: "50%",
    maxHeight: "75%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  scrollContent: {
    padding: 20,
  },
  goalTitleSection: {
    marginBottom: 24,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#4A90E2",
    paddingBottom: 8,
  },
  infoSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  editAmountContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    height: 40,
  },
  currencySymbol: {
    fontSize: 18,
    color: "#888",
    paddingLeft: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    color: "#fff",
    paddingHorizontal: 8,
  },
  dateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 10,
    borderRadius: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  datePickerIOS: {
    backgroundColor: "#2a2a2a",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  progressSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 14,
    color: "#888",
  },
  progressAmount: {
    fontSize: 14,
    color: "#fff",
  },
  progressBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 14,
    color: "#fff",
    minWidth: 45,
    textAlign: "right",
  },
  editProgressSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  editProgressLabel: {
    fontSize: 14,
    color: "#888",
    marginBottom: 12,
  },
  progressInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    height: 40,
    paddingHorizontal: 12,
  },
  progressInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  progressSymbol: {
    fontSize: 16,
    color: "#888",
    marginLeft: 4,
  },
  actionButtons: {
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
  },
});

export default GoalDetailModal;
