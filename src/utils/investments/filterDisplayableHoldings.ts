/**
 * Filter out cash and Open Ended Fund holdings.
 * Used by HoldingsMoversCard and Investments screen for consistent display logic.
 */
export interface HoldingWithSymbol {
  symbol?: string | null;
  description?: string | null;
  security_type?: string | null;
}

export function filterDisplayableHoldings<T extends HoldingWithSymbol>(
  holdings: T[]
): T[] {
  return holdings.filter((holding) => {
    const symbol = holding.symbol?.toLowerCase() || "";
    const description = holding.description?.toLowerCase() || "";
    const securityType = holding.security_type?.toLowerCase() || "";

    const isCash =
      symbol === "cash" ||
      symbol === "csh" ||
      symbol === "cash_equivalent" ||
      description.includes("cash") ||
      description.includes("money market") ||
      description.includes("sweep") ||
      securityType.includes("cash") ||
      securityType.includes("money market") ||
      securityType.includes("sweep");

    if (isCash) return false;
    if (holding.security_type === "Open Ended Fund") return false;
    return true;
  });
}

export function hasDisplayableHoldings<T extends HoldingWithSymbol>(
  holdings: T[] | null | undefined
): boolean {
  if (!holdings || holdings.length === 0) return false;
  return filterDisplayableHoldings(holdings).length > 0;
}
