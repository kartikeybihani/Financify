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
   * 
   * CRITICAL: All split message parts must be added synchronously in the same
   * state update. Never use setTimeout or async delays when adding split parts,
   * as this creates a race condition where persistence happens before all parts
   * are added, causing split messages to be lost on app restart.
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

      // Validate message integrity: check for orphaned split messages
      // Split messages have IDs like "messageId::2", "messageId::3", etc.
      // They should always have a corresponding base message with ID "messageId"
      const messageIds = new Set(chatMessages.map(m => m.id));
      const orphanedSplits: string[] = [];
      for (const msg of chatMessages) {
        if (msg.id.includes('::')) {
          const baseId = msg.id.split('::')[0];
          if (!messageIds.has(baseId)) {
            orphanedSplits.push(msg.id);
          }
        }
      }
      if (orphanedSplits.length > 0) {
        logger.warn(`[PERSISTENCE] ⚠️ Detected ${orphanedSplits.length} orphaned split messages:`, orphanedSplits);
        // Still save, but log the issue for debugging
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

  type FinnySplitCandidate = {
    index: number;
    length: number;
    kind: "strong" | "weak";
  };

  const MIN_SPLIT_PART_CHARS = 80;
  const LONG_MESSAGE_THRESHOLD_CHARS = 500;
  const TARGET_PART_CHARS = 400;

  const previewWords = (text: string, maxWords: number = 8) => {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    const words = normalized.split(" ").slice(0, maxWords).join(" ");
    return words;
  };

  const isLikelySentenceBoundary = (left: string) => {
    const trimmed = left.trimEnd();
    if (!trimmed) return false;
    return /[.!?:\)\]\"”']$/.test(trimmed);
  };

  const isInsideFencedCodeBlock = (text: string, breakpointIndex: number) => {
    const before = text.slice(0, Math.max(0, breakpointIndex));
    const fences = before.match(/```/g);
    const count = fences ? fences.length : 0;
    return count % 2 === 1;
  };

  const isListLine = (line: string) => {
    const t = line.trimStart();
    return /^(-\s+|\*\s+|•\s+|\d+\.\s+)/.test(t);
  };

  const isBreakpointInListContext = (text: string, breakpointIndex: number) => {
    const start = Math.max(0, breakpointIndex - 200);
    const end = Math.min(text.length, breakpointIndex + 200);
    const windowText = text.slice(start, end);
    const lines = windowText.split("\n");

    // Find the line that contains the breakpoint within the window.
    const beforeInWindow = text.slice(start, breakpointIndex);
    const lineIndex = beforeInWindow.split("\n").length - 1;

    const prevLine = lines[Math.max(0, lineIndex - 1)] || "";
    const currLine = lines[Math.max(0, lineIndex)] || "";
    const nextLine = lines[Math.min(lines.length - 1, lineIndex + 1)] || "";

    // If we're near list lines, assume it's a list block and avoid splitting.
    return isListLine(prevLine) || isListLine(currLine) || isListLine(nextLine);
  };

  const findSplitCandidates = (text: string, allowWeak: boolean): FinnySplitCandidate[] => {
    const candidates: FinnySplitCandidate[] = [];

    // Strong breaks: 2+ blank lines
    for (const match of text.matchAll(/(\n\s*\n){2,}/g)) {
      if (match.index == null) continue;
      candidates.push({
        index: match.index,
        length: match[0].length,
        kind: "strong",
      });
    }

    if (!allowWeak) return candidates;

    // Weak breaks: single blank line. Avoid double-counting strong breaks.
    for (const match of text.matchAll(/\n\s*\n/g)) {
      if (match.index == null) continue;
      const overlappingStrong = candidates.some(
        (c) => match.index! >= c.index && match.index! < c.index + c.length
      );
      if (!overlappingStrong) {
        candidates.push({
          index: match.index,
          length: match[0].length,
          kind: "weak",
        });
      }
    }

    candidates.sort((a, b) => a.index - b.index);
    return candidates;
  };

  const splitAtCandidate = (text: string, c: FinnySplitCandidate) => {
    const left = text.slice(0, c.index).trim();
    const right = text.slice(c.index + c.length).trim();
    return { left, right };
  };

  const isSafeSplit = (text: string, c: FinnySplitCandidate): { ok: boolean; reason?: string } => {
    if (isInsideFencedCodeBlock(text, c.index)) return { ok: false, reason: "code-block" };
    if (isBreakpointInListContext(text, c.index)) return { ok: false, reason: "list-context" };

    const { left, right } = splitAtCandidate(text, c);
    if (left.length < MIN_SPLIT_PART_CHARS || right.length < MIN_SPLIT_PART_CHARS) {
      return { ok: false, reason: "too-short" };
    }
    if (!isLikelySentenceBoundary(left)) return { ok: false, reason: "mid-sentence" };
    return { ok: true };
  };

  /**
   * Split a single Finny response into up to 4 bubbles.
   *
   * - Always allow strong breaks (2+ blank lines).
   * - Allow weak breaks (single blank line) only for long messages.
   * - Never split in list/code contexts, never mid-sentence, never short halves.
   */
  const splitFinnyMessage = (text: string): string[] => {
    if (typeof text !== "string") return [String(text || "")];
    const normalized = text.replace(/\r\n/g, "\n");
    const allowWeak = normalized.length > LONG_MESSAGE_THRESHOLD_CHARS;
    const candidates = findSplitCandidates(normalized, allowWeak);
    const safeCandidates = candidates.filter((c) => isSafeSplit(normalized, c).ok);
    if (safeCandidates.length === 0) {
      if (candidates.length > 0 && allowWeak) {
        const firstCandidate = candidates[0];
        const verdict = isSafeSplit(normalized, firstCandidate);
        logger.info(
          `[CHAT] split:reject reason=${verdict.reason || "unknown"} kind=${firstCandidate.kind} len=${normalized.length} preview="${previewWords(normalized)}"`
        );
      }
      return [normalized.trim()];
    }

    const pickBest = (
      startIndex: number,
      endIndex: number,
      targetLen: number
    ): FinnySplitCandidate | null => {
      let best: FinnySplitCandidate | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const c of safeCandidates) {
        if (c.index <= startIndex) continue;
        if (c.index >= endIndex) continue;
        const len = c.index - startIndex;
        const score = Math.abs(len - targetLen);
        // Prefer earlier splits only when scores are equal.
        if (score < bestScore || (score === bestScore && best && c.index < best.index)) {
          best = c;
          bestScore = score;
        }
      }
      return best;
    };

    // First split: aim for ~TARGET_PART_CHARS.
    const first = pickBest(0, normalized.length, TARGET_PART_CHARS);
    if (!first) return [normalized.trim()];
    const { left: p1, right: rest1 } = splitAtCandidate(normalized, first);
    if (!p1 || !rest1) return [normalized.trim()];

    // Second split (optional): only if the remaining part is still long.
    const parts: string[] = [p1];
    if (rest1.length <= LONG_MESSAGE_THRESHOLD_CHARS) {
      parts.push(rest1);
      logger.info(
        `[CHAT] split:ok parts=2 kind=${first.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(rest1)}"`
      );
      return parts;
    }

    // Recompute candidates on the remaining text for correctness.
    const restCandidates = findSplitCandidates(rest1, rest1.length > LONG_MESSAGE_THRESHOLD_CHARS);
    const safeRestCandidates = restCandidates.filter((c) => isSafeSplit(rest1, c));
    if (safeRestCandidates.length === 0) {
      parts.push(rest1);
      logger.info(
        `[CHAT] split:ok parts=2 kind=${first.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(rest1)}"`
      );
      return parts;
    }

    // Pick split within rest aiming for ~TARGET_PART_CHARS.
    let best2: FinnySplitCandidate | null = null;
    let bestScore2 = Number.POSITIVE_INFINITY;
    for (const c of safeRestCandidates) {
      const len = c.index;
      const score = Math.abs(len - TARGET_PART_CHARS);
      if (score < bestScore2) {
        best2 = c;
        bestScore2 = score;
      }
    }
    if (!best2) {
      parts.push(rest1);
      logger.info(
        `[CHAT] split:ok parts=2 kind=${first.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(rest1)}"`
      );
      return parts;
    }

    const { left: p2, right: p3 } = splitAtCandidate(rest1, best2);
    if (
      !p2 ||
      !p3 ||
      p2.length < MIN_SPLIT_PART_CHARS ||
      p3.length < MIN_SPLIT_PART_CHARS
    ) {
      parts.push(rest1);
      logger.info(
        `[CHAT] split:ok parts=2 kind=${first.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(rest1)}"`
      );
      return parts;
    }

    // Third split (optional): only if p3 is still long.
    parts.push(p2);
    if (p3.length <= LONG_MESSAGE_THRESHOLD_CHARS) {
      parts.push(p3);
      logger.info(
        `[CHAT] split:ok parts=3 kind=${first.kind}+${best2.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(p2)}" p3="${previewWords(p3)}"`
      );
      return parts;
    }

    // Recompute candidates on p3 for correctness.
    const p3Candidates = findSplitCandidates(p3, p3.length > LONG_MESSAGE_THRESHOLD_CHARS);
    const safeP3Candidates = p3Candidates.filter((c) => isSafeSplit(p3, c));
    if (safeP3Candidates.length === 0) {
      parts.push(p3);
      logger.info(
        `[CHAT] split:ok parts=3 kind=${first.kind}+${best2.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(p2)}" p3="${previewWords(p3)}"`
      );
      return parts;
    }

    // Pick split within p3 aiming for ~TARGET_PART_CHARS.
    let best3: FinnySplitCandidate | null = null;
    let bestScore3 = Number.POSITIVE_INFINITY;
    for (const c of safeP3Candidates) {
      const len = c.index;
      const score = Math.abs(len - TARGET_PART_CHARS);
      if (score < bestScore3) {
        best3 = c;
        bestScore3 = score;
      }
    }
    if (!best3) {
      parts.push(p3);
      logger.info(
        `[CHAT] split:ok parts=3 kind=${first.kind}+${best2.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(p2)}" p3="${previewWords(p3)}"`
      );
      return parts;
    }

    const { left: p3a, right: p4 } = splitAtCandidate(p3, best3);
    if (
      !p3a ||
      !p4 ||
      p3a.length < MIN_SPLIT_PART_CHARS ||
      p4.length < MIN_SPLIT_PART_CHARS
    ) {
      parts.push(p3);
      logger.info(
        `[CHAT] split:ok parts=3 kind=${first.kind}+${best2.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(p2)}" p3="${previewWords(p3)}"`
      );
      return parts;
    }

    parts.push(p3a, p4);
    logger.info(
      `[CHAT] split:ok parts=4 kind=${first.kind}+${best2.kind}+${best3.kind} len=${normalized.length} p1="${previewWords(p1)}" p2="${previewWords(p2)}" p3="${previewWords(p3a)}" p4="${previewWords(p4)}"`
    );
    return parts;
  };

  const insertAfterIndex = <T,>(arr: T[], index: number, items: T[]): T[] => {
    if (items.length === 0) return arr;
    if (index < 0 || index >= arr.length) return [...arr, ...items];
    return [...arr.slice(0, index + 1), ...items, ...arr.slice(index + 1)];
  };

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
                  safeReject(new Error('Authentication required - please retry with fresh token'));
                  try {
                    xhr.abort();
                  } catch {
                    // no-op
                  }
                  return;
                }
                
                // Update accumulated text with final message
                if (finalMessage && typeof finalMessage === 'string' && finalMessage !== accumulatedText) {
                  accumulatedText = finalMessage;
                }
                
                // Finalize the streaming message
                if (finalMessage && typeof finalMessage === 'string' && finalMessage.trim()) {
                  const splitParts = !hasActions ? splitFinnyMessage(finalMessage) : [finalMessage];
                  setChatMessages(prev => {
                    const updated = [...prev];
                    const messageIndex = updated.findIndex(msg => msg.id === messageId);
                    const timestamp = messageIndex >= 0 ? (updated[messageIndex].timestamp || Date.now()) : Date.now();
                    const baseMessage: ChatMessage = {
                      id: messageId,
                      sender: "finny" as const,
                      text: (splitParts[0] || finalMessage).trim(),
                      timestamp,
                      type: (resolvedType || "text") as "text" | "action",
                      isStreaming: false,
                      ...(hasActions && { actions }),
                      ...(stockCandidate && { stockCandidate }),
                      ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
                      ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
                    };

                    if (messageIndex >= 0) {
                      updated[messageIndex] = { ...updated[messageIndex], ...baseMessage };
                    } else {
                      updated.push(baseMessage);
                    }

                    if (splitParts.length > 1) {
                      const extra: ChatMessage[] = [];
                      for (let i = 1; i < Math.min(splitParts.length, 4); i++) {
                        const partText = (splitParts[i] || "").trim();
                        if (!partText) continue;
                        extra.push({
                          id: `${messageId}::${i + 1}`,
                          sender: "finny" as const,
                          text: partText,
                          timestamp: timestamp + i,
                          type: (resolvedType || "text") as "text" | "action",
                          isStreaming: false,
                          ...(stockCandidate && { stockCandidate }),
                          ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
                          ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
                        });
                      }

                      if (extra.length > 0) {
                        // CRITICAL: Add all split parts immediately in the same state update.
                        // Never use setTimeout or async delays here, as this creates a race condition
                        // where persistence happens before all parts are added, causing split messages
                        // to be lost on app restart. All parts must be in state before shouldPersistRef triggers.
                        const messageIndexInUpdated = updated.findIndex((m) => m.id === messageId);
                        const at = messageIndexInUpdated >= 0 ? messageIndexInUpdated : updated.length - 1;
                        return insertAfterIndex(updated, at, extra);
                      }
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
                safeReject(new Error('Authentication required - please retry with fresh token'));
                try {
                  xhr.abort();
                } catch {
                  // no-op
                }
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
                safeReject(new Error('Authentication required - please retry with fresh token'));
                try {
                  xhr.abort();
                } catch {
                  // no-op
                }
                return;
              }
                
                // Update accumulated text with final message if different
                if (finalMessage && typeof finalMessage === 'string' && finalMessage !== accumulatedText) {
                  accumulatedText = finalMessage;
                }
                
                // Finalize the streaming message
                if (finalMessage && typeof finalMessage === 'string' && finalMessage.trim()) {
                  const splitParts = !hasActions ? splitFinnyMessage(finalMessage) : [finalMessage];
                  setChatMessages(prev => {
                    const updated = [...prev];
                    const messageIndex = updated.findIndex(msg => msg.id === messageId);
                    const timestamp = messageIndex >= 0 ? (updated[messageIndex].timestamp || Date.now()) : Date.now();

                    const baseMessage: ChatMessage = {
                      id: messageId,
                      sender: "finny" as const,
                      text: (splitParts[0] || finalMessage).trim(),
                      timestamp,
                      type: (resolvedType || "text") as "text" | "action",
                      isStreaming: false,
                      ...(hasActions && { actions }),
                      ...(stockCandidate && { stockCandidate }),
                      ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
                      ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
                    };

                    if (messageIndex >= 0) {
                      updated[messageIndex] = { ...updated[messageIndex], ...baseMessage };
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
                          ...(stockCandidate && { stockCandidate }),
                        };
                      }
                    }

                    if (splitParts.length > 1) {
                      const extra: ChatMessage[] = [];
                      for (let i = 1; i < Math.min(splitParts.length, 4); i++) {
                        const partText = (splitParts[i] || "").trim();
                        if (!partText) continue;
                        extra.push({
                          id: `${messageId}::${i + 1}`,
                          sender: "finny" as const,
                          text: partText,
                          timestamp: timestamp + i,
                          type: (resolvedType || "text") as "text" | "action",
                          isStreaming: false,
                          ...(stockCandidate && { stockCandidate }),
                          ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
                          ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
                        });
                      }
                      if (extra.length > 0) {
                        // CRITICAL: Add all split parts immediately in the same state update.
                        // Never use setTimeout or async delays here, as this creates a race condition
                        // where persistence happens before all parts are added, causing split messages
                        // to be lost on app restart. All parts must be in state before shouldPersistRef triggers.
                        const messageIndexInUpdated = updated.findIndex((m) => m.id === messageId);
                        const at = messageIndexInUpdated >= 0 ? messageIndexInUpdated : updated.length - 1;
                        return insertAfterIndex(updated, at, extra);
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

  // handleSplitMessages removed - frontend now handles all splitting with splitFinnyMessage()
  // Backend always sends full message strings, frontend splits intelligently for consistent behavior

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

      const warmMessages = [
        "Brewing finance wisdom... ☕",
        "Getting your story... 📖",
        "Working my magic... 🪄",
        "Crafting... 🎨",
        "Whipping finance ... 👨‍🍳",
        "Polishing financial gems...",
      ];
      const randomWarmMessage = warmMessages[Math.floor(Math.random() * warmMessages.length)];
      // Show initial progress
      setProgressStatus(randomWarmMessage);

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
          "Brewing finance wisdom... ☕",
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
      // isSplit flag removed - frontend handles all splitting with splitFinnyMessage()
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
      // Frontend handles all message splitting with splitFinnyMessage() for consistent behavior
      // Backend always sends full message string - frontend splits intelligently
      const finalMessageText = typeof message === "string" ? message : String(message || "");
      
      // Split message using sophisticated frontend algorithm (respects code blocks, lists, etc.)
      const splitParts = splitFinnyMessage(finalMessageText);
      
      // Create and add all message parts
      for (let i = 0; i < splitParts.length; i++) {
        const partText = splitParts[i].trim();
        if (!partText) continue;
        
        const finnyMessage: ChatMessage = {
          id: i === 0 
            ? `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            : `finny-${Date.now()}-${Math.random().toString(36).substr(2, 9)}::${i + 1}`,
          sender: "finny",
          text: partText,
          timestamp: Date.now() + i,
          type: "text",
          ...(stockCandidate && { stockCandidate }),
          ...(resolvedHideFeedback !== undefined && { hideFeedback: resolvedHideFeedback }),
          ...(resolvedHideActions !== undefined && { hideActions: resolvedHideActions }),
        };
        
        // Add typing delay only for first message
        if (i === 0) {
          setIsTyping(true);
          await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
        }
        
        pushChat(finnyMessage);
        
        // Small delay between split parts for smooth UX
        if (i < splitParts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      
      setIsTyping(false);
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
