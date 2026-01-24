import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Font size constants for consistency
const FONTS = {
  xs: 10,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
};

interface FinancialCardProps {
  title: string;
  amount: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
}

export default function FinancialCard({
  title,
  amount,
  icon,
  iconColor = "#4A90E2",
  onPress,
}: FinancialCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardContent}>
        <View
          style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}
        >
          <Ionicons name={icon} size={24} color={iconColor} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.amount}>{amount}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#1f1f1f",
    borderRadius: 16,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    minWidth: 110,
  },
  cardContent: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    width: "100%",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: FONTS.xs,
    color: "#888",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    fontWeight: "500",
    width: "100%",
  },
  amount: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
});
