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
  TouchableWithoutFeedback,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AddGoalModalProps, GoalInput } from "../types/addGoalModalTypes";
import { LinearGradient } from "expo-linear-gradient";

const initialGoalState = {
  label: "",
  target: 0,
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
    }
  }, [visible]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!goal.label.trim()) {
      newErrors.label = "Please enter a goal title";
    }

    if (!goal.target || goal.target <= 0) {
      newErrors.target = "Please enter a valid target amount";
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
      const month = selectedDate.toLocaleString("default", { month: "long" });
      const year = selectedDate.getFullYear();

      onSave({
        label: goal.label.trim(),
        target: goal.target,
        progress: goal.progress,
        timeline: {
          month,
          year,
        },
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
                  <TouchableOpacity
                    onPress={onClose}
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={24} color="#888" />
                  </TouchableOpacity>
                  <View style={styles.headerTextContainer}>
                    <Text style={styles.headerTitle}>New Goal</Text>
                  </View>
                  <View style={{ width: 40 }} />
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContent}
                >
                  <View style={styles.formSection}>
                    <Text style={styles.label}>Goal Name</Text>
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

                  <View style={styles.formSection}>
                    <Text style={styles.label}>Target Amount</Text>
                    <View
                      style={[
                        styles.amountContainer,
                        errors.target && styles.inputError,
                      ]}
                    >
                      <Text style={styles.currencySymbol}>$</Text>
                      <TextInput
                        style={styles.amountInput}
                        placeholder="0"
                        placeholderTextColor="#666"
                        value={goal.target ? String(goal.target) : ""}
                        onChangeText={(text) => {
                          const target = parseFloat(text) || 0;
                          setGoal((prev) => ({ ...prev, target }));
                          if (errors.target) {
                            setErrors((prev) => ({ ...prev, target: "" }));
                          }
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                    {errors.target ? (
                      <Text style={styles.errorText}>{errors.target}</Text>
                    ) : null}
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
                  </View>

                  <View style={styles.formSection}>
                    <Text style={styles.label}>Initial Progress</Text>
                    <View style={styles.progressContainer}>
                      <TextInput
                        style={styles.progressInput}
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
                      <Text style={styles.buttonText}>Create Goal</Text>
                    </TouchableOpacity>
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
              </LinearGradient>
            </Animated.View>
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
  modalContent: {
    width: "100%",
    maxWidth: 400,
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
    paddingHorizontal: 16,
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
});
