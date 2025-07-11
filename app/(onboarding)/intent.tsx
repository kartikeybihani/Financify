import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
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
import { supabase } from "../lib/supabase/supabase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48 - 16) / 2; // 48 for padding, 16 for gap

const options = [
  {
    id: "behind",
    label: "Start Growing",
    description: "Get back on track with your finances",
    icon: "trending-up-outline",
    gradient: ["#FF512F", "#F09819"] as const,
  },
  {
    id: "save",
    label: "Save smarter",
    description: "Build wealth with smart strategies",
    icon: "wallet-outline",
    gradient: ["#36D1C4", "#11998E"] as const,
  },
  {
    id: "overview",
    label: "See everything",
    description: "All your money in one place",
    icon: "apps-outline",
    gradient: ["#43CEA2", "#185A9D"] as const,
  },
  {
    id: "curious",
    label: "Just curious",
    description: "Explore financial possibilities",
    icon: "help-circle-outline",
    gradient: ["#8E2DE2", "#4A00E0"] as const,
  },
];

export default function IntentScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams();
  const scaleAnim = useState(new Animated.Value(1))[0];

  // useEffect(() => {
  //   console.log("[Intent] params: ", params);
  // }, [params]);

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

  const handleContinue = async () => {
    if (!selected) return;

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
          intent: selected,
        },
      });

      if (updateError) {
        console.log("Error - Could not save your intent in the intent screen.");
        return;
      }

      // Navigate to account connection with including selected intent in user metadata
      router.replace("/(onboarding)/accountconnection");
    } catch (err) {
      console.error("Intent update failed:", err);
      Alert.alert("Something went wrong. Try again.");
    }
  };

  const renderOption = (option: (typeof options)[0], index: number) => {
    const isSelected = selected === option.id;

    return (
      <TouchableOpacity
        key={option.id}
        style={[styles.optionCard, { marginLeft: index % 2 === 1 ? 16 : 0 }]}
        onPress={() => handleSelect(option.id)}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={option.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cardGradient, isSelected && styles.selectedCard]}
        >
          <View style={styles.iconContainer}>
            <Ionicons name={option.icon as any} size={28} color="#fff" />
          </View>
          <Text style={styles.cardTitle}>{option.label}</Text>
          <Text style={styles.cardDescription}>{option.description}</Text>
          {isSelected && (
            <View style={styles.checkmarkContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
            </View>
          )}
        </LinearGradient>
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

        <Text style={styles.title}>What brings you here today?</Text>
        <Text style={styles.subtitle}>Choose your financial journey</Text>

        <ScrollView
          contentContainerStyle={styles.optionList}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.optionsGrid}>
            {options.map((option, index) => renderOption(option, index))}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.button, !selected && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selected}
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
    paddingHorizontal: 24,
    top: 15,
  },
  title: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    marginTop: 40,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    marginBottom: 40,
  },
  optionList: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  optionCard: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.2,
    marginBottom: 16,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  cardGradient: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: "#fff",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardDescription: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    lineHeight: 16,
  },
  checkmarkContainer: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  button: {
    marginTop: 30,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 30,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  gradientButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
