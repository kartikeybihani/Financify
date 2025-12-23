// hooks/useSpendingData.ts

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/src/lib/supabase/supabase";
import { Transaction } from "@/src/types/plaid";
import logger from "@/src/utils/core/logger";
import { getAuthenticatedUser } from "@/src/utils/auth/auth";

export interface SpendingData {
  threeMonths: number; // Average spending over last 3 months
  lastMonth: number; // Spending in last month
  threeMonthsChange: number; // Percentage change vs previous 3 months
  lastMonthChange: number; // Percentage change vs previous month
  netWorthChange: number; // Net worth percentage change this month vs previous month
}

/**
 * Calculate spending data from transactions
 */
export function useSpendingData(
  currentNetWorth: number
): {
  spendingData: SpendingData;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [spendingData, setSpendingData] = useState<SpendingData>({
    threeMonths: 0,
    lastMonth: 0,
    threeMonthsChange: 0,
    lastMonthChange: 0,
    netWorthChange: 0,
  });
  const [loading, setLoading] = useState(true);
  const previousNetWorthRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);

  // Helper function to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper function to get effective date (authorized_date || date)
  const getEffectiveDate = (tx: Transaction): string => {
    return tx.authorized_date || tx.date;
  };

  // Helper function to check if transaction is an expense
  const isExpense = (tx: Transaction): boolean => {
    return (
      tx.amount > 0 &&
      tx.transaction_type !== "transfer" &&
      tx.new_category !== "INTERNAL_TRANSFER"
    );
  };

  // Calculate spending for a date range
  const calculateSpending = useCallback(
    (transactions: Transaction[], startDate: string, endDate: string): number => {
      return transactions
        .filter((tx) => {
          if (!isExpense(tx)) return false;
          const effectiveDate = getEffectiveDate(tx);
          return effectiveDate >= startDate && effectiveDate <= endDate;
        })
        .reduce((sum, tx) => sum + tx.amount, 0);
    },
    []
  );

  // Fetch transactions and calculate spending data
  const calculateSpendingData = useCallback(
    async (userId: string) => {
      try {
        setLoading(true);

        const now = new Date();
        const today = formatDate(now);

        // Calculate date ranges
        // Last month (current month so far)
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStartStr = formatDate(lastMonthStart);

        // Previous month (complete month)
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const prevMonthStartStr = formatDate(prevMonthStart);
        const prevMonthEndStr = formatDate(prevMonthEnd);

        // Last 3 months (current month + 2 previous months)
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const threeMonthsAgoStr = formatDate(threeMonthsAgo);

        // Previous 3 months (3-6 months ago)
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const sixMonthsAgoStr = formatDate(sixMonthsAgo);
        const threeMonthsAgoEnd = new Date(now.getFullYear(), now.getMonth() - 2, 0);
        const threeMonthsAgoEndStr = formatDate(threeMonthsAgoEnd);

        // Fetch transactions for the last 6 months
        const { data: transactions, error } = await supabase
          .from("transactions")
          .select("amount, date, authorized_date, transaction_type, new_category")
          .eq("user_id", userId)
          .gte("date", sixMonthsAgoStr)
          .lte("date", today)
          .gt("amount", 0) // Only expenses
          .neq("transaction_type", "transfer")
          .order("date", { ascending: false });

        if (error) {
          logger.error("Error fetching transactions for spending data:", error);
          setLoading(false);
          return;
        }

        const txList = (transactions || []) as Transaction[];

        // Calculate spending for different periods
        const lastMonthSpending = calculateSpending(
          txList,
          lastMonthStartStr,
          today
        );

        const prevMonthSpending = calculateSpending(
          txList,
          prevMonthStartStr,
          prevMonthEndStr
        );

        // Last 3 months average (current month + 2 previous complete months)
        const month1Start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const month1End = new Date(now.getFullYear(), now.getMonth() - 1, 0);
        const month2Start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const month2End = new Date(now.getFullYear(), now.getMonth(), 0);
        const month3Start = new Date(now.getFullYear(), now.getMonth(), 1);

        const month1Spending = calculateSpending(
          txList,
          formatDate(month1Start),
          formatDate(month1End)
        );
        const month2Spending = calculateSpending(
          txList,
          formatDate(month2Start),
          formatDate(month2End)
        );
        const month3Spending = lastMonthSpending; // Current month so far

        // Average of last 3 months (weighted by days if current month is incomplete)
        const daysInCurrentMonth = now.getDate();
        const totalDaysInCurrentMonth = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0
        ).getDate();
        const currentMonthWeight = daysInCurrentMonth / totalDaysInCurrentMonth;

        // For average calculation, we'll use the average of the 3 months
        // If current month is incomplete, we can either:
        // 1. Use actual spending (which will be lower)
        // 2. Project it (multiply by weight)
        // We'll use option 1 for accuracy
        const lastThreeMonthsAverage =
          (month1Spending + month2Spending + month3Spending) / 3;

        // Previous 3 months average (months 4-6 ago)
        const month4Start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const month4End = new Date(now.getFullYear(), now.getMonth() - 4, 0);
        const month5Start = new Date(now.getFullYear(), now.getMonth() - 4, 1);
        const month5End = new Date(now.getFullYear(), now.getMonth() - 3, 0);
        const month6Start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const month6End = new Date(now.getFullYear(), now.getMonth() - 2, 0);

        const month4Spending = calculateSpending(
          txList,
          formatDate(month4Start),
          formatDate(month4End)
        );
        const month5Spending = calculateSpending(
          txList,
          formatDate(month5Start),
          formatDate(month5End)
        );
        const month6Spending = calculateSpending(
          txList,
          formatDate(month6Start),
          formatDate(month6End)
        );

        const prevThreeMonthsAverage =
          (month4Spending + month5Spending + month6Spending) / 3;

        // Calculate percentage changes
        const threeMonthsChange =
          prevThreeMonthsAverage > 0
            ? ((lastThreeMonthsAverage - prevThreeMonthsAverage) /
                prevThreeMonthsAverage) *
              100
            : 0;

        const lastMonthChange =
          prevMonthSpending > 0
            ? ((lastMonthSpending - prevMonthSpending) / prevMonthSpending) * 100
            : 0;

        setSpendingData((prev) => ({
          threeMonths: lastThreeMonthsAverage,
          lastMonth: lastMonthSpending,
          threeMonthsChange,
          lastMonthChange,
          netWorthChange: prev.netWorthChange, // Keep existing value, updated by useEffect
        }));

        logger.info("✅ Spending data calculated:", {
          threeMonths: lastThreeMonthsAverage,
          lastMonth: lastMonthSpending,
          threeMonthsChange,
          lastMonthChange,
        });
      } catch (error) {
        logger.error("Error calculating spending data:", error);
      } finally {
        setLoading(false);
      }
    },
    [calculateSpending, currentNetWorth]
  );

  // Fetch and calculate spending data
  const refresh = useCallback(async () => {
    try {
      const authResult = await getAuthenticatedUser();
      if (!authResult?.user?.id) {
        logger.error("User not authenticated for spending data");
        return;
      }
      await calculateSpendingData(authResult.user.id);
    } catch (error) {
      logger.error("Error refreshing spending data:", error);
    }
  }, [calculateSpendingData]);

  // Initialize on mount
  useEffect(() => {
    if (!hasInitializedRef.current) {
      refresh();
      hasInitializedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Calculate net worth change for current month
  // This is calculated by estimating net worth at start of month
  const calculateNetWorthChange = useCallback(async (userId: string) => {
    try {
      const now = new Date();
      const today = formatDate(now);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStartStr = formatDate(monthStart);

      // Fetch current month transactions to calculate net income
      const { data: transactions } = await supabase
        .from("transactions")
        .select("amount, date, authorized_date, transaction_type, new_category")
        .eq("user_id", userId)
        .gte("date", monthStartStr)
        .lte("date", today);

      if (!transactions) return;

      const txList = (transactions || []) as Transaction[];

      // Calculate current month expenses
      const currentMonthExpenses = txList
        .filter((tx) => {
          if (!isExpense(tx)) return false;
          const effectiveDate = getEffectiveDate(tx);
          return effectiveDate >= monthStartStr && effectiveDate <= today;
        })
        .reduce((sum, tx) => sum + tx.amount, 0);

      // Calculate current month income (negative amounts in Plaid)
      const currentMonthIncome = txList
        .filter((tx) => {
          const effectiveDate = getEffectiveDate(tx);
          return (
            effectiveDate >= monthStartStr &&
            effectiveDate <= today &&
            tx.amount < 0 &&
            tx.transaction_type !== "transfer" &&
            tx.new_category !== "INTERNAL_TRANSFER"
          );
        })
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      // Net income = income - expenses
      const netIncome = currentMonthIncome - currentMonthExpenses;

      // Estimate net worth at start of month
      const estimatedStartOfMonthNetWorth = currentNetWorth - netIncome;

      if (estimatedStartOfMonthNetWorth > 0) {
        const change =
          ((currentNetWorth - estimatedStartOfMonthNetWorth) /
            Math.abs(estimatedStartOfMonthNetWorth)) *
          100;
        setSpendingData((prev) => ({ ...prev, netWorthChange: change }));
      }
    } catch (error) {
      logger.error("Error calculating net worth change:", error);
    }
  }, [currentNetWorth]);

  // Update net worth change when currentNetWorth changes
  useEffect(() => {
    const updateNetWorthChange = async () => {
      const authResult = await getAuthenticatedUser();
      if (authResult?.user?.id) {
        await calculateNetWorthChange(authResult.user.id);
      }
    };
    updateNetWorthChange();
  }, [currentNetWorth, calculateNetWorthChange]);

  return {
    spendingData,
    loading,
    refresh,
  };
}

