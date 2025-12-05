import { Transaction } from "@/src/types/plaid";

/**
 * Get the display date for a transaction
 * Uses authorized_date (when user actually made the transaction) if available,
 * otherwise falls back to posted date (date)
 * 
 * This ensures we show the date that matches when the user actually spent the money,
 * which is more accurate for budgeting and user expectations.
 */
export const getTransactionDisplayDate = (transaction: Transaction): string => {
  // Use authorized_date if available (when user actually made the transaction)
  // Fallback to date (posted date) if authorized_date is not available
  return transaction.authorized_date || transaction.date;
};

/**
 * Parse a transaction's display date as local date (not UTC)
 * Returns {year, month} where month is 0-indexed (0-11)
 */
export const parseTransactionDate = (
  transaction: Transaction
): { year: number; month: number } => {
  const dateStr = getTransactionDisplayDate(transaction);
  // Parse date string directly: "2024-11-30" -> year=2024, month=10 (0-indexed)
  const parts = dateStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Convert 1-12 to 0-11
  return { year, month };
};
