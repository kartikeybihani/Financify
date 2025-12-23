import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet, Image } from "react-native";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  const loadingPulseAnim = useRef(new Animated.Value(1)).current;
  const loadingRingRotate = useRef(new Animated.Value(0)).current;
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
    // Prevent animation from restarting if already started
    if (animationStartedRef.current) {
      return;
    }
    animationStartedRef.current = true;

    // Reset ring rotation to 0 before starting
    loadingRingRotate.setValue(0);

    // Gentle pulse animation for the image
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(loadingPulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Circular ring rotation animation - single rotation from 0 to 100%
    const ringRotation = Animated.timing(loadingRingRotate, {
      toValue: 1,
      duration: duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    
    // Call onComplete when ring rotation finishes
    ringRotation.start((finished) => {
      if (finished && onCompleteRef.current) {
        onCompleteRef.current();
      }
    });

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

    pulseAnimation.start();
    dotsAnimation.start();

    return () => {
      pulseAnimation.stop();
      ringRotation.stop();
      dotsAnimation.stop();
      animationStartedRef.current = false;
    };
  }, [duration]); // Only depend on duration to prevent re-running

  // Calculate circle properties for SVG
  const ringRadius = 107; // (220 - 6) / 2, accounting for 3px border width
  const circumference = 2 * Math.PI * ringRadius;
  
  // Animate stroke-dashoffset from full circumference to 0
  // This creates the effect of the arc growing from 0% to 100%
  const strokeDashoffset = loadingRingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0], // Start with full offset (invisible), end with 0 (full circle)
  });

  return (
    <View style={styles.container}>
      <View style={styles.imageWrapper}>
        {/* SVG Circular Progress Ring */}
        <Svg
          width={220}
          height={220}
          style={styles.svgContainer}
        >
          {/* Background circle (full, semi-transparent) */}
          <Circle
            cx={110}
            cy={110}
            r={ringRadius}
            stroke={hexToRgba(color, 0.2)}
            strokeWidth={3}
            fill="none"
          />
          {/* Progress circle (grows from 6 o'clock clockwise) */}
          <AnimatedCircle
            cx={110}
            cy={110}
            r={ringRadius}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 110 110)`} // Rotate to start from 6 o'clock (bottom)
            origin="110, 110"
          />
        </Svg>
        {/* Rounded image */}
        <Animated.View
          style={[
            styles.loadingImageContainer,
            {
              transform: [{ scale: loadingPulseAnim }],
              borderColor: hexToRgba(color, 0.25),
            },
          ]}
        >
          <Image
            source={
              imageSource || require("../../../assets/images/finnylap1.png")
            }
            style={styles.loadingImage}
            resizeMode="cover"
          />
        </Animated.View>
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
