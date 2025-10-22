import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '@/src/types/finny';
import finnyConstants from '@/src/constants/finny';
import logger from '@/src/utils/logger';
import { supabase } from '@/src/lib/supabase/supabase';

// Simple message handling - display messages as single strings

export const useChat = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(finnyConstants.INITIAL_CHAT_MESSAGES);
  const [isTyping, setIsTyping] = useState(false);
  const [showNudges, setShowNudges] = useState(true);
  const [goalFlow, setGoalFlow] = useState<any | null>(null);
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isNewSession, setIsNewSession] = useState(true);
  const [chatId, setChatId] = useState<string>(() => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    loadChatMessages();
  }, []);

  // Note: We don't save on unmount - only save on app background or clear chat

  useEffect(() => {
    setShowNudges(chatMessages.length <= 1);
    saveChatMessages();
    // Remove auto-save - only save on app close or clear chat
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
      console.log("🧹 [CLEAR_CHAT] Clearing all chat data and context");
      
      // Clear UI immediately for smooth UX
      await AsyncStorage.removeItem("chatMessages");
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      setCurrentSessionId(null);
      setIsNewSession(true);
      setShowNudges(true);
      
      // 🔥 IMPORTANT: Clear goal flow state
      setGoalFlow(null);
      console.log("🔥 [CLEAR_CHAT] Goal flow cleared");
      
      // Generate new chat_id for fresh conversation (backend uses this to clear context)
      const newChatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      setChatId(newChatId);
      console.log("🆕 [CLEAR_CHAT] New chat ID generated:", newChatId);
      
      // Save current session to database in the background (don't await)
      saveCurrentSession().catch(error => {
        logger.error("Background database save failed:", error);
      });
      
      console.log("✅ [CLEAR_CHAT] Chat cleared successfully");
    } catch (error) {
      logger.error("Error clearing chat:", error);
    }
  };

  // Helper function to truncate text
  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  // Save current session to database (only when conversation ends)
  const saveCurrentSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        logger.warn("No user ID available for saving session");
        return;
      }
      
      if (chatMessages.length <= 1) {
        logger.info("Skipping session save - not enough messages:", chatMessages.length);
        return;
      }

      const firstUserMsg = chatMessages.find(m => m.sender === 'user');
      if (!firstUserMsg) {
        logger.warn("No user message found in chat for session save");
        return;
      }

      // Sort messages by timestamp to ensure proper chat sequence
      const sortedMessages = [...chatMessages].sort((a, b) => {
        const timestampA = a.timestamp || 0;
        const timestampB = b.timestamp || 0;
        return timestampA - timestampB;
      });

      logger.info("Saving chat session:", {
        userId: user.id,
        messageCount: sortedMessages.length,
        firstMessage: firstUserMsg.text.substring(0, 50) + '...',
        sessionTitle: truncate(firstUserMsg.text || 'Chat', 60),
        currentSessionId: currentSessionId,
        isUpdate: !!currentSessionId
      });

      let sessionId = currentSessionId;

      if (currentSessionId) {
        // Update existing session
        const { error: updateError } = await supabase
          .from('chat_sessions')
          .update({
            messages: sortedMessages,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentSessionId)
          .eq('user_id', user.id);

        if (updateError) {
          logger.error("Error updating chat session:", updateError);
        } else {
          logger.info("✅ Chat session updated successfully:", currentSessionId);
        }
      } else {
        // Create new session
        const { data, error } = await supabase.rpc('save_chat_session', {
          p_user_id: user.id,
          p_session_title: truncate(firstUserMsg.text || 'Chat', 60),
          p_first_message: firstUserMsg.text || '',
          p_messages: sortedMessages
        });

        if (error) {
          logger.error("Error saving chat session:", error);
        } else {
          sessionId = data;
          setCurrentSessionId(data);
          logger.info("✅ Chat session saved successfully:", data);
        }
      }
    } catch (error) {
      logger.error("Error in saveCurrentSession:", error);
    }
  };

  // Start new session
  const startNewSession = async () => {
    try {
      console.log("🆕 [NEW_SESSION] Starting new session");
      
      await saveCurrentSession();
      await AsyncStorage.removeItem('chatMessages');
      setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
      setCurrentSessionId(null);
      setIsNewSession(true);
      setShowNudges(true);
      
      // 🔥 IMPORTANT: Clear goal flow state for fresh session
      setGoalFlow(null);
      console.log("🔥 [NEW_SESSION] Goal flow cleared");
      
      // Generate new chat_id for fresh conversation
      const newChatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      setChatId(newChatId);
      console.log("🆕 [NEW_SESSION] New chat ID generated:", newChatId);
      
      logger.info("Started new chat session");
    } catch (error) {
      logger.error("Error starting new session:", error);
    }
  };

  // Load session from database
  const loadSession = async (sessionId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const { data, error } = await supabase.rpc('get_chat_session_messages', {
        p_session_id: sessionId,
        p_user_id: user.id
      });

      if (error) {
        logger.error("Error loading session:", error);
        return;
      }

      if (data && Array.isArray(data)) {
        setChatMessages(data);
        setCurrentSessionId(sessionId);
        setIsNewSession(false);
        await AsyncStorage.setItem('chatMessages', JSON.stringify(data));
        setShowNudges(data.length <= 1);
        logger.info("Session loaded:", sessionId);
      }
    } catch (error) {
      logger.error("Error in loadSession:", error);
    }
  };

  // Setup app state listener for detecting app lifecycle
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'background' && appStateRef.current === 'active') {
        // App going to background - save current session
        if (chatMessages.length > 1) {
          logger.info("App going to background - saving current session");
          await saveCurrentSession();
        }
      } else if (nextAppState === 'active' && appStateRef.current === 'background') {
        // App came to foreground - start fresh session
        logger.info("App came to foreground - starting fresh session");
        if (chatMessages.length > 1) {
          await startNewSession();
        }
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, [chatMessages.length]); // Add dependency to access current chatMessages


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

  // Handle streaming response from API
  const handleStreamingResponse = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentMessage = '';
    let messageId = `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const event = line.slice(7);
            continue;
          }
          
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            if (data.status) {
              setProgressStatus(data.status);
              setIsTyping(true); // Keep typing indicator on during progress updates
            } else if (data.text) {
              // Stream text chunks
              currentMessage += data.text;
              pushChat({
                id: messageId,
                sender: "finny",
                text: currentMessage,
                timestamp: Date.now(),
                type: "text",
                isStreaming: true
              });
            } else if (data.message || data.text) {
              // Complete response
              const finalMessage = data.message || data.text;
              pushChat({
                id: messageId,
                sender: "finny",
                text: finalMessage,
                timestamp: Date.now(),
                type: "text",
                isStreaming: false
              });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
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

  // Handle split messages with Gen Z-optimized timing
  const handleSplitMessages = async (splitMessages: Array<{type: string, content: string}>) => {
    try {
      console.log(`[Frontend] Processing ${splitMessages.length} split messages`);
      
      for (let i = 0; i < splitMessages.length; i++) {
        const messageObj = splitMessages[i];
        
        // Show typing indicator for each message (Gen Z expects this)
        setIsTyping(true);
        
        // Gen Z-optimized delay: 1.2 seconds (faster than 1.5s for better engagement)
        const delay = 1200 + Math.random() * 300; // 1.2-1.5s range
        await new Promise((resolve) => setTimeout(resolve, delay));
        
        setIsTyping(false);
        
        // Push the message
        pushChat("finny", messageObj.content);
        
        // Small pause between messages (but not after the last one)
        if (i < splitMessages.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      
      console.log(`[Frontend] Completed sending ${splitMessages.length} split messages`);
    } catch (error) {
      logger.error("Error handling split messages:", error);
      setIsTyping(false);
    }
  };

  const handleUserMessage = async (messageText: string, startTime?: number) => {
    setIsTyping(true); // Start typing indicator immediately
    await handleFinnyResponse(messageText, startTime);
    // Note: setIsTyping(false) is now handled within handleFinnyResponse for streaming
  };

  const handleFinnyResponse = async (messageText: string, startTime?: number) => {
    const BASE_URL = process.env.EXPO_PUBLIC_APP_BASE_URL || "https://financify-rose.vercel.app";
    try {
      // Get user_id for the API calls
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }

      // Check if we should use streaming (default to true for better UX)
      const useStreaming = true;

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
          chat_id: chatId, // Send chat_id for conversation context
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
        // Check if web search is needed for more specific progress message
        if (classifyData.needs_web) {
          setProgressStatus("Looking up the web for you now...");
        } else {
          setProgressStatus("Taking a peek at your finances...");
        }
      } else if (classifyData.intent === "goal") {
        setProgressStatus("Setting up your goal...");
      } else {
        setProgressStatus("Brewing up solutions...");
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
            chat_id: chatId, // Send chat_id for conversation context
            context: {},
            classification: classifyData,
            stream: useStreaming
          }),
        });
      } else {
        // For other intents (goal, etc.), route directly
        res = await fetch(`${BASE_URL}/api/finny`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            action: goalFlow?.active ? "goal_conversation" : classifyData.intent,
            message: messageText,
            chat_id: chatId, // Send chat_id for conversation context
            context: goalFlow ? { goal_flow: goalFlow } : {},
            stream: useStreaming
          }),
        });
      }

      // Handle streaming vs regular response
      if (useStreaming && res.headers.get('content-type')?.includes('text/event-stream')) {
        // Handle streaming response
        await handleStreamingResponse(res);
        setProgressStatus(""); // Clear progress status
        setIsTyping(false); // Stop typing indicator
        return;
      } else {
        // Handle regular JSON response
        const data = await res.json();
        logger.info("🤖 [CHAT] API Response:", data);
      
      // Handle structured data as regular messages - no splitting or expandable logic

      // Handle different response types based on intent
      let message;
      if (data.intent === "calc_projection" && data.projection) {
        // Format projection response for display
        const proj = data.projection;
        message = `**Projection Results**\n\nTarget: $${proj.swr_target.toLocaleString()}\nProjected: $${proj.projected_nest_egg.toLocaleString()}\nYears to target: ${proj.years_to_target}\n\n${proj.notes.join('\n')}`;
      } else if (data.intent === "goal_conversation") {
        // CHECK GOAL CONVERSATION FIRST before generic assistant type check!
        
        // Persist flow state if provided
        if (data.goal_flow && data.goal_flow.active) {
          setGoalFlow(data.goal_flow);
        } else {
          setGoalFlow(null);
        }
        
        // Handle goal messages with actions - check for actions regardless of type
        if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
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
      } else if ((data.intent === "ask_personalized" || data.type === "assistant") && data.message) {
        // Generic assistant/ask responses (must come AFTER goal_conversation check)
        message = data.message;
      } else if (data.intent === "off_topic" && data.text) {
        // Handle off-topic queries with redirection
        message = data.text;
      } else {
        // Default message handling
        message = data.message || data.text || "Sorry, I wasn't able to generate advice just now.";
      }
      
      // logger.info("messages", message);
      setProgressStatus(""); // Clear progress status
      
      // Log total response time
      if (startTime) {
        const totalResponseDuration = Date.now() - startTime;
        const ptTime = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
        console.log(`📥 Total response time: ${totalResponseDuration}ms (${(totalResponseDuration / 1000).toFixed(2)}s) at ${ptTime} PT`);
      }
      
        // Handle split messages for better UX
        if (data.isSplit && Array.isArray(data.message)) {
          console.log(`[Frontend] Received ${data.message.length} split messages`);
          await handleSplitMessages(data.message);
        } else {
          await pushChatWithDelay("finny", message);
        }
      } // Close the else block for regular JSON response
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
    currentSessionId,
    isNewSession,
    chatId, // Export chatId
    clearChat,
    pushChat,
    pushChatWithDelay,
    pushMultipleMessages,
    handleUserMessage,
    startNewSession,
    loadSession,
  };
};

// Export default export
export default useChat; 