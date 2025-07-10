import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { splitIntoMessages } from "../hooks/useChat";

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
  };
  showSender?: boolean;
}

export const ChatMessageComponent = ({
  message,
  showSender = true,
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
          colors={["rgba(74, 144, 226, 0.9)", "rgba(74, 144, 226, 0.7)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.userMessageGradient}
        >
          <Text style={[styles.messageText, styles.userMessageText]}>
            {message.text}
          </Text>
        </LinearGradient>
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
      {showSender && (
        <Animated.View
          style={[
            styles.senderInfo,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.avatarContainer}>
            <Image
              source={require("../assets/mascot1.jpg")}
              style={styles.senderAvatar}
            />
            <View style={styles.avatarGlow} />
          </View>
          <Text style={styles.senderName}>Finny</Text>
        </Animated.View>
      )}
      {points.map((point, pointIdx) => (
        <Animated.View
          key={pointIdx}
          style={[
            { flexDirection: "row", alignItems: "flex-start" },
            { opacity: 1 },
            pointIdx > 0 && {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={["#4A90E2", "#357ABD", "#2E6BB8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.messageContainer,
              styles.finnyMessageContainer,
              pointIdx > 0 ? { marginTop: 8 } : {},
            ]}
          >
            <View style={styles.messageContent}>
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
            </View>
          </LinearGradient>
        </Animated.View>
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 18,
    marginVertical: 4,
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    marginRight: 4,
    marginTop: 10,
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  userMessageGradient: {
    borderRadius: 16,
    padding: 12,
  },
  finnyMessageContainer: {
    alignSelf: "flex-start",
    marginLeft: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
    flex: 1,
  },
  messageContent: {
    borderRadius: 16,
    overflow: "hidden",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  userMessageText: {
    color: "#fff",
    fontWeight: "500",
  },
  finnyMessageText: {
    color: "#fff",
    fontWeight: "400",
  },
  boldText: {
    fontWeight: "700",
    color: "#fff",
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
    marginBottom: 6,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 8,
  },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    transform: [{ scaleX: -1 }],
    borderWidth: 2,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  avatarGlow: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 16,
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    zIndex: -1,
  },
  senderName: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

export default ChatMessageComponent;
