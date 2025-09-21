import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '../_types/finny';
import finnyConstants from '../_constants/finny';
import logger from '../_utils/logger';
import { supabase } from '../_lib/supabase/supabase';

// Utility to split messages for chat display
function splitIntoMessages(text: string): string[] {
  // If there are numbered points, group them together
  const numberedPointRegex = /\n?\d+\.\s/;
  if (numberedPointRegex.test(text)) {
    // Find where the first numbered point starts
    const match = text.match(/\n?\d+\.\s/);
    if (match) {
      const idx = text.indexOf(match[0]);
      const intro = text.slice(0, idx).trim();
      const points = text.slice(idx).trim();
      const result: string[] = [];
      if (intro) result.push(intro);
      if (points) result.push(points);
      return result;
    }
  }
  // Otherwise, split by paragraphs (double newlines)
  return text
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

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
      logger.error("Error loading chat messages:", error);
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      setShowNudges(true);
    }
  };

  const saveChatMessages = async () => {
    try {
      await AsyncStorage.setItem("chatMessages", JSON.stringify(chatMessages));
    } catch (error) {
      logger.error("Error saving chat messages:", error);
    }
  };

  const clearChat = async () => {
    try {
      await AsyncStorage.removeItem("chatMessages");
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      // Chat cleared and storage reset
    } catch (error) {
      logger.error("Error clearing chat:", error);
    }
  };

  const pushChat = (
    senderOrMsg: "user" | "finny" | ChatMessage,
    text?: string,
    fullMsg?: ChatMessage
  ) => {
    let msg: ChatMessage;
    if (typeof senderOrMsg === "object") {
      msg = senderOrMsg;
    } else if (fullMsg) {
      msg = fullMsg;
    } else {
      msg = {
        id: `${senderOrMsg}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: senderOrMsg,
        text: text || "",
        timestamp: Date.now(),
      };
    }
    // Console logging for chat messages
    if (msg.sender === "user") {
      logger.info(`User: ${msg.text}`);
    } else if (msg.sender === "finny") {
      logger.info(`Finny: [${msg.text}]`);
    }
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
      // Get user_id for the API calls
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }

      // 1) First classify the message to determine intent
      const classifyRes = await fetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "classify",
          message: messageText,
          context: { user_id: user.id }
        }),
      });

      const classifyData = await classifyRes.json();
      logger.info("🎯 [CHAT] Classification result:", classifyData);

      // 2) Route to appropriate handler based on classification
      let res;
      if (classifyData.intent === "ask_personalized") {
        // For personalized questions, call the ask handler
        res = await fetch(`${BASE_URL}/api/finny`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ask",
            message: messageText,
            context: { user_id: user.id }
          }),
        });
      } else {
        // For other intents (goal, ask_state_rule, etc.), route directly
        res = await fetch(`${BASE_URL}/api/finny`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: classifyData.intent,
            message: messageText,
            context: { user_id: user.id }
          }),
        });
      }

      // Response status: ${res.status}
      const data = await res.json();
      // Finny response received
      logger.info("🤖 [CHAT] API Response:", data);
      
      const messages = data.message || "Sorry, I wasn't able to generate advice just now.";
      logger.info("messages", messages);
      const splitMessages = splitIntoMessages(messages);
      await pushChatWithDelay("finny", splitMessages);
    } catch (error) {
      logger.error("AI error:", error);
      pushChat("finny", "Something went wrong. Try again later.");
    }
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
export { splitIntoMessages };
export default useChat; 