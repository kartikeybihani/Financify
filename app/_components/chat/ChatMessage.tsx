import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

// Enable LayoutAnimation for Android
if (Platform.OS === "android") {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// Responsive calculations
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const isSmallScreen = screenWidth < 375;
const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
const isLargeScreen = screenWidth >= 414;

const responsiveWidth = (percentage: number) =>
  screenWidth * (percentage / 100);
const responsiveFontSize = (baseSize: number) => {
  if (isSmallScreen) return baseSize * 0.9;
  if (isLargeScreen) return baseSize * 1.1;
  return baseSize;
};
const responsivePadding = (basePadding: number) => {
  if (isSmallScreen) return basePadding * 0.8;
  if (isLargeScreen) return basePadding * 1.2;
  return basePadding;
};

interface ChatMessageProps {
  message: {
    sender: "user" | "finny";
    text: string;
    id: string;
    type?: "text" | "action";
    actions?: Array<{
      label: string;
      action: string;
      style?: "primary" | "secondary";
    }>;
  };
  showSender?: boolean;
  onAction?: (action: string) => void;
}

export const ChatMessageComponent = ({
  message,
  showSender = true,
  onAction,
}: ChatMessageProps) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Smooth entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.elastic(0.8),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        300,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );
  }, []);

  const isUser = message.sender === "user";

  if (isUser) {
    return (
      <Animated.View
        style={[
          styles.messageContainer,
          styles.userMessageContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={["#2A3A4A", "#1A2A3A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userMessageBubble}
        >
          <Text style={[styles.messageText, styles.userMessageText]}>
            {message.text}
          </Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  if (
    message.type === "action" &&
    message.actions &&
    message.actions.length > 0
  ) {
    const [clicked, setClicked] = useState(false);
    return (
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
        }}
      >
        {showSender && (
          <Animated.View
            style={[
              styles.senderNameContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.senderName}>Finny</Text>
          </Animated.View>
        )}
        <View style={styles.finnyMessageRow}>
          <View style={styles.finnyMessageContainer}>
            <LinearGradient
              colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.finnyMessageBubble}
            >
              <Text style={[styles.messageText, styles.finnyMessageText]}>
                {message.text}
              </Text>
            </LinearGradient>
          </View>
        </View>
        {/* Action buttons below the bubble */}
        <View
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            marginLeft: 12,
            marginTop: 8,
          }}
        >
          {message.actions.map((btn, idx) => (
            <View
              key={btn.action}
              style={{
                marginBottom: responsivePadding(12),
                width: isSmallScreen ? "65%" : "60%",
              }}
            >
              <Animated.View style={{ opacity: fadeAnim, width: "100%" }}>
                <View
                  style={{
                    paddingHorizontal: responsivePadding(14),
                    paddingVertical: responsivePadding(10),
                    borderRadius: 11,
                    marginRight: responsivePadding(8),
                    flexDirection: "row",
                    alignItems: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 4,
                    elevation: 4,
                    opacity: clicked ? 0.5 : 0.95,
                    borderWidth: 1,
                    borderColor: "rgba(74, 144, 226, 0.25)",
                    backgroundColor: "rgba(26, 61, 102, 0.35)",
                    width: "100%",
                    alignSelf: "flex-start",
                  }}
                >
                  <Text
                    onPress={() => {
                      if (!clicked && onAction) {
                        setClicked(true);
                        onAction(btn.action);
                      }
                    }}
                    style={{
                      fontSize: responsiveFontSize(13),
                      fontWeight: "600",
                      color: "#FFFFFF",
                      letterSpacing: 0.2,
                      textAlign: "center",
                      flex: 1,
                    }}
                  >
                    {btn.label}
                  </Text>
                </View>
              </Animated.View>
            </View>
          ))}
        </View>
      </Animated.View>
    );
  }

  // Display message as single string (no splitting)
  const messageText = message.text;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
      }}
    >
      {showSender && messageText && (
        <Animated.View
          style={[
            styles.senderNameContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.senderName}>Finny</Text>
        </Animated.View>
      )}
      {messageText && (
        <Animated.View style={styles.finnyMessageRow}>
          <View style={styles.finnyMessageContainer}>
            <LinearGradient
              colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.finnyMessageBubble}
            >
              <Text style={[styles.messageText, styles.finnyMessageText]}>
                {messageText.split("\n").map((line, lineIdx) => (
                  <React.Fragment key={lineIdx}>
                    {lineIdx > 0 && <Text>{"\n"}</Text>}
                    <Text>
                      {line.split(/(\*\*[^*]+\*\*)/).map((chunk, idx) => {
                        if (chunk.startsWith("**") && chunk.endsWith("**")) {
                          return (
                            <Text key={idx} style={styles.boldText}>
                              {chunk.slice(2, -2)}
                            </Text>
                          );
                        }
                        return chunk;
                      })}
                    </Text>
                  </React.Fragment>
                ))}
              </Text>
            </LinearGradient>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    maxWidth: isSmallScreen ? "95%" : "90%",
    marginVertical: responsivePadding(1),
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    marginRight: responsivePadding(16),
    marginLeft: responsiveWidth(15),
    marginTop: responsivePadding(8),
  },
  userMessageBubble: {
    borderRadius: 12,
    borderTopRightRadius: 3,
    paddingHorizontal: responsivePadding(12),
    paddingVertical: responsivePadding(8),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  finnyMessageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: responsivePadding(1),
  },
  finnyMessageContainer: {
    flex: 1,
    marginLeft: responsivePadding(12),
    marginRight: responsiveWidth(15),
  },
  finnyMessageBubble: {
    paddingHorizontal: responsivePadding(12),
    paddingVertical: responsivePadding(8),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: responsivePadding(2),
    borderRadius: 12,
    borderBottomLeftRadius: 1,
  },
  messageText: {
    fontSize: responsiveFontSize(14),
    lineHeight: responsiveFontSize(18),
    letterSpacing: -0.1,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
  userMessageText: {
    color: "#FFFFFF",
    fontWeight: "400",
  },
  finnyMessageText: {
    color: "#FFFFFF",
    fontWeight: "400",
  },
  boldText: {
    fontWeight: "600",
    color: "#FFFFFF",
  },
  senderNameContainer: {
    marginLeft: responsivePadding(16),
    marginBottom: responsivePadding(2),
  },
  senderName: {
    fontSize: responsiveFontSize(13),
    color: "#8E8E93",
    fontWeight: "500",
    letterSpacing: -0.1,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
});

export default ChatMessageComponent;
