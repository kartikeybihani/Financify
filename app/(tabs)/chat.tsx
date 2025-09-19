import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  LayoutAnimation,
  Animated,
  ActivityIndicator,
  Platform,
  DeviceEventEmitter,
  Image,
  Easing,
  KeyboardAvoidingView,
  Keyboard,
  ListRenderItem,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ChatMessageComponent } from "../_components/chat/ChatMessage";
import { ChatMessage } from "../_types/finny";
import { NudgeGrid } from "../_components/chat/NudgeGrid";
import { useChat } from "../_hooks/useChat";
import { useGoals } from "../_hooks/useGoals";
import styles from "../_styles/chatStyles";
import logger from "../_utils/logger";
import TypingIndicator from "../_components/chat/TypingIndicator";
import ConversationStartersModal from "../_components/chat/ConversationStartersModal";

interface Suggestion {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showStartersModal, setShowStartersModal] = useState(false);
  const [pendingGoalMessage, setPendingGoalMessage] = useState("");
  const [suggestions] = useState<Suggestion[]>([
    {
      text: "Set a savings goal",
      icon: "flag",
    },
    {
      text: "Give me a spending tip",
      icon: "bulb",
    },
    {
      text: "What's my net worth?",
      icon: "wallet",
    },
    {
      text: "Track my expenses",
      icon: "stats-chart",
    },
    {
      text: "Investment advice",
      icon: "trending-up",
    },
  ]);
  const scrollButtonAnimation = useRef(new Animated.Value(0)).current;

  const flatListRef = useRef<FlatList>(null);
  const lastContentOffset = useRef({ y: 0 }).current;
  const isScrolling = useRef(false);
  const shouldScrollToBottom = useRef(true);
  const dotAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const { chatMessages, showNudges, clearChat, pushChat, handleUserMessage } =
    useChat();

  const [goalMode, setGoalMode] = useState({
    active: false,
    label: null,
    target: null,
    timeline: null as { month: string; year: string } | null,
  });

  const { saveGoal, deleteGoal, refreshGoals } = useGoals(pushChat);

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

    // Add typing indicator if needed
    if (isTyping) {
      data.push({ type: "typing", id: "typing" });
    }

    return data;
  }, [chatMessages, showNudges, isTyping]);

  // FlatList key extractor
  const keyExtractor = useCallback((item: any) => item.id, []);

  // Estimated item size for better performance
  const getItemLayout = useCallback((data: any, index: number) => {
    const item = data?.[index];
    let estimatedHeight = 60; // Default message height

    if (item?.type === "nudges") {
      estimatedHeight = 120; // Nudge grid height
    } else if (item?.type === "typing") {
      estimatedHeight = 40; // Typing indicator height
    } else if (item?.type === "message") {
      // Estimate based on message text length
      const textLength = item.message?.text?.length || 0;
      estimatedHeight = Math.max(60, Math.min(200, textLength * 0.5 + 60));
    }

    return {
      length: estimatedHeight,
      offset: estimatedHeight * index,
      index,
    };
  }, []);

  // Goal confirmation handlers
  const handleGoalConfirm = async () => {
    logger.info("✅ [CHAT] User clicked 'Yes' on goal confirmation");
    logger.info("📝 [CHAT] Pending goal message:", pendingGoalMessage);
    setIsTyping(true);
    logger.info("⏳ [CHAT] Set typing indicator to true");

    try {
      const goalRes = await fetch(
        "https://financify-rose.vercel.app/api/finny",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "goal",
            message: pendingGoalMessage,
          }),
        }
      );

      const goalData = await goalRes.json();
      setGoalMode({
        active: true,
        label: goalData.label,
        target: goalData.target,
        timeline: goalData.timeline,
      });

      if (!goalData.label) {
        await pushChat("finny", "What would you like to call this goal?");
        return;
      }
      if (!goalData.target) {
        await pushChat(
          "finny",
          `And how much do you want to save for ${goalData.label}?`
        );
        return;
      }
      if (!goalData.timeline) {
        await pushChat(
          "finny",
          `And by when would you like to reach your $${goalData.target} goal?`
        );
        return;
      }

      const goalInput = {
        label: goalData.label,
        target_amount: parseFloat(goalData.target),
        target_date: `${goalData.timeline.year}-${String(
          new Date(`${goalData.timeline.month} 1, 2024`).getMonth() + 1
        ).padStart(2, "0")}-01`,
        category: "savings" as any, // Default category
        current_amount: 0,
      };
      await saveGoal(goalInput);
      await pushChat(
        "finny",
        `Got it. You're saving $${goalData.target} for "${goalData.label}" by ${goalData.timeline.month} ${goalData.timeline.year}. I've saved it! 🎯`
      );
      DeviceEventEmitter.emit("goalsUpdated");
      setGoalMode({
        active: false,
        label: null,
        target: null,
        timeline: null,
      });
    } catch (error) {
      logger.error("❌ Goal confirmation error:", error);
      pushChat(
        "finny",
        "Hmm, something went wrong with setting up your goal. Try again?"
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleGoalDecline = async () => {
    logger.info("❌ [CHAT] User clicked 'Not Yet' on goal confirmation");
    logger.info("📝 [CHAT] Pending goal message:", pendingGoalMessage);
    setIsTyping(true);
    logger.info("⏳ [CHAT] Set typing indicator to true");

    try {
      // Treat as a regular question
      await handleUserMessage(pendingGoalMessage);
    } catch (error) {
      logger.error("❌ Goal decline error:", error);
      pushChat("finny", "No worries! Let me know if you need anything else.");
    } finally {
      setIsTyping(false);
    }
  };

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

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "goalsUpdated",
      refreshGoals
    );
    return () => subscription.remove();
  }, []);

  // Log modal state changes
  useEffect(() => {
    logger.info(
      "🔘 [CHAT] GoalConfirmationModal state changed:"
      // showInlineGoalConfirm // This state is removed
    );
  }, []); // Removed showInlineGoalConfirm from dependency array

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;

    if (!messageText.trim()) {
      logger.info("❌ [CHAT] Empty message, returning");
      return;
    }

    logger.info("🚀 [CHAT] handleSend called with message:", messageText);
    logger.info("📝 [CHAT] Pushing user message to chat");

    pushChat("user", messageText);
    Keyboard.dismiss();
    setUserInput("");
    setIsTyping(true);
    logger.info("⏳ [CHAT] Set typing indicator to true");

    try {
      logger.info("🔍 [CHAT] Checking if goalMode is active:", goalMode.active);

      if (goalMode.active) {
        logger.info("🎯 [CHAT] Goal mode is active, calling goal API");
        const goalRes = await fetch(
          "https://financify-rose.vercel.app/api/finny",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "goal",
              message: messageText,
            }),
          }
        );

        logger.info("📡 [CHAT] Goal API response status:", goalRes.status);
        const updated = await goalRes.json();
        logger.info("✅ [CHAT] Goal API response:", updated);
        const updatedGoalData = {
          label: updated.label || goalMode.label,
          target: updated.target || goalMode.target,
          timeline: updated.timeline || goalMode.timeline,
        };

        setGoalMode({
          active: true,
          ...updatedGoalData,
          timeline: updatedGoalData.timeline,
        });
        if (!updatedGoalData.label) {
          await pushChat("finny", "What would you like to call this goal?");
          return;
        }
        if (!updatedGoalData.target) {
          await pushChat(
            "finny",
            `And how much do you want to save for ${updatedGoalData.label}?`
          );
          return;
        }
        if (!updatedGoalData.timeline) {
          await pushChat(
            "finny",
            `And by when would you like to reach your $${updatedGoalData.target} goal?`
          );
          return;
        }

        const goalInput = {
          label: updatedGoalData.label,
          target_amount: parseFloat(updatedGoalData.target),
          target_date: `${updatedGoalData.timeline.year}-${String(
            new Date(`${updatedGoalData.timeline.month} 1, 2024`).getMonth() + 1
          ).padStart(2, "0")}-01`,
          category: "savings" as any, // Default category
          current_amount: 0,
        };
        await saveGoal(goalInput);
        await pushChat(
          "finny",
          `Awesome! I've added your goal to save $${updatedGoalData.target} for "${updatedGoalData.label}" by ${updatedGoalData.timeline.month} ${updatedGoalData.timeline.year}. 🎯`
        );
        DeviceEventEmitter.emit("goalsUpdated");
        setGoalMode({
          active: false,
          label: null,
          target: null,
          timeline: null,
        });
        return;
      }

      logger.info("🔍 [CHAT] Goal mode not active, calling classify API");
      const classifyRes = await fetch(
        "https://financify-rose.vercel.app/api/finny",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "classify",
            message: messageText,
          }),
        }
      );

      logger.info(
        "📡 [CHAT] Classify API response status:",
        classifyRes.status
      );
      const { intent, confidence } = await classifyRes.json();
      logger.info(
        "🎯 [CHAT] Classification result - Intent:",
        intent,
        "Confidence:",
        confidence
      );

      if (intent === "goal" && confidence >= 0.7) {
        logger.info("🎉 [CHAT] GOAL CONFIRMATION TRIGGERED!");
        logger.info("📝 [CHAT] Setting pending goal message:", messageText);
        setPendingGoalMessage(messageText);
        const actionMsg: ChatMessage = {
          id: Date.now().toString(),
          sender: "finny",
          text: "Sounds like you're trying to set a goal! Do you want me to continue?",
          type: "action",
          actions: [
            { label: "Yes", action: "goal_confirm", style: "primary" },
            { label: "Not Yet", action: "goal_decline", style: "secondary" },
          ],
        };
        await pushChat(actionMsg.sender, actionMsg.text, actionMsg);
        return;
      } else {
        logger.info(
          "❌ [CHAT] No goal confirmation - Intent:",
          intent,
          "Confidence:",
          confidence
        );
      }

      logger.info("💬 [CHAT] Calling handleUserMessage for regular advice");
      await handleUserMessage(messageText);
    } catch (error) {
      logger.error("💥 [CHAT] handleSend error:", error);
      pushChat("finny", "Hmm, something went wrong. Try again?");
    } finally {
      logger.info("⏹️ [CHAT] Setting typing indicator to false");
      setIsTyping(false);
    }
  };

  const handleScroll = useCallback(
    (event: any) => {
      const currentOffset = event.nativeEvent.contentOffset.y;
      const contentHeight = event.nativeEvent.contentSize.height;
      const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

      const shouldShow =
        currentOffset < contentHeight - scrollViewHeight - 100 &&
        contentHeight > scrollViewHeight;

      if (shouldShow !== showScrollButton) {
        setShowScrollButton(shouldShow);
        Animated.spring(scrollButtonAnimation, {
          toValue: shouldShow ? 1 : 0,
          useNativeDriver: true,
          tension: 80,
          friction: 9,
        }).start();
      }

      lastContentOffset.y = currentOffset;

      if (currentOffset < lastContentOffset.y) {
        shouldScrollToBottom.current = false;
      }

      if (currentOffset >= contentHeight - scrollViewHeight - 10) {
        shouldScrollToBottom.current = true;
      }
    },
    [showScrollButton, scrollButtonAnimation]
  );

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && flatListData.length > 0) {
      // Force scroll to the absolute bottom by using a large offset
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({
          animated: true,
        });
        // Additional scroll to ensure we're at the very bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({
            animated: false,
          });
        }, 300);
      }, 50);
    }
  }, [flatListData.length]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldScrollToBottom.current && flatListData.length > 0) {
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({
            animated: true,
          });
        }
      }, 100);
    }
  }, [flatListData.length]);

  // FlatList render item function
  const renderItem: ListRenderItem<any> = useCallback(
    ({ item }) => {
      if (item.type === "nudges") {
        return <NudgeGrid onNudgePress={handleSend} />;
      }

      if (item.type === "typing") {
        return <TypingIndicator />;
      }

      if (item.type === "message") {
        const { message, index } = item;
        return (
          <ChatMessageComponent
            message={message}
            showSender={
              message.sender === "finny" &&
              (index === 0 || chatMessages[index - 1].sender !== "finny")
            }
            onAction={async (action) => {
              if (action === "goal_confirm") await handleGoalConfirm();
              if (action === "goal_decline") await handleGoalDecline();
            }}
          />
        );
      }

      return null;
    },
    [handleSend, handleGoalConfirm, handleGoalDecline, chatMessages]
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={[
          "rgba(26, 61, 102, 0.95)",
          "rgba(26, 61, 102, 0.3)",
          "transparent",
        ]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.headerContainer}>
          <View style={styles.titleContainer}>
            <View style={styles.mascotContainer}>
              <Animated.Image
                source={require("../assets/mascot1.jpg")}
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
                Your AI Financial Assistant
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearChat}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color="#FF3B30" />
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
                getItemLayout={getItemLayout}
                style={styles.chatScroll}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => (isScrolling.current = true)}
                onScrollEndDrag={() => (isScrolling.current = false)}
                contentContainerStyle={{
                  paddingBottom: Math.max(insets.bottom, 16) + 100,
                }}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={10}
                initialNumToRender={20}
                updateCellsBatchingPeriod={50}
                maintainVisibleContentPosition={{
                  minIndexForVisible: 0,
                  autoscrollToTopThreshold: 10,
                }}
                // Additional performance optimizations
                legacyImplementation={false}
                disableVirtualization={false}
                disableIntervalMomentum={true}
                decelerationRate="fast"
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
              />

              {/* Inline Goal Confirmation Buttons */}
              {/* This block is removed as per the edit hint */}

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
                    onPress={() => {
                      shouldScrollToBottom.current = true;
                      scrollToBottom();
                    }}
                    style={styles.scrollButtonTouchable}
                    activeOpacity={0.8}
                  >
                    <View style={styles.scrollButtonGradient}>
                      <AntDesign name="arrowdown" size={20} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>

            <View
              style={[
                styles.inputBarContainer,
                { paddingBottom: Math.max(insets.bottom, 16) + 16 },
              ]}
            >
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestionsContainer}
                data={suggestions}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleSend(item.text)}
                    style={styles.suggestionChip}
                  >
                    <Ionicons
                      name={item.icon}
                      size={14}
                      color="#FFFFFF"
                      style={styles.suggestionIcon}
                    />
                    <Text style={styles.suggestionText}>{item.text}</Text>
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
                    // Auto-scroll to bottom when input is focused
                    setTimeout(() => {
                      shouldScrollToBottom.current = true;
                      if (flatListRef.current && flatListData.length > 0) {
                        flatListRef.current.scrollToEnd({
                          animated: true,
                        });
                      }
                    }, 300);
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
