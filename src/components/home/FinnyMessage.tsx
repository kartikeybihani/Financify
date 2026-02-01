// components/home/FinnyMessage.tsx

import React, { useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  DeviceEventEmitter,
} from "react-native";
import { useRouter } from "expo-router";
import { styles } from "@/src/styles/homeStyles";
import { Goal } from "@/src/types/finny";
import { SpendingData } from "@/src/hooks/useSpendingData";
import { useHomeInsights } from "@/src/hooks/useHomeInsights";
import AppStorage from "@/src/utils/storage/storage";
import { OnboardingStatus } from "@/src/utils/onboarding/onboardingProgress";

interface FinnyMessageProps {
  goals?: Goal[];
  spendingData?: SpendingData;
  totalBalance?: number;
  investmentsTotal?: number;
  liabilitiesTotal?: number;
  netWorthChange?: number;
  onboardingStatus?: OnboardingStatus | null;
}

export const FinnyMessage: React.FC<FinnyMessageProps> = React.memo(
  ({
    goals = [],
    spendingData,
    totalBalance = 0,
    investmentsTotal = 0,
    liabilitiesTotal = 0,
    netWorthChange = 0,
    onboardingStatus,
  }) => {
    const router = useRouter();
    const { insight } = useHomeInsights();

    // Check if onboarding is complete
    const isOnboardingComplete = onboardingStatus?.isComplete ?? true;
    const progress = onboardingStatus?.progress;

    // Generate onboarding-based messages if onboarding is not complete
    const getOnboardingMessage = useMemo(() => {
      if (isOnboardingComplete || !progress) {
        return null;
      }

      // Priority: Step 2 (budget) over Step 3 (ask Finny)
      if (!progress.budget_setup) {
        return {
          message: "Set up your budget to track spending and stay on track!",
          linkTo: "insights" as const,
        };
      }

      if (!progress.finny_asked) {
        return {
          message: "Ask Finny anything about your finances!",
          linkTo: "chat" as const,
        };
      }

      return null;
    }, [isOnboardingComplete, progress]);

    // Generate context-aware questions that create curiosity (only if onboarding is complete)
    const getContextualQuestion = useMemo(() => {
      // If onboarding is not complete, return null (we'll use onboarding message instead)
      if (!isOnboardingComplete) {
        return null;
      }
      const activeGoals = goals.filter(
        (goal) =>
          goal.status !== "completed" &&
          !(goal.target_amount > 0 && goal.current_amount >= goal.target_amount)
      );

      // Priority 1: Budget progress questions
      if (insight?.type === "budget_progress") {
        const { percentage, remaining, daysLeft } = insight.budgetProgress!;
        if (percentage > 100) {
          return `You've overspent by ${Math.abs(remaining).toFixed(
            0
          )}%. What should you cut?`;
        }
        if (percentage > 80) {
          return `You've spent ${percentage.toFixed(
            0
          )}% of your budget with ${daysLeft} days left. Want to adjust?`;
        }
        if (percentage > 50) {
          return `You're ${percentage.toFixed(
            0
          )}% through your budget. On track?`;
        }
      }

      // Priority 2: Category alert questions
      if (insight?.type === "category_alert") {
        const { category, percentage } = insight.categoryAlert!;
        return `You're spending ${percentage.toFixed(
          0
        )}% on ${category}. Is that normal for you?`;
      }

      // Priority 3: Spending spike questions
      if (spendingData && spendingData.lastMonthChange > 15) {
        return `Your spending is up ${spendingData.lastMonthChange.toFixed(
          0
        )}% this month. What changed?`;
      }

      // Priority 4: Goal progress questions
      if (activeGoals.length > 0) {
        const closestGoal = activeGoals.reduce((closest, goal) => {
          if (!closest) return goal;
          const closestProgress =
            closest.target_amount > 0
              ? closest.current_amount / closest.target_amount
              : 0;
          const goalProgress =
            goal.target_amount > 0
              ? goal.current_amount / goal.target_amount
              : 0;
          return goalProgress > closestProgress ? goal : closest;
        }, null as Goal | null);

        if (closestGoal) {
          const progress =
            closestGoal.target_amount > 0
              ? (closestGoal.current_amount / closestGoal.target_amount) * 100
              : 0;
          if (progress > 50 && progress < 90) {
            return `You're ${progress.toFixed(
              0
            )}% to your goal. Want to accelerate it?`;
          }
        }
      }

      // Priority 5: Investment questions
      if (investmentsTotal > 0 && investmentsTotal > totalBalance * 0.2) {
        return `Your investments are ${(
          (investmentsTotal / totalBalance) *
          100
        ).toFixed(0)}% of net worth. Optimized?`;
      }

      // Priority 6: Debt questions
      if (liabilitiesTotal > 0 && liabilitiesTotal > totalBalance * 0.3) {
        return `Your debt is ${(
          (liabilitiesTotal / totalBalance) *
          100
        ).toFixed(0)}% of net worth. Want a payoff plan?`;
      }

      // Priority 7: Net worth growth questions
      if (netWorthChange > 5) {
        return `Net worth up ${netWorthChange.toFixed(
          1
        )}% this month! What's driving it?`;
      }

      // Priority 8: No goals questions
      if (goals.length === 0 && totalBalance > 0) {
        return `What's your biggest financial goal right now?`;
      }

      // Default curiosity-driven questions
      const defaultQuestions = [
        `Where did most of your money go this month?`,
        `What's your biggest spending category?`,
        `Are you on track with your financial goals?`,
        `What's one thing you could optimize today?`,
        `How does your spending compare to last month?`,
        `What's your biggest financial opportunity?`,
      ];

      return defaultQuestions[
        Math.floor(Math.random() * defaultQuestions.length)
      ];
    }, [
      goals,
      spendingData,
      totalBalance,
      investmentsTotal,
      liabilitiesTotal,
      netWorthChange,
      insight,
      isOnboardingComplete,
    ]);

    // Determine the message and link destination
    const displayMessage =
      getOnboardingMessage?.message ||
      getContextualQuestion ||
      "Ask Finny anything!";
    const linkDestination = getOnboardingMessage?.linkTo || "chat";

    const handlePress = () => {
      if (getOnboardingMessage) {
        // Navigate to the appropriate tab based on onboarding step
        if (linkDestination === "insights") {
          router.push("/(tabs)/insights");
          setTimeout(() => {
            DeviceEventEmitter.emit("navigateToInsightsSection", {
              section: "budget",
            });
          }, 200);
        } else {
          router.push("/(tabs)/chat");
        }
      } else {
        // Set initial message based on current insight/question
        const question = getContextualQuestion || displayMessage;
        AppStorage.setItemSync("initialChatMessage", question);
        router.push("/(tabs)/chat");
      }
    };

    return (
      <View style={styles.finnyMessageContainer}>
        <TouchableOpacity
          style={styles.finnyMessage}
          activeOpacity={0.8}
          onPress={handlePress}
        >
          <View style={styles.finnyIconContainer}>
            <Image
              source={require("../../../assets/images/finny2.png")}
              style={{
                width: 65,
                height: 80,
                borderRadius: 20,
                resizeMode: "contain",
              }}
            />
          </View>
          <View style={styles.finnyMessageContent}>
            <Text style={styles.finnyMessageTitle}>Ask Finny</Text>
            <Text style={styles.finnyMessageText}>{displayMessage}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }
);

FinnyMessage.displayName = "FinnyMessage";
