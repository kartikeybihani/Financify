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
  FlatList,
  Dimensions,
  Animated,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

const chatMessagesInitial = [
  { id: "1", sender: "finny", text: "Hi there! What do you wanna know?" },
];

// Nudge options that will appear as clickable boxes
const nudgeOptions = [
  { id: "1", text: "Tell me about investing basics" },
  { id: "2", text: "How can I save more money?" },
  { id: "3", text: "What's the best way to pay off debt?" },
  { id: "4", text: "Help me create a budget" },
  { id: "5", text: "Explain FIRE to me" },
  { id: "6", text: "What's a good emergency fund amount?" },
];

// Define the type for timeline items
interface TimelineItem {
  year: string;
  label: string;
  description: string;
}

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
  const [chatMessages, setChatMessages] = useState(chatMessagesInitial);
  const [userInput, setUserInput] = useState("");
  const [selectedMilestone, setSelectedMilestone] =
    useState<TimelineItem | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "timeline">("chat");
  const [showNudges, setShowNudges] = useState(true);
  const [showAddGoalModal, setShowAddGoalModal] = useState(false);
  const [newGoal, setNewGoal] = useState<Partial<TimelineItem>>({
    year: "",
    label: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const timelineAnimations = useRef<Animated.Value[]>(
    timelineData.map(() => new Animated.Value(0))
  ).current;

  // Add typing animation values
  const dotAnimations = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // Add typing animation effect
  useEffect(() => {
    if (isTyping) {
      const animateDots = () => {
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
      animateDots();
    } else {
      dotAnimations.forEach((dot) => dot.setValue(0));
    }
  }, [isTyping]);

  // Animate timeline items when tab changes
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
    } else {
      timelineAnimations.forEach((anim) => {
        anim.setValue(0);
      });
    }
  }, [activeTab]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatMessages]);

  const isFinanceRelated = (text: string) => {
    const keywords = [
      "save",
      "invest",
      "debt",
      "budget",
      "money",
      "spending",
      "goal",
      "finance",
      "income",
      "retirement",
      "subscription",
      "bank",
      "accounts",
      "FIRE",
    ];
    return keywords.some((keyword) => text.toLowerCase().includes(keyword));
  };

  const handleSend = async () => {
    if (!userInput.trim()) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const newMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userInput,
    };

    setChatMessages((prev) => [...prev, newMessage]);
    setUserInput("");
    setIsTyping(true);
    setShowNudges(false);

    // if (!isFinanceRelated(userInput)) {
    //   const reply = {
    //     id: Date.now().toString() + "_f",
    //     sender: "finny",
    //     text: "I can only help you with your financial life here! Ask me anything about spending, investing, saving!",
    //   };
    //   setChatMessages((prev) => [...prev, reply]);
    //   setIsTyping(false);
    //   return;
    // }

    try {
      const stored = await AsyncStorage.getItem("financialData");
      const parsed = JSON.parse(stored || "{}");
      const res = await fetch("http://localhost:8080/api/finny/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userInput,
          transactions: parsed.transactions,
          accounts: parsed.accounts,
          investments: parsed.investments,
          liabilities: parsed.liabilities,
        }),
      });

      const data = await res.json();
      const reply = {
        id: Date.now().toString() + "_f",
        sender: "finny",
        text:
          data.nudges?.join("\n\n") ||
          "Sorry, I wasn't able to generate advice just now.",
      };

      setChatMessages((prev) => [...prev, reply]);
    } catch (error) {
      console.error("AI error:", error);
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "_f",
          sender: "finny",
          text: "Something went wrong. Try again later.",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Handle nudge box click
  const handleNudgeClick = async (nudgeText: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const newMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: nudgeText,
    };

    setChatMessages((prev) => [...prev, newMessage]);
    setShowNudges(false);
    setLoading(true);

    try {
      const stored = await AsyncStorage.getItem("financialData");
      const parsed = JSON.parse(stored || "{}");
      const res = await fetch("http://localhost:8080/api/finny/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: nudgeText,
          transactions: parsed.transactions,
          accounts: parsed.accounts,
          investments: parsed.investments,
          liabilities: parsed.liabilities,
        }),
      });

      const data = await res.json();
      const reply = {
        id: Date.now().toString() + "_f",
        sender: "finny",
        text:
          data.nudges?.join("\n\n") ||
          "Sorry, I wasn't able to generate advice just now.",
      };

      setChatMessages((prev) => [...prev, reply]);
    } catch (error) {
      console.error("AI error:", error);
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "_f",
          sender: "finny",
          text: "Something went wrong. Try again later.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Get a contextual response based on the user's nudge
  const getFinnyResponse = (userMessage: string) => {
    if (userMessage.includes("investing")) {
      return "Investing is a great way to grow your wealth over time. Start with index funds for diversification and lower risk.";
    } else if (userMessage.includes("save")) {
      return "Try the 50/30/20 rule: 50% for needs, 30% for wants, and 20% for savings and debt repayment.";
    } else if (userMessage.includes("debt")) {
      return "The avalanche method (paying highest interest first) or snowball method (paying smallest balance first) are popular strategies.";
    } else if (userMessage.includes("budget")) {
      return "I can help you create a budget! First, let's track your income and categorize your expenses.";
    } else if (userMessage.includes("FIRE")) {
      return "FIRE (Financial Independence, Retire Early) is about saving aggressively to retire much earlier than traditional retirement age.";
    } else if (userMessage.includes("emergency")) {
      return "Most experts recommend 3-6 months of expenses in your emergency fund, depending on your situation.";
    } else {
      return "I'm here to help with your financial questions. What would you like to know more about?";
    }
  };

  // Handle adding a new goal
  const handleAddGoal = () => {
    if (!newGoal.year || !newGoal.label || !newGoal.description) {
      // Show validation error
      return;
    }

    // Create a new goal with a unique ID
    const goalToAdd: TimelineItem = {
      year: newGoal.year,
      label: newGoal.label,
      description: newGoal.description,
    };

    // Add the new goal to the timeline data
    // In a real app, this would update a database or state management
    // For now, we'll just show a success message
    setShowAddGoalModal(false);
    setNewGoal({ year: "", label: "", description: "" });

    // Show a success message in the chat
    const successMessage = {
      id: Date.now().toString(),
      sender: "finny",
      text: `Great! I've added "${goalToAdd.label}" to your timeline for ${goalToAdd.year}.`,
    };
    setChatMessages([...chatMessages, successMessage]);
  };

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
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatScroll}
            contentContainerStyle={{ paddingBottom: 80 }}
          >
            {/* Nudge Options at the top */}
            {showNudges && (
              <View style={styles.nudgeContainer}>
                <View style={styles.nudgeGrid}>
                  {nudgeOptions.map((nudge) => (
                    <TouchableOpacity
                      key={nudge.id}
                      style={styles.nudgeBox}
                      onPress={() => handleNudgeClick(nudge.text)}
                    >
                      <Text style={styles.nudgeText}>{nudge.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {chatMessages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.chatBubble,
                  msg.sender === "user" ? styles.chatRight : styles.chatLeft,
                ]}
              >
                <Text style={styles.chatText}>{msg.text}</Text>
              </View>
            ))}

            {isTyping && (
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
            )}
          </ScrollView>
          <View style={styles.inputBar}>
            <TextInput
              placeholder="Ask Finny anything about money..."
              placeholderTextColor="#888"
              style={styles.input}
              value={userInput}
              onChangeText={setUserInput}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity onPress={handleSend} disabled={loading}>
              <Ionicons name="send" size={22} color="#4A90E2" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.timelineContainer}>
          <ScrollView contentContainerStyle={styles.timelineWrapper}>
            {timelineData.map((item, index) => {
              const animatedStyle = {
                opacity: timelineAnimations[index],
                transform: [
                  {
                    translateX: timelineAnimations[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [-50, 0],
                    }),
                  },
                ],
              };

              const isSelected = selectedMilestone?.year === item.year;

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut
                    );
                    setSelectedMilestone(isSelected ? null : item);
                  }}
                  style={[
                    styles.timelineRow,
                    isSelected && styles.selectedTimelineRow,
                  ]}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.timelineDot,
                      isSelected && styles.selectedTimelineDot,
                    ]}
                  />
                  <View style={styles.timelineLine} />
                  <Animated.View
                    style={[styles.timelineContent, animatedStyle]}
                  >
                    <View style={styles.timelineHeader}>
                      <Text style={styles.timelineYear}>{item.year}</Text>
                      <View style={styles.timelineIconContainer}>
                        <Ionicons
                          name={getTimelineIcon(item.label)}
                          size={18}
                          color="#4A90E2"
                        />
                      </View>
                    </View>
                    <Text style={styles.timelineLabel}>{item.label}</Text>
                    {isSelected && (
                      <View style={styles.timelineDescriptionContainer}>
                        <Text style={styles.timelineDescription}>
                          {item.description}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Add Goal Button */}
          <TouchableOpacity
            style={styles.addGoalButton}
            onPress={() => setShowAddGoalModal(true)}
          >
            <Ionicons name="add-circle" size={24} color="#4A90E2" />
            <Text style={styles.addGoalText}>Add Goal</Text>
          </TouchableOpacity>

          {/* Add Goal Modal */}
          {showAddGoalModal && (
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Add New Goal</Text>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Year</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2025"
                    placeholderTextColor="#666"
                    value={newGoal.year}
                    onChangeText={(text) =>
                      setNewGoal({ ...newGoal, year: text })
                    }
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Goal Title</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Buy a House"
                    placeholderTextColor="#666"
                    value={newGoal.label}
                    onChangeText={(text) =>
                      setNewGoal({ ...newGoal, label: text })
                    }
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="A major milestone in your financial journey"
                    placeholderTextColor="#666"
                    value={newGoal.description}
                    onChangeText={(text) =>
                      setNewGoal({ ...newGoal, description: text })
                    }
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setShowAddGoalModal(false);
                      setNewGoal({ year: "", label: "", description: "" });
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, styles.saveButton]}
                    onPress={handleAddGoal}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// Helper function to get appropriate icon for timeline items
const getTimelineIcon = (label: string): any => {
  if (label.includes("Saving")) return "wallet-outline";
  if (label.includes("Car")) return "car-outline";
  if (label.includes("Home")) return "home-outline";
  if (label.includes("Education")) return "school-outline";
  if (label.includes("FIRE")) return "flame-outline";
  return "flag-outline";
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  headerCentered: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#121212",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  tabSwitcher: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#1c1c1c",
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  tabButton: {
    paddingVertical: 10,
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: "#2e2e2e",
  },
  tabText: {
    color: "#aaa",
    fontSize: 14,
  },
  activeText: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  chatArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  chatScroll: {
    flex: 1,
    padding: 20,
  },
  chatBubble: {
    maxWidth: "80%",
    padding: 10,
    borderRadius: 10,
    marginVertical: 6,
  },
  chatLeft: {
    alignSelf: "flex-start",
    backgroundColor: "#2c2c2c",
  },
  chatRight: {
    alignSelf: "flex-end",
    backgroundColor: "#4A90E2",
  },
  chatText: {
    color: "#fff",
    fontSize: 14,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f1f1f",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: "absolute",
    bottom: 10,
    left: 20,
    right: 20,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
  },
  timelineWrapper: {
    padding: 20,
    paddingTop: 30,
  },
  timelineRow: {
    marginBottom: 30,
    position: "relative",
    paddingLeft: 40,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  selectedTimelineRow: {
    backgroundColor: "#1f1f1f",
    paddingRight: 12,
  },
  timelineDot: {
    position: "absolute",
    left: 10,
    top: 12,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#4A90E2",
    borderWidth: 2,
    borderColor: "#121212",
    zIndex: 2,
  },
  selectedTimelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4A90E2",
    borderWidth: 3,
    borderColor: "#121212",
  },
  timelineLine: {
    position: "absolute",
    left: 18,
    top: 28,
    width: 2,
    height: "100%",
    backgroundColor: "#333",
    textDecorationStyle: "double",
  },
  timelineContent: {
    marginLeft: 8,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  timelineYear: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4A90E2",
  },
  timelineLabel: {
    fontSize: 16,
    color: "#eee",
    marginTop: 4,
    fontWeight: "500",
  },
  timelineDescriptionContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4A90E2",
  },
  timelineDescription: {
    fontSize: 14,
    color: "#aaa",
    lineHeight: 20,
  },
  nudgeContainer: {
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  nudgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  nudgeBox: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    padding: 8,
    marginBottom: 10,
    width: "47%",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  nudgeText: {
    color: "#fff",
    fontSize: 13,
    textAlign: "center",
  },
  timelineContainer: {
    flex: 1,
    position: "relative",
  },
  addGoalButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "#1f1f1f",
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#333",
  },
  addGoalText: {
    color: "#fff",
    marginLeft: 8,
    fontWeight: "600",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 20,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: "#aaa",
    marginBottom: 6,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: "#333",
  },
  saveButton: {
    backgroundColor: "#4A90E2",
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4A90E2",
    marginHorizontal: 2,
  },
});
