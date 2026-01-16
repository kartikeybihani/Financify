/**
 * Shared utility for account gradient colors
 * Provides consistent colors across all components (AccountSelector, AccountCard, AccountItem)
 */

export interface GradientColors {
  colors: readonly [string, string];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Get gradient colors for an account based on subtype, type, or name
 * Priority: subtype > type > name
 */
export const getAccountGradient = (
  subtype?: string | null,
  type?: string | null,
  accountName?: string | null
): GradientColors => {
  // Normalize inputs
  const normalizedSubtype = (subtype || "").toLowerCase().trim();
  const normalizedType = (type || "").toLowerCase().trim();
  const normalizedName = (accountName || "").toLowerCase().trim();

  // Define gradient schemes - clean and simple palette
  const gradients: {
    [key: string]: GradientColors;
  } = {
    // Credit cards
    credit: {
      colors: ["#151f59", "#343d70"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    // Savings accounts
    savings: {
      colors: ["#0d7377", "#2bb5a0"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    // Checking/depository accounts (default)
    checking: {
      colors: ["#1a759f", "#5aa3c7"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    // Investment accounts
    investment: {
      colors: ["#04780d", "#02ab10"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    // Loan accounts
    loan: {
      colors: ["#3b82db", "#0091c7"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  };

  // Check subtype first (most specific)
  if (normalizedSubtype) {
    // Direct match
    if (gradients[normalizedSubtype]) {
      return gradients[normalizedSubtype];
    }
    // Partial match for subtypes like "credit card"
    if (normalizedSubtype.includes("credit")) {
      return gradients.credit;
    }
    if (normalizedSubtype.includes("saving")) {
      return gradients.savings;
    }
    if (normalizedSubtype.includes("checking")) {
      return gradients.checking;
    }
  }

  // Check type second
  if (normalizedType) {
    if (normalizedType.includes("credit")) {
      return gradients.credit;
    }
    if (normalizedType.includes("saving")) {
      return gradients.savings;
    }
    if (normalizedType.includes("investment")) {
      return gradients.investment;
    }
    if (normalizedType.includes("loan")) {
      return gradients.loan;
    }
    // "depository" type typically means checking/savings
    if (normalizedType.includes("depository")) {
      // If we have subtype info, prefer that, otherwise default to checking
      if (normalizedSubtype.includes("saving")) {
        return gradients.savings;
      }
      return gradients.checking;
    }
  }

  // Check account name as last resort
  if (normalizedName) {
    if (normalizedName.includes("credit")) {
      return gradients.credit;
    }
    if (normalizedName.includes("saving")) {
      return gradients.savings;
    }
    if (normalizedName.includes("investment")) {
      return gradients.investment;
    }
    if (normalizedName.includes("loan")) {
      return gradients.loan;
    }
  }

  // Default to checking
  return gradients.checking;
};

/**
 * Get gradient colors as a simple array (for backward compatibility)
 * Useful for components that only need the color array
 */
export const getAccountGradientColors = (
  subtype?: string | null,
  type?: string | null,
  accountName?: string | null
): readonly [string, string] => {
  return getAccountGradient(subtype, type, accountName).colors;
};
