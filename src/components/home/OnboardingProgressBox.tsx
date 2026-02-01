import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { OnboardingStatus } from "@/src/utils/onboarding/onboardingProgress";

interface OnboardingProgressBoxProps {
  status: OnboardingStatus;
  onPress: () => void;
  onDismiss: () => void;
}

export function OnboardingProgressBox({
  status,
  onPress,
  onDismiss,
}: OnboardingProgressBoxProps) {
  if (!status.shouldShow || status.isComplete) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.touchable}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.9}
          style={styles.mainTouchable}
        >
          <LinearGradient
            colors={[
              "#1a3a5c", // Brighter blue-gray
              "#2a4a7c", // Medium blue
              "#3a5a9c", // Lighter blue
              "#2a4a7c", // Back to medium
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBox}
          >
            <View style={styles.content}>
              <View style={styles.leftSection}>
                <View style={styles.labelContainer}>
                  <View style={styles.textContainer}>
                    <Text style={styles.label}>Onboarding</Text>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>Complete your setup</Text>
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.rightSection}>
                {/* <Text style={styles.percentage}>{status.percentage}%</Text> */}
              </View>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBackground}>
                <LinearGradient
                  colors={["#B8D4F0", "#C5D9F0", "#B8D4F0"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.progressBarFill,
                    { width: `${status.percentage}%` },
                  ]}
                />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onDismiss}
          hitSlop={{ top: 25, bottom: 25, left: 25, right: 25 }}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginBottom: 20,
  },
  touchable: {
    borderRadius: 20,
    overflow: "visible",
    position: "relative",
  },
  mainTouchable: {
    borderRadius: 20,
    overflow: "hidden",
  },
  gradientBox: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(91, 163, 255, 0.4)",
    paddingVertical: 14,
    paddingHorizontal: 24,
    shadowColor: "#5BA3FF",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  leftSection: {
    flex: 1,
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  textContainer: {
    flex: 1,
    gap: 8,
  },
  label: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(91, 163, 255, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 0.2,
    // textTransform: "uppercase",
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginRight: 15,
  },
  percentage: {
    fontSize: 28,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 15,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    // backgroundColor: "rgba(0, 0, 0, 0.2)",
    zIndex: 10,
  },
  progressBarContainer: {
    marginTop: 6,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
    shadowColor: "#5BA3FF",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
  },
});
