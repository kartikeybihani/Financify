import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Define the type for timeline items
interface TimelineItem {
  year: string;
  label: string;
  description: string;
}

interface TimelineProps {
  timelineData: TimelineItem[];
  timelineAnimations: Animated.Value[];
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

export default function Timeline({
  timelineData,
  timelineAnimations,
}: TimelineProps) {
  const [selectedMilestone, setSelectedMilestone] =
    useState<TimelineItem | null>(null);
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [newGoal, setNewGoal] = useState<Partial<TimelineItem>>({
    year: "",
    label: "",
    description: "",
  });

  // Handle adding a new goal
  const handleAddGoal = () => {
    if (!newGoal.year || !newGoal.label || !newGoal.description) {
      // Show validation error
      return;
    }

    // Create a new goal with a unique ID
    const goalToAdd: TimelineItem = {
      year: newGoal.year,
      label: newGoal.label,
      description: newGoal.description,
    };

    // Add the new goal to the timeline data
    // In a real app, this would update a database or state management
    // For now, we'll just show a success message
    setShowAddGoalModal(false);
    setNewGoal({ year: "", label: "", description: "" });
  };

  return (
    <View style={styles.timelineContainer}>
      <ScrollView contentContainerStyle={styles.timelineWrapper}>
        {timelineData.map((item, index) => {
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

          const isSelected = selectedMilestone?.year === item.year;

          return (
            <TouchableOpacity
              key={index}
              onPress={() => {
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut
                );
                setSelectedMilestone(isSelected ? null : item);
              }}
              style={[
                styles.timelineRow,
                isSelected && styles.selectedTimelineRow,
              ]}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.timelineDot,
                  isSelected && styles.selectedTimelineDot,
                ]}
              />
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
      {showAddGoalModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Goal</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Year</Text>
              <TextInput
                style={styles.input}
                placeholder="2025"
                placeholderTextColor="#666"
                value={newGoal.year}
                onChangeText={(text) => setNewGoal({ ...newGoal, year: text })}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Goal Title</Text>
              <TextInput
                style={styles.input}
                placeholder="Buy a House"
                placeholderTextColor="#666"
                value={newGoal.label}
                onChangeText={(text) => setNewGoal({ ...newGoal, label: text })}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="A major milestone in your financial journey"
                placeholderTextColor="#666"
                value={newGoal.description}
                onChangeText={(text) =>
                  setNewGoal({ ...newGoal, description: text })
                }
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddGoalModal(false);
                  setNewGoal({ year: "", label: "", description: "" });
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleAddGoal}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  selectedTimelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4A90E2",
    borderWidth: 3,
    borderColor: "#121212",
  },
  timelineLine: {
    position: "absolute",
    left: 18,
    top: 28,
    width: 2,
    height: "100%",
    backgroundColor: "#333",
    textDecorationStyle: "double",
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
    marginTop: 8,
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: "#aaa",
    marginBottom: 6,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: "#333",
  },
  saveButton: {
    backgroundColor: "#4A90E2",
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
