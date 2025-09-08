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
import GoalItem from "./GoalItem";
import GoalDetailModal from "./GoalDetailModal";
import { styles } from "../styles/goalsStyles";
import { useGoals } from "../hooks/useGoals";
import { Goal } from "../types/finny";
import { GoalInput } from "../types/addGoalModalTypes";
import { GoalsProps, GoalsState } from "../types/goalsTypes";
import { useRouter } from "expo-router";

// Simple ID generator
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const Goals: React.FC<GoalsProps> = ({
  deleteGoal,
  updateGoal,
  goalsAnimations,
  goalsData,
  onRefreshStart,
  onRefreshEnd,
}) => {
  const [state, setState] = useState<GoalsState>({
    showAddGoalModal: false,
    notification: {
      visible: false,
      message: "",
    },
    refreshing: false,
  });

  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [localGoalsData, setLocalGoalsData] = useState<Goal[]>(goalsData);

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
    console.log(
      "🔄 [GOALS COMPONENT] Goals data changed:",
      goalsData?.length || 0,
      "goals"
    );
    setLocalGoalsData(goalsData);
  }, [goalsData]);

  const handleSaveGoal = async (goalInput: GoalInput) => {
    try {
      await addManualGoal(goalInput);
      setState((prev: GoalsState) => ({
        ...prev,
        showAddGoalModal: false,
        notification: {
          visible: true,
          message: "Goal created successfully!",
        },
      }));
    } catch (err) {
      console.error("Manual goal save failed:", err);
      setState((prev: GoalsState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Failed to create goal",
        },
      }));
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
            setState((prev: GoalsState) => ({
              ...prev,
              notification: {
                visible: true,
                message: "Goal deleted successfully",
              },
            }));
          } catch (error) {
            console.error("Error deleting goal:", error);
            setState((prev: GoalsState) => ({
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

  const handleEditGoal = async (id: string, updates: Partial<Goal>) => {
    try {
      if (updateGoal) {
        await updateGoal(id, updates);
        setState((prev: GoalsState) => ({
          ...prev,
          notification: {
            visible: true,
            message: "Goal updated successfully",
          },
        }));
      }
      setSelectedGoal(null);
    } catch (error) {
      console.error("Error updating goal:", error);
      setState((prev: GoalsState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Failed to update goal",
        },
      }));
    }
  };

  const sortedGoalsData = React.useMemo(() => {
    return [...localGoalsData].sort((a, b) => {
      const dateA = new Date(a.target_date);
      const dateB = new Date(b.target_date);
      return dateA.getTime() - dateB.getTime();
    });
  }, [localGoalsData]);

  const onRefresh = async () => {
    try {
      onRefreshStart?.();
      setState((prev: GoalsState) => ({ ...prev, refreshing: true }));
      await refreshGoals();
    } finally {
      setState((prev: GoalsState) => ({ ...prev, refreshing: false }));
      onRefreshEnd?.();
    }
  };

  return (
    <View style={styles.goalsContainer}>
      {state.notification.visible && (
        <GoalNotification
          message={state.notification.message}
          onClose={() =>
            setState((prev: GoalsState) => ({
              ...prev,
              notification: { visible: false, message: "" },
            }))
          }
        />
      )}
      <ScrollView
        contentContainerStyle={[
          styles.goalsWrapper,
          !sortedGoalsData.length && styles.emptyGoalsWrapper,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={onRefresh}
            tintColor="#4A90E2"
          />
        }
      >
        {sortedGoalsData.length === 0 ? (
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
                  setState((prev: GoalsState) => ({
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
          sortedGoalsData.map((item, index) => (
            <GoalItem
              key={item.id}
              item={item}
              index={index}
              animation={goalsAnimations[index]}
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

      {sortedGoalsData.length !== 0 && (
        <TouchableOpacity
          style={styles.addGoalButton}
          onPress={() =>
            setState((prev: GoalsState) => ({
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
          setState((prev: GoalsState) => ({
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

export default Goals;
