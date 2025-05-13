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
import Timeline from "../components/Timeline";
import { ChatMessageComponent } from "../components/ChatMessage";
import { NudgeGrid } from "../components/NudgeGrid";
import { useChat } from "../hooks/useChat";
import { useGoals } from "../hooks/useGoals";
import styles from "../styles/finnyStyles";

export default function FinnyScreen() {
  const [activeTab, setActiveTab] = useState<"chat" | "timeline">("chat");
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const lastContentOffset = useRef({ y: 0 }).current;
  const isScrolling = useRef(false);
  const shouldScrollToBottom = useRef(true);
  const dotAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const timelineAnimations = useRef<Animated.Value[]>(
    Array(10)
      .fill(0)
      .map(() => new Animated.Value(0))
  ).current;

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

  useEffect(() => {
    if (activeTab === "timeline") {
      timelineAnimations.forEach((anim, index) => {
        Animated.timing(anim, {
          toValue: 1,
          duration: 500,
          delay: index * 150,
          useNativeDriver: true,
        }).start();
      });
    } else if (activeTab === "chat") {
      scrollToBottom();
    } else {
      timelineAnimations.forEach((anim) => anim.setValue(0));
    }
  }, [activeTab]);

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;
    if (!messageText.trim()) return;
    console.log("messageText", messageText);
    pushChat("user", messageText);
    setUserInput("");

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
        };

        setGoalMode({ active: true, ...newGoal });

        if (!newGoal.label) {
          await pushChat("finny", "What would you like to call this goal?");
          return;
        }
        if (!newGoal.target) {
          await pushChat(
            "finny",
            `How much do you want to save for "${newGoal.label}"?`
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
            `How much do you want to save for "${goalData.label}"?`
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

        await saveGoal(goalData);
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
          <Ionicons
            name="sparkles"
            size={24}
            color="#4A90E2"
            style={{ marginRight: 8 }}
          />
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

      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "chat" && styles.activeTab]}
          onPress={() => {
            setActiveTab("chat");
            shouldScrollToBottom.current = true;
          }}
        >
          <Text
            style={[styles.tabText, activeTab === "chat" && styles.activeText]}
          >
            Conversation
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "timeline" && styles.activeTab,
          ]}
          onPress={() => setActiveTab("timeline")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "timeline" && styles.activeText,
            ]}
          >
            Timeline
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "chat" ? (
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
              {chatMessages.map((msg) => (
                <ChatMessageComponent key={msg.id} message={msg} />
              ))}
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
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <Timeline
          timelineData={timelineData}
          timelineAnimations={timelineAnimations}
          deleteGoal={deleteGoal}
        />
      )}
    </SafeAreaView>
  );
}
