import { Redirect } from "expo-router";
import {
  useAuthNavigation,
  NavigationState,
} from "@/src/contexts/AuthNavigationContext";

export default function Index() {
  const { isLoading, navigationState, onboardingStep } = useAuthNavigation();

  // Show nothing while loading (parent shows loading screen)
  if (isLoading) {
    return null;
  }

  // Declarative navigation based on state
  switch (navigationState) {
    case NavigationState.PRE_SIGNUP:
      return <Redirect href="/(auth)/welcome" />;

    case NavigationState.ONBOARDING:
      // Route to specific onboarding step
      if (onboardingStep === 1) {
        return <Redirect href="/onboarding-profile" />;
      }
      if (onboardingStep === 2) {
        return <Redirect href="/onboarding-intent1" />;
      }
      if (onboardingStep === 3) {
        return <Redirect href="/onboarding-connect" />;
      }
      if (onboardingStep === 4) {
        return <Redirect href="/(onboarding-complete)" />;
      }
      // Default to profile screen if step is 0 or unknown
      return <Redirect href="/onboarding-profile" />;

    case NavigationState.ONBOARDING_FINAL:
      return <Redirect href="/(onboarding-complete)" />;

    case NavigationState.AUTHENTICATED:
      return <Redirect href="/(tabs)" />;

    default:
      return <Redirect href="/(auth)/welcome" />;
  }
}
