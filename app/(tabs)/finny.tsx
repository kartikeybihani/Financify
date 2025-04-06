import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function FinnyScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>🤖 Welcome to Finny, your WealthBot!</Text>
      <Text style={styles.subtext}>
        Chat interface and 30-year plan will go here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  text: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  subtext: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
  },
});
