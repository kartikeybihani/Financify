import { ChatMessage, TimelineItem } from '@/src/types/finny';

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    sender: "finny",
    text: "yo! I'm Finny, your AI Money Coach. What would you like to know today?",
    timestamp: Date.now(),
  },
];

export const NUDGE_OPTIONS = [
  { id: "1", text: "Tell me about investing basics" },
  { id: "2", text: "How can I save more money?" },
  { id: "3", text: "What's the best way to pay off debt?" },
  { id: "4", text: "Help me create a budget" },
  { id: "5", text: "Explain FIRE to me in brief" },
  { id: "6", text: "What's a good emergency fund amount?" },
];

export const FUTURE_MILESTONES: TimelineItem[] = [
  // Dummy data for now
  // {
  //   year: "2030",
  //   label: "Buy a Home",
  //   description: "Purchase your dream home and start building equity.",
  // },
  // {
  //   year: "2045",
  //   label: "FIRE Target",
  //   description: "You did it! Financially Independent.",
  // },
];

// Also export as default for compatibility
export default {
  INITIAL_CHAT_MESSAGES,
  NUDGE_OPTIONS,
  FUTURE_MILESTONES,
}; 