import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AppStorage from "@/src/utils/storage/storage";
import logger from "@/src/utils/core/logger";
import { logOnboardingEvent } from "@/src/utils/auth/onboarding";
import { supabase } from "@/src/lib/supabase/supabase";
import FinanceFact from "@/src/components/onboarding/FinanceFact";

export interface IntentOption {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface IntentQuestionScreenProps {
  title: string;
  options: IntentOption[];
  storageKey: string; // e.g., "money_mindset", "stress_level", "emergency_readiness"
  profileField: string; // e.g., "intent_q1", "intent_q2", "intent_q3"
  onboardingStep: number; // 2 for q1/q2, 3 for q3
  nextRoute: string; // e.g., "/onboarding-intent2", "/onboarding-intent3", "/onboarding-connect"
  logStage: string; // e.g., "q1_1", "q1_2", "q1_3"
  screenKey: string; // e.g., "onboarding-intent1", "onboarding-intent2", "onboarding-intent3"
  onBeforeNavigate?: (selectedId: string) => Promise<void>; // Optional callback for extra logic (e.g., intent3 memory storage)
}

export default function IntentQuestionScreen({
  title,
  options,
  storageKey,
  profileField,
  onboardingStep,
  nextRoute,
  logStage,
  screenKey,
  onBeforeNavigate,
}: IntentQuestionScreenProps) {
  const isMounted = useRef(true);
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    logOnboardingEvent({ stage: logStage, action: "view" });

    // Intentionally do NOT restore previously saved answers into UI selection.
    // These screens should always start with nothing selected, even if the user
    // navigates back and we have `pending_intent_answers` in storage.

    return () => {
      isMounted.current = false;
    };
  }, [storageKey, logStage]);

  const handleSelect = async (id: string) => {
    if (isProcessing) {
      return;
    }

    if (selectedOption === id) {
      setSelectedOption(null);
      return;
    }

    setSelectedOption(id);
    setIsProcessing(true);

    // Navigate immediately without animation
    await handleContinue(id);
    if (isMounted.current) {
      setIsProcessing(false);
    }
  };

  const handleContinue = async (selectedId: string) => {
    try {
      // Get existing answers and update
      const existingAnswers = AppStorage.getItemSync(
        "pending_intent_answers"
      );
      const answers = existingAnswers ? JSON.parse(existingAnswers) : {};
      answers[storageKey] = selectedId;

      AppStorage.setItemSync(
        "pending_intent_answers",
        JSON.stringify(answers)
      );

      // Persist answer to profiles
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          await supabase
            .from("profiles")
            .update({
              onboarding_step: onboardingStep,
              [profileField]: selectedId,
            })
            .eq("id", user.id);
        }
      } catch (error) {
        logger.error(
          `❌ [${screenKey.toUpperCase()}] Error updating profile:`,
          error
        );
      }

      // Run optional before-navigate callback (e.g., for intent3 memory storage)
      if (onBeforeNavigate) {
        try {
          await onBeforeNavigate(selectedId);
        } catch (error) {
          logger.warn(
            `⚠️ [${screenKey.toUpperCase()}] Error in onBeforeNavigate:`,
            error
          );
        }
      }

      router.replace(nextRoute as any);
      logOnboardingEvent({ stage: logStage, action: "complete" });
    } catch (error) {
      setIsProcessing(false);
    }
  };

  const renderOption = (option: IntentOption) => {
    const isSelected = selectedOption === option.id;

    return (
      <TouchableOpacity
        key={option.id}
        style={[styles.optionCard, isSelected && styles.selectedCard]}
        onPress={() => handleSelect(option.id)}
        activeOpacity={0.8}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={option.icon as any} size={22} color={option.color} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{option.label}</Text>
        </View>
        {isSelected && (
          <View style={styles.checkmarkContainer}>
            <View style={styles.checkmarkBackground}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient
      colors={["#1A1A2E", "#16213E", "#0D1117"]}
      locations={[0, 0.5, 1]}
      style={styles.container}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "left", "right", "bottom"]}
      >
        <StatusBar barStyle="light-content" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
          </View>

          <View style={styles.optionsContainer}>
            {options.map((option) => renderOption(option))}
          </View>

          <FinanceFact screenKey={screenKey} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 70 : 50,
    paddingBottom: Platform.OS === "ios" ? 40 : 30,
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
  optionsContainer: {
    gap: 15,
  },
  optionCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 3,
    minHeight: 60,
  },
  selectedCard: {
    borderColor: "#4A90E2",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.3,
    elevation: 10,
    transform: [{ scale: 1.02 }],
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 3,
    textAlign: "left",
    letterSpacing: 0.3,
  },
  checkmarkContainer: {
    marginLeft: 12,
  },
  checkmarkBackground: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4A90E2",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4A90E2",
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 4,
  },
});
