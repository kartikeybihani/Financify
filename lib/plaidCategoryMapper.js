/**
 * Comprehensive Plaid Category Mapper
 * Maps Plaid's 16 primary + 104 detailed categories to app's 13 default categories
 *
 * App Categories:
 * 1. Food (dining out)
 * 2. Groceries
 * 3. Housing
 * 4. Transportation
 * 5. Shopping
 * 6. Entertainment
 * 7. Subscriptions
 * 8. Health
 * 9. Travel
 * 10. Personal Care
 * 11. Income
 * 12. Savings
 * 13. Other
 */

/**
 * Maps Plaid detailed categories to app categories
 * Priority: Exact match > Pattern match > Primary category fallback
 */
const DETAILED_CATEGORY_MAP = {
  // FOOD_AND_DRINK - Groceries
  FOOD_AND_DRINK_GROCERIES: { top: "Groceries", sub: "Groceries" },
  FOOD_AND_DRINK_SUPERMARKETS: { top: "Groceries", sub: "Groceries" },

  // FOOD_AND_DRINK - Food (dining out)
  FOOD_AND_DRINK_RESTAURANTS: { top: "Food", sub: "Restaurants" },
  FOOD_AND_DRINK_FAST_FOOD: { top: "Food", sub: "Fast Food" },
  FOOD_AND_DRINK_COFFEE: { top: "Food", sub: "Coffee" },
  FOOD_AND_DRINK_ALCOHOL: { top: "Food", sub: "Alcohol" },
  FOOD_AND_DRINK_BARS: { top: "Food", sub: "Bars" },

  // GENERAL_MERCHANDISE - Shopping
  GENERAL_MERCHANDISE_ONLINE_SHOPPING: {
    top: "Shopping",
    sub: "Online Shopping",
  },
  GENERAL_MERCHANDISE_SUPERSTORES: { top: "Shopping", sub: "Superstores" },
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: {
    top: "Shopping",
    sub: "Department Stores",
  },
  GENERAL_MERCHANDISE_DISCOUNT_STORES: {
    top: "Shopping",
    sub: "Discount Stores",
  },
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: {
    top: "Shopping",
    sub: "Clothing",
  },
  GENERAL_MERCHANDISE_ELECTRONICS: { top: "Shopping", sub: "Electronics" },
  GENERAL_MERCHANDISE_HOME_AND_GARDEN: {
    top: "Shopping",
    sub: "Home & Garden",
  },
  GENERAL_MERCHANDISE_BOOKSTORES: { top: "Shopping", sub: "Books" },
  GENERAL_MERCHANDISE_PET_SUPPLIES: { top: "Shopping", sub: "Pet Supplies" },
  GENERAL_MERCHANDISE_SPORTING_GOODS: {
    top: "Shopping",
    sub: "Sporting Goods",
  },
  GENERAL_MERCHANDISE_TOYS_AND_GAMES: { top: "Shopping", sub: "Toys & Games" },

  // TRANSPORTATION
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: {
    top: "Transportation",
    sub: "Rideshare",
  },
  TRANSPORTATION_GAS: { top: "Transportation", sub: "Gas" },
  TRANSPORTATION_PARKING: { top: "Transportation", sub: "Parking" },
  TRANSPORTATION_PUBLIC_TRANSPORTATION: {
    top: "Transportation",
    sub: "Public Transit",
  },
  TRANSPORTATION_TOLLS: { top: "Transportation", sub: "Tolls" },
  TRANSPORTATION_AUTOMOTIVE: { top: "Transportation", sub: "Automotive" },

  // ENTERTAINMENT - Subscriptions (streaming)
  ENTERTAINMENT_TV_AND_MOVIES: { top: "Subscriptions", sub: "Streaming" },
  ENTERTAINMENT_STREAMING_SERVICES: { top: "Subscriptions", sub: "Streaming" },

  // ENTERTAINMENT - Entertainment
  ENTERTAINMENT_MUSIC: { top: "Entertainment", sub: "Music" },
  ENTERTAINMENT_GAMES: { top: "Entertainment", sub: "Games" },
  ENTERTAINMENT_SPORTS: { top: "Entertainment", sub: "Sports" },
  ENTERTAINMENT_ARTS: { top: "Entertainment", sub: "Arts" },
  ENTERTAINMENT_THEATERS: { top: "Entertainment", sub: "Theaters" },
  ENTERTAINMENT_CASINOS: { top: "Entertainment", sub: "Casinos" },

  // TRAVEL
  TRAVEL_FLIGHTS: { top: "Travel", sub: "Flights" },
  TRAVEL_HOTELS: { top: "Travel", sub: "Hotels" },
  TRAVEL_RENTAL_CARS: { top: "Travel", sub: "Rental Cars" },
  TRAVEL_CRUISES: { top: "Travel", sub: "Cruises" },
  TRAVEL_RAIL: { top: "Travel", sub: "Rail" },
  TRAVEL_TAXIS_AND_RIDE_SHARES: { top: "Travel", sub: "Rideshare" },
  TRAVEL_GAS: { top: "Travel", sub: "Gas" },
  TRAVEL_PARKING: { top: "Travel", sub: "Parking" },
  TRAVEL_TOLLS: { top: "Travel", sub: "Tolls" },

  // RENT_AND_UTILITIES - Housing
  RENT_AND_UTILITIES_RENT: { top: "Housing", sub: "Rent" },
  RENT_AND_UTILITIES_MORTGAGE: { top: "Housing", sub: "Mortgage" },
  RENT_AND_UTILITIES_ELECTRICITY: { top: "Housing", sub: "Utilities" },
  RENT_AND_UTILITIES_GAS: { top: "Housing", sub: "Utilities" },
  RENT_AND_UTILITIES_WATER: { top: "Housing", sub: "Utilities" },
  RENT_AND_UTILITIES_INTERNET: { top: "Housing", sub: "Internet" },
  RENT_AND_UTILITIES_PHONE: { top: "Housing", sub: "Phone" },
  RENT_AND_UTILITIES_CABLE: { top: "Housing", sub: "Cable" },
  RENT_AND_UTILITIES_TRASH: { top: "Housing", sub: "Utilities" },

  // GENERAL_SERVICES - Housing (utilities)
  GENERAL_SERVICES_UTILITIES: { top: "Housing", sub: "Utilities" },
  GENERAL_SERVICES_PHONE: { top: "Housing", sub: "Phone" },
  GENERAL_SERVICES_INTERNET: { top: "Housing", sub: "Internet" },
  GENERAL_SERVICES_CABLE: { top: "Housing", sub: "Cable" },

  // GENERAL_SERVICES - Other
  GENERAL_SERVICES_ACCOUNTING: { top: "Other", sub: "Services" },
  GENERAL_SERVICES_LEGAL: { top: "Other", sub: "Services" },
  GENERAL_SERVICES_PROFESSIONAL_SERVICES: { top: "Other", sub: "Services" },

  // HOME_IMPROVEMENT - Housing
  HOME_IMPROVEMENT: { top: "Housing", sub: "Home Improvement" },

  // HEALTHCARE - Health
  HEALTHCARE_PRIMARY_CARE: { top: "Health", sub: "Medical" },
  HEALTHCARE_DENTAL_CARE: { top: "Health", sub: "Dental" },
  HEALTHCARE_SPECIALTY_CARE: { top: "Health", sub: "Medical" },
  HEALTHCARE_MENTAL_HEALTH: { top: "Health", sub: "Mental Health" },
  HEALTHCARE_PHARMACIES: { top: "Health", sub: "Pharmacy" },
  HEALTHCARE_MEDICAL_DEVICES: { top: "Health", sub: "Medical" },
  HEALTHCARE_FITNESS: { top: "Health", sub: "Fitness" },

  // PERSONAL_CARE
  PERSONAL_CARE_HAIR: { top: "Personal Care", sub: "Hair" },
  PERSONAL_CARE_SPAS: { top: "Personal Care", sub: "Spas" },
  PERSONAL_CARE_NAILS: { top: "Personal Care", sub: "Nails" },
  PERSONAL_CARE_SKIN_CARE: { top: "Personal Care", sub: "Skincare" },
  PERSONAL_CARE_COSMETICS: { top: "Personal Care", sub: "Cosmetics" },

  // INCOME
  INCOME_WAGES: { top: "Income", sub: "Wages" },
  INCOME_INTEREST: { top: "Income", sub: "Interest" },
  INCOME_DIVIDENDS: { top: "Income", sub: "Dividends" },
  INCOME_GIFTS: { top: "Income", sub: "Gifts" },
  INCOME_OTHER: { top: "Income", sub: "Other" },

  // TRANSFER_IN - Income or Savings
  TRANSFER_IN_SAVINGS: { top: "Savings", sub: "Savings" },
  TRANSFER_IN_OTHER: { top: "Income", sub: "Transfer" },

  // TRANSFER_OUT - Savings
  TRANSFER_OUT_SAVINGS: { top: "Savings", sub: "Savings" },
  TRANSFER_OUT_OTHER: { top: "Other", sub: "Transfer" },

  // BANK_TRANSFERS - Savings
  BANK_TRANSFERS_SAVINGS: { top: "Savings", sub: "Savings" },
  BANK_TRANSFERS_OTHER: { top: "Other", sub: "Transfer" },

  // LOAN_PAYMENTS - Credit Card Payment (INTERNAL_TRANSFER)
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: {
    top: "INTERNAL_TRANSFER",
    sub: "INTERNAL_TRANSFER",
  },

  // LOAN_PAYMENTS - Other
  LOAN_PAYMENTS_AUTO_LOAN: { top: "Other", sub: "Loan Payment" },
  LOAN_PAYMENTS_STUDENT_LOAN: { top: "Other", sub: "Loan Payment" },
  LOAN_PAYMENTS_PERSONAL_LOAN: { top: "Other", sub: "Loan Payment" },
  LOAN_PAYMENTS_MORTGAGE: { top: "Housing", sub: "Mortgage" },

  // TRANSFER categories that are internal transfers (not savings)
  TRANSFER_IN_INTERNAL: { top: "INTERNAL_TRANSFER", sub: "INTERNAL_TRANSFER" },
  TRANSFER_OUT_INTERNAL: { top: "INTERNAL_TRANSFER", sub: "INTERNAL_TRANSFER" },
  BANK_TRANSFERS_INTERNAL: {
    top: "INTERNAL_TRANSFER",
    sub: "INTERNAL_TRANSFER",
  },

  // EDUCATION - Other
  EDUCATION_TUITION: { top: "Other", sub: "Education" },
  EDUCATION_BOOKS: { top: "Other", sub: "Education" },
  EDUCATION_SUPPLIES: { top: "Other", sub: "Education" },
};

/**
 * Maps Plaid primary categories to app categories
 * Used as fallback when detailed category is not available or not mapped
 */
const PRIMARY_CATEGORY_MAP = {
  FOOD_AND_DRINK: { top: "Food", sub: "Dining Out" }, // Will be overridden if GROCERY detected
  GENERAL_MERCHANDISE: { top: "Shopping", sub: "Shopping" },
  TRANSPORTATION: { top: "Transportation", sub: "Transportation" },
  ENTERTAINMENT: { top: "Entertainment", sub: "Entertainment" }, // Will be overridden if STREAMING detected
  TRAVEL: { top: "Travel", sub: "Travel" },
  RENT_AND_UTILITIES: { top: "Housing", sub: "Housing" },
  GENERAL_SERVICES: { top: "Other", sub: "Services" },
  HOME_IMPROVEMENT: { top: "Housing", sub: "Home Improvement" },
  HEALTHCARE: { top: "Health", sub: "Health" },
  PERSONAL_CARE: { top: "Personal Care", sub: "Personal Care" },
  INCOME: { top: "Income", sub: "Income" },
  TRANSFER_IN: { top: "Income", sub: "Transfer" },
  TRANSFER_OUT: { top: "Other", sub: "Transfer" },
  BANK_TRANSFERS: { top: "Other", sub: "Transfer" },
  LOAN_PAYMENTS: { top: "Other", sub: "Loan Payment" },
  EDUCATION: { top: "Other", sub: "Education" },
};

/**
 * Parse subcategory from detailed category string
 * Example: "FOOD_AND_DRINK_COFFEE" -> "Coffee"
 */
function parseSubcategory(detailed) {
  if (!detailed) return null;

  const parts = detailed.split("_");
  if (parts.length < 3) return null;

  // Get the last part(s) after the primary category
  // FOOD_AND_DRINK_COFFEE -> COFFEE
  // GENERAL_MERCHANDISE_ONLINE_SHOPPING -> ONLINE_SHOPPING
  const subcategoryParts = parts.slice(2);

  // Convert to title case: "COFFEE" -> "Coffee", "ONLINE_SHOPPING" -> "Online Shopping"
  return subcategoryParts
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Check if transaction name/description indicates an internal transfer
 * @param {string|null|undefined} name - Transaction name
 * @param {string|null|undefined} merchantName - Merchant name
 * @param {string|null|undefined} originalDescription - Original description
 * @returns {boolean} - True if this appears to be an internal transfer based on name/description
 */
function isInternalTransferByName(name, merchantName, originalDescription) {
  // Combine all text fields for pattern matching
  const combinedText = [
    name || "",
    merchantName || "",
    originalDescription || "",
  ]
    .join(" ")
    .toLowerCase()
    .trim();

  if (!combinedText) {
    return false;
  }

  // Patterns that strongly indicate internal transfers
  const internalTransferPatterns = [
    // Credit card payment patterns
    /payment\s+thank\s+you/i,
    /payment\s+thankyou/i,
    /thank\s+you\s+for\s+payment/i,
    /credit\s+card\s+payment/i,
    /card\s+payment/i,
    /cc\s+payment/i,

    // Autopay patterns
    /autopay/i,
    /auto\s*[-]?\s*pay/i,
    /auto\s*payment/i,
    /automatic\s+payment/i,

    // ACH patterns
    /ach\s+payment/i,
    /ach\s+transfer/i,
    /ach\s+debit/i,
    /ach\s+credit/i,

    // Bank transfer patterns (but exclude savings-related)
    /bank\s+transfer/i,
    /account\s+transfer/i,
    /internal\s+transfer/i,
    /transfer\s+between\s+accounts/i,
    /account\s+to\s+account/i,

    // Payment received patterns (when it's from yourself)
    /payment\s+received/i,
    /payment\s+posted/i,

    // Generic payment patterns that are likely internal
    /online\s+payment/i,
    /electronic\s+payment/i,
    /bill\s+pay\s+payment/i,
    /billpay/i,
  ];

  // Check if any pattern matches
  for (const pattern of internalTransferPatterns) {
    if (pattern.test(combinedText)) {
      // Additional check: exclude savings-related transfers
      // If it explicitly mentions "savings", it's probably a savings transfer, not internal
      if (!/savings|investment|deposit\s+to\s+savings/i.test(combinedText)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if Plaid category indicates an internal transfer
 * @param {string|null|undefined} primary - Plaid primary category
 * @param {string|null|undefined} detailed - Plaid detailed category
 * @returns {boolean} - True if this is an internal transfer
 */
function isInternalTransferCategory(primary, detailed) {
  if (!primary && !detailed) {
    return false;
  }

  const upperPrimary = (primary || "").toUpperCase();
  const upperDetailed = (detailed || "").toUpperCase();

  // Credit card payments
  if (
    upperDetailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" ||
    upperDetailed.includes("CREDIT_CARD_PAYMENT")
  ) {
    return true;
  }

  // Internal transfers (not savings-related)
  if (
    upperDetailed === "TRANSFER_IN_INTERNAL" ||
    upperDetailed === "TRANSFER_OUT_INTERNAL" ||
    upperDetailed === "BANK_TRANSFERS_INTERNAL" ||
    upperDetailed.includes("TRANSFER_INTERNAL")
  ) {
    return true;
  }

  // Generic transfers that are likely internal (not savings)
  // TRANSFER_IN/TRANSFER_OUT/BANK_TRANSFERS without SAVINGS in detailed
  if (
    (upperPrimary === "TRANSFER_IN" ||
      upperPrimary === "TRANSFER_OUT" ||
      upperPrimary === "BANK_TRANSFERS") &&
    !upperDetailed.includes("SAVINGS")
  ) {
    // Check if it's explicitly marked as internal or if it's a generic transfer
    if (
      upperDetailed === "TRANSFER_IN_OTHER" ||
      upperDetailed === "TRANSFER_OUT_OTHER" ||
      upperDetailed === "BANK_TRANSFERS_OTHER" ||
      !upperDetailed // No detailed category = likely internal transfer
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Comprehensive internal transfer detection combining category and name-based checks
 * @param {string|null|undefined} primary - Plaid primary category
 * @param {string|null|undefined} detailed - Plaid detailed category
 * @param {string|null|undefined} name - Transaction name
 * @param {string|null|undefined} merchantName - Merchant name
 * @param {string|null|undefined} originalDescription - Original description
 * @returns {boolean} - True if this is an internal transfer
 */
function isInternalTransfer(
  primary,
  detailed,
  name = null,
  merchantName = null,
  originalDescription = null
) {
  // First check Plaid categories (most reliable)
  if (isInternalTransferCategory(primary, detailed)) {
    return true;
  }

  // Then check transaction names/descriptions (catches cases Plaid misses)
  if (isInternalTransferByName(name, merchantName, originalDescription)) {
    return true;
  }

  return false;
}

/**
 * Main mapping function
 * Maps Plaid categories to app categories with intelligent fallbacks
 *
 * @param {string|null|undefined} primary - Plaid primary category
 * @param {string|null|undefined} detailed - Plaid detailed category
 * @returns {{top: string, sub: string}} - Mapped category
 */
function mapPlaidToAppCategory(primary, detailed) {
  // Handle null/undefined
  if (!primary && !detailed) {
    return { top: "Other", sub: "Other" };
  }

  const upperPrimary = (primary || "").toUpperCase();
  const upperDetailed = (detailed || "").toUpperCase();

  // Priority 0: Internal transfer detection (highest priority)
  if (isInternalTransferCategory(primary, detailed)) {
    return { top: "INTERNAL_TRANSFER", sub: "INTERNAL_TRANSFER" };
  }

  // Priority 1: Exact detailed category match
  if (detailed && DETAILED_CATEGORY_MAP[detailed]) {
    return DETAILED_CATEGORY_MAP[detailed];
  }

  // Priority 2: Smart Food vs Groceries detection (even if not in exact map)
  if (upperPrimary === "FOOD_AND_DRINK") {
    if (
      upperDetailed.includes("GROCERY") ||
      upperDetailed.includes("SUPERMARKET") ||
      detailed === "FOOD_AND_DRINK_GROCERIES" ||
      detailed === "FOOD_AND_DRINK_SUPERMARKETS"
    ) {
      return { top: "Groceries", sub: "Groceries" };
    }
    // All other food = dining out
    const sub = parseSubcategory(detailed) || "Dining Out";
    return { top: "Food", sub };
  }

  // Priority 3: Subscriptions detection from Entertainment
  if (upperPrimary === "ENTERTAINMENT") {
    if (
      upperDetailed.includes("STREAMING") ||
      upperDetailed.includes("TV_AND_MOVIES") ||
      detailed === "ENTERTAINMENT_STREAMING_SERVICES" ||
      detailed === "ENTERTAINMENT_TV_AND_MOVIES"
    ) {
      return { top: "Subscriptions", sub: "Streaming" };
    }
    // Other entertainment
    const sub = parseSubcategory(detailed) || "Entertainment";
    return { top: "Entertainment", sub };
  }

  // Priority 4: Savings detection from transfers
  if (
    upperPrimary === "TRANSFER_IN" ||
    upperPrimary === "TRANSFER_OUT" ||
    upperPrimary === "BANK_TRANSFERS"
  ) {
    if (upperDetailed.includes("SAVINGS")) {
      return { top: "Savings", sub: "Savings" };
    }
    // Fall through to primary mapping
  }

  // Priority 5: Primary category mapping
  if (primary && PRIMARY_CATEGORY_MAP[primary]) {
    const mapped = PRIMARY_CATEGORY_MAP[primary];
    // Try to enhance subcategory from detailed if available
    if (detailed) {
      const parsedSub = parseSubcategory(detailed);
      if (parsedSub) {
        return { top: mapped.top, sub: parsedSub };
      }
    }
    return mapped;
  }

  // Priority 6: Pattern matching for unmapped detailed categories
  if (detailed) {
    // Try to infer from detailed category structure
    if (
      upperDetailed.includes("GROCERY") ||
      upperDetailed.includes("SUPERMARKET")
    ) {
      return { top: "Groceries", sub: "Groceries" };
    }
    if (
      upperDetailed.includes("RESTAURANT") ||
      upperDetailed.includes("FAST_FOOD") ||
      upperDetailed.includes("COFFEE")
    ) {
      return { top: "Food", sub: parseSubcategory(detailed) || "Dining Out" };
    }
    if (
      upperDetailed.includes("STREAMING") ||
      upperDetailed.includes("TV_AND_MOVIES")
    ) {
      return { top: "Subscriptions", sub: "Streaming" };
    }
    if (
      upperDetailed.includes("UTILITIES") ||
      upperDetailed.includes("PHONE") ||
      upperDetailed.includes("INTERNET")
    ) {
      return { top: "Housing", sub: parseSubcategory(detailed) || "Utilities" };
    }
    if (upperDetailed.includes("RENT") || upperDetailed.includes("MORTGAGE")) {
      return { top: "Housing", sub: parseSubcategory(detailed) || "Housing" };
    }
    if (
      upperDetailed.includes("HEALTH") ||
      upperDetailed.includes("MEDICAL") ||
      upperDetailed.includes("PHARMACY")
    ) {
      return { top: "Health", sub: parseSubcategory(detailed) || "Health" };
    }
    if (
      upperDetailed.includes("TRANSPORT") ||
      upperDetailed.includes("GAS") ||
      upperDetailed.includes("UBER") ||
      upperDetailed.includes("LYFT")
    ) {
      return {
        top: "Transportation",
        sub: parseSubcategory(detailed) || "Transportation",
      };
    }
    if (
      upperDetailed.includes("TRAVEL") ||
      upperDetailed.includes("FLIGHT") ||
      upperDetailed.includes("HOTEL")
    ) {
      return { top: "Travel", sub: parseSubcategory(detailed) || "Travel" };
    }
    if (
      upperDetailed.includes("SHOPPING") ||
      upperDetailed.includes("MERCHANDISE")
    ) {
      return { top: "Shopping", sub: parseSubcategory(detailed) || "Shopping" };
    }
    if (
      upperDetailed.includes("INCOME") ||
      upperDetailed.includes("WAGE") ||
      upperDetailed.includes("SALARY")
    ) {
      return { top: "Income", sub: parseSubcategory(detailed) || "Income" };
    }
    if (
      upperDetailed.includes("SAVINGS") ||
      upperDetailed.includes("INVESTMENT")
    ) {
      return { top: "Savings", sub: parseSubcategory(detailed) || "Savings" };
    }
    if (
      upperDetailed.includes("PERSONAL_CARE") ||
      upperDetailed.includes("BEAUTY") ||
      upperDetailed.includes("HAIR")
    ) {
      return {
        top: "Personal Care",
        sub: parseSubcategory(detailed) || "Personal Care",
      };
    }
    if (
      upperDetailed.includes("EDUCATION") ||
      upperDetailed.includes("STUDENT") ||
      upperDetailed.includes("SCHOOL")
    ) {
      return { top: "Other", sub: "Education" };
    }
  }

  // Priority 7: Fallback to Other
  return { top: "Other", sub: "Other" };
}

export {
  mapPlaidToAppCategory,
  parseSubcategory,
  isInternalTransferCategory,
  isInternalTransferByName,
  isInternalTransfer,
};
