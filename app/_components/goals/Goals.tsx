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
            {/* Header Section with Fresh Start Timing */}
            <Text style={styles.emptyStateTitle}>
              {(() => {
                const now = new Date();
                const hour = now.getHours();
                const day = now.getDay();

                // Fresh start moments
                if (hour >= 9 && hour <= 11 && day === 1) {
                  return "New week, new goal";
                } else if (hour >= 6 && hour <= 9) {
                  return "Good morning, let's plan";
                } else if (hour >= 17 && hour <= 19) {
                  return "Evening planning time";
                } else {
                  return "Plan your next money move";
                }
              })()}
            </Text>
            <Text style={styles.emptyStateSubtitle}>
              Pick a goal. I will do the math.
            </Text>

            {/* Progress Ring for Behavioral Nudge */}
            <View style={styles.progressRingContainer}>
              <View style={styles.progressRingBackground}>
                <Animated.View
                  style={[
                    styles.progressRingFill,
                    {
                      transform: [
                        {
                          rotate: progressRing.interpolate({
                            inputRange: [0, 1],
                            outputRange: ["0deg", "360deg"],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressRingText}>2%</Text>
            </View>
            <Text style={styles.progressRingMessage}>
              You are already on your way
            </Text>

            {/* Finny with subtle glow and purposeful animations */}
            <View style={styles.mascotContainer}>
              <View style={styles.mascotGlow} />
              <Animated.Image
                source={require("../../assets/mascot1.jpg")}
                style={[
                  styles.emptyStateImage,
                  {
                    transform: [
                      { scale: idleTransform },
                      { translateX: nudgeTransform },
                      { scaleX: -1 },
                    ],
                  },
                ]}
                resizeMode="contain"
              />
            </View>

            {/* Action Cards Row */}
            <View style={styles.actionCardsRow}>
              <TouchableOpacity
                style={styles.primaryActionCard}
                onPress={() => router.push("/chat")}
              >
                <View style={styles.primaryActionCardGlow} />
                <View style={styles.actionCardContent}>
                  <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
                  <Text style={styles.primaryActionText}>
                    Create a goal with Finny
                  </Text>
                  <Text style={styles.actionSubtext}>Takes 30 seconds</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionCard}
                onPress={() =>
                  setState((prev: GoalsState) => ({
                    ...prev,
                    showAddGoalModal: true,
                  }))
                }
              >
                <View style={styles.actionCardContent}>
                  <Ionicons name="library" size={24} color="#4A90E2" />
                  <Text style={styles.secondaryActionText}>Use a template</Text>
                  <View style={styles.templateChips}>
                    {hasConnectedAccounts ? (
                      <>
                        <Text style={styles.templateChip}>
                          Emergency Fund $
                          {Math.round(accountBalance * 0.1).toLocaleString()}
                        </Text>
                        <Text style={styles.templateChip}>
                          Trip $
                          {Math.round(accountBalance * 0.2).toLocaleString()}
                        </Text>
                        <Text style={styles.templateChip}>
                          New Phone $
                          {Math.round(accountBalance * 0.05).toLocaleString()}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.templateChip}>Emergency Fund</Text>
                        <Text style={styles.templateChip}>Trip</Text>
                        <Text style={styles.templateChip}>New Phone</Text>
                      </>
                    )}
                  </View>
                  {hasConnectedAccounts && (
                    <Text style={styles.templateSuggestion}>
                      Suggested by Finny
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tertiaryActionCard}
                onPress={() =>
                  setState((prev: GoalsState) => ({
                    ...prev,
                    showAddGoalModal: true,
                  }))
                }
              >
                <View style={styles.actionCardContent}>
                  <Ionicons
                    name="add-circle-outline"
                    size={24}
                    color="#20B2AA"
                  />
                  <Text style={styles.tertiaryActionText}>Add my own</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Sample Goals Preview */}
            <View style={styles.sampleGoalsContainer}>
              <Text style={styles.sampleGoalsTitle}>
                Your goals will show up here
              </Text>
              <View style={styles.sampleGoalCard}>
                <View style={styles.sampleGoalCardShine} />
                <View style={styles.sampleGoalHeader}>
                  <View style={styles.sampleGoalIcon} />
                  <View style={styles.sampleGoalInfo}>
                    <View style={styles.sampleGoalTitlePlaceholder} />
                    <View style={styles.sampleGoalAmountPlaceholder} />
                  </View>
                </View>
                <View style={styles.sampleProgressBar}>
                  <View style={styles.sampleProgressFill} />
                </View>
                <View style={styles.sampleGoalDate} />
              </View>
              <View style={styles.sampleGoalCard}>
                <View style={styles.sampleGoalCardShine} />
                <View style={styles.sampleGoalHeader}>
                  <View style={styles.sampleGoalIcon} />
                  <View style={styles.sampleGoalInfo}>
                    <View style={styles.sampleGoalTitlePlaceholder} />
                    <View style={styles.sampleGoalAmountPlaceholder} />
                  </View>
                </View>
                <View style={styles.sampleProgressBar}>
                  <View style={styles.sampleProgressFill} />
                </View>
                <View style={styles.sampleGoalDate} />
              </View>
            </View>

            {/* Growth Hook */}
            <TouchableOpacity style={styles.growthHook}>
              <Text style={styles.growthHookText}>
                Invite a friend and both of you get a custom goal plan
              </Text>
            </TouchableOpacity>
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
