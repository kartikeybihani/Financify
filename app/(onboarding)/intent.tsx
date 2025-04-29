import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ScrollView,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

const options = [
  {
    id: "save",
    label: "I want to save for something",
    icon: "wallet-outline",
    description: "Set goals and track your savings progress",
  },
  {
    id: "lost",
    label: "I feel lost with money",
    icon: "compass-outline",
    description: "Get personalized guidance and insights",
  },
  {
    id: "overview",
    label: "I want to see everything in one place",
    icon: "grid-outline",
    description: "Connect all your accounts in one dashboard",
  },
];

export default function IntentScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();
  const scaleAnim = new Animated.Value(1);

  const handleSelect = (id: string) => {
    setSelected(id);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

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

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>What do you want help with?</Text>
        <Text style={styles.subtitle}>
          Choose what best describes your financial goals
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.optionList}
        showsVerticalScrollIndicator={false}
      >
        {options.map((option) => (
          <Animated.View
            key={option.id}
            style={[
              {
                transform: [{ scale: selected === option.id ? scaleAnim : 1 }],
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.option,
                selected === option.id && styles.selectedOption,
              ]}
              onPress={() => handleSelect(option.id)}
              activeOpacity={0.9}
            >
              <View style={styles.optionContent}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={option.icon as any}
                    size={24}
                    color={selected === option.id ? "#4A90E2" : "#666"}
                  />
                </View>
                <View style={styles.textContainer}>
                  <Text
                    style={[
                      styles.optionText,
                      selected === option.id && styles.selectedOptionText,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {option.description}
                  </Text>
                </View>
                {selected === option.id && (
                  <View style={styles.checkmarkContainer}>
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color="#4A90E2"
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, !selected && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selected}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>Continue</Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color="#fff"
            style={styles.buttonIcon}
          />
        </TouchableOpacity>
      </View>
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
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 40,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
  },
  optionList: {
    width: "100%",
    alignItems: "center",
    paddingBottom: 20,
  },
  option: {
    backgroundColor: "#1f1f1f",
    borderColor: "#333",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    width: "100%",
  },
  selectedOption: {
    borderColor: "#4A90E2",
    backgroundColor: "#2a2a2a",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  optionText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  optionDescription: {
    color: "#888",
    fontSize: 14,
  },
  selectedOptionText: {
    color: "#4A90E2",
  },
  checkmarkContainer: {
    marginLeft: 8,
  },
  footer: {
    paddingBottom: 30,
    alignItems: "center",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4A90E2",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 32,
    minWidth: 200,
  },
  buttonDisabled: {
    backgroundColor: "#444",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 8,
  },
  buttonIcon: {
    marginLeft: 4,
  },
});
