import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const TypingIndicator = () => {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Dot animations
    const animations = dots.map((dot, index) =>
      Animated.sequence([
        Animated.delay(index * 150),
        Animated.loop(
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 600,
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
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }],
      }}
    >
      <View style={styles.senderInfo}>
        <View style={styles.avatarContainer}>
          <Image
            source={require("../assets/mascot1.jpg")}
            style={styles.senderAvatar}
          />
          <View style={styles.avatarGlow} />
        </View>
        <Text style={styles.senderName}>Finny</Text>
      </View>
      <LinearGradient
        colors={["#4A90E2", "#357ABD", "#2E6BB8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.messageContainer, styles.finnyMessageContainer]}
      >
        <View style={styles.messageContent}>
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
                          outputRange: [0.8, 1.2],
                        }),
                      },
                    ],
                    opacity: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                  },
                ]}
              />
            ))}
            <Text style={styles.thinkingText}>Thinking...</Text>
          </View>
        </View>
      </LinearGradient>
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
  },
  messageContent: {
    borderRadius: 16,
    overflow: "hidden",
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
    marginHorizontal: 3,
    shadowColor: "#fff",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  thinkingText: {
    color: "#fff",
    marginLeft: 12,
    fontSize: 14,
    opacity: 0.8,
    fontWeight: "400",
    letterSpacing: 0.3,
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

export default TypingIndicator;
