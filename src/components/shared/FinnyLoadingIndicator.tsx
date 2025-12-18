import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet, Image } from "react-native";

interface FinnyLoadingIndicatorProps {
  message?: string;
  color?: string;
  imageSource?: any;
}

const FinnyLoadingIndicator: React.FC<FinnyLoadingIndicatorProps> = ({
  message = "Loading...",
  color = "#4A90E2",
  imageSource,
}) => {
  const loadingDotAnimations = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;
  const loadingPulseAnim = useRef(new Animated.Value(1)).current;
  const loadingRingRotate = useRef(new Animated.Value(0)).current;

  // Helper to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  useEffect(() => {
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

    // Circular ring rotation animation
    const ringRotation = Animated.loop(
      Animated.timing(loadingRingRotate, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

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
    ringRotation.start();
    dotsAnimation.start();

    return () => {
      pulseAnimation.stop();
      ringRotation.stop();
      dotsAnimation.stop();
    };
  }, [loadingPulseAnim, loadingRingRotate, loadingDotAnimations]);

  const ringRotationDegrees = loadingRingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container}>
      <View style={styles.imageWrapper}>
        {/* Circular loading ring */}
        <Animated.View
          style={[
            styles.loadingRing,
            {
              transform: [{ rotate: ringRotationDegrees }],
              borderTopColor: color,
              borderRightColor: hexToRgba(color, 0.5),
            },
          ]}
        >
          <Animated.View
            style={[
              styles.loadingRingInner,
              {
                borderBottomColor: hexToRgba(color, 0.3),
                borderLeftColor: hexToRgba(color, 0.6),
              },
            ]}
          />
        </Animated.View>
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
  loadingRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
  },
  loadingRingInner: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    top: 8,
    left: 8,
  },
  loadingImageContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
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
