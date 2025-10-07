// hooks/useAccountBalances.ts

import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Account } from "@/app/_types/plaid";
import { getAllUserAccounts } from "@/app/_utils/plaid";
import { supabase } from "@/app/_lib/supabase/supabase";
import { useCashEntries } from "./useCashEntries";
import logger from "@/app/_utils/logger";

const BALANCES_CACHE_KEY = "cached_account_balances";
const BALANCES_CACHE_TIMESTAMP_KEY = "cached_account_balances_timestamp";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

interface CachedBalances {
  accounts: Account[];
  timestamp: number;
}

export function useAccountBalances() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Include cash entries
  const { entries: cashEntries, totalCash, refreshCash } = useCashEntries();

  // Cache management functions
  const saveBalancesToCache = async (accounts: Account[]): Promise<void> => {
    try {
      const cacheData: CachedBalances = {
        accounts,
        timestamp: Date.now(),
      };
      
      await Promise.all([
        AsyncStorage.setItem(BALANCES_CACHE_KEY, JSON.stringify(cacheData)),
        AsyncStorage.setItem(BALANCES_CACHE_TIMESTAMP_KEY, cacheData.timestamp.toString())
      ]);
      logger.info("💾 [BALANCES CACHE] Account balances saved to cache:", accounts.length, "accounts");
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Failed to save balances to cache:", error);
    }
  };

  const loadBalancesFromCache = async (): Promise<Account[] | null> => {
    try {
      const [cachedBalancesString, timestampString] = await Promise.all([
        AsyncStorage.getItem(BALANCES_CACHE_KEY),
        AsyncStorage.getItem(BALANCES_CACHE_TIMESTAMP_KEY)
      ]);

      if (!cachedBalancesString || !timestampString) {
        logger.info("📭 [BALANCES CACHE] No cached balances found");
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      logger.info(`📱 [BALANCES CACHE] Cache age: ${Math.round(cacheAge / 1000)}s (max: ${CACHE_DURATION / 1000}s)`);

      const cachedData: CachedBalances = JSON.parse(cachedBalancesString);
      logger.info("📱 [BALANCES CACHE] Loaded from cache:", cachedData.accounts.length, "accounts");
      return cachedData.accounts;
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Failed to load balances from cache:", error);
      return null;
    }
  };

  const isCacheValid = async (): Promise<boolean> => {
    try {
      const timestampString = await AsyncStorage.getItem(BALANCES_CACHE_TIMESTAMP_KEY);
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
      // Always try to load from cache first for immediate UI update
      const cachedAccounts = await loadBalancesFromCache();
      if (cachedAccounts && cachedAccounts.length > 0) {
        logger.info("⚡ [BALANCES CACHE] Using cached balances for immediate display");
        setAccounts(cachedAccounts);
        setIsInitialLoad(false);
      }

      // Check if we need to refresh from server
      const cacheValid = await isCacheValid();
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
      logger.info("🔄 [BALANCES] Refreshing account balances from database...");
      if (!hasCache) {
        setLoading(true);
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        logger.error("❌ [BALANCES] User not authenticated for refresh");
        return;
      }

      logger.info("👤 [BALANCES] User ID for query:", user.id);

      // Get accounts from database
      const accounts = await getAllUserAccounts(user.id);
      
      if (accounts && accounts.length > 0) {
        logger.info("📊 [BALANCES] Loaded accounts from database:", accounts.length, "accounts");
        setAccounts(accounts);
        
        // Save to cache after successful fetch
        await saveBalancesToCache(accounts);
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

  const clearBalancesCache = async (): Promise<void> => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(BALANCES_CACHE_KEY),
        AsyncStorage.removeItem(BALANCES_CACHE_TIMESTAMP_KEY)
      ]);
      logger.info("🗑️ [BALANCES CACHE] Cache cleared");
    } catch (error) {
      logger.error("❌ [BALANCES CACHE] Failed to clear cache:", error);
    }
  };

  // Initialize on mount
  useEffect(() => {
    loadBalancesWithCache();
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
    categorizedDeposits().reduce((acc, a) => acc + (a.balances?.current || 0), 0),
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
