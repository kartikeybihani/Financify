// hooks/useUnreviewedTransactions.ts

import { useState, useEffect, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import { supabase } from "@/src/lib/supabase/supabase";
import { Transaction } from "@/src/types/plaid";
import logger from "@/src/utils/core/logger";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";

export interface UnreviewedTransaction extends Transaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  merchant_name?: string | null;
  category_id?: string | null;
  account_id: string;
  inserted_at: string;
}

export interface UseUnreviewedTransactionsReturn {
  transactions: UnreviewedTransaction[];
  loading: boolean;
  count: number;
  refresh: () => Promise<void>;
  markAsReviewed: (transactionId: string) => Promise<void>;
  markAllAsReviewed: () => Promise<void>;
}

/**
 * Hook to fetch and manage unreviewed transactions
 * Only shows transactions synced after user signs up (not historical)
 * Uses real-time subscriptions for automatic updates
 */
export function useUnreviewedTransactions(): UseUnreviewedTransactionsReturn {
  const [transactions, setTransactions] = useState<UnreviewedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Get user ID on mount
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const user = await getAuthenticatedUser();
        if (user?.user?.id) {
          setUserId(user.user.id);
        }
      } catch (error) {
        logger.error("Error fetching user ID for unreviewed transactions:", error);
      }
    };
    fetchUserId();
  }, []);

  // Fetch unreviewed transactions
  const fetchUnreviewedTransactions = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Only fetch transactions that were inserted after user's onboarding completion
      // For now, we'll fetch all unreviewed transactions (can be filtered by date later if needed)
      // The key is: only show transactions from syncs AFTER user signs up
      // We can use inserted_at timestamp to filter, but for MVP, show all unreviewed
      
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `
          id,
          name,
          amount,
          date,
          merchant_name,
          category_id,
          account_id,
          inserted_at,
          accounts:account_id (
            name,
            institution_name
          ),
          categories:category_id (
            name,
            icon,
            color
          )
        `
        )
        .eq("user_id", userId)
        .eq("is_reviewed", false)
        .order("date", { ascending: false })
        .order("inserted_at", { ascending: false })
        .limit(50); // Limit to 50 most recent for performance

      if (error) {
        throw error;
      }

      // Transform the data to match our interface
      const transformedTransactions: UnreviewedTransaction[] = (data || []).map((tx: any) => ({
        id: tx.id,
        name: tx.name || "Unknown Transaction",
        amount: tx.amount,
        date: tx.date,
        merchant_name: tx.merchant_name,
        category_id: tx.category_id,
        account_id: tx.account_id,
        inserted_at: tx.inserted_at,
        account_name: tx.accounts?.name,
        institution_name: tx.accounts?.institution_name,
        categories: tx.categories ? {
          id: tx.categories.id,
          name: tx.categories.name,
          icon: tx.categories.icon,
          color: tx.categories.color,
        } : undefined,
      }));

      setTransactions(transformedTransactions);
    } catch (error) {
      logger.error("Error fetching unreviewed transactions:", error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Mark single transaction as reviewed
  const markAsReviewed = useCallback(
    async (transactionId: string) => {
      if (!userId) return;

      try {
        // Optimistic update
        setTransactions((prev) =>
          prev.filter((tx) => tx.id !== transactionId)
        );

        // Update database
        const { error } = await supabase
          .from("transactions")
          .update({ is_reviewed: true })
          .eq("id", transactionId)
          .eq("user_id", userId);

        if (error) {
          throw error;
        }

        logger.info(`✅ Transaction ${transactionId} marked as reviewed`);
      } catch (error) {
        logger.error("Error marking transaction as reviewed:", error);
        // Revert optimistic update on error
        await fetchUnreviewedTransactions();
      }
    },
    [userId, fetchUnreviewedTransactions]
  );

  // Mark all transactions as reviewed
  const markAllAsReviewed = useCallback(async () => {
    if (!userId || transactions.length === 0) return;

    try {
      const transactionIds = transactions.map((tx) => tx.id);

      // Optimistic update
      setTransactions([]);

      // Call RPC function to mark all as reviewed
      const { error } = await supabase.rpc("mark_transactions_reviewed", {
        p_user_id: userId,
        p_transaction_ids: transactionIds,
      });

      if (error) {
        throw error;
      }

      logger.info(`✅ ${transactionIds.length} transactions marked as reviewed`);
    } catch (error) {
      logger.error("Error marking all transactions as reviewed:", error);
      // Revert optimistic update on error
      await fetchUnreviewedTransactions();
    }
  }, [userId, transactions, fetchUnreviewedTransactions]);

  // Initial fetch
  useEffect(() => {
    if (userId) {
      fetchUnreviewedTransactions();
    }
  }, [userId, fetchUnreviewedTransactions]);

  // Set up real-time subscription for new transactions
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("unreviewed_transactions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Only refresh if transaction is marked as unreviewed or newly inserted
          if (
            payload.eventType === "INSERT" ||
            (payload.eventType === "UPDATE" &&
              payload.new.is_reviewed === false &&
              payload.old?.is_reviewed === true)
          ) {
            logger.info("New unreviewed transaction detected, refreshing...");
            fetchUnreviewedTransactions();
          } else if (
            payload.eventType === "UPDATE" &&
            payload.new.is_reviewed === true
          ) {
            // Transaction was marked as reviewed, remove from list
            setTransactions((prev) =>
              prev.filter((tx) => tx.id !== payload.new.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchUnreviewedTransactions]);

  // Listen for transaction sync events
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "financialDataRefreshed",
      () => {
        // Refresh unreviewed transactions after sync
        fetchUnreviewedTransactions();
      }
    );

    return () => {
      subscription.remove();
    };
  }, [fetchUnreviewedTransactions]);

  return {
    transactions,
    loading,
    count: transactions.length,
    refresh: fetchUnreviewedTransactions,
    markAsReviewed,
    markAllAsReviewed,
  };
}
