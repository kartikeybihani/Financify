import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

interface TypingIndicatorProps {
  progressStatus?: string;
}

const DOT_SIZE = 5;

const TypingIndicator = ({ progressStatus }: TypingIndicatorProps) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(6)).current;
  const dotAnims = useRef([
    useRef(new Animated.Value(0.35)).current,
    useRef(new Animated.Value(0.35)).current,
    useRef(new Animated.Value(0.35)).current,
  ]).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loops = dotAnims.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(dot, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.35,
            duration: 360,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [dotAnims, fadeAnim, translateAnim]);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity: fadeAnim,
          transform: [{ translateY: translateAnim }],
        },
      ]}
    >
      <View style={styles.indicator}>
        <View style={styles.leadingMark} />
        <Text numberOfLines={1} style={styles.label}>
          {progressStatus || "Finny is thinking"}
        </Text>
        <View style={styles.dots}>
          {dotAnims.map((dot, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  opacity: dot,
                  transform: [
                    {
                      scale: dot.interpolate({
                        inputRange: [0.35, 1],
                        outputRange: [0.92, 1.18],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: 14,
  },
  indicator: {
    alignSelf: "flex-start",
    maxWidth: "90%",
    minHeight: 34,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    flexDirection: "row",
    alignItems: "center",
  },
  leadingMark: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#5E9BFF",
    marginRight: 10,
  },
  label: {
    flexShrink: 1,
    color: "#D4DBE7",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
    gap: 4,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: "#8EB8FF",
  },
});

export default TypingIndicator;
