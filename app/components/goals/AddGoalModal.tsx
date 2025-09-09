import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  StyleSheet,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AddGoalModalProps, GoalInput } from "../../types/addGoalModalTypes";
import { LinearGradient } from "expo-linear-gradient";
import {
  getCategoryOptions,
  GoalCategory,
} from "../../../src/utils/goalCategories";

const initialGoalState: Omit<GoalInput, "target_date" | "category"> = {
  label: "",
  note: "",
  target_amount: 0,
  current_amount: 0,
};

export default function AddGoalModal({
  visible,
  onClose,
  onSave,
}: AddGoalModalProps) {
  // State
  const [goal, setGoal] = useState(initialGoalState);
  const getDefaultDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 6); // 6 months from now
    return date;
  };
  const [selectedDate, setSelectedDate] = useState(getDefaultDate());
  const [selectedCategory, setSelectedCategory] =
    useState<GoalCategory>("other");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showNoteField, setShowNoteField] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isReady, setIsReady] = useState(false);

  const categoryOptions = getCategoryOptions();

  // Animation
  const modalAnimation = useRef(new Animated.Value(0)).current;
  const noteAnimation = useRef(new Animated.Value(0)).current;
  const noteHeightAnimation = useRef(new Animated.Value(0)).current;

  // Effects
  useEffect(() => {
    if (visible) {
      setIsReady(true);
      Animated.spring(modalAnimation, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    } else {
      setIsReady(false);
    }
  }, [visible]);

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setGoal(initialGoalState);
      setSelectedDate(getDefaultDate());
      setSelectedCategory("other");
      setShowNoteField(false);
      setErrors({});
      // Reset note animations
      noteAnimation.setValue(0);
      noteHeightAnimation.setValue(0);
    }
  }, [visible]);

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
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(noteHeightAnimation, {
          toValue: 0,
          duration: 250,
          delay: 50, // Slight delay for smoother collapse
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [showNoteField]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!goal.label.trim()) {
      newErrors.label = "Please enter a goal title";
    }

    if (!goal.target_amount || goal.target_amount <= 0) {
      newErrors.target_amount = "Please enter a valid target amount";
    }

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    const selectedDateCopy = new Date(selectedDate);
    selectedDateCopy.setHours(0, 0, 0, 0);

    if (selectedDateCopy < currentDate) {
      newErrors.date = "Please select a future date";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      onSave({
        label: goal.label.trim(),
        note: goal.note?.trim(),
        target_amount: goal.target_amount,
        current_amount: goal.current_amount || 0,
        target_date: selectedDate.toISOString().split("T")[0], // Convert to YYYY-MM-DD format
        category: selectedCategory,
      });

      onClose();
    }
  };

  if (!visible && !isReady) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keyboardAvoidingView}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <Animated.View
                style={[
                  styles.modalContent,
                  {
                    transform: [
                      {
                        scale: modalAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.95, 1],
                        }),
                      },
                    ],
                    opacity: modalAnimation,
                  },
                ]}
              >
                <LinearGradient
                  colors={["rgba(31, 31, 31, 0.98)", "rgba(18, 18, 18, 0.99)"]}
                  style={styles.modalInner}
                >
                  <View style={styles.header}>
                    <View style={styles.headerTextContainer}>
                      <Text style={styles.headerTitle}>Set a new goal</Text>
                    </View>
                    <TouchableOpacity
                      onPress={onClose}
                      style={styles.closeButton}
                    >
                      <View style={styles.closeButtonCircle}>
                        <Ionicons name="close" size={18} color="#888" />
                      </View>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                  >
                    <View style={[styles.formSection, styles.coreField]}>
                      <Text style={[styles.label, styles.coreLabel]}>
                        Goal Name
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          styles.coreInput,
                          errors.label && styles.inputError,
                        ]}
                        placeholder="Dream vacation, Emergency fund..."
                        placeholderTextColor="#666"
                        value={goal.label}
                        onChangeText={(text) => {
                          setGoal((prev) => ({ ...prev, label: text }));
                          if (errors.label) {
                            setErrors((prev) => ({ ...prev, label: "" }));
                          }
                        }}
                      />
                      {errors.label ? (
                        <Text style={styles.errorText}>{errors.label}</Text>
                      ) : null}
                    </View>

                    <View style={[styles.formSection, styles.coreField]}>
                      <Text style={[styles.label, styles.coreLabel]}>
                        Target Amount
                      </Text>
                      <View
                        style={[
                          styles.amountContainer,
                          styles.coreAmountContainer,
                          errors.target_amount && styles.inputError,
                        ]}
                      >
                        <Text
                          style={[
                            styles.currencySymbol,
                            styles.coreCurrencySymbol,
                          ]}
                        >
                          $
                        </Text>
                        <TextInput
                          style={[styles.amountInput, styles.coreAmountInput]}
                          placeholder="How much do you need?"
                          placeholderTextColor="#666"
                          value={
                            goal.target_amount ? String(goal.target_amount) : ""
                          }
                          onChangeText={(text) => {
                            const target_amount = parseFloat(text) || 0;
                            setGoal((prev) => ({ ...prev, target_amount }));
                            if (errors.target_amount) {
                              setErrors((prev) => ({
                                ...prev,
                                target_amount: "",
                              }));
                            }
                          }}
                          keyboardType="numeric"
                        />
                      </View>
                      {errors.target_amount ? (
                        <Text style={styles.errorText}>
                          {errors.target_amount}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.bottomRow}>
                      <View
                        style={[styles.bottomSection, styles.categorySection]}
                      >
                        <Text style={styles.label}>Category</Text>
                        <TouchableOpacity
                          style={[
                            styles.categoryButton,
                            styles.matchedHeightButton,
                            errors.category && styles.inputError,
                          ]}
                          onPress={() => setShowCategoryPicker(true)}
                        >
                          <View style={styles.categoryContent}>
                            <Text style={styles.categoryButtonEmoji}>
                              {
                                categoryOptions.find(
                                  (c) => c.value === selectedCategory
                                )?.emoji
                              }
                            </Text>
                            <Text style={styles.categoryButtonText}>
                              {
                                categoryOptions.find(
                                  (c) => c.value === selectedCategory
                                )?.label
                              }
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-down"
                            size={16}
                            color="#888"
                          />
                        </TouchableOpacity>
                        {errors.category ? (
                          <Text style={styles.errorText}>
                            {errors.category}
                          </Text>
                        ) : null}
                      </View>

                      <View
                        style={[styles.bottomSection, styles.progressSection]}
                      >
                        <Text style={styles.label}>Current Progress</Text>
                        <View
                          style={[
                            styles.progressContainer,
                            styles.matchedHeightContainer,
                          ]}
                        >
                          <Text style={styles.currencySymbol}>$</Text>
                          <TextInput
                            style={styles.progressInput}
                            placeholder="0"
                            placeholderTextColor="#666"
                            value={goal.current_amount?.toString() || ""}
                            onChangeText={(text) => {
                              const current_amount = Math.max(
                                0,
                                parseFloat(text) || 0
                              );
                              setGoal((prev) => ({ ...prev, current_amount }));
                            }}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.formSection}>
                      <Text style={styles.label}>Target Date</Text>
                      <TouchableOpacity
                        style={[
                          styles.dateButton,
                          errors.date && styles.inputError,
                        ]}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <Text style={styles.dateButtonText}>
                          {selectedDate.toLocaleDateString("en-US", {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </Text>
                        <Ionicons name="calendar" size={20} color="#4A90E2" />
                      </TouchableOpacity>
                      {errors.date ? (
                        <Text style={styles.errorText}>{errors.date}</Text>
                      ) : null}
                    </View>

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
                          styles.formSection,
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
                            <Text style={styles.label}>Note (Optional)</Text>
                            <TouchableOpacity
                              onPress={() => {
                                setShowNoteField(false);
                                setGoal((prev) => ({ ...prev, note: "" }));
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
                              style={[
                                styles.noteInput,
                                errors.note && styles.inputError,
                              ]}
                              placeholder="Why is this important to you? What will achieving this mean?"
                              placeholderTextColor="#666"
                              value={goal.note}
                              onChangeText={(text) => {
                                if (text.length <= 350) {
                                  // ~50 words limit
                                  setGoal((prev) => ({ ...prev, note: text }));
                                  if (errors.note) {
                                    setErrors((prev) => ({
                                      ...prev,
                                      note: "",
                                    }));
                                  }
                                }
                              }}
                              multiline
                              numberOfLines={3}
                              maxLength={350}
                              returnKeyType="done"
                              blurOnSubmit={true}
                            />
                            <Text style={styles.characterCount}>
                              {goal.note?.length || 0}/350 characters
                            </Text>
                            {errors.note ? (
                              <Text style={styles.errorText}>
                                {errors.note}
                              </Text>
                            ) : null}
                          </Animated.View>
                        </Animated.View>
                      </Animated.View>
                    )}

                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.button, styles.cancelButton]}
                        onPress={onClose}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.button, styles.saveButton]}
                        onPress={handleSave}
                      >
                        <Text style={styles.buttonText}>Set Goal</Text>
                      </TouchableOpacity>
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
                                  <Text style={styles.datePickerDone}>
                                    Done
                                  </Text>
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
                                      if (errors.date) {
                                        setErrors((prev) => ({
                                          ...prev,
                                          date: "",
                                        }));
                                      }
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
                          <TouchableWithoutFeedback
                            onPress={(e) => e.stopPropagation()}
                          >
                            <View style={styles.categoryModalContent}>
                              <ScrollView
                                style={styles.categoryList}
                                showsVerticalScrollIndicator={false}
                              >
                                <View style={styles.adaptiveCategoryGrid}>
                                  {categoryOptions.map((category) => (
                                    <TouchableOpacity
                                      key={category.value}
                                      style={[
                                        styles.adaptiveCategoryBox,
                                        selectedCategory === category.value &&
                                          styles.categoryBoxSelected,
                                        {
                                          backgroundColor:
                                            category.backgroundColor,
                                          borderColor:
                                            selectedCategory === category.value
                                              ? category.color
                                              : category.color + "40",
                                          borderWidth:
                                            selectedCategory === category.value
                                              ? 2
                                              : 1,
                                        },
                                      ]}
                                      onPress={() => {
                                        setSelectedCategory(category.value);
                                        setShowCategoryPicker(false);
                                      }}
                                      activeOpacity={0.7}
                                    >
                                      <Text style={styles.categoryEmoji}>
                                        {category.emoji}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.adaptiveCategoryText,
                                          {
                                            color:
                                              selectedCategory ===
                                              category.value
                                                ? category.color
                                                : "#333",
                                            fontWeight:
                                              selectedCategory ===
                                              category.value
                                                ? "700"
                                                : "600",
                                          },
                                        ]}
                                      >
                                        {category.label}
                                      </Text>
                                      {selectedCategory === category.value && (
                                        <Ionicons
                                          name="checkmark-circle"
                                          size={18}
                                          color={category.color}
                                          style={styles.categoryCheckmark}
                                        />
                                      )}
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </ScrollView>
                            </View>
                          </TouchableWithoutFeedback>
                        </View>
                      </TouchableWithoutFeedback>
                    </Modal>
                  )}
                </LinearGradient>
              </Animated.View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
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
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "90%", // Prevent modal from taking full height
  },
  modalInner: {
    borderRadius: 20,
    overflow: "hidden",
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
  headerTextContainer: {
    flex: 1,
    alignItems: "flex-start", // Align title to left since close is now on right
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  formSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    height: 48,
  },
  currencySymbol: {
    fontSize: 16,
    color: "#888",
    paddingLeft: 16,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
    paddingHorizontal: 8,
    height: "100%",
  },
  dateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    height: 48,
  },
  progressInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
    paddingHorizontal: 8,
  },
  progressSymbol: {
    fontSize: 16,
    color: "#888",
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  saveButton: {
    backgroundColor: "#4A90E2",
  },
  cancelButton: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  inputError: {
    borderColor: "#FF3B30",
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  categoryButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  categoryContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryButtonText: {
    fontSize: 14,
    color: "#fff",
  },
  noteInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    textAlignVertical: "top",
    minHeight: 80,
    maxHeight: 120, // Prevent it from growing too large
  },
  characterCount: {
    fontSize: 12,
    color: "#888",
    textAlign: "right",
    marginTop: 4,
  },
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
  },
  categoryList: {
    maxHeight: 400,
    marginBottom: 25,
    marginTop: 10,
    marginHorizontal: 10,
  },
  categoryOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  categoryOptionSelected: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
  },
  categoryOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  categoryOptionText: {
    fontSize: 16,
    color: "#fff",
  },
  // Core field styles for visual hierarchy
  coreField: {
    marginBottom: 24,
  },
  coreLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  coreInput: {
    fontSize: 15,
    fontWeight: "500",
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  coreAmountContainer: {
    height: 48,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  coreCurrencySymbol: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  coreAmountInput: {
    fontSize: 16,
    fontWeight: "500",
  },
  // Note expander styles
  addNoteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 20,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    gap: 8,
    width: Dimensions.get("window").width * 0.3,
  },
  addNoteText: {
    fontSize: 14,
    color: "#4A90E2",
    fontWeight: "500",
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
  // Adaptive Category Grid System (imported from CategorySelector)
  adaptiveCategoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  adaptiveCategoryBox: {
    borderRadius: 24,
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
    borderColor: "rgba(0,0,0,0.1)",
  },
  categoryBoxSelected: {
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  categoryEmoji: {
    fontSize: 20,
    marginRight: 6,
    textAlign: "center",
    minWidth: 20,
  },
  adaptiveCategoryText: {
    fontWeight: "600",
    fontSize: 13,
    color: "#333",
    textAlign: "center",
    flexShrink: 1,
    flexGrow: 0,
  },
  categoryCheckmark: {
    marginLeft: 6,
    opacity: 0.9,
  },
  categoryButtonEmoji: {
    fontSize: 16,
  },
  // Bottom row styles (category + current progress)
  bottomRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  bottomSection: {
    flex: 1,
  },
  categorySection: {
    flex: 0.6, // 60% width for category
  },
  progressSection: {
    flex: 0.4, // 40% width for current progress
  },
  // Matched height styles
  matchedHeightButton: {
    height: 48, // Match the height of input containers
    paddingVertical: 0, // Remove vertical padding to use exact height
    justifyContent: "space-between", // Align content to left and right
    alignItems: "center",
  },
  matchedHeightContainer: {
    height: 48, // Match the category button height
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
    paddingBottom: 20, // Safe area padding
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
});
