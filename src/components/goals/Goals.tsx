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
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import GoalNotification from "@/src/components/goals/GoalNotification";
import AddGoalModal from "@/src/components/goals/AddGoalModal";
import GoalItem from "@/src/components/goals/GoalItem";
import GoalDetailModal from "@/src/components/goals/GoalDetailModal";
import FinanceFact from "@/src/components/onboarding/FinanceFact";
import { styles } from "@/src/styles/goalsStyles";
import { useGoals } from "@/src/hooks/useGoals";
import { Goal } from "@/src/types/finny";
import { GoalInput } from "@/src/types/addGoalModalTypes";
import { GoalsProps, GoalsState } from "@/src/types/goalsTypes";
import { useRouter } from "expo-router";
import logger from "@/src/utils/core/logger";
import { useDemoMode } from "@/src/contexts/DemoContext";
import { supabase } from "@/src/lib/supabase/supabase";
import AppStorage from "@/src/utils/storage/storage";
import { getAccountBalance } from "@/src/utils/accountBalance";

const Goals: React.FC<GoalsProps> = ({
  deleteGoal,
  updateGoal,
  refreshGoals: propRefreshGoals,
  goalsAnimations,
  goalsData,
  onRefreshStart,
  onRefreshEnd,
  onGoalAdded,
  isPremiumLocked = false,
  onUpgradePress,
}) => {
  const insets = useSafeAreaInsets();
  const { isDemoMode } = useDemoMode();
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
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Store timeout for delayed deletion
  const prevPremiumLockedRef = useRef(isPremiumLocked);

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
        .select("current_balance, available_balance, type")
        .in(
          "item_id",
          userItems.map((item) => item.item_id),
        );

      if (accountsError || !accounts?.length) {
        setHasConnectedAccounts(false);
        return;
      }

      const totalBalance = accounts.reduce(
        (sum, account) => sum + getAccountBalance(account),
        0,
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
    // Sync goalsData prop to local state
    // Merge strategy: keep optimistic updates that aren't in server data yet
    const justUnlocked = prevPremiumLockedRef.current && !isPremiumLocked;

    setLocalGoalsData((prev) => {
      // When the paywall unlocks, replace any demo teaser goals with the user's real goals.
      if (justUnlocked) {
        return goalsData;
      }

      // If server data is empty or we have no local data, just use server data
      if (goalsData.length === 0 || prev.length === 0) {
        return goalsData;
      }

      // Merge: start with server data, then add any local goals not yet on server
      const serverGoalIds = new Set(goalsData.map((g) => g.id));
      const localOnlyGoals = prev.filter((g) => !serverGoalIds.has(g.id));

      // Combine server data with any local-only goals (optimistic updates)
      return [...goalsData, ...localOnlyGoals];
    });

    prevPremiumLockedRef.current = isPremiumLocked;
  }, [goalsData, isPremiumLocked]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  const handleSaveGoal = async (goalInput: GoalInput) => {
    try {
      // Save to server and get the created goal back
      const createdGoal = await addManualGoal(goalInput);

      if (createdGoal) {
        // Optimistically add to local list immediately for instant UI update
        setLocalGoalsData((prev) => {
          // Check if goal already exists (from background refresh)
          const exists = prev.some((g) => g.id === createdGoal.id);
          if (exists) {
            // Update existing goal
            return prev.map((g) => (g.id === createdGoal.id ? createdGoal : g));
          }
          // Add new goal
          return [createdGoal, ...prev];
        });

        // Open the goal detail modal automatically with the real goal
        // Small delay ensures AddGoalModal closes first, then detail modal opens smoothly
        requestAnimationFrame(() => {
          setSelectedGoal(createdGoal);
        });

        // Refresh in background to ensure everything is in sync
        // This will update goalsData prop which will sync to localGoalsData
        if (propRefreshGoals) {
          propRefreshGoals().catch((err) => {
            logger.error("Background refresh failed:", err);
          });
        } else {
          refreshGoals().catch((err) => {
            logger.error("Background refresh failed:", err);
          });
        }
      }
    } catch (err) {
      logger.error("Manual goal save failed:", err);
      // Re-throw error so AddGoalModal can handle it
      throw err;
    }
  };

  const handleDeleteGoal = async (goalToDelete: Goal) => {
    // CRITICAL: Store deleted goal for potential undo BEFORE any UI changes
    setDeletedGoal(goalToDelete);

    // CRITICAL: Optimistic removal from UI - user sees immediate feedback
    setLocalGoalsData((prev) => prev.filter((g) => g.id !== goalToDelete.id));

    // CRITICAL: Show notification immediately - this MUST render before deletion happens
    setState((prev: GoalsState) => ({
      ...prev,
      notification: {
        visible: true,
        message: "Goal deleted successfully",
        action: "delete",
        goalId: goalToDelete.id,
      },
    }));

    // CRITICAL: Clear any existing timeout to prevent race conditions
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }

    // CRITICAL: Schedule deletion from server AFTER notification auto-closes (3.5 seconds)
    // Using 3.5s instead of 3s to ensure notification animation completes first
    // This gives user time to undo via the notification
    deleteTimeoutRef.current = setTimeout(async () => {
      // Double-check that undo wasn't called (deletedGoal should be null if undo was used)
      if (!deletedGoal || deletedGoal.id !== goalToDelete.id) {
        // Undo was called, don't delete
        deleteTimeoutRef.current = null;
        return;
      }

      try {
        await deleteGoal(goalToDelete.id);
        // Sync with server to ensure consistency and cache update
        if (propRefreshGoals) {
          await propRefreshGoals();
        } else {
          await refreshGoals();
        }
        // Clear the stored deleted goal after successful deletion
        setDeletedGoal(null);
        deleteTimeoutRef.current = null;
      } catch (error) {
        logger.error("Error deleting goal from server:", error);
        // On error, restore the goal in UI
        setLocalGoalsData((prev) => [...prev, goalToDelete]);
        setDeletedGoal(null);
        deleteTimeoutRef.current = null;
        setState((prev: GoalsState) => ({
          ...prev,
          notification: {
            visible: true,
            message: "Failed to delete goal",
            action: "update",
          },
        }));
      }
    }, 3500); // 3.5 seconds to ensure notification has time to display and auto-close
  };

  const handleOptimisticUpdate = (updatedGoal: Goal) => {
    // Update local goals data immediately for better UX
    setLocalGoalsData((prev) =>
      prev.map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal)),
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
          prev.map((g) => (g.id === id ? optimisticGoal : g)),
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
    // CRITICAL: Clear the scheduled deletion timeout FIRST
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }

    // CRITICAL: Restore the goal to local data (it was never deleted from server)
    if (deletedGoal && deletedGoal.id === goalId) {
      setLocalGoalsData((prev) => {
        // Check if goal already exists (prevent duplicates)
        const exists = prev.some((g) => g.id === goalId);
        if (exists) return prev;
        return [...prev, deletedGoal];
      });

      // Clear the stored deleted goal
      setDeletedGoal(null);
    }

    // Hide notification
    setState((prev: GoalsState) => ({
      ...prev,
      notification: { visible: false, message: "" },
    }));
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

  const showUpgradeOverlay = isPremiumLocked && sortedGoalsData.length > 0;

  return (
    <View style={styles.goalsContainer}>
      {state.notification.visible && (
        <GoalNotification
          key={`${state.notification.message}-${state.notification.action}-${state.notification.goalId}`}
          message={state.notification.message}
          action={state.notification.action}
          goalId={state.notification.goalId}
          isModalOpen={selectedGoal !== null}
          onClose={() => {
            setState((prev: GoalsState) => ({
              ...prev,
              notification: { visible: false, message: "" },
            }));
            // CRITICAL FIX: Only proceed with deletion if notification closed naturally (not via undo)
            // The timeout will handle the actual deletion, but we need to ensure it's still scheduled
            // If user clicked undo, handleUndoDelete already cleared the timeout
            // If notification auto-closed, the timeout will execute the deletion
          }}
          onUndo={handleUndoDelete}
        />
      )}
      <ScrollView
        contentContainerStyle={[
          styles.goalsWrapper,
          !sortedGoalsData.length && styles.emptyGoalsWrapper,
          !sortedGoalsData.length && {
            paddingBottom: Math.max(insets.bottom, 16),
          },
          sortedGoalsData.length > 0 && {
            paddingBottom: Math.max(insets.bottom, 16) + 120,
          },
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
            {/* Mascot focus area - emotional anchor */}
            <View style={styles.mascotFocusArea}>
              <View style={styles.mascotGlowContainer}>
                <View style={styles.mascotGlow} />
                <Image
                  source={require("../../../assets/images/thinking4.png")}
                  style={styles.mascotFocusImage}
                  resizeMode="cover"
                />
              </View>
            </View>

            {/* Primary headline - reassurance first */}
            <Text style={styles.emptyStatePrimaryHeadline}>
              Let's figure out your money, together.
            </Text>

            {/* Supporting subtext - remove fear */}
            <Text style={styles.emptyStateSupportingText}>
              You don't need a perfect goal.
              {"\n"}A thought, a worry, or a rough idea is enough.
            </Text>

            {/* Primary CTA button */}
            <TouchableOpacity
              style={styles.talkToFinnyButton}
              activeOpacity={0.8}
              onPress={async () => {
                AppStorage.setItemSync("initialChatMessage", "");
                router.push("/chat");
              }}
            >
              <Text style={styles.talkToFinnyButtonText}>Talk to Finny</Text>
            </TouchableOpacity>

            {/* Assistive suggestion chips */}
            <View style={styles.suggestionChipsSection}>
              <Text style={styles.suggestionChipsLabel}>
                Not sure where to start?
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionChipsContainer}
              >
                {[
                  "Am I spending too much?",
                  "I want to start saving",
                  "Help me plan something upcoming",
                ].map((prompt, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionChip}
                    activeOpacity={0.7}
                    onPress={async () => {
                      AppStorage.setItemSync("initialChatMessage", prompt);
                      router.push("/chat");
                    }}
                  >
                    <Text style={styles.suggestionChipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Secondary action - quiet, optional */}
            <TouchableOpacity
              style={styles.createManualButton}
              activeOpacity={0.7}
              onPress={() =>
                setState((prev: GoalsState) => ({
                  ...prev,
                  showAddGoalModal: true,
                }))
              }
            >
              <Text style={styles.createManualButtonText}>
                Create a goal manually
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.transactionLinkTipLabel}>
              Tip: Link transactions to goals to automatically add to your goal
              amount
            </Text>
            {sortedGoalsData.map((item, index) => (
              <GoalItem
                key={item.id}
                item={item}
                index={index}
                animation={goalsAnimations[index]}
                onPress={() => {
                  if (isPremiumLocked && onUpgradePress) {
                    onUpgradePress();
                  } else {
                    setSelectedGoal(item);
                  }
                }}
              />
            ))}
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 16,
              }}
            >
              <FinanceFact screenKey="goals" />
            </View>
          </>
        )}
      </ScrollView>

      {/* Premium lock: simple blur overlay with unlock button box */}
      {showUpgradeOverlay && onUpgradePress && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Simple full blur */}
          <BlurView
            intensity={15}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />

          {/* Unlock button box */}
          <View
            style={[
              {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 18,
                paddingTop: 26,
                paddingBottom: Math.max(16, insets.bottom + 25) + 28,
                alignItems: "center",
              },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={{
                width: "100%",
                maxWidth: 440,
                borderRadius: 22,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(12, 16, 22, 0.35)",
              }}
              pointerEvents="auto"
            >
              <BlurView
                intensity={Platform.OS === "ios" ? 28 : 20}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.03)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 30,
                  paddingBottom: 30,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                    alignSelf: "center",
                    maxWidth: 320,
                  }}
                >
                  <Ionicons
                    name="flag"
                    size={20}
                    color="rgba(255, 255, 255, 0.92)"
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      color: "rgba(255, 255, 255, 0.95)",
                      fontSize: 21,
                      fontWeight: "700",
                      ...(Platform.OS === "ios" ? { letterSpacing: 0.2 } : {}),
                    }}
                    numberOfLines={1}
                  >
                    Your financial goals
                  </Text>
                </View>
                <Text
                  style={{
                    color: "rgba(255, 255, 255, 0.7)",
                    fontSize: 14,
                    marginBottom: 20,
                    textAlign: "center",
                    maxWidth: 280,
                  }}
                  numberOfLines={3}
                >
                  Track progress. Stay on target.
                </Text>
                <TouchableOpacity
                  onPress={onUpgradePress}
                  activeOpacity={0.88}
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: "rgba(74, 144, 226, 0.3)",
                  }}
                >
                  <LinearGradient
                    colors={[
                      "rgba(74, 144, 226, 0.40)",
                      "rgba(74, 145, 226, 0.78)",
                    ]}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 14,
                      paddingHorizontal: 24,
                      borderRadius: 24,
                    }}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name="lock-open" size={18} color="#fff" />
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 16,
                        fontWeight: "700",
                        letterSpacing: 0.3,
                      }}
                    >
                      Unlock with Finny Pro
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Remove overlay loader; rely solely on RefreshControl spinner to avoid duplication */}

      {sortedGoalsData.length !== 0 && !isPremiumLocked && !isDemoMode && (
        <TouchableOpacity
          style={[
            styles.addGoalButton,
            { bottom: Math.max(insets.bottom, 16) + 72 },
          ]}
          onPress={() => {
            if (isDemoMode) return;
            setState((prev: GoalsState) => ({
              ...prev,
              showAddGoalModal: true,
            }));
          }}
          disabled={isDemoMode}
          activeOpacity={isDemoMode ? 1 : 0.8}
        >
          <Ionicons
            name="add-circle"
            size={24}
            color={isDemoMode ? "#666" : "#4A90E2"}
          />
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
