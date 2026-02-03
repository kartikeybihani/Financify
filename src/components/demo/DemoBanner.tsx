import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useDemoMode } from "@/src/contexts/DemoContext";

export default function DemoBanner() {
  const { isDemoMode, leaveDemoMode } = useDemoMode();

  if (!isDemoMode) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>You're viewing demo data</Text>
      <TouchableOpacity onPress={leaveDemoMode} style={styles.leaveButton}>
        <Text style={styles.leaveButtonText}>Leave demo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(74, 144, 226, 0.3)",
  },
  bannerText: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
  },
  leaveButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  leaveButtonText: {
    fontSize: 14,
    color: "#4A90E2",
    fontWeight: "600",
  },
});
