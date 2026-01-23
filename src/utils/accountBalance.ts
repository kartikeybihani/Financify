// Utility function to get the correct balance for an account
// For depository accounts, use available_balance if it exists, otherwise fall back to current_balance
// For other account types, use current_balance
//
// IMPORTANT: For credit cards, available_balance represents the credit limit (not remaining credit),
// so we always use current_balance (the debt amount) for credit cards.

import { Account } from "@/src/types/plaid";

/**
 * Gets the display balance for an account.
 * 
 * Balance selection logic:
 * - Depository accounts (checking, savings): Uses available_balance if available, otherwise current_balance
 * - Credit cards: Uses current_balance (debt amount). Note: available_balance = credit limit for credit cards
 * - Other account types (investments, loans): Uses current_balance
 * 
 * @param account - The account object with balances
 * @returns The balance to display/use for calculations
 */
export function getAccountBalance(account: Account | any): number {
  // Check if this is a depository account
  const isDepository = account?.type === "depository";
  
  if (isDepository) {
    // For depository accounts, prefer available_balance (available to spend)
    const availableBalance = 
      account?.available_balance ?? 
      account?.balances?.available ?? 
      null;
    
    const currentBalance = 
      account?.current_balance ?? 
      account?.balances?.current ?? 
      0;
    
    // Use available_balance if it exists and is not null/undefined, otherwise use current_balance
    return availableBalance !== null && availableBalance !== undefined 
      ? availableBalance 
      : currentBalance;
  }
  
  // For non-depository accounts (credit cards, loans, investments), use current_balance
  // Note: For credit cards, current_balance = debt, available_balance = credit limit
  return account?.current_balance ?? account?.balances?.current ?? 0;
}
