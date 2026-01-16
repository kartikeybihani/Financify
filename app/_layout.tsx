// app/(root)/_layout.tsx

// Polyfill for crypto.getRandomValues (required for uuid package in React Native)
import "react-native-get-random-values";

import React from "react";
import "react-native-reanimated";
import { Stack } from "expo-router";

import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import AuthNavigationProvider, {
  useAuthNavigation,
} from "@/src/contexts/AuthNavigationContext";
import NavigationLoadingScreen from "@/src/components/shared/NavigationLoadingScreen";
import { runStorageMigrationV2 } from "@/src/utils/core/migrate";
import { runCacheMigration } from "@/src/shared/utils/cacheMigration";
import logger from "@/src/utils/core/logger";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { setupGlobalErrorHandling } from "@/src/utils/core/errorBoundary";
import { useNotificationSetup } from "@/src/hooks/useNotificationSetup";

SplashScreen.preventAutoHideAsync();
setupGlobalErrorHandling();

function RootLayoutNav() {
  const { isLoading } = useAuthNavigation();

  // Initialize notifications
  useNotificationSetup();

  // Show loading screen only during initial auth check
  if (isLoading) {
    return <NavigationLoadingScreen message="Getting ready..." />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboarding-intent1" />
      <Stack.Screen name="onboarding-intent2" />
      <Stack.Screen name="onboarding-intent3" />
      <Stack.Screen name="onboarding-profile" />
      <Stack.Screen name="onboarding-connect" />
      <Stack.Screen name="(onboarding-complete)" />
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
    Manrope: require("../assets/fonts/Manrope-Regular.ttf"),
    ManropeBold: require("../assets/fonts/Manrope-Bold.ttf"),
    ManropeExtraBold: require("../assets/fonts/Manrope-ExtraBold.ttf"),
    ManropeLight: require("../assets/fonts/Manrope-Light.ttf"),
    ManropeMedium: require("../assets/fonts/Manrope-Medium.ttf"),
    ManropeSemiBold: require("../assets/fonts/Manrope-SemiBold.ttf"),
    ManropeExtraLight: require("../assets/fonts/Manrope-ExtraLight.ttf"),
  });

  useEffect(() => {
    const initializeApp = async () => {
      if (loaded) {
        try {
          // Run storage migration before anything else
          await runStorageMigrationV2();
          // Run cache migration to clear old global cache keys
          await runCacheMigration();
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
    <AuthNavigationProvider>
      <ActionSheetProvider>
        <>
          <RootLayoutNav />
          <StatusBar style="light" backgroundColor="transparent" translucent />
        </>
      </ActionSheetProvider>
    </AuthNavigationProvider>
  );
}
