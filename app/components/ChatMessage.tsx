import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

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

  return (
    <View>
      {showSender && <Text style={styles.senderName}>Finny</Text>}
      <LinearGradient
        colors={["#4A90E2", "#2E5C8F", "#1A3D66"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.messageContainer, styles.finnyMessageContainer]}
      >
        <Text style={[styles.messageText, styles.finnyMessageText]}>
          {message.text.split(/(\*[^*]+\*)/).map((chunk, idx) => {
            if (chunk.startsWith("*") && chunk.endsWith("*")) {
              return (
                <Text key={idx} style={styles.boldText}>
                  {chunk.slice(1, -1)}
                </Text>
              );
            }
            return chunk;
          })}
        </Text>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  messageContainer: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
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
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
    fontWeight: "700",
  },
  senderName: {
    fontSize: 12,
    color: "#888",
    marginLeft: 8,
    marginBottom: 2,
  },
});

export default ChatMessageComponent;
