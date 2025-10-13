import { Redirect } from "expo-router";
import { useNavigationContext } from "@/src/contexts/NavigationContext";
import { NavigationState } from "@/src/contexts/NavigationContext";

export default function Index() {
  const { isLoading, navigationState } = useNavigationContext();

  if (isLoading) {
    return null;
  }

  // Let NavigationContext handle all navigation decisions
  // It will determine the correct screen based on onboarding status
  switch (navigationState) {
    case NavigationState.PRE_SIGNUP:
      return <Redirect href="/(auth)/welcome" />;
    case NavigationState.ONBOARDING:
      // Let NavigationContext determine the specific onboarding screen
      return null; // This will be handled by NavigationContext
    case NavigationState.ONBOARDING_FINAL:
      // Let NavigationContext handle the final onboarding screen
      return null; // This will be handled by NavigationContext
    case NavigationState.AUTHENTICATED:
      return <Redirect href="/(tabs)/chat" />;
    default:
      return <Redirect href="/(auth)/welcome" />;
  }
}
