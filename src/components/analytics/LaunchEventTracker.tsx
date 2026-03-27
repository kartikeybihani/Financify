import { useEffect, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import { usePostHog } from "posthog-react-native";
import logger from "@/src/utils/core/logger";
import {
  getLaunchEventsSnapshot,
  LaunchMetricPayload,
} from "@/src/utils/analytics/launchMetrics";

function getPayloadKey(payload: LaunchMetricPayload): string {
  return `${payload.event}:${payload.timestamp}`;
}

export default function LaunchEventTracker() {
  const posthog = usePostHog();
  const capturedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!posthog) return;

    const captureEvent = (payload: LaunchMetricPayload) => {
      const key = getPayloadKey(payload);
      if (capturedKeysRef.current.has(key)) return;
      capturedKeysRef.current.add(key);

      try {
        posthog.capture(payload.event, {
          launch_timestamp_ms: payload.timestamp,
          ...payload.metadata,
        });
      } catch (error) {
        logger.warn("[PostHog] Failed to capture launch metric:", error);
      }
    };

    // Capture events that happened before PostHog provider became ready.
    const earlyEvents = getLaunchEventsSnapshot();
    earlyEvents.forEach(captureEvent);

    const subscription = DeviceEventEmitter.addListener(
      "launchMetric",
      (payload: LaunchMetricPayload) => {
        if (!payload?.event || !payload?.timestamp) return;
        captureEvent(payload);
      },
    );

    return () => {
      subscription.remove();
    };
  }, [posthog]);

  return null;
}
