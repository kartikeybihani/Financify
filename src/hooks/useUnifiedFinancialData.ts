// hooks/useUnifiedFinancialData.ts

import { useState, useEffect, useCallback, useMemo } from "react";
import { DeviceEventEmitter } from "react-native";
import AppStorage from "@/src/utils/storage/storage";
import { Account } from "@/src/types/plaid";
import { Goal } from "@/src/types/finny";
import { getAllUserAccounts } from "@/src/utils/plaid/plaid";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/core/logger";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";
import { CACHE_CONFIG } from "@/src/shared/constants/cacheConfig";
import { getSnaptradeBalancesFromDB } from "@/src/utils/integrations/snaptrade";
import { getAccountBalance } from "@/src/utils/accountBalance";

// Cache keys
const UNIFIED_CACHE_KEY = "unified_financial_data";
const UNIFIED_CACHE_TIMESTAMP_KEY = "unified_financial_data_timestamp";
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.MEDIUM; // 5 minutes

// Interface for cache data
interface CachedFinancialData {
  accounts: Account[];
  goals: Goal[];
  cashEntries: CashEntry[];
  investmentBalances: any[];
  timestamp: number;
}

export interface CashEntry {
  id: string;
  user_id: string;
  amount: number;
  currency_code: string;
  description?: string;
  entry_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnifiedFinancialData {
  // Accounts
  accounts: Account[];
  categorizedLiabilities: Account[];
  categorizedDeposits: Account[];
  categorizedInvestments: Account[];
  
  // Goals
  goals: Goal[];
  
  // Cash
  cashEntries: CashEntry[];
  
  // Totals (memoized)
  accountsTotal: number;
  investmentsTotal: number;
  liabilitiesTotal: number;
  totalCash: number;
  totalBalance: number;
  
  // Loading states
  loading: boolean;
  isInitialLoad: boolean;
  hasAccounts: boolean;
  hasGoals: boolean;
  
  // Actions
  refreshAll: () => Promise<void>;
  clearCache: () => Promise<void>;
}

/**
 * Unified financial data hook that loads accounts, goals, and cash entries in parallel
 * with smart caching for optimal performance
 */
export function useUnifiedFinancialData(): UnifiedFinancialData {
  // Load cache synchronously before first render (MMKV advantage)
  const initialCache = (() => {
    try {
      const cacheString = AppStorage.getItemSync(UNIFIED_CACHE_KEY);
      const timestampString = AppStorage.getItemSync(UNIFIED_CACHE_TIMESTAMP_KEY);
      
      if (!cacheString || !timestampString) {
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      if (cacheAge > CACHE_DURATION) {
        return null;
      }

      const cachedData = JSON.parse(cacheString) as CachedFinancialData;
      return cachedData;
    } catch (error) {
      logger.error("❌ [UNIFIED CACHE] Error loading cache on initial load:", error);
      return null;
    }
  })();

  // Initialize state with cached data if available (instant UI)
  const [accounts, setAccounts] = useState<Account[]>(initialCache?.accounts || []);
  const [goals, setGoals] = useState<Goal[]>(initialCache?.goals || []);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(initialCache?.cashEntries || []);
  const [investmentBalances, setInvestmentBalances] = useState<any[]>(initialCache?.investmentBalances || []);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(!initialCache); // If we have cache, not initial load

  // Removed verbose initial state logging

  // Cache management
  const saveToCache = useCallback(async (data: { accounts: Account[]; goals: Goal[]; cashEntries: CashEntry[]; investmentBalances?: any[] }): Promise<void> => {
    try {
      const cacheData: CachedFinancialData = {
        accounts: data.accounts,
        goals: data.goals,
        cashEntries: data.cashEntries,
        investmentBalances: data.investmentBalances || [],
        timestamp: Date.now(),
      };
      
      // Use synchronous operations for better performance
      AppStorage.setItemSync(UNIFIED_CACHE_KEY, JSON.stringify(cacheData));
      AppStorage.setItemSync(UNIFIED_CACHE_TIMESTAMP_KEY, cacheData.timestamp.toString());
    } catch (error) {
      logger.error("❌ [UNIFIED CACHE] Failed to save to cache:", error);
    }
  }, []);

  // Synchronous cache load - can be called before render for instant data
  const loadFromCacheSync = useCallback((): CachedFinancialData | null => {
    try {
      // Use synchronous reads for instant cache access (MMKV advantage)
      const cacheString = AppStorage.getItemSync(UNIFIED_CACHE_KEY);
      const timestampString = AppStorage.getItemSync(UNIFIED_CACHE_TIMESTAMP_KEY);

      if (!cacheString || !timestampString) {
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      if (cacheAge > CACHE_DURATION) {
        logger.info("⏰ [UNIFIED CACHE] Cache expired");
        return null;
      }

      logger.info(`✅ [UNIFIED CACHE] Loaded from cache (age: ${Math.round(cacheAge / 1000)}s)`);
      return JSON.parse(cacheString) as CachedFinancialData;
    } catch (error) {
      logger.error("❌ [UNIFIED CACHE] Failed to load from cache:", error);
      return null;
    }
  }, []);

  // Async version for compatibility
  const loadFromCache = useCallback(async (): Promise<CachedFinancialData | null> => {
    return Promise.resolve(loadFromCacheSync());
  }, [loadFromCacheSync]);

  // Parallel data fetching
  const fetchAllData = useCallback(async (hasCache: boolean = false): Promise<void> => {
    try {
      if (!hasCache) {
        setLoading(true);
      }
      
      const authResult = await getAuthenticatedUser();
      
      if (!authResult?.user?.id) {
        logger.error("❌ [UNIFIED] User not authenticated");
        return;
      }
      
      const user = authResult.user;

      logger.info("🔄 [UNIFIED] Fetching all financial data in parallel...");
      
      // Fetch all data in parallel for optimal performance
      const [accountsData, goalsData, cashData, balancesData] = await Promise.all([
        getAllUserAccounts(user.id).catch(err => {
          logger.error("❌ [UNIFIED] Failed to fetch accounts:", err);
          return [];
        }),
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) {
              logger.error("❌ [UNIFIED] Failed to fetch goals:", error);
              return [];
            }
            return data || [];
          }),
        supabase
          .from('cash_entries')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) {
              logger.error("❌ [UNIFIED] Failed to fetch cash entries:", error);
              return [];
            }
            return data || [];
          }),
        getSnaptradeBalancesFromDB().catch(err => {
          logger.error("❌ [UNIFIED] Failed to fetch investment balances:", err);
          return [];
        })
      ]);

      // Update state
      setAccounts(accountsData || []);
      setGoals(goalsData || []);
      setCashEntries(cashData || []);
      setInvestmentBalances(balancesData || []);

      // Only log on first load or when cache is missing (reduced verbosity)
      if (!hasCache) {
        logger.info(`✅ [UNIFIED] Loaded ${accountsData?.length || 0} accounts, ${goalsData?.length || 0} goals, ${cashData?.length || 0} cash entries`);
      }

      // Save to cache (including investment balances)
      await saveToCache({
        accounts: accountsData || [],
        goals: goalsData || [],
        cashEntries: cashData || [],
        investmentBalances: balancesData || [],
      });
    } catch (error) {
      logger.error("❌ [UNIFIED] Error fetching financial data:", error);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [saveToCache]);

  // Load data with cache - synchronous cache read for instant UI
  const loadDataWithCache = useCallback(async (): Promise<void> => {
    try {
      // Load from cache synchronously (MMKV advantage - instant read)
      const cachedData = loadFromCacheSync();
      
      if (cachedData) {
        logger.info("⚡ [UNIFIED] Using cached data for immediate display");
        setAccounts(cachedData.accounts);
        setGoals(cachedData.goals);
        setCashEntries(cachedData.cashEntries);
        setInvestmentBalances(cachedData.investmentBalances || []);
        setIsInitialLoad(false);
      }

      // Always fetch fresh data in background
      await fetchAllData(!!cachedData);
    } catch (error) {
      logger.error("❌ [UNIFIED] Error in loadDataWithCache:", error);
      await fetchAllData(false);
    }
  }, [loadFromCacheSync, fetchAllData]);

  // Initialize on mount
  useEffect(() => {
      // Cache is already loaded synchronously before render
      // So we only need to fetch fresh data in background
      if (initialCache) {
        // We have cache - fetch fresh data in background (non-blocking)
        fetchAllData(true).catch((error) => {
          logger.error("❌ [UNIFIED] Background data fetch failed:", error);
        });
      } else {
        // No cache - fetch immediately (first load or cache expired)
        fetchAllData(false);
      }

    // Listen for financial data updates
    const financialSubscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      () => {
        logger.info("🔄 [UNIFIED] Financial data refresh event received");
        fetchAllData(false);
      }
    );

    // Listen for goals updates
    const goalsSubscription = DeviceEventEmitter.addListener(
      "goalsUpdated",
      () => {
        logger.info("🔄 [UNIFIED] Goals update event received");
        fetchAllData(false);
      }
    );

    // Listen for auth state changes
    const authSubscription = DeviceEventEmitter.addListener(
      "authStateChanged",
      async (data) => {
        if (data && data.event === "TOKEN_REFRESHED" && data.validated) {
          logger.info("🔄 [UNIFIED] Token refreshed, reloading data...");
          setTimeout(async () => {
            await fetchAllData(false);
          }, 200);
        }
      }
    );

    return () => {
      financialSubscription.remove();
      goalsSubscription.remove();
      authSubscription.remove();
    };
  }, [fetchAllData]);

  // Memoized categorized data
  const categorizedLiabilities = useMemo(
    () => accounts.filter((acc) => acc.type === "loan" || acc.type === "credit"),
    [accounts]
  );

  const categorizedDeposits = useMemo(
    () => accounts.filter((acc) => acc.type === "depository"),
    [accounts]
  );

  const categorizedInvestments = useMemo(
    () => accounts.filter((acc) => acc.type === "investment"),
    [accounts]
  );

  // Memoized totals
  const accountsTotal = useMemo(
    () => categorizedDeposits.reduce((acc, a) => acc + getAccountBalance(a), 0),
    [categorizedDeposits]
  );

  // Use total_value from investment_balances as single source of truth (same as investments screen)
  const investmentsTotal = useMemo(() => {
    // Use investment_balances.total_value which is calculated from active holdings + options
    if (investmentBalances.length > 0 && investmentBalances[0].total_value !== null && investmentBalances[0].total_value !== undefined) {
      return investmentBalances[0].total_value;
    }
    
    // Fallback to accounts table if no balances found (for backwards compatibility)
    if (categorizedInvestments.length > 0) {
      const accountsTotal = categorizedInvestments.reduce(
        (acc, a) => acc + (a.balances?.current || 0),
        0
      );
      return accountsTotal;
    }
    
    return 0;
  }, [investmentBalances, categorizedInvestments]);

  const liabilitiesTotal = useMemo(
    () => categorizedLiabilities.reduce((acc, a) => acc + (a.balances?.current || 0), 0),
    [categorizedLiabilities]
  );

  const totalCash = useMemo(
    () => cashEntries.reduce((total, entry) => total + entry.amount, 0),
    [cashEntries]
  );

  const totalBalance = useMemo(
    () => accountsTotal + investmentsTotal + totalCash - liabilitiesTotal,
    [accountsTotal, investmentsTotal, totalCash, liabilitiesTotal]
  );

  const clearCache = useCallback(async (): Promise<void> => {
    try {
      // Use synchronous operations
      AppStorage.removeItemSync(UNIFIED_CACHE_KEY);
      AppStorage.removeItemSync(UNIFIED_CACHE_TIMESTAMP_KEY);
      logger.info("🗑️ [UNIFIED CACHE] Cache cleared");
    } catch (error) {
      logger.error("❌ [UNIFIED CACHE] Failed to clear cache:", error);
    }
  }, []);

  return {
    accounts,
    categorizedLiabilities,
    categorizedDeposits,
    categorizedInvestments,
    goals,
    cashEntries,
    accountsTotal,
    investmentsTotal,
    liabilitiesTotal,
    totalCash,
    totalBalance,
    loading,
    isInitialLoad,
    hasAccounts: accounts.length > 0,
    hasGoals: goals.length > 0,
    refreshAll: () => fetchAllData(false),
    clearCache,
  };
}

export default useUnifiedFinancialData;
