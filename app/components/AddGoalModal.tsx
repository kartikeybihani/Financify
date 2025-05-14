import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AddGoalModalProps, GoalInput } from "../types/addGoalModalTypes";

const initialGoalState = {
  label: "",
  description: "",
  progress: 0,
};

export default function AddGoalModal({
  visible,
  onClose,
  onSave,
}: AddGoalModalProps) {
  // State
  const [goal, setGoal] = useState(initialGoalState);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [descriptionHeight, setDescriptionHeight] = useState(80);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isReady, setIsReady] = useState(false);

  // Animation
  const modalAnimation = useRef(new Animated.Value(0)).current;

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
      setSelectedDate(new Date());
      setErrors({});
      setDescriptionHeight(80);
    }
  }, [visible]);

  // Handlers
  const handleClose = () => {
    // Immediately start closing animation
    Animated.parallel([
      Animated.timing(modalAnimation, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!goal.label.trim()) {
      newErrors.label = "Please enter a goal title";
    }

    // if (!goal.description.trim()) {
    //   newErrors.description = "Please enter a goal description";
    // }

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
      const month = selectedDate.toLocaleString("default", { month: "long" });
      const year = selectedDate.getFullYear();

      onSave({
        label: goal.label,
        description: goal.description,
        progress: goal.progress,
        timeline: {
          month,
          year,
        },
      });

      handleClose();
    }
  };

  if (!visible && !isReady) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: modalAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
            }),
          },
        ]}
      >
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
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalInner}>
              <Text style={styles.title}>Create New Goal</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Goal</Text>
                <TextInput
                  style={[styles.input, errors.label && styles.inputError]}
                  placeholder="What do you want to achieve?"
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

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Target Date</Text>
                <TouchableOpacity
                  style={[styles.dateButton, errors.date && styles.inputError]}
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
                {errors.date ? (
                  <Text style={styles.errorText}>{errors.date}</Text>
                ) : null}
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, date) => {
                      setShowDatePicker(false);
                      if (date) {
                        setSelectedDate(date);
                        if (errors.date) {
                          setErrors((prev) => ({ ...prev, date: "" }));
                        }
                      }
                    }}
                    minimumDate={new Date()}
                    textColor="#fff"
                    style={
                      Platform.OS === "ios" ? styles.datePickerIOS : undefined
                    }
                  />
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Progress</Text>
                <View style={styles.progressInputContainer}>
                  <TextInput
                    style={[styles.input, styles.progressInput]}
                    placeholder="0"
                    placeholderTextColor="#666"
                    value={goal.progress?.toString() || ""}
                    onChangeText={(text) => {
                      const progress = Math.min(
                        100,
                        Math.max(0, parseInt(text) || 0)
                      );
                      setGoal((prev) => ({ ...prev, progress }));
                    }}
                    keyboardType="numeric"
                  />
                  <Text style={styles.progressSymbol}>%</Text>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    { height: Math.max(80, descriptionHeight) },
                    errors.description && styles.inputError,
                  ]}
                  placeholder="Describe your goal and what it means to you..."
                  placeholderTextColor="#666"
                  value={goal.description}
                  onChangeText={(text) => {
                    setGoal((prev) => ({ ...prev, description: text }));
                    if (errors.description) {
                      setErrors((prev) => ({ ...prev, description: "" }));
                    }
                  }}
                  onContentSizeChange={(e) =>
                    setDescriptionHeight(e.nativeEvent.contentSize.height)
                  }
                  multiline
                  textAlignVertical="top"
                />
                {errors.description ? (
                  <Text style={styles.errorText}>{errors.description}</Text>
                ) : null}
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleClose}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveButtonText}>Save Goal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
  },
  modalInner: {
    backgroundColor: "#1a1a1a",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#333",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 24,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
  },
  textArea: {
    minHeight: 80,
    maxHeight: 150,
    paddingTop: 12,
  },
  dateButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  dateButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  datePickerIOS: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    marginTop: 8,
    height: 200,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 6,
  },
  cancelButton: {
    backgroundColor: "#333",
    borderWidth: 1,
    borderColor: "#444",
  },
  saveButton: {
    backgroundColor: "#4A90E2",
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  inputError: {
    borderColor: "#ff4444",
  },
  errorText: {
    color: "#ff4444",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  progressInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  progressInput: {
    flex: 1,
    marginBottom: 0,
    borderWidth: 0,
  },
  progressSymbol: {
    color: "#666",
    fontSize: 16,
    paddingRight: 16,
  },
});
