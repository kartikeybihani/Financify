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
import { useDemoMode } from "@/src/contexts/DemoContext";
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

interface OnboardingMessageConfig {
  displayMessage: string;
  linkTo: "insights" | "chat";
  chatPrefillMessage?: string;
}

interface ContextualMessageConfig {
  displayMessage: string;
  chatPrefillMessage: string;
}

const appendChatEmoji = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return `${trimmed} 💬`;
};

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
    const { isDemoMode } = useDemoMode();

    // Check if onboarding is complete
    const isOnboardingComplete = onboardingStatus?.isComplete ?? true;
    const progress = onboardingStatus?.progress;

    // Generate onboarding-based messages if onboarding is not complete
    const getOnboardingMessage = useMemo<OnboardingMessageConfig | null>(() => {
      if (isOnboardingComplete || !progress) {
        return null;
      }

      // Priority: Step 2 (budget) over Step 3 (ask Finny)
      if (!progress.budget_setup) {
        return {
          displayMessage: "Set up your budget to track spending and stay on track!",
          linkTo: "insights" as const,
        };
      }

      if (!progress.finny_asked) {
        return {
          displayMessage: "Ask Finny anything about your finances!",
          linkTo: "chat" as const,
          chatPrefillMessage:
            "Help me understand my finances and what I should focus on first.",
        };
      }

      return null;
    }, [isOnboardingComplete, progress]);

    // Generate context-aware questions that create curiosity (only if onboarding is complete)
    const getContextualPrompt = useMemo<ContextualMessageConfig | null>(() => {
      // If onboarding is not complete, return null (we'll use onboarding message instead)
      if (!isOnboardingComplete) {
        return null;
      }
      const activeGoals = goals.filter(
        (goal) =>
          goal.status !== "completed" &&
          !(
            goal.target_amount > 0 && goal.current_amount >= goal.target_amount
          ),
      );

      // Priority 1: Budget progress questions
      if (insight?.type === "budget_progress") {
        const { percentage, remaining, daysLeft } = insight.budgetProgress!;
        if (percentage > 100) {
          return {
            displayMessage: `You've overspent by ${Math.abs(remaining).toFixed(
              0,
            )}%. What should you cut?`,
            chatPrefillMessage: `I'm overspent by ${Math.abs(remaining).toFixed(
              0,
            )}%. What should I cut first?`,
          };
        }
        if (percentage > 80) {
          return {
            displayMessage: `You've spent ${percentage.toFixed(
              0,
            )}% of your budget with ${daysLeft} days left. Want to adjust?`,
            chatPrefillMessage: `I've spent ${percentage.toFixed(
              0,
            )}% of my budget with ${daysLeft} days left. Should I adjust my plan?`,
          };
        }
        if (percentage > 50) {
          return {
            displayMessage: `You're ${percentage.toFixed(
              0,
            )}% through your budget. On track?`,
            chatPrefillMessage: `I'm ${percentage.toFixed(
              0,
            )}% through my budget. Am I on track?`,
          };
        }
      }

      // Priority 2: Category alert questions
      if (insight?.type === "category_alert") {
        const { category, percentage } = insight.categoryAlert!;
        return {
          displayMessage: `You're spending ${percentage.toFixed(
            0,
          )}% on ${category}. Is that normal for you?`,
          chatPrefillMessage: `I'm spending ${percentage.toFixed(
            0,
          )}% on ${category}. Is that normal for me?`,
        };
      }

      // Priority 3: Spending spike questions
      if (spendingData && spendingData.lastMonthChange > 15) {
        return {
          displayMessage: `Your spending is up ${spendingData.lastMonthChange.toFixed(
            0,
          )}% this month. What changed?`,
          chatPrefillMessage: `My spending is up ${spendingData.lastMonthChange.toFixed(
            0,
          )}% this month. Can you help me figure out what changed?`,
        };
      }

      // Priority 4: Goal progress questions
      if (activeGoals.length > 0) {
        const closestGoal = activeGoals.reduce(
          (closest, goal) => {
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
          },
          null as Goal | null,
        );

        if (closestGoal) {
          const progress =
            closestGoal.target_amount > 0
              ? (closestGoal.current_amount / closestGoal.target_amount) * 100
              : 0;
          if (progress > 50 && progress < 90) {
            return {
              displayMessage: `You're ${progress.toFixed(
                0,
              )}% to your goal. Want to accelerate it?`,
              chatPrefillMessage: `I'm ${progress.toFixed(
                0,
              )}% to my goal. How can I accelerate it?`,
            };
          }
        }
      }

      // Priority 5: Investment questions
      if (investmentsTotal > 0 && investmentsTotal > totalBalance * 0.2) {
        return {
          displayMessage: `Your investments are ${(
            (investmentsTotal / totalBalance) *
            100
          ).toFixed(0)}% of net worth. Optimized?`,
          chatPrefillMessage: `My investments are ${(
            (investmentsTotal / totalBalance) *
            100
          ).toFixed(0)}% of my net worth. Is this optimized?`,
        };
      }

      // Priority 6: Debt questions
      if (liabilitiesTotal > 0 && liabilitiesTotal > totalBalance * 0.3) {
        return {
          displayMessage: `Your debt is ${(
            (liabilitiesTotal / totalBalance) *
            100
          ).toFixed(0)}% of net worth. Want a payoff plan?`,
          chatPrefillMessage: `My debt is ${(
            (liabilitiesTotal / totalBalance) *
            100
          ).toFixed(0)}% of my net worth. Help me make a payoff plan.`,
        };
      }

      // Priority 7: Net worth growth questions
      if (netWorthChange > 5) {
        return {
          displayMessage: `Net worth up ${netWorthChange.toFixed(
            1,
          )}% this month! What's driving it?`,
          chatPrefillMessage: `My net worth is up ${netWorthChange.toFixed(
            1,
          )}% this month. What's driving it?`,
        };
      }

      // Priority 8: No goals questions
      if (goals.length === 0 && totalBalance > 0) {
        return {
          displayMessage: `What's your biggest financial goal right now?`,
          chatPrefillMessage:
            "I want to set a financial goal, but I'm not sure where to start.",
        };
      }

      // Default curiosity-driven questions
      const defaultQuestions: ContextualMessageConfig[] = [
        {
          displayMessage: `Where did most of your money go this month?`,
          chatPrefillMessage: `Where did most of my money go this month?`,
        },
        {
          displayMessage: `What's your biggest spending category?`,
          chatPrefillMessage: `What's my biggest spending category?`,
        },
        {
          displayMessage: `Are you on track with your financial goals?`,
          chatPrefillMessage: `Am I on track with my financial goals?`,
        },
        {
          displayMessage: `What's one thing you could optimize today?`,
          chatPrefillMessage: `What's one thing I should optimize today?`,
        },
        {
          displayMessage: `How does your spending compare to last month?`,
          chatPrefillMessage: `How does my spending compare to last month?`,
        },
        {
          displayMessage: `What's your biggest financial opportunity?`,
          chatPrefillMessage: `What's my biggest financial opportunity right now?`,
        },
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
      getOnboardingMessage?.displayMessage ||
      getContextualPrompt?.displayMessage ||
      "Ask Finny anything!";
    const linkDestination = getOnboardingMessage?.linkTo || "chat";
    const chatPrefillMessage =
      getOnboardingMessage?.chatPrefillMessage ||
      getContextualPrompt?.chatPrefillMessage ||
      "Help me understand my finances and what I should focus on right now.";

    // Demo mode: use a nice message (same layout as normal)
    if (isDemoMode) {
      const demoDisplayMessage = "Plan me a 7 day trip to Hawaii, can I afford it?";
      const demoChatPrefillMessage =
        "Can I afford a 7 day trip to Hawaii? Help me plan it.";
      return (
        <View style={styles.finnyMessageContainer}>
          <TouchableOpacity
            style={styles.finnyMessage}
            activeOpacity={0.8}
            onPress={() => {
              AppStorage.setItemSync(
                "initialChatMessage",
                appendChatEmoji(demoChatPrefillMessage),
              );
              router.push("/(tabs)/chat");
            }}
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
              <Text style={styles.finnyMessageText}>{demoDisplayMessage}</Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    const handlePress = () => {
      if (getOnboardingMessage) {
        // Navigate to the appropriate tab based on onboarding step
        if (linkDestination === "insights") {
          AppStorage.setItemSync("initialChatMessage", "");
          router.push("/(tabs)/insights");
          setTimeout(() => {
            DeviceEventEmitter.emit("navigateToInsightsSection", {
              section: "budget",
            });
          }, 200);
        } else {
          AppStorage.setItemSync(
            "initialChatMessage",
            appendChatEmoji(chatPrefillMessage),
          );
          router.push("/(tabs)/chat");
        }
      } else {
        // Set initial message in first-person phrasing for the chat input
        AppStorage.setItemSync(
          "initialChatMessage",
          appendChatEmoji(chatPrefillMessage),
        );
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
  },
);

FinnyMessage.displayName = "FinnyMessage";
