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
  ListRenderItem,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { FontAwesome6 } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
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
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  const router = useRouter();
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showStartersModal, setShowStartersModal] = useState(false);
  const [showStockTickerModal, setShowStockTickerModal] = useState(false);
  const [stockTickerDraft, setStockTickerDraft] = useState("");
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportedMessageId, setReportedMessageId] = useState<string | null>(
    null
  );
  const [showFeedbackNotification, setShowFeedbackNotification] =
    useState(false);
  const atBottomRef = useRef(true);
  const contentHeights = useRef({ content: 0, view: 0 });

  // Handle orientation changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  // Handle keyboard state changes
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      () => {
        setIsKeyboardOpen(true);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        setIsKeyboardOpen(false);
      }
    );

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, []);

  const {
    chatMessages,
    showNudges,
    progressStatus,
    pushChat,
    handleUserMessage,
    handleFinnyResponse,
    handleActionButton,
    currentSessionId,
  } = useChatContext();

  // Auto-scroll to bottom when user comes to this screen (every time)
  useFocusEffect(
    useCallback(() => {
      // Scroll to bottom whenever the user focuses on this screen
      const timer = setTimeout(() => {
        scrollToAbsoluteBottom();
      }, 150);

      // Trigger context pre-building when user enters chat tab
      triggerContextPrebuild();

      // Check for initial message from other screens (e.g., Goals)
      // Pre-fill the input box instead of auto-sending
      (async () => {
        try {
          const initialMessage = await AsyncStorage.getItem("initialChatMessage");
          if (initialMessage !== null) {
            // Clear the stored message
            await AsyncStorage.removeItem("initialChatMessage");
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
          console.log("Could not check for initial chat message:", error);
        }
      })();

      return () => clearTimeout(timer);
    }, [handleUserMessage])
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
      console.log(
        `🚀 [CONTEXT_PREBUILD] [${callId}] Starting context pre-building...`
      );

      console.log(
        `🚀 [CONTEXT_PREBUILD] [${callId}] Getting fresh access token (skipping getUser() to avoid hangs)...`
      );
      const tokenStartTime = Date.now();
      const accessToken = await getFreshAccessToken();
      const tokenDuration = Date.now() - tokenStartTime;
      console.log(
        `🚀 [CONTEXT_PREBUILD] [${callId}] getFreshAccessToken() completed in ${tokenDuration}ms - hasToken: ${!!accessToken}`
      );

      if (!accessToken) {
        console.log(
          `⚠️ [CONTEXT_PREBUILD] [${callId}] No access token, skipping pre-build`
        );
        return;
      }

      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      console.log(
        `🚀 [CONTEXT_PREBUILD] [${callId}] Making API call to ${BASE_URL}/api/finny...`
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
            console.log(
              `✅ [CONTEXT_PREBUILD] [${callId}] Context pre-built successfully in ${apiDuration}ms (total: ${totalDuration}ms):`,
              result
            );
          } else {
            console.log(
              `⚠️ [CONTEXT_PREBUILD] [${callId}] Pre-build failed in ${apiDuration}ms (total: ${totalDuration}ms), status: ${response.status}, will fallback to on-demand`
            );
          }
        })
        .catch((error) => {
          const apiDuration = Date.now() - apiStartTime;
          const totalDuration = Date.now() - startTime;
          console.log(
            `⚠️ [CONTEXT_PREBUILD] [${callId}] Pre-build error after ${apiDuration}ms (total: ${totalDuration}ms):`,
            error
          );
        });
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.log(
        `⚠️ [CONTEXT_PREBUILD] [${callId}] Pre-build setup error after ${totalDuration}ms:`,
        error
      );
    }
  };

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;

    if (!messageText.trim()) {
      return;
    }

    // Start timing for response time tracking
    const messageStartTime = Date.now();
    const mstTime = new Date(messageStartTime).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });
    console.log(`📤 Message sent at: ${mstTime} MST`);

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
    [showScrollButton, scrollButtonAnimation]
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
        .filter((m) => m.sender === "finny" && normalizeFinnyFeedbackId(m.id) === baseId)
        .map((m) => m.text)
        .filter((t) => typeof t === "string" && t.trim().length > 0);
      return parts.join("\n\n");
    },
    [chatMessages, normalizeFinnyFeedbackId]
  );

  // Handle thumb up
  const handleThumbUp = useCallback(
    async (messageId: string) => {
      console.log("👍 Thumb up for message:", messageId);

      const feedbackId = normalizeFinnyFeedbackId(messageId);

      // Find the message to get its content and sender
      const message = chatMessages.find((msg) => msg.id === messageId);
      if (!message) {
        console.warn("Message not found for thumbs up:", messageId);
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
          console.error("Failed to submit thumbs up:", result.error);
        }
      } catch (error) {
        console.error("Error submitting thumbs up:", error);
      }
    },
    [chatMessages, currentSessionId, normalizeFinnyFeedbackId, getGroupedFinnyContent]
  );

  // Handle thumb down
  const handleThumbDown = useCallback((messageId: string) => {
    console.log("👎 Thumb down for message:", messageId);
    setReportedMessageId(messageId);
    setShowReportModal(true);
  }, []);

  // Get reported message data
  const reportedMessage = React.useMemo(() => {
    if (!reportedMessageId) return null;
    return chatMessages.find((msg) => msg.id === reportedMessageId) || null;
  }, [reportedMessageId, chatMessages]);

  const reportedMessageFeedbackId = React.useMemo(() => {
    return reportedMessageId ? normalizeFinnyFeedbackId(reportedMessageId) : undefined;
  }, [reportedMessageId, normalizeFinnyFeedbackId]);

  const reportedMessageGroupedContent = React.useMemo(() => {
    return reportedMessageId ? getGroupedFinnyContent(reportedMessageId) : undefined;
  }, [reportedMessageId, getGroupedFinnyContent]);

  // Memoized action handler to prevent recreation
  const handleMessageAction = useCallback(
    async (action: string, message?: any) => {
      console.log("🎯 [ACTION] Button clicked:", action);

      // Handle cancel actions immediately without API calls
      if (action === "cancel" || action === "cancel_goal") {
        pushChat(
          "finny",
          "No worries! Let me know if you have any other questions. 😊"
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
          console.error("❌ [ACTION] Error confirming stock:", error);
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
    ]
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
    ]
  );

  return (
    <View style={styles.safeArea}>
      <SafeAreaView
        style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <View style={styles.headerContainer}>
          <View style={styles.titleContainer}>
            <View style={styles.mascotContainer}>
              <Animated.Image
                source={require("../../../assets/images/mascot1.jpg")}
                style={[
                  styles.mascotImage,
                  {
                    transform: [
                      { rotate },
                      { scale: bounce },
                      { scaleX: -1 },
                      { rotateY: rotate },
                    ],
                  },
                ]}
              />
            </View>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>Finny</Text>
              <Text style={styles.headerSubtitle}>Your AI Money Coach</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => router.push("/(tabs)/chat/finny-settings")}
            activeOpacity={0.7}
          >
            <FontAwesome6 name="sliders" size={19} color="#4A90E2" />
          </TouchableOpacity>
        </View>
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
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionsContainer}
                data={suggestions}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => !isTyping && handleSend(item.text)}
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
              <View style={styles.inputBar}>
                <TouchableOpacity
                  style={styles.plusButton}
                  onPress={() => setShowStartersModal(true)}
                >
                  <Ionicons name="add" size={24} color="#4A90E2" />
                </TouchableOpacity>
                <TextInput
                  placeholder="Ask Finny anything about money..."
                  placeholderTextColor="#888"
                  style={styles.input}
                  value={userInput}
                  onChangeText={setUserInput}
                  onSubmitEditing={() => handleSend()}
                  onFocus={() => {
                    // Scroll to bottom only if user isn't already at the bottom
                    if (!atBottomRef.current) {
                      setTimeout(() => {
                        scrollToAbsoluteBottom();
                      }, 150);
                    }
                  }}
                />
                <TouchableOpacity
                  style={[styles.sendButton, isTyping && { opacity: 0.5 }]}
                  onPress={() => {
                    if (!isTyping) handleSend();
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
              </View>
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
          messageContent={reportedMessageGroupedContent || reportedMessage?.text}
          messageSender={reportedMessage?.sender}
          chatSessionId={currentSessionId}
          messageMetadata={
            reportedMessage
              ? {
                  messageType: reportedMessage.type,
                  hasActions: !!reportedMessage.actions,
                  hasGoalOffer: !!reportedMessage.goalOffer,
                  isGrouped: !!reportedMessageId &&
                    normalizeFinnyFeedbackId(reportedMessageId) !== reportedMessageId,
                }
              : undefined
          }
          userMessage={
            reportedMessageId
              ? (() => {
                  // Find the user's message that prompted this Finny response
                  const messageIndex = chatMessages.findIndex(
                    (msg) => msg.id === reportedMessageId
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
      </SafeAreaView>
    </View>
  );
}

export default function ChatScreen() {
  return <ChatScreenContent />;
}
