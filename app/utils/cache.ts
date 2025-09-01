// app/utils/cache.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

type Envelope<T> = { v: T; exp: number };

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const { v, exp } = JSON.parse(raw) as Envelope<T>;
    if (exp && Date.now() > exp) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number) {
  const env: Envelope<T> = { v: value, exp: Date.now() + ttlMs };
  await AsyncStorage.setItem(key, JSON.stringify(env));
}

export async function cacheRemove(key: string) {
  await AsyncStorage.removeItem(key);
}

// Cache key helpers
export function txPreviewKey(userId: string, itemId: string): string {
  return `tx_preview::${userId}::${itemId}`;
}

export function balancesKey(userId: string, itemId: string): string {
  return `balances::${userId}::${itemId}`;
}

export function institutionKey(userId: string, itemId: string): string {
  return `institution::${userId}::${itemId}`;
}

export function lastSyncKey(userId: string, itemId: string): string {
  return `last_sync_at::${userId}::${itemId}`;
}

// TTL constants
export const TX_TTL = 15 * 60 * 1000; // 15 minutes
export const BAL_TTL = 5 * 60 * 1000;  // 5 minutes  
export const INST_TTL = 24 * 60 * 60 * 1000; // 1 day
