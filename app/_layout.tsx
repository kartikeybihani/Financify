// app/(root)/_layout.tsx
import React from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect } from "react";
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

    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "(onboarding)";
    const inTabs = segments[0] === "(tabs)";

    if (!session) {
      if (!inAuth && !inOnboarding) {
        router.replace("/(onboarding)/welcome");
      }
      return;
    }

    const meta = session.user.user_metadata || {};
    const onboardingDone = meta.onboarding_complete === true;
    const hasIntent = !!meta.intent;
    const hasBank = !!meta.hasConnectedBank;

    if (!onboardingDone) {
      if (!hasIntent) {
        router.replace("/(onboarding)/intent");
      } else if (!hasBank) {
        router.replace("/(onboarding)/accountconnection");
      } else {
        router.replace("/(onboarding)/final");
      }
      return;
    }

    if (inAuth || inOnboarding) {
      router.replace("/(tabs)");
    }
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
        // Run storage migration before anything else
        await runStorageMigrationV2();
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
