// app/(root)/_layout.tsx

// Polyfill for crypto.getRandomValues (required for uuid package in React Native)
import "react-native-get-random-values";

import React, { useEffect, useState } from "react";
import "react-native-reanimated";
import { Stack } from "expo-router";
import * as Linking from "expo-linking";

import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import AuthNavigationProvider, {
  useAuthNavigation,
} from "@/src/contexts/AuthNavigationContext";
import { runStorageMigrationV2 } from "@/src/utils/core/migrate";
import { runCacheMigration } from "@/src/shared/utils/cacheMigration";
import logger from "@/src/utils/core/logger";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { SafePostHogProvider } from "@/src/components/analytics/SafePostHogProvider";
import PostHogScreenTracker from "@/src/components/analytics/PostHogScreenTracker";
import { setupGlobalErrorHandling } from "@/src/utils/core/errorBoundary";
import { useNotificationSetup } from "@/src/hooks/useNotificationSetup";
import { setLastDeepLink } from "@/src/utils/linking/linkingStore";
import { migrateAsyncStorageToMMKV } from "@/src/utils/storage/storage";

// Component to track when navigation is ready
function NavigationReadyTracker({ onReady }: { onReady: () => void }) {
  const { isLoading } = useAuthNavigation();

  useEffect(() => {
    if (!isLoading) {
      // Navigation is ready - notify parent to hide splash
      onReady();
    }
  }, [isLoading, onReady]);

  return null;
}

SplashScreen.preventAutoHideAsync();
setupGlobalErrorHandling();

function RootLayoutNav() {
  // Initialize notifications
  useNotificationSetup();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#121212" }, // Dark background to match app theme
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding-intent1" />
      <Stack.Screen name="onboarding-intent2" />
      <Stack.Screen name="onboarding-intent3" />
      <Stack.Screen name="onboarding-profile" />
      <Stack.Screen name="onboarding-connect" />
      <Stack.Screen name="(onboarding-complete)" />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          animation: "none", // No animation for initial navigation (smooth transition from splash)
        }}
      />
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
    Manrope: require("../assets/fonts/Manrope-Regular.ttf"),
    ManropeBold: require("../assets/fonts/Manrope-Bold.ttf"),
    ManropeExtraBold: require("../assets/fonts/Manrope-ExtraBold.ttf"),
    ManropeLight: require("../assets/fonts/Manrope-Light.ttf"),
    ManropeMedium: require("../assets/fonts/Manrope-Medium.ttf"),
    ManropeSemiBold: require("../assets/fonts/Manrope-SemiBold.ttf"),
    ManropeExtraLight: require("../assets/fonts/Manrope-ExtraLight.ttf"),
  });
  const [postHogReady, setPostHogReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      logger.info("🔗 Global link event", { url });
      setLastDeepLink(url);
    });

    const initializeApp = async () => {
      if (loaded) {
        try {
          // Migrate AsyncStorage to MMKV first (critical for performance)
          await migrateAsyncStorageToMMKV();
          // Run storage migration before anything else
          await runStorageMigrationV2();
          // Run cache migration to clear old global cache keys
          await runCacheMigration();
        } catch (error) {
          logger.error("Migration error:", error);
        }

        // Small delay to ensure React Native bridge is fully ready
        // before initializing PostHog native module
        setTimeout(() => {
          setPostHogReady(true);
        }, 100);
      }
    };

    initializeApp();

    return () => {
      subscription.remove();
    };
  }, [loaded]);

  // Wait for navigation to be ready before hiding splash
  useEffect(() => {
    if (loaded && navigationReady && postHogReady) {
      // Hide splash immediately - home screen is already rendered behind it
      // No delay needed since we're using cached data and dark background
      SplashScreen.hideAsync();
    }
  }, [loaded, navigationReady, postHogReady]);

  if (!loaded) return null;

  // Render app structure first, then wrap with PostHog after bridge is ready
  const appContent = (
    <AuthNavigationProvider>
      {postHogReady && <PostHogScreenTracker />}
      <NavigationReadyTracker onReady={() => setNavigationReady(true)} />
      <ActionSheetProvider>
        <>
          <RootLayoutNav />
          <StatusBar style="light" backgroundColor="transparent" translucent />
        </>
      </ActionSheetProvider>
    </AuthNavigationProvider>
  );

  // Only initialize PostHog after React Native bridge is ready
  if (!postHogReady) {
    return appContent;
  }

  return (
    <SafePostHogProvider
      apiKey="phc_Tt3F486mn1ltHuaKW3csphOfXNAFQZ3oI69ZuPzedIT"
      options={{
        host: "https://us.i.posthog.com",
        enableSessionReplay: false,
      }}
      autocapture
    >
      {appContent}
    </SafePostHogProvider>
  );
}
