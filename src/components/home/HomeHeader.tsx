// components/home/HomeHeader.tsx

import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "@/src/styles/homeStyles";

interface HomeHeaderProps {
  userName?: string;
  onAddAccount?: () => void;
}

export const HomeHeader: React.FC<HomeHeaderProps> = React.memo(
  ({ userName, onAddAccount }) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();

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
          {/* Left icon - absolutely positioned */}
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={styles.leftIconButton}
          >
            <View style={styles.headerIconContainer}>
              <Feather name="menu" size={24} color="#4A90E2" />
            </View>
          </TouchableOpacity>

          {/* Centered text */}
          <View style={styles.headerTextContainer}>
            <Text style={styles.greetingText}>Hi {userName || "there"}</Text>
            <Text style={styles.subGreeting}>Welcome Back!</Text>
          </View>

          {/* Right icon - absolutely positioned */}
          {onAddAccount && (
            <TouchableOpacity
              onPress={onAddAccount}
              style={styles.rightIconButton}
            >
              <MaterialCommunityIcons
                name="bank-plus"
                size={28}
                color="#4A90E2"
              />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>
    );
  },
);

HomeHeader.displayName = "HomeHeader";
