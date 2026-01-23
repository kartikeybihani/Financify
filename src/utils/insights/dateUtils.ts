import { Transaction } from "@/src/types/plaid";
import { MonthOption } from "@/src/components/insights/components/MonthSelector";

/**
 * Parse transaction date as local date (not UTC)
 * Uses authorized_date if available (when user actually made transaction),
 * otherwise uses posted date (date)
 */
export const parseTransactionDate = (
  tx: Transaction,
): { year: number; month: number } => {
  // Use authorized_date if available (when user actually made the transaction)
  // Fallback to date (posted date) if authorized_date is not available
  const dateStr = tx.authorized_date || tx.date;
  // Parse date string directly: "2024-11-30" -> year=2024, month=10 (0-indexed)
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Convert 1-12 to 0-11
  return { year, month };
};

/**
 * Get display date from transaction (uses authorized_date if available)
 */
export const getTransactionDisplayDate = (tx: Transaction): string => {
  return tx.authorized_date || tx.date;
};

/**
 * Format date string to readable format
 * dateStr format: "YYYY-MM-DD"
 */
export const formatDate = (dateStr: string): string => {
  // Parse date string directly to avoid timezone shifts
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  // Create date in local timezone
  const date = new Date(year, month, day);

  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
};

/**
 * Format transaction date using display date (authorized_date if available)
 */
export const formatTransactionDate = (tx: Transaction): string => {
  return formatDate(getTransactionDisplayDate(tx));
};

/**
 * Generate available months from transactions (last 24 months max)
 */
export const generateAvailableMonths = (
  transactionsData: Transaction[],
): MonthOption[] => {
  // Filter out INTERNAL_TRANSFER transactions
  const expenses = transactionsData.filter(
    (tx) => tx.amount > 0 && tx.new_category !== "INTERNAL_TRANSFER",
  );

  // Create a map of month-year to total spent
  const monthMap = new Map<
    string,
    { month: number; year: number; total: number }
  >();

  expenses.forEach((tx) => {
    const { year, month } = parseTransactionDate(tx);
    const key = `${year}-${month}`;

    if (!monthMap.has(key)) {
      monthMap.set(key, { month, year, total: 0 });
    }
    monthMap.get(key)!.total += tx.amount;
  });

  // Convert to array and sort by date (most recent first)
  const monthsArray: MonthOption[] = Array.from(monthMap.values())
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    })
    .slice(0, 24) // Limit to last 24 months
    .map(({ month, year, total }) => ({
      month,
      year,
      totalSpent: total,
    }));

  return monthsArray;
};
