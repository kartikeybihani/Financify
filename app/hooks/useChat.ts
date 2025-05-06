import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '../types/finny';
import finnyConstants from '../constants/finny';

export const useChat = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(finnyConstants.INITIAL_CHAT_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [showNudges, setShowNudges] = useState(true);

  useEffect(() => {
    loadChatMessages();
  }, []);

  useEffect(() => {
    setShowNudges(chatMessages.length <= 1);
    saveChatMessages();
  }, [chatMessages]);

  const loadChatMessages = async () => {
    try {
      const savedMessages = await AsyncStorage.getItem("chatMessages");
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages);
        if (parsedMessages.length > 1) {
          setChatMessages(parsedMessages);
          setShowNudges(false);
        } else {
          setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
          setShowNudges(true);
        }
      }
    } catch (error) {
      console.error("Error loading chat messages:", error);
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      setShowNudges(true);
    }
  };

  const saveChatMessages = async () => {
    try {
      await AsyncStorage.setItem("chatMessages", JSON.stringify(chatMessages));
    } catch (error) {
      console.error("Error saving chat messages:", error);
    }
  };

  const clearChat = async () => {
    try {
      await AsyncStorage.removeItem("chatMessages");
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      console.log("Chat cleared and storage reset");
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  };

  const pushChat = (sender: "user" | "finny", text: string) => {
    const msg: ChatMessage = {
      id: `${sender}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender,
      text,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, msg]);
  };

  const pushChatWithDelay = async (sender: "user" | "finny", messages: string[]) => {
    try {
      for (let i = 0; i < messages.length; i++) {
        if (sender === "finny") {
          setIsTyping(true);
          await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
        }

        pushChat(sender, messages[i]);

        if (i === messages.length - 1) {
          setIsTyping(false);
        }
      }
    } finally {
      setIsTyping(false); // Ensure typing is turned off even if there's an error
    }
  };

  const handleUserMessage = async (messageText: string) => {
    setIsTyping(true); // Start typing indicator immediately
    await handleFinnyResponse(messageText);
    setIsTyping(false); // Stop typing indicator after response
  };

  const handleFinnyResponse = async (messageText: string) => {
    const BASE_URL = "https://financify-rose.vercel.app";
    try {
      const stored = await AsyncStorage.getItem("financialData");
      const savedGoals = await AsyncStorage.getItem("goals");
      const parsed = JSON.parse(stored || "{}");
      const goals = JSON.parse(savedGoals || "[]");

      console.log("Sending request to Finny API...");
      const res = await fetch(`${BASE_URL}/api/finny/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          transactions: parsed.transactions,
          accounts: parsed.accounts,
          investments: parsed.investments,
          liabilities: parsed.liabilities,
          goals: goals,
        }),
      });

      console.log("Response:", JSON.stringify(res, null, 2));
      const data = await res.json();
      console.log("Data 2:", data);
      console.log("Finny 2:", data.nudges);
      
      const messages = data.nudges?.join("\n\n") || "Sorry, I wasn't able to generate advice just now.";
      const splitMessages = splitIntoMessages(messages);
      await pushChatWithDelay("finny", splitMessages);
    } catch (error) {
      console.error("AI error:", error);
      pushChat("finny", "Something went wrong. Try again later.");
    }
  };

  const splitIntoMessages = (text: string): string[] => {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const messages: string[] = [];
    let currentMessage = "";

    for (const sentence of sentences) {
      if (currentMessage && currentMessage.length + sentence.length > 250) {
        messages.push(currentMessage.trim());
        currentMessage = sentence;
      } else {
        currentMessage = currentMessage ? `${currentMessage} ${sentence}` : sentence;
      }
    }

    if (currentMessage) {
      messages.push(currentMessage.trim());
    }

    return messages;
  };

  return {
    chatMessages,
    isTyping,
    showNudges,
    clearChat,
    pushChat,
    pushChatWithDelay,
    handleUserMessage,
  };
};

// Export both as named and default export for compatibility
export default useChat; 