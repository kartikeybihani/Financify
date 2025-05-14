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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { ChatMessageComponent } from "../components/ChatMessage";
import { NudgeGrid } from "../components/NudgeGrid";
import { useChat } from "../hooks/useChat";
import { useGoals } from "../hooks/useGoals";
import styles from "../styles/finnyStyles";
import TypingIndicator from "../components/TypingIndicator";
import ConversationStartersModal from "../components/ConversationStartersModal";

export default function ChatScreen() {
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showStartersModal, setShowStartersModal] = useState(false);

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

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "goalsUpdated",
      refreshGoals
    );
    return () => subscription.remove();
  }, []);

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;
    if (!messageText.trim()) return;
    console.log("messageText", messageText);
    pushChat("user", messageText);
    setUserInput("");
    setIsTyping(true);

    try {
      if (goalMode.active) {
        const goalRes = await fetch(
          "https://financify-rose.vercel.app/api/finny/goal",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: messageText }),
          }
        );

        const updated = await goalRes.json();
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

      const classifyRes = await fetch(
        "https://financify-rose.vercel.app/api/finny/classify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageText }),
        }
      );

      const { intent, confidence } = await classifyRes.json();

      if (intent === "goal" && confidence >= 0.7) {
        pushChat("finny", "Let's set up your goal! 🎯");
        const goalRes = await fetch(
          "https://financify-rose.vercel.app/api/finny/goal",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: messageText }),
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
        return;
      }

      await handleUserMessage(messageText);
    } catch (error) {
      console.error("❌ handleSend error:", error);
      pushChat("finny", "Hmm, something went wrong. Try again?");
    } finally {
      setIsTyping(false);
    }
  };

  const handleScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

    setShowScrollButton(
      currentOffset < contentHeight - scrollViewHeight - 100 &&
        contentHeight > scrollViewHeight
    );
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
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <View style={styles.titleContainer}>
          <View style={styles.iconContainer}>
            <Ionicons name="sparkles" size={24} color="#4A90E2" />
          </View>
          <Text style={styles.headerTitle}>Finny</Text>
        </View>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={clearChat}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={16} color="#FF3B30" />
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
            <TouchableOpacity
              style={styles.scrollToBottomButton}
              onPress={() => {
                shouldScrollToBottom.current = true;
                scrollToBottom();
              }}
            >
              <AntDesign name="arrowdown" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inputBarContainer}>
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
    </SafeAreaView>
  );
}
