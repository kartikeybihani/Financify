import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '@/app/_types/finny';
import finnyConstants from '@/app/_constants/finny';
import logger from '@/app/_utils/logger';
import { supabase } from '@/app/_lib/supabase/supabase';

// Message splitting removed - display messages as single strings

// Ultra-simple message splitting - only split when there are clear tables
const splitMessageWithTables = (fullMessage: string, structuredData?: any): ChatMessage[] => {
  try {
    // Simple approach: just check if message contains table markers
    const hasTables = fullMessage.includes('|') && fullMessage.includes('---');
    
    if (!hasTables) {
      // No tables, return as single message
      return [{
        id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: "finny",
        text: fullMessage,
        timestamp: Date.now(),
        type: "text"
      }];
    }
    
    // Find the first table and split there
    const firstTableIndex = fullMessage.search(/\|[\s\S]*?\n\s*\|[\s\-:]+\|/);
    
    if (firstTableIndex === -1) {
      // Table pattern not found, return original
      return [{
        id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: "finny",
        text: fullMessage,
        timestamp: Date.now(),
        type: "text"
      }];
    }
    
    // Split into two messages: before table and after table
    const textBeforeTable = fullMessage.substring(0, firstTableIndex).trim();
    const textAfterTable = fullMessage.substring(firstTableIndex).trim();
    
    const messages: ChatMessage[] = [];
    const baseTimestamp = Date.now();
    
    // Message 1: Text before table
    if (textBeforeTable) {
      messages.push({
        id: `finny-${baseTimestamp}-0-${Math.random().toString(36).substr(2, 9)}`,
        sender: "finny",
        text: textBeforeTable,
        timestamp: baseTimestamp,
        type: "text"
      });
    }
    
    // Message 2: Table (expandable)
    const tableSummary = extractTableSummary(textBeforeTable);
    messages.push({
      id: `finny-${baseTimestamp}-1-${Math.random().toString(36).substr(2, 9)}`,
      sender: "finny",
      text: tableSummary,
      timestamp: baseTimestamp + 100,
      type: "expandable",
      structuredData: structuredData
    });
    
    // Message 3: Text after table (if any)
    if (textAfterTable && textAfterTable.length > 50) {
      messages.push({
        id: `finny-${baseTimestamp}-2-${Math.random().toString(36).substr(2, 9)}`,
        sender: "finny",
        text: textAfterTable,
        timestamp: baseTimestamp + 200,
        type: "text"
      });
    }
    
    return messages.filter(msg => msg.text && msg.text.trim().length > 0);
    
  } catch (error) {
    logger.error("Error in splitMessageWithTables:", error);
    // Fallback to original message
    return [{
      id: `finny-${Date.now()}-fallback-${Math.random().toString(36).substr(2, 9)}`,
      sender: "finny",
      text: fullMessage,
      timestamp: Date.now(),
      type: "text"
    }];
  }
};

const extractTableSummary = (textBeforeTable: string): string => {
  try {
    // Look for the most recent header
    const headerMatch = textBeforeTable.match(/##\s*(.+?)(?:\n|$)/);
    if (headerMatch) {
      return headerMatch[1].trim();
    }
    
    // Look for the last meaningful sentence
    const sentences = textBeforeTable.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length > 0) {
      const lastSentence = sentences[sentences.length - 1].trim();
      if (lastSentence.length > 20 && lastSentence.length < 150) {
        return lastSentence;
      }
    }
    
    return "Here's the breakdown:";
  } catch (error) {
    logger.error("Error extracting table summary:", error);
    return "Here's the data:";
  }
};

export const useChat = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(finnyConstants.INITIAL_CHAT_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [showNudges, setShowNudges] = useState(true);
  const [goalFlow, setGoalFlow] = useState<any | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>("");

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
      } else {
        setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
        setShowNudges(true);
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

  const pushMultipleMessages = async (messages: ChatMessage[]) => {
    try {
      if (!messages || messages.length === 0) {
        logger.warn("No messages to send");
        return;
      }

      for (let i = 0; i < messages.length; i++) {
        try {
          if (i > 0) {
            // Add natural delay between messages (1-2 seconds)
            setIsTyping(true);
            await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
          }
          
          pushChat(messages[i]);
          setIsTyping(false);
          
          // Small delay to ensure smooth animation
          if (i < messages.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        } catch (messageError) {
          logger.error(`Error sending message ${i}:`, messageError);
          // Continue with next message
        }
      }
    } catch (error) {
      logger.error("Error pushing multiple messages:", error);
      setIsTyping(false);
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

      // Check if user wants to clear cache
      if (messageText.toLowerCase().includes("clear cache") || 
          messageText.toLowerCase().includes("refresh data")) {
        setProgressStatus("Clearing cache and refreshing data...");
        
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData?.session?.access_token || '';
          
          const clearRes = await fetch(`${BASE_URL}/api/store_accounts`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              mode: "clear_cache",
              user_id: user.id,
            }),
          });

          if (clearRes.ok) {
            pushChat("finny", "✅ Cache cleared! Your data has been refreshed. Ask me anything about your finances now.");
            return;
          } else {
            pushChat("finny", "⚠️ Cache clearing failed, but I'll still try to get fresh data for you.");
          }
        } catch (error) {
          logger.error("Cache clearing error:", error);
          pushChat("finny", "⚠️ Cache clearing failed, but I'll still try to get fresh data for you.");
        }
      }

      // Show initial progress
      setProgressStatus("Let me see what I can do");

      // Fetch session once and reuse the access token for all requests in this flow
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || '';

      // 1) First classify the message to determine intent (skip if goal flow active)
      const classifyRes = goalFlow?.active ? null : await fetch(`${BASE_URL}/api/finny`, {
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

      const classifyData = classifyRes ? await classifyRes.json() : { intent: "goal" };
      if (classifyRes) logger.info("🎯 [CHAT] Classification result:", classifyData);

      // Update progress based on intent
      if (classifyData.intent === "off_topic") {
        // Fun Gen Z-style messages for off-topic queries
        const funMessages = [
          "Hold up, let me redirect you to something better... 💸",
          "Plot twist: let's talk money instead! 🎭",
          "Ngl, I'm not the right person for that... but I AM great at finances! 💅",
          "Sksksks, that's not really my vibe... but your bank account? That's my jam! ✨",
          "Bestie, I'm not about that life... but I AM about that financial freedom! 🌟",
          "Periodt, that's not my expertise... but budgeting? Now we're talking! 💯",
          "Oooohh...",
          "Not it, chief... but your financial future? That's definitely it! 👑",
          "I'm gonna need you to redirect that energy to your finances! ⚡"
        ];
        const randomMessage = funMessages[Math.floor(Math.random() * funMessages.length)];
        setProgressStatus(randomMessage);
      } else if (classifyData.intent === "ask_personalized") {
        setProgressStatus("Taking a peek at your finances...");
      } else if (classifyData.intent === "goal") {
        setProgressStatus("Setting up your goal...");
      } else {
        setProgressStatus("Processing your request...");
      }

      // 2) Route to appropriate handler based on classification
      let res;
      if (!goalFlow?.active && classifyData.intent === "ask_personalized") {
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
            action: goalFlow?.active ? "goal" : classifyData.intent,
            message: messageText,
            context: goalFlow ? { goal_flow: goalFlow } : {}
          }),
        });
      }

      // Response status: ${res.status}
      setProgressStatus("Generating your personalized response...");
      const data = await res.json();
      // Finny response received
      logger.info("🤖 [CHAT] API Response:", data);
      
      // Check for structured data (tables) and implement simple message splitting
      if (data.structuredData && data.message) {
        try {
          // Use ultra-simple splitting for messages with tables
          const splitMessages = splitMessageWithTables(data.message, data.structuredData);
          
          if (splitMessages.length > 1) {
            // Multiple messages - send them with proper timing
            logger.info("🤖 [CHAT] Splitting message with tables into", splitMessages.length, "parts");
            await pushMultipleMessages(splitMessages);
            return;
          } else {
            // Single message - use original logic
            const expandableMessage: ChatMessage = {
              id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              sender: "finny",
              text: data.structuredData.summary || data.message || "",
              timestamp: Date.now(),
              type: "expandable",
              structuredData: data.structuredData,
            };
            setIsTyping(true);
            await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
            pushChat(expandableMessage);
            setIsTyping(false);
            return;
          }
        } catch (error) {
          logger.error("Error in message splitting:", error);
          // Fallback to original logic
        }
      }

      // Handle different response types based on intent
      let message;
      if (data.intent === "ask_fact_fresh" && data.fact) {
        // Format fact response for display - handle both old and new response formats
        const fact = data.fact;
        if (fact.message) {
          // New format with direct message
          message = fact.message;
        } else if (fact.value && fact.source_title) {
          // Old format with structured data
          message = `**${fact.topic.replace(/_/g, ' ').toUpperCase()}**\n\n${fact.value}\n\n*Source: ${fact.source_title} (${fact.as_of})*`;
        } else {
          // Fallback to any available text
          message = fact.message || fact.text || "Financial information retrieved successfully.";
        }
      } else if (data.intent === "ask_state_rule" && data.rule) {
        // Format state rule response for display
        const rule = data.rule;
        message = `**${rule.topic.replace(/_/g, ' ').toUpperCase()} - ${rule.state}**\n\n${rule.rule_summary}\n\n*Source: ${rule.source_title} (${rule.updated_at})*`;
      } else if (data.intent === "calc_projection" && data.projection) {
        // Format projection response for display
        const proj = data.projection;
        message = `**Projection Results**\n\nTarget: $${proj.swr_target.toLocaleString()}\nProjected: $${proj.projected_nest_egg.toLocaleString()}\nYears to target: ${proj.years_to_target}\n\n${proj.notes.join('\n')}`;
      } else if ((data.intent === "ask_personalized" || data.type === "assistant") && data.message) {
        message = data.message;
      } else if (data.intent === "goal") {
        // Persist flow state if provided
        if (data.flow && data.flow.active) setGoalFlow(data.flow);
        else setGoalFlow(null);
        // Handle goal messages with actions
        if (data.type === "action" && data.actions) {
          // Create action message
          const actionMessage: ChatMessage = {
            id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sender: "finny",
            text: data.message || "Let's set a goal.",
            timestamp: Date.now(),
            type: "action",
            actions: data.actions,
          };
          // Add typing delay for action messages
          setIsTyping(true);
          await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
          pushChat(actionMessage);
          setIsTyping(false);
          return; // Don't process as regular message
        }
        message = data.message || "Let's set a goal.";
      } else if (data.intent === "off_topic" && data.text) {
        // Handle off-topic queries with redirection
        message = data.text;
      } else {
        // Default message handling
        message = data.message || data.text || "Sorry, I wasn't able to generate advice just now.";
      }
      
      // logger.info("messages", message);
      setProgressStatus(""); // Clear progress status
      await pushChatWithDelay("finny", message);
    } catch (error) {
      logger.error("AI error:", error);
      setProgressStatus(""); // Clear progress status
      pushChat("finny", "Something went wrong. Try again later.");
    }
  };

  return {
    chatMessages,
    isTyping,
    showNudges,
    goalFlow,
    progressStatus,
    clearChat,
    pushChat,
    pushChatWithDelay,
    pushMultipleMessages,
    handleUserMessage,
  };
};

// Export default export
export default useChat; 