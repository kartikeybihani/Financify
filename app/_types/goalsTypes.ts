// types/goalsTypes.ts

import { Animated } from "react-native";
import { Goal } from "./finny";

export interface GoalsProps {
  deleteGoal: (id: string) => Promise<void>;
  updateGoal?: (id: string, updates: Partial<Goal>) => Promise<void>;
  goalsAnimations: Animated.Value[];
  goalsData: Goal[];
  onRefreshStart?: () => void;
  onRefreshEnd?: () => void;
  onGoalAdded?: () => Promise<void>;
}

export interface GoalsState {
  showAddGoalModal: boolean;
  notification: {
    visible: boolean;
    message: string;
  };
  refreshing: boolean;
}

export interface NotificationState {
  visible: boolean;
  message: string;
}

export type IconType = 
  | "wallet-outline"
  | "car-outline"
  | "home-outline"
  | "school-outline"
  | "flame-outline"
  | "watch-outline"
  | "flag-outline";

export interface GoalItemProps {
  item: Goal;
  index: number;
  animation: Animated.Value;
  onPress: (goal: Goal) => void;
}

export const types = {
  GoalsProps: {} as GoalsProps,
  GoalsState: {} as GoalsState,
  NotificationState: {} as NotificationState,
  GoalItemProps: {} as GoalItemProps,
} as const;

export default types; 