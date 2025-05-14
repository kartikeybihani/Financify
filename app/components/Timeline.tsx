// Final cleaned and integrated Timeline.tsx — aligns with useGoals hook architecture

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  LayoutAnimation,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GoalNotification from "./GoalNotification";
import AddGoalModal from "./AddGoalModal";
import { styles } from "../styles/timelineSyles";
import { useGoals } from "../hooks/useGoals";
import { TimelineItem, Goal } from "../types/finny";
import { GoalInput } from "../types/addGoalModalTypes";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Simple ID generator
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

interface TimelineProps {
  deleteGoal: (id: string) => Promise<void>;
  timelineAnimations: Animated.Value[];
  timelineData: Goal[];
}

const getTimelineIcon = (label: string): any => {
  if (label.includes("Saving")) return "wallet-outline";
  if (label.includes("Car")) return "car-outline";
  if (label.includes("Home")) return "home-outline";
  if (label.includes("Education")) return "school-outline";
  if (label.includes("FIRE")) return "flame-outline";
  return "flag-outline";
};

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

const parseTimelineDate = (
  dateStr: string | { month: string; year: number }
): { month: number; year: number } => {
  // Handle timeline object format
  if (typeof dateStr === "object" && dateStr !== null) {
    return {
      month: getMonthNumber(dateStr.month),
      year: dateStr.year,
    };
  }

  // Handle string format "Month Year" (e.g., "August 2025")
  if (typeof dateStr === "string") {
    const parts = dateStr.split(" ");
    if (parts.length === 2) {
      return {
        month: getMonthNumber(parts[0]),
        year: parseInt(parts[1]),
      };
    }

    // Handle format "YYYY" (e.g., "2025")
    if (parts.length === 1 && !isNaN(parseInt(dateStr))) {
      return {
        month: 0, // January
        year: parseInt(dateStr),
      };
    }
  }

  // Default to current year if invalid format
  const currentDate = new Date();
  return {
    month: currentDate.getMonth(),
    year: currentDate.getFullYear(),
  };
};

export default function Timeline({
  deleteGoal,
  timelineAnimations,
  timelineData,
}: TimelineProps) {
  const [selectedMilestone, setSelectedMilestone] = useState<Goal | null>(null);
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [notification, setNotification] = useState({
    visible: false,
    message: "",
  });
  const modalAnimation = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);

  const { addManualGoal, refreshGoals } = useGoals(() => {});

  const sortedTimelineData = React.useMemo(() => {
    console.log("Sorting timeline data:", timelineData);
    return [...timelineData].sort((a, b) => {
      const dateA = parseTimelineDate(a.timeline || a.year);
      const dateB = parseTimelineDate(b.timeline || b.year);
      return dateA.year !== dateB.year
        ? dateA.year - dateB.year
        : dateA.month - dateB.month;
    });
  }, [timelineData]);

  const hideModal = () => {
    Animated.timing(modalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowAddGoalModal(false));
  };

  const handleDeleteGoal = (goalToDelete: Goal) => {
    Alert.alert("Delete Goal", "Are you sure you want to delete this goal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteGoal(goalToDelete.id);
            setNotification({
              visible: true,
              message: "Goal deleted successfully",
            });
            // Reset selected milestone if it was the deleted one
            if (selectedMilestone?.id === goalToDelete.id) {
              setSelectedMilestone(null);
            }
          } catch (error) {
            console.error("Error deleting goal:", error);
            setNotification({
              visible: true,
              message: "Failed to delete goal",
            });
          }
        },
      },
    ]);
  };

  const handleSaveGoal = async (goal: GoalInput) => {
    try {
      console.log("Saving new goal:", goal);
      const newGoal: Goal = {
        id: generateId(),
        label: goal.label,
        target: 0, // Default target
        year: goal.year,
        description: goal.description,
        progress: goal.progress || 0,
      };
      console.log("Transformed goal:", newGoal);
      await addManualGoal(newGoal);
      await refreshGoals(); // Refresh the timeline data
      setShowAddGoalModal(false);
    } catch (err) {
      console.error("Manual goal save failed:", err);
    }
  };

  // Pull to refresh handler
  const onRefresh = async () => {
    setRefreshing(true);
    console.log("refreshing..");
    await refreshGoals();
    setRefreshing(false);
  };

  return (
    <View style={styles.timelineContainer}>
      {notification.visible && (
        <GoalNotification
          message={notification.message}
          onClose={() => setNotification({ visible: false, message: "" })}
        />
      )}
      <ScrollView
        contentContainerStyle={styles.timelineWrapper}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {sortedTimelineData.map((item, index) => {
          const animatedStyle = {
            opacity: timelineAnimations[index],
            transform: [
              {
                translateX: timelineAnimations[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [100, 0],
                }),
              },
            ],
          };

          const isSelected = selectedMilestone?.id === item.id;

          return (
            <TouchableOpacity
              key={item.id}
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
                  <Text style={styles.timelineYear}>
                    {typeof item.year === "object"
                      ? `${item.year.month} ${item.year.year}`
                      : item.timeline
                      ? `${item.timeline.month} ${item.timeline.year}`
                      : item.year}
                  </Text>
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
      {/* Overlay ActivityIndicator */}
      {refreshing && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.2)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10,
          }}
        >
          <ActivityIndicator size="large" color="#4A90E2" />
        </View>
      )}
      <TouchableOpacity
        style={styles.addGoalButton}
        onPress={() => setShowAddGoalModal(true)}
      >
        <Ionicons name="add-circle" size={24} color="#4A90E2" />
        <Text style={styles.addGoalText}>Add Goal</Text>
      </TouchableOpacity>

      <AddGoalModal
        visible={showAddGoalModal}
        onClose={hideModal}
        onSave={handleSaveGoal}
      />
    </View>
  );
}
