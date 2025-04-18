import React from "react";
import { View, Animated } from "react-native";
import styles from "../styles/finnyStyles";

interface TypingIndicatorProps {
  dotAnimations: Animated.Value[];
}

export const TypingIndicator = ({ dotAnimations }: TypingIndicatorProps) => {
  return (
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
  );
};

export default TypingIndicator;
