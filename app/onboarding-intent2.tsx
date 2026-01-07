import React from "react";
import IntentQuestionScreen, {
  IntentOption,
} from "@/src/components/onboarding/IntentQuestionScreen";

const OPTIONS: IntentOption[] = [
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
];

export default function IntentQuestion2Screen() {
  return (
    <IntentQuestionScreen
      title="How stressed do you feel financially?"
      options={OPTIONS}
      storageKey="stress_level"
      profileField="intent_q2"
      onboardingStep={2}
      nextRoute="/onboarding-intent3"
      logStage="q1_2"
      screenKey="onboarding-intent2"
    />
  );
}
