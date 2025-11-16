import React from "react";
import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

interface IconButtonProps {
  onPress: () => void;
  icon: "close" | "chevron-back" | "chevron-back-sharp";
  size?: number;
  style?: ViewStyle;
  activeOpacity?: number;
}

export default function IconButton({
  onPress,
  icon,
  size = 22,
  style,
  activeOpacity = 0.7,
}: IconButtonProps) {
  // Scale circle size proportionally with icon size (ratio of ~1.8x)
  const circleSize = size * 1.8;
  const borderRadius = circleSize / 2;
  const padding = size * 0.4;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[{ padding }, style]}
      activeOpacity={activeOpacity}
    >
      <LinearGradient
        colors={["rgba(255, 255, 255, 0.15)", "rgba(255, 255, 255, 0.05)"]}
        style={[
          styles.closeButtonCircle,
          {
            width: circleSize,
            height: circleSize,
            borderRadius: borderRadius,
          },
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name={icon} size={size} color="#fff" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  closeButtonCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
});
