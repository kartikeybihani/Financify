import React from "react";
import IntentQuestionScreen, {
  IntentOption,
} from "@/src/components/onboarding/IntentQuestionScreen";

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
      backRoute="/onboarding-intent2"
    />
  );
}
