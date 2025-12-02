import { useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '@/src/types/finny';
import finnyConstants from '@/src/constants/finny';
import logger from '@/src/utils/core/logger';
import { supabase } from '@/src/lib/supabase/supabase';
import { getFreshAccessToken, authenticatedFetch } from '@/src/utils/auth/authToken';

/**
 * Creates a promise that rejects after a specified timeout duration.
 * Used to prevent infinite hangs when Supabase operations get stuck.
 */
const createTimeoutPromise = (ms: number, message: string): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

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
      // CRITICAL: Verify current user matches stored user before loading messages
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      
      if (!currentUserId) {
        // No user logged in, start fresh
        setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
        setShowNudges(true);
        return;
      }

      // Check if stored chat belongs to current user
      const storedUserId = await AsyncStorage.getItem("currentChatUserId");
      if (storedUserId && storedUserId !== currentUserId) {
        // Different user detected - clear old chat data
        console.log("🔄 [SECURITY] User changed, clearing previous user's chat data");
        await AsyncStorage.removeItem("chatMessages");
        await AsyncStorage.removeItem("chatId");
        await AsyncStorage.removeItem("currentChatUserId");
        setChatMessages(finnyConstants.INITIAL_CHAT_MESSAGES);
        setShowNudges(true);
        // Generate new chatId for new user
        const newChatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        setChatId(newChatId);
        await AsyncStorage.setItem("currentChatUserId", currentUserId);
        return;
      }

      // Load stored chatId or generate new one
      const storedChatId = await AsyncStorage.getItem("chatId");
      if (storedChatId) {
        setChatId(storedChatId);
      } else {
        const newChatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        setChatId(newChatId);
        await AsyncStorage.setItem("chatId", newChatId);
      }
      
      // Store current user ID for future verification
      await AsyncStorage.setItem("currentChatUserId", currentUserId);

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
      // CRITICAL: Only save if current user matches stored user
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      
      if (!currentUserId) {
        // Don't save if no user logged in
        return;
      }

      const storedUserId = await AsyncStorage.getItem("currentChatUserId");
      if (storedUserId && storedUserId !== currentUserId) {
        // User changed - don't save messages for wrong user
        console.log("⚠️ [SECURITY] User mismatch detected, not saving chat messages");
        return;
      }

      await AsyncStorage.setItem("chatMessages", JSON.stringify(chatMessages));
      await AsyncStorage.setItem("chatId", chatId);
      await AsyncStorage.setItem("currentChatUserId", currentUserId);
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
      await AsyncStorage.setItem("chatId", newChatId);
      
      // Store current user ID for verification
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await AsyncStorage.setItem("currentChatUserId", user.id);
      }
      
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
      await AsyncStorage.setItem("chatId", newChatId);
      
      // Store current user ID for verification
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await AsyncStorage.setItem("currentChatUserId", user.id);
      }
      
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

  // Toggle for verbose streaming debug logs
  const STREAM_DEBUG = false;

  // Handle streaming response using XMLHttpRequest (works in React Native!)
  // Note: accessToken parameter is kept for backward compatibility but should be fresh
  const handleStreamingResponseXHR = async (url: string, requestBody: any, accessToken: string) => {
    // Ensure we have a fresh token (accessToken param might be stale)
    const freshToken = await getFreshAccessToken();
    if (!freshToken) {
      throw new Error('Not authenticated - no access token available');
    }
    
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let receivedLength = 0;
      let buffer = '';
      let currentMessage = '';
      let messageId = `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      let currentEvent = '';

      if (STREAM_DEBUG) {
        console.log("🔄 [STREAMING] Starting XMLHttpRequest streaming");
      }

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${freshToken}`);

      // This is the magic - onprogress gets called as data arrives!
      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(receivedLength);
        receivedLength = xhr.responseText.length;
        buffer += newData;

        // Process complete lines (SSE format)
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('event: ')) {
            const event = line.slice(7).trim();
            if (STREAM_DEBUG) {
              console.log("📡 [STREAMING] Event:", event);
            }
            // Store the event type for the next data line
            currentEvent = event;
            continue;
          }

          if (line.startsWith('data: ')) {
            const dataString = line.slice(6).trim();
            if (dataString === '') continue;

            try {
              const data = JSON.parse(dataString);
              if (STREAM_DEBUG) {
                console.log("📦 [STREAMING] Data chunk:", data);
                console.log("🔍 [STREAMING] Current event:", currentEvent);
                console.log("🔍 [STREAMING] Data keys:", Object.keys(data));
                console.log("🔍 [STREAMING] Has actions?", !!data.actions);
                console.log("🔍 [STREAMING] Has message?", !!data.message);
                console.log("🔍 [STREAMING] Data type:", data.type);
              }

              // Handle complete event (final response with actions)
              if (currentEvent === 'complete') {
                if (STREAM_DEBUG) {
                  console.log("🎯 [STREAMING] Complete event received:", data);
                }
                const finalMessage = data.message || currentMessage;
                if (finalMessage && typeof finalMessage === 'string' && finalMessage.trim()) {
                  setChatMessages(prev => {
                    const existingIndex = prev.findIndex(msg => msg.id === messageId);
                    if (existingIndex >= 0) {
                      const updated = [...prev];
                      updated[existingIndex] = {
                        ...updated[existingIndex],
                        text: finalMessage,
                        isStreaming: false,
                        // Preserve actions if present in the complete response
                        ...(data.actions && { actions: data.actions }),
                        ...(data.type && { type: data.type })
                      };
                      if (STREAM_DEBUG) {
                        console.log("🔄 [STREAMING] Updated existing message with complete response:", updated[existingIndex]);
                      }
                      return updated;
                    } else {
                      const completedMessage: ChatMessage = {
                        id: messageId,
                        sender: "finny" as const,
                        text: finalMessage,
                        timestamp: Date.now(),
                        type: data.actions && data.actions.length > 0 ? "action" as const : (data.type === "action" ? "action" as const : "text" as const),
                        isStreaming: false,
                        // Preserve actions if present in the complete response
                        ...(data.actions && { actions: data.actions })
                      };
                      if (STREAM_DEBUG) {
                        console.log("✨ [STREAMING] Created new message with complete response:", completedMessage);
                      }
                      return [...prev, completedMessage];
                    }
                  });
                }
                return; // Skip other processing for complete event
              }

              if (data.status) {
                setProgressStatus(data.status);
                setIsTyping(true);
              } else if (data.text) {
                // Stream text chunks with space between
                currentMessage += (currentMessage ? ' ' : '') + data.text;
                if (STREAM_DEBUG) {
                  console.log("📝 [STREAMING] Current message:", currentMessage);
                }
                
                // Only update if we have actual text content
                if (currentMessage && currentMessage.trim()) {
                  // Update the message in real-time
                  setChatMessages(prev => {
                    const existingIndex = prev.findIndex(msg => msg.id === messageId);
                    if (existingIndex >= 0) {
                      const updated = [...prev];
                      updated[existingIndex] = {
                        ...updated[existingIndex],
                        text: currentMessage,
                        isStreaming: true
                      };
                      if (STREAM_DEBUG) {
                        console.log("🔄 [STREAMING] Updated existing message:", updated[existingIndex]);
                      }
                      return updated;
                    } else {
                      const newMessage: ChatMessage = {
                        id: messageId,
                        sender: "finny" as const,
                        text: currentMessage,
                        timestamp: Date.now(),
                        type: "text" as const,
                        isStreaming: true
                      };
                      if (STREAM_DEBUG) {
                        console.log("✨ [STREAMING] Created new message:", newMessage);
                      }
                      return [...prev, newMessage];
                    }
                  });
                }
              } else if (data.message) {
                // Final complete response - handle both text and actions
                const finalMessage = data.message || currentMessage;
                if (STREAM_DEBUG) {
                  console.log("🎯 [STREAMING] Final message:", finalMessage);
                  console.log("🎯 [STREAMING] Actions:", data.actions);
                  console.log("🎯 [STREAMING] Type:", data.type);
                }
                
                if (finalMessage && typeof finalMessage === 'string' && finalMessage.trim()) {
                  setChatMessages(prev => {
                    const existingIndex = prev.findIndex(msg => msg.id === messageId);
                    if (existingIndex >= 0) {
                      const updated = [...prev];
                      updated[existingIndex] = {
                        ...updated[existingIndex],
                        text: finalMessage,
                        isStreaming: false,
                        // Preserve actions if present in the complete response
                        ...(data.actions && { actions: data.actions }),
                        ...(data.type && { type: data.type })
                      };
                      if (STREAM_DEBUG) {
                        console.log("🔄 [STREAMING] Updated existing message with actions:", updated[existingIndex]);
                      }
                      return updated;
                    } else {
                      const completedMessage: ChatMessage = {
                        id: messageId,
                        sender: "finny" as const,
                        text: finalMessage,
                        timestamp: Date.now(),
                        type: data.actions && data.actions.length > 0 ? "action" as const : (data.type === "action" ? "action" as const : "text" as const),
                        isStreaming: false,
                        // Preserve actions if present in the complete response
                        ...(data.actions && { actions: data.actions })
                      };
                      if (STREAM_DEBUG) {
                        console.log("✨ [STREAMING] Created new message with actions:", completedMessage);
                      }
                      return [...prev, completedMessage];
                    }
                  });
                }
              }
            } catch (parseError) {
              console.error("❌ [STREAMING] JSON parse error:", parseError);
            }
          }
        }
      };

      xhr.onloadend = () => {
        // Process any remaining data
        if (STREAM_DEBUG && buffer.trim()) {
          console.log("🔚 [STREAMING] Processing final buffer:", buffer);
        }
        if (STREAM_DEBUG) {
          console.log("✅ [STREAMING] Stream completed");
        }
        setProgressStatus("");
        setIsTyping(false);
        resolve();
      };

      xhr.onerror = () => {
        console.error("❌ [STREAMING] XHR error");
        reject(new Error('Streaming request failed'));
      };

      xhr.send(JSON.stringify(requestBody));
    });
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

  // Handle action button clicks without creating new messages
  const handleActionButton = async (action: string) => {
    const BASE_URL = process.env.EXPO_PUBLIC_APP_BASE_URL || "https://financify-rose.vercel.app";
    try {
      // Get user_id for the API calls
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }

      // Get fresh access token (always fetches latest, never uses stale state)
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }

      // Send action to backend in existing conversation context
      const res = await authenticatedFetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        body: JSON.stringify({
          action: "goal_conversation",
          message: action,
          chat_id: chatId,
          context: goalFlow ? { goal_flow: goalFlow } : {},
          stream: false
        }),
      });

      const data = await res.json();
      logger.info("🎯 [ACTION] API Response:", data);

      // Create a new message with the response (don't update existing message)
      if (data.message) {
        const newMessage = {
          id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sender: "finny" as const,
          text: data.message,
          timestamp: Date.now(),
          type: data.actions && data.actions.length > 0 ? "action" as const : "text" as const,
          ...(data.actions && { actions: data.actions })
        };
        
        setChatMessages(prev => [...prev, newMessage]);
        logger.info("🎯 [ACTION] Created new message:", newMessage);

        // Update goal flow state if provided
        if (data.goal_flow) {
          setGoalFlow(data.goal_flow);
        }
      }
    } catch (error) {
      logger.error("❌ [ACTION] Error handling action button:", error);
      pushChat("finny", "Something went wrong. Try again later.");
    }
  };

  /**
   * Handles user messages and generates Finny's response.
   * 
   * This is the main function that processes chat messages. It:
   * - Uses getSession() instead of getUser() to avoid hangs during token refresh
   * - Classifies the message intent (unless goal flow is active)
   * - Routes to appropriate handlers (streaming or regular)
   * - Handles special commands like "clear cache"
   * 
   * The use of getSession() is critical - getUser() can hang indefinitely during
   * token refresh, but getSession() reads from local storage and is much faster.
   * 
   * @param messageText - The user's message text
   * @param startTime - Optional timestamp for performance tracking
   */
  const handleFinnyResponse = async (messageText: string, startTime?: number) => {
    const callId = Math.random().toString(36).substring(2, 8);
    const funcStartTime = Date.now();
    logger.info(`[CHAT] 💬 handleFinnyResponse START [${callId}] - message: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
    
    const BASE_URL = process.env.EXPO_PUBLIC_APP_BASE_URL || "https://financify-rose.vercel.app";
    try {
      logger.info(`[CHAT] 💬 [${callId}] Step 1: Getting session and token...`);
      
      // First, get fresh access token with timeout protection (validates auth is working)
      const tokenStartTime = Date.now();
      const accessToken = await getFreshAccessToken();
      const tokenDuration = Date.now() - tokenStartTime;
      logger.info(`[CHAT] 💬 [${callId}] getFreshAccessToken() completed in ${tokenDuration}ms - hasToken: ${!!accessToken}`);
      
      if (!accessToken) {
        logger.warn(`[CHAT] ⚠️ [${callId}] No access token, returning early`);
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }
      
      // Get session with timeout protection to extract user ID
      const GET_SESSION_TIMEOUT_MS = 2000;
      const sessionStartTime = Date.now();
      let userId: string;
      try {
        const getSessionPromise = supabase.auth.getSession();
        const timeoutPromise = createTimeoutPromise(
          GET_SESSION_TIMEOUT_MS,
          `getSession() timeout after ${GET_SESSION_TIMEOUT_MS}ms`
        );
        
        const result = await Promise.race([getSessionPromise, timeoutPromise]);
        
        // Type guard: timeoutPromise always rejects, so if we reach here, result is from getSessionPromise
        if (result instanceof Error) {
          throw result;
        }
        
        const { data: { session }, error: sessionError } = result;
        const sessionDuration = Date.now() - sessionStartTime;
        logger.info(`[CHAT] 💬 [${callId}] getSession() completed in ${sessionDuration}ms - hasSession: ${!!session}, hasUser: ${!!session?.user?.id}`);
        
        if (!session?.user?.id || sessionError) {
          logger.warn(`[CHAT] ⚠️ [${callId}] No session or user ID, returning early`);
          pushChat("finny", "Please log in to get personalized financial advice.");
          return;
        }
        
        userId = session.user.id;
      } catch (timeoutError: any) {
        const sessionDuration = Date.now() - sessionStartTime;
        if (timeoutError?.message?.includes('timeout')) {
          logger.error(`[CHAT] ❌ [${callId}] getSession() TIMEOUT after ${sessionDuration}ms - Supabase may be stuck`);
        } else {
          logger.error(`[CHAT] ❌ [${callId}] Unexpected error in getSession():`, timeoutError);
        }
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }

      const useStreaming = true;
      if (messageText.toLowerCase().includes("clear cache") || 
          messageText.toLowerCase().includes("refresh data")) {
        setProgressStatus("Clearing cache and refreshing data...");
        
        try {
          // Get fresh access token
          const accessToken = await getFreshAccessToken();
          if (!accessToken) {
            pushChat("finny", "⚠️ Authentication error. Please try again.");
            return;
          }
          
          const clearRes = await authenticatedFetch(`${BASE_URL}/api/store_accounts`, {
            method: "POST",
            body: JSON.stringify({
              mode: "clear_cache",
              user_id: userId,
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
      setProgressStatus("Brewing up some financial wisdom...");

      // 1) First classify the message to determine intent (skip if goal flow active)
      if (goalFlow?.active) {
        logger.info(`[CHAT] 💬 [${callId}] Skipping classification (goal flow active)`);
      } else {
        logger.info(`[CHAT] 💬 [${callId}] Step 3: Classifying message...`);
      }
      const classifyStartTime = Date.now();
      const classifyRes = goalFlow?.active ? null : await authenticatedFetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        body: JSON.stringify({
          action: "classify",
          message: messageText,
          chat_id: chatId, // Send chat_id for conversation context
          // client context no longer carries user_id; server derives it
          context: {}
        }),
      });

      const classifyData = classifyRes ? await classifyRes.json() : { intent: "goal" };
      const classifyDuration = Date.now() - classifyStartTime;
      if (classifyRes) {
        logger.info(`[CHAT] 💬 [${callId}] Classification completed in ${classifyDuration}ms - result:`, classifyData);
      } else {
        logger.info(`[CHAT] 💬 [${callId}] Classification skipped (goal flow active)`);
      }

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
        // Fun but warm messages for other intents
        const warmMessages = [
          "Brewing up some financial wisdom... ☕",
          "Crunching numbers with love... 💕",
          "Getting your financial story ready... 📖",
          "Preparing something special for you... ✨",
          "Working my magic on your money matters... 🪄",
          "Crafting the perfect financial insight... 🎨",
          "Putting together your financial puzzle... 🧩",
          "Whipping up some financial advice... 👨‍🍳",
          "Polishing your financial gems... 💎",
          "Weaving your financial tapestry... 🧵"
        ];
        const randomWarmMessage = warmMessages[Math.floor(Math.random() * warmMessages.length)];
        setProgressStatus(randomWarmMessage);
      }

      // 2) Route to appropriate handler based on classification
      // Use XMLHttpRequest for streaming, fetch for regular responses
      logger.info(`[CHAT] 💬 [${callId}] Step 4: Routing to handler (streaming: ${useStreaming})...`);
      if (useStreaming) {
        logger.info(`[CHAT] 💬 [${callId}] Using XMLHttpRequest for streaming`);
        if (STREAM_DEBUG) {
          console.log("🔄 [STREAMING] Using XMLHttpRequest for streaming");
        }
        const requestBody = !goalFlow?.active && classifyData.intent === "ask_personalized" 
          ? {
              action: "ask",
              message: messageText,
              chat_id: chatId,
              context: {},
              classification: classifyData,
              stream: true
            }
          : {
              action: goalFlow?.active ? "goal_conversation" : classifyData.intent,
              message: messageText,
              chat_id: chatId,
              context: goalFlow ? { goal_flow: goalFlow } : {},
              stream: true
            };

        const streamStartTime = Date.now();
        try {
          logger.info(`[CHAT] 💬 [${callId}] Starting streaming request...`);
          await handleStreamingResponseXHR(`${BASE_URL}/api/finny`, requestBody, "");
          const streamDuration = Date.now() - streamStartTime;
          const totalDuration = Date.now() - funcStartTime;
          logger.info(`[CHAT] ✅ [${callId}] Streaming completed in ${streamDuration}ms (total: ${totalDuration}ms)`);
          return; // Done with streaming, exit early
        } catch (streamError) {
          const streamDuration = Date.now() - streamStartTime;
          const totalDuration = Date.now() - funcStartTime;
          logger.error(`[CHAT] ❌ [${callId}] Streaming failed after ${totalDuration}ms:`, streamError);
          console.error("❌ [STREAMING] Streaming failed:", streamError);
          pushChat("finny", "Something went wrong. Try again later.");
          setProgressStatus("");
          setIsTyping(false);
          return;
        }
      }

      // Regular fetch for non-streaming requests
      let res;
      if (!goalFlow?.active && classifyData.intent === "ask_personalized") {
        res = await authenticatedFetch(`${BASE_URL}/api/finny`, {
          method: "POST",
          body: JSON.stringify({
            action: "ask",
            message: messageText,
            chat_id: chatId,
            context: {},
            classification: classifyData,
            stream: false
          }),
        });
      } else {
        res = await authenticatedFetch(`${BASE_URL}/api/finny`, {
          method: "POST",
          body: JSON.stringify({
            action: goalFlow?.active ? "goal_conversation" : classifyData.intent,
            message: messageText,
            chat_id: chatId,
            context: goalFlow ? { goal_flow: goalFlow } : {},
            stream: false
          }),
        });
      }

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
    } catch (error) {
      const totalDuration = Date.now() - funcStartTime;
      logger.error(`[CHAT] ❌ [${callId}] handleFinnyResponse ERROR after ${totalDuration}ms:`, error);
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
    handleFinnyResponse, // Export for action button handling
    handleActionButton, // Export for action button handling
    startNewSession,
    loadSession,
  };
};

// Export default export
export default useChat; 