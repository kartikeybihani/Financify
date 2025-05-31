import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Font size constants for consistency
const FONTS = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
};

interface AccountItemProps {
  name: string;
  type: string;
  balance: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}

export default function AccountItem({
  name,
  type,
  balance,
  icon,
  iconColor = "#4A90E2",
}: AccountItemProps) {
  return (
    <View style={styles.container}>
      <View
        style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.details}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.type}>{type}</Text>
      </View>
      <Text style={styles.balance}>{balance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  details: {
    flex: 1,
    marginLeft: 10,
  },
  name: {
    fontSize: FONTS.base,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 1,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  type: {
    fontSize: FONTS.sm,
    color: "#888",
    textTransform: "capitalize",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  balance: {
    fontSize: FONTS.base,
    fontWeight: "600",
    color: "#4A90E2",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
});
