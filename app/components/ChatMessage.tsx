import React from "react";
import { View, Text } from "react-native";
import { ChatMessage } from "../types/finny";
import styles from "../styles/finnyStyles";

interface ChatMessageProps {
  message: ChatMessage;
}

export const ChatMessageComponent = ({ message }: ChatMessageProps) => {
  return (
    <View
      style={[
        styles.chatBubble,
        message.sender === "user" ? styles.chatRight : styles.chatLeft,
      ]}
    >
      <Text style={styles.chatText}>
        {message.text.split(/\b(\$\d[\d,\.]*)\b/).map((chunk, idx) =>
          chunk.startsWith("$") ? (
            <Text key={`${message.id}-money-${idx}`} style={styles.chatMoney}>
              {chunk}
            </Text>
          ) : (
            <Text key={`${message.id}-text-${idx}`}>{chunk}</Text>
          )
        )}
      </Text>
    </View>
  );
};

export default ChatMessageComponent;
