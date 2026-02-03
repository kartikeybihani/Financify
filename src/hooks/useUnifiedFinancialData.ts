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
import { getSnaptradeBalancesFromDB, getSnaptradeHoldingsFromDB } from "@/src/utils/integrations/snaptrade";
import { getAccountBalance } from "@/src/utils/accountBalance";
import { loadInvestmentFromCacheSync } from "@/src/shared/utils/investmentCache";
import { getUserIdSync } from "@/src/utils/insights/cacheUtils";
import { useDemoMode } from "@/src/contexts/DemoContext";
import {
  demoAccounts,
  demoGoals,
  demoCashEntries,
  demoInvestmentHoldings,
  demoInvestmentBalances,
} from "@/src/data/demo";

// Cache keys
const UNIFIED_CACHE_KEY = "unified_financial_data";
const UNIFIED_CACHE_TIMESTAMP_KEY = "unified_financial_data_timestamp";
const CACHE_DURATION = CACHE_CONFIG.DURATIONS.VERY_LONG; // 7 days - event-based invalidation

// Interface for cache data
interface CachedFinancialData {
  accounts: Account[];
  goals: Goal[];
  cashEntries: CashEntry[];
  investmentBalances: any[];
  investmentHoldings: any[];
  timestamp: number;
}

/** Treat empty cache as no cache so we always fetch from DB (e.g. after reinstall). */
function hasMeaningfulCache(c: CachedFinancialData | null): boolean {
  if (!c) return false;
  return (
    (c.accounts?.length ?? 0) > 0 ||
    (c.goals?.length ?? 0) > 0 ||
    (c.cashEntries?.length ?? 0) > 0 ||
    (c.investmentHoldings?.length ?? 0) > 0 ||
    (c.investmentBalances?.length ?? 0) > 0
  );
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
  
  // Investments
  investmentHoldings: any[];
  investmentBalances: any[];

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
  const { isDemoMode } = useDemoMode();

  // Load unified cache synchronously before first render (MMKV advantage)
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

  // Demo mode: use demo data as initial state
  const demoInitialState = isDemoMode
    ? {
        accounts: demoAccounts.map((a) => ({
          ...a,
          current_balance: a.current_balance ?? undefined,
          available_balance: a.available_balance ?? undefined,
          balances: {
            current: a.current_balance ?? 0,
            available: a.available_balance ?? 0,
          },
        })) as Account[],
        goals: demoGoals,
        cashEntries: demoCashEntries,
        investmentBalances: demoInvestmentBalances,
        investmentHoldings: demoInvestmentHoldings,
      }
    : null;

  // Load investment holdings cache synchronously (separate cache system)
  const initialInvestmentCache = (() => {
    try {
      const userId = getUserIdSync();
      if (!userId) return null;
      const cached = loadInvestmentFromCacheSync(userId);
      return cached?.holdings || null;
    } catch (error) {
      logger.error("❌ [UNIFIED] Error loading investment cache synchronously:", error);
      return null;
    }
  })();

  // Initialize state with cached data if available (instant UI), or demo data when in demo mode
  const [accounts, setAccounts] = useState<Account[]>(
    demoInitialState?.accounts ?? initialCache?.accounts ?? []
  );
  const [goals, setGoals] = useState<Goal[]>(
    demoInitialState?.goals ?? initialCache?.goals ?? []
  );
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(
    demoInitialState?.cashEntries ?? initialCache?.cashEntries ?? []
  );
  const [investmentBalances, setInvestmentBalances] = useState<any[]>(
    demoInitialState?.investmentBalances ?? initialCache?.investmentBalances ?? []
  );
  const [investmentHoldings, setInvestmentHoldings] = useState<any[]>(
    demoInitialState?.investmentHoldings ?? initialInvestmentCache ?? initialCache?.investmentHoldings ?? []
  );
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(
    !isDemoMode && !hasMeaningfulCache(initialCache) && !initialInvestmentCache?.length
  );

  // Removed verbose initial state logging

  // Cache management
  const saveToCache = useCallback(async (data: { accounts: Account[]; goals: Goal[]; cashEntries: CashEntry[]; investmentBalances?: any[]; investmentHoldings?: any[] }): Promise<void> => {
    try {
      const cacheData: CachedFinancialData = {
        accounts: data.accounts,
        goals: data.goals,
        cashEntries: data.cashEntries,
        investmentBalances: data.investmentBalances || [],
        investmentHoldings: data.investmentHoldings || [],
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
      if (isDemoMode) {
        setAccounts(
          demoAccounts.map((a) => ({
            ...a,
            current_balance: a.current_balance ?? undefined,
            available_balance: a.available_balance ?? undefined,
            balances: {
              current: a.current_balance ?? 0,
              available: a.available_balance ?? 0,
            },
          })) as Account[]
        );
        setGoals(demoGoals);
        setCashEntries(demoCashEntries);
        setInvestmentBalances(demoInvestmentBalances);
        setInvestmentHoldings(demoInvestmentHoldings);
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }

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
      
      // Fetch accounts first to check if user has investment accounts
      const accountsData = await getAllUserAccounts(user.id).catch(err => {
        logger.error("❌ [UNIFIED] Failed to fetch accounts:", err);
        return [];
      });

      // Check if user has investment accounts before fetching investment data
      const hasInvestmentAccounts = (accountsData || []).some(
        (acc: Account) => acc.type === "investment"
      );

      // Fetch remaining data in parallel (skip investment data if no investment accounts)
      const [goalsData, cashData, balancesData, holdingsData] = await Promise.all([
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
        // Only fetch investment balances if user has investment accounts
        hasInvestmentAccounts
          ? getSnaptradeBalancesFromDB().catch(err => {
              logger.error("❌ [UNIFIED] Failed to fetch investment balances:", err);
              return [];
            })
          : Promise.resolve([]),
        // Only fetch investment holdings if user has investment accounts
        hasInvestmentAccounts
          ? getSnaptradeHoldingsFromDB().catch(err => {
              logger.error("❌ [UNIFIED] Failed to fetch investment holdings:", err);
              return [];
            })
          : Promise.resolve([])
      ]);

      // Update state
      setAccounts(accountsData || []);
      setGoals(goalsData || []);
      setCashEntries(cashData || []);
      setInvestmentBalances(balancesData || []);
      setInvestmentHoldings(holdingsData || []);

      // Only log on first load or when cache is missing (reduced verbosity)
      if (!hasCache) {
        logger.info(`✅ [UNIFIED] Loaded ${accountsData?.length || 0} accounts, ${goalsData?.length || 0} goals, ${cashData?.length || 0} cash entries`);
      }

      // Save to cache (including investment balances and holdings)
      await saveToCache({
        accounts: accountsData || [],
        goals: goalsData || [],
        cashEntries: cashData || [],
        investmentBalances: balancesData || [],
        investmentHoldings: holdingsData || [],
      });
    } catch (error) {
      logger.error("❌ [UNIFIED] Error fetching financial data:", error);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [saveToCache, isDemoMode]);

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
        setInvestmentHoldings(cachedData.investmentHoldings || []);
        setIsInitialLoad(false);
      }

      // Always fetch fresh data in background
      await fetchAllData(!!cachedData);
    } catch (error) {
      logger.error("❌ [UNIFIED] Error in loadDataWithCache:", error);
      await fetchAllData(false);
    }
  }, [loadFromCacheSync, fetchAllData]);

  // Background sync: Only sync if last sync was > 1 hour ago
  // Rationale: Data changes happen:
  // - Morning/evening: Scheduled transaction syncs (handled by backend)
  // - User actions: Budget/goals/accounts (event-based invalidation)
  // - Webhooks: Real-time updates (event-based invalidation)
  // 1 hour balances freshness with efficiency
  const shouldBackgroundSync = useCallback((): boolean => {
    try {
      const lastSyncKey = `${UNIFIED_CACHE_KEY}_last_sync`;
      const lastSyncStr = AppStorage.getItemSync(lastSyncKey);
      
      if (!lastSyncStr) {
        return true; // Never synced, should sync
      }
      
      const lastSync = parseInt(lastSyncStr, 10);
      const now = Date.now();
      const timeSinceSync = now - lastSync;
      const ONE_HOUR = 60 * 60 * 1000; // 1 hour
      
      return timeSinceSync > ONE_HOUR;
    } catch (error) {
      return true; // On error, sync to be safe
    }
  }, []);

  // Save last sync time
  const saveLastSyncTime = useCallback(() => {
    try {
      const lastSyncKey = `${UNIFIED_CACHE_KEY}_last_sync`;
      AppStorage.setItemSync(lastSyncKey, Date.now().toString());
    } catch (error) {
      // Ignore errors
    }
  }, []);

  // When entering demo mode, set state to demo data
  useEffect(() => {
    if (isDemoMode) {
      setAccounts(
        demoAccounts.map((a) => ({
          ...a,
          current_balance: a.current_balance ?? undefined,
          available_balance: a.available_balance ?? undefined,
          balances: {
            current: a.current_balance ?? 0,
            available: a.available_balance ?? 0,
          },
        })) as Account[]
      );
      setGoals(demoGoals);
      setCashEntries(demoCashEntries);
      setInvestmentBalances(demoInvestmentBalances);
      setInvestmentHoldings(demoInvestmentHoldings);
      setIsInitialLoad(false);
      setLoading(false);
      return;
    }
  }, [isDemoMode]);

  // Initialize on mount
  useEffect(() => {
      if (isDemoMode) {
        return; // No fetch in demo mode
      }
      // Only skip fetch when we have meaningful cache (avoids zero net worth after reinstall)
      const meaningful = hasMeaningfulCache(initialCache);
      if (meaningful) {
        // We have real data in cache - check if we need background sync
        if (shouldBackgroundSync()) {
          fetchAllData(true).then(() => {
            saveLastSyncTime();
          }).catch((error) => {
            logger.error("❌ [UNIFIED] Background data fetch failed:", error);
          });
        } else {
          logger.info("✅ [UNIFIED] Recently synced, skipping background sync");
        }
      } else {
        // No cache or empty cache (e.g. after reinstall) - fetch from DB immediately
        fetchAllData(false).then(() => {
          saveLastSyncTime();
        });
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
  }, [fetchAllData, shouldBackgroundSync, saveLastSyncTime, isDemoMode]);

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
  // Sum ALL balances to include both Plaid and SnapTrade accounts
  const investmentsTotal = useMemo(() => {
    // Sum total_value from ALL investment_balances (both Plaid and SnapTrade)
    if (investmentBalances.length > 0) {
      const total = investmentBalances.reduce(
        (sum, b) => sum + (b.total_value || 0),
        0
      );
      if (total > 0) {
        return total;
      }
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
    investmentHoldings,
    investmentBalances,
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
