// hooks/useGoals.ts

import { useState, useEffect } from "react";
import { Goal } from "../types/finny";
import { GoalInput } from "../types/addGoalModalTypes";
import { supabase } from "../lib/supabase/supabase";

export function useGoals(pushChat: (sender: "user" | "finny", message: string) => void) {
  const [goalsData, setGoalsData] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);

  // Load goals from Supabase on mount
  useEffect(() => {
    refreshGoals();
  }, []);

  const refreshGoals = async (): Promise<void> => {
    try {
      console.log("🔄 [GOALS] Refreshing goals from database...");
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        console.error("❌ [GOALS] User not authenticated for refresh");
        return;
      }

      console.log("👤 [GOALS] User ID for query:", user.id);

      const { data: goals, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("❌ [GOALS] Failed to load goals:", error);
        if (pushChat) pushChat("finny", "Couldn't load your goals. Try again later.");
        return;
      }

      console.log("📊 [GOALS] Loaded goals from database:", goals?.length || 0, "goals");
      console.log("📋 [GOALS] Goals data:", goals);
      
      setGoalsData(goals || []);
    } catch (e) {
      console.error("❌ [GOALS] Failed to load goals:", e);
      if (pushChat) pushChat("finny", "Couldn't load your goals. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  const saveGoal = async (goalInput: GoalInput): Promise<void> => {
    try {
      console.log("🎯 [GOALS] Saving new goal:", goalInput);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        console.error("❌ [GOALS] User not authenticated");
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

      console.log("💾 [GOALS] Inserting goal data:", goalData);

      const { data, error } = await supabase
        .from('goals')
        .insert([goalData])
        .select()
        .single();

      if (error) {
        console.error("❌ [GOALS] Error saving goal:", error);
        if (pushChat) pushChat("finny", "Couldn't save your goal. Try again later.");
        return;
      }

      console.log("✅ [GOALS] Goal saved successfully:", data);

      // Refresh goals to get the updated list
      await refreshGoals();
    } catch (e) {
      console.error("❌ [GOALS] Error saving goal:", e);
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
        console.error("Error deleting goal:", error);
        throw error;
      }

      // Refresh goals to get the updated list
      await refreshGoals();
    } catch (e) {
      console.error("Error deleting goal:", e);
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
        console.error("Error updating goal:", error);
        if (pushChat) pushChat("finny", "Couldn't update your goal. Try again later.");
        return;
      }

      // Refresh goals to get the updated list
      await refreshGoals();
    } catch (e) {
      console.error("Error updating goal:", e);
      if (pushChat) pushChat("finny", "Couldn't update your goal. Try again later.");
    }
  };

  const addManualGoal = async (goalInput: GoalInput): Promise<void> => {
    await saveGoal(goalInput);
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
  };
}

export default useGoals;
