import React from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import "react-native-reanimated";
import AuthProvider, { useAuth } from "./contexts/AuthContext";

// import { useColorScheme } from "@/hooks/useColorScheme";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";
    const isSparkScreen = segments[1] === "spark";
    const isIntentScreen = segments[1] === "intent";
    const isConnectionScreen = segments[1] === "accountconnection";

    if (!session) {
      // Unauthenticated user - direct to spark screen
      if (!isSparkScreen && !inAuthGroup) {
        router.replace("/(onboarding)/spark");
      }
      return;
    }

    // User is authenticated
    const hasCompletedOnboarding =
      session.user.user_metadata?.intent &&
      session.user.user_metadata?.hasConnectedBank;

    if (!hasCompletedOnboarding) {
      // New user needs to complete onboarding
      if (
        !session.user.user_metadata?.intent &&
        !isIntentScreen &&
        !isConnectionScreen
      ) {
        router.replace("/(onboarding)/intent");
      } else if (
        !session.user.user_metadata?.hasConnectedBank &&
        !isConnectionScreen
      ) {
        router.replace("/(onboarding)/accountconnection");
      }
    } else if (hasCompletedOnboarding && (inAuthGroup || inOnboardingGroup)) {
      // Existing user with completed onboarding
      router.replace("/(tabs)");
    }
  }, [session, segments, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
          headerShown: false,
          contentStyle: {
            backgroundColor: "transparent",
          },
        }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  // const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
      <StatusBar style="light" />
    </AuthProvider>
  );
}
