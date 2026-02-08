// types/goalsTypes.ts

import { Animated } from "react-native";
import { Goal } from "@/src/types/finny";

export interface GoalsProps {
  deleteGoal: (id: string) => Promise<void>;
  updateGoal?: (id: string, updates: Partial<Goal>) => Promise<void>;
  refreshGoals?: () => Promise<void>;
  goalsAnimations: Animated.Value[];
  goalsData: Goal[];
  onRefreshStart?: () => void;
  onRefreshEnd?: () => void;
  onGoalAdded?: () => Promise<void>;
  /** When true, show blurred teaser and upgrade CTA; hide Add Goal; goal taps open paywall. */
  isPremiumLocked?: boolean;
  onUpgradePress?: () => void;
}

export interface GoalsState {
  showAddGoalModal: boolean;
  notification: {
    visible: boolean;
    message: string;
    action?: 'delete' | 'update' | 'create';
    goalId?: string;
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

export interface GoalDetailModalProps {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (goal: Goal) => void;
  onEdit?: (id: string, updates: Partial<Goal>) => void;
  onOptimisticUpdate?: (updatedGoal: Goal) => void;
}

export interface GoalNotificationProps {
  message: string;
  action?: 'delete' | 'update' | 'create';
  goalId?: string;
  onClose: () => void;
  onUndo?: (goalId: string) => void;
  isModalOpen?: boolean;
}

export const types = {
  GoalsProps: {} as GoalsProps,
  GoalsState: {} as GoalsState,
  NotificationState: {} as NotificationState,
  GoalItemProps: {} as GoalItemProps,
  GoalDetailModalProps: {} as GoalDetailModalProps,
  GoalNotificationProps: {} as GoalNotificationProps,
} as const;

export default types; 