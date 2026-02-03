import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDemoMode } from "@/src/contexts/DemoContext";

export default function CleanGoalsHeader() {
  const insets = useSafeAreaInsets();
  const { isDemoMode } = useDemoMode();

  return (
    <LinearGradient
      colors={
        [
          "rgba(74, 145, 226, 0.45)",
          "rgba(53, 120, 255, 0.26)",
          "transparent",
        ] as const
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.gradientContainer,
        {
          paddingTop: isDemoMode
            ? Platform.OS === "ios"
              ? 8
              : 12
            : insets.top + (Platform.OS === "ios" ? 0 : 8),
        },
      ]}
    >
      <View style={styles.header}>
        {/* Left icon - absolutely positioned */}
        <View style={styles.leftIconContainer}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name="target" size={24} color="#4A90E2" />
          </View>
        </View>

        {/* Centered text */}
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Goals</Text>
        </View>

        {/* Right spacer for balance */}
        <View style={styles.rightSpacer} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    paddingBottom: 4,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    position: "relative",
    minHeight: 50,
  },
  leftIconContainer: {
    position: "absolute",
    left: 20,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  headerTextContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 19,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  rightSpacer: {
    position: "absolute",
    right: 20,
    width: 40, // Match icon container width for balance
  },
});
