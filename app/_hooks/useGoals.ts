// hooks/useGoals.ts

import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Goal } from "../_types/finny";
import { GoalInput } from "../_types/addGoalModalTypes";
import { supabase } from "../_lib/supabase/supabase";
import logger from "../_utils/logger";

const GOALS_CACHE_KEY = "cached_goals";
const GOALS_CACHE_TIMESTAMP_KEY = "cached_goals_timestamp";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export function useGoals(pushChat: (sender: "user" | "finny", message: string) => void) {
  const [goalsData, setGoalsData] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Load cached goals immediately, then refresh from server
  useEffect(() => {
    loadGoalsWithCache();
  }, []);

  // Cache management functions
  const saveGoalsToCache = async (goals: Goal[]): Promise<void> => {
    try {
      const timestamp = Date.now().toString();
      await Promise.all([
        AsyncStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(goals)),
        AsyncStorage.setItem(GOALS_CACHE_TIMESTAMP_KEY, timestamp)
      ]);
      logger.info("💾 [GOALS CACHE] Goals saved to cache:", goals.length, "goals");
    } catch (error) {
      logger.error("❌ [GOALS CACHE] Failed to save goals to cache:", error);
    }
  };

  const loadGoalsFromCache = async (): Promise<Goal[] | null> => {
    try {
      const [cachedGoalsString, timestampString] = await Promise.all([
        AsyncStorage.getItem(GOALS_CACHE_KEY),
        AsyncStorage.getItem(GOALS_CACHE_TIMESTAMP_KEY)
      ]);

      if (!cachedGoalsString || !timestampString) {
        logger.info("📭 [GOALS CACHE] No cached goals found");
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      logger.info(`📱 [GOALS CACHE] Cache age: ${Math.round(cacheAge / 1000)}s (max: ${CACHE_DURATION / 1000}s)`);

      const cachedGoals = JSON.parse(cachedGoalsString) as Goal[];
      logger.info("📱 [GOALS CACHE] Loaded from cache:", cachedGoals.length, "goals");
      return cachedGoals;
    } catch (error) {
      logger.error("❌ [GOALS CACHE] Failed to load goals from cache:", error);
      return null;
    }
  };

  const isCacheValid = async (): Promise<boolean> => {
    try {
      const timestampString = await AsyncStorage.getItem(GOALS_CACHE_TIMESTAMP_KEY);
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
      // Always try to load from cache first for immediate UI update
      const cachedGoals = await loadGoalsFromCache();
      if (cachedGoals && cachedGoals.length > 0) {
        logger.info("⚡ [GOALS CACHE] Using cached goals for immediate display");
        setGoalsData(cachedGoals);
        setIsInitialLoad(false);
      }

      // Check if we need to refresh from server
      const cacheValid = await isCacheValid();
      if (!cacheValid || isInitialLoad) {
        logger.info("🔄 [GOALS CACHE] Cache invalid or initial load, fetching from server");
        await refreshGoalsFromServer(!!cachedGoals);
      } else {
        logger.info("✅ [GOALS CACHE] Cache is valid, skipping server fetch");
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
      logger.info("🔄 [GOALS] Refreshing goals from database...");
      if (!hasCache) {
        setLoading(true);
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        logger.error("❌ [GOALS] User not authenticated for refresh");
        return;
      }

      logger.info("👤 [GOALS] User ID for query:", user.id);

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

      logger.info("📊 [GOALS] Loaded goals from database:", goals?.length || 0, "goals");
      logger.info("📋 [GOALS] Goals data:", goals);
      
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

  const saveGoal = async (goalInput: GoalInput): Promise<void> => {
    try {
      logger.info("🎯 [GOALS] Saving new goal:", goalInput);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        logger.error("❌ [GOALS] User not authenticated");
        if (pushChat) pushChat("finny", "You need to be logged in to save goals.");
        return;
      }

      const goalData = {
        user_id: user.id,
        label: goalInput.label.trim(),
        description: null, // Keep description as null since we removed it from UI
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
        return;
      }

      logger.info("✅ [GOALS] Goal saved successfully:", data);

      // Refresh goals to get the updated list and update cache
      await refreshGoalsFromServer(false);
    } catch (e) {
      logger.error("❌ [GOALS] Error saving goal:", e);
      if (pushChat) pushChat("finny", "Couldn't save your goal. Try again later.");
    }
  };

  const deleteGoal = async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error("Error deleting goal:", error);
        throw error;
      }

      // Refresh goals to get the updated list and update cache
      await refreshGoalsFromServer(false);
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

      // Refresh goals to get the updated list and update cache
      await refreshGoalsFromServer(false);
    } catch (e) {
      logger.error("Error updating goal:", e);
      if (pushChat) pushChat("finny", "Couldn't update your goal. Try again later.");
    }
  };

  const addManualGoal = async (goalInput: GoalInput): Promise<void> => {
    await saveGoal(goalInput);
  };

  const clearGoalsCache = async (): Promise<void> => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(GOALS_CACHE_KEY),
        AsyncStorage.removeItem(GOALS_CACHE_TIMESTAMP_KEY)
      ]);
      logger.info("🗑️ [GOALS CACHE] Cache cleared");
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
