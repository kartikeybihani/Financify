import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const TypingIndicator = () => {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.sequence([
        Animated.delay(index * 200),
        Animated.loop(
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        ),
      ])
    );

    Animated.parallel(animations).start();

    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, []);

  return (
    <View>
      <Text style={styles.senderName}>Finny</Text>
      <LinearGradient
        colors={["#4A90E2", "#2E5C8F", "#1A3D66"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.messageContainer, styles.finnyMessageContainer]}
      >
        <View style={styles.dotsContainer}>
          {dots.map((dot, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  transform: [
                    {
                      scale: dot.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.5],
                      }),
                    },
                  ],
                  opacity: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                },
              ]}
            />
          ))}
          <Text style={styles.thinkingText}>Thinking</Text>
        </View>
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
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    marginHorizontal: 2,
  },
  thinkingText: {
    color: "#fff",
    marginLeft: 8,
    fontSize: 14,
    opacity: 0.8,
  },
  senderName: {
    fontSize: 12,
    color: "#888",
    marginLeft: 8,
    marginBottom: 2,
  },
});

export default TypingIndicator;
