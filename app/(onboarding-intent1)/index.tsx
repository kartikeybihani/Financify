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
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/src/utils/logger";
import { logOnboardingEvent } from "@/src/utils/onboarding";

const OPTIONS = [
  {
    id: "freedom",
    label: "Tool for freedom",
    icon: "rocket-outline",
    color: "#00D4AA",
  },
  {
    id: "stress",
    label: "It stresses me",
    icon: "flash-outline",
    color: "#FF6B6B",
  },
  {
    id: "ignore",
    label: "I kind of ignore it",
    icon: "eye-off-outline",
    color: "#A0AEC0",
  },
  {
    id: "disciplined",
    label: "I'm disciplined",
    icon: "trophy-outline",
    color: "#4A90E2",
  },
];

export default function IntentQuestion1Screen() {
  const isMounted = useRef(true);
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    logOnboardingEvent({ stage: "q1_1", action: "view" });
    logger.info("🎬 IntentQuestion1Screen: Screen mounted");

    // Restore saved answer if exists
    const restoreAnswer = async () => {
      try {
        const savedAnswers = await AsyncStorage.getItem(
          "pending_intent_answers"
        );
        if (savedAnswers) {
          const answers = JSON.parse(savedAnswers);
          if (answers.money_mindset) {
            setSelectedOption(answers.money_mindset);
            logger.info("📥 IntentQuestion1Screen: Restored answer", {
              answer: answers.money_mindset,
            });
          }
        }
      } catch (error) {
        logger.error("❌ IntentQuestion1Screen: Error restoring answer", error);
      }
    };

    restoreAnswer();

    return () => {
      isMounted.current = false;
      logger.info("🎬 IntentQuestion1Screen: Screen unmounted");
    };
  }, []);

  const handleSelect = async (id: string) => {
    if (isProcessing) {
      logger.info(
        "⚠️ IntentQuestion1Screen: Already processing, ignoring click"
      );
      return;
    }

    if (selectedOption === id) {
      setSelectedOption(null);
      return;
    }

    logger.info("👆 IntentQuestion1Screen: Option selected", { id });
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
      logger.info("💾 IntentQuestion1Screen: Saving answer to AsyncStorage", {
        answer: selectedId,
      });

      // Get existing answers and update
      const existingAnswers = await AsyncStorage.getItem(
        "pending_intent_answers"
      );
      const answers = existingAnswers ? JSON.parse(existingAnswers) : {};
      answers.money_mindset = selectedId;

      await AsyncStorage.setItem(
        "pending_intent_answers",
        JSON.stringify(answers)
      );

      logger.info(
        "✅ IntentQuestion1Screen: Answer saved, navigating to question 2"
      );
      router.replace("/(onboarding-intent2)");
      logOnboardingEvent({ stage: "q1_1", action: "complete" });
    } catch (error) {
      logger.error("❌ IntentQuestion1Screen: Error saving answer:", error);
      setIsProcessing(false);
    }
  };

  const renderOption = (option: (typeof OPTIONS)[0]) => {
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
            <Text style={styles.progress}>Question 1 of 3</Text>
            <Text style={styles.title}>
              How do you feel about money right now?
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            {OPTIONS.map((option) => renderOption(option))}
          </View>
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
  progress: {
    fontSize: 14,
    color: "#4A90E2",
    marginBottom: 12,
    fontWeight: "600",
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
  },
});
