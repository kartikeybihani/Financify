import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { FontAwesome } from "@expo/vector-icons";

// Font size constants for consistency
const FONTS = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 28,
};

interface AccountItemProps {
  name: string;
  type: string;
  balance: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  bankName?: string;
}

// Card gradient schemes based on account type
const getCardGradient = (type: string) => {
  const normalizedType = type.toLowerCase();

  if (normalizedType.includes("credit")) {
    return {
      colors: ["#4a5fc1", "#5d3e7a"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    };
  }

  if (normalizedType.includes("saving")) {
    return {
      colors: ["#0d7377", "#2bb5a0"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    };
  }

  if (normalizedType.includes("investment")) {
    return {
      colors: ["#c878d8", "#d14356"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    };
  }

  if (normalizedType.includes("loan")) {
    return {
      colors: ["#3b82db", "#0091c7"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    };
  }

  // Default gradient for checking/depository accounts
  return {
    colors: ["#1a759f", "#5aa3c7"] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  };
};

export default function AccountItem({
  name,
  type,
  balance,
  icon,
  iconColor = "#4A90E2",
  bankName,
}: AccountItemProps) {
  const gradient = getCardGradient(type);

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={gradient.colors}
        start={gradient.start}
        end={gradient.end}
        style={styles.card}
      >
        {/* Enhanced pattern overlay with mesh effect */}
        <View style={styles.patternOverlay} />
        <View style={styles.meshPattern} />

        {/* Bank Name - Top Left */}
        {bankName && <Text style={styles.bankNameText}>{bankName}</Text>}

        {/* Bank Icon - Top Right */}
        <View style={styles.bankIconContainer}>
          <FontAwesome
            name={"bank"}
            size={17}
            color="rgba(255, 255, 255, 0.9)"
          />
        </View>

        {/* Card Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.accountInfo}>
            <Text style={styles.accountType}>{type.toUpperCase()}</Text>
            <Text style={styles.accountName} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>BALANCE</Text>
            <Text style={styles.balance}>{balance}</Text>
          </View>
        </View>

        {/* Enhanced visual effects */}
        <View style={styles.shineEffect} />
        <View style={styles.glowEffect1} />
        <View style={styles.glowEffect2} />
        <View style={styles.holographicEffect} />

        {/* Glass morphism border */}
        <View style={styles.glassBorder} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: 12,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    transform: [{ scale: 0.85 }],
  },
  card: {
    width: "100%",
    height: 100,
    borderRadius: 8,
    padding: 14,
    position: "relative",
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
        }
      : {
          elevation: 12,
        }),
  },
  patternOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    opacity: 0.7,
  },
  meshPattern: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    opacity: 0.5,
  },
  bankIconContainer: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    // backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    backdropFilter: "blur(20px)",
    // borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  cardFooter: {
    position: "absolute",
    bottom: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  accountInfo: {
    flex: 1,
    marginRight: 10,
  },
  accountType: {
    fontSize: FONTS.xs,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  accountName: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.95)",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  balanceContainer: {
    alignItems: "flex-end",
    minWidth: 100,
  },
  balanceLabel: {
    fontSize: FONTS.xs,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
    letterSpacing: 0.5,
    marginBottom: 2,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  balance: {
    fontSize: FONTS.base,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.95)",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  shineEffect: {
    position: "absolute",
    top: -30,
    left: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    transform: [{ rotate: "45deg" }],
    opacity: 0.6,
  },
  bankNameText: {
    position: "absolute",
    top: 18,
    left: 14,
    fontSize: FONTS.sm,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  glowEffect1: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    opacity: 0.7,
  },
  glowEffect2: {
    position: "absolute",
    bottom: 20,
    left: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    opacity: 0.6,
  },
  holographicEffect: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    transform: [{ rotate: "45deg" }],
    opacity: 0.8,
  },
  glassBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "transparent",
  },
});
