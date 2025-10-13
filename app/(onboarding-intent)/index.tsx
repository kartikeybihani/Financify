import React, { useEffect, useState, useRef, useTransition } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  Animated,
  Platform,
  Alert,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/logger";
import { logOnboardingEvent } from "@/src/utils/onboarding";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Question = {
  key: "money_mindset" | "stress_level" | "emergency_readiness";
  title: string;
  options: { id: string; label: string; icon: any; color: string }[];
};

const QUESTIONS: Question[] = [
  {
    key: "money_mindset",
    title: "How do you feel about money right now?",
    options: [
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
    ],
  },
  {
    key: "stress_level",
    title: "How stressed do you feel financially?",
    options: [
      { id: "chill", label: "Chill", icon: "sunny-outline", color: "#00D4AA" },
      {
        id: "tense",
        label: "A bit tense",
        icon: "cloud-outline",
        color: "#FFB020",
      },
      {
        id: "stressed",
        label: "Stressed",
        icon: "thunderstorm-outline",
        color: "#FF6B6B",
      },
      {
        id: "overwhelmed",
        label: "Overwhelmed",
        icon: "snow-outline",
        color: "#E53E3E",
      },
    ],
  },
  {
    key: "emergency_readiness",
    title: "Could you cover a $1,000 emergency expense?",
    options: [
      {
        id: "yes",
        label: "Yes",
        icon: "diamond-outline",
        color: "#00D4AA",
      },
      {
        id: "maybe",
        label: "Maybe",
        icon: "hourglass-outline",
        color: "#FFB020",
      },
      { id: "no", label: "No", icon: "ban-outline", color: "#FF6B6B" },
      {
        id: "unsure",
        label: "Not sure",
        icon: "help-outline",
        color: "#A0AEC0",
      },
    ],
  },
];

export default function IntentScreen() {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    logOnboardingEvent({ stage: "q1", action: "view" });
    logger.info("🎬 IntentScreen: Screen mounted");

    // Restore progress from AsyncStorage
    const restoreProgress = async () => {
      try {
        const savedAnswers = await AsyncStorage.getItem("intent_answers");
        const savedProgress = await AsyncStorage.getItem("intent_progress");

        if (savedAnswers) {
          const parsedAnswers = JSON.parse(savedAnswers);
          setAnswers(parsedAnswers);
          logger.info("📥 IntentScreen: Restored answers from AsyncStorage", {
            answers: parsedAnswers,
          });
        }

        if (savedProgress) {
          const progressIndex = parseInt(savedProgress);
          setQuestionIndex(progressIndex);
          logger.info("📥 IntentScreen: Restored progress from AsyncStorage", {
            questionIndex: progressIndex,
          });
        }
      } catch (error) {
        logger.error("❌ IntentScreen: Error restoring progress", error);
      }
    };

    restoreProgress();

    return () => {
      isMounted.current = false;
      logger.info("🎬 IntentScreen: Screen unmounted");
    };
  }, []);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false); // Prevent multiple simultaneous answers
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const params = useLocalSearchParams();

  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelect = async (id: string) => {
    // Prevent multiple simultaneous selections
    if (isProcessing) {
      logger.info("⚠️ IntentScreen: Already processing, ignoring click");
      return;
    }

    // If already selected, deselect
    if (selectedOption === id) {
      setSelectedOption(null);
      return;
    }

    logger.info("👆 IntentScreen: Option selected", { id, questionIndex });
    setSelectedOption(id);
    setIsProcessing(true);

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Start slide animation
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: -SCREEN_WIDTH,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate after animation
    timeoutRef.current = setTimeout(async () => {
      if (!isMounted.current) {
        logger.warn(
          "⚠️ IntentScreen: Component unmounted during animation, aborting"
        );
        return;
      }
      await handleContinue(id);
      if (isMounted.current) {
        setIsProcessing(false);
      }
    }, 300);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Save progress to AsyncStorage (local only, no Supabase to prevent USER_UPDATED events)
  const saveProgressLocally = async (
    answers: Record<string, string>,
    nextIndex: number
  ) => {
    try {
      await AsyncStorage.setItem("intent_answers", JSON.stringify(answers));
      await AsyncStorage.setItem("intent_progress", nextIndex.toString());
      logger.info("💾 IntentScreen: Saved progress to AsyncStorage", {
        answers,
        nextIndex,
      });
    } catch (err) {
      logger.error("❌ IntentScreen: Could not save to AsyncStorage", err);
    }
  };

  const handleContinue = async (selectedId?: string) => {
    logger.info("🔄 IntentScreen: handleContinue called", {
      selectedId,
      currentQuestionIndex: questionIndex,
      currentAnswers: answers,
    });

    const q = QUESTIONS[questionIndex];
    const optionToSave = selectedId || selectedOption;

    if (!q || !optionToSave) {
      logger.error("❌ IntentScreen: Missing question or option", {
        q,
        optionToSave,
      });
      return;
    }

    const newAnswers = { ...answers, [q.key]: optionToSave };
    setAnswers(newAnswers);

    const nextIndex = questionIndex + 1;
    logger.info("📝 IntentScreen: Question answered", {
      questionIndex,
      nextIndex,
      totalQuestions: QUESTIONS.length,
      answer: optionToSave,
      questionKey: q.key,
      allAnswersSoFar: newAnswers,
    });

    if (nextIndex < QUESTIONS.length) {
      logger.info("➡️ IntentScreen: Moving to next question", {
        from: questionIndex,
        to: nextIndex,
        remainingQuestions: QUESTIONS.length - nextIndex,
      });

      // Check if still mounted before updating state
      if (!isMounted.current) {
        logger.warn(
          "⚠️ IntentScreen: Component unmounted, aborting state update"
        );
        return;
      }

      // Save to AsyncStorage (local only - NO Supabase call to prevent USER_UPDATED events)
      await saveProgressLocally(newAnswers, nextIndex);

      // Update question index to show next question - use transition to batch updates
      startTransition(() => {
        setQuestionIndex(nextIndex);
        setSelectedOption(null);
      });
    } else {
      // Last question - move to next stage
      logger.info(
        "🏁 IntentScreen: All questions completed, saving all data to Supabase",
        { allAnswers: newAnswers }
      );
      try {
        logger.info(
          "🧭 IntentScreen: Saving answers and navigating to profile screen"
        );

        // Save answers to AsyncStorage for next screen to update Supabase
        await AsyncStorage.setItem(
          "pending_intent_answers",
          JSON.stringify(newAnswers)
        );

        // Clear progress tracking
        await AsyncStorage.removeItem("intent_answers");
        await AsyncStorage.removeItem("intent_progress");

        // Navigate WITHOUT updating Supabase (no USER_UPDATED event)
        router.replace("/(onboarding-profile)");

        logger.info(
          "✅ IntentScreen: Navigated to profile, answers saved locally"
        );
      } catch (error) {
        logger.error("❌ IntentScreen: Error moving to next stage:", error);
      }
      logOnboardingEvent({ stage: "q1", action: "complete" });
    }
  };

  const renderOption = (option: Question["options"][0], index: number) => {
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
          <Animated.View
            style={[
              styles.header,
              {
                opacity: fadeAnim,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            <Text style={styles.title}>{QUESTIONS[questionIndex].title}</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.optionsContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            {QUESTIONS[questionIndex].options.map((option, index) =>
              renderOption(option, index)
            )}
          </Animated.View>
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
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 8,
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
  cardDescription: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 16,
    textAlign: "left",
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
