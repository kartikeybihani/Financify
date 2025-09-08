// Goal category mappings and utilities

export type GoalCategory = 
  | 'emergency_fund'
  | 'vacation'
  | 'car'
  | 'house_down_payment'
  | 'education'
  | 'retirement'
  | 'wedding'
  | 'debt_payoff'
  | 'investment'
  | 'other';

export const GOAL_CATEGORIES: Record<GoalCategory, { label: string; icon: string; color: string; emoji: string; backgroundColor: string }> = {
  emergency_fund: {
    label: 'Emergency Fund',
    icon: 'shield-checkmark',
    color: '#FF3B30',
    emoji: '🛡️',
    backgroundColor: '#ffebee'
  },
  vacation: {
    label: 'Vacation',
    icon: 'airplane',
    color: '#007AFF',
    emoji: '✈️',
    backgroundColor: '#e1f5fe'
  },
  car: {
    label: 'Car',
    icon: 'car-sport',
    color: '#34C759',
    emoji: '🚗',
    backgroundColor: '#e8f5e8'
  },
  house_down_payment: {
    label: 'House',
    icon: 'home',
    color: '#5856D6',
    emoji: '🏠',
    backgroundColor: '#f3e5f5'
  },
  education: {
    label: 'Education',
    icon: 'school',
    color: '#AF52DE',
    emoji: '🎓',
    backgroundColor: '#f3e5f5'
  },
  retirement: {
    label: 'Retirement',
    icon: 'time',
    color: '#FF9500',
    emoji: '🏖️',
    backgroundColor: '#fff3e0'
  },
  wedding: {
    label: 'Wedding',
    icon: 'heart',
    color: '#FF2D92',
    emoji: '💒',
    backgroundColor: '#fce4ec'
  },
  debt_payoff: {
    label: 'Debt Payoff',
    icon: 'card',
    color: '#8E8E93',
    emoji: '💳',
    backgroundColor: '#f5f5f5'
  },
  investment: {
    label: 'Investment',
    icon: 'trending-up',
    color: '#32D74B',
    emoji: '📈',
    backgroundColor: '#e8f5e8'
  },
  other: {
    label: 'Other',
    icon: 'ellipsis-horizontal-circle',
    color: '#48CAE4',
    emoji: '🎯',
    backgroundColor: '#e0f7fa'
  }
};

export const getCategoryDisplayName = (category: GoalCategory): string => {
  return GOAL_CATEGORIES[category]?.label || 'Other';
};

export const getCategoryIcon = (category: GoalCategory): string => {
  return GOAL_CATEGORIES[category]?.icon || 'ellipsis-horizontal-circle';
};

export const getCategoryColor = (category: GoalCategory): string => {
  return GOAL_CATEGORIES[category]?.color || '#48CAE4';
};

export const getCategoryOptions = (): Array<{ value: GoalCategory; label: string; icon: string; color: string; emoji: string; backgroundColor: string }> => {
  return Object.entries(GOAL_CATEGORIES).map(([value, config]) => ({
    value: value as GoalCategory,
    label: config.label,
    icon: config.icon,
    color: config.color,
    emoji: config.emoji,
    backgroundColor: config.backgroundColor
  }));
};

// Helper function to calculate progress percentage
export const calculateProgressPercentage = (currentAmount: number, targetAmount: number): number => {
  if (targetAmount <= 0) return 0;
  return Math.min(100, Math.round((currentAmount / targetAmount) * 100));
};

// Helper function to format numbers in K/M format
export const formatCurrency = (amount: number): string => {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}K`;
  } else {
    return amount.toString();
  }
};

// Helper function to format goal progress text
export const formatGoalProgress = (currentAmount: number, targetAmount: number): string => {
  return `$${formatCurrency(currentAmount)} of $${formatCurrency(targetAmount)}`;
};
