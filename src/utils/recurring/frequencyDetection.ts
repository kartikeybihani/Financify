// Utility functions for detecting frequency patterns from transaction dates
// and calculating next transaction dates

export type FrequencyType = "weekly" | "bi-weekly" | "monthly" | "quarterly" | "annually" | null;

/**
 * Detect frequency pattern from transaction dates
 * Analyzes date intervals to determine: weekly, bi-weekly, monthly, quarterly, or annually
 */
export function detectFrequency(dates: string[]): FrequencyType {
  if (!dates || dates.length < 2) {
    return null; // Need at least 2 transactions to detect pattern
  }

  // Sort dates ascending
  const sortedDates = [...dates]
    .map((d) => new Date(d))
    .sort((a, b) => a.getTime() - b.getTime())
    .filter((d) => !isNaN(d.getTime()));

  if (sortedDates.length < 2) {
    return null;
  }

  // Calculate intervals between consecutive transactions (in days)
  const intervals: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const diff = Math.round(
      (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (diff > 0) {
      intervals.push(diff);
    }
  }

  if (intervals.length === 0) {
    return null;
  }

  // Calculate average interval
  const avgInterval =
    intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

  // Calculate standard deviation to check consistency
  const variance =
    intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) /
    intervals.length;
  const stdDev = Math.sqrt(variance);

  // Tolerance for pattern matching (±20% or ±5 days, whichever is larger)
  const tolerance = Math.max(avgInterval * 0.2, 5);

  // Check if intervals are consistent (std dev within tolerance)
  const isConsistent = stdDev <= tolerance;

  // If not consistent, return null (pattern not clear)
  if (!isConsistent) {
    return null;
  }

  // Determine frequency based on average interval
  // Using ranges with tolerance
  if (avgInterval >= 350 && avgInterval <= 380) {
    // ~365 days = annually
    return "annually";
  } else if (avgInterval >= 85 && avgInterval <= 100) {
    // ~90 days = quarterly
    return "quarterly";
  } else if (avgInterval >= 27 && avgInterval <= 33) {
    // ~30 days = monthly
    return "monthly";
  } else if (avgInterval >= 12 && avgInterval <= 16) {
    // ~14 days = bi-weekly
    return "bi-weekly";
  } else if (avgInterval >= 5 && avgInterval <= 9) {
    // ~7 days = weekly
    return "weekly";
  }

  // If no clear pattern matches, return null
  return null;
}

/**
 * Calculate next transaction date based on frequency and last date
 */
export function calculateNextDate(
  lastDate: string,
  frequency: FrequencyType
): Date | null {
  if (!frequency || !lastDate) {
    return null;
  }

  const last = new Date(lastDate);
  if (isNaN(last.getTime())) {
    return null;
  }

  const next = new Date(last);

  switch (frequency.toLowerCase()) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "bi-weekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
    case "annually":
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      return null;
  }

  return next;
}

/**
 * Calculate next transaction date from transaction dates array
 * Auto-detects frequency and calculates next date
 */
export function calculateNextDateFromDates(dates: string[]): {
  nextDate: Date | null;
  frequency: FrequencyType;
} {
  const frequency = detectFrequency(dates);
  
  if (!frequency || dates.length === 0) {
    return { nextDate: null, frequency: null };
  }

  // Use most recent date
  const sortedDates = [...dates]
    .map((d) => new Date(d))
    .sort((a, b) => b.getTime() - a.getTime());

  const lastDate = sortedDates[0];
  if (isNaN(lastDate.getTime())) {
    return { nextDate: null, frequency: null };
  }

  const nextDate = calculateNextDate(lastDate.toISOString().split("T")[0], frequency);

  return { nextDate, frequency };
}

// Default export for Expo Router compatibility
export default {
  detectFrequency,
  calculateNextDate,
  calculateNextDateFromDates,
};
