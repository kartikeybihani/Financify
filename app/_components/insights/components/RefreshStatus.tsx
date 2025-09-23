import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

interface Props {
  message: string;
}

export default function RefreshStatus({ message }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="small" color="#4A90E2" />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "rgba(74, 144, 226, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.1)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  message: {
    fontSize: 13,
    color: "#4A90E2",
    fontWeight: "500",
    flex: 1,
  },
});
