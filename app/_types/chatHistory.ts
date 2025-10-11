export interface ChatSession {
  id: string;
  session_title: string;
  first_message: string;
  created_at: string;
  message_count: number;
  messages?: any[]; // ChatMessage[] from finny.ts
}

export interface ChatSessionMessages {
  id: string;
  session_title: string;
  first_message: string;
  messages: any[]; // ChatMessage[] from finny.ts
  created_at: string;
  updated_at: string;
}

export interface ChatHistoryContextType {
  sessions: ChatSession[];
  loading: boolean;
  error: string | null;
  refreshSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
}
