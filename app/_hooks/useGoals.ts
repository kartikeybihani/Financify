// hooks/useGoals.ts

import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Goal } from "@/app/_types/finny";
import { GoalInput } from "@/app/_types/addGoalModalTypes";
import { supabase } from "@/app/_lib/supabase/supabase";
import logger from "@/app/_utils/logger";
import { CACHE_CONFIG } from "@/app/_shared/constants/cacheConfig";

const GOALS_CACHE_KEY = CACHE_CONFIG.KEYS.GOALS;
const GOALS_CACHE_TIMESTAMP_KEY = CACHE_CONFIG.KEYS.GOALS_TIMESTAMP;
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 1 day in milliseconds

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
      // Only log on first save or when goals count changes significantly
      if (goals.length === 0 || goals.length % 5 === 0) {
        logger.info("💾 [GOALS CACHE] Saved:", goals.length, "goals");
      }
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
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      // Only log cache age if it's getting close to expiry (>80% of max duration)
      const maxAgeSeconds = CACHE_DURATION / 1000;
      const ageSeconds = Math.round(cacheAge / 1000);
      if (cacheAge > CACHE_DURATION * 0.8) {
        logger.info(`📱 [GOALS CACHE] Cache expiring soon: ${ageSeconds}s/${maxAgeSeconds}s`);
      }

      const cachedGoals = JSON.parse(cachedGoalsString) as Goal[];
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
        setGoalsData(cachedGoals);
        setIsInitialLoad(false);
      }

      // Check if we need to refresh from server
      const cacheValid = await isCacheValid();
      if (!cacheValid || isInitialLoad) {
        // Only log on initial load or when cache is truly invalid
        if (isInitialLoad) {
          logger.info("🔄 [GOALS CACHE] Initial load, fetching from server");
        }
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
      // Only log server refresh when there's no cache (first load or forced refresh)
      if (!hasCache) {
        logger.info("🔄 [GOALS] Loading from database...");
        setLoading(true);
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        logger.error("❌ [GOALS] User not authenticated for refresh");
        return;
      }

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

      // Clear cache first to ensure fresh data, then refresh from server
      await clearGoalsCache();
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

      // Clear cache first to ensure fresh data, then refresh from server
      await clearGoalsCache();
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

      // Clear cache first to ensure fresh data, then refresh from server
      await clearGoalsCache();
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
