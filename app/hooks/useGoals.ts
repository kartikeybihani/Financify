// hooks/useGoals.ts

import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Goal } from "../types/finny";

// Simple ID generator
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export function useGoals(pushChat: (sender: string, message: string) => void) {
  const [timelineData, setTimelineData] = useState<Goal[]>([]);

  // Load goals from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const storedGoals = await AsyncStorage.getItem("goals");
        const parsedGoals = storedGoals ? JSON.parse(storedGoals) : [];
        setTimelineData(parsedGoals);
      } catch (e) {
        console.error("Failed to load goals on mount:", e);
      }
    })();
  }, []);

  const refreshGoals = async (): Promise<void> => {
    try {
      const storedGoals = await AsyncStorage.getItem("goals");
      const parsedGoals = storedGoals ? JSON.parse(storedGoals) : [];
      setTimelineData(parsedGoals);
    } catch (e) {
      console.error("Failed to load goals:", e);
    }
  };

  const saveGoal = async (goal: Goal): Promise<void> => {
    try {
      const storedGoals = await AsyncStorage.getItem("goals");
      const parsedGoals = storedGoals ? JSON.parse(storedGoals) : [];
      const updatedGoals = [...parsedGoals, goal];
      await AsyncStorage.setItem("goals", JSON.stringify(updatedGoals));
      setTimelineData(updatedGoals);
    } catch (e) {
      console.error("Error saving goal:", e);
      if (pushChat) pushChat("finny", "Couldn't save your goal. Try again later.");
    }
  };

  const deleteGoal = async (id: string): Promise<void> => {
    try {
      const storedGoals = await AsyncStorage.getItem("goals");
      const parsed = storedGoals ? JSON.parse(storedGoals) : [];
      const filtered = parsed.filter((g: Goal) => g.id !== id);
      await AsyncStorage.setItem("goals", JSON.stringify(filtered));
      setTimelineData(filtered);
    } catch (e) {
      console.error("Error deleting goal:", e);
      throw e;
    }
  };

  const addManualGoal = async (goal: Goal): Promise<void> => {
    await saveGoal(goal);
  };

  return {
    timelineData,
    setTimelineData,
    refreshGoals,
    saveGoal,
    deleteGoal,
    addManualGoal,
  };
}

export default useGoals;
