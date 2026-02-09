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
 * - Depository accounts (checking, savings): Uses available_balance if available, falls back to current_balance if null
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
    // For depository accounts, prefer available_balance, fall back to current_balance if null
    // Handle both direct properties and nested balances object
    const availableBalance = 
      account?.available_balance ?? 
      account?.balances?.available ?? 
      null;
    
    const currentBalance = 
      account?.current_balance ?? 
      account?.balances?.current ?? 
      null;
    
    // Convert strings to numbers if needed
    const availableNum = availableBalance != null ? Number(availableBalance) : null;
    const currentNum = currentBalance != null ? Number(currentBalance) : null;
    
    // Use available_balance if it exists and is valid, otherwise fall back to current_balance
    if (availableNum != null && !isNaN(availableNum)) {
      return availableNum;
    }
    
    // Fall back to current_balance if available_balance is null/invalid
    if (currentNum != null && !isNaN(currentNum)) {
      return currentNum;
    }
    
    return 0;
  }
  
  // For non-depository accounts (credit cards, loans, investments), use current_balance
  // Note: For credit cards, current_balance = debt, available_balance = credit limit
  const balance = account?.current_balance ?? account?.balances?.current ?? 0;
  return balance != null ? Number(balance) : 0;
}

/**
 * Gets the balance to use for home screen total: current_balance + available_balance.
 * Used when displaying total amount so both balance fields are included.
 */
export function getAccountBalanceForTotal(account: Account | any): number {
  const current =
    account?.current_balance ?? account?.balances?.current ?? 0;
  const available =
    account?.available_balance ?? account?.balances?.available ?? 0;
  const currentNum = current != null ? Number(current) : 0;
  const availableNum = available != null ? Number(available) : 0;
  return (isNaN(currentNum) ? 0 : currentNum) + (isNaN(availableNum) ? 0 : availableNum);
}
