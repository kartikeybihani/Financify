import { useState, useEffect, useRef } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, Goal } from '@/src/types/finny';
import finnyConstants from '@/src/constants/finny';
import logger from '@/src/utils/core/logger';
import { supabase } from '@/src/lib/supabase/supabase';
import { getFreshAccessToken, authenticatedFetch, invalidateTokenCache } from '@/src/utils/auth/authToken';

/**
 * Creates a promise that rejects after a specified timeout duration.
 * Used to prevent infinite hangs when Supabase operations get stuck.
 */
const createTimeoutPromise = (ms: number, message: string): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

/**
 * Extracts user ID from a JWT token by decoding the payload.
 * This is a fallback when getSession() times out.
 * 
 * @param token - JWT access token
 * @returns User ID if found, null otherwise
 */
const extractUserIdFromToken = (token: string): string | null => {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode the payload (base64url)
    const payload = parts[1];
    // Replace URL-safe base64 characters
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    
    // Supabase JWT contains user ID in 'sub' field
    return parsed.sub || parsed.user_id || null;
  } catch (error) {
    logger.warn('[CHAT] Failed to extract userId from token:', error);
    return null;
  }
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
  const shouldPersistRef = useRef(false);

  useEffect(() => {
    loadChatMessages();
  }, []);

  // Note: We don't save on unmount - only save on app background or clear chat

  // Update nudges when messages change; persistence is handled explicitly
  useEffect(() => {
    setShowNudges(chatMessages.length <= 1);
  }, [chatMessages]);

  /**
   * Persist chat messages to AsyncStorage only when:
   * - We've explicitly marked that a save should happen (shouldPersistRef.current)
   * - There are no in-progress streaming messages (isStreaming === true)
   *
   * This ensures we never save partially streamed Finny messages, which can
   * otherwise lead to truncated responses being rehydrated when the user
   * returns to the Finny tab.
   */
  useEffect(() => {
    if (!shouldPersistRef.current) return;

    // Don't persist while any message is still streaming
    const hasStreamingMessage = chatMessages.some(
      (m: any) => m && (m as any).isStreaming
    );
    if (hasStreamingMessage) return;

    shouldPersistRef.current = false;
    // Fire and forget; errors are logged inside saveChatMessages
    void saveChatMessages();
  }, [chatMessages]);

  /**
   * Listen for TOKEN_REFRESHED events.
   * 
   * Note: We do NOT invalidate the cache here because the token refresh coordinator
   * in authToken.ts already handles cache invalidation and caching of the new token.
   * Invalidating here would clear the freshly cached token, forcing unnecessary
   * getSession() calls. The coordinator ensures all queued requests receive the new token.
   */
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "authStateChanged",
      (data: { event: string; session: any; validated: boolean }) => {
        if (data?.event === "TOKEN_REFRESHED") {
          logger.info("[CHAT] 🔄 TOKEN_REFRESHED event received - token refresh coordinator has already cached new token");
          // No action needed - refresh coordinator handles everything
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

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
      // Log all Finny messages (errors, non-streaming responses, etc.)
      // Streaming responses are logged separately in handleFinnyResponse
      const preview = msg.text.length > 200 ? msg.text.substring(0, 200) + '...' : msg.text;
      logger.info(`Finny: ${preview}`);
    }
    setChatMessages((prev) => [...prev, msg]);
    // Mark for persistence after new messages are added (non-streaming only)
    if (!(msg as any).isStreaming) {
      shouldPersistRef.current = true;
    }
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
  // Returns the final response message for logging
  const handleStreamingResponseXHR = async (url: string, requestBody: any, accessToken: string): Promise<string | null> => {
    // Ensure we have a fresh token (accessToken param might be stale)
    const freshToken = await getFreshAccessToken();
    if (!freshToken) {
      throw new Error('Not authenticated - no access token available');
    }
    
    return new Promise<string | null>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let receivedLength = 0;
      let buffer = '';
      let accumulatedText = '';
      let finalResponseMessage: string | null = null;
      const messageId = `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      let currentEvent = '';
      const STREAM_TIMEOUT_MS = 30000;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let didAppendAny = false;
      let didAppendFinal = false;
      let settled = false;

      const fallbackMessage = "Sorry — I hit a snag while responding. Please try again.";

      const safeResolve = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const safeReject = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const finalizeTyping = () => {
        setProgressStatus("");
        setIsTyping(false);
      };

      const resetStreamTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (settled) return;
          console.warn("⚠️ [STREAMING] Timeout reached, aborting XHR");
          try {
            xhr.abort();
          } catch {
            // no-op
          }

          const fallback = fallbackMessage;
          finalResponseMessage = fallback;
          setChatMessages(prev => {
            const updated = [...prev];
            const messageIndex = updated.findIndex(msg => msg.id === messageId);
            const baseMessage: ChatMessage = {
              id: messageId,
              sender: "finny" as const,
              text: fallback,
              timestamp: messageIndex >= 0 ? updated[messageIndex].timestamp : Date.now(),
              type: "text" as const,
              isStreaming: false,
            };
            if (messageIndex >= 0) {
              updated[messageIndex] = { ...updated[messageIndex], ...baseMessage };
            } else {
              updated.push(baseMessage);
            }
            return updated;
          });
          didAppendAny = true;
          didAppendFinal = true;
          shouldPersistRef.current = true;
          finalizeTyping();
          safeResolve(fallback);
        }, STREAM_TIMEOUT_MS);
      };

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${freshToken}`);
      resetStreamTimeout();

      // This is the magic - onprogress gets called as data arrives!
      xhr.onprogress = () => {
        resetStreamTimeout();
        const newData = xhr.responseText.substring(receivedLength);
        receivedLength = xhr.responseText.length;
        buffer += newData;

        // Process complete lines (SSE format)
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }

          if (line.startsWith('data:')) {
            const dataString = line.slice(5).trim();
            if (dataString === '') continue;

            try {
              const data = JSON.parse(dataString);

              // Handle complete event (final response with actions)
              if (currentEvent === 'complete') {
                const answer = data?.answer || {};
                const actions = data.actions || answer.actions;
                const hasActions =
                  Array.isArray(actions) && actions.length > 0;
                // Get final message - prefer data.message, then answer.message, fallback to accumulatedText
                const finalMessage = (data.message && typeof data.message === 'string') 
                  ? data.message 
                  : (answer.message && typeof answer.message === 'string')
                  ? answer.message
                  : (accumulatedText && typeof accumulatedText === 'string' ? accumulatedText : '');
                const stockCandidatePayload =
                  data.stock_candidate ||
                  data.stockCandidate ||
                  answer.stock_candidate ||
                  answer.stockCandidate;
                const stockCandidate =
                  stockCandidatePayload && typeof stockCandidatePayload === 'string'
                    ? { ticker: stockCandidatePayload }
                    : stockCandidatePayload;
                const resolvedType = hasActions ? "action" : (data.type || answer.type);
                const resolvedHideFeedback =
                  data.hideFeedback !== undefined ? data.hideFeedback : answer.hideFeedback;
                const resolvedHideActions =
                  data.hideActions !== undefined ? data.hideActions : answer.hideActions;
                
                // Only set if we have a valid string
                if (finalMessage && typeof finalMessage === 'string') {
                  finalResponseMessage = finalMessage;
                }
                
                // Check if API returned "Please log in" - indicates stale/invalid token
                if (finalMessage && typeof finalMessage === 'string' && 
                    (finalMessage.toLowerCase().includes("please log in") || 
                     finalMessage.toLowerCase().includes("log in"))) {
                  logger.warn(`[CHAT] ⚠️ API returned "Please log in" - invalidating cache`);
                  invalidateTokenCache();
                  // Reject the promise to trigger retry in calling code
                  if (timeoutId) clearTimeout(timeoutId);
                  finalizeTyping();
                  try {
                    xhr.abort();
                  } catch {
                    // no-op
                  }
                  safeReject(new Error('Authentication required - please retry with fresh token'));
                  return;
                }
                
                // Update accumulated text with final message
                if (finalMessage && typeof finalMessage === 'string' && finalMessage !== accumulatedText) {
                  accumulatedText = finalMessage;
                }
                
                // Finalize the streaming message
                if (finalMessage && typeof finalMessage === 'string' && finalMessage.trim()) {
                  setChatMessages(prev => {
                    const updated = [...prev];
                    const messageIndex = updated.findIndex(msg => msg.id === messageId);
                    const baseMessage: ChatMessage = {
                      id: messageId,
                      sender: "finny" as const,
                      text: finalMessage,
                      timestamp: messageIndex >= 0 ? updated[messageIndex].timestamp : Date.now(),
                      type: (resolvedType || "text") as "text" | "action",
                      isStreaming: false,
                      ...(hasActions && { actions }),
                      ...(stockCandidate && { stockCandidate }),
                      ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
                      ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
                    };
                    
                    if (messageIndex >= 0) {
                      updated[messageIndex] = {
                        ...updated[messageIndex],
                        ...baseMessage,
                      };
                    } else {
                      updated.push(baseMessage);
                    }
                    
                    return updated;
                  });
                  
                  shouldPersistRef.current = true;
                  didAppendAny = true;
                  didAppendFinal = true;
                }
                return;
              }
              
              // Also check text chunks for "Please log in" messages
              if (data.text && typeof data.text === 'string' && 
                  (data.text.toLowerCase().includes("please log in") || 
                   data.text.toLowerCase().includes("log in"))) {
                logger.warn(`[CHAT] ⚠️ Detected "Please log in" in stream - invalidating cache`);
                invalidateTokenCache();
                // Reject the promise to trigger retry in calling code
                if (timeoutId) clearTimeout(timeoutId);
                finalizeTyping();
                try {
                  xhr.abort();
                } catch {
                  // no-op
                }
                safeReject(new Error('Authentication required - please retry with fresh token'));
                return;
              }

              if (data.status) {
                setProgressStatus(data.status);
                setIsTyping(true);
              } else if (data.text) {
                // Accumulate text chunks
                accumulatedText += data.text;
                
                // Update or create streaming message
                setChatMessages(prev => {
                  const existingIndex = prev.findIndex(msg => msg.id === messageId);
                  
                  if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = {
                      ...updated[existingIndex],
                      text: accumulatedText,
                      isStreaming: true
                    };
                    return updated;
                  } else {
                    const newMessage: ChatMessage = {
                      id: messageId,
                      sender: "finny" as const,
                      text: accumulatedText,
                      timestamp: Date.now(),
                      type: "text" as const,
                      isStreaming: true
                    };
                    return [...prev, newMessage];
                  }
                });
                didAppendAny = true;
              } else if (data.message || data?.answer?.message) {
                const answer = data?.answer || {};
                const actions = data.actions || answer.actions;
                const hasActions =
                  Array.isArray(actions) && actions.length > 0;
                // Final complete response - handle both text and actions
                const finalMessage = (data.message && typeof data.message === 'string')
                  ? data.message
                  : (answer.message && typeof answer.message === 'string')
                  ? answer.message
                  : (accumulatedText && typeof accumulatedText === 'string' ? accumulatedText : '');
                const stockCandidatePayload =
                  data.stock_candidate ||
                  data.stockCandidate ||
                  answer.stock_candidate ||
                  answer.stockCandidate;
                const stockCandidate =
                  stockCandidatePayload && typeof stockCandidatePayload === 'string'
                    ? { ticker: stockCandidatePayload }
                    : stockCandidatePayload;
                const resolvedType = hasActions ? "action" : (data.type || answer.type);
                const resolvedHideFeedback =
                  data.hideFeedback !== undefined ? data.hideFeedback : answer.hideFeedback;
                const resolvedHideActions =
                  data.hideActions !== undefined ? data.hideActions : answer.hideActions;
                
                // Only set if we have a valid string
                if (finalMessage && typeof finalMessage === 'string') {
                  finalResponseMessage = finalMessage;
                }
                
                // Check if API returned "Please log in" - indicates stale/invalid token
                if (finalMessage && typeof finalMessage === 'string' && 
                    (finalMessage.toLowerCase().includes("please log in") || 
                     finalMessage.toLowerCase().includes("log in"))) {
                logger.warn(`[CHAT] ⚠️ API returned "Please log in" - invalidating cache`);
                invalidateTokenCache();
                // Reject the promise to trigger retry in calling code
                if (timeoutId) clearTimeout(timeoutId);
                finalizeTyping();
                try {
                  xhr.abort();
                } catch {
                  // no-op
                }
                safeReject(new Error('Authentication required - please retry with fresh token'));
                return;
              }
                
                // Update accumulated text with final message if different
                if (finalMessage && typeof finalMessage === 'string' && finalMessage !== accumulatedText) {
                  accumulatedText = finalMessage;
                }
                
                // Finalize the streaming message
                if (finalMessage && typeof finalMessage === 'string' && finalMessage.trim()) {
                  setChatMessages(prev => {
                    const updated = [...prev];
                    const messageIndex = updated.findIndex(msg => msg.id === messageId);
                    const baseMessage: ChatMessage = {
                      id: messageId,
                      sender: "finny" as const,
                      text: finalMessage,
                      timestamp: messageIndex >= 0 ? updated[messageIndex].timestamp : Date.now(),
                      type: (resolvedType || "text") as "text" | "action",
                      isStreaming: false,
                      ...(hasActions && { actions }),
                      ...(stockCandidate && { stockCandidate }),
                      ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
                      ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
                    };
                    
                    if (messageIndex >= 0) {
                      updated[messageIndex] = {
                        ...updated[messageIndex],
                        ...baseMessage,
                      };
                    } else {
                      updated.push(baseMessage);
                    }
                    
                    // Add actions to the last message if present
                    if (hasActions && updated.length > 0) {
                      const lastMsg = updated[updated.length - 1];
                      if (lastMsg.sender === 'finny' && !lastMsg.actions) {
                        updated[updated.length - 1] = {
                          ...lastMsg,
                          actions,
                          type: "action" as const,
                          ...(stockCandidate && { stockCandidate })
                        };
                      }
                    }
                    
                    return updated;
                  });
                  
                  shouldPersistRef.current = true;
                  didAppendAny = true;
                  didAppendFinal = true;
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
        if (timeoutId) clearTimeout(timeoutId);
        if (settled) {
          // Avoid emitting extra fallback messages on error/retry paths.
          finalizeTyping();
          return;
        }
        finalizeTyping();
        
        // Ensure we always have a final response message
        // Priority: finalResponseMessage (from complete event) > accumulatedText (from text chunks)
        if (!finalResponseMessage || typeof finalResponseMessage !== 'string') {
          if (accumulatedText && typeof accumulatedText === 'string' && accumulatedText.trim()) {
            finalResponseMessage = accumulatedText;
          } else {
            if (!didAppendFinal) {
              const fallback = fallbackMessage;
              setChatMessages(prev => {
                const updated = [...prev];
                const messageIndex = updated.findIndex(msg => msg.id === messageId);
                const baseMessage: ChatMessage = {
                  id: messageId,
                  sender: "finny" as const,
                  text: fallback,
                  timestamp: messageIndex >= 0 ? updated[messageIndex].timestamp : Date.now(),
                  type: "text" as const,
                  isStreaming: false,
                };
                if (messageIndex >= 0) {
                  updated[messageIndex] = { ...updated[messageIndex], ...baseMessage };
                } else {
                  updated.push(baseMessage);
                }
                return updated;
              });
              shouldPersistRef.current = true;
              didAppendAny = true;
              didAppendFinal = true;
              finalResponseMessage = fallback;
            } else {
              // If we still don't have a message, try to get it from the chat state
              // This is a fallback in case the message was set but not captured
              finalResponseMessage = null; // Will be handled by caller
            }
          }
        }
        
        // Always resolve with a string or null (never undefined)
        safeResolve(finalResponseMessage || null);
      };

      xhr.onerror = () => {
        console.error("❌ [STREAMING] XHR error");
        if (timeoutId) clearTimeout(timeoutId);
        finalizeTyping();
        safeReject(new Error('Streaming request failed'));
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

  // Handle split messages for non-streaming responses (backward compatibility)
  // NOTE: This is only used when streaming is disabled. Currently streaming is always enabled,
  // so this function is kept for backward compatibility only.
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
  const handleActionButton = async (
    action: string,
    payload?: { ticker?: string }
  ) => {
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

      const goalActions = new Set([
        "confirm",
        "confirm_create_goal",
        "start_over_goal",
        "skip_category",
        "cancel_goal",
        "edit_goal",
        "create_anyway",
        "modify",
      ]);
      const stockActions = new Set(["confirm_stock", "update_stock_ticker"]);
      const isGoalAction = goalActions.has(action);
      const isStockAction = stockActions.has(action);
      const apiAction = isStockAction ? "stock_conversation" : "goal_conversation";

      const requestBody: any = {
        action: apiAction,
        message: action,
        chat_id: chatId,
        context: isGoalAction && goalFlow ? { goal_flow: goalFlow } : {},
        stream: false,
      };

      if (isStockAction && payload?.ticker) {
        requestBody.ticker = payload.ticker;
      }

      // Send action to backend in existing conversation context
      const res = await authenticatedFetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();
      logger.info("🎯 [ACTION] API Response:", data);

      const stockCandidatePayload = data.stock_candidate || data.stockCandidate;
      const stockCandidate =
        stockCandidatePayload && typeof stockCandidatePayload === "string"
          ? { ticker: stockCandidatePayload }
          : stockCandidatePayload;

      // For stock actions, hide buttons on the confirmation message
      if (isStockAction) {
        setChatMessages(prev => {
          const updated = [...prev];
          // Find the last finny message with action buttons (the confirmation message)
          for (let i = updated.length - 1; i >= 0; i--) {
            const msg = updated[i];
            if (
              msg.sender === "finny" &&
              msg.actions &&
              msg.actions.length > 0 &&
              (msg.actions.some((a: any) => a.action === "confirm_stock") ||
               msg.actions.some((a: any) => a.action === "change_stock"))
            ) {
              // Hide buttons on this confirmation message
              updated[i] = {
                ...updated[i],
                hideActions: true,
                actions: [], // Clear actions
              };
              logger.info(`🎯 [ACTION] Hid buttons on confirmation message: ${msg.id}`);
              break;
            }
          }
          return updated;
        });
      }

      // Create a new message with the response (don't update existing message)
      if (data.message) {
        const newMessage = {
          id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sender: "finny" as const,
          text: data.message,
          timestamp: Date.now(),
          type: data.actions && data.actions.length > 0 ? "action" as const : "text" as const,
          ...(data.actions && { actions: data.actions }),
          ...(stockCandidate && { stockCandidate }),
          ...(data.hideActions !== undefined && { hideActions: data.hideActions }),
          ...(data.hideFeedback !== undefined && { hideFeedback: data.hideFeedback }),
        };
        
        setChatMessages(prev => [...prev, newMessage]);
        // Persist after non-streaming action responses
        shouldPersistRef.current = true;
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
    
    const BASE_URL = process.env.EXPO_PUBLIC_APP_BASE_URL || "https://financify-rose.vercel.app";
    try {
      // Get fresh access token
      const accessToken = await getFreshAccessToken();
      
      if (!accessToken) {
        logger.warn(`[CHAT] ⚠️ No access token`);
        pushChat("finny", "Please log in to get personalized financial advice.");
        return;
      }
      
      // Get user ID - try getSession() first, fallback to token decode if it times out
      // Note: userId is only needed for "clear cache" - API derives it from token for main flow
      const GET_SESSION_TIMEOUT_MS = 2000;
      let userId: string | null = null;
      
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
        
        if (session?.user?.id && !sessionError) {
          userId = session.user.id;
        }
      } catch (timeoutError: any) {
        // getSession() timeout - will use token decode fallback if needed
      }
      
      // If we don't have userId yet and we need it, try extracting from token
      // This is only needed for "clear cache" functionality
      if (!userId && accessToken) {
        userId = extractUserIdFromToken(accessToken);
      }

      const useStreaming = true;
      if (messageText.toLowerCase().includes("clear cache") || 
          messageText.toLowerCase().includes("refresh data")) {
        setProgressStatus("Clearing cache and refreshing data...");
        
        // For clear cache, we need userId - try to get it if we don't have it
        if (!userId && accessToken) {
          userId = extractUserIdFromToken(accessToken);
        }
        
        if (!userId) {
          logger.error(`[CHAT] ❌ Cannot clear cache - no userId available`);
          pushChat("finny", "⚠️ Could not verify your identity. Please try again.");
          return;
        }
        
        try {
          // Get fresh access token
          const freshToken = await getFreshAccessToken();
          if (!freshToken) {
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
      const classifyRes = goalFlow?.active ? null : await authenticatedFetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        body: JSON.stringify({
          action: "classify",
          message: messageText,
          chat_id: chatId,
          context: {}
        }),
      });

      let classifyData = classifyRes ? await classifyRes.json() : { intent: "ask_personalized" };

      if (!classifyData || typeof classifyData.intent !== 'string') {
        classifyData = {
          intent: "ask_personalized",
          needs_web: false,
          needs_user_data: true,
        } as any;
      }
      
      // Check if API returned "Please log in" - indicates stale/invalid token
      if (classifyRes && classifyData.message && 
          (classifyData.message.toLowerCase().includes("please log in") || 
           classifyData.message.toLowerCase().includes("log in"))) {
        logger.warn(`[CHAT] ⚠️ API returned "Please log in" - retrying with fresh token...`);
        invalidateTokenCache();
        
        // Retry classification once with fresh token
        try {
          const retryToken = await getFreshAccessToken();
          if (retryToken) {
            const retryRes = await authenticatedFetch(`${BASE_URL}/api/finny`, {
              method: "POST",
              body: JSON.stringify({
                action: "classify",
                message: messageText,
                chat_id: chatId,
                context: {}
              }),
            });
            const retryData = await retryRes.json();
            if (retryData.message && 
                (retryData.message.toLowerCase().includes("please log in") || 
                 retryData.message.toLowerCase().includes("log in"))) {
              logger.error(`[CHAT] ❌ Retry still returned "Please log in"`);
              pushChat("finny", "Please log in to get personalized financial advice.");
              return;
            }
            classifyData = retryData;
          } else {
            logger.error(`[CHAT] ❌ Could not get fresh token for retry`);
            pushChat("finny", "Please log in to get personalized financial advice.");
            return;
          }
        } catch (retryError) {
          logger.error(`[CHAT] ❌ Retry failed:`, retryError);
          pushChat("finny", "Please log in to get personalized financial advice.");
          return;
        }
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
      } else if (classifyData.intent === "stock_query") {
        setProgressStatus("Checking that ticker...");
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
      if (useStreaming) {
        const isAskIntent =
          !goalFlow?.active &&
          (classifyData.intent === "ask_personalized" ||
            classifyData.intent === "stock_query");
        const requestBody = isAskIntent
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
        let finalResponse: string | null = null;
        
        try {
          // Track final response for logging
          finalResponse = await handleStreamingResponseXHR(`${BASE_URL}/api/finny`, requestBody, "");
          const streamDuration = Date.now() - streamStartTime;
          const totalDuration = Date.now() - funcStartTime;
          
          // Log Finny's response - ensure it's a string before calling substring
          if (finalResponse && typeof finalResponse === 'string' && finalResponse.trim()) {
            const preview = finalResponse.length > 200 ? finalResponse.substring(0, 200) + '...' : finalResponse;
            logger.info(`Finny: ${preview}`);
          }
          logger.info(`[CHAT] ✅ Completed in ${totalDuration}ms`);
          return; // Done with streaming, exit early
        } catch (streamError: any) {
          const totalDuration = Date.now() - funcStartTime;
          
          // Check if error is due to authentication (stale token)
          if (streamError?.message?.includes('Authentication required') || 
              streamError?.message?.includes('fresh token')) {
            logger.warn(`[CHAT] ⚠️ Auth error - retrying...`);
            invalidateTokenCache();
            
            // Retry once with fresh token
            try {
              const retryToken = await getFreshAccessToken();
              if (retryToken) {
                finalResponse = await handleStreamingResponseXHR(`${BASE_URL}/api/finny`, requestBody, "");
                if (finalResponse && typeof finalResponse === 'string' && finalResponse.trim()) {
                  const preview = finalResponse.length > 200 ? finalResponse.substring(0, 200) + '...' : finalResponse;
                  logger.info(`Finny: ${preview}`);
                }
                logger.info(`[CHAT] ✅ Retry successful in ${Date.now() - streamStartTime}ms`);
                return;
              } else {
                logger.error(`[CHAT] ❌ Could not get fresh token for retry`);
                pushChat("finny", "Please log in to get personalized financial advice.");
                setProgressStatus("");
                setIsTyping(false);
                return;
              }
            } catch (retryError) {
              logger.error(`[CHAT] ❌ Retry failed:`, retryError);
              pushChat("finny", "Please log in to get personalized financial advice.");
              setProgressStatus("");
              setIsTyping(false);
              return;
            }
          }
          
          logger.error(`[CHAT] ❌ Streaming failed after ${totalDuration}ms:`, streamError);
          pushChat("finny", "Something went wrong. Try again later.");
          setProgressStatus("");
          setIsTyping(false);
          return;
        }
      }

      // Regular fetch for non-streaming requests
      let res;
      const isAskIntent =
        !goalFlow?.active &&
        (classifyData.intent === "ask_personalized" ||
          classifyData.intent === "stock_query");
      if (isAskIntent) {
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
      }

      const answerPayload = data?.answer || {};
      const resolvedMessage =
        data.message ?? answerPayload.message ?? data.text ?? answerPayload.text;
      const resolvedType = data.type || answerPayload.type;
      const resolvedActions = data.actions || answerPayload.actions;
      const hasActions =
        Array.isArray(resolvedActions) && resolvedActions.length > 0;
      const stockCandidatePayload =
        data.stock_candidate ||
        data.stockCandidate ||
        answerPayload.stock_candidate ||
        answerPayload.stockCandidate;
      const stockCandidate =
        stockCandidatePayload && typeof stockCandidatePayload === "string"
          ? { ticker: stockCandidatePayload }
          : stockCandidatePayload;
      const resolvedHideFeedback =
        data.hideFeedback !== undefined
          ? data.hideFeedback
          : answerPayload.hideFeedback;
      const resolvedHideActions =
        data.hideActions !== undefined
          ? data.hideActions
          : answerPayload.hideActions;
      const resolvedIsSplit =
        data.isSplit !== undefined ? data.isSplit : answerPayload.isSplit;
      const resolvedMessagePayload = data.message ?? answerPayload.message;

      if (hasActions) {
        const actionMessage: ChatMessage = {
          id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sender: "finny",
          text:
            (typeof resolvedMessage === "string" && resolvedMessage) ||
            "Here are the next steps.",
          timestamp: Date.now(),
          type: "action",
          actions: resolvedActions,
          ...(stockCandidate && { stockCandidate }),
          ...(resolvedHideFeedback !== undefined && {
            hideFeedback: resolvedHideFeedback,
          }),
          ...(resolvedHideActions !== undefined && {
            hideActions: resolvedHideActions,
          }),
        };

        // Add typing delay for action messages
        setIsTyping(true);
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
        pushChat(actionMessage);
        setIsTyping(false);

        return; // Don't process as regular message
      }

      if (data.intent === "goal_conversation") {
        message = resolvedMessage || "Let's set a goal.";
      } else if (
        (data.intent === "ask_personalized" ||
          data.intent === "stock_query" ||
          resolvedType === "assistant") &&
        resolvedMessage
      ) {
        // Generic assistant/ask responses (must come AFTER goal_conversation check)
        message = resolvedMessage;
      } else if (data.intent === "off_topic" && data.text) {
        // Handle off-topic queries with redirection
        message = data.text;
      } else {
        // Default message handling
        message =
          resolvedMessage ||
          data.text ||
          "Sorry, I wasn't able to generate advice just now.";
      }
      
      // logger.info("messages", message);
      setProgressStatus(""); // Clear progress status
      
      // Log total response time
      if (startTime) {
        const totalResponseDuration = Date.now() - startTime;
        const ptTime = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
        console.log(`📥 Total response time: ${totalResponseDuration}ms (${(totalResponseDuration / 1000).toFixed(2)}s) at ${ptTime} PT`);
      }
      
      // Note: Finny's response will be logged in pushChat() when it's added to chat
      // Handle split messages for better UX
      if (resolvedIsSplit && Array.isArray(resolvedMessagePayload)) {
        await handleSplitMessages(resolvedMessagePayload);
      } else {
        // Create message object with UI flags from backend
        // Ensure message is always a string
        const messageText = typeof message === "string" ? message : String(message || "");
        const finnyMessage: ChatMessage = {
          id: `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sender: "finny",
          text: messageText,
          timestamp: Date.now(),
          type: "text",
          ...(stockCandidate && { stockCandidate }),
          ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
          ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
        };
        
        // Add typing delay for finny messages
        setIsTyping(true);
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
        pushChat(finnyMessage);
        setIsTyping(false);
      }
    } catch (error) {
      const totalDuration = Date.now() - funcStartTime;
      logger.error(`[CHAT] ❌ Error after ${totalDuration}ms:`, error);
      setProgressStatus(""); // Clear progress status
      pushChat("finny", "Something went wrong. Try again later.");
    } finally {
      // Always clear UI state even if we returned early or crashed.
      setProgressStatus("");
      setIsTyping(false);
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
