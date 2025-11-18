import { Ionicons } from "@expo/vector-icons";
import { Account, Category, FilterOptions } from '@/src/components/EnhancedFilterModal/types';
import { ALL_TIME_PERIODS } from '@/src/components/EnhancedFilterModal/constants';

// Get card gradient based on account type
export const getAccountGradient = (subtype: string) => {
  const gradients: {
    [key: string]: {
      colors: readonly [string, string];
      start: { x: number; y: number };
      end: { x: number; y: number };
    };
  } = {
    checking: {
      colors: ["#4A90E2", "#357AFF"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    savings: {
      colors: ["#f093fb", "#f5576c"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    "credit card": {
      colors: ["#1e3a8a", "#1e40af"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    default: {
      colors: ["#a8edea", "#fed6e3"] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  };

  return gradients[subtype.toLowerCase()] || gradients.default;
};

// Get account type icon
export const getAccountIcon = (subtype: string): keyof typeof Ionicons.glyphMap => {
  const icons: { [key: string]: keyof typeof Ionicons.glyphMap } = {
    checking: "card-outline",
    savings: "wallet-outline",
    "credit card": "card",
    default: "ellipse-outline",
  };
  return icons[subtype.toLowerCase()] || icons.default;
};

// Format account name with mask
export const formatAccountName = (account: Account): string => {
  const mask = account.mask ? `•••${account.mask}` : "";
  return `${account.name} ${mask}`.trim();
};

// Get selected accounts description
export const getSelectedAccountsDescription = (accountIds: string[], accounts: Account[]): string => {
  if (accountIds.length === 0) {
    return "All accounts";
  } else if (accountIds.length === 1) {
    const account = accounts.find((acc) => acc.account_id === accountIds[0]);
    return account?.institution_name || "Selected account";
  } else {
    return `${accountIds.length} accounts selected`;
  }
};

// Get selected categories description
export const getSelectedCategoriesDescription = (categoryIds: string[], categories: Category[]): string => {
  if (categoryIds.length === 0) {
    return "All categories";
  } else if (categoryIds.length === 1) {
    const category = categories.find((cat) => cat.id === categoryIds[0]);
    return category ? category.name : "Selected category";
  } else {
    return `${categoryIds.length} categories selected`;
  }
};

// Get selected time period description
export const getSelectedTimePeriodDescription = (timePeriod: string): string => {
  const selectedPeriod = ALL_TIME_PERIODS.find((p) => p.id === timePeriod);
  return selectedPeriod ? selectedPeriod.label : "Last 7 days";
};

// Toggle account selection
export const toggleAccountSelection = (accountId: string, currentFilters: FilterOptions): FilterOptions => {
  const currentIds = currentFilters.accountIds || [];
  const isSelected = currentIds.includes(accountId);

  if (isSelected) {
    return {
      ...currentFilters,
      accountIds: currentIds.filter((id) => id !== accountId),
    };
  } else {
    return {
      ...currentFilters,
      accountIds: [...currentIds, accountId],
    };
  }
};

// Toggle category selection
export const toggleCategorySelection = (categoryId: string, currentFilters: FilterOptions): FilterOptions => {
  const currentIds = currentFilters.categoryIds || [];
  const isCurrentlySelected = currentIds.includes(categoryId);

  if (isCurrentlySelected) {
    return {
      ...currentFilters,
      categoryIds: currentIds.filter((id) => id !== categoryId),
    };
  } else {
    return {
      ...currentFilters,
      categoryIds: [...currentIds, categoryId],
    };
  }
};

// Reset filters to default
export const getResetFilters = (): FilterOptions => ({
  accountIds: [],
  timePeriod: "30days",
  categoryIds: [],
});
