// types/finnyTypes.ts

export interface TimelineItem {
  id: string;
  year: string;
  label: string;
  description: string;
}

export interface Timeline {
  month: string;
  year: string;
}

export interface Goal {
  id: string;
  label: string;
  target: number;
  year: string;
  month?: string;
  description: string;
  progress?: number;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "finny";
  text: string;
  timestamp?: number;
}

export type FinnyTypes = {
  TimelineItem: TimelineItem;
  Timeline: Timeline;
  Goal: Goal;
  ChatMessage: ChatMessage;
};

const types = {
  TimelineItem: {} as TimelineItem,
  Timeline: {} as Timeline,
  Goal: {} as Goal,
  ChatMessage: {} as ChatMessage,
} as const;

export default types;
