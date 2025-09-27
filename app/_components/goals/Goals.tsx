import * as React from "react";
import { useState, useEffect, useRef } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

// UUID generator for temporary IDs
const generateId = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  const insets = useSafeAreaInsets();
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
      // Optimistically add a local goal card for smooth UX
      const tempId = generateId();
      const optimisticGoal: Goal = {
        id: tempId as any,
        user_id: undefined as any,
        label: goalInput.label,
        description: null as any,
        note: goalInput.note || undefined,
        target_amount: goalInput.target_amount,
        current_amount: goalInput.current_amount || 0,
        target_date: goalInput.target_date,
        category: goalInput.category,
        status: "active" as any,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setLocalGoalsData((prev) => [optimisticGoal, ...prev]);

      // Persist in background; server refresh will reconcile and replace temp
      await addManualGoal(goalInput);
      await refreshGoals();

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

  const handleDeleteGoal = async (goalToDelete: Goal) => {
    try {
      // Optimistic removal
      setLocalGoalsData((prev) => prev.filter((g) => g.id !== goalToDelete.id));
      await deleteGoal(goalToDelete.id);
      // Sync with server to ensure consistency and cache update
      await refreshGoals();
      setState((prev: GoalsState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Goal deleted successfully",
        },
      }));
    } catch (error) {
      logger.error("Error deleting goal:", error);
      // Revert by refreshing full list
      await refreshGoals();
      setState((prev: GoalsState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Failed to delete goal",
        },
      }));
    }
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
      // Optimistically update local list and selected goal
      const existing = localGoalsData.find((g) => g.id === id);
      if (existing) {
        const optimisticGoal: Goal = {
          ...existing,
          ...updates,
          updated_at: new Date().toISOString(),
        } as Goal;
        setLocalGoalsData((prev) =>
          prev.map((g) => (g.id === id ? optimisticGoal : g))
        );
        setSelectedGoal(optimisticGoal);
      }

      if (updateGoal) {
        await updateGoal(id, updates);
      }

      setState((prev: GoalsState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Goal updated successfully",
        },
      }));
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
          { paddingBottom: Math.max(insets.bottom, 16) + 120 },
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

      {/* Remove overlay loader; rely solely on RefreshControl spinner to avoid duplication */}

      {sortedGoalsData.length !== 0 && (
        <TouchableOpacity
          style={[
            styles.addGoalButton,
            { bottom: Math.max(insets.bottom, 16) + 72 },
          ]}
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
