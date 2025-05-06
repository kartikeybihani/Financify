import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Goal, GoalSetup, TimelineItem, Timeline } from '../types/finny';
import finnyConstants from '../constants/finny';

const BASE_URL = "https://financify-rose.vercel.app";

// Helper function to generate random progress
const getRandomProgress = () => Math.floor(Math.random() * (80 - 20 + 1)) + 20;

export const useGoals = (pushChat: (sender: "user" | "finny", text: string) => void) => {
  const [goalSetup, setGoalSetup] = useState<GoalSetup>({ step: "none" });
  const [timelineData, setTimelineData] = useState<(TimelineItem & { id: string })[]>([]);

  // Load goals when component mounts
  useEffect(() => {
    const loadGoals = async () => {
      try {
        const existing = await AsyncStorage.getItem("goals");
        const parsed = JSON.parse(existing || "[]");

        const transformedGoals = parsed.map((g: Goal & { id?: string }) => ({
          id: g.id || `existing-${g.label}`,
          year: g.year,
          label: g.label,
          description: g.description || "User-defined goal",
          progress: g.progress || getRandomProgress(),
        }));

        const milestonesWithIds = finnyConstants.FUTURE_MILESTONES.map((m) => ({
          ...m,
          id: `milestone-${m.label}`,
        }));

        setTimelineData([...transformedGoals, ...milestonesWithIds]);
      } catch (error) {
        console.error("Error loading goals:", error);
        pushChat("finny", "Failed to load your goals. Please try refreshing the app.");
      }
    };

    loadGoals();
  }, []);

  const handleGoalSetup = async (messageText: string) => {
    const updated = { ...goalSetup };
    let response = "";

    if (goalSetup.step === "label") {
      updated.label = messageText;
      updated.step = "target";
      response = `Great! How much do you need to save for ${messageText}?`;
    } else if (goalSetup.step === "target") {
      const amount = Number(messageText.replace(/[^0-9.]/g, ""));
      if (isNaN(amount) || amount <= 0) {
        response = "Please enter a valid amount (for example: 1000 or $1,000)";
        pushChat("finny", response);
        return true;
      }
      updated.target = String(amount);
      updated.step = "year";
      response = `And by when would you like to save $${amount.toLocaleString()}?`;
    } else if (goalSetup.step === "year") {
      try {
        const dateIntent = await fetch(
          `${BASE_URL}/api/goal-intent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: messageText }),
          }
        );

        const parsedDate = await dateIntent.json();

        if (!parsedDate.timeline) {
          response = "I didn't quite catch that date. Could you specify when you'd like to achieve this goal? For example: 'next spring', 'December 2024', or 'in 6 months'";
          pushChat("finny", response);
          return true;
        }

        // Determine the correct year for the specified month
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth(); // 0-11
        const targetMonth = new Date(`${parsedDate.timeline.month} 1`).getMonth();
        const targetYear = parsedDate.timeline.year || (currentMonth > targetMonth ? currentYear + 1 : currentYear);

        const timeline: Timeline = {
          month: parsedDate.timeline.month || "January",
          year: targetYear.toString(),
        };
        updated.timeline = timeline;

        if (!updated.label || !updated.target || !updated.timeline) {
          response = "Something went wrong with the goal setup. Please try again.";
          pushChat("finny", response);
          return false;
        }

        const finalGoal: Goal = {
          label: updated.label,
          target: Number(updated.target),
          year: `${updated.timeline.month} ${updated.timeline.year}`.trim(),
          description: `Save $${Number(updated.target).toLocaleString()}`,
        };
        await saveGoal(finalGoal);

        response = `Perfect! I've set up your goal to save $${Number(updated.target).toLocaleString()} for ${updated.label} by ${updated.timeline.month} ${updated.timeline.year}. 🎯\n\nI'll help you track your progress and provide plan to reach this goal.`;

        updated.step = "none";
      } catch (error) {
        console.error("Error parsing date:", error);
        response = "I'm having trouble understanding that date. Could you try again with a format like 'next spring', 'December 2024', or 'in 6 months'?";
        pushChat("finny", response);
        return true;
      }
    }

    setGoalSetup(updated);
    if (response) {
      pushChat("finny", response);
    }
    return true;
  };

  const saveGoal = async (goal: Goal) => {
    try {
      const existing = await AsyncStorage.getItem("goals");
      const parsed = JSON.parse(existing || "[]");

      const goalWithId = {
        ...goal,
        id: Date.now().toString(),
        progress: getRandomProgress(),
      };

      await AsyncStorage.setItem(
        "goals",
        JSON.stringify([...parsed, goalWithId])
      );

      const transformedGoals = [...parsed, goalWithId].map(
        (g: Goal & { id?: string }) => ({
          id: g.id || `existing-${g.label}`,
          year: g.year,
          label: g.label,
          description: g.description || "User-defined goal",
          progress: g.progress || getRandomProgress(),
        })
      );

      const milestonesWithIds = finnyConstants.FUTURE_MILESTONES.map((m) => ({
        ...m,
        id: `milestone-${m.label}`,
      }));

      setTimelineData(
        [...transformedGoals, ...milestonesWithIds].map((item, index) => ({
          ...item,
          id: `goal-${index}`,
        }))
      );
    } catch (error) {
      console.error("Error saving goal:", error);
      throw error;
    }
  };

  const deleteGoal = async (goalToDelete: TimelineItem) => {
    try {
      if (
        finnyConstants.FUTURE_MILESTONES.some(
          (milestone) => milestone.label === goalToDelete.label
        )
      ) {
        pushChat("finny", "This is a future milestone and cannot be deleted.");
        return;
      }

      const existing = await AsyncStorage.getItem("goals");
      const parsed = JSON.parse(existing || "[]");

      const updatedGoals = parsed.filter(
        (goal: TimelineItem) => goal.label !== goalToDelete.label
      );

      await AsyncStorage.setItem("goals", JSON.stringify(updatedGoals));

      const transformedGoals = updatedGoals.map((goal: Goal) => ({
        year: goal.year,
        label: goal.label,
        description: goal.description || "User-defined goal",
        progress: goal.progress || 0,
      }));

      setTimelineData(
        [...transformedGoals, ...finnyConstants.FUTURE_MILESTONES].map((item, index) => ({
          ...item,
          id: `goal-${index}`,
        }))
      );

      pushChat("finny", `Goal "${goalToDelete.label}" has been deleted.`);
    } catch (error) {
      console.error("Error deleting goal:", error);
      pushChat("finny", "Failed to delete the goal. Please try again.");
    }
  };

  return {
    goalSetup,
    timelineData,
    setTimelineData,
    setGoalSetup,
    handleGoalSetup,
    saveGoal,
    deleteGoal,
  };
};

// Export both as named and default export for compatibility
export default useGoals; 