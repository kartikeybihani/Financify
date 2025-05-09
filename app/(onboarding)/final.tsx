// app/(onboarding)/final.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase/supabase";

const { width } = Dimensions.get("window");

export default function FinalScreen() {
  const router = useRouter();

  const handleComplete = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          onboarding_complete: true,
        },
      });

      if (error) throw error;

      console.log("Onboarding complete. Navigating to tabs.");

      // Navigate to tabs
      router.replace("/(tabs)");
    } catch (err: any) {
      console.error("Failed to complete onboarding:", err);
      alert("Something went wrong. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1A1A2E", "#16213E", "#0D1117"]}
        style={styles.gradient}
      >
        <Text style={styles.title}>You're all set 🎉</Text>
        <Text style={styles.subtitle}>
          Finny is ready to help you take control of your money.
        </Text>

        <TouchableOpacity style={styles.button} onPress={handleComplete}>
          <LinearGradient
            colors={["#4A90E2", "#5DA0F2"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            <Text style={styles.buttonText}>Let's go</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 40,
    textAlign: "center",
  },
  button: {
    width: width * 0.8,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 3,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
