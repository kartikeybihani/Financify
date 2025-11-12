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
import styles from "@/src/styles/chatStyles";
import TypingIndicator from "@/src/components/chat/TypingIndicator";
import ConversationStartersModal from "@/src/components/chat/ConversationStartersModal";

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

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showStartersModal, setShowStartersModal] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
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

  // Auto-scroll to bottom when user comes to this screen (every time)
  useFocusEffect(
    useCallback(() => {
      // Scroll to bottom whenever the user focuses on this screen
      const timer = setTimeout(() => {
        scrollToAbsoluteBottom();
      }, 150);

      // Trigger context pre-building when user enters chat tab
      triggerContextPrebuild();

      return () => clearTimeout(timer);
    }, [])
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

  const {
    chatMessages,
    showNudges,
    goalFlow,
    progressStatus,
    clearChat,
    pushChat,
    handleUserMessage,
    handleFinnyResponse,
    handleActionButton,
  } = useChatContext();

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

  // Trigger context pre-building when user enters chat tab
  const triggerContextPrebuild = async () => {
    try {
      console.log("🚀 [CONTEXT_PREBUILD] Starting context pre-building...");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        console.log("⚠️ [CONTEXT_PREBUILD] No user ID, skipping pre-build");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || "";

      if (!accessToken) {
        console.log(
          "⚠️ [CONTEXT_PREBUILD] No access token, skipping pre-build"
        );
        return;
      }

      const BASE_URL =
        process.env.EXPO_PUBLIC_APP_BASE_URL ||
        "https://financify-rose.vercel.app";

      // Call the pre-build API in the background (don't await)
      fetch(`${BASE_URL}/api/finny`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "prebuild_context",
        }),
      })
        .then(async (response) => {
          if (response.ok) {
            const result = await response.json();
            console.log(
              "✅ [CONTEXT_PREBUILD] Context pre-built successfully:",
              result
            );
          } else {
            console.log(
              "⚠️ [CONTEXT_PREBUILD] Pre-build failed, will fallback to on-demand"
            );
          }
        })
        .catch((error) => {
          console.log("⚠️ [CONTEXT_PREBUILD] Pre-build error:", error);
        });
    } catch (error) {
      console.log("⚠️ [CONTEXT_PREBUILD] Pre-build setup error:", error);
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

  // Memoized action handler to prevent recreation
  const handleMessageAction = useCallback(
    async (action: string) => {
      console.log("🎯 [ACTION] Button clicked:", action);

      // Handle cancel actions immediately without API calls
      if (action === "cancel" || action === "cancel_goal") {
        pushChat(
          "finny",
          "No worries! Let me know if you have any other questions. 😊"
        );
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
      }
    },
    [
      pushChat,
      handleUserMessage,
      handleFinnyResponse,
      handleActionButton,
      setIsTyping,
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
          />
        );
      }

      return null;
    },
    [handleSend, progressStatus, flatListData, handleMessageAction]
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
              <Text style={styles.headerSubtitle}>
                Your AI Financial Advisor
              </Text>
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
      </SafeAreaView>
    </View>
  );
}
