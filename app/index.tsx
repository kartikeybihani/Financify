import { Redirect } from "expo-router";
import {
  useAuthNavigation,
  NavigationState,
} from "@/src/contexts/AuthNavigationContext";

export default function Index() {
  const { isLoading, navigationState, onboardingStep } = useAuthNavigation();

  if (isLoading) {
    return null;
  }

  let href: string;
  switch (navigationState) {
    case NavigationState.PRE_SIGNUP:
      href = "/(auth)/welcome";
      break;
    case NavigationState.ONBOARDING:
      if (onboardingStep === 1) href = "/onboarding-profile";
      else if (onboardingStep === 2) href = "/onboarding-intent1";
      else if (onboardingStep === 3) href = "/onboarding-connect";
      else if (onboardingStep === 4) href = "/(onboarding-complete)";
      else href = "/onboarding-profile";
      break;
    case NavigationState.ONBOARDING_FINAL:
      href = "/(onboarding-complete)";
      break;
    case NavigationState.AUTHENTICATED:
      href = "/(tabs)";
      break;
    default:
      href = "/(auth)/welcome";
  }

  return <Redirect href={href as any} />;
}
