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
      router.replace("/");
    }
  }, [isLoading, navigationState, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
    </Stack>
  );
}
