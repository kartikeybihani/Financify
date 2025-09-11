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
  user_id: string;
  label: string;
  description?: string;
  note?: string;
  target_amount: number;
  current_amount: number;
  target_date: string; // ISO date string
  category: 'emergency_fund' | 'vacation' | 'car' | 'house_down_payment' | 'education' | 'retirement' | 'wedding' | 'debt_payoff' | 'investment' | 'other';
  status: 'active' | 'paused' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "finny";
  text: string;
  timestamp?: number;
  type?: "text" | "action";
  actions?: Array<{
    label: string;
    action: "goal_confirm" | "goal_decline" | string;
    style?: "primary" | "secondary";
  }>;
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
