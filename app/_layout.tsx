// app/(root)/_layout.tsx

// Polyfill for crypto.getRandomValues (required for uuid package in React Native)
import "react-native-get-random-values";

import React, { useCallback, useEffect, useRef, useState } from "react";
import "react-native-reanimated";
import { Stack } from "expo-router";
import * as Linking from "expo-linking";
import { AccessibilityInfo } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import AuthNavigationProvider, {
  useAuthNavigation,
} from "@/src/contexts/AuthNavigationContext";
import { DemoProvider } from "@/src/contexts/DemoContext";
import {
  SubscriptionProvider,
  useSubscription,
} from "@/src/contexts/SubscriptionContext";
import PaywallModal from "./(auth)/paywall";
import { runStorageMigrationV2 } from "@/src/utils/core/migrate";
import { runCacheMigration } from "@/src/shared/utils/cacheMigration";
import logger from "@/src/utils/core/logger";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { SafePostHogProvider } from "@/src/components/analytics/SafePostHogProvider";
import PostHogScreenTracker from "@/src/components/analytics/PostHogScreenTracker";
import LaunchEventTracker from "@/src/components/analytics/LaunchEventTracker";
import { setupGlobalErrorHandling } from "@/src/utils/core/errorBoundary";
import { setLastDeepLink } from "@/src/utils/linking/linkingStore";
import { migrateAsyncStorageToMMKV } from "@/src/utils/storage/storage";
import BrandFlashOverlay from "@/src/components/launch/BrandFlashOverlay";
import { markLaunchEvent } from "@/src/utils/analytics/launchMetrics";

type LaunchPhase =
  | "bootingNative"
  | "jsCover"
  | "brandFlashAnimating"
  | "ready";

const BRAND_FLASH_ROTATE_MS = 3360;
const BRAND_FLASH_FADE_MS = 120;
const BRAND_FLASH_MAX_MS = 4300;

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
  const [launchPhase, setLaunchPhase] = useState<LaunchPhase>("bootingNative");
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const hasHiddenNativeSplashRef = useRef(false);
  const hasCompletedBrandFlashRef = useRef(false);
  const brandFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const completeBrandFlash = useCallback(
    (reason: "animation_complete" | "timeout_fallback") => {
      if (hasCompletedBrandFlashRef.current) return;

      hasCompletedBrandFlashRef.current = true;
      if (brandFlashTimeoutRef.current) {
        clearTimeout(brandFlashTimeoutRef.current);
        brandFlashTimeoutRef.current = null;
      }

      markLaunchEvent("brand_flash_end", { reason });
      setLaunchPhase("ready");
    },
    [],
  );

  useEffect(() => {
    markLaunchEvent("launch_open");

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => setReduceMotionEnabled(enabled))
      .catch(() => {
        setReduceMotionEnabled(false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotionEnabled,
    );

    return () => {
      subscription.remove();
      if (brandFlashTimeoutRef.current) {
        clearTimeout(brandFlashTimeoutRef.current);
        brandFlashTimeoutRef.current = null;
      }
    };
  }, []);

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
    if (
      !loaded ||
      !navigationReady ||
      hasHiddenNativeSplashRef.current
    ) {
      return;
    }

    hasHiddenNativeSplashRef.current = true;

    const transitionFromNativeSplash = async () => {
      const waitForCoverPaint = async () => {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
      };

      // Phase 1: mount a static JS cover before hiding native splash
      setLaunchPhase("jsCover");
      await waitForCoverPaint();

      try {
        // Hide native splash only after JS cover is painted
        await SplashScreen.hideAsync();
      } catch (error) {
        logger.error("Failed to hide native splash screen:", error);
      }

      markLaunchEvent("native_splash_hidden");

      // Phase 2: run brand animation while cover remains on screen
      markLaunchEvent("brand_flash_start");
      setLaunchPhase("brandFlashAnimating");
      brandFlashTimeoutRef.current = setTimeout(() => {
        completeBrandFlash("timeout_fallback");
      }, BRAND_FLASH_MAX_MS);
    };

    transitionFromNativeSplash();
  }, [completeBrandFlash, loaded, navigationReady]);

  if (!loaded) return null;

  function PaywallGate() {
    const { paywallVisible, hidePaywall } = useSubscription();
    return (
      <PaywallModal
        visible={paywallVisible}
        onClose={(reason) => hidePaywall(reason)}
      />
    );
  }

  // Render app structure first, then wrap with PostHog after bridge is ready
  const appContent = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthNavigationProvider>
        <DemoProvider>
          <SubscriptionProvider>
            {postHogReady && <PostHogScreenTracker />}
            {postHogReady && <LaunchEventTracker />}
            <NavigationReadyTracker onReady={() => setNavigationReady(true)} />
            <ActionSheetProvider>
              <>
                <RootLayoutNav />
                <PaywallGate />
                <StatusBar
                  style="light"
                  backgroundColor="transparent"
                  translucent
                />
                {(launchPhase === "jsCover" ||
                  launchPhase === "brandFlashAnimating") && (
                  <BrandFlashOverlay
                    onComplete={() => completeBrandFlash("animation_complete")}
                    animate={launchPhase === "brandFlashAnimating"}
                    reduceMotionEnabled={reduceMotionEnabled}
                    rotateMs={BRAND_FLASH_ROTATE_MS}
                    fadeMs={BRAND_FLASH_FADE_MS}
                  />
                )}
              </>
            </ActionSheetProvider>
          </SubscriptionProvider>
        </DemoProvider>
      </AuthNavigationProvider>
    </GestureHandlerRootView>
  );

  // Only initialize PostHog after React Native bridge is ready
  if (!postHogReady) {
    return appContent;
  }

  const posthogApiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ?? "";
  if (!posthogApiKey) {
    logger.warn("[PostHog] EXPO_PUBLIC_POSTHOG_KEY not set; analytics disabled");
    return appContent;
  }

  return (
    <SafePostHogProvider
      apiKey={posthogApiKey}
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
