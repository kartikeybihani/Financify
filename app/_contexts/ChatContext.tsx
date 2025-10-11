import React, { createContext, useContext, ReactNode } from "react";
import { useChat } from "@/app/_hooks/useChat";

interface ChatContextType {
  chatMessages: any[];
  isTyping: boolean;
  showNudges: boolean;
  goalFlow: any | null;
  progressStatus: string;
  currentSessionId: string | null;
  isNewSession: boolean;
  clearChat: () => Promise<void>;
  pushChat: (
    senderOrMsg: "user" | "finny" | any,
    text?: string,
    fullMsg?: any
  ) => void;
  pushChatWithDelay: (
    sender: "user" | "finny",
    message: string
  ) => Promise<void>;
  handleUserMessage: (messageText: string, startTime?: number) => Promise<void>;
  startNewSession: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const chatHook = useChat();

  return (
    <ChatContext.Provider value={chatHook}>{children}</ChatContext.Provider>
  );
};

export const useChatContext = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
};

export default ChatProvider;
