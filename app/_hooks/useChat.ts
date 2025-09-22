import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '../_types/finny';
import finnyConstants from '../_constants/finny';
import logger from '../_utils/logger';
import { supabase } from '../_lib/supabase/supabase';

// Message splitting removed - display messages as single strings

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

  const pushChatWithDelay = async (sender: "user" | "finny", message: string) => {
    try {
      if (sender === "finny") {
        setIsTyping(true);
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
      }

      pushChat(sender, message);
      setIsTyping(false);
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
    const BASE_URL = process.env.EXPO_PUBLIC_APP_BASE_URL || "https://financify-rose.vercel.app";
    try {
      // Get user_id for the API calls
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }

      // Fetch session once and reuse the access token for all requests in this flow
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || '';

      // 1) First classify the message to determine intent
      const classifyRes = await fetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          // Pass Supabase JWT to server; server will derive userId
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action: "classify",
          message: messageText,
          // client context no longer carries user_id; server derives it
          context: {}
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
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            action: "ask",
            message: messageText,
            context: {}
          }),
        });
      } else {
        // For other intents (goal, ask_state_rule, etc.), route directly
        res = await fetch(`${BASE_URL}/api/finny`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            action: classifyData.intent,
            message: messageText,
            context: {}
          }),
        });
      }

      // Response status: ${res.status}
      const data = await res.json();
      // Finny response received
      logger.info("🤖 [CHAT] API Response:", data);
      
      // Handle different response types based on intent
      let message;
      if (data.intent === "ask_fact_fresh" && data.fact) {
        // Format fact response for display
        const fact = data.fact;
        message = `**${fact.topic.replace(/_/g, ' ').toUpperCase()}**\n\n${fact.value}\n\n*Source: ${fact.source_title} (${fact.as_of})*`;
      } else if (data.intent === "ask_state_rule" && data.rule) {
        // Format state rule response for display
        const rule = data.rule;
        message = `**${rule.topic.replace(/_/g, ' ').toUpperCase()} - ${rule.state}**\n\n${rule.rule_summary}\n\n*Source: ${rule.source_title} (${rule.updated_at})*`;
      } else if (data.intent === "calc_projection" && data.projection) {
        // Format projection response for display
        const proj = data.projection;
        message = `**Projection Results**\n\nTarget: $${proj.swr_target.toLocaleString()}\nProjected: $${proj.projected_nest_egg.toLocaleString()}\nYears to target: ${proj.years_to_target}\n\n${proj.notes.join('\n')}`;
      } else if (data.intent === "ask_personalized" && data.message) {
        // Handle personalized responses (including rent vs buy analysis)
        message = data.message;
      } else if (data.intent === "goal") {
        // Minimal handling for goal flow: display message; future: add UI for follow-ups
        message = data.message || "Let's set a goal.";
      } else {
        // Default message handling
        message = data.message || "Sorry, I wasn't able to generate advice just now.";
      }
      
      // logger.info("messages", message);
      await pushChatWithDelay("finny", message);
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

// Export default export
export default useChat; 