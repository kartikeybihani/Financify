import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  useAuthNavigation,
  NavigationState,
} from "@/src/contexts/AuthNavigationContext";

export default function AuthLayout() {
  const { isLoading, navigationState } = useAuthNavigation();
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  // If user is signed-in or onboarding, bounce out of the auth group once
  useEffect(() => {
    if (
      !isLoading &&
      navigationState !== NavigationState.PRE_SIGNUP &&
      !hasRedirectedRef.current
    ) {
      hasRedirectedRef.current = true;

      // Determine target route based on navigation state
      let targetRoute = "/";
      if (navigationState === NavigationState.AUTHENTICATED) {
        targetRoute = "/(tabs)";
      } else if (navigationState === NavigationState.ONBOARDING_FINAL) {
        targetRoute = "/(onboarding-complete)";
      } else if (navigationState === NavigationState.ONBOARDING) {
        // Will be handled by index.tsx based on onboardingStep
        targetRoute = "/";
      }

      // Use setTimeout to ensure state updates have propagated before navigation
      setTimeout(() => {
        router.replace(targetRoute as any);
      }, 50);
    }
  }, [isLoading, navigationState, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#121212" }, // Dark background to match app theme
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      <Stack.Screen
        name="paywall"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
          gestureEnabled: true,
          gestureDirection: "vertical",
        }}
      />
    </Stack>
  );
}
