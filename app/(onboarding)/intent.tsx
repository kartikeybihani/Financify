import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

const options = [
  { id: "save", label: "I want to save for something" },
  { id: "lost", label: "I feel lost with money" },
  { id: "overview", label: "I want to see everything in one place" },
  { id: "curious", label: "Just curious" },
];

export default function IntentScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();

  const handleContinue = () => {
    if (!selected) return;
    router.push({
      pathname: "/(auth)/signup",
      params: { intent: selected },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <Text style={styles.title}>What do you want help with?</Text>

      <ScrollView
        contentContainerStyle={styles.optionList}
        showsVerticalScrollIndicator={false}
      >
        {options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.option,
              selected === option.id && styles.selectedOption,
            ]}
            onPress={() => setSelected(option.id)}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.optionText,
                selected === option.id && styles.selectedOptionText,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={!selected}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    marginTop: 40,
    marginBottom: 40,
  },
  optionList: {
    width: "100%",
    alignItems: "center",
  },
  option: {
    backgroundColor: "#1f1f1f",
    borderColor: "#333",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
    width: "100%",
  },
  selectedOption: {
    borderColor: "#4A90E2",
    backgroundColor: "#2a2a2a",
  },
  optionText: {
    color: "#ccc",
    fontSize: 16,
    textAlign: "center",
  },
  selectedOptionText: {
    color: "#4A90E2",
    fontWeight: "600",
  },
  button: {
    marginTop: 30,
    backgroundColor: "#4A90E2",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 32,
    marginBottom: 30,
  },
  buttonDisabled: {
    backgroundColor: "#444",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
