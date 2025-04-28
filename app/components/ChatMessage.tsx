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
        {message.text.split(/(\*[^*]+\*)/).map((chunk, idx) => {
          if (chunk.startsWith("*")) {
            const innerText = chunk.slice(1, -1);
            return innerText.split(/(\d+)/).map((part, partIdx) =>
              /\d+/.test(part) ? (
                <Text
                  key={`${message.id}-bold-${idx}-${partIdx}`}
                  style={{ fontWeight: "bold" }}
                >
                  {part}
                </Text>
              ) : (
                <Text key={`${message.id}-text-${idx}-${partIdx}`}>{part}</Text>
              )
            );
          } else if (chunk.startsWith("$")) {
            return (
              <Text key={`${message.id}-money-${idx}`} style={styles.chatMoney}>
                {chunk}
              </Text>
            );
          } else {
            return <Text key={`${message.id}-text-${idx}`}>{chunk}</Text>;
          }
        })}
      </Text>
    </View>
  );
};

export default ChatMessageComponent;
