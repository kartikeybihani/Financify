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
import TimelineItem from "./TimelineItem";
import { styles } from "../styles/timelineSyles";
import { useGoals } from "../hooks/useGoals";
import { Goal } from "../types/finny";
import { GoalInput } from "../types/addGoalModalTypes";
import { TimelineProps, TimelineState } from "../types/timelineTypes";

// Simple ID generator
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
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

const Timeline: React.FC<TimelineProps> = ({
  deleteGoal,
  timelineAnimations,
  timelineData,
}) => {
  const [state, setState] = useState<TimelineState>({
    selectedMilestone: null,
    showAddGoalModal: false,
    notification: {
      visible: false,
      message: "",
    },
    refreshing: false,
  });

  const [localTimelineData, setLocalTimelineData] =
    useState<Goal[]>(timelineData);

  const { addManualGoal, refreshGoals } = useGoals(() => {});

  useEffect(() => {
    setLocalTimelineData(timelineData);
  }, [timelineData]);

  const handleSaveGoal = async (goal: GoalInput) => {
    try {
      const newGoal: Goal = {
        id: generateId(),
        label: goal.label,
        target: 0,
        description: goal.description,
        progress: goal.progress || 0,
        timeline: goal.timeline,
      };

      await addManualGoal(newGoal);
      setLocalTimelineData((prev: Goal[]) => [...prev, newGoal]);
      setState((prev: TimelineState) => ({ ...prev, showAddGoalModal: false }));
    } catch (err) {
      console.error("Manual goal save failed:", err);
    }
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
            setState((prev: TimelineState) => ({
              ...prev,
              notification: {
                visible: true,
                message: "Goal deleted successfully",
              },
              selectedMilestone:
                prev.selectedMilestone?.id === goalToDelete.id
                  ? null
                  : prev.selectedMilestone,
            }));
          } catch (error) {
            console.error("Error deleting goal:", error);
            setState((prev: TimelineState) => ({
              ...prev,
              notification: {
                visible: true,
                message: "Failed to delete goal",
              },
            }));
          }
        },
      },
    ]);
  };

  const sortedTimelineData = React.useMemo(() => {
    return [...localTimelineData].sort((a, b) => {
      const dateA = a.timeline;
      const dateB = b.timeline;
      return dateA.year !== dateB.year
        ? dateA.year - dateB.year
        : getMonthNumber(dateA.month) - getMonthNumber(dateB.month);
    });
  }, [localTimelineData]);

  const onRefresh = async () => {
    setState((prev: TimelineState) => ({ ...prev, refreshing: true }));
    await refreshGoals();
    setState((prev: TimelineState) => ({ ...prev, refreshing: false }));
  };

  return (
    <View style={styles.timelineContainer}>
      {state.notification.visible && (
        <GoalNotification
          message={state.notification.message}
          onClose={() =>
            setState((prev: TimelineState) => ({
              ...prev,
              notification: { visible: false, message: "" },
            }))
          }
        />
      )}
      <ScrollView
        contentContainerStyle={styles.timelineWrapper}
        refreshControl={
          <RefreshControl refreshing={state.refreshing} onRefresh={onRefresh} />
        }
      >
        {sortedTimelineData.map((item, index) => (
          <TimelineItem
            key={item.id}
            item={item}
            index={index}
            animation={timelineAnimations[index]}
            isSelected={state.selectedMilestone?.id === item.id}
            onSelect={(goal) =>
              setState((prev: TimelineState) => ({
                ...prev,
                selectedMilestone:
                  prev.selectedMilestone?.id === goal.id ? null : goal,
              }))
            }
            onDelete={handleDeleteGoal}
          />
        ))}
      </ScrollView>

      {state.refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4A90E2" />
        </View>
      )}

      <TouchableOpacity
        style={styles.addGoalButton}
        onPress={() =>
          setState((prev: TimelineState) => ({
            ...prev,
            showAddGoalModal: true,
          }))
        }
      >
        <Ionicons name="add-circle" size={24} color="#4A90E2" />
        <Text style={styles.addGoalText}>Add Goal</Text>
      </TouchableOpacity>

      <AddGoalModal
        visible={state.showAddGoalModal}
        onClose={() =>
          setState((prev: TimelineState) => ({
            ...prev,
            showAddGoalModal: false,
          }))
        }
        onSave={handleSaveGoal}
      />
    </View>
  );
};

export default Timeline;
