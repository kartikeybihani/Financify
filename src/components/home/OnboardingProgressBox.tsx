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
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={styles.touchable}
      >
        <LinearGradient
          colors={[
            "#1f1f1f", // Dark gray/black
            "#252525", // Slightly lighter gray
            "#2a2a2a", // Medium gray
            "#1f1f1f", // Back to dark
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBox}
        >
          <View style={styles.content}>
            <View style={styles.leftSection}>
              <View style={styles.labelContainer}>
                <View style={styles.iconWrapper}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={22}
                    color="#4A90E2"
                    style={styles.icon}
                  />
                </View>
                <Text style={styles.label}>Onboarding</Text>
              </View>
            </View>
            <View style={styles.rightSection}>
              <Text style={styles.percentage}>{status.percentage}%</Text>
              {/* <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color="rgba(255, 255, 255, 0.7)"
                />
              </TouchableOpacity> */}
            </View>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <LinearGradient
                colors={["#4A90E2", "#357ABD", "#2E6BA8"]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginBottom: 25,
  },
  touchable: {
    borderRadius: 16,
    overflow: "hidden",
  },
  gradientBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  leftSection: {
    flex: 1,
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(74, 144, 226, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  icon: {
    marginRight: 0,
  },
  label: {
    fontSize: 19,
    fontWeight: "700",
    color: "#fff",
    // fontFamily: "Manrope",
    letterSpacing: 0.5,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  percentage: {
    fontSize: 22,
    fontWeight: "800",
    color: "#4A90E2",
    fontFamily: "Manrope",
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarContainer: {
    marginTop: 4,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 2,
  },
});
