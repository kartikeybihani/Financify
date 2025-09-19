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
import { styles } from "../../_styles/goalsStyles";
import { useGoals } from "../../_hooks/useGoals";
import { Goal } from "../../_types/finny";
import { GoalInput } from "../../_types/addGoalModalTypes";
import { GoalsProps, GoalsState } from "../../_types/goalsTypes";
import { useRouter } from "expo-router";
import logger from "../../_utils/logger";
import { supabase } from "../../_lib/supabase/supabase";

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
  onGoalAdded,
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

  // Check for connected accounts to show smart templates
  const [hasConnectedAccounts, setHasConnectedAccounts] = useState(false);
  const [accountBalance, setAccountBalance] = useState<number>(0);

  useEffect(() => {
    checkConnectedAccounts();
  }, []);

  const checkConnectedAccounts = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      // Check if user has any connected accounts
      const { data: userItems, error } = await supabase
        .from("user_items")
        .select("item_id")
        .eq("user_id", user.id);

      if (error || !userItems?.length) {
        setHasConnectedAccounts(false);
        return;
      }

      // Get total balance from all accounts
      const { data: accounts, error: accountsError } = await supabase
        .from("accounts")
        .select("current_balance")
        .in(
          "item_id",
          userItems.map((item) => item.item_id)
        );

      if (accountsError || !accounts?.length) {
        setHasConnectedAccounts(false);
        return;
      }

      const totalBalance = accounts.reduce(
        (sum, account) => sum + (account.current_balance || 0),
        0
      );

      setHasConnectedAccounts(true);
      setAccountBalance(totalBalance);
    } catch (error) {
      logger.error("Error checking connected accounts:", error);
      setHasConnectedAccounts(false);
    }
  };

  const sortedGoalsData = React.useMemo(() => {
    return [...localGoalsData].sort((a, b) => {
      const dateA = new Date(a.target_date);
      const dateB = new Date(b.target_date);
      return dateA.getTime() - dateB.getTime();
    });
  }, [localGoalsData]);

  // Enhanced mascot animation refs
  const mascotIdle = useRef(new Animated.Value(0)).current;
  const mascotNudge = useRef(new Animated.Value(0)).current;
  const mascotCelebrate = useRef(new Animated.Value(0)).current;
  const progressRing = useRef(new Animated.Value(0)).current;

  // Purposeful mascot animations
  useEffect(() => {
    if (sortedGoalsData.length === 0) {
      // Idle animation: gentle blink and 2% bob every 6 seconds
      const startIdleAnimation = () => {
        Animated.sequence([
          Animated.timing(mascotIdle, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(mascotIdle, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setTimeout(startIdleAnimation, 6000);
        });
      };

      // Nudge animation: points at primary card after 5 seconds of inactivity
      const startNudgeAnimation = () => {
        setTimeout(() => {
          Animated.sequence([
            Animated.timing(mascotNudge, {
              toValue: 1,
              duration: 400,
              easing: Easing.out(Easing.back(1.2)),
              useNativeDriver: true,
            }),
            Animated.timing(mascotNudge, {
              toValue: 0,
              duration: 400,
              easing: Easing.in(Easing.back(1.2)),
              useNativeDriver: true,
            }),
          ]).start();
        }, 5000);
      };

      startIdleAnimation();
      startNudgeAnimation();
    }
  }, [sortedGoalsData.length]);

  // Progress ring animation for behavioral nudge
  useEffect(() => {
    if (sortedGoalsData.length === 0) {
      Animated.timing(progressRing, {
        toValue: 0.02, // 2% progress to leverage goal gradient effect
        duration: 1000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }
  }, []);

  const idleTransform = mascotIdle.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02], // 2% bob
  });

  const nudgeTransform = mascotNudge.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10], // Points left toward primary action
  });

  const celebrateTransform = mascotCelebrate.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  useEffect(() => {
    logger.info(
      "🔄 [GOALS COMPONENT] Goals data changed:",
      goalsData?.length || 0,
      "goals"
    );
    setLocalGoalsData(goalsData);
  }, [goalsData]);

  const handleSaveGoal = async (goalInput: GoalInput) => {
    try {
      await addManualGoal(goalInput);
      // Force refresh to ensure UI updates
      await refreshGoals();
      // Notify parent component to refresh its data
      if (onGoalAdded) {
        await onGoalAdded();
      }

      // Trigger celebration animation
      Animated.sequence([
        Animated.timing(mascotCelebrate, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(mascotCelebrate, {
          toValue: 0,
          duration: 400,
          easing: Easing.in(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]).start();

      setState((prev: GoalsState) => ({
        ...prev,
        showAddGoalModal: false,
        notification: {
          visible: true,
          message: "Goal created successfully!",
        },
      }));
    } catch (err) {
      logger.error("Manual goal save failed:", err);
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
            logger.error("Error deleting goal:", error);
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

  const handleOptimisticUpdate = (updatedGoal: Goal) => {
    // Update local goals data immediately for better UX
    setLocalGoalsData((prev) =>
      prev.map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal))
    );

    // Update selected goal to reflect changes in modal
    setSelectedGoal(updatedGoal);
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
    } catch (error) {
      logger.error("Error updating goal:", error);
      setState((prev: GoalsState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Failed to update goal",
        },
      }));

      // Revert optimistic update on error by refreshing goals
      await refreshGoals();
    }
  };

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
            <View style={(styles as any).emptyMascotWrap}>
              <Image
                source={require("../../assets/mascot1.jpg")}
                style={(styles as any).emptyMascotImage}
                resizeMode="cover"
              />
            </View>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="flag-outline" size={28} color="#4A90E2" />
            </View>
            <Text style={styles.emptyStateTitle}>No goals yet</Text>
            <Text style={styles.emptyStateSubtitle}>
              Start with one small goal. We'll help you stay on track.
            </Text>

            <TouchableOpacity
              style={styles.emptyPrimaryButton}
              activeOpacity={0.9}
              onPress={() =>
                setState((prev: GoalsState) => ({
                  ...prev,
                  showAddGoalModal: true,
                }))
              }
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.emptyPrimaryButtonText}>
                Create your first goal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emptySecondaryLink}
              onPress={() => router.push("/chat")}
            >
              <Ionicons name="sparkles" size={16} color="#4A90E2" />
              <Text style={styles.emptySecondaryLinkText}>
                Or ask Finny to set one up
              </Text>
            </TouchableOpacity>

            <Text style={styles.emptyHint}>You can edit or delete anytime</Text>
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
        onOptimisticUpdate={handleOptimisticUpdate}
      />
    </View>
  );
};

export default Goals;
