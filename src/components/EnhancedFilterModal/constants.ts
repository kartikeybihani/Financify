import { TimePeriod, Category, MonthData } from '@/src/components/EnhancedFilterModal/types';

export const QUICK_TIME_PERIODS: TimePeriod[] = [
  {
    id: "all",
    label: "All",
    emoji: "∞",
    description: "All time",
  },
  {
    id: "7days",
    label: "Last Week",
    emoji: "📅",
    description: "Recent 7 days",
  },
  {
    id: "30days",
    label: "Last Month",
    emoji: "🗓️",
    description: "Past 30 days",
  },
  {
    id: "3months",
    label: "Last 3 Months",
    emoji: "📊",
    description: "Quarterly view",
  },
  {
    id: "12months",
    label: "Last 12 months",
    emoji: "📈",
    description: "Annual overview",
  },
];

const MONTHS: MonthData[] = [
  { name: "January", emoji: "❄️" },
  { name: "February", emoji: "💕" },
  { name: "March", emoji: "🌸" },
  { name: "April", emoji: "🌷" },
  { name: "May", emoji: "🌺" },
  { name: "June", emoji: "☀️" },
  { name: "July", emoji: "🏖️" },
  { name: "August", emoji: "🌻" },
  { name: "September", emoji: "🍂" },
  { name: "October", emoji: "🎃" },
  { name: "November", emoji: "🦃" },
  { name: "December", emoji: "🎄" },
];

// Generate monthly periods dynamically from current month back to 2 years ago
const generateMonthlyPeriods = (): TimePeriod[] => {
  const periods: TimePeriod[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based (0 = January, 11 = December)
  
  // Generate periods from current month back to 2 years ago
  for (let i = 0; i < 25; i++) { // 25 months covers 2 years + 1 month
    const targetDate = new Date(currentYear, currentMonth - i, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    
    periods.push({
      id: `${MONTHS[month].name.toLowerCase()}${year}`,
      label: `${MONTHS[month].name} ${year}`,
      emoji: MONTHS[month].emoji,
      description: `${MONTHS[month].name} expenses`,
      year: year,
    });
  }

  return periods;
};

export const MONTHLY_PERIODS = generateMonthlyPeriods();
export const ALL_TIME_PERIODS = [...QUICK_TIME_PERIODS, ...MONTHLY_PERIODS];

// Removed DEFAULT_CATEGORIES - now using database categories via useCategories hook
// Categories are now fetched from the database and managed centrally
