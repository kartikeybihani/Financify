// components/home/FinnyMessage.tsx

import React, { useMemo } from "react";
import { View, Text, Image } from "react-native";
import { styles } from "@/src/styles/homeStyles";

export const FinnyMessage: React.FC = React.memo(() => {
  // Add encouraging messages array
  const encouragingMessages = [
    "Keep going! You got this bro 💪",
    "Making progress every day! 🚀",
    "You're crushing it! 🔥",
    "Small steps, big results 🎯",
    "Building wealth, one day at a time 💎",
    "Stay focused, stay winning 🏆",
    "Your future self will thank you 🙌",
    "Financial freedom, here we come! 💫",
  ];

  // Get random message (memoized to prevent re-renders)
  const randomMessage = useMemo(
    () =>
      encouragingMessages[
        Math.floor(Math.random() * encouragingMessages.length)
      ],
    []
  );

  return (
    <View style={styles.finnyMessageContainer}>
      <View style={styles.finnyMessage}>
        <View style={styles.finnyIconContainer}>
          <Image
            source={require("../../../assets/images/finny2.png")}
            style={{
              width: 55,
              height: 70,
              borderRadius: 20,
              resizeMode: "contain",
              // transform: [{ scaleX: -1 }, { rotate: "0deg" }],
            }}
          />
        </View>
        <View style={styles.finnyMessageContent}>
          <Text style={styles.finnyMessageTitle}>Daily Progress</Text>
          <Text style={styles.finnyMessageText}>{randomMessage}</Text>
        </View>
      </View>
    </View>
  );
});

FinnyMessage.displayName = "FinnyMessage";
