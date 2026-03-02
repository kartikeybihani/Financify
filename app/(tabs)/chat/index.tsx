import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Animated,
  Platform,
  Easing,
  KeyboardAvoidingView,
  Keyboard,
  LayoutAnimation,
  UIManager,
  ListRenderItem,
  Dimensions,
  ActivityIndicator,
  Modal,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { FontAwesome6 } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { ChatMessageComponent } from "@/src/components/chat/ChatMessage";
import { NudgeGrid } from "@/src/components/chat/NudgeGrid";
import { useChatContext } from "@/src/contexts/ChatContext";
import { supabase } from "@/src/lib/supabase/supabase";
import {
  getFreshAccessToken,
  authenticatedFetch,
} from "@/src/utils/auth/authToken";
import styles from "@/src/styles/chatStyles";
import TypingIndicator from "@/src/components/chat/TypingIndicator";
import ConversationStartersModal from "@/src/components/chat/ConversationStartersModal";
import ReportModal from "@/src/components/modals/ReportModal";
import StockTickerEditModal from "@/src/components/modals/StockTickerEditModal";
import FeedbackNotification from "@/src/components/chat/FeedbackNotification";
import { submitLoveIt } from "@/src/utils/analytics/reports";
import AppStorage from "@/src/utils/storage/storage";
import CleanChatHeader from "@/src/components/chat/CleanChatHeader";
import DemoBanner from "@/src/components/demo/DemoBanner";
import { useDemoMode } from "@/src/contexts/DemoContext";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { useFreeMessageLimit } from "@/src/hooks/useFreeMessageLimit";
import logger from "@/src/utils/core/logger";
import { persistChatAiConsent } from "@/src/utils/chat/chatConsent";
import * as WebBrowser from "expo-web-browser";

const CHAT_MEMORY_CONSENT_KEY = "chat_memory_consent_v2";

interface Suggestion {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Responsive calculations
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

// Responsive utility functions
const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.8;
  if (isLargeScreen) return basePadding * 1.2;
  return basePadding;
};

const responsiveHeight = (percentage: number) =>
  screenHeight * (percentage / 100);

function ChatScreenContent() {
  const insets = useSafeAreaInsets();
  const { isDemoMode } = useDemoMode();
  const { isPremium, showPaywall } = useSubscription();
  const [userId, setUserId] = useState<string | null>(null);
  const { limitReached, incrementCount } = useFreeMessageLimit(userId);
  const router = useRouter();
  // Safely get PostHog instance - won't crash if PostHog is unavailable
  let posthog;
  try {
    posthog = usePostHog();
  } catch (error) {
    // PostHog not available, continue without analytics
    posthog = null;
  }
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showStartersModal, setShowStartersModal] = useState(false);
  const [showStockTickerModal, setShowStockTickerModal] = useState(false);
  const [stockTickerDraft, setStockTickerDraft] = useState("");
  const inputLineHeight = Math.round(isSmallScreen ? 13 : 18);
  const inputVerticalPadding =
    Platform.OS === "ios" ? responsivePadding(1) : 0;
  const minInputHeight = Math.round(inputLineHeight + inputVerticalPadding * 2);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportedMessageId, setReportedMessageId] = useState<string | null>(
    null,
  );
  const [showFeedbackNotification, setShowFeedbackNotification] =
    useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [hasAcceptedMemoryConsent, setHasAcceptedMemoryConsent] =
    useState(false);
  const [showMemoryConsentModal, setShowMemoryConsentModal] = useState(false);
  const [hasCheckedMemoryConsent, setHasCheckedMemoryConsent] = useState(false);
  const [isMemoryDisclosureOpen, setIsMemoryDisclosureOpen] = useState(false);
  const memoryDisclosureAnimation = useRef(new Animated.Value(0)).current;
  const [memoryDisclosureContentHeight, setMemoryDisclosureContentHeight] =
    useState(0);
  const memoryConsentDismissedAtRef = useRef(0);
  const atBottomRef = useRef(true);
  const contentHeights = useRef({ content: 0, view: 0 });
  const inputFocusAnimation = useRef(new Animated.Value(0)).current;

  const getMemoryConsentKey = useCallback(
    (id: string) => `${CHAT_MEMORY_CONSENT_KEY}:${id}`,
    [],
  );

  const handlePrivacyPolicy = useCallback(async () => {
    try {
      await WebBrowser.openBrowserAsync("https://www.usefinny.com/privacy", {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
      });
    } catch (error) {
      logger.error("Failed to open privacy policy:", error);
    }
  }, []);

  const openMemoryConsentModal = useCallback(() => {
    Keyboard.dismiss();
    setHasCheckedMemoryConsent(false);
    setIsMemoryDisclosureOpen(false);
    memoryDisclosureAnimation.setValue(0);
    setShowMemoryConsentModal(true);
  }, [memoryDisclosureAnimation]);

  const closeMemoryConsentModal = useCallback(() => {
    memoryConsentDismissedAtRef.current = Date.now();
    setHasCheckedMemoryConsent(false);
    setIsMemoryDisclosureOpen(false);
    memoryDisclosureAnimation.setValue(0);
    setShowMemoryConsentModal(false);
  }, [memoryDisclosureAnimation]);

  const openMemorySettings = useCallback(() => {
    setShowMemoryConsentModal(false);
    router.push({
      pathname: "/(tabs)/chat/finny-settings",
      params: { open: "memories" },
    });
  }, [router]);

  const acceptMemoryConsent = useCallback(async () => {
    if (!hasCheckedMemoryConsent) {
      return;
    }

    if (userId) {
      AppStorage.setItemSync(getMemoryConsentKey(userId), "accepted");
      try {
        await persistChatAiConsent(userId, CHAT_MEMORY_CONSENT_KEY);
      } catch (error) {
        logger.warn("Failed to persist chat AI consent to Supabase:", error);
      }
    }
    setHasAcceptedMemoryConsent(true);
    setShowMemoryConsentModal(false);
    setHasCheckedMemoryConsent(false);
  }, [getMemoryConsentKey, hasCheckedMemoryConsent, userId]);

  const toggleMemoryDisclosure = useCallback(() => {
    const nextValue = !isMemoryDisclosureOpen;
    setIsMemoryDisclosureOpen(nextValue);
    Animated.timing(memoryDisclosureAnimation, {
      toValue: nextValue ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isMemoryDisclosureOpen, memoryDisclosureAnimation]);

  // Handle orientation changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  // Handle keyboard state - use keyboardWill* on iOS so layout animates in sync with keyboard
  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const handleShow = (e: any) => {
      if (Platform.OS === "ios") {
        Keyboard.scheduleLayoutAnimation(e);
      } else {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setIsKeyboardOpen(true);
    };

    const handleHide = (e: any) => {
      if (Platform.OS === "ios") {
        Keyboard.scheduleLayoutAnimation(e);
      } else {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setIsKeyboardOpen(false);
    };

    const showListener = Keyboard.addListener(showEvent, handleShow);
    const hideListener = Keyboard.addListener(hideEvent, handleHide);

    return () => {
      showListener?.remove();
      hideListener?.remove();
    };
  }, []);

  useEffect(() => {
    Animated.timing(inputFocusAnimation, {
      toValue: isInputFocused ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isInputFocused, inputFocusAnimation]);

  const {
    chatMessages,
    showNudges,
    progressStatus,
    pushChat,
    handleUserMessage,
    handleFinnyResponse,
    handleActionButton,
    currentSessionId,
    updateUserName,
  } = useChatContext();

  const hasUserMessage = React.useMemo(
    () => chatMessages.some((msg) => msg.sender === "user"),
    [chatMessages],
  );

  // Fetch user's first name and update welcome message; keep userId for free message limit
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
          const consentState = AppStorage.getItemSync(
            getMemoryConsentKey(user.id),
          );
          setHasAcceptedMemoryConsent(consentState === "accepted");
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name")
            .eq("id", user.id)
            .maybeSingle();

          if (profile?.first_name) {
            updateUserName(profile.first_name);
          }
        } else {
          setUserId(null);
          setHasAcceptedMemoryConsent(false);
        }
      } catch (error) {
        logger.debug("Could not fetch user first name:", error);
      }
    };
    fetchUserName();
  }, [getMemoryConsentKey, updateUserName]);

  // Auto-scroll to bottom when user comes to this screen (every time)
  useFocusEffect(
    useCallback(() => {
      // Scroll to bottom whenever the user focuses on this screen
      const timer = setTimeout(() => {
        scrollToAbsoluteBottom();
      }, 150);

      // Trigger context pre-building when user enters chat tab (skip in demo mode)
      if (!isDemoMode) {
        triggerContextPrebuild();
      }

      // Check for initial message from other screens (e.g., Goals)
      // Pre-fill the input box instead of auto-sending
      (async () => {
        try {
          const initialMessage = AppStorage.getItemSync("initialChatMessage");
          if (initialMessage !== null) {
            // Clear the stored message
            AppStorage.removeItemSync("initialChatMessage");
            // Small delay to ensure screen is fully loaded
            setTimeout(() => {
              if (initialMessage) {
                // Pre-fill the input box instead of auto-sending
                setUserInput(initialMessage);
              }
              // Empty string means just navigate, no pre-filled message
            }, 300);
          }
        } catch (error) {
          // Silently fail if AsyncStorage isn't available or message check fails
          logger.debug("Could not check for initial chat message:", error);
        }
      })();

      return () => clearTimeout(timer);
    }, [handleUserMessage, isDemoMode]),
  );

  const [suggestions] = useState<Suggestion[]>(() => {
    const baseSuggestions = [
      {
        text: "Give me a spending tip",
        icon: "bulb" as keyof typeof Ionicons.glyphMap,
      },
      {
        text: "What's my net worth?",
        icon: "wallet" as keyof typeof Ionicons.glyphMap,
      },
      {
        text: "Track my expenses",
        icon: "stats-chart" as keyof typeof Ionicons.glyphMap,
      },
      {
        text: "Investment advice",
        icon: "trending-up" as keyof typeof Ionicons.glyphMap,
      },
      {
        text: "Budget help",
        icon: "calculator" as keyof typeof Ionicons.glyphMap,
      },
    ];

    // Show fewer suggestions on smaller screens
    return isSmallScreen ? baseSuggestions.slice(0, 3) : baseSuggestions;
  });
  const scrollButtonAnimation = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);
  const dotAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // Prepare FlatList data with nudges and messages
  const flatListData = React.useMemo(() => {
    const data = [];

    // Add nudges if they should be shown
    if (showNudges) {
      data.push({ type: "nudges", id: "nudges" });
    }

    // Add chat messages
    chatMessages.forEach((msg, index) => {
      data.push({
        type: "message",
        id: msg.id,
        message: msg,
        index,
      });
    });

    // Add typing indicator if needed (now includes progress status)
    if (isTyping) {
      data.push({ type: "typing", id: "typing" });
    }

    return data;
  }, [chatMessages, showNudges, isTyping, progressStatus]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (flatListData.length > 0) {
      const timer = setTimeout(() => {
        scrollToAbsoluteBottom();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [flatListData.length]);

  // FlatList key extractor
  const keyExtractor = useCallback((item: any) => item.id, []);

  // Remove getItemLayout to prevent layout calculation issues
  // Let FlatList handle dynamic sizing naturally

  // Remove tagline-related code
  const mascotFlip = useRef(new Animated.Value(0)).current;
  const mascotBounce = useRef(new Animated.Value(0)).current;
  const mascotRotate = useRef(new Animated.Value(0)).current;

  // Setup mascot animations
  useEffect(() => {
    const startMascotAnimation = () => {
      Animated.parallel([
        // Smooth rotation
        Animated.sequence([
          Animated.timing(mascotRotate, {
            toValue: 1,
            duration: 1200,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
          Animated.timing(mascotRotate, {
            toValue: 0,
            duration: 1200,
            easing: Easing.bezier(0.4, 0, 0.2, 1),
            useNativeDriver: true,
          }),
        ]),
        // Subtle bounce
        Animated.sequence([
          Animated.timing(mascotBounce, {
            toValue: 1,
            duration: 600,
            easing: Easing.elastic(1),
            useNativeDriver: true,
          }),
          Animated.timing(mascotBounce, {
            toValue: 0,
            duration: 600,
            easing: Easing.elastic(1),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setTimeout(startMascotAnimation, 4000);
      });
    };

    startMascotAnimation();
  }, []);

  const rotate = mascotRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const bounce = mascotBounce.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1],
  });

  /**
   * Triggers context pre-building when the user enters the chat tab.
   *
   * This function pre-fetches user context data in the background to improve
   * response times for the first message. It:
   * - Uses getFreshAccessToken() instead of getUser() to avoid hangs
   * - Makes an API call to prebuild context (non-blocking)
   * - Handles errors gracefully without affecting the UI
   *
   * The pre-build happens in the background and doesn't block the chat interface.
   * If it fails, the app falls back to on-demand context building when needed.
   */
  const triggerContextPrebuild = async () => {
    const callId = Math.random().toString(36).substring(2, 8);
    const startTime = Date.now();
    try {
      logger.debug(
        `🚀 [CONTEXT_PREBUILD] [${callId}] Starting context pre-building...`,
      );

      logger.debug(
        `🚀 [CONTEXT_PREBUILD] [${callId}] Getting fresh access token (skipping getUser() to avoid hangs)...`,
      );
      const tokenStartTime = Date.now();
      const accessToken = await getFreshAccessToken();
      const tokenDuration = Date.now() - tokenStartTime;
      logger.debug(
        `🚀 [CONTEXT_PREBUILD] [${callId}] getFreshAccessToken() completed in ${tokenDuration}ms - hasToken: ${!!accessToken}`,
      );

      if (!accessToken) {
        logger.warn(
          `⚠️ [CONTEXT_PREBUILD] [${callId}] No access token, skipping pre-build`,
        );
        return;
      }

      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      logger.debug(
        `🚀 [CONTEXT_PREBUILD] [${callId}] Making API call to ${BASE_URL}/api/finny...`,
      );
      const apiStartTime = Date.now();
      authenticatedFetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        body: JSON.stringify({
          action: "prebuild_context",
        }),
      })
        .then(async (response) => {
          const apiDuration = Date.now() - apiStartTime;
          const totalDuration = Date.now() - startTime;
          if (response.ok) {
            const result = await response.json();
            logger.debug(
              `✅ [CONTEXT_PREBUILD] [${callId}] Context pre-built successfully in ${apiDuration}ms (total: ${totalDuration}ms):`,
              result,
            );
          } else {
            logger.warn(
              `⚠️ [CONTEXT_PREBUILD] [${callId}] Pre-build failed in ${apiDuration}ms (total: ${totalDuration}ms), status: ${response.status}, will fallback to on-demand`,
            );
          }
        })
        .catch((error) => {
          const apiDuration = Date.now() - apiStartTime;
          const totalDuration = Date.now() - startTime;
          logger.warn(
            `⚠️ [CONTEXT_PREBUILD] [${callId}] Pre-build error after ${apiDuration}ms (total: ${totalDuration}ms):`,
            error,
          );
        });
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      logger.warn(
        `⚠️ [CONTEXT_PREBUILD] [${callId}] Pre-build setup error after ${totalDuration}ms:`,
        error,
      );
    }
  };

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;

    if (!messageText.trim()) {
      return;
    }

    // Demo mode: send button does nothing
    if (isDemoMode) {
      return;
    }

    // Prevent the dismiss tap from immediately re-triggering consent.
    if (Date.now() - memoryConsentDismissedAtRef.current < 350) {
      return;
    }

    if (!hasAcceptedMemoryConsent) {
      openMemoryConsentModal();
      return;
    }

    // Free tier: 5 messages per day
    if (!isPremium && limitReached()) {
      showPaywall();
      return;
    }

    posthog?.capture("finny message sent", {
      message_length: messageText.trim().length,
      via_nudge: Boolean(nudgeText),
    });

    // Start timing for response time tracking
    const messageStartTime = Date.now();
    const mstTime = new Date(messageStartTime).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });
    logger.debug(`📤 Message sent at: ${mstTime} MST`);

    if (!isPremium) {
      incrementCount();
    }

    pushChat("user", messageText);
    Keyboard.dismiss();
    setUserInput("");
    setIsTyping(true);

    try {
      const startTime = messageStartTime;
      await handleUserMessage(messageText, startTime);
    } catch (error) {
      pushChat("finny", "Hmm, something went wrong. Try again?");
    } finally {
      setIsTyping(false);
    }
  };

  const handleScroll = useCallback(
    (event: any) => {
      const currentOffset = event.nativeEvent.contentOffset.y;
      const contentHeight = event.nativeEvent.contentSize.height;
      const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

      // keep latest measurements for precise bottom scrolls
      contentHeights.current.content = contentHeight;
      contentHeights.current.view = scrollViewHeight;

      // Use a more generous threshold to prevent flickering
      const isAtBottom = currentOffset >= contentHeight - scrollViewHeight - 50;
      atBottomRef.current = isAtBottom;
      const shouldShow = !isAtBottom && contentHeight > scrollViewHeight;

      if (shouldShow !== showScrollButton) {
        setShowScrollButton(shouldShow);
        Animated.spring(scrollButtonAnimation, {
          toValue: shouldShow ? 1 : 0,
          useNativeDriver: true,
          tension: 60, // Reduced for smoother animation
          friction: 12, // Increased for more stable animation
        }).start();
      }
    },
    [showScrollButton, scrollButtonAnimation],
  );

  const onContentSizeChange = useCallback((w: number, h: number) => {
    contentHeights.current.content = h;
    if (atBottomRef.current && flatListRef.current) {
      // Only auto-scroll if user is already at bottom
      requestAnimationFrame(() => {
        (flatListRef.current as any)?.scrollToEnd({ animated: true });
      });
    }
  }, []);

  const onLayout = useCallback((e: any) => {
    const h = e.nativeEvent.layout.height;
    contentHeights.current.view = h;
  }, []);

  const scrollToAbsoluteBottom = useCallback(() => {
    const list = flatListRef.current as any;
    if (!list) return;
    const { content, view } = contentHeights.current;
    const target = Math.max(0, content - view + 1);
    requestAnimationFrame(() => {
      try {
        list.scrollToOffset({ animated: true, offset: target });
      } catch {
        try {
          list.scrollToEnd({ animated: true });
        } catch {}
      }
    });
  }, []);

  // When a single logical Finny response is rendered as multiple bubbles,
  // we suffix ids like "<baseId>::2". Feedback/reporting should use baseId.
  const normalizeFinnyFeedbackId = useCallback((messageId: string) => {
    const idx = messageId.indexOf("::");
    return idx >= 0 ? messageId.slice(0, idx) : messageId;
  }, []);

  const getGroupedFinnyContent = useCallback(
    (messageId: string) => {
      const baseId = normalizeFinnyFeedbackId(messageId);
      const parts = chatMessages
        .filter(
          (m) =>
            m.sender === "finny" && normalizeFinnyFeedbackId(m.id) === baseId,
        )
        .map((m) => m.text)
        .filter((t) => typeof t === "string" && t.trim().length > 0);
      return parts.join("\n\n");
    },
    [chatMessages, normalizeFinnyFeedbackId],
  );

  // Handle thumb up
  const handleThumbUp = useCallback(
    async (messageId: string) => {
      logger.debug("👍 Thumb up for message:", messageId);

      const feedbackId = normalizeFinnyFeedbackId(messageId);

      // Find the message to get its content and sender
      const message = chatMessages.find((msg) => msg.id === messageId);
      if (!message) {
        logger.warn("Message not found for thumbs up:", messageId);
        return;
      }

      const groupedContent = getGroupedFinnyContent(messageId) || message.text;

      // Submit love_it feedback to database only
      try {
        const result = await submitLoveIt({
          messageId: feedbackId,
          messageContent: groupedContent,
          messageSender: message.sender,
          chatSessionId: currentSessionId,
          messageMetadata: {
            messageType: message.type,
            hasActions: !!message.actions,
            hasGoalOffer: !!message.goalOffer,
            isGrouped: feedbackId !== messageId,
          },
        });

        if (result.success) {
          setShowFeedbackNotification(true);
        } else {
          logger.error("Failed to submit thumbs up:", result.error);
        }
      } catch (error) {
        logger.error("Error submitting thumbs up:", error);
      }
    },
    [
      chatMessages,
      currentSessionId,
      normalizeFinnyFeedbackId,
      getGroupedFinnyContent,
    ],
  );

  // Handle thumb down
  const handleThumbDown = useCallback((messageId: string) => {
    logger.debug("👎 Thumb down for message:", messageId);
    setReportedMessageId(messageId);
    setShowReportModal(true);
  }, []);

  // Get reported message data
  const reportedMessage = React.useMemo(() => {
    if (!reportedMessageId) return null;
    return chatMessages.find((msg) => msg.id === reportedMessageId) || null;
  }, [reportedMessageId, chatMessages]);

  const reportedMessageFeedbackId = React.useMemo(() => {
    return reportedMessageId
      ? normalizeFinnyFeedbackId(reportedMessageId)
      : undefined;
  }, [reportedMessageId, normalizeFinnyFeedbackId]);

  const reportedMessageGroupedContent = React.useMemo(() => {
    return reportedMessageId
      ? getGroupedFinnyContent(reportedMessageId)
      : undefined;
  }, [reportedMessageId, getGroupedFinnyContent]);

  // Memoized action handler to prevent recreation
  const handleMessageAction = useCallback(
    async (action: string, message?: any) => {
      logger.debug("🎯 [ACTION] Button clicked:", action);

      // Handle cancel actions immediately without API calls
      if (action === "cancel" || action === "cancel_goal") {
        pushChat(
          "finny",
          "No worries! Let me know if you have any other questions. 😊",
        );
        return;
      }

      if (action === "change_stock") {
        const candidate = message?.stockCandidate?.ticker || "";
        setStockTickerDraft(candidate);
        setShowStockTickerModal(true);
        // Note: Buttons will be hidden when update_stock_ticker is submitted via handleActionButton
        return;
      }

      // Handle other goal flow actions silently (don't show action string in chat)
      if (
        action === "confirm" ||
        action === "confirm_create_goal" ||
        action === "start_over_goal" ||
        action === "skip_category"
      ) {
        setIsTyping(true);
        // Send action directly to backend and update existing message
        await handleActionButton(action);
        setIsTyping(false);
        return;
      }

      if (action === "confirm_stock") {
        setIsTyping(true);
        try {
          await handleActionButton(action);
        } catch (error) {
          logger.error("❌ [ACTION] Error confirming stock:", error);
          pushChat("finny", "Something went wrong. Please try again.");
        } finally {
          setIsTyping(false);
        }
      }
    },
    [
      pushChat,
      handleUserMessage,
      handleFinnyResponse,
      handleActionButton,
      setIsTyping,
      setShowStockTickerModal,
      setStockTickerDraft,
    ],
  );

  // Optimized FlatList render item function
  const renderItem: ListRenderItem<any> = useCallback(
    ({ item, index }) => {
      if (item.type === "nudges") {
        return <NudgeGrid onNudgePress={handleSend} />;
      }

      if (item.type === "typing") {
        return <TypingIndicator progressStatus={progressStatus} />;
      }

      if (item.type === "message") {
        const { message } = item;
        // Memoize sender calculations to avoid repeated array access
        const prevSender =
          index > 0 && (flatListData as any)[index - 1]?.type === "message"
            ? (flatListData as any)[index - 1]?.message?.sender
            : null;
        const nextSender =
          index < flatListData.length - 1 &&
          (flatListData as any)[index + 1]?.type === "message"
            ? (flatListData as any)[index + 1]?.message?.sender
            : null;

        return (
          <ChatMessageComponent
            message={message}
            showSender={message.sender === "finny" && prevSender !== "finny"}
            prevSender={prevSender as any}
            nextSender={nextSender as any}
            onAction={handleMessageAction}
            onThumbUp={message.sender === "finny" ? handleThumbUp : undefined}
            onThumbDown={
              message.sender === "finny" ? handleThumbDown : undefined
            }
          />
        );
      }

      return null;
    },
    [
      handleSend,
      progressStatus,
      flatListData,
      handleMessageAction,
      handleThumbUp,
      handleThumbDown,
    ],
  );

  return (
    <View style={styles.safeArea}>
      <SafeAreaView
        style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 12) }}
        edges={["left", "right", "bottom"]}
      >
        {isDemoMode && (
          <View style={{ paddingTop: insets.top }}>
            <DemoBanner />
          </View>
        )}
        {/* Clean Header with Gradient */}
        <CleanChatHeader rotate={rotate} bounce={bounce} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <View style={styles.chatArea}>
            <View style={styles.chatContainer}>
              <FlatList
                ref={flatListRef}
                data={flatListData}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                style={styles.chatScroll}
                onLayout={onLayout}
                onContentSizeChange={onContentSizeChange}
                onScroll={handleScroll}
                scrollEventThrottle={32}
                onScrollToIndexFailed={(info) => {
                  // Wait for more items to render, then try again
                  setTimeout(() => {
                    try {
                      (flatListRef.current as any)?.scrollToIndex({
                        index: info.index,
                        animated: true,
                        viewPosition: 1,
                      });
                    } catch {
                      (flatListRef.current as any)?.scrollToEnd({
                        animated: true,
                      });
                    }
                  }, 100);
                }}
                contentContainerStyle={{
                  paddingTop: responsivePadding(8),
                  paddingBottom:
                    Math.max(insets.bottom, responsivePadding(8)) +
                    responsiveHeight(8),
                }}
                removeClippedSubviews={false} // Disable to prevent layout issues
                maxToRenderPerBatch={10} // Increased for smoother scrolling
                windowSize={10} // Increased window size
                initialNumToRender={15} // Increased initial render
                updateCellsBatchingPeriod={100} // Slower batching for stability
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                // Remove maintainVisibleContentPosition to prevent conflicts
              />

              {showScrollButton && (
                <Animated.View
                  style={[
                    styles.scrollToBottomButton,
                    {
                      transform: [
                        {
                          scale: scrollButtonAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.7, 1],
                          }),
                        },
                        {
                          translateY: scrollButtonAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [10, 0],
                          }),
                        },
                      ],
                      opacity: scrollButtonAnimation,
                    },
                  ]}
                >
                  <TouchableOpacity
                    onPress={scrollToAbsoluteBottom}
                    style={styles.scrollButtonTouchable}
                    activeOpacity={0.8}
                  >
                    <View style={styles.scrollButtonGradient}>
                      <AntDesign name="arrow-down" size={19} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>

            <View
              style={[
                styles.inputBarContainer,
                {
                  paddingBottom: isKeyboardOpen
                    ? responsivePadding(10)
                    : Math.max(insets.bottom, responsivePadding(10)),
                },
              ]}
            >
              {!hasUserMessage && (
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionsContainer}
                  data={suggestions}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => {
                        if (isTyping) return;
                        handleSend(item.text);
                      }}
                      style={[
                        styles.suggestionChip,
                        isTyping && styles.suggestionChipDisabled,
                      ]}
                      activeOpacity={isTyping ? 1 : 0.7}
                      disabled={isTyping}
                    >
                      <Ionicons
                        name={item.icon}
                        size={13}
                        color={isTyping ? "#666" : "#FFFFFF"}
                        style={styles.suggestionIcon}
                      />
                      <Text
                        style={[
                          styles.suggestionText,
                          isTyping && styles.suggestionTextDisabled,
                        ]}
                      >
                        {item.text}
                      </Text>
                    </TouchableOpacity>
                  )}
                  keyExtractor={(item, index) => index.toString()}
                />
              )}
              <Animated.View
                style={[
                  styles.inputBar,
                  {
                    transform: [
                      {
                        scale: inputFocusAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.01],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.plusButton}
                  onPress={() => setShowStartersModal(true)}
                >
                  <Ionicons name="add" size={24} color="#4A90E2" />
                </TouchableOpacity>
                <TextInput
                  placeholder="Ask finny anything..."
                  placeholderTextColor="#888"
                  style={[
                    styles.input,
                    {
                      height: minInputHeight,
                      lineHeight: inputLineHeight,
                      paddingTop: inputVerticalPadding,
                      paddingBottom: inputVerticalPadding,
                    },
                  ]}
                  value={userInput}
                  onChangeText={setUserInput}
                  multiline={false}
                  scrollEnabled
                  returnKeyLabel="return"
                  onSubmitEditing={() => handleSend()}
                  onFocus={() => {
                    setIsInputFocused(true);
                    // Scroll to bottom only if user isn't already at the bottom
                    if (!atBottomRef.current) {
                      setTimeout(() => {
                        scrollToAbsoluteBottom();
                      }, 150);
                    }
                  }}
                  onBlur={() => {
                    setIsInputFocused(false);
                  }}
                />
                <TouchableOpacity
                  style={[styles.sendButton, isTyping && { opacity: 0.5 }]}
                  onPress={() => {
                    if (isTyping) return;
                    handleSend();
                  }}
                  activeOpacity={isTyping ? 1 : 0.7}
                  disabled={isTyping}
                >
                  <Ionicons
                    name="arrow-up-circle-sharp"
                    size={32}
                    color={isTyping ? "#888" : "#4A90E2"}
                  />
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        </KeyboardAvoidingView>

        <ConversationStartersModal
          visible={showStartersModal}
          onClose={() => setShowStartersModal(false)}
          onSelectQuestion={(question) => {
            setUserInput(question);
            handleSend(question);
          }}
        />

        <StockTickerEditModal
          visible={showStockTickerModal}
          defaultTicker={stockTickerDraft}
          onClose={() => {
            setShowStockTickerModal(false);
            setStockTickerDraft("");
          }}
          onSubmit={async (ticker) => {
            setShowStockTickerModal(false);
            setStockTickerDraft("");
            setIsTyping(true);
            await handleActionButton("update_stock_ticker", { ticker });
            setIsTyping(false);
          }}
        />

        <ReportModal
          visible={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setReportedMessageId(null);
          }}
          messageId={reportedMessageFeedbackId}
          messageContent={
            reportedMessageGroupedContent || reportedMessage?.text
          }
          messageSender={reportedMessage?.sender}
          chatSessionId={currentSessionId}
          messageMetadata={
            reportedMessage
              ? {
                  messageType: reportedMessage.type,
                  hasActions: !!reportedMessage.actions,
                  hasGoalOffer: !!reportedMessage.goalOffer,
                  isGrouped:
                    !!reportedMessageId &&
                    normalizeFinnyFeedbackId(reportedMessageId) !==
                      reportedMessageId,
                }
              : undefined
          }
          userMessage={
            reportedMessageId
              ? (() => {
                  // Find the user's message that prompted this Finny response
                  const messageIndex = chatMessages.findIndex(
                    (msg) => msg.id === reportedMessageId,
                  );
                  if (messageIndex > 0) {
                    // Look backwards for the last user message
                    for (let i = messageIndex - 1; i >= 0; i--) {
                      if (chatMessages[i].sender === "user") {
                        return chatMessages[i].text;
                      }
                    }
                  }
                  return undefined;
                })()
              : undefined
          }
        />

        {showFeedbackNotification && (
          <FeedbackNotification
            onClose={() => setShowFeedbackNotification(false)}
          />
        )}

        {showMemoryConsentModal && (
          <Modal
            visible
            transparent
            animationType="fade"
            presentationStyle="overFullScreen"
            statusBarTranslucent
            onRequestClose={closeMemoryConsentModal}
          >
            <View style={memoryConsentStyles.overlay}>
              <TouchableOpacity
                style={memoryConsentStyles.backdrop}
                activeOpacity={1}
                onPress={closeMemoryConsentModal}
              />
              <View style={memoryConsentStyles.sheet}>
                <View style={memoryConsentStyles.handle} />
                <TouchableOpacity
                  style={memoryConsentStyles.closeButton}
                  onPress={closeMemoryConsentModal}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color="rgba(255,255,255,0.7)"
                  />
                </TouchableOpacity>
                <Text style={memoryConsentStyles.title}>Personalize Finny</Text>
                <Text style={memoryConsentStyles.body}>
                  Finny can remember helpful details from your chats to make
                  future advice more personal.
                </Text>
                <View style={memoryConsentStyles.disclosureCard}>
                  <View style={memoryConsentStyles.disclosureHeaderRow}>
                    <TouchableOpacity
                      style={memoryConsentStyles.disclosureCheckbox}
                      onPress={() =>
                        setHasCheckedMemoryConsent((current) => !current)
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={
                          hasCheckedMemoryConsent
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={22}
                        color={hasCheckedMemoryConsent ? "#7DB1FF" : "#9BB6DB"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={memoryConsentStyles.disclosureToggle}
                      onPress={toggleMemoryDisclosure}
                      activeOpacity={0.8}
                    >
                      <View style={memoryConsentStyles.disclosureTitleBlock}>
                        <Text style={memoryConsentStyles.disclosureTitle}>
                          Permission to tailor your guidance
                        </Text>
                        <Text style={memoryConsentStyles.disclosureSummary}>
                          Chat messages may be used to personalize Finny.
                        </Text>
                      </View>
                      <Animated.View
                        style={[
                          memoryConsentStyles.disclosureChevron,
                          {
                            transform: [
                              {
                                rotate: memoryDisclosureAnimation.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ["0deg", "180deg"],
                                }),
                              },
                            ],
                          },
                        ]}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color="rgba(255,255,255,0.85)"
                        />
                      </Animated.View>
                    </TouchableOpacity>
                  </View>

                  <Animated.View
                    style={[
                      memoryConsentStyles.disclosureAnimatedContainer,
                      {
                        height: memoryDisclosureAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, memoryDisclosureContentHeight || 1],
                        }),
                        opacity: memoryDisclosureAnimation,
                      },
                    ]}
                  >
                    <View
                      style={memoryConsentStyles.disclosureContent}
                      onLayout={(event) => {
                        const nextHeight = event.nativeEvent.layout.height;
                        if (
                          nextHeight > 0 &&
                          nextHeight !== memoryDisclosureContentHeight
                        ) {
                          setMemoryDisclosureContentHeight(nextHeight);
                        }
                      }}
                    >
                      <Text style={memoryConsentStyles.disclosureText}>
                        Finny may use your chat messages with the AI provider
                        to better understand your preferences and personalize
                        your experience in future chats. This is used only to
                        provide and improve your experience with Finny and is
                        never sold or used for advertising.
                      </Text>
                      <Text style={memoryConsentStyles.disclosureText}>
                        You can edit or delete memories anytime in Settings.{" "}
                        <Text
                          style={memoryConsentStyles.disclosureTextLink}
                          onPress={handlePrivacyPolicy}
                        >
                          View Privacy Policy
                        </Text>
                        {" · "}
                        <Text
                          style={memoryConsentStyles.disclosureTextLink}
                          onPress={openMemorySettings}
                        >
                          Open Settings
                        </Text>
                      </Text>
                    </View>
                  </Animated.View>
                </View>
                <TouchableOpacity
                  style={[
                    memoryConsentStyles.acceptButton,
                    !hasCheckedMemoryConsent &&
                      memoryConsentStyles.acceptButtonDisabled,
                  ]}
                  onPress={acceptMemoryConsent}
                  activeOpacity={hasCheckedMemoryConsent ? 0.85 : 1}
                  disabled={!hasCheckedMemoryConsent}
                >
                  <Text style={memoryConsentStyles.acceptButtonText}>
                    Accept
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </SafeAreaView>
    </View>
  );
}

export default function ChatScreen() {
  return <ChatScreenContent />;
}

const memoryConsentStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(3, 8, 15, 0.38)",
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderRadius: 20,
    backgroundColor: "rgba(16, 22, 34, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(93, 141, 201, 0.24)",
  },
  handle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginBottom: 12,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 6,
  },
  disclosureCard: {
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(20, 27, 39, 0.92)",
    gap: 8,
  },
  disclosureHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  disclosureCheckbox: {
    paddingTop: 2,
  },
  disclosureToggle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  disclosureTitleBlock: {
    flex: 1,
    flexShrink: 1,
    gap: 4,
  },
  disclosureTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  disclosureSummary: {
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255, 255, 255, 0.72)",
  },
  disclosureChevron: {
    width: 18,
    alignItems: "center",
    marginTop: 2,
  },
  disclosureAnimatedContainer: {
    overflow: "hidden",
  },
  disclosureContent: {
    paddingTop: 8,
    paddingLeft: 32,
    gap: 6,
  },
  disclosureText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.86)",
    lineHeight: 15,
  },
  disclosureTextLink: {
    color: "#7AB7FF",
    textDecorationLine: "underline",
  },
  acceptButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#4A90E2",
  },
  acceptButtonDisabled: {
    backgroundColor: "rgba(74, 144, 226, 0.38)",
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
