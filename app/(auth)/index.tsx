import { Redirect } from "expo-router";
import {
  useAuthNavigation,
  NavigationState,
} from "@/src/contexts/AuthNavigationContext";

export default function AuthIndex() {
  const { navigationState, isLoading } = useAuthNavigation();

  // If user should be onboarding, authenticated, or in recovery, let root or redirect
  if (!isLoading && navigationState !== NavigationState.PRE_SIGNUP) {
    if (navigationState === NavigationState.RECOVERY) {
      return <Redirect href="/(auth)/reset-password" />;
    }
    return null; // Let root index.tsx handle the redirect
  }

  return <Redirect href="/(auth)/welcome" />;
}
