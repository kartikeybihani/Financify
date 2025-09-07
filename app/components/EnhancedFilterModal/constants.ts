import { TimePeriod, Category, MonthData } from './types';

export const QUICK_TIME_PERIODS: TimePeriod[] = [
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

// Generate monthly periods from Sept 2023 to Sept 2025
const generateMonthlyPeriods = (): TimePeriod[] => {
  const periods: TimePeriod[] = [];

  // 2023 - Sept to Dec
  for (let month = 8; month < 12; month++) {
    periods.push({
      id: `${MONTHS[month].name.toLowerCase()}2023`,
      label: `${MONTHS[month].name} 2023`,
      emoji: MONTHS[month].emoji,
      description: `${MONTHS[month].name} expenses`,
      year: 2023,
    });
  }

  // 2024 - Full year
  for (let month = 0; month < 12; month++) {
    periods.push({
      id: `${MONTHS[month].name.toLowerCase()}2024`,
      label: `${MONTHS[month].name} 2024`,
      emoji: MONTHS[month].emoji,
      description: `${MONTHS[month].name} expenses`,
      year: 2024,
    });
  }

  // 2025 - Jan to Sept
  for (let month = 0; month < 9; month++) {
    periods.push({
      id: `${MONTHS[month].name.toLowerCase()}2025`,
      label: `${MONTHS[month].name} 2025`,
      emoji: MONTHS[month].emoji,
      description: `${MONTHS[month].name} expenses`,
      year: 2025,
    });
  }

  return periods;
};

export const MONTHLY_PERIODS = generateMonthlyPeriods();
export const ALL_TIME_PERIODS = [...QUICK_TIME_PERIODS, ...MONTHLY_PERIODS];

// Default categories if none provided
export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "FOOD_AND_DRINK",
    name: "Food & Drink",
    icon: "restaurant",
    color: "#FF6B6B",
  },
  {
    id: "GENERAL_MERCHANDISE",
    name: "Shopping",
    icon: "storefront",
    color: "#751b10",
  },
  {
    id: "TRANSPORTATION",
    name: "Transportation",
    icon: "car",
    color: "#45B7D1",
  },
  {
    id: "ENTERTAINMENT",
    name: "Entertainment",
    icon: "game-controller",
    color: "#88948e",
  },
  { id: "TRAVEL", name: "Travel", icon: "airplane", color: "#4A90E2" },
  {
    id: "PERSONAL_CARE",
    name: "Personal Care",
    icon: "fitness",
    color: "#d47777",
  },
  { id: "HOME_IMPROVEMENT", name: "Home", icon: "construct", color: "#8E44AD" },
  { id: "LOAN_PAYMENTS", name: "Payments", icon: "card", color: "#041747" },
  {
    id: "GENERAL_SERVICES",
    name: "Services",
    icon: "briefcase",
    color: "#9B786F",
  },
  { id: "INCOME", name: "Income", icon: "trending-up", color: "#27AE60" },
  { id: "Other", name: "Other", icon: "apps", color: "#4A90E2" },
];
