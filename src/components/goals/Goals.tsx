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
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import GoalNotification from "@/src/components/goals/GoalNotification";
import AddGoalModal from "@/src/components/goals/AddGoalModal";
import GoalItem from "@/src/components/goals/GoalItem";
import GoalDetailModal from "@/src/components/goals/GoalDetailModal";
import { styles } from "@/src/styles/goalsStyles";
import { useGoals } from "@/src/hooks/useGoals";
import { Goal } from "@/src/types/finny";
import { GoalInput } from "@/src/types/addGoalModalTypes";
import { GoalsProps, GoalsState } from "@/src/types/goalsTypes";
import { useRouter } from "expo-router";
import logger from "@/src/utils/logger";
import { supabase } from "@/src/lib/supabase/supabase";

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
  refreshGoals: propRefreshGoals,
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
  const [deletedGoal, setDeletedGoal] = useState<Goal | null>(null); // Store for undo

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

  // Simple celebration animation for when user creates first goal
  const mascotCelebrate = useRef(new Animated.Value(0)).current;

  const celebrateTransform = mascotCelebrate.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  useEffect(() => {
    // Only log when goals count actually changes (not on every render)
    if (localGoalsData?.length !== goalsData?.length) {
      logger.info(
        "🔄 [GOALS COMPONENT] Goals data changed:",
        goalsData?.length || 0,
        "goals"
      );
    }
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
      if (propRefreshGoals) {
        await propRefreshGoals();
      } else {
        await refreshGoals();
      }

      // Trigger subtle celebration animation
      Animated.sequence([
        Animated.timing(mascotCelebrate, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(mascotCelebrate, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();

      setState((prev: GoalsState) => ({
        ...prev,
        showAddGoalModal: false,
        notification: {
          visible: true,
          message: "Yay! You created a new milestone!",
          action: "create",
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
      // Store deleted goal for potential undo
      setDeletedGoal(goalToDelete);

      // Optimistic removal
      setLocalGoalsData((prev) => prev.filter((g) => g.id !== goalToDelete.id));
      await deleteGoal(goalToDelete.id);
      // Sync with server to ensure consistency and cache update
      if (propRefreshGoals) {
        await propRefreshGoals();
      } else {
        await refreshGoals();
      }
      setState((prev: GoalsState) => ({
        ...prev,
        notification: {
          visible: true,
          message: "Goal deleted successfully",
          action: "delete",
          goalId: goalToDelete.id,
        },
      }));
    } catch (error) {
      logger.error("Error deleting goal:", error);
      // Clear stored deleted goal on error
      setDeletedGoal(null);
      // Revert by refreshing full list
      if (propRefreshGoals) {
        await propRefreshGoals();
      } else {
        await refreshGoals();
      }
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
          message: "Goal updated successfully!",
          action: "update",
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
      if (propRefreshGoals) {
        await propRefreshGoals();
      } else {
        await refreshGoals();
      }
    }
  };

  const handleUndoDelete = async (goalId: string) => {
    try {
      if (deletedGoal) {
        // Restore the goal to local data
        setLocalGoalsData((prev) => [...prev, deletedGoal]);

        // Re-create the goal in the database
        await addManualGoal({
          label: deletedGoal.label,
          target_amount: deletedGoal.target_amount,
          current_amount: deletedGoal.current_amount,
          target_date: deletedGoal.target_date,
          category: deletedGoal.category,
          note: deletedGoal.note,
        });

        // Clear the stored deleted goal
        setDeletedGoal(null);

        // Refresh to ensure consistency
        if (propRefreshGoals) {
          await propRefreshGoals();
        } else {
          await refreshGoals();
        }
      }
    } catch (error) {
      logger.error("Error undoing goal deletion:", error);
      // If undo fails, refresh to get current state
      if (propRefreshGoals) {
        await propRefreshGoals();
      } else {
        await refreshGoals();
      }
    }
  };

  const onRefresh = async () => {
    try {
      onRefreshStart?.();
      setState((prev: GoalsState) => ({ ...prev, refreshing: true }));
      if (propRefreshGoals) {
        await propRefreshGoals();
      } else {
        await refreshGoals();
      }
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
          action={state.notification.action}
          goalId={state.notification.goalId}
          onClose={() =>
            setState((prev: GoalsState) => ({
              ...prev,
              notification: { visible: false, message: "" },
            }))
          }
          onUndo={handleUndoDelete}
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
            {/* Clean, minimal mascot */}
            <View style={styles.mascotContainer}>
              <View style={styles.mascotImageContainer}>
                <Image
                  source={require("../../../assets/images/mascotgpt.png")}
                  style={styles.emptyStateImage}
                  resizeMode="cover"
                />
              </View>
            </View>

            {/* Direct, outcome-focused messaging */}
            <View style={styles.emptyHeaderSection}>
              <Text style={styles.emptyStateTitle}>
                What do you want to achieve?
              </Text>
              <Text style={styles.emptyStateSubtitle}>
                Set a goal and we'll help you get there.
              </Text>
            </View>

            {/* Single, clear call-to-action with liquid glass */}
            {(() => {
              const isIOS = Platform.OS === "ios";
              const iosVersion = isIOS
                ? parseInt(String(Platform.Version).split(".")[0] || "0", 10)
                : 0;
              const shouldUseLiquidGlass = isIOS && iosVersion >= 18;
              const ButtonShell = shouldUseLiquidGlass ? GlassView : View;

              return (
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  activeOpacity={0.9}
                  onPress={() =>
                    setState((prev: GoalsState) => ({
                      ...prev,
                      showAddGoalModal: true,
                    }))
                  }
                >
                  {shouldUseLiquidGlass ? (
                    <ButtonShell
                      glassEffectStyle="regular"
                      tintColor="rgba(74, 144, 226, 0.8)"
                      style={styles.glassButtonContainer}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={24}
                        color="#fff"
                      />
                      <Text style={styles.primaryActionButtonText}>
                        Create your first goal
                      </Text>
                    </ButtonShell>
                  ) : (
                    <LinearGradient
                      colors={["#4A90E2", "#357ABD", "#2E6BA8"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.gradientButtonContainer}
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={24}
                        color="#fff"
                      />
                      <Text style={styles.primaryActionButtonText}>
                        Create your first goal
                      </Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              );
            })()}

            {/* Alternative path - more compelling */}
            <TouchableOpacity
              style={styles.secondaryActionButton}
              activeOpacity={0.8}
              onPress={() => router.push("/chat")}
            >
              <Text style={styles.secondaryActionButtonText}>
                Need ideas? Ask Finny to suggest goals for you
              </Text>
            </TouchableOpacity>

            {/* Social proof - the only element that actually works */}
            <Text style={styles.footerNote}>
              Join thousands who've turned their dreams into reality with
              structured goal tracking
            </Text>
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
