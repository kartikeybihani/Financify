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
import { isGoalIntent } from "../utils/isGoalIntent";
import { extractGoalDetails } from "../utils/extractGoalDetails";
import Timeline from "../components/Timeline";
import { ChatMessageComponent } from "../components/ChatMessage";
import { TypingIndicator } from "../components/TypingIndicator";
import { NudgeGrid } from "../components/NudgeGrid";
import { useChat } from "../hooks/useChat";
import { useGoals } from "../hooks/useGoals";
import { Timeline as TimelineType } from "../types/finny";
import styles from "../styles/finnyStyles";

interface Timeline {
  month: string;
  year: string;
}

// Merge the new styles with the existing styles import
const mergedStyles = StyleSheet.create({
  ...styles,
  headerContainer: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: "#121212",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  clearButton: {
    position: "absolute",
    right: 16,
    top: "50%",
    transform: [{ translateY: -12 }],
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.2)",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f1f1f",
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  sendButton: {
    backgroundColor: "#4A90E2",
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
    paddingVertical: 8,
  },
});

export default function FinnyScreen() {
  // State
  const [activeTab, setActiveTab] = useState<"chat" | "timeline">("chat");
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Refs
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

  // Custom hooks
  const {
    chatMessages,
    isTyping,
    showNudges,
    clearChat,
    pushChat,
    pushChatWithDelay,
    handleFinnyResponse,
  } = useChat();

  const { goalSetup, timelineData, setGoalSetup, handleGoalSetup, deleteGoal } =
    useGoals(pushChat);

  // Effects
  useEffect(() => {
    if (isTyping) {
      animateTypingDots();
    } else {
      dotAnimations.forEach((dot) => dot.setValue(0));
    }
  }, [isTyping]);

  useEffect(() => {
    if (activeTab === "timeline") {
      animateTimeline();
    } else if (activeTab === "chat") {
      scrollToBottom();
    } else {
      timelineAnimations.forEach((anim) => anim.setValue(0));
    }
  }, [activeTab]);

  // Animations
  const animateTypingDots = () => {
    const animations = dotAnimations.map((dot, index) => {
      return Animated.sequence([
        Animated.delay(index * 200),
        Animated.loop(
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        ),
      ]);
    });
    Animated.parallel(animations).start();
  };

  const animateTimeline = () => {
    timelineAnimations.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: index * 150,
        useNativeDriver: true,
      }).start();
    });
  };

  // Handlers
  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;
    if (!messageText.trim()) return;

    console.log("Kartik:", messageText);
    pushChat("user", messageText);
    setUserInput("");

    try {
      if (goalSetup.step !== "none") {
        console.log("🎯 Processing goal setup step:", goalSetup.step);
        const continueSetup = await handleGoalSetup(messageText);
        if (continueSetup) return;
        return;
      }

      const isGoal = await isGoalIntent(messageText);
      if (isGoal) {
        console.log("🎯 Goal intent detected, processing...");
        const parsedGoalDetails = await extractGoalDetails(messageText);
        const label = parsedGoalDetails.label;
        const target = parsedGoalDetails.target;
        const timeline =
          parsedGoalDetails.timeline &&
          parsedGoalDetails.timeline.month &&
          parsedGoalDetails.timeline.year
            ? ({
                month: parsedGoalDetails.timeline.month,
                year: parsedGoalDetails.timeline.year.toString(),
              } as TimelineType)
            : undefined;

        let nextStep: "none" | "label" | "target" | "year" = "none";
        let response = "Let's set up your financial goal! 🎯\n\n";

        if (!label) {
          nextStep = "label";
          response += "What would you like to call this goal?";
        } else if (!target) {
          nextStep = "target";
          response += `Great! How much do you need to save for ${label}?`;
        } else if (!timeline) {
          nextStep = "year";
          response += `And by when would you like to save $${target.toLocaleString()}?`;
        }

        setGoalSetup({
          step: nextStep,
          label: label || undefined,
          target: target ? String(target) : undefined,
          timeline: timeline,
        });

        await pushChatWithDelay("finny", [response]);
        return;
      }

      await handleFinnyResponse(messageText);
    } catch (error) {
      console.error("❌ Error handling message:", error);
      pushChat("finny", "Something went wrong. Please try again.");
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
      <View style={mergedStyles.headerContainer}>
        <View style={mergedStyles.titleContainer}>
          <Ionicons
            name="sparkles"
            size={24}
            color="#4A90E2"
            style={{ marginRight: 8 }}
          />
          <Text style={mergedStyles.headerTitle}>Finny</Text>
        </View>
        <TouchableOpacity
          style={mergedStyles.clearButton}
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
              onScrollBeginDrag={() => {
                isScrolling.current = true;
              }}
              onScrollEndDrag={() => {
                isScrolling.current = false;
              }}
              onContentSizeChange={() => {
                if (shouldScrollToBottom.current) {
                  scrollToBottom();
                }
              }}
            >
              {showNudges && <NudgeGrid onNudgePress={handleSend} />}
              {chatMessages.map((msg) => (
                <ChatMessageComponent key={msg.id} message={msg} />
              ))}
              {isTyping && <TypingIndicator dotAnimations={dotAnimations} />}
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
            <View style={mergedStyles.inputBar}>
              <TextInput
                placeholder="Ask Finny anything about money..."
                placeholderTextColor="#888"
                style={mergedStyles.input}
                value={userInput}
                onChangeText={setUserInput}
                onSubmitEditing={() => handleSend()}
              />
              <TouchableOpacity
                style={mergedStyles.sendButton}
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
