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
  isStreaming?: boolean; // New field to indicate if message is being streamed
  stockCandidate?: {
    ticker: string;
  };
  actions?: Array<{
    label: string;
    action: "goal_confirm" | "goal_decline" | string;
    style?: "primary" | "secondary";
  }>;
  hideFeedback?: boolean; // Hide feedback buttons (thumbs up/down) for confirmation messages
  hideActions?: boolean; // Hide action buttons after they're clicked
}

export type Intent =
  | "goal"
  | "ask_personalized"
  | "ask_concept_static"
  | "calc_projection";

export type Fact = {
  topic: string;
  metric: string;
  value: number | string | null;
  unit: string | null;
  as_of: string;                 // ISO date
  source_title: string;
  source_url: string;
  ttl_seconds: number;
  cached?: boolean;
};

export type Rule = {
  state: string;                 // AZ etc
  topic: string;
  rule_summary: string;          // who qualifies, thresholds, filing notes
  key_numbers: Array<{
    label: string;
    value: number;
    unit: string;
  }>;
  effective_year: number;
  updated_at: string;
  source_title: string;
  source_url: string;
  ttl_seconds: number;
  cached?: boolean;
};

export type ProjectionInput = {
  age: number;
  retire_age: number;
  annual_spend: number;
  portfolio_now: number;
  annual_contrib: number;        // total across accounts
  expected_return: number;       // real return
  inflation: number;             // for reporting only
  state?: string | null;         // to tie in taxes later
};

export type Projection = {
  swr_target: number;            // 25 x spend for v1
  projected_nest_egg: number;
  readiness_gap: number;
  years_to_target: number;
  notes: string[];
};

export type AnswerEnvelope =
  | { intent: "calc_projection"; projection: Projection }
  | { intent: "ask_personalized"; message: string; data?: any }
  | { intent: "ask_concept_static"; message: string }
  | { intent: "goal"; label: string | null; target: number | null; timeline: { month: string; year: string } | null };

export type FinnyTypes = {
  TimelineItem: TimelineItem;
  Timeline: Timeline;
  Goal: Goal;
  ChatMessage: ChatMessage;
  Intent: Intent;
  Fact: Fact;
  Rule: Rule;
  ProjectionInput: ProjectionInput;
  Projection: Projection;
  AnswerEnvelope: AnswerEnvelope;
};

const types = {
  TimelineItem: {} as TimelineItem,
  Timeline: {} as Timeline,
  Goal: {} as Goal,
  ChatMessage: {} as ChatMessage,
  Intent: {} as Intent,
  Fact: {} as Fact,
  Rule: {} as Rule,
  ProjectionInput: {} as ProjectionInput,
  Projection: {} as Projection,
  AnswerEnvelope: {} as AnswerEnvelope,
} as const;

export default types;
