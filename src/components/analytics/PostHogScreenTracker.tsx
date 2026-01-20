import React, { useEffect, useRef } from "react";
import { usePathname, useSegments } from "expo-router";
import { usePostHog } from "posthog-react-native";

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
 */
export default function PostHogScreenTracker() {
  const posthog = usePostHog();
  const pathname = usePathname();
  const segments = useSegments();

  const lastScreenNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog) return;
    if (!pathname) return;

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

    posthog.screen(screenName);
  }, [posthog, pathname, segments]);

  return null;
}
