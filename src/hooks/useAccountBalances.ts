// hooks/useAccountBalances.ts

import { useState, useEffect, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import AppStorage from "@/src/utils/storage/storage";
import { Account } from "@/src/types/plaid";
import { getAllUserAccounts } from "@/src/utils/plaid/plaid";
import { supabase } from "@/src/lib/supabase/supabase";
import { useCashEntries } from "./useCashEntries";
import logger from "@/src/utils/core/logger";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
import { getAccountBalance } from "@/src/utils/accountBalance";
import { useDemoMode } from "@/src/contexts/DemoContext";
import { demoAccounts } from "@/src/data/demo";

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper to generate user-specific cache keys
const getBalancesCacheKey = (userId: string) => `${CACHE_CONFIG.KEYS.ACCOUNT_BALANCES}_${userId}`;
const getBalancesCacheTimestampKey = (userId: string) => `${CACHE_CONFIG.KEYS.ACCOUNT_BALANCES_TIMESTAMP}_${userId}`;

interface CachedBalances {
  userId: string; // CRITICAL: Track which user this cache belongs to
  accounts: Account[];
  timestamp: number;
}

const demoAccountsWithBalances: Account[] = demoAccounts.map((a) => ({
  ...a,
  current_balance: a.current_balance ?? undefined,
  available_balance: a.available_balance ?? undefined,
  balances: {
    current: a.current_balance ?? 0,
    available: a.available_balance ?? 0,
  },
}));

export function useAccountBalances() {
  const { isDemoMode } = useDemoMode();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Include cash entries
  const { entries: cashEntries, totalCash, refreshCash } = useCashEntries();

  // Cache management functions
  const saveBalancesToCache = async (userId: string, accounts: Account[]): Promise<void> => {
    try {
      if (!userId) {
        logger.error("❌ [BALANCES CACHE] Cannot save cache without userId");
        return;
      }

      const cacheData: CachedBalances = {
        userId, // Store userId in cached data for validation
        accounts,
        timestamp: Date.now(),
      };
      
      const cacheKey = getBalancesCacheKey(userId);
      const timestampKey = getBalancesCacheTimestampKey(userId);
      
      // Use synchronous operations for better performance
      AppStorage.setItemSync(cacheKey, JSON.stringify(cacheData));
      AppStorage.setItemSync(timestampKey, cacheData.timestamp.toString());
      logger.info("💾 [BALANCES CACHE] Account balances saved to cache for user:", userId.substring(0, 8), accounts.length, "accounts");
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Failed to save balances to cache:", error);
    }
  };

  const loadBalancesFromCache = async (userId: string): Promise<Account[] | null> => {
    try {
      if (!userId) {
        logger.error("❌ [BALANCES CACHE] Cannot load cache without userId");
        return null;
      }

      const cacheKey = getBalancesCacheKey(userId);
      const timestampKey = getBalancesCacheTimestampKey(userId);

      // Use synchronous reads for instant cache access (MMKV advantage)
      const cachedBalancesString = AppStorage.getItemSync(cacheKey);
      const timestampString = AppStorage.getItemSync(timestampKey);

      if (!cachedBalancesString || !timestampString) {
        logger.info("📭 [BALANCES CACHE] No cached balances found for user:", userId.substring(0, 8));
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      logger.info(`📱 [BALANCES CACHE] Cache age: ${Math.round(cacheAge / 1000)}s (max: ${CACHE_DURATION / 1000}s)`);

      const cachedData: CachedBalances = JSON.parse(cachedBalancesString);

      // CRITICAL SECURITY CHECK: Verify cache belongs to current user
      if (cachedData.userId !== userId) {
        logger.error("🔒 [BALANCES CACHE] SECURITY: Cache belongs to different user! Clearing cache.", {
          cachedUserId: cachedData.userId?.substring(0, 8),
          currentUserId: userId.substring(0, 8)
        });
        await clearBalancesCache(userId);
        return null;
      }

      logger.info("📱 [BALANCES CACHE] Loaded from cache for user:", userId.substring(0, 8), cachedData.accounts.length, "accounts");
      return cachedData.accounts;
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Failed to load balances from cache:", error);
      return null;
    }
  };

  const isCacheValid = async (userId: string): Promise<boolean> => {
    try {
      if (!userId) return false;

      const timestampKey = getBalancesCacheTimestampKey(userId);
      const timestampString = AppStorage.getItemSync(timestampKey);
      if (!timestampString) return false;

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      return cacheAge < CACHE_DURATION;
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Failed to check cache validity:", error);
      return false;
    }
  };

  const loadBalancesWithCache = async (): Promise<void> => {
    try {
      if (isDemoMode) {
        setAccounts(demoAccountsWithBalances);
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        logger.error("❌ [BALANCES CACHE] User not authenticated");
        return;
      }

      const userId = authResult.user.id;

      // Always try to load from cache first for immediate UI update
      const cachedAccounts = await loadBalancesFromCache(userId);
      if (cachedAccounts && cachedAccounts.length > 0) {
        logger.info("⚡ [BALANCES CACHE] Using cached balances for immediate display");
        setAccounts(cachedAccounts);
        setIsInitialLoad(false);
      }

      // Check if we need to refresh from server
      const cacheValid = await isCacheValid(userId);
      if (!cacheValid || isInitialLoad) {
        logger.info("🔄 [BALANCES CACHE] Cache invalid or initial load, fetching from server");
        await refreshBalancesFromServer(!!cachedAccounts);
      } else {
        logger.info("✅ [BALANCES CACHE] Cache is valid, skipping server fetch");
        setLoading(false);
        setIsInitialLoad(false);
      }
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Error in loadBalancesWithCache:", error);
      // Fallback to direct server fetch
      await refreshBalancesFromServer(false);
    }
  };

  const refreshBalancesFromServer = async (hasCache: boolean = false): Promise<void> => {
    try {
      if (isDemoMode) {
        setAccounts(demoAccountsWithBalances);
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
      logger.info("🔄 [BALANCES] Refreshing account balances from database...");
      if (!hasCache) {
        setLoading(true);
      }
      
      const authResult = await getAuthenticatedUser();
      
      if (!authResult?.user?.id) {
        logger.error("❌ [BALANCES] User not authenticated for refresh");
        return;
      }
      
      const user = authResult.user;

      logger.info("👤 [BALANCES] User ID for query:", user.id);

      // Get accounts from database
      const accounts = await getAllUserAccounts(user.id);
      
      if (accounts && accounts.length > 0) {
        logger.info("📊 [BALANCES] Loaded accounts from database:", accounts.length, "accounts");
        setAccounts(accounts);
        
        // Save to cache after successful fetch
        await saveBalancesToCache(user.id, accounts);
      } else {
        logger.info("📊 [BALANCES] No accounts found");
        setAccounts([]);
      }
    } catch (e) {
      logger.error("❌ [BALANCES] Failed to load account balances:", e);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  // Wrapper function for external calls (maintains backward compatibility)
  const refreshBalances = async (): Promise<void> => {
    await refreshBalancesFromServer(false);
  };

  const clearBalancesCache = async (userId?: string): Promise<void> => {
    try {
      if (userId) {
        // Clear specific user's cache
        const cacheKey = getBalancesCacheKey(userId);
        const timestampKey = getBalancesCacheTimestampKey(userId);
        // Use synchronous operations
        AppStorage.removeItemSync(cacheKey);
        AppStorage.removeItemSync(timestampKey);
        logger.info("🗑️ [BALANCES CACHE] Cache cleared for user:", userId.substring(0, 8));
      } else {
        // Clear all user caches (for migration/logout)
        const allKeys = AppStorage.getAllKeysSync();
        const balanceKeys = allKeys.filter(key => 
          key.startsWith(CACHE_CONFIG.KEYS.ACCOUNT_BALANCES) ||
          key.startsWith(CACHE_CONFIG.KEYS.ACCOUNT_BALANCES_TIMESTAMP)
        );
        if (balanceKeys.length > 0) {
          AppStorage.multiRemoveSync(balanceKeys);
          logger.info("🗑️ [BALANCES CACHE] Cleared all user caches:", balanceKeys.length, "keys");
        }
      }
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Failed to clear cache:", error);
    }
  };

  // Initialize on mount (and when entering demo mode)
  useEffect(() => {
    loadBalancesWithCache();
  }, [isDemoMode]);

  // Listen for auth state changes (token refresh)
  useEffect(() => {
    const authSubscription = DeviceEventEmitter.addListener(
      "authStateChanged",
      async (data) => {
        if (data && data.event === "TOKEN_REFRESHED" && data.validated) {
          logger.info("🔄 [BALANCES] Token refreshed and validated, reloading balances...");
          // Add small delay to ensure session is fully propagated
          setTimeout(async () => {
            await loadBalancesWithCache();
          }, 200);
        }
      }
    );

    return () => {
      authSubscription.remove();
    };
  }, []);

  // Memoized categorized account arrays for performance
  const categorizedLiabilities = useCallback(() => 
    accounts.filter((acc) => acc.type === "loan" || acc.type === "credit"),
    [accounts]
  );

  const categorizedDeposits = useCallback(() => 
    accounts.filter((acc) => acc.type === "depository"),
    [accounts]
  );

  const categorizedInvestments = useCallback(() => 
    accounts.filter((acc) => acc.type === "investment"),
    [accounts]
  );

  // Memoized financial totals
  const accountsTotal = useCallback(() => 
    categorizedDeposits().reduce((acc, a) => acc + getAccountBalance(a), 0),
    [categorizedDeposits]
  );

  const investmentsTotal = useCallback(() => 
    categorizedInvestments().reduce((acc, a) => acc + (a.balances?.current || 0), 0),
    [categorizedInvestments]
  );

  const liabilitiesTotal = useCallback(() => 
    categorizedLiabilities().reduce((acc, a) => acc + (a.balances?.current || 0), 0),
    [categorizedLiabilities]
  );

  const totalBalance = useCallback(() => 
    accountsTotal() + investmentsTotal() + totalCash - liabilitiesTotal(),
    [accountsTotal, investmentsTotal, totalCash, liabilitiesTotal]
  );

  return {
    accounts,
    loading,
    isInitialLoad,
    refreshBalances,
    clearBalancesCache,
    // Categorized data
    categorizedLiabilities: categorizedLiabilities(),
    categorizedDeposits: categorizedDeposits(),
    categorizedInvestments: categorizedInvestments(),
    // Cash data
    cashEntries,
    totalCash,
    refreshCash,
    // Totals
    accountsTotal: accountsTotal(),
    investmentsTotal: investmentsTotal(),
    liabilitiesTotal: liabilitiesTotal(),
    totalBalance: totalBalance(),
  };
}

export default useAccountBalances;
