import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Goal, GoalSetup, TimelineItem, Timeline } from '../types/finny';
import finnyConstants from '../constants/finny';

const BASE_URL = "https://financify-rose.vercel.app";

// Helper function to generate random progress
const getRandomProgress = () => Math.floor(Math.random() * (80 - 20 + 1)) + 20;

// Helper function to parse relative time expressions
const parseRelativeTime = (text: string): Timeline | null => {
  const now = new Date();
  const lowerText = text.toLowerCase().trim();

  // Handle simple "X years" format
  const simpleYearsMatch = lowerText.match(/^(\d+)\s*years?$/);
  if (simpleYearsMatch) {
    const years = parseInt(simpleYearsMatch[1]);
    const futureDate = new Date(now.getFullYear() + years, now.getMonth());
    return {
      month: futureDate.toLocaleString('default', { month: 'long' }),
      year: futureDate.getFullYear().toString()
    };
  }

  // Handle simple "X months" format
  const simpleMonthsMatch = lowerText.match(/^(\d+)\s*months?$/);
  if (simpleMonthsMatch) {
    const months = parseInt(simpleMonthsMatch[1]);
    const futureDate = new Date(now.getFullYear(), now.getMonth() + months);
    return {
      month: futureDate.toLocaleString('default', { month: 'long' }),
      year: futureDate.getFullYear().toString()
    };
  }

  // Handle "X years later" format
  const yearsMatch = lowerText.match(/(\d+)\s*years?\s*later/);
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1]);
    const futureDate = new Date(now.getFullYear() + years, now.getMonth());
    return {
      month: futureDate.toLocaleString('default', { month: 'long' }),
      year: futureDate.getFullYear().toString()
    };
  }

  // Handle "in X years" format
  const inYearsMatch = lowerText.match(/in\s+(\d+)\s*years?/);
  if (inYearsMatch) {
    const years = parseInt(inYearsMatch[1]);
    const futureDate = new Date(now.getFullYear() + years, now.getMonth());
    return {
      month: futureDate.toLocaleString('default', { month: 'long' }),
      year: futureDate.getFullYear().toString()
    };
  }

  // Handle "X months later" format
  const monthsMatch = lowerText.match(/(\d+)\s*months?\s*later/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1]);
    const futureDate = new Date(now.getFullYear(), now.getMonth() + months);
    return {
      month: futureDate.toLocaleString('default', { month: 'long' }),
      year: futureDate.getFullYear().toString()
    };
  }

  // Handle "in X months" format
  const inMonthsMatch = lowerText.match(/in\s+(\d+)\s*months?/);
  if (inMonthsMatch) {
    const months = parseInt(inMonthsMatch[1]);
    const futureDate = new Date(now.getFullYear(), now.getMonth() + months);
    return {
      month: futureDate.toLocaleString('default', { month: 'long' }),
      year: futureDate.getFullYear().toString()
    };
  }

  return null;
};

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
        // First try parsing relative time expressions
        const relativeTime = parseRelativeTime(messageText);
        if (relativeTime) {
          const timeline: Timeline = relativeTime;
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

          response = `Perfect! I've set up your goal to save $${Number(updated.target).toLocaleString()} for ${updated.label} by ${updated.timeline.month} ${updated.timeline.year}. 🎯\n\nI'll help you track your progress and provide a plan to reach this goal.`;
          console.log("Goal saved:", finalGoal);
          console.log("Finny response:", response);

          updated.step = "none";
          setGoalSetup(updated);
          pushChat("finny", response);
          return true;
        }

        // If relative time parsing fails, try the API
        const dateIntent = await fetch(
          `${BASE_URL}/api/finny/goal-intent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: messageText }),
          }
        );

        const parsedDate = await dateIntent.json();
        console.log("Date intent response:", parsedDate);

        if (!parsedDate.timeline || !parsedDate.timeline.month || !parsedDate.timeline.year) {
          response = "I didn't quite catch that date. Could you specify when you'd like to achieve this goal? For example: 'next spring', 'December 2024', 'in 6 months', or '3 years later'";
          pushChat("finny", response);
          return true;
        }

        const timeline: Timeline = {
          month: parsedDate.timeline.month,
          year: parsedDate.timeline.year.toString(),
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

        response = `Perfect! I've set up your goal to save $${Number(updated.target).toLocaleString()} for ${updated.label} by ${updated.timeline.month} ${updated.timeline.year}. 🎯\n\nI'll help you track your progress and provide a plan to reach this goal.`;
        console.log("Goal saved:", finalGoal);
        console.log("Finny response:", response);

        updated.step = "none";
      } catch (error) {
        console.error("Error parsing date:", error);
        response = "I'm having trouble understanding that date. Could you try again with a format like 'next spring', 'December 2024', 'in 6 months', or '3 years later'?";
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

  const deleteGoal = async (goalToDelete: TimelineItem): Promise<string | null> => {
    try {
      if (
        finnyConstants.FUTURE_MILESTONES.some(
          (milestone) => milestone.label === goalToDelete.label
        )
      ) {
        pushChat("finny", "This is a future milestone and cannot be deleted.");
        return null;
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

      console.log("Goal deleted:", goalToDelete);
      return `Goal of ${goalToDelete.label} has been deleted.`;
    } catch (error) {
      console.error("Error deleting goal:", error);
      pushChat("finny", "Failed to delete the goal. Please try again.");
      return null;
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