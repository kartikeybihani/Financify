import React, { useEffect, useRef } from "react";
import { usePathname, useSegments } from "expo-router";
import { usePostHog } from "posthog-react-native";
import logger from "@/src/utils/core/logger";

const isGroupSegment = (segment: string) =>
  segment.startsWith("(") && segment.endsWith(")");

const toTitle = (value: string) =>
  value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Expo Router screen tracking for PostHog.
 *
 * PostHog's RN SDK can auto-track screen views for React Navigation v6.
 * Expo Router uses React Navigation v7 under the hood, so this component
 * performs a lightweight manual `posthog.screen()` whenever the pathname changes.
 * 
 * This component is defensive and won't crash if PostHog is unavailable.
 */
export default function PostHogScreenTracker() {
  // usePostHog hook must be called unconditionally (React rules)
  // It will return null if PostHogProvider is not available or failed
  const posthog = usePostHog();
  const pathname = usePathname();
  const segments = useSegments();

  const lastScreenNameRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // Wait for PostHog to be ready and pathname to be available
    if (!posthog) return;
    if (!pathname) return;
    
    // Small delay to ensure PostHog native module is fully initialized
    // This prevents crashes during early app initialization
    if (!isInitializedRef.current) {
      const timer = setTimeout(() => {
        isInitializedRef.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }

    try {
      const meaningfulSegments = (segments ?? []).filter(
        (s) => typeof s === "string" && s.length > 0 && !isGroupSegment(s)
      );

      // Example: /(tabs)/chat/finny-settings -> "Tabs > Chat > Finny Settings"
      // The (tabs) group segment is removed.
      const screenName = meaningfulSegments.length
        ? meaningfulSegments.map(toTitle).join(" > ")
        : toTitle(pathname.replace(/^\//, "")) || "Root";

      if (lastScreenNameRef.current === screenName) return;
      lastScreenNameRef.current = screenName;

      // Wrap in try-catch to prevent crashes from native module errors
      posthog.screen(screenName);
    } catch (error) {
      // Log but don't crash - analytics failures shouldn't break the app
      logger.warn("[PostHog] Failed to track screen:", error);
    }
  }, [posthog, pathname, segments]);

  return null;
}
