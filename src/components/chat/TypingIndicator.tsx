import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Image, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface TypingIndicatorProps {
  progressStatus?: string;
}

const TypingIndicator = ({ progressStatus }: TypingIndicatorProps) => {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const skeletonAnim = useRef(new Animated.Value(0)).current;
  const skeletonAnim2 = useRef(new Animated.Value(0)).current;
  const skeletonAnim3 = useRef(new Animated.Value(0)).current;
  const textSlideAnim = useRef(new Animated.Value(0)).current;
  const prevProgressStatusRef = useRef<string>(progressStatus || "");

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

    // Skeleton animations with different timing
    Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(skeletonAnim2, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonAnim2, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(skeletonAnim3, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonAnim3, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, []);

  // Animate progress status text sliding from bottom to top when it changes
  useEffect(() => {
    const currentStatus = progressStatus || "";
    if (
      currentStatus !== prevProgressStatusRef.current &&
      currentStatus !== ""
    ) {
      // Reset animation to start from bottom
      textSlideAnim.setValue(15);

      // Animate to top
      Animated.timing(textSlideAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();

      // Update ref
      prevProgressStatusRef.current = currentStatus;
    }
  }, [progressStatus]);

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
            source={require("../../../assets/images/mascot1.jpg")}
            style={styles.senderAvatar}
          />
          <View style={styles.avatarGlow} />
        </View>
        <Text style={styles.senderName}>Finny</Text>
      </View>

      {/* Combined Typing Indicator - shows either progress or thinking */}
      <LinearGradient
        colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
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
            <Animated.View
              style={{
                transform: [{ translateY: textSlideAnim }],
              }}
            >
              <Text style={styles.thinkingText}>
                {progressStatus || "Thinking..."}
              </Text>
            </Animated.View>
          </View>
        </View>
      </LinearGradient>

      {/* Skeleton Message Bubble */}
      <View style={styles.skeletonContainer}>
        <LinearGradient
          colors={["#1A3A5A", "#2E5A8A", "#4A90E2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.messageContainer,
            styles.finnyMessageContainer,
            styles.skeletonBubble,
          ]}
        >
          <View style={styles.messageContent}>
            <View style={styles.skeletonContent}>
              <Animated.View
                style={[
                  styles.skeletonLine,
                  styles.skeletonLine1,
                  {
                    opacity: skeletonAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.2, 0.8],
                    }),
                    transform: [
                      {
                        scaleX: skeletonAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.95, 1.05],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.skeletonLine,
                  styles.skeletonLine2,
                  {
                    opacity: skeletonAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 0.9],
                    }),
                    transform: [
                      {
                        scaleX: skeletonAnim2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1.1],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.skeletonLine,
                  styles.skeletonLine3,
                  {
                    opacity: skeletonAnim3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.25, 0.75],
                    }),
                    transform: [
                      {
                        scaleX: skeletonAnim3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.85, 1.15],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
          </View>
        </LinearGradient>
      </View>
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
  skeletonContainer: {
    marginTop: 8,
    alignSelf: "flex-start",
    marginLeft: 4,
  },
  skeletonBubble: {
    marginTop: 2,
    minWidth: 250,
  },
  skeletonContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 7,
    marginBottom: 10,
  },
  skeletonLine1: {
    width: "95%",
  },
  skeletonLine2: {
    width: "85%",
  },
  skeletonLine3: {
    width: "65%",
  },
});

export default TypingIndicator;
