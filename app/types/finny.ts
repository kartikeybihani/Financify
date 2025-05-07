// Define all types
export interface TimelineItem {
  id?: string;
  year: string;
  label: string;
  description: string;
}

export interface Timeline {
  month: string;
  year: string;
}

export interface Goal {
  label: string;
  target: number;
  year: string;
  description: string;
  progress?: number;
}

export interface GoalSetup {
  step: "none" | "label" | "target" | "year";
  label?: string;
  target?: string;
  timeline?: Timeline;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "finny";
  text: string;
  timestamp?: number;
}

// Export all types as a single object type
export type FinnyTypes = {
  TimelineItem: TimelineItem;
  Timeline: Timeline;
  Goal: Goal;
  GoalSetup: GoalSetup;
  ChatMessage: ChatMessage;
};

// Create a default export object with type information
const types = {
  TimelineItem: {} as TimelineItem,
  Timeline: {} as Timeline,
  Goal: {} as Goal,
  GoalSetup: {} as GoalSetup,
  ChatMessage: {} as ChatMessage,
} as const;

export default types;