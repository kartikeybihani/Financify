import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  LayoutAnimation,
  Animated,
  ActivityIndicator,
  Platform,
  DeviceEventEmitter,
  Image,
  Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ChatMessageComponent } from "../components/ChatMessage";
import { NudgeGrid } from "../components/NudgeGrid";
import { useChat } from "../hooks/useChat";
import { useGoals } from "../hooks/useGoals";
import styles from "../styles/finnyStyles";
import TypingIndicator from "../components/TypingIndicator";
import ConversationStartersModal from "../components/ConversationStartersModal";
import GoalConfirmationModal from "../components/GoalConfirmationModal";

interface Suggestion {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
}

export default function ChatScreen() {
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showStartersModal, setShowStartersModal] = useState(false);
  const [showGoalConfirmation, setShowGoalConfirmation] = useState(false);
  const [pendingGoalMessage, setPendingGoalMessage] = useState("");
  const [suggestions] = useState<Suggestion[]>([
    {
      text: "Set a savings goal",
      icon: "flag",
      color: "#4A90E2",
      bgColor: "#4A90E2",
    },
    {
      text: "Give me a spending tip",
      icon: "bulb",
      color: "#FFB156",
      bgColor: "#FF9500",
    },
    {
      text: "What's my net worth?",
      icon: "wallet",
      color: "#4CD964",
      bgColor: "#34C759",
    },
    {
      text: "Track my expenses",
      icon: "stats-chart",
      color: "#FF3B30",
      bgColor: "#FF3B30",
    },
    {
      text: "Investment advice",
      icon: "trending-up",
      color: "#9C27B0",
      bgColor: "#9C27B0",
    },
  ]);
  const scrollButtonAnimation = useRef(new Animated.Value(0)).current;

  const scrollViewRef = useRef<ScrollView>(null);
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

  const { timelineData, saveGoal, deleteGoal, refreshGoals } =
    useGoals(pushChat);

  // Goal confirmation handlers
  const handleGoalConfirm = async () => {
    console.log("✅ [CHAT] User clicked 'Yes' on goal confirmation");
    console.log("📝 [CHAT] Pending goal message:", pendingGoalMessage);
    setShowGoalConfirmation(false);
    setIsTyping(true);
    console.log("⏳ [CHAT] Set typing indicator to true");

    try {
      const goalRes = await fetch(
        "https://financify-rose.vercel.app/api/finny/goal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: pendingGoalMessage }),
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

      const goalWithProgress = {
        ...goalData,
        id: Date.now().toString(),
        progress: Math.floor(Math.random() * 101),
      };
      await saveGoal(goalWithProgress);
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
      console.error("❌ Goal confirmation error:", error);
      pushChat(
        "finny",
        "Hmm, something went wrong with setting up your goal. Try again?"
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleGoalDecline = async () => {
    console.log("❌ [CHAT] User clicked 'Not Yet' on goal confirmation");
    console.log("📝 [CHAT] Pending goal message:", pendingGoalMessage);
    setShowGoalConfirmation(false);
    setIsTyping(true);
    console.log("⏳ [CHAT] Set typing indicator to true");

    try {
      // Treat as a regular question
      await handleUserMessage(pendingGoalMessage);
    } catch (error) {
      console.error("❌ Goal decline error:", error);
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
    console.log(
      "🔘 [CHAT] GoalConfirmationModal state changed:",
      showGoalConfirmation
    );
  }, [showGoalConfirmation]);

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;
    console.log("🚀 [CHAT] handleSend called with message:", messageText);

    if (!messageText.trim()) {
      console.log("❌ [CHAT] Empty message, returning");
      return;
    }

    console.log("📝 [CHAT] Pushing user message to chat");
    pushChat("user", messageText);
    setUserInput("");
    setIsTyping(true);
    console.log("⏳ [CHAT] Set typing indicator to true");

    try {
      console.log("🔍 [CHAT] Checking if goalMode is active:", goalMode.active);

      if (goalMode.active) {
        console.log("🎯 [CHAT] Goal mode is active, calling goal API");
        const goalRes = await fetch(
          "https://financify-rose.vercel.app/api/finny/goal",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: messageText }),
          }
        );

        console.log("📡 [CHAT] Goal API response status:", goalRes.status);
        const updated = await goalRes.json();
        console.log("✅ [CHAT] Goal API response:", updated);
        const newGoal = {
          id: Date.now().toString(),
          label: updated.label || goalMode.label,
          target: updated.target || goalMode.target,
          timeline: updated.timeline || goalMode.timeline,
          year: updated.timeline?.year || goalMode.timeline?.year,
          description: `Save $${updated.target || goalMode.target} for ${
            updated.label || goalMode.label
          }`,
          progress: Math.floor(Math.random() * 101),
        };

        setGoalMode({ active: true, ...newGoal });
        if (!newGoal.label) {
          await pushChat("finny", "What would you like to call this goal?");
          return;
        }
        if (!newGoal.target) {
          await pushChat(
            "finny",
            `And how much do you want to save for ${newGoal.label}?`
          );
          return;
        }
        if (!newGoal.timeline) {
          await pushChat(
            "finny",
            `And by when would you like to reach your $${newGoal.target} goal?`
          );
          return;
        }

        await saveGoal(newGoal);
        await pushChat(
          "finny",
          `Awesome! I've added your goal to save $${newGoal.target} for "${newGoal.label}" by ${newGoal.timeline.month} ${newGoal.timeline.year}. 🎯`
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

      console.log("🔍 [CHAT] Goal mode not active, calling classify API");
      const classifyRes = await fetch(
        "https://financify-rose.vercel.app/api/finny/classify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageText }),
        }
      );

      console.log(
        "📡 [CHAT] Classify API response status:",
        classifyRes.status
      );
      const { intent, confidence } = await classifyRes.json();
      console.log(
        "🎯 [CHAT] Classification result - Intent:",
        intent,
        "Confidence:",
        confidence
      );

      if (intent === "goal" && confidence >= 0.7) {
        console.log("🎉 [CHAT] GOAL CONFIRMATION TRIGGERED!");
        console.log("📝 [CHAT] Setting pending goal message:", messageText);
        console.log("🔘 [CHAT] Setting showGoalConfirmation to true");
        // Show confirmation modal instead of directly setting up goal
        setPendingGoalMessage(messageText);
        setShowGoalConfirmation(true);
        console.log("✅ [CHAT] Goal confirmation modal should now be visible");
        return;
      } else {
        console.log(
          "❌ [CHAT] No goal confirmation - Intent:",
          intent,
          "Confidence:",
          confidence
        );
      }

      console.log("💬 [CHAT] Calling handleUserMessage for regular advice");
      await handleUserMessage(messageText);
    } catch (error) {
      console.error("💥 [CHAT] handleSend error:", error);
      pushChat("finny", "Hmm, something went wrong. Try again?");
    } finally {
      console.log("⏹️ [CHAT] Setting typing indicator to false");
      setIsTyping(false);
    }
  };

  const handleScroll = (event: any) => {
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
  };

  const scrollToBottom = () => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({
        animated: true,
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={[
          "rgba(26, 61, 102, 0.85)",
          "rgba(26, 61, 102, 0.1)",
          "transparent",
        ]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
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
          {/* <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Finny</Text>
          </View> */}
        </View>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={clearChat}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={14} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      <View style={styles.chatArea}>
        <View style={styles.chatContainer}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatScroll}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => (isScrolling.current = true)}
            onScrollEndDrag={() => (isScrolling.current = false)}
            onContentSizeChange={() => {
              if (shouldScrollToBottom.current) scrollToBottom();
            }}
            contentContainerStyle={{ paddingBottom: 50 }}
          >
            {showNudges && <NudgeGrid onNudgePress={handleSend} />}
            {chatMessages.map((msg, index) => (
              <ChatMessageComponent
                key={msg.id}
                message={msg}
                showSender={
                  msg.sender === "finny" &&
                  (index === 0 || chatMessages[index - 1].sender !== "finny")
                }
              />
            ))}
            {isTyping && <TypingIndicator />}
          </ScrollView>

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

        <View style={styles.inputBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsContainer}
          >
            {suggestions.map((suggestion, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleSend(suggestion.text)}
                style={[
                  styles.suggestionChip,
                  { backgroundColor: suggestion.bgColor },
                ]}
              >
                <Ionicons
                  name={suggestion.icon}
                  size={14}
                  color="#FFFFFF"
                  style={styles.suggestionIcon}
                />
                <Text style={styles.suggestionText}>{suggestion.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={() => handleSend()}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-up-circle-sharp"
                size={32}
                color="#4A90E2"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ConversationStartersModal
        visible={showStartersModal}
        onClose={() => setShowStartersModal(false)}
        onSelectQuestion={(question) => {
          setUserInput(question);
          handleSend(question);
        }}
      />

      <GoalConfirmationModal
        visible={showGoalConfirmation}
        onConfirm={handleGoalConfirm}
        onDecline={handleGoalDecline}
      />
    </SafeAreaView>
  );
}
