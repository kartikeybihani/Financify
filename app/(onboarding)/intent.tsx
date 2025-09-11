import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Animated,
  SafeAreaView,
  Platform,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../_lib/supabase/supabase";

const options = [
  {
    id: "behind",
    label: "Start Growing",
    description: "Get back on track with your finances",
    icon: "trending-up-outline",
    color: "#FF6B35",
  },
  {
    id: "save",
    label: "Save smarter",
    description: "Build wealth with smart strategies",
    icon: "cash-outline",
    color: "#4CAF50",
  },
  {
    id: "overview",
    label: "See everything",
    description: "All your money in one place",
    icon: "apps-outline",
    color: "#4A90E2",
  },
  {
    id: "invest",
    label: "Learn investing",
    description: "Start building your investment portfolio",
    icon: "bar-chart-outline",
    color: "yellow",
  },
  {
    id: "curious",
    label: "Just curious",
    description: "Explore financial possibilities",
    icon: "bulb-outline",
    color: "white",
  },
];

export default function IntentScreen() {
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const scaleAnim = useState(new Animated.Value(1))[0];

  const handleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });

    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.98,
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

  const handleContinue = async () => {
    if (selected.length === 0) return;

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        console.log("Error - Could not get user in the intent screen.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          intents: selected,
        },
      });

      if (updateError) {
        console.log(
          "Error - Could not save your intents in the intent screen."
        );
        return;
      }

      // Navigate to account connection with including selected intents in user metadata
      router.replace("/(onboarding)/accountconnection");
    } catch (err) {
      console.error("Intent update failed:", err);
      Alert.alert("Something went wrong. Try again.");
    }
  };

  const renderOption = (option: (typeof options)[0], index: number) => {
    const isSelected = selected.includes(option.id);

    return (
      <TouchableOpacity
        key={option.id}
        style={[styles.optionCard, isSelected && styles.selectedCard]}
        onPress={() => handleSelect(option.id)}
        activeOpacity={0.8}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={option.icon as any} size={20} color={option.color} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{option.label}</Text>
          <Text style={styles.cardDescription}>{option.description}</Text>
        </View>
        {isSelected && (
          <View style={styles.checkmarkContainer}>
            <View style={styles.checkmarkBackground}>
              <Ionicons name="checkmark" size={16} color="blue" />
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={["#1A1A2E", "#16213E", "#0D1117"]}
        locations={[0, 0.5, 1]}
        style={styles.container}
      >
        <StatusBar barStyle="light-content" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>What brings you here today?</Text>
            <Text style={styles.subtitle}>
              Choose one or more goals to personalize your experience
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            {options.map((option, index) => renderOption(option, index))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              selected.length === 0 && styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={selected.length === 0}
          >
            <LinearGradient
              colors={["#4A90E2", "#5DA0F2"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientButton}
            >
              <Text style={styles.buttonText}>Continue</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1A1A2E",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 70 : 50,
    paddingBottom: 10,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "700",
    textAlign: "left",
    marginBottom: 12,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "left",
    lineHeight: 24,
  },
  optionsContainer: {
    gap: 15,
  },
  optionCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  selectedCard: {
    borderColor: "#4A90E2",
    backgroundColor: "rgba(74, 144, 226, 0.08)",
    shadowOpacity: 0.25,
    elevation: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 3,
    textAlign: "left",
  },
  cardDescription: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 16,
    textAlign: "left",
  },
  checkmarkContainer: {
    marginLeft: 8,
  },
  checkmarkBackground: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 30 : 35,
    paddingTop: 16,
  },
  button: {
    borderRadius: 16,
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  gradientButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
