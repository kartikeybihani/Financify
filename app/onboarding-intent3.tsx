import React from "react";
import IntentQuestionScreen, {
  IntentOption,
} from "@/src/components/onboarding/IntentQuestionScreen";
import logger from "@/src/utils/core/logger";
import { authenticatedFetch } from "@/src/utils/auth/authToken";
import AppStorage from "@/src/utils/storage/storage";

const OPTIONS: IntentOption[] = [
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
];

export default function IntentQuestion3Screen() {
  const handleBeforeNavigate = async (selectedId: string) => {
    // Store onboarding memory in Supermemory (fire-and-forget, don't block navigation)
    try {
      const profileDataStr = AppStorage.getItemSync("pending_profile_data");
      const profileData = profileDataStr ? JSON.parse(profileDataStr) : null;
      const intentAnswersStr = AppStorage.getItemSync(
        "pending_intent_answers"
      );
      const intentAnswers = intentAnswersStr
        ? JSON.parse(intentAnswersStr)
        : null;

      // Only proceed if we have data to store
      if (profileData || intentAnswers) {
        const BASE_URL =
          process.env.EXPO_PUBLIC_APP_BASE_URL ||
          "https://financify-rose.vercel.app";

        // Fire-and-forget: don't await, don't block navigation
        authenticatedFetch(`${BASE_URL}/api/memory`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "onboarding_profile",
            profileData,
            intentAnswers,
          }),
        }).catch((error) => {
          // Log but don't throw - onboarding memory storage shouldn't block user flow
          logger.warn(
            "⚠️ [ONBOARDING_INTENT3] Failed to store onboarding memory:",
            error
          );
        });

        logger.info(
          "✅ [ONBOARDING_INTENT3] Triggered onboarding memory storage"
        );
      }
    } catch (error) {
      // Log but don't throw - onboarding memory storage shouldn't block user flow
      logger.warn(
        "⚠️ [ONBOARDING_INTENT3] Error preparing onboarding memory storage:",
        error
      );
    }
  };

  return (
    <IntentQuestionScreen
      title="Could you cover a $1,000 emergency expense?"
      options={OPTIONS}
      storageKey="emergency_readiness"
      profileField="intent_q3"
      onboardingStep={3}
      nextRoute="/onboarding-connect"
      logStage="q1_3"
      screenKey="onboarding-intent3"
      onBeforeNavigate={handleBeforeNavigate}
    />
  );
}
