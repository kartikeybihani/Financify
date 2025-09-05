// app/(root)/_layout.tsx
import React from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-reanimated";
import AuthProvider, { useAuth } from "./contexts/AuthContext";
import { runStorageMigrationV2 } from "./utils/migrate";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const handleNavigation = async () => {
      const inAuth = segments[0] === "(auth)";
      const inOnboarding = segments[0] === "(onboarding)";
      const inTabs = segments[0] === "(tabs)";

      if (!session) {
        if (!inAuth && !inOnboarding) {
          router.replace("/(onboarding)/welcome");
        }
        return;
      }

      // Check AsyncStorage first for development hot reload persistence
      const cachedOnboardingComplete = await AsyncStorage.getItem(
        "onboarding_complete"
      );
      const cachedUserAuthenticated = await AsyncStorage.getItem(
        "user_authenticated"
      );

      // If we have cached completion status, trust it (helps with hot reloads)
      if (
        cachedOnboardingComplete === "true" &&
        cachedUserAuthenticated === "true"
      ) {
        console.log("✅ Using cached onboarding completion status");
        if (inAuth || inOnboarding) {
          router.replace("/(tabs)");
        }
        return;
      }

      const meta = session.user.user_metadata || {};
      const onboardingDone = meta.onboarding_complete === true;
      const hasIntent = !!meta.intent || !!meta.intents; // Support both old and new format
      const hasBank = !!meta.hasConnectedBank;

      // If onboarding is done in Supabase, update cache
      if (onboardingDone) {
        await AsyncStorage.setItem("onboarding_complete", "true");
        await AsyncStorage.setItem("user_authenticated", "true");
      }

      if (!onboardingDone) {
        // Clear cache if onboarding is not done
        await AsyncStorage.removeItem("onboarding_complete");
        await AsyncStorage.removeItem("user_authenticated");

        // Only auto-navigate if user is not already in onboarding screens
        // This prevents navigation loops when user manually navigates between screens
        if (inOnboarding) {
          return; // Let user navigate freely within onboarding
        }

        // Auto-navigation logic only for users coming from outside onboarding
        if (!hasBank && !hasIntent) {
          // No intent and no bank → start at intent screen
          router.replace("/(onboarding)/intent");
        } else if (!hasBank) {
          // Has intent but no bank → go to account connection
          router.replace("/(onboarding)/accountconnection");
        } else {
          // Has bank → go to final screen
          router.replace("/(onboarding)/final");
        }
        return;
      }

      if (inAuth || inOnboarding) {
        router.replace("/(tabs)");
      }
    };

    handleNavigation();
  }, [session, segments, isLoading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
          gestureEnabled: true,
          gestureDirection: "vertical",
        }}
      />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    const initializeApp = async () => {
      if (loaded) {
        try {
          // Run storage migration before anything else
          await runStorageMigrationV2();
        } catch (error) {
          console.error("Migration error:", error);
        }
        SplashScreen.hideAsync();
      }
    };

    initializeApp();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <RootLayoutNav />
      <StatusBar style="light" />
    </AuthProvider>
  );
}
