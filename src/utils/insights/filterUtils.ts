import { FilterOptions, Account } from "@/src/components/EnhancedFilterModal";

/**
 * Helper function to get filter description
 */
export const getFilterDescription = (
  filterOptions: FilterOptions,
  accounts: Account[],
): string => {
  const accountIds = filterOptions.accountIds || [];
  const accountName =
    accountIds.length === 0
      ? "All Accounts"
      : accountIds.length === 1
        ? accounts.find((acc) => acc.account_id === accountIds[0])
            ?.institution_name || "Selected Account"
        : `${accountIds.length} accounts`;

  // Helper function to format month-year period IDs
  const formatTimePeriodName = (timePeriod: string): string => {
    const quickPeriods: { [key: string]: string } = {
      all: "All",
      "7days": "7 days",
      "30days": "30 days",
      "3months": "3 months",
      "6months": "6 months",
      "12months": "12 months",
    };

    if (quickPeriods[timePeriod]) {
      return quickPeriods[timePeriod];
    }

    // Handle month-year format (e.g., "january2024" -> "Jan 2024")
    const monthYearMatch = timePeriod.match(
      /^(january|february|march|april|may|june|july|august|september|october|november|december)(\d{4})$/i,
    );
    if (monthYearMatch) {
      const monthName = monthYearMatch[1].toLowerCase();
      const year = monthYearMatch[2];

      const monthAbbrev: { [key: string]: string } = {
        january: "Jan",
        february: "Feb",
        march: "Mar",
        april: "Apr",
        may: "May",
        june: "Jun",
        july: "Jul",
        august: "Aug",
        september: "Sep",
        october: "Oct",
        november: "Nov",
        december: "Dec",
      };

      return `${monthAbbrev[monthName] || monthName} ${year}`;
    }

    return "7 days"; // Default fallback
  };

  const timePeriodName = formatTimePeriodName(filterOptions.timePeriod);

  const categoryIds = filterOptions.categoryIds || [];
  const categoryName =
    categoryIds.length === 0
      ? "All Categories"
      : categoryIds.length === 1
        ? "1 category"
        : `${categoryIds.length} categories`;

  return `${accountName} • ${timePeriodName} • ${categoryName}`;
};
