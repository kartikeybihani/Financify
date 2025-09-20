// Category mapping utility for simplifying Plaid categories
// Maps Plaid's detailed categories to our simplified top-level and sub-categories

// Hardcoded mapping from Plaid categories to simplified categories
const categoryMap = {
  // Food & Drink
  FOOD_AND_DRINK_FAST_FOOD: { top: "Food", sub: "Eating Out" },
  FOOD_AND_DRINK_RESTAURANT: { top: "Food", sub: "Eating Out" },
  FOOD_AND_DRINK_COFFEE: { top: "Food", sub: "Eating Out" },
  FOOD_AND_DRINK_GROCERIES: { top: "Food", sub: "Groceries" },
  FOOD_AND_DRINK_ALCOHOL_AND_BARS: { top: "Food", sub: "Eating Out" },
  FOOD_AND_DRINK_DELIVERY: { top: "Food", sub: "Eating Out" },

  // Transportation
  TRANSPORTATION_GAS: { top: "Transportation", sub: "Fuel" },
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: {
    top: "Transportation",
    sub: "Local Transport",
  },
  TRANSPORTATION_PARKING: { top: "Transportation", sub: "Parking" },
  TRANSPORTATION_PUBLIC_TRANSPORTATION: {
    top: "Transportation",
    sub: "Local Transport",
  },
  TRANSPORTATION_AUTOMOTIVE: {
    top: "Transportation",
    sub: "Vehicle Maintenance",
  },

  // Travel
  TRAVEL_FLIGHTS: { top: "Travel", sub: "Flights" },
  TRAVEL_LODGING: { top: "Travel", sub: "Lodging" },
  TRAVEL_RENTAL_CARS: { top: "Travel", sub: "Car Rental" },
  TRAVEL_TRAINS: { top: "Travel", sub: "Ground Transport" },
  TRAVEL_BUSES: { top: "Travel", sub: "Ground Transport" },

  // Loans & Payments
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: { top: "Loans", sub: "Personal Loan" },
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: {
    top: "Loans",
    sub: "Credit Card Payment",
  },
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: { top: "Loans", sub: "Student Loan" },
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: { top: "Loans", sub: "Mortgage" },
  LOAN_PAYMENTS_AUTO_LOAN_PAYMENT: { top: "Loans", sub: "Auto Loan" },

  // Income
  INCOME_WAGES: { top: "Income", sub: "Wages" },
  INCOME_INTEREST_EARNED: { top: "Income", sub: "Interest" },
  INCOME_DIVIDENDS: { top: "Income", sub: "Dividends" },
  INCOME_TAX_REFUND: { top: "Income", sub: "Tax Refund" },
  INCOME_BONUS: { top: "Income", sub: "Bonus" },

  // Shopping
  GENERAL_MERCHANDISE_SUPERSTORES: { top: "Shopping", sub: "Superstores" },
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: {
    top: "Shopping",
    sub: "Clothing",
  },
  GENERAL_MERCHANDISE_ELECTRONICS: { top: "Shopping", sub: "Electronics" },
  GENERAL_MERCHANDISE_ONLINE_SHOPPING: {
    top: "Shopping",
    sub: "Online Shopping",
  },
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: {
    top: "Shopping",
    sub: "Department Stores",
  },

  // Entertainment
  ENTERTAINMENT_VIDEO_GAMES: { top: "Entertainment", sub: "Video Games" },
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: {
    top: "Entertainment",
    sub: "Events & Museums",
  },
  ENTERTAINMENT_MOVIES_AND_MUSIC: {
    top: "Entertainment",
    sub: "Movies & Music",
  },
  ENTERTAINMENT_THEATERS: { top: "Entertainment", sub: "Theaters" },

  // Personal Care
  PERSONAL_CARE_HAIR_AND_BEAUTY: { top: "Personal Care", sub: "Hair & Beauty" },
  PERSONAL_CARE_PHARMACY: { top: "Personal Care", sub: "Pharmacy" },
  PERSONAL_CARE_DENTIST: { top: "Personal Care", sub: "Healthcare" },
  PERSONAL_CARE_DOCTOR: { top: "Personal Care", sub: "Healthcare" },

  // Other categories
  HOME_IMPROVEMENT_HARDWARE: { top: "Other", sub: "Home Improvement" },
  GENERAL_SERVICES_OTHER_GENERAL_SERVICES: {
    top: "Other",
    sub: "General Services",
  },
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: {
    top: "Other",
    sub: "Government",
  },
  TRANSFER_IN_ACCOUNT_TRANSFER: { top: "Other", sub: "Transfers" },
  TRANSFER_OUT_ACCOUNT_TRANSFER: { top: "Other", sub: "Transfers" },
  BANK_FEES: { top: "Other", sub: "Bank Fees" },
  FINANCIAL_ADVISOR: { top: "Other", sub: "Financial Services" },
};

/**
 * Maps a Plaid category to simplified top and sub categories
 * @param {string|null|undefined} plaidCategory - The original Plaid category
 * @returns {Object} Simplified category object with top and sub categories
 */
export function mapPlaidCategory(plaidCategory) {
  if (!plaidCategory) {
    return { top: "Other", sub: "Other" };
  }

  // Direct mapping lookup
  const mapped = categoryMap[plaidCategory];
  if (mapped) {
    return mapped;
  }

  // Fallback: try to match partial categories
  const upperCategory = plaidCategory.toUpperCase();

  // Food-related fallbacks
  if (
    upperCategory.includes("FOOD") ||
    upperCategory.includes("RESTAURANT") ||
    upperCategory.includes("COFFEE")
  ) {
    return { top: "Food", sub: "Eating Out" };
  }
  if (
    upperCategory.includes("GROCERY") ||
    upperCategory.includes("SUPERMARKET")
  ) {
    return { top: "Food", sub: "Groceries" };
  }

  // Transportation fallbacks
  if (
    upperCategory.includes("TRANSPORT") ||
    upperCategory.includes("GAS") ||
    upperCategory.includes("UBER") ||
    upperCategory.includes("LYFT")
  ) {
    return { top: "Transportation", sub: "Local Transport" };
  }

  // Shopping fallbacks
  if (
    upperCategory.includes("SHOPPING") ||
    upperCategory.includes("MERCHANDISE") ||
    upperCategory.includes("AMAZON")
  ) {
    return { top: "Shopping", sub: "Online Shopping" };
  }

  // Entertainment fallbacks
  if (
    upperCategory.includes("ENTERTAINMENT") ||
    upperCategory.includes("MOVIE") ||
    upperCategory.includes("GAME")
  ) {
    return { top: "Entertainment", sub: "Events & Museums" };
  }

  // Income fallbacks
  if (
    upperCategory.includes("INCOME") ||
    upperCategory.includes("WAGE") ||
    upperCategory.includes("SALARY")
  ) {
    return { top: "Income", sub: "Wages" };
  }

  // Default fallback
  return { top: "Other", sub: "Other" };
}
