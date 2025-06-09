import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Image,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GoalNotification from "./GoalNotification";
import AddGoalModal from "./AddGoalModal";
import TimelineItem from "./TimelineItem";
import GoalDetailModal from "./GoalDetailModal";
import { styles } from "../styles/timelineSyles";
import { useGoals } from "../hooks/useGoals";
import { Goal } from "../types/finny";
import { GoalInput } from "../types/addGoalModalTypes";
import { TimelineProps, TimelineState } from "../types/timelineTypes";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

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
  onRefreshStart,
  onRefreshEnd,
}) => {
  const [state, setState] = useState<TimelineState>({
    showAddGoalModal: false,
    notification: {
      visible: false,
      message: "",
    },
    refreshing: false,
  });

  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [localTimelineData, setLocalTimelineData] =
    useState<Goal[]>(timelineData);

  const { addManualGoal, refreshGoals } = useGoals(() => {});

  const router = useRouter();

  // Add mascot animation refs
  const mascotRotate = useRef(new Animated.Value(0)).current;
  const mascotBounce = useRef(new Animated.Value(0)).current;

  // Add mascot animation setup
  useEffect(() => {
    const startMascotAnimation = () => {
      Animated.parallel([
        // Smooth rotation
        Animated.sequence([
          Animated.timing(mascotRotate, {
            toValue: 1,
            duration: 1200,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
          Animated.timing(mascotRotate, {
            toValue: 0,
            duration: 1200,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
        ]),
        // Subtle bounce
        Animated.sequence([
          Animated.timing(mascotBounce, {
            toValue: 1,
            duration: 600,
            easing: Easing.elastic(1),
            useNativeDriver: true,
          }),
          Animated.timing(mascotBounce, {
            toValue: 0,
            duration: 600,
            easing: Easing.elastic(1),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setTimeout(startMascotAnimation, 4000);
      });
    };

    startMascotAnimation();
  }, []);

  const rotate = mascotRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const bounce = mascotBounce.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1],
  });

  useEffect(() => {
    setLocalTimelineData(timelineData);
  }, [timelineData]);

  const handleSaveGoal = async (goal: GoalInput) => {
    try {
      const newGoal: Goal = {
        id: generateId(),
        label: goal.label,
        target: goal.target,
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

  const handleEditGoal = async (updatedGoal: Goal) => {
    try {
      // Update the goal in storage
      const storedGoals = await AsyncStorage.getItem("goals");
      const parsedGoals = storedGoals ? JSON.parse(storedGoals) : [];
      const updatedGoals = parsedGoals.map((g: Goal) =>
        g.id === updatedGoal.id ? updatedGoal : g
      );

      await AsyncStorage.setItem("goals", JSON.stringify(updatedGoals));

      // Update local state
      setLocalTimelineData(updatedGoals);

      // Show success notification
      setState((prev: TimelineState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Goal updated successfully",
        },
      }));

      // Close the modal
      setSelectedGoal(null);
    } catch (error) {
      console.error("Error updating goal:", error);
      setState((prev: TimelineState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Failed to update goal",
        },
      }));
    }
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
    try {
      onRefreshStart?.();
      setState((prev: TimelineState) => ({ ...prev, refreshing: true }));
      await refreshGoals();
    } finally {
      setState((prev: TimelineState) => ({ ...prev, refreshing: false }));
      onRefreshEnd?.();
    }
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
        contentContainerStyle={[
          styles.timelineWrapper,
          !sortedTimelineData.length && styles.emptyTimelineWrapper,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={onRefresh}
            tintColor="#4A90E2"
          />
        }
      >
        {sortedTimelineData.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.mascotImageContainer}>
              <Animated.Image
                source={require("../assets/mascot1.jpg")}
                style={[
                  styles.emptyStateImage,
                  {
                    transform: [{ rotate }, { scale: bounce }, { scaleX: -1 }],
                  },
                ]}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.emptyStateDescription}>
              Let's map out your financial future together! 🎯
            </Text>
            <Text style={styles.emptyStateSubDescription}>
              Whether you want to save for a dream home, plan a vacation, or
              build an emergency fund - I'm here to help you make it happen.
            </Text>
            <View style={{ flexDirection: "row", gap: 25, width: "100%" }}>
              <TouchableOpacity
                style={styles.chatWithFinnyButton}
                onPress={() => router.push("/chat")}
              >
                <Ionicons name="person-circle-outline" size={24} color="#fff" />
                <Text style={styles.chatWithFinnyText}>Talk with Finny</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addManuallyButton}
                onPress={() =>
                  setState((prev: TimelineState) => ({
                    ...prev,
                    showAddGoalModal: true,
                  }))
                }
              >
                <Ionicons name="add-circle-outline" size={20} color="#4A90E2" />
                <Text style={styles.addManuallyText}>Add Manually</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          sortedTimelineData.map((item, index) => (
            <TimelineItem
              key={item.id}
              item={item}
              index={index}
              animation={timelineAnimations[index]}
              onPress={() => setSelectedGoal(item)}
            />
          ))
        )}
      </ScrollView>

      {state.refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4A90E2" />
        </View>
      )}

      {sortedTimelineData.length !== 0 && (
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
          <Text style={styles.addGoalText}>Add New Goal</Text>
        </TouchableOpacity>
      )}

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

      <GoalDetailModal
        goal={selectedGoal}
        visible={selectedGoal !== null}
        onClose={() => setSelectedGoal(null)}
        onDelete={handleDeleteGoal}
        onEdit={handleEditGoal}
      />
    </View>
  );
};

export default Timeline;
