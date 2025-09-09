import React, { useState, useRef, useEffect } from "react";
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
  Animated,
  Alert,
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
  onOptimisticUpdate?: (updatedGoal: Goal) => void;
}

const GoalDetailModal: React.FC<GoalDetailModalProps> = ({
  goal,
  visible,
  onClose,
  onDelete,
  onEdit,
  onOptimisticUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedGoal, setEditedGoal] = useState<Goal | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [localProgressAmount, setLocalProgressAmount] = useState<number>(0);
  const [showNoteField, setShowNoteField] = useState(false);

  // Animation refs
  const noteAnimation = useRef(new Animated.Value(0)).current;
  const noteHeightAnimation = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (goal) {
      setEditedGoal(goal);
      // Set the selected date based on goal's target_date
      const date = new Date(goal.target_date);
      setSelectedDate(date);
      // Initialize local progress amount
      setLocalProgressAmount(goal.current_amount || 0);
      // Initialize note field visibility based on whether goal has a note
      setShowNoteField(!!goal.note);
      // Reset animations when goal changes
      noteAnimation.setValue(goal.note ? 1 : 0);
      noteHeightAnimation.setValue(goal.note ? 1 : 0);
    }
  }, [goal]);

  // Animate note field when showNoteField changes
  useEffect(() => {
    if (showNoteField) {
      // Animate in
      Animated.parallel([
        Animated.timing(noteHeightAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false, // Height animation can't use native driver
        }),
        Animated.timing(noteAnimation, {
          toValue: 1,
          duration: 300,
          delay: 100, // Slight delay for smoother effect
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(noteAnimation, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(noteHeightAnimation, {
          toValue: 0,
          duration: 300,
          delay: 50, // Slight delay for smoother collapse
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [showNoteField]);

  // Check if progress has been changed
  const hasProgressChanged =
    goal && localProgressAmount !== (goal.current_amount || 0);

  const handleClose = () => {
    // If in editing mode, first exit editing mode
    if (isEditing) {
      setIsEditing(false);
      setEditedGoal(goal);
      // Reset note field state
      setShowNoteField(!!goal?.note);
      noteAnimation.setValue(goal?.note ? 1 : 0);
      noteHeightAnimation.setValue(goal?.note ? 1 : 0);
      onClose();
      return;
    }

    // Save progress changes before closing
    if (onEdit && goal && localProgressAmount !== (goal.current_amount || 0)) {
      onEdit(goal.id, { current_amount: localProgressAmount });
    }
    onClose();
  };

  if (!goal || !editedGoal) return null;

  const handleSave = async () => {
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
        // Create optimistically updated goal
        const optimisticGoal: Goal = {
          ...goal,
          ...updates,
          updated_at: new Date().toISOString(),
        };

        // Optimistic update: Update UI immediately
        if (onOptimisticUpdate) {
          onOptimisticUpdate(optimisticGoal);
        }

        // Exit editing mode immediately for better UX
        setIsEditing(false);

        try {
          // Update database in background
          await onEdit(goal.id, updates);
        } catch (error) {
          // If database update fails, we could revert or show error
          // For now, the parent component handles error states
          console.error("Failed to update goal:", error);

          // Could implement revert logic here if needed
          // if (onOptimisticUpdate) {
          //   onOptimisticUpdate(goal); // Revert to original
          // }
        }
      } else {
        // No changes, just exit editing mode
        setIsEditing(false);
      }
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

                {/* Header actions */}
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
                      name={hasProgressChanged ? "checkmark-outline" : "close"}
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

                    {/* Note editing section */}
                    {!showNoteField ? (
                      <TouchableOpacity
                        style={styles.addNoteButton}
                        onPress={() => setShowNoteField(true)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="add-circle-outline"
                          size={18}
                          color="#4A90E2"
                        />
                        <Text style={styles.addNoteText}>Add note</Text>
                      </TouchableOpacity>
                    ) : (
                      <Animated.View
                        style={[
                          styles.editNoteSection,
                          {
                            maxHeight: noteHeightAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 200], // Adjust based on content height
                            }),
                            overflow: "hidden", // Ensure content clips during animation
                          },
                        ]}
                      >
                        <Animated.View
                          style={{
                            opacity: noteAnimation,
                            transform: [
                              {
                                translateY: noteAnimation.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [-10, 0],
                                }),
                              },
                            ],
                          }}
                        >
                          <View style={styles.noteHeader}>
                            <Text style={styles.editLabel}>
                              Note (Optional)
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                setShowNoteField(false);
                                setEditedGoal((prev) =>
                                  prev ? { ...prev, note: undefined } : null
                                );
                              }}
                              style={styles.removeNoteButton}
                            >
                              <Ionicons
                                name="close-circle"
                                size={16}
                                color="#888"
                              />
                            </TouchableOpacity>
                          </View>
                          <Animated.View
                            style={{
                              transform: [
                                {
                                  scale: noteAnimation.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.95, 1],
                                  }),
                                },
                              ],
                            }}
                          >
                            <TextInput
                              style={styles.editNoteInput}
                              value={editedGoal?.note || ""}
                              onChangeText={(text) =>
                                setEditedGoal((prev) =>
                                  prev ? { ...prev, note: text } : null
                                )
                              }
                              placeholder="Add a note about this goal..."
                              placeholderTextColor="#666"
                              multiline
                              textAlignVertical="top"
                              maxLength={200}
                            />
                          </Animated.View>
                        </Animated.View>
                      </Animated.View>
                    )}
                  </View>
                )}
              </ScrollView>

              {/* Bottom action buttons */}
              {!isEditing ? (
                <View style={styles.bottomButtonRow}>
                  <TouchableOpacity
                    style={styles.bottomEditButton}
                    onPress={() => setIsEditing(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="pencil" size={19} color="#4A90E2" />
                    <Text
                      style={[styles.bottomButtonText, { color: "#4A90E2" }]}
                    >
                      Edit Goal
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.bottomDeleteButton}
                    onPress={() => {
                      Alert.alert(
                        "Delete Goal",
                        `Are you sure you want to delete "${goal.label}"? This action cannot be undone.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => {
                              onDelete(goal);
                              handleClose();
                            },
                          },
                        ]
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-sharp" size={19} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.bottomButtonRow}>
                  <TouchableOpacity
                    style={styles.bottomCancelButton}
                    onPress={() => {
                      setIsEditing(false);
                      setEditedGoal(goal);
                      setShowNoteField(!!goal?.note);
                      noteAnimation.setValue(goal?.note ? 1 : 0);
                      noteHeightAnimation.setValue(goal?.note ? 1 : 0);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle" size={16} color="#8E8E93" />
                    <Text
                      style={[styles.bottomButtonText, { color: "#8E8E93" }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.bottomSaveButton}
                    onPress={handleSave}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#32D74B"
                    />
                    <Text
                      style={[styles.bottomButtonText, { color: "#32D74B" }]}
                    >
                      Save Changes
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomButtonRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 20,
    marginTop: 5,
    gap: 12,
  },
  bottomEditButton: {
    flex: 0.83,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: "rgba(74, 144, 226, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    gap: 8,
  },
  bottomDeleteButton: {
    flex: 0.17,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "rgba(255, 59, 48, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.2)",
  },
  bottomCancelButton: {
    flex: 0.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: "rgba(142, 142, 147, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(142, 142, 147, 0.2)",
    gap: 8,
  },
  bottomSaveButton: {
    flex: 0.6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: "rgba(50, 215, 75, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(50, 215, 75, 0.2)",
    gap: 8,
  },
  bottomButtonText: {
    fontSize: 16,
    fontWeight: "500",
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
    marginBottom: 5,
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
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
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
    marginBottom: 0,
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
  // Note editing styles
  addNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    gap: 8,
    alignSelf: "flex-start",
  },
  addNoteText: {
    color: "#4A90E2",
    fontSize: 14,
    fontWeight: "500",
  },
  editNoteSection: {
    marginTop: 12,
  },
  noteHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  removeNoteButton: {
    padding: 4,
  },
  editNoteInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    minHeight: 80,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    textAlignVertical: "top",
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
