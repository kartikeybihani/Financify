import { Transaction } from "@/src/types/plaid";
import { parseTransactionDate } from "./dateUtils";

/**
 * Filter transactions by selected month/year
 */
export const filterTransactionsByMonth = (
  transactionsData: Transaction[],
  month: number,
  year: number,
): Transaction[] => {
  return transactionsData.filter((tx) => {
    const { year: txYear, month: txMonth } = parseTransactionDate(tx);
    return (
      txMonth === month &&
      txYear === year &&
      tx.amount > 0 &&
      tx.new_category !== "INTERNAL_TRANSFER"
    );
  });
};
