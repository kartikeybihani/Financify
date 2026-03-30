import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

interface BrandFlashOverlayProps {
  mode: "static" | "animate" | "fadeOut";
  onAnimationComplete?: () => void;
  onFadeOutComplete?: () => void;
  reduceMotionEnabled?: boolean;
  rotateMs?: number;
  fadeMs?: number;
}

const REDUCED_MOTION_FADE_MS = 220;
const REDUCED_MOTION_START_DELAY_MS = 20;

export default function BrandFlashOverlay({
  mode,
  onAnimationComplete,
  onFadeOutComplete,
  reduceMotionEnabled = false,
  rotateMs = 450,
  fadeMs = 120,
}: BrandFlashOverlayProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const handledModeRef = useRef<string>("");
  const reducedMotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const stopAllAnimations = useCallback(() => {
    if (reducedMotionTimerRef.current) {
      clearTimeout(reducedMotionTimerRef.current);
      reducedMotionTimerRef.current = null;
    }
    rotation.stopAnimation();
    opacity.stopAnimation();
  }, [opacity, rotation]);

  useEffect(() => {
    if (handledModeRef.current === mode) return;
    handledModeRef.current = mode;

    if (mode === "static") {
      stopAllAnimations();
      rotation.setValue(0);
      opacity.setValue(1);
      return;
    }

    if (mode === "animate") {
      stopAllAnimations();
      rotation.setValue(0);
      opacity.setValue(1);

      if (reduceMotionEnabled) {
        reducedMotionTimerRef.current = setTimeout(() => {
          onAnimationComplete?.();
        }, REDUCED_MOTION_START_DELAY_MS + REDUCED_MOTION_FADE_MS);
        return;
      }

      Animated.timing(rotation, {
        toValue: 1,
        duration: rotateMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onAnimationComplete?.();
        }
      });
      return;
    }

    if (mode === "fadeOut") {
      stopAllAnimations();
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduceMotionEnabled ? REDUCED_MOTION_FADE_MS : fadeMs,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onFadeOutComplete?.();
        }
      });
      return;
    }
  }, [
    fadeMs,
    mode,
    onAnimationComplete,
    onFadeOutComplete,
    opacity,
    reduceMotionEnabled,
    rotateMs,
    rotation,
    stopAllAnimations,
  ]);

  useEffect(() => {
    return () => {
      stopAllAnimations();
    };
  }, [stopAllAnimations]);

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
