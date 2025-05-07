import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  LayoutAnimation,
  Modal,
  Dimensions,
  DeviceEventEmitter,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import AddGoalModal from "./AddGoalModal";
import GoalNotification from "./GoalNotification";

// Define the type for timeline items
interface TimelineItem {
  id?: string; // Make ID optional since we'll add it in the parent
  year: string;
  label: string;
  description: string;
  progress?: number; // Add progress field (0-100)
}

interface TimelineProps {
  timelineData: (TimelineItem & { id: string })[]; // Require ID in props
  timelineAnimations: Animated.Value[];
  deleteGoal: (goalToDelete: TimelineItem) => Promise<string | null>;
}

// Helper function to get appropriate icon for timeline items
const getTimelineIcon = (label: string): any => {
  if (label.includes("Saving")) return "wallet-outline";
  if (label.includes("Car")) return "car-outline";
  if (label.includes("Home")) return "home-outline";
  if (label.includes("Education")) return "school-outline";
  if (label.includes("FIRE")) return "flame-outline";
  return "flag-outline";
};

// Helper function to convert month name to number for sorting
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

// Helper function to parse timeline item date
const parseTimelineDate = (
  dateStr: string
): { month: number; year: number } => {
  const parts = dateStr.split(" ");
  if (parts.length === 2) {
    return {
      month: getMonthNumber(parts[0]),
      year: parseInt(parts[1]),
    };
  }
  // Fallback for old format or invalid dates
  return {
    month: 0,
    year: parseInt(dateStr),
  };
};

export default function Timeline({
  timelineData,
  timelineAnimations,
  deleteGoal,
}: TimelineProps) {
  const [selectedMilestone, setSelectedMilestone] =
    useState<TimelineItem | null>(null);
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [newGoal, setNewGoal] = useState<Partial<TimelineItem>>({
    year: "",
    label: "",
    description: "",
  });
  const [descriptionHeight, setDescriptionHeight] = useState(80);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const modalAnimation = useRef(new Animated.Value(0)).current;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [notification, setNotification] = useState({
    visible: false,
    message: "",
  });

  // Sort timeline data by date
  const sortedTimelineData = [...timelineData].sort((a, b) => {
    const dateA = parseTimelineDate(a.year);
    const dateB = parseTimelineDate(b.year);

    if (dateA.year !== dateB.year) {
      return dateA.year - dateB.year;
    }
    return dateA.month - dateB.month;
  });

  // Handle modal visibility
  const showModal = () => {
    setIsModalVisible(true);
    setShowAddGoalModal(true);
    Animated.spring(modalAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  };

  const hideModal = () => {
    Animated.timing(modalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setIsModalVisible(false);
      setShowAddGoalModal(false);
      // Reset form state
      setNewGoal({ year: "", label: "", description: "" });
      setSelectedDate(new Date());
    });
  };

  // Clean up the modal state when component unmounts
  useEffect(() => {
    return () => {
      modalAnimation.setValue(0);
      setIsModalVisible(false);
      setShowAddGoalModal(false);
    };
  }, []);

  const handleDeleteGoal = (goalToDelete: TimelineItem) => {
    Alert.alert("Delete Goal", "Are you sure you want to delete this goal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGoal(goalToDelete).then((message: string | null) => {
            if (message) {
              setNotification({
                visible: true,
                message: message,
              });
            }
          });
        },
      },
    ]);
  };

  // Handle adding a new goal
  const handleAddGoal = () => {
    if (!newGoal.label || !selectedDate) {
      // Show validation error
      return;
    }

    // Format the date as year and month
    const year = selectedDate.getFullYear().toString();
    const month = selectedDate.toLocaleString("default", { month: "long" });

    // Create a new goal with a unique ID
    const goalToAdd: TimelineItem = {
      year: `${month} ${year}`,
      label: newGoal.label,
      description: newGoal.description || "No description provided",
    };

    // Reset and close modal
    hideModal();
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleSaveGoal = async (goal: TimelineItem) => {
    try {
      // Get existing goals
      const existingGoals = await AsyncStorage.getItem("goals");
      const parsedGoals = JSON.parse(existingGoals || "[]");

      // Add new goal with ID
      const goalWithId = {
        ...goal,
        id: Date.now().toString(),
      };

      const updatedGoals = [...parsedGoals, goalWithId];

      // Save updated goals
      await AsyncStorage.setItem("goals", JSON.stringify(updatedGoals));

      // Emit event to refresh timeline
      DeviceEventEmitter.emit("goalsUpdated", updatedGoals);

      // Close modal
      setShowAddGoalModal(false);
    } catch (error) {
      console.error("Error saving goal:", error);
    }
  };

  return (
    <View style={styles.timelineContainer}>
      {notification.visible && (
        <GoalNotification
          message={notification.message}
          onClose={() => setNotification({ visible: false, message: "" })}
        />
      )}
      <ScrollView contentContainerStyle={styles.timelineWrapper}>
        {sortedTimelineData.map((item, index) => {
          const animatedStyle = {
            opacity: timelineAnimations[index],
            transform: [
              {
                translateX: timelineAnimations[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [-50, 0],
                }),
              },
            ],
          };

          const isSelected = selectedMilestone?.id === item.id;

          return (
            <TouchableOpacity
              key={item.id} // Use the unique ID as key
              onPress={() => {
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut
                );
                setSelectedMilestone(isSelected ? null : item);
              }}
              onLongPress={() => handleDeleteGoal(item)}
              style={[
                styles.timelineRow,
                isSelected && styles.selectedTimelineRow,
              ]}
              activeOpacity={0.8}
            >
              <View style={styles.timelineDot} />
              <View style={styles.timelineLine} />
              <Animated.View style={[styles.timelineContent, animatedStyle]}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.timelineYear}>{item.year}</Text>
                  <View style={styles.timelineIconContainer}>
                    <Ionicons
                      name={getTimelineIcon(item.label)}
                      size={18}
                      color="#4A90E2"
                    />
                  </View>
                </View>
                <Text style={styles.timelineLabel}>{item.label}</Text>
                {typeof item.progress === "number" && (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBarBackground}>
                      <Animated.View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${item.progress}%`,
                            backgroundColor:
                              item.progress >= 100 ? "#4CD964" : "#4A90E2",
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>{item.progress}%</Text>
                  </View>
                )}
                {isSelected && (
                  <View style={styles.timelineDescriptionContainer}>
                    <Text style={styles.timelineDescription}>
                      {item.description}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Add Goal Button */}
      <TouchableOpacity
        style={styles.addGoalButton}
        onPress={() => setShowAddGoalModal(true)}
      >
        <Ionicons name="add-circle" size={24} color="#4A90E2" />
        <Text style={styles.addGoalText}>Add Goal</Text>
      </TouchableOpacity>

      {/* Add Goal Modal */}
      <AddGoalModal
        visible={showAddGoalModal}
        onClose={hideModal}
        onSave={handleSaveGoal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  timelineContainer: {
    flex: 1,
    position: "relative",
  },
  timelineWrapper: {
    padding: 20,
    paddingTop: 30,
  },
  timelineRow: {
    marginBottom: 30,
    position: "relative",
    paddingLeft: 40,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  selectedTimelineRow: {
    backgroundColor: "#1f1f1f",
    paddingRight: 12,
  },
  timelineDot: {
    position: "absolute",
    left: 10,
    top: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4A90E2",
    borderWidth: 2,
    borderColor: "#121212",
    zIndex: 2,
  },
  timelineLine: {
    position: "absolute",
    left: 18,
    top: 28,
    width: 2,
    height: "100%",
    backgroundColor: "#333",
  },
  timelineContent: {
    marginLeft: 8,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  timelineYear: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A90E2",
  },
  timelineLabel: {
    fontSize: 16,
    color: "#eee",
    marginTop: 4,
    fontWeight: "500",
  },
  timelineDescriptionContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4A90E2",
  },
  timelineDescription: {
    fontSize: 14,
    color: "#aaa",
    lineHeight: 20,
  },
  addGoalButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "#1f1f1f",
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#333",
  },
  addGoalText: {
    color: "#fff",
    marginLeft: 8,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: "#1f1f1f",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#333",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 24,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 4,
  },
  textArea: {
    minHeight: 80,
    maxHeight: 150,
    paddingTop: 12,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  modalButton: {
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
    color: "#ff6b6b",
    fontSize: 12,
    marginTop: 4,
  },
  datePickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  datePickerButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  progressContainer: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: "#2a2a2a",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: "#aaa",
    fontWeight: "600",
    minWidth: 40,
    textAlign: "right",
  },
});
