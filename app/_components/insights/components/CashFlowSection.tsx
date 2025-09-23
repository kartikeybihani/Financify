import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function CashFlowSection() {
  return (
    <View style={styles.container}>
      <View style={styles.placeholderContainer}>
        <Ionicons name="analytics-outline" size={48} color="#4A90E2" />
        <Text style={styles.placeholderTitle}>Cash Flow Analysis</Text>
        <Text style={styles.placeholderText}>
          Coming soon! We're working on bringing you detailed cash flow insights
          including income trends, expense patterns, and monthly comparisons.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  placeholderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    marginTop: 16,
    marginBottom: 12,
    textAlign: "center",
  },
  placeholderText: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
  },
});
