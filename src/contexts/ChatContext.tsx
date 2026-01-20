import React, { createContext, useContext, ReactNode, useState } from "react";
import { useChat } from "@/src/hooks/useChat";

interface ChatContextType {
  chatMessages: any[];
  isTyping: boolean;
  showNudges: boolean;
  goalFlow: any | null;
  progressStatus: string;
  currentSessionId: string | null;
  isNewSession: boolean;
  updateUserName: (userName?: string | null) => void;
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
  handleFinnyResponse: (
    messageText: string,
    startTime?: number
  ) => Promise<void>;
  handleActionButton: (
    action: string,
    payload?: { ticker?: string }
  ) => Promise<void>;
  startNewSession: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [userName, setUserName] = useState<string | null>(null);
  const chatHook = useChat(userName);

  const updateUserName = (nextUserName?: string | null) => {
    setUserName(nextUserName ?? null);
  };

  return (
    <ChatContext.Provider value={{ ...chatHook, updateUserName }}>
      {children}
    </ChatContext.Provider>
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
