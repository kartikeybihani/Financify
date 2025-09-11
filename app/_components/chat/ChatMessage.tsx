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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { splitIntoMessages } from "../../_hooks/useChat";
import { BlurView } from "expo-blur";

// Enable LayoutAnimation for Android
if (Platform.OS === "android") {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

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
            <View key={btn.action} style={{ marginBottom: 12, width: "60%" }}>
              <Animated.View style={{ opacity: fadeAnim, width: "100%" }}>
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 11,
                    marginRight: 8,
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
                      fontSize: 13,
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

  // Use shared splitIntoMessages logic
  const points = splitIntoMessages(message.text);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
      }}
    >
      {showSender && points.length > 0 && (
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
      {points.map((point, pointIdx) => (
        <Animated.View
          key={pointIdx}
          style={[
            styles.finnyMessageRow,
            pointIdx > 0 && {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.finnyMessageContainer}>
            <LinearGradient
              colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.finnyMessageBubble,
                {
                  borderBottomLeftRadius: pointIdx === 0 ? 10 : 0,
                  borderBottomRightRadius: pointIdx === 0 ? 10 : 0,
                },
              ]}
            >
              <Text style={[styles.messageText, styles.finnyMessageText]}>
                {point.split("\n").map((line, lineIdx) => (
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
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    maxWidth: "90%",
    marginVertical: 2,
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    marginRight: 16,
    marginLeft: 60,
    marginTop: 16,
  },
  userMessageBubble: {
    borderRadius: 12,
    borderTopRightRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    marginBottom: 2,
  },
  finnyMessageContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 60,
  },
  finnyMessageBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 5,
    borderRadius: 12,
    borderBottomLeftRadius: 1,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
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
    marginLeft: 16,
    marginBottom: 4,
  },
  senderName: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
    letterSpacing: -0.1,
    fontFamily: Platform.OS === "ios" ? "SF Pro Text" : "System",
  },
});

export default ChatMessageComponent;
