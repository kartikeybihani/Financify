import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

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
  useEffect(() => {
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
      <View style={[styles.messageContainer, styles.userMessageContainer]}>
        <Text style={[styles.messageText, styles.userMessageText]}>
          {message.text}
        </Text>
      </View>
    );
  }

  // Split message into points based on numbered or bullet points and paragraphs
  const points = message.text
    .split(/\n(?=\d+\.|\•|\-)/g) // split on newlines before bullet-like lines
    .flatMap((p) => p.split(/\n{2,}/g)) // also break on large gaps
    .map((p) => p.trim())
    .filter(Boolean);

  // Debug logging
  console.log("\n----- Enhanced Message Split Debug -----");
  console.log("📝 Original Message:");
  console.log(message.text);
  console.log("\n📑 Split Messages:");
  points.forEach((point, index) => {
    console.log(`\nPoint ${index + 1}:`);
    console.log(point.trim());
  });
  console.log("----------------------------\n");

  return (
    <View>
      {showSender && (
        <View style={styles.senderInfo}>
          <Image
            source={require("../assets/mascot1.jpg")}
            style={styles.senderAvatar}
          />
          <Text style={styles.senderName}>Finny</Text>
        </View>
      )}
      {points.map((point, pointIdx) => (
        <View
          key={pointIdx}
          style={[
            { flexDirection: "row", alignItems: "flex-start" },
            { opacity: 1 }, // This helps LayoutAnimation track the view
          ]}
        >
          <LinearGradient
            colors={[
              "#1A3D66",
              "#1A3D66",
              "#1A3D66",
              "#1A3D66",
              "#2E5C8F",
              "#4A90E2",
            ]}
            start={{ x: 0.1, y: 1.4 }}
            end={{ x: 0.9, y: 0.6 }}
            style={[
              styles.messageContainer,
              styles.finnyMessageContainer,
              pointIdx > 0 ? { marginTop: 8 } : {},
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
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    maxWidth: "80%",
    padding: 10,
    borderRadius: 14,
    marginVertical: 3,
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginRight: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  finnyMessageContainer: {
    alignSelf: "flex-start",
    marginLeft: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    flex: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: "#fff",
  },
  finnyMessageText: {
    color: "#fff",
  },
  boldText: {
    fontWeight: "600",
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
    marginBottom: 1,
  },
  senderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 10,
    marginRight: 4,
    transform: [{ scaleX: -1 }],
    marginBottom: 4,
  },
  senderName: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },
});

export default ChatMessageComponent;
