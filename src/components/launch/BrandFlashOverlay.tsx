import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

interface BrandFlashOverlayProps {
  onComplete: () => void;
  reduceMotionEnabled?: boolean;
  rotateMs?: number;
  fadeMs?: number;
}

const REDUCED_MOTION_FADE_MS = 220;
const REDUCED_MOTION_START_DELAY_MS = 20;

export default function BrandFlashOverlay({
  onComplete,
  reduceMotionEnabled = false,
  rotateMs = 450,
  fadeMs = 120,
}: BrandFlashOverlayProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let reducedMotionTimer: ReturnType<typeof setTimeout> | null = null;

    if (reduceMotionEnabled) {
      reducedMotionTimer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: REDUCED_MOTION_FADE_MS,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            onComplete();
          }
        });
      }, REDUCED_MOTION_START_DELAY_MS);
    } else {
      Animated.sequence([
        Animated.timing(rotation, {
          toValue: 1,
          duration: rotateMs,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: fadeMs,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          onComplete();
        }
      });
    }

    return () => {
      if (reducedMotionTimer) {
        clearTimeout(reducedMotionTimer);
      }
      rotation.stopAnimation();
      opacity.stopAnimation();
    };
  }, [fadeMs, onComplete, opacity, reduceMotionEnabled, rotateMs, rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container} pointerEvents="auto">
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity,
            transform: reduceMotionEnabled ? [] : [{ rotate }],
          },
        ]}
      >
        <Image
          source={require("../../../assets/images/main1.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0A0E14",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logoContainer: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 200,
    height: 200,
  },
});
