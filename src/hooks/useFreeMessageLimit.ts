import { useCallback, useEffect, useRef, useState } from "react";
import AppStorage from "@/src/utils/storage/storage";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { FREE_MESSAGES_PER_DAY, FREE_MESSAGES_COUNT_KEY_PREFIX } from "@/src/constants/subscription";

function todayKeyForDate(userId: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${FREE_MESSAGES_COUNT_KEY_PREFIX}_${userId}_${y}-${m}-${d}`;
}

function todayKey(userId: string): string {
  return todayKeyForDate(userId, new Date());
}

function todayWindow(): { startIso: string; endIso: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function readCachedCount(userId: string): number {
  const raw = AppStorage.getItemSync(todayKey(userId));
  if (raw == null) return 0;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

function writeCachedCount(userId: string, count: number) {
  AppStorage.setItemSync(todayKey(userId), String(Math.max(0, count)));
}

export function useFreeMessageLimit(userId: string | null) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const trackedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    countRef.current = count;
  }, [count]);

  const getCount = useCallback((): number => {
    if (!userId) {
      return 0;
    }

    const activeKey = todayKey(userId);
    if (trackedKeyRef.current !== activeKey) {
      return 0;
    }

    return countRef.current;
  }, [userId]);

  const refreshCount = useCallback(
    async (
      overrideUserId?: string | null,
      minimumCount: number = 0,
    ): Promise<number> => {
      const effectiveUserId = overrideUserId ?? userId;

      if (!effectiveUserId) {
        trackedKeyRef.current = null;
        countRef.current = 0;
        setCount(0);
        return 0;
      }

      const activeKey = todayKey(effectiveUserId);
      const trackedCount =
        trackedKeyRef.current === activeKey ? countRef.current : 0;
      const cachedCount = Math.max(
        minimumCount,
        trackedCount,
        readCachedCount(effectiveUserId),
      );

      trackedKeyRef.current = activeKey;
      countRef.current = cachedCount;
      setCount(cachedCount);

      try {
        const { startIso, endIso } = todayWindow();
        const { count: remoteCount, error } = await supabase
          .from("conversation_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", effectiveUserId)
          .gte("timestamp", startIso)
          .lt("timestamp", endIso);

        if (error) {
          throw error;
        }

        const nextCount = Math.max(minimumCount, remoteCount ?? 0);
        trackedKeyRef.current = activeKey;
        countRef.current = nextCount;
        setCount(nextCount);
        writeCachedCount(effectiveUserId, nextCount);
        return nextCount;
      } catch (error) {
        logger.warn(
          "[FREE_MESSAGE_LIMIT] Failed to refresh count from conversation_logs",
          error,
        );
        trackedKeyRef.current = activeKey;
        countRef.current = cachedCount;
        writeCachedCount(effectiveUserId, cachedCount);
        return cachedCount;
      }
    },
    [userId],
  );

  const recordSent = useCallback(
    (overrideUserId?: string | null): number => {
      const effectiveUserId = overrideUserId ?? userId;
      const activeKey = effectiveUserId ? todayKey(effectiveUserId) : null;
      const baseCount =
        activeKey && trackedKeyRef.current === activeKey ? countRef.current : 0;
      const nextCount = baseCount + 1;
      trackedKeyRef.current = activeKey;
      countRef.current = nextCount;
      setCount(nextCount);
      if (effectiveUserId) {
        writeCachedCount(effectiveUserId, nextCount);
      }
      return nextCount;
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) {
      trackedKeyRef.current = null;
      countRef.current = 0;
      setCount(0);
      return;
    }

    const cachedCount = readCachedCount(userId);
    trackedKeyRef.current = todayKey(userId);
    countRef.current = cachedCount;
    setCount(cachedCount);
    void refreshCount(userId, cachedCount);
  }, [refreshCount, userId]);

  const limitReached = useCallback((): boolean => {
    return getCount() >= FREE_MESSAGES_PER_DAY;
  }, [getCount]);

  const remaining = useCallback((): number => {
    return Math.max(0, FREE_MESSAGES_PER_DAY - getCount());
  }, [getCount]);

  return { getCount, refreshCount, recordSent, limitReached, remaining };
}
