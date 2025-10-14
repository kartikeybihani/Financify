// app/(root)/_layout.tsx

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
import { runStorageMigrationV2 } from "@/src/utils/migrate";
import logger from "@/src/utils/logger";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { setupGlobalErrorHandling } from "@/src/utils/errorBoundary";

SplashScreen.preventAutoHideAsync();
setupGlobalErrorHandling();

function RootLayoutNav() {
  const { isLoading } = useAuthNavigation();

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
