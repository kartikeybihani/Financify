import { DeviceEventEmitter } from "react-native";
import logger from "@/src/utils/core/logger";

export type LaunchMetricEvent =
  | "launch_open"
  | "native_splash_hidden"
  | "brand_flash_start"
  | "brand_flash_end"
  | "home_first_interaction";

const launchEventTimestamps: Partial<Record<LaunchMetricEvent, number>> = {};
const launchEvents: LaunchMetricPayload[] = [];

export interface LaunchMetricPayload {
  event: LaunchMetricEvent;
  timestamp: number;
  metadata: Record<string, unknown>;
}

function emitLaunchTimingSummary(): void {
  const openTs = launchEventTimestamps.launch_open;
  const homeInteractionTs = launchEventTimestamps.home_first_interaction;
  const splashHiddenTs = launchEventTimestamps.native_splash_hidden;
  const flashEndTs = launchEventTimestamps.brand_flash_end;

  if (openTs && homeInteractionTs) {
    logger.info("[LAUNCH] open_to_home_interaction_ms", {
      durationMs: homeInteractionTs - openTs,
    });
  }

  if (splashHiddenTs && flashEndTs) {
    logger.info("[LAUNCH] splash_hidden_to_flash_end_ms", {
      durationMs: flashEndTs - splashHiddenTs,
    });
  }
}

export function markLaunchEvent(
  event: LaunchMetricEvent,
  metadata: Record<string, unknown> = {},
): number {
  if (launchEventTimestamps[event]) {
    return launchEventTimestamps[event] as number;
  }

  const timestamp = Date.now();
  launchEventTimestamps[event] = timestamp;
  const payload: LaunchMetricPayload = {
    event,
    timestamp,
    metadata,
  };
  launchEvents.push(payload);

  logger.info(`[LAUNCH] ${event}`, {
    timestamp,
    ...metadata,
  });

  DeviceEventEmitter.emit("launchMetric", payload);

  emitLaunchTimingSummary();
  return timestamp;
}

export function getLaunchEventTimestamp(
  event: LaunchMetricEvent,
): number | undefined {
  return launchEventTimestamps[event];
}

export function getLaunchEventsSnapshot(): LaunchMetricPayload[] {
  return [...launchEvents];
}
