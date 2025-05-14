// types/timelineTypes.ts

import { Animated } from "react-native";
import { Goal } from "./finny";

export interface TimelineProps {
  deleteGoal: (id: string) => Promise<void>;
  timelineAnimations: Animated.Value[];
  timelineData: Goal[];
  onRefreshStart?: () => void;
  onRefreshEnd?: () => void;
}

export interface TimelineState {
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

export interface TimelineItemProps {
  item: Goal;
  index: number;
  animation: Animated.Value;
  onPress: (goal: Goal) => void;
}

export const types = {
  TimelineProps: {} as TimelineProps,
  TimelineState: {} as TimelineState,
  NotificationState: {} as NotificationState,
  TimelineItemProps: {} as TimelineItemProps,
} as const;

export default types; 