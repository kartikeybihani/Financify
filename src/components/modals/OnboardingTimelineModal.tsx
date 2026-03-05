import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
  Animated,
  TouchableWithoutFeedback,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { OnboardingProgress } from "@/src/utils/onboarding/onboardingProgress";

interface OnboardingTimelineModalProps {
  visible: boolean;
  progress: OnboardingProgress | null;
  onClose: () => void;
  onStepPress: (step: 1 | 2 | 3) => void;
}

interface TimelineStepProps {
  step: number;
  title: string;
  description: string;
  completed: boolean;
  isLastStep: boolean;
  onPress: () => void;
}

function TimelineStep({
  step,
  title,
  description,
  completed,
  isLastStep,
  onPress,
}: TimelineStepProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.stepContainer}
      disabled={completed}
    >
      <View style={styles.stepContent}>
        <View style={styles.stepLeft}>
          <View
            style={[styles.stepCircle, completed && styles.stepCircleCompleted]}
          >
            {completed ? (
              <Ionicons name="checkmark" size={18} color="#fff" />
            ) : (
              <View style={styles.stepDotEmpty} />
            )}
          </View>
          {!isLastStep && (
            <View
              style={[styles.stepLine, completed && styles.stepLineCompleted]}
            />
          )}
        </View>
        <View style={styles.stepRight}>
          <Text
            style={[styles.stepTitle, completed && styles.stepTitleCompleted]}
          >
            {title}
          </Text>
          <Text style={styles.stepDescription}>{description}</Text>
        </View>
        {!completed && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color="rgba(255, 255, 255, 0.5)"
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function OnboardingTimelineModal({
  visible,
  progress,
  onClose,
  onStepPress,
}: OnboardingTimelineModalProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      // Animate slide up
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 26,
        stiffness: 240,
        mass: 1,
        useNativeDriver: true,
      }).start();
    } else {
      // Animate slide down
      Animated.spring(slideAnim, {
        toValue: SCREEN_HEIGHT,
        damping: 26,
        stiffness: 240,
        mass: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  if (!progress) {
    return null;
  }

  const steps = [
    {
      step: 1,
      title: "Connect your accounts",
      description: "Link your bank accounts to get started",
      completed: progress.accounts_connected,
    },
    {
      step: 2,
      title: "Set up a budget",
      description: "Create your budget with Finny.",
      completed: progress.budget_setup,
    },
    {
      step: 3,
      title: "Ask Finny anything!",
      description: "Start a conversation with Finny",
      completed: progress.finny_asked,
    },
  ];

  const screenHeight = Dimensions.get("window").height;
  const maxModalHeight = screenHeight * 0.5;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[
                styles.modalContainer,
                {
                  maxHeight: maxModalHeight,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <LinearGradient
                colors={["#1a1a1a", "#0f0f0f"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.modalContent}
              >
                <View style={styles.sheetHandleContainer}>
                  <View style={styles.sheetHandle} />
                </View>

                <ScrollView
                  style={styles.scrollView}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  nestedScrollEnabled={true}
                >
                  <View style={styles.timeline}>
                    {steps.map((stepData, index) => (
                      <TimelineStep
                        key={stepData.step}
                        step={stepData.step}
                        title={stepData.title}
                        description={stepData.description}
                        completed={stepData.completed}
                        isLastStep={index === steps.length - 1}
                        onPress={() => {
                          if (!stepData.completed) {
                            onStepPress(stepData.step as 1 | 2 | 3);
                          }
                        }}
                      />
                    ))}
                  </View>
                </ScrollView>
              </LinearGradient>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: SCREEN_WIDTH,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -10,
    },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 24,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    width: "100%",
    flexDirection: "column",
  },
  sheetHandleContainer: {
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandle: {
    width: 44,
    height: 3,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    flexShrink: 0,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Manrope",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: "Manrope",
  },
  scrollView: {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  timeline: {
    gap: 0,
  },
  stepContainer: {
    marginBottom: 0,
  },
  stepContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepLeft: {
    alignItems: "center",
    marginRight: 12,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleCompleted: {
    backgroundColor: "#4A90E2",
    borderColor: "#4A90E2",
  },
  stepDotEmpty: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  stepLine: {
    width: 2,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginTop: 6,
  },
  stepLineCompleted: {
    backgroundColor: "#4A90E2",
  },
  stepRight: {
    flex: 1,
    paddingTop: 2,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Manrope",
    marginBottom: 2,
  },
  stepTitleCompleted: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  stepDescription: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.5)",
    fontFamily: "Manrope",
    lineHeight: 18,
  },
});
