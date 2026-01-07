import React from "react";
import IntentQuestionScreen, {
  IntentOption,
} from "@/src/components/onboarding/IntentQuestionScreen";

const OPTIONS: IntentOption[] = [
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
  return (
    <IntentQuestionScreen
      title="How do you feel about money right now?"
      options={OPTIONS}
      storageKey="money_mindset"
      profileField="intent_q1"
      onboardingStep={2}
      nextRoute="/onboarding-intent2"
      logStage="q1_1"
      screenKey="onboarding-intent1"
    />
  );
}
