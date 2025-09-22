import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  LayoutAnimation,
  Animated,
  ActivityIndicator,
  Platform,
  Image,
  Easing,
  KeyboardAvoidingView,
  Keyboard,
  ListRenderItem,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ChatMessageComponent } from "../_components/chat/ChatMessage";
import { NudgeGrid } from "../_components/chat/NudgeGrid";
import { useChat } from "../_hooks/useChat";
import styles from "../_styles/chatStyles";
import TypingIndicator from "../_components/chat/TypingIndicator";
import ConversationStartersModal from "../_components/chat/ConversationStartersModal";

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
  const [userInput, setUserInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showStartersModal, setShowStartersModal] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));

  // Handle orientation changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

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
    clearChat,
    pushChat,
    handleUserMessage,
  } = useChat();

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

  const handleSend = async (nudgeText?: string) => {
    const messageText = nudgeText || userInput;

    if (!messageText.trim()) {
      return;
    }

    pushChat("user", messageText);
    Keyboard.dismiss();
    setUserInput("");
    setIsTyping(true);

    try {
      await handleUserMessage(messageText);
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

      // Show scroll button if user is not at the bottom
      const isAtBottom = currentOffset >= contentHeight - scrollViewHeight - 50;
      const shouldShow = !isAtBottom && contentHeight > scrollViewHeight;

      if (shouldShow !== showScrollButton) {
        setShowScrollButton(shouldShow);
        Animated.spring(scrollButtonAnimation, {
          toValue: shouldShow ? 1 : 0,
          useNativeDriver: true,
          tension: 80,
          friction: 9,
        }).start();
      }
    },
    [showScrollButton, scrollButtonAnimation]
  );

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && flatListData.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [flatListData.length]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (flatListData.length > 0) {
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
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
              // Handle any future actions here
            }}
          />
        );
      }

      return null;
    },
    [handleSend, chatMessages]
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
      <SafeAreaView style={{ flex: 1, marginBottom: insets.bottom - 10 }}>
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
                contentContainerStyle={{
                  paddingTop: responsivePadding(8),
                  paddingBottom:
                    Math.max(insets.bottom, responsivePadding(8)) +
                    responsiveHeight(8),
                }}
                removeClippedSubviews={true}
                maxToRenderPerBatch={8}
                windowSize={8}
                initialNumToRender={15}
                updateCellsBatchingPeriod={100}
                maintainVisibleContentPosition={{
                  minIndexForVisible: 0,
                  autoscrollToTopThreshold: 10,
                }}
                // Additional performance optimizations
                legacyImplementation={false}
                disableVirtualization={false}
                disableIntervalMomentum={true}
                decelerationRate="normal"
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
              />

              {/* Goal Confirmation Buttons */}
              {goalFlow?.stage === "confirm" && (
                <View style={styles.goalConfirmationButtons}>
                  <TouchableOpacity
                    style={[styles.goalButton, styles.cancelButton]}
                    onPress={() => handleSend("cancel")}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.goalButton, styles.confirmButton]}
                    onPress={() => handleSend("confirm")}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmButtonText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              )}

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
                    onPress={scrollToBottom}
                    style={styles.scrollButtonTouchable}
                    activeOpacity={0.8}
                  >
                    <View style={styles.scrollButtonGradient}>
                      <AntDesign name="arrow-down" size={20} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>

            <View
              style={[
                styles.inputBarContainer,
                {
                  paddingBottom:
                    Math.max(insets.bottom, responsivePadding(8)) +
                    responsivePadding(8),
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
                    onPress={() => handleSend(item.text)}
                    style={styles.suggestionChip}
                  >
                    <Ionicons
                      name={item.icon}
                      size={13}
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
