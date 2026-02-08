import { useCallback } from "react";
import AppStorage from "@/src/utils/storage/storage";
import { FREE_MESSAGES_PER_DAY, FREE_MESSAGES_COUNT_KEY_PREFIX } from "@/src/constants/subscription";

function todayKey(userId: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${FREE_MESSAGES_COUNT_KEY_PREFIX}_${userId}_${y}-${m}-${d}`;
}

export function useFreeMessageLimit(userId: string | null) {
  const getCount = useCallback((): number => {
    if (!userId) return 0;
    const key = todayKey(userId);
    const raw = AppStorage.getItemSync(key);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : Math.max(0, n);
  }, [userId]);

  const incrementCount = useCallback((): number => {
    if (!userId) return 0;
    const key = todayKey(userId);
    const next = getCount() + 1;
    AppStorage.setItemSync(key, String(next));
    return next;
  }, [userId, getCount]);

  const limitReached = useCallback((): boolean => {
    return getCount() >= FREE_MESSAGES_PER_DAY;
  }, [getCount]);

  const remaining = useCallback((): number => {
    return Math.max(0, FREE_MESSAGES_PER_DAY - getCount());
  }, [getCount]);

  return { getCount, incrementCount, limitReached, remaining };
}
