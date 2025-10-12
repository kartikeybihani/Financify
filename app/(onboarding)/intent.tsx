import React, { useEffect, useState, useRef } from "react";
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
import { supabase } from "@/src/lib/supabase/supabase";
import {
  useNavigationContext,
  OnboardingStage,
} from "@/src/contexts/NavigationContext";
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
  useEffect(() => {
    logOnboardingEvent({ stage: "q1", action: "view" });
  }, []);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const router = useRouter();
  const params = useLocalSearchParams();
  const { updateOnboardingStage } = useNavigationContext();

  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const handleSelect = async (id: string) => {
    // If already selected, deselect
    if (selectedOption === id) {
      setSelectedOption(null);
      return;
    }

    setSelectedOption(id);

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
    setTimeout(async () => {
      await handleContinue(id);
    }, 300);
  };

  const persistAnswer = async (key: string, value: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.auth.updateUser({ data: { [key]: value } });
    } catch (err) {
      logger.info("Could not persist answer", key, err);
    }
  };

  const handleContinue = async (selectedId?: string) => {
    const q = QUESTIONS[questionIndex];
    const optionToSave = selectedId || selectedOption;
    if (!q || !optionToSave) return;

    const newAnswers = { ...answers, [q.key]: optionToSave };
    setAnswers(newAnswers);

    const nextIndex = questionIndex + 1;
    if (nextIndex < QUESTIONS.length) {
      // Update question index after animation completes
      setQuestionIndex(nextIndex);
      setSelectedOption(null);

      // Persist data in background
      persistAnswer(q.key, optionToSave);
    } else {
      // Last question - update stage and let NavigationContext handle navigation
      try {
        await updateOnboardingStage(OnboardingStage.ABOUT_YOU);
        await persistAnswer(q.key, optionToSave);
      } catch {}
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
