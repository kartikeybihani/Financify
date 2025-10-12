import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase/supabase";
import logger from "@/src/utils/logger";

const CASH_CACHE_KEY = "cached_cash_entries";
const CASH_CACHE_TIMESTAMP_KEY = "cached_cash_entries_timestamp";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

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

interface CachedCashEntries {
  entries: CashEntry[];
  timestamp: number;
}

export function useCashEntries() {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Cache management functions
  const saveCashToCache = async (entries: CashEntry[]): Promise<void> => {
    try {
      const cacheData: CachedCashEntries = {
        entries,
        timestamp: Date.now(),
      };
      
      await Promise.all([
        AsyncStorage.setItem(CASH_CACHE_KEY, JSON.stringify(cacheData)),
        AsyncStorage.setItem(CASH_CACHE_TIMESTAMP_KEY, cacheData.timestamp.toString())
      ]);
      logger.info("💾 [CASH CACHE] Cash entries saved to cache:", entries.length, "entries");
    } catch (error) {
      logger.error("❌ [CASH CACHE] Failed to save cash to cache:", error);
    }
  };

  const loadCashFromCache = async (): Promise<CashEntry[] | null> => {
    try {
      const [cachedCashString, timestampString] = await Promise.all([
        AsyncStorage.getItem(CASH_CACHE_KEY),
        AsyncStorage.getItem(CASH_CACHE_TIMESTAMP_KEY)
      ]);

      if (!cachedCashString || !timestampString) {
        logger.info("📭 [CASH CACHE] No cached cash entries found");
        return null;
      }

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      logger.info(`📱 [CASH CACHE] Cache age: ${Math.round(cacheAge / 1000)}s (max: ${CACHE_DURATION / 1000}s)`);

      const cachedData: CachedCashEntries = JSON.parse(cachedCashString);
      logger.info("📱 [CASH CACHE] Loaded from cache:", cachedData.entries.length, "entries");
      return cachedData.entries;
    } catch (error) {
      logger.error("❌ [CASH CACHE] Failed to load cash from cache:", error);
      return null;
    }
  };

  const isCacheValid = async (): Promise<boolean> => {
    try {
      const timestampString = await AsyncStorage.getItem(CASH_CACHE_TIMESTAMP_KEY);
      if (!timestampString) return false;

      const timestamp = parseInt(timestampString, 10);
      const now = Date.now();
      const cacheAge = now - timestamp;

      return cacheAge < CACHE_DURATION;
    } catch (error) {
      logger.error("❌ [CASH CACHE] Failed to check cache validity:", error);
      return false;
    }
  };

  const loadCashWithCache = async (): Promise<void> => {
    try {
      // Always try to load from cache first for immediate UI update
      const cachedEntries = await loadCashFromCache();
      if (cachedEntries && cachedEntries.length >= 0) {
        logger.info("⚡ [CASH CACHE] Using cached cash entries for immediate display");
        setEntries(cachedEntries);
        setIsInitialLoad(false);
      }

      // Check if we need to refresh from server
      const cacheValid = await isCacheValid();
      if (!cacheValid || isInitialLoad) {
        logger.info("🔄 [CASH CACHE] Cache invalid or initial load, fetching from server");
        await refreshCashFromServer(!!cachedEntries);
      } else {
        logger.info("✅ [CASH CACHE] Cache is valid, skipping server fetch");
        setLoading(false);
        setIsInitialLoad(false);
      }
    } catch (error) {
      logger.error("❌ [CASH CACHE] Error in loadCashWithCache:", error);
      // Fallback to direct server fetch
      await refreshCashFromServer(false);
    }
  };

  const refreshCashFromServer = async (hasCache: boolean = false): Promise<void> => {
    try {
      logger.info("🔄 [CASH] Refreshing cash entries from database...");
      if (!hasCache) {
        setLoading(true);
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        logger.error("❌ [CASH] User not authenticated for refresh");
        return;
      }

      logger.info("👤 [CASH] User ID for query:", user.id);

      const { data: cashEntries, error } = await supabase
        .from('cash_entries')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error("❌ [CASH] Failed to load cash entries:", error);
        return;
      }

      const entriesArray = cashEntries || [];
      logger.info("📊 [CASH] Loaded cash entries from database:", entriesArray.length, "entries");
      setEntries(entriesArray);
      
      // Save to cache after successful fetch
      await saveCashToCache(entriesArray);
    } catch (e) {
      logger.error("❌ [CASH] Failed to load cash entries:", e);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  };

  // Wrapper function for external calls
  const refreshCash = async (): Promise<void> => {
    await refreshCashFromServer(false);
  };

  const addCashEntry = async (amount: number, description?: string): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from('cash_entries')
        .insert({
          user_id: user.id,
          amount,
          description,
          entry_type: 'cash',
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        logger.error("❌ [CASH] Failed to add cash entry:", error);
        throw error;
      }

      logger.info("✅ [CASH] Cash entry added successfully:", data);
      
      // Refresh the list
      await refreshCash();
    } catch (error) {
      logger.error("❌ [CASH] Error adding cash entry:", error);
      throw error;
    }
  };

  const deleteCashEntry = async (entryId: string): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const { error } = await supabase
        .from('cash_entries')
        .update({ is_active: false })
        .eq('id', entryId)
        .eq('user_id', user.id);

      if (error) {
        logger.error("❌ [CASH] Failed to delete cash entry:", error);
        throw error;
      }

      logger.info("✅ [CASH] Cash entry deleted successfully");
      
      // Refresh the list
      await refreshCash();
    } catch (error) {
      logger.error("❌ [CASH] Error deleting cash entry:", error);
      throw error;
    }
  };

  const clearCashCache = async (): Promise<void> => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(CASH_CACHE_KEY),
        AsyncStorage.removeItem(CASH_CACHE_TIMESTAMP_KEY)
      ]);
      logger.info("🗑️ [CASH CACHE] Cache cleared");
    } catch (error) {
      logger.error("❌ [CASH CACHE] Failed to clear cache:", error);
    }
  };

  // Initialize on mount
  useEffect(() => {
    loadCashWithCache();
  }, []);

  // Memoized total cash amount
  const totalCash = useCallback(() => 
    entries.reduce((total, entry) => total + entry.amount, 0),
    [entries]
  );

  return {
    entries,
    loading,
    isInitialLoad,
    refreshCash,
    addCashEntry,
    deleteCashEntry,
    clearCashCache,
    totalCash: totalCash(),
  };
}

export default useCashEntries;
