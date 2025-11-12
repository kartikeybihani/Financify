import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { AntDesign } from "@expo/vector-icons";

export default function CashFlowSection() {
  return (
    <View style={styles.container}>
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateContent}>
          <View style={styles.emptyStateIconContainer}>
            <AntDesign name="line-chart" size={64} color="#4A90E2" />
          </View>
          <Text style={styles.emptyStateTitle}>Cash Flow Analysis</Text>
          <Text style={styles.emptyStateMessage}>
            Coming soon! We're working on bringing you detailed cash flow
            insights including income trends, expense patterns, and monthly
            comparisons.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyStateContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyStateContent: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 320,
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateMessage: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
});
