// hooks/useGoals.ts

import { useState, useEffect } from "react";
import { DeviceEventEmitter } from "react-native";
import AppStorage from "@/src/utils/storage/storage";
import { Goal } from "@/src/types/finny";
import { GoalInput } from "@/src/types/addGoalModalTypes";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import { API_BASE_URL } from "@/src/utils/core/apiUrl";
import { invalidateGoalsCache } from "@/src/shared/utils/cacheInvalidation";
import { useDemoMode } from "@/src/contexts/DemoContext";
import { demoGoals } from "@/src/data/demo";

const GOALS_CACHE_KEY = CACHE_CONFIG.KEYS.GOALS;
const GOALS_CACHE_TIMESTAMP_KEY = CACHE_CONFIG.KEYS.GOALS_TIMESTAMP;
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day in milliseconds

export function useGoals(pushChat: (sender: "user" | "finny", message: string) => void) {
  const { isDemoMode } = useDemoMode();
  const [goalsData, setGoalsData] = useState<Goal[]>(isDemoMode ? demoGoals : []);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(!isDemoMode);

  // Load cached goals immediately, then refresh from server (or demo goals when in demo mode)
  useEffect(() => {
    loadGoalsWithCache();
  }, [isDemoMode]);

  // Listen for auth state changes (token refresh)
  useEffect(() => {
    const authSubscription = DeviceEventEmitter.addListener(
      "authStateChanged",
      async (data) => {
        if (data && data.event === "TOKEN_REFRESHED" && data.validated) {
          // Add small delay to ensure session is fully propagated
          setTimeout(async () => {
            await loadGoalsWithCache();
          }, 200);
        }
      }
    );

    return () => {
      authSubscription.remove();
    };
  }, []);

  // Cache management functions
  const saveGoalsToCache = async (goals: Goal[]): Promise<void> => {
    try {
      const timestamp = Date.now().toString();
      // Use synchronous operations for better performance
      AppStorage.setItemSync(GOALS_CACHE_KEY, JSON.stringify(goals));
      AppStorage.setItemSync(GOALS_CACHE_TIMESTAMP_KEY, timestamp);
    } catch (error) {
      logger.error("❌ [GOALS CACHE] Failed to save goals to cache:", error);
    }
  };

  const loadGoalsFromCache = async (): Promise<Goal[] | null> => {
    try {
      // Use synchronous reads for instant cache access (MMKV advantage)
      const cachedGoalsString = AppStorage.getItemSync(GOALS_CACHE_KEY);
      const timestampString = AppStorage.getItemSync(GOALS_CACHE_TIMESTAMP_KEY);

      if (!cachedGoalsString || !timestampString) {
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      const cachedGoals = JSON.parse(cachedGoalsString) as Goal[];
      return cachedGoals;
    } catch (error) {
      logger.error("❌ [GOALS CACHE] Failed to load goals from cache:", error);
      return null;
    }
  };

  const isCacheValid = async (): Promise<boolean> => {
    try {
      const timestampString = AppStorage.getItemSync(GOALS_CACHE_TIMESTAMP_KEY);
      if (!timestampString) return false;

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      return cacheAge < CACHE_DURATION;
    } catch (error) {
      logger.error("❌ [GOALS CACHE] Failed to check cache validity:", error);
      return false;
    }
  };

  const loadGoalsWithCache = async (): Promise<void> => {
    try {
      if (isDemoMode) {
        setGoalsData(demoGoals);
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      // Always try to load from cache first for immediate UI update
      const cachedGoals = await loadGoalsFromCache();
      if (cachedGoals && cachedGoals.length > 0) {
        setGoalsData(cachedGoals);
        setIsInitialLoad(false);
      }

      // Check if we need to refresh from server
      const cacheValid = await isCacheValid();
      if (!cacheValid || isInitialLoad) {
        await refreshGoalsFromServer(!!cachedGoals);
      } else {
        setLoading(false);
        setIsInitialLoad(false);
      }
    } catch (error) {
      logger.error("❌ [GOALS CACHE] Error in loadGoalsWithCache:", error);
      // Fallback to direct server fetch
      await refreshGoalsFromServer(false);
    }
  };

  const refreshGoalsFromServer = async (hasCache: boolean = false): Promise<void> => {
    try {
      if (isDemoMode) {
        setGoalsData(demoGoals);
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      // Only log server refresh when there's no cache (first load or forced refresh)
      if (!hasCache) {
        logger.info("🔄 [GOALS] Loading from database...");
        setLoading(true);
      }
      
      const authResult = await getAuthenticatedUser();
      
      if (!authResult?.user?.id) {
        logger.error("❌ [GOALS] User not authenticated for refresh");
        return;
      }
      
      const user = authResult.user;

      const { data: goals, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error("❌ [GOALS] Failed to load goals:", error);
        if (pushChat) pushChat("finny", "Couldn't load your goals. Try again later.");
        return;
      }

      // logger.info("📊 [GOALS] Loaded goals from database:", goals?.length || 0, "goals");
      // logger.info("📋 [GOALS] Goals data:", goals);
      
      const goalsArray = goals || [];
      setGoalsData(goalsArray);
      
      // Save to cache after successful fetch
      await saveGoalsToCache(goalsArray);
    } catch (e) {
      logger.error("❌ [GOALS] Failed to load goals:", e);
      if (pushChat) pushChat("finny", "Couldn't load your goals. Try again later.");
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  // Wrapper function for external calls (maintains backward compatibility)
  const refreshGoals = async (): Promise<void> => {
    await refreshGoalsFromServer(false);
  };

  const saveGoal = async (goalInput: GoalInput): Promise<Goal | null> => {
    try {
      logger.info("🎯 [GOALS] Saving new goal:", goalInput);
      
      const authResult = await getAuthenticatedUser();
      
      if (!authResult?.user?.id) {
        logger.error("❌ [GOALS] User not authenticated");
        if (pushChat) pushChat("finny", "You need to be logged in to save goals.");
        return null;
      }
      
      const user = authResult.user;

      const goalData = {
        user_id: user.id,
        label: goalInput.label.trim(),
        note: goalInput.note?.trim() || null,
        target_amount: goalInput.target_amount,
        current_amount: goalInput.current_amount || 0,
        target_date: goalInput.target_date,
        category: goalInput.category,
        status: 'active' as const
      };

      logger.info("💾 [GOALS] Inserting goal data:", goalData);

      const { data, error } = await supabase
        .from('goals')
        .insert([goalData])
        .select()
        .single();

      if (error) {
        logger.error("❌ [GOALS] Error saving goal:", error);
        if (pushChat) pushChat("finny", "Couldn't save your goal. Try again later.");
        return null;
      }

      logger.info("✅ [GOALS] Goal saved successfully:", data);

      // Return goal immediately for smooth UI
      const goal = data as Goal;

      // Store goal creation memory in Supermemory (non-blocking)
      setTimeout(async () => {
        try {
          const BASE_URL = API_BASE_URL;
          await authenticatedFetch(`${BASE_URL}/api/memory`, {
            method: "POST",
            body: JSON.stringify({
              type: "goal_creation",
              goalData: {
                id: data.id,
                label: data.label,
                target_amount: data.target_amount,
                current_amount: data.current_amount,
                target_date: data.target_date,
                category: data.category,
                note: data.note,
              },
              createdVia: "goals_screen",
            }),
          }).catch((error) => {
            logger.error("❌ [GOAL MEMORY] Failed to store goal memory:", error);
          });
        } catch (error) {
          logger.error("❌ [GOAL MEMORY] Error storing goal memory:", error);
        }
      }, 0);

      // Trigger goal analysis (non-blocking)
      setTimeout(async () => {
        try {
          const BASE_URL = API_BASE_URL;
          logger.info(`🚀 [GOAL ANALYSIS] Triggering analysis for goal: ${data.id}`);
          const response = await authenticatedFetch(
            `${BASE_URL}/api/goals?action=analyze`,
            {
              method: "POST",
              body: JSON.stringify({
                goalId: data.id,
                action: "analyze",
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            logger.error(
              `❌ [GOAL ANALYSIS] Request failed with status ${response.status}:`,
              errorText
            );
          } else {
            const result = await response.json();
            logger.info(`✅ [GOAL ANALYSIS] Analysis triggered successfully:`, result);
          }
        } catch (error) {
          logger.error("❌ [GOAL ANALYSIS] Error triggering analysis:", error);
          // Don't show error to user - analysis is optional
        }
      }, 0);

      // Refresh in background without blocking the return
      // Use requestIdleCallback or setTimeout to ensure it doesn't block UI
      // but still happens quickly enough
      Promise.resolve().then(async () => {
        try {
          const authResult = await getAuthenticatedUser();
          if (authResult?.user?.id) {
            // Invalidate cache before refreshing
            await invalidateGoalsCache(authResult.user.id);
          }
          await clearGoalsCache();
          await refreshGoalsFromServer(false);
          // Emit event to notify other screens of new goal
          DeviceEventEmitter.emit("goalsUpdated", { 
            action: "created", 
            goalId: data.id 
          });
        } catch (error) {
          logger.error("❌ [GOALS] Background refresh failed:", error);
        }
      });

      return goal;
    } catch (e) {
      logger.error("❌ [GOALS] Error saving goal:", e);
      if (pushChat) pushChat("finny", "Couldn't save your goal. Try again later.");
      return null;
    }
  };

  const deleteGoal = async (id: string): Promise<void> => {
    try {
      // Fetch goal data before deletion for memory storage
      let goalDataBeforeDelete = null;
      try {
        const { data: goalData, error: fetchError } = await supabase
          .from('goals')
          .select('*')
          .eq('id', id)
          .single();

        if (!fetchError && goalData) {
          goalDataBeforeDelete = goalData;
        }
      } catch (fetchErr) {
        logger.warn("Could not fetch goal data before deletion:", fetchErr);
        // Continue with deletion even if fetch fails
      }

      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error("Error deleting goal:", error);
        throw error;
      }

      // Store goal deletion memory in Supermemory (non-blocking)
      if (goalDataBeforeDelete) {
        setTimeout(async () => {
          try {
            const BASE_URL =
              process.env.EXPO_PUBLIC_APP_BASE_URL ||
              "https://financify-rose.vercel.app";
            await authenticatedFetch(`${BASE_URL}/api/memory`, {
              method: "POST",
              body: JSON.stringify({
                type: "goal_deletion",
                goalData: {
                  id: goalDataBeforeDelete.id,
                  label: goalDataBeforeDelete.label,
                  target_amount: goalDataBeforeDelete.target_amount,
                  current_amount: goalDataBeforeDelete.current_amount,
                  target_date: goalDataBeforeDelete.target_date,
                  category: goalDataBeforeDelete.category,
                  note: goalDataBeforeDelete.note,
                  status: goalDataBeforeDelete.status,
                },
                deletedVia: "goals_screen",
              }),
            }).catch((error) => {
              logger.error("❌ [GOAL MEMORY] Failed to store goal deletion memory:", error);
            });
          } catch (error) {
            logger.error("❌ [GOAL MEMORY] Error storing goal deletion memory:", error);
          }
        }, 0);
      }

      // Invalidate cache before refreshing
      const authResult = await getAuthenticatedUser();
      if (authResult?.user?.id) {
        await invalidateGoalsCache(authResult.user.id);
      }
      // Clear cache first to ensure fresh data, then refresh from server
      await clearGoalsCache();
      await refreshGoalsFromServer(false);

      // Emit event to notify other screens of goal deletion
      DeviceEventEmitter.emit("goalsUpdated", { 
        action: "deleted", 
        goalId: id 
      });
    } catch (e) {
      logger.error("Error deleting goal:", e);
      throw e;
    }
  };

  const updateGoal = async (id: string, updates: Partial<Goal>): Promise<void> => {
    try {
      const { error } = await supabase
        .from('goals')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        logger.error("Error updating goal:", error);
        if (pushChat) pushChat("finny", "Couldn't update your goal. Try again later.");
        return;
      }

      // Invalidate cache before refreshing
      const authResult = await getAuthenticatedUser();
      if (authResult?.user?.id) {
        await invalidateGoalsCache(authResult.user.id);
      }
      // Clear cache first to ensure fresh data, then refresh from server
      await clearGoalsCache();
      await refreshGoalsFromServer(false);

      // Emit event to notify other screens of goal update
      DeviceEventEmitter.emit("goalsUpdated", { 
        action: "updated", 
        goalId: id 
      });
    } catch (e) {
      logger.error("Error updating goal:", e);
      if (pushChat) pushChat("finny", "Couldn't update your goal. Try again later.");
    }
  };

  const addManualGoal = async (goalInput: GoalInput): Promise<Goal | null> => {
    return await saveGoal(goalInput);
  };

  const clearGoalsCache = async (): Promise<void> => {
    try {
        AppStorage.removeItemSync(GOALS_CACHE_KEY);
        AppStorage.removeItemSync(GOALS_CACHE_TIMESTAMP_KEY)
    } catch (error) {
      logger.error("❌ [GOALS CACHE] Failed to clear cache:", error);
    }
  };

  return {
    goalsData,
    setGoalsData,
    loading,
    refreshGoals,
    saveGoal,
    deleteGoal,
    updateGoal,
    addManualGoal,
    clearGoalsCache,
  };
}

export default useGoals;
