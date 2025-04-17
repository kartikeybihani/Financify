import React, { useState, useRef, useEffect } from "react";
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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { isGoalIntent } from "../utils/isGoalIntent";
import { extractGoalDetails } from "../utils/extractGoalDetails";
import Timeline from "../components/Timeline";
import styles from "../styles/finnyStyles";

// Types
interface TimelineItem {
  year: string;
  label: string;
  description: string;
}

interface GoalSetup {
  step: "none" | "awaiting-confirmation" | "label" | "target" | "year";
  label?: string;
  target?: string;
  year?: string;
  rawMessage?: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "finny";
  text: string;
}

// Constants
const chatMessagesInitial: ChatMessage[] = [
  { id: "1", sender: "finny", text: "Hi there! What do you wanna know?" },
];

const nudgeOptions = [
  { id: "1", text: "Tell me about investing basics" },
  { id: "2", text: "How can I save more money?" },
  { id: "3", text: "What's the best way to pay off debt?" },
  { id: "4", text: "Help me create a budget" },
  { id: "5", text: "Explain FIRE to me" },
  { id: "6", text: "What's a good emergency fund amount?" },
];

const timelineData: TimelineItem[] = [
  {
    year: "2025",
    label: "Started Saving",
    description: "First step into your financial future.",
  },
  {
    year: "2028",
    label: "Bought First Car",
    description: "Major milestone achieved.",
  },
  {
    year: "2032",
    label: "Home Downpayment",
    description: "You're investing in stability.",
  },
  {
    year: "2037",
    label: "Kids Education",
    description: "Planning ahead for your family.",
  },
  {
    year: "2045",
    label: "FIRE Target",
    description: "You did it! Financially Independent.",
  },
];

export default function FinnyScreen() {
  // State
  const [chatMessages, setChatMessages] =
    useState<ChatMessage[]>(chatMessagesInitial);
  const [userInput, setUserInput] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "timeline">("chat");
  const [showNudges, setShowNudges] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [goalSetup, setGoalSetup] = useState<GoalSetup>({ step: "none" });
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastContentOffset = useRef({ y: 0 }).current;
  const isScrolling = useRef(false);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);
  const timelineAnimations = useRef<Animated.Value[]>(
    timelineData.map(() => new Animated.Value(0))
  ).current;
  const dotAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // Effects
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatMessages]);

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
    } else {
      timelineAnimations.forEach((anim) => anim.setValue(0));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "chat") {
      scrollToBottom();
    }
  }, [activeTab]);

  // Helper functions
  const pushChat = (sender: "user" | "finny", text: string) => {
    const msg = {
      id: Date.now().toString(),
      sender,
      text,
    };
    setChatMessages((prev) => [...prev, msg]);
  };

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

  const scrollToBottom = () => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  };

  const handleScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

    // Show button if not at bottom and content height is greater than view height
    const shouldShowButton =
      currentOffset < contentHeight - scrollViewHeight - 100 &&
      contentHeight > scrollViewHeight;

    setShowScrollButton(shouldShowButton);
    lastContentOffset.y = currentOffset;
  };

  // Goal handling
  const handleGoalSetup = async (messageText: string) => {
    const updated = { ...goalSetup };

    if (goalSetup.step === "label") {
      updated.label = messageText;
    } else if (goalSetup.step === "target") {
      updated.target = messageText;
    } else if (goalSetup.step === "year") {
      updated.year = messageText;
    }

    // Determine next step
    if (!updated.label) {
      setGoalSetup({ ...updated, step: "label" });
      pushChat("finny", "What should we call this goal?");
      return true;
    } else if (!updated.target) {
      setGoalSetup({ ...updated, step: "target" });
      pushChat("finny", "How much do you want to save?");
      return true;
    } else if (!updated.year) {
      setGoalSetup({ ...updated, step: "year" });
      pushChat("finny", "By what year do you want to reach this goal?");
      return true;
    } else {
      // Save goal
      const finalGoal = {
        label: updated.label,
        target: Number(updated.target || "0"),
        year: updated.year,
        description: "User-defined goal",
      };

      const existing = await AsyncStorage.getItem("goals");
      const parsed = JSON.parse(existing || "[]");
      await AsyncStorage.setItem(
        "goals",
        JSON.stringify([...parsed, finalGoal])
      );

      pushChat(
        "finny",
        `Awesome! Goal "${finalGoal.label}" for $${finalGoal.target} by ${finalGoal.year} is now saved 🎯`
      );
      setGoalSetup({ step: "none" });
      return false;
    }
  };

  // Message handling
  const handleFinnyResponse = async (messageText: string) => {
    try {
      const stored = await AsyncStorage.getItem("financialData");
      const parsed = JSON.parse(stored || "{}");
      const res = await fetch("http://localhost:8080/api/finny/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          transactions: parsed.transactions,
          accounts: parsed.accounts,
          investments: parsed.investments,
          liabilities: parsed.liabilities,
        }),
      });

      const data = await res.json();
      pushChat(
        "finny",
        data.nudges?.join("\n\n") ||
          "Sorry, I wasn't able to generate advice just now."
      );
    } catch (error) {
      console.error("AI error:", error);
      pushChat("finny", "Something went wrong. Try again later.");
    }
  };

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;
    if (!messageText.trim()) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    pushChat("user", messageText);
    setUserInput("");
    setIsTyping(true);
    setShowNudges(false);

    try {
      // Handle goal setup mode
      if (goalSetup.step !== "none") {
        const continueSetup = await handleGoalSetup(messageText);
        if (continueSetup) {
          setIsTyping(false);
          return;
        }
      }

      // Check for new goal intent
      const isGoal = await isGoalIntent(messageText);
      if (isGoal) {
        pushChat("finny", "Sounds like a goal! Let me help you set it up.");
        const { label, target, timeline } = await extractGoalDetails(
          messageText
        );

        const missingStep = !label
          ? "label"
          : !target
          ? "target"
          : !timeline
          ? "year"
          : "none";

        setGoalSetup({
          step: missingStep,
          label: label || undefined,
          target: target ? String(target) : undefined,
          year: timeline || undefined,
          rawMessage: messageText,
        });

        if (missingStep === "label") {
          pushChat("finny", "What should we call this goal?");
        } else if (missingStep === "target") {
          pushChat("finny", "How much do you want to save?");
        } else if (missingStep === "year") {
          pushChat("finny", "By what year do you want to hit this goal?");
        } else {
          pushChat("finny", `Got it! Just say "yes" to confirm this goal.`);
        }
      } else {
        // Handle regular Finny response
        await handleFinnyResponse(messageText);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      pushChat("finny", "Something went wrong. Please try again.");
    } finally {
      setIsTyping(false);
    }
  };

  // Render functions
  const renderChatMessage = (msg: ChatMessage) => (
    <View
      key={msg.id}
      style={[
        styles.chatBubble,
        msg.sender === "user" ? styles.chatRight : styles.chatLeft,
      ]}
    >
      <Text style={styles.chatText}>
        {msg.text.split(/\b(\$\d[\d,\.]*)\b/).map((chunk, idx) =>
          chunk.startsWith("$") ? (
            <Text key={`${msg.id}-money-${idx}`} style={styles.chatMoney}>
              {chunk}
            </Text>
          ) : (
            <Text key={`${msg.id}-text-${idx}`}>{chunk}</Text>
          )
        )}
      </Text>
    </View>
  );

  const renderTypingIndicator = () => (
    <View style={[styles.chatBubble, styles.chatLeft]}>
      <View style={styles.typingIndicator}>
        {dotAnimations.map((dot, index) => (
          <Animated.View
            key={index}
            style={[
              styles.typingDot,
              {
                opacity: dot,
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -4],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );

  const renderNudges = () => (
    <View style={styles.nudgeContainer}>
      <View style={styles.nudgeGrid}>
        {nudgeOptions.map((nudge) => (
          <TouchableOpacity
            key={nudge.id}
            style={styles.nudgeBox}
            onPress={() => handleSend(nudge.text)}
          >
            <Text style={styles.nudgeText}>{nudge.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerCentered}>
        <Ionicons
          name="sparkles"
          size={24}
          color="#4A90E2"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.headerTitle}>Finny</Text>
      </View>

      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "chat" && styles.activeTab]}
          onPress={() => setActiveTab("chat")}
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
            >
              {showNudges && renderNudges()}
              {chatMessages.map(renderChatMessage)}
              {isTyping && renderTypingIndicator()}
            </ScrollView>

            {showScrollButton && (
              <TouchableOpacity
                style={styles.scrollToBottomButton}
                onPress={scrollToBottom}
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
              <TouchableOpacity onPress={() => handleSend()}>
                <Ionicons name="send" size={22} color="#4A90E2" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <Timeline
          timelineData={timelineData}
          timelineAnimations={timelineAnimations}
        />
      )}
    </SafeAreaView>
  );
}
