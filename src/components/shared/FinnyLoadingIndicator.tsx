import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet, Image } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface FinnyLoadingIndicatorProps {
  message?: string;
  color?: string;
  imageSource?: any;
  onComplete?: () => void;
  duration?: number;
}

const FinnyLoadingIndicator: React.FC<FinnyLoadingIndicatorProps> = ({
  message = "Loading...",
  color = "#4A90E2",
  imageSource,
  onComplete,
  duration = 2000,
}) => {
  const loadingDotAnimations = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;
  const ringRotateAnim = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  const animationStartedRef = useRef(false);

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Update onComplete ref when it changes
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (animationStartedRef.current) {
      return;
    }
    animationStartedRef.current = true;

    ringRotateAnim.setValue(0);

    // Ring spins around the image (continuous rotation)
    const ringRotation = Animated.loop(
      Animated.timing(ringRotateAnim, {
        toValue: 1,
        duration: duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const onCompleteTimeout = setTimeout(() => {
      onCompleteRef.current?.();
    }, duration);

    // Dots animation
    const dotsAnimation = Animated.loop(
      Animated.parallel(
        loadingDotAnimations.map((anim, index) =>
          Animated.sequence([
            Animated.delay(index * 150),
            Animated.timing(anim, {
              toValue: 1,
              duration: 500,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.3,
              duration: 500,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ])
        )
      )
    );

    ringRotation.start();
    dotsAnimation.start();

    return () => {
      clearTimeout(onCompleteTimeout);
      ringRotation.stop();
      dotsAnimation.stop();
      animationStartedRef.current = false;
    };
  }, [duration]);

  const ringRadius = 107;
  const circumference = 2 * Math.PI * ringRadius;
  const segmentLength = circumference * 0.25;

  const rotationDegrees = ringRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.imageWrapper}>
        <Svg width={220} height={220} style={styles.svgContainer}>
          <Circle
            cx={110}
            cy={110}
            r={ringRadius}
            stroke={hexToRgba(color, 0.2)}
            strokeWidth={3}
            fill="none"
          />
        </Svg>
        <Animated.View
          style={[
            styles.ringWrapper,
            {
              transform: [{ rotate: rotationDegrees }],
            },
          ]}
          pointerEvents="none"
        >
          <Svg width={220} height={220} style={styles.ringSvg}>
            <Circle
              cx={110}
              cy={110}
              r={ringRadius}
              stroke={color}
              strokeWidth={3}
              fill="none"
              strokeDasharray={`${segmentLength} ${
                circumference - segmentLength
              }`}
              strokeLinecap="round"
              transform="rotate(-90 110 110)"
            />
          </Svg>
        </Animated.View>
        <View
          style={[
            styles.loadingImageContainer,
            { borderColor: hexToRgba(color, 0.25) },
          ]}
        >
          <Image
            source={
              imageSource || require("../../../assets/images/finnylap1.png")
            }
            style={styles.loadingImage}
            resizeMode="cover"
          />
        </View>
      </View>
      <Text style={styles.loadingText}>{message}</Text>
      <View style={styles.loadingDotsContainer}>
        {loadingDotAnimations.map((anim, index) => (
          <Animated.View
            key={index}
            style={[
              styles.loadingDot,
              {
                opacity: anim,
                backgroundColor: color,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 20,
  },
  imageWrapper: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  svgContainer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  ringWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 220,
    height: 220,
  },
  ringSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  loadingImageContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
    borderWidth: 3,
  },
  loadingImage: {
    width: "100%",
    height: "100%",
  },
  loadingText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
  },
  loadingDotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4A90E2",
  },
});

export default FinnyLoadingIndicator;
