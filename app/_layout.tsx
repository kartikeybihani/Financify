// app/(root)/_layout.tsx

import React from "react";
import "react-native-reanimated";
import { Stack, useRouter, useSegments } from "expo-router";

import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthProvider, { useAuth } from "@/app/_contexts/AuthContext";
import { runStorageMigrationV2 } from "@/src/utils/migrate";
import logger from "@/app/_utils/logger";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [navigationReady, setNavigationReady] = useState(false);
  const [cachedOnboardingStatus, setCachedOnboardingStatus] = useState<{
    onboardingComplete: boolean;
    userAuthenticated: boolean;
  } | null>(null);

  // Pre-load cached onboarding status to prevent navigation flashes
  useEffect(() => {
    const loadCachedStatus = async () => {
      try {
        const [cachedOnboardingComplete, cachedUserAuthenticated] =
          await Promise.all([
            AsyncStorage.getItem("onboarding_complete"),
            AsyncStorage.getItem("user_authenticated"),
          ]);

        setCachedOnboardingStatus({
          onboardingComplete: cachedOnboardingComplete === "true",
          userAuthenticated: cachedUserAuthenticated === "true",
        });
        setNavigationReady(true);
      } catch (error) {
        logger.error("Error loading cached status:", error);
        setNavigationReady(true); // Still allow navigation even if cache fails
      }
    };

    loadCachedStatus();
  }, []);

  useEffect(() => {
    // Wait for both auth loading and navigation readiness
    if (isLoading || !navigationReady || !cachedOnboardingStatus) return;

    const handleNavigation = async () => {
      const inAuth = segments[0] === "(auth)";
      const inOnboarding = segments[0] === "(onboarding)";
      const inTabs = segments[0] === "(tabs)";

      if (!session) {
        if (!inAuth && !inOnboarding) {
          router.replace("/(onboarding)/welcome" as any);
        }
        return;
      }

      // Use pre-loaded cached status for immediate decision making
      if (
        cachedOnboardingStatus.onboardingComplete &&
        cachedOnboardingStatus.userAuthenticated
      ) {
        logger.info("✅ Using cached onboarding completion status");
        if (inAuth || inOnboarding) {
          router.replace("/(tabs)/chat" as any);
        }
        return;
      }

      const meta = session.user.user_metadata || {};
      const onboardingDone = meta.onboarding_complete === true;
      const hasIntent = !!meta.intent || !!meta.intents; // Support both old and new format
      const hasBank = !!meta.hasConnectedBank;

      // If onboarding is done in Supabase, update cache and go to tabs
      if (onboardingDone) {
        await AsyncStorage.setItem("onboarding_complete", "true");
        await AsyncStorage.setItem("user_authenticated", "true");
        setCachedOnboardingStatus({
          onboardingComplete: true,
          userAuthenticated: true,
        });
        logger.info(
          "✅ Onboarding complete in Supabase, updating cache and going to tabs"
        );
        if (!inTabs) {
          router.replace("/(tabs)/chat" as any);
        }
        return;
      }

      // Clear cache if onboarding is not done
      await AsyncStorage.removeItem("onboarding_complete");
      await AsyncStorage.removeItem("user_authenticated");
      setCachedOnboardingStatus({
        onboardingComplete: false,
        userAuthenticated: false,
      });

      // Only auto-navigate if user is not already in onboarding screens
      // This prevents navigation loops when user manually navigates between screens
      if (inOnboarding) {
        return; // Let user navigate freely within onboarding
      }

      // Auto-navigation logic only for users coming from outside onboarding
      if (!hasBank && !hasIntent) {
        // No intent and no bank → start at intent screen
        router.replace("/(onboarding)/intent" as any);
      } else if (!hasBank) {
        // Has intent but no bank → go to account connection
        router.replace("/(onboarding)/accountconnection" as any);
      } else {
        // Has bank → go to final screen
        router.replace("/(onboarding)/final" as any);
      }
    };

    handleNavigation();
  }, [session, segments, isLoading, navigationReady, cachedOnboardingStatus]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="investments"
        options={{
          headerShown: false,
          presentation: "card",
          animation: "slide_from_right",
          gestureEnabled: true,
          gestureDirection: "horizontal",
        }}
      />
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
          logger.error("Migration error:", error);
        }
        SplashScreen.hideAsync();
      }
    };

    initializeApp();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <ActionSheetProvider>
        <>
          <RootLayoutNav />
          <StatusBar style="light" backgroundColor="transparent" translucent />
        </>
      </ActionSheetProvider>
    </AuthProvider>
  );
}
