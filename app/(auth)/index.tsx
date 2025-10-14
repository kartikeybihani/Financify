import { Redirect } from "expo-router";
import {
  useAuthNavigation,
  NavigationState,
} from "@/src/contexts/AuthNavigationContext";

export default function AuthIndex() {
  const { navigationState, isLoading } = useAuthNavigation();

  // If user should be onboarding or authenticated, don't intercept
  if (!isLoading && navigationState !== NavigationState.PRE_SIGNUP) {
    return null; // Let root index.tsx handle the redirect
  }

  return <Redirect href="/(auth)/welcome" />;
}
