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
import {
  getCategoryDisplayName,
  getCategoryIcon,
  getCategoryColor,
  calculateProgressPercentage,
  formatGoalProgress,
  GoalCategory,
  getCategoryOptions,
} from "../../src/utils/goalCategories";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface GoalDetailModalProps {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (goal: Goal) => void;
  onEdit?: (id: string, updates: Partial<Goal>) => void;
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
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [localProgressAmount, setLocalProgressAmount] = useState<number>(0);

  React.useEffect(() => {
    if (goal) {
      setEditedGoal(goal);
      // Set the selected date based on goal's target_date
      const date = new Date(goal.target_date);
      setSelectedDate(date);
      // Initialize local progress amount
      setLocalProgressAmount(goal.current_amount || 0);
    }
  }, [goal]);

  // Check if progress has been changed
  const hasProgressChanged =
    goal && localProgressAmount !== (goal.current_amount || 0);

  const handleClose = () => {
    // Save progress changes before closing
    if (onEdit && goal && localProgressAmount !== (goal.current_amount || 0)) {
      onEdit(goal.id, { current_amount: localProgressAmount });
    }
    onClose();
  };

  if (!goal || !editedGoal) return null;

  const handleSave = () => {
    if (onEdit && editedGoal && goal) {
      const updates: Partial<Goal> = {
        label: editedGoal.label.trim(),
        note: editedGoal.note?.trim() || undefined,
        target_amount: editedGoal.target_amount,
        current_amount: editedGoal.current_amount,
        target_date: selectedDate.toISOString().split("T")[0],
        category: editedGoal.category,
        status: editedGoal.status,
      };

      // Only save if there are actual changes
      const hasChanges = Object.keys(updates).some((key) => {
        const updateKey = key as keyof Goal;
        return updates[updateKey] !== goal[updateKey];
      });

      if (hasChanges) {
        onEdit(goal.id, updates);
      }

      setIsEditing(false);
    }
  };

  const renderProgressSection = () => {
    const targetAmount = goal.target_amount || 0;

    return (
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Current Progress</Text>
          <Text style={styles.progressAmount}>
            of ${targetAmount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.progressInputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.progressInput}
            value={String(localProgressAmount)}
            onChangeText={(text) => {
              const newAmount = Math.max(0, parseFloat(text) || 0);
              setLocalProgressAmount(newAmount);
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#666"
          />
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["rgba(31, 31, 31, 0.98)", "rgba(18, 18, 18, 0.99)"]}
              style={styles.content}
            >
              <View style={styles.header}>
                <View style={styles.headerTextContainer}>
                  <Text style={styles.headerTitle}>
                    {isEditing ? `Edit Goal` : goal.label}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeButton}
                >
                  <View
                    style={[
                      styles.closeButtonCircle,
                      hasProgressChanged && styles.closeButtonCircleUpdated,
                    ]}
                  >
                    <Ionicons
                      name={hasProgressChanged ? "checkmark" : "close"}
                      size={18}
                      color={hasProgressChanged ? "#fff" : "#888"}
                    />
                  </View>
                </TouchableOpacity>
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

                {!isEditing && (
                  <>
                    <View style={styles.infoSection}>
                      <View style={styles.topInfoRow}>
                        <View style={styles.targetSection}>
                          <Text style={styles.targetLabel}>TARGET</Text>
                          <Text style={styles.targetAmountMain}>
                            ${(goal.target_amount || 0).toLocaleString()}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                goal.status === "completed"
                                  ? "#32D74B"
                                  : goal.status === "paused"
                                  ? "#FF9500"
                                  : "#4A90E2",
                            },
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {goal.status.charAt(0).toUpperCase() +
                              goal.status.slice(1)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.categoryDateRow}>
                        <View
                          style={[
                            styles.categoryDisplay,
                            {
                              backgroundColor:
                                getCategoryOptions().find(
                                  (c) => c.value === goal.category
                                )?.backgroundColor || "rgba(255,255,255,0.08)",
                            },
                          ]}
                        >
                          <Text style={styles.categoryEmoji}>
                            {getCategoryOptions().find(
                              (c) => c.value === goal.category
                            )?.emoji || "🎯"}
                          </Text>
                          <Text
                            style={[
                              styles.categoryName,
                              {
                                color:
                                  getCategoryOptions().find(
                                    (c) => c.value === goal.category
                                  )?.color || "#fff",
                              },
                            ]}
                          >
                            {getCategoryDisplayName(goal.category)}
                          </Text>
                        </View>

                        <View style={styles.dateDisplay}>
                          <Text style={styles.detailLabel}>Target Date</Text>
                          <Text style={styles.detailValue}>
                            {new Date(goal.target_date).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </Text>
                        </View>
                      </View>

                      {goal.note && (
                        <View style={styles.noteSection}>
                          <Text style={styles.noteText}>{goal.note}</Text>
                        </View>
                      )}
                    </View>

                    {renderProgressSection()}
                  </>
                )}

                {isEditing && (
                  <View style={styles.editSection}>
                    <View style={styles.editNameRow}>
                      <Text style={styles.editLabel}>Goal Name</Text>
                      <TextInput
                        style={styles.editNameInput}
                        value={editedGoal.label}
                        onChangeText={(text) =>
                          setEditedGoal({
                            ...editedGoal,
                            label: text,
                          })
                        }
                        placeholder="Goal name"
                        placeholderTextColor="#666"
                      />
                    </View>

                    <View style={styles.editRow}>
                      <View style={styles.editField}>
                        <Text style={styles.editLabel}>Target Amount</Text>
                        <View style={styles.editAmountContainer}>
                          <Text style={styles.currencySymbol}>$</Text>
                          <TextInput
                            style={styles.amountInput}
                            value={String(editedGoal.target_amount || 0)}
                            onChangeText={(text) =>
                              setEditedGoal({
                                ...editedGoal,
                                target_amount: parseFloat(text) || 0,
                              })
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#666"
                          />
                        </View>
                      </View>

                      <View style={styles.editField}>
                        <Text style={styles.editLabel}>Category</Text>
                        <TouchableOpacity
                          style={styles.editCategoryButton}
                          onPress={() => setShowCategoryPicker(true)}
                        >
                          <View style={styles.editCategoryContent}>
                            <Text style={styles.editCategoryEmoji}>
                              {getCategoryOptions().find(
                                (c) => c.value === editedGoal.category
                              )?.emoji || "🎯"}
                            </Text>
                            <Text style={styles.editCategoryText}>
                              {getCategoryDisplayName(editedGoal.category)}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-down"
                            size={16}
                            color="#888"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.editDateRow}>
                      <Text style={styles.editLabel}>Target Date</Text>
                      <TouchableOpacity
                        style={styles.editDateButton}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Text style={styles.editDateText}>
                          {selectedDate.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Text>
                        <Ionicons name="calendar" size={16} color="#4A90E2" />
                      </TouchableOpacity>
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
                          handleClose();
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
                <Modal
                  visible={showDatePicker}
                  transparent
                  animationType="slide"
                  onRequestClose={() => setShowDatePicker(false)}
                >
                  <TouchableWithoutFeedback
                    onPress={() => setShowDatePicker(false)}
                  >
                    <View style={styles.datePickerOverlay}>
                      <TouchableWithoutFeedback
                        onPress={(e) => e.stopPropagation()}
                      >
                        <View style={styles.datePickerModal}>
                          <View style={styles.datePickerHeader}>
                            <TouchableOpacity
                              onPress={() => setShowDatePicker(false)}
                            >
                              <Text style={styles.datePickerCancel}>
                                Cancel
                              </Text>
                            </TouchableOpacity>
                            <Text style={styles.datePickerTitle}>
                              Select Date
                            </Text>
                            <TouchableOpacity
                              onPress={() => setShowDatePicker(false)}
                            >
                              <Text style={styles.datePickerDone}>Done</Text>
                            </TouchableOpacity>
                          </View>
                          <View style={styles.datePickerContent}>
                            <DateTimePicker
                              value={selectedDate}
                              mode="date"
                              display="spinner"
                              onChange={(event, date) => {
                                if (date) {
                                  setSelectedDate(date);
                                }
                              }}
                              minimumDate={new Date()}
                              textColor="#fff"
                              style={styles.datePickerSpinner}
                            />
                          </View>
                        </View>
                      </TouchableWithoutFeedback>
                    </View>
                  </TouchableWithoutFeedback>
                </Modal>
              )}
            </LinearGradient>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      {showCategoryPicker && (
        <Modal
          visible={showCategoryPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCategoryPicker(false)}
        >
          <TouchableWithoutFeedback
            onPress={() => setShowCategoryPicker(false)}
          >
            <View style={styles.categoryModalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.categoryModalContent}>
                  <View style={styles.categoryGrid}>
                    {getCategoryOptions().map((category) => (
                      <TouchableOpacity
                        key={category.value}
                        style={[
                          styles.categoryGridItem,
                          {
                            backgroundColor: category.backgroundColor,
                            borderColor:
                              editedGoal?.category === category.value
                                ? category.color
                                : category.color + "40",
                            borderWidth:
                              editedGoal?.category === category.value ? 2 : 1,
                          },
                        ]}
                        onPress={() => {
                          setEditedGoal((prev) =>
                            prev ? { ...prev, category: category.value } : null
                          );
                          setShowCategoryPicker(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.categoryGridEmoji}>
                          {category.emoji}
                        </Text>
                        <Text
                          style={[
                            styles.categoryGridText,
                            {
                              color:
                                editedGoal?.category === category.value
                                  ? category.color
                                  : "#333",
                              fontWeight:
                                editedGoal?.category === category.value
                                  ? "700"
                                  : "600",
                            },
                          ]}
                        >
                          {category.label}
                        </Text>
                        {editedGoal?.category === category.value && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={category.color}
                            style={styles.categoryGridCheckmark}
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
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
    padding: 4,
  },
  closeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonCircleUpdated: {
    backgroundColor: "rgba(17, 18, 17, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(50, 215, 75, 0.3)",
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
    paddingRight: 5,
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
  categoryDisplay: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    alignSelf: "flex-start",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // New redesigned styles
  topInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  targetSection: {
    alignItems: "flex-start",
  },
  targetLabel: {
    fontSize: 10,
    color: "#888",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  targetAmountMain: {
    fontSize: 24,
    color: "#fff",
    fontWeight: "700",
  },
  detailsRow: {
    marginBottom: 16,
  },
  detailItem: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  categoryDateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  dateDisplay: {
    alignItems: "flex-end",
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "500",
  },
  // Edit section styles
  editSection: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  editNameRow: {
    marginBottom: 20,
  },
  editNameInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
  },
  editField: {
    flex: 1,
  },
  editLabel: {
    fontSize: 12,
    color: "#888",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editCategoryButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editCategoryContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editCategoryEmoji: {
    fontSize: 16,
  },
  editCategoryText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  editDateRow: {
    marginBottom: 0,
  },
  editDateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  editDateText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "500",
  },
  // Category modal styles
  categoryModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  categoryModalContent: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingVertical: 20,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 20,
  },
  categoryGridItem: {
    borderRadius: 14,
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
    maxWidth: 200,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 2,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  categoryGridEmoji: {
    fontSize: 16,
    marginRight: 6,
    textAlign: "center",
    minWidth: 16,
  },
  categoryGridText: {
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
    flexShrink: 1,
    flexGrow: 0,
  },
  categoryGridCheckmark: {
    marginLeft: 6,
    opacity: 0.9,
  },
  // Date picker modal styles
  datePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  datePickerModal: {
    backgroundColor: "#2a2a2a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    minHeight: 280,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#2a2a2a",
  },
  datePickerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  datePickerCancel: {
    fontSize: 16,
    color: "#888",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  datePickerDone: {
    fontSize: 16,
    color: "#4A90E2",
    fontWeight: "600",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  datePickerSpinner: {
    width: "100%",
    height: 180,
    backgroundColor: "transparent",
  },
  descriptionSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  descriptionText: {
    fontSize: 14,
    color: "#ccc",
    lineHeight: 20,
    marginTop: 4,
  },
  noteSection: {
    marginTop: 1,
    marginLeft: 8,
  },
  noteText: {
    fontSize: 14,
    color: "#ccc",
    lineHeight: 20,
    marginTop: 4,
  },
});

export default GoalDetailModal;
