import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

interface CleanChatHeaderProps {
  rotate?: Animated.AnimatedInterpolation<string>;
  bounce?: Animated.AnimatedInterpolation<number>;
}

export default function CleanChatHeader({
  rotate,
  bounce,
}: CleanChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          paddingTop: insets.top + (Platform.OS === "ios" ? -10 : 8),
        },
      ]}
    >
      <View style={styles.header}>
        {/* Left mascot icon - absolutely positioned */}
        <View style={styles.leftIconContainer}>
          <View style={styles.mascotContainer}>
            <Animated.Image
              source={require("../../../assets/images/mascot1.jpg")}
              style={[
                styles.mascotImage,
                {
                  transform: [
                    { rotate: rotate || "0deg" },
                    { scale: bounce || 1 },
                    { scaleX: -1 },
                    { rotateY: rotate || "0deg" },
                  ],
                },
              ]}
            />
          </View>
        </View>

        {/* Centered text */}
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Finny</Text>
        </View>

        {/* Right icon - absolutely positioned */}
        <TouchableOpacity
          style={styles.rightIconButton}
          onPress={() => router.push("/(tabs)/chat/finny-settings")}
          activeOpacity={0.7}
        >
          <View style={styles.filterButton}>
            <FontAwesome6 name="sliders" size={19} color="#4A90E2" />
          </View>
        </TouchableOpacity>
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
    paddingVertical: 6,
    position: "relative",
    minHeight: 40,
  },
  leftIconContainer: {
    position: "absolute",
    left: 16,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  mascotContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    padding: 2,
    borderWidth: 1.5,
    borderColor: "rgba(74, 144, 226, 0.3)",
    overflow: "hidden",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mascotImage: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
  },
  headerTextContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.3,
  },
  rightIconButton: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26, 61, 102, 0.15)",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
    shadowColor: "#4A90E2",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
});
