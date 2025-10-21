// Spending Personality Analysis System
// Transforms spending data into relatable personality archetypes for Gen Z

export interface SpendingPersonality {
  archetype: string;
  badge: string;
  description: string;
  traits: string[];
  color: string;
  emoji: string;
  confidence: number;
}

export interface CategoryData {
  amount: number;
  percentage: number;
  color: string;
  hasRecurringTransactions: boolean;
}

export interface SpendingBreakdown {
  [category: string]: CategoryData;
}

// Personality archetypes based on spending patterns
const PERSONALITY_ARCHETYPES = {
  'foodie_explorer': {
    archetype: 'The Foodie Explorer',
    badge: 'Culinary Adventurer',
    description: 'You\'re always discovering new flavors and experiences',
    traits: ['Curious about new cuisines', 'Values quality over quantity', 'Loves sharing food experiences'],
    color: '#FF6B6B',
    emoji: '🍕',
    keywords: ['Food', 'Food & Dining', 'Dining Out', 'Restaurants']
  },
  'minimalist': {
    archetype: 'The Minimalist',
    badge: 'Zen Spender',
    description: 'You value experiences over things',
    traits: ['Thoughtful about purchases', 'Prefers quality over quantity', 'Finds joy in simplicity'],
    color: '#4ECDC4',
    emoji: '🧘',
    keywords: ['low_spending', 'high_savings']
  },
  'experience_collector': {
    archetype: 'The Experience Collector',
    badge: 'Life Enthusiast',
    description: 'You invest in memories and growth',
    traits: ['Values experiences over material things', 'Always learning something new', 'Creates lasting memories'],
    color: '#96CEB4',
    emoji: '🎭',
    keywords: ['Entertainment', 'Travel', 'Education', 'Health & Fitness']
  },
  'homebody': {
    archetype: 'The Homebody',
    badge: 'Nest Builder',
    description: 'You invest in your personal space and comfort',
    traits: ['Values home experiences', 'Thoughtful about living', 'Creates comfortable spaces'],
    color: '#6B73FF',
    emoji: '🏠',
    keywords: ['Housing', 'Bills & Utilities', 'Personal Care']
  },
  'social_butterfly': {
    archetype: 'The Social Butterfly',
    badge: 'Connection Creator',
    description: 'You\'re the friend who brings people together',
    traits: ['Values relationships', 'Creates memorable experiences', 'Brings joy to others'],
    color: '#FF9500',
    emoji: '🦋',
    keywords: ['Entertainment', 'Food & Dining', 'Shopping']
  },
  'future_builder': {
    archetype: 'The Future Builder',
    badge: 'Visionary Investor',
    description: 'You\'re building tomorrow, today',
    traits: ['Plans for the future', 'Makes smart investments', 'Values long-term growth'],
    color: '#32D74B',
    emoji: '🚀',
    keywords: ['Education', 'Savings & Investments', 'Health & Fitness']
  }
};

/**
 * Analyze spending patterns to determine personality archetype
 */
export function analyzeSpendingPersonality(
  categoryBreakdown: [string, CategoryData][],
  totalSpent: number
): SpendingPersonality {
  const breakdown = Object.fromEntries(categoryBreakdown);
  const totalAmount = categoryBreakdown.reduce((sum, [_, data]) => sum + data.amount, 0);
  
  // Calculate spending ratios
  const ratios = {
    food: (breakdown['Food']?.amount || 0) + (breakdown['Food & Dining']?.amount || 0) + (breakdown['Dining Out']?.amount || 0),
    entertainment: breakdown['Entertainment']?.amount || 0,
    housing: breakdown['Housing']?.amount || 0,
    education: breakdown['Education']?.amount || 0,
    savings: breakdown['Savings & Investments']?.amount || 0,
    shopping: breakdown['Shopping']?.amount || 0,
    health: breakdown['Health & Fitness']?.amount || 0,
    travel: breakdown['Travel']?.amount || 0
  };

  // Calculate percentages
  const percentages = Object.fromEntries(
    Object.entries(ratios).map(([key, amount]) => [key, (amount / totalAmount) * 100])
  );

  // Personality scoring system
  const scores = {
    foodie_explorer: percentages.food,
    experience_collector: (percentages.entertainment + percentages.travel + percentages.education + percentages.health) / 4,
    // Homebody: High housing + utilities + personal care, but LOW transportation and entertainment
    homebody: Math.max(0, 
      (percentages.housing + (breakdown['Bills & Utilities']?.amount || 0) / totalAmount * 100 + percentages.health) / 3
      - (percentages.entertainment + (breakdown['Transportation']?.amount || 0) / totalAmount * 100) / 2
    ),
    social_butterfly: (percentages.entertainment + percentages.food + percentages.shopping) / 3,
    future_builder: (percentages.education + percentages.savings + percentages.health) / 3,
    minimalist: totalAmount < 1000 ? 100 : Math.max(0, 100 - (totalAmount / 2000) * 100) // Lower spending = higher minimalist score
  };

  // Find the highest scoring personality
  const topPersonality = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b);
  const [personalityKey, score] = topPersonality;
  
  // Get personality details
  const personality = PERSONALITY_ARCHETYPES[personalityKey as keyof typeof PERSONALITY_ARCHETYPES];
  
  // Calculate confidence (how strongly this personality fits)
  const confidence = Math.min(100, Math.max(60, score));
  
  return {
    archetype: personality.archetype,
    badge: personality.badge,
    description: personality.description,
    traits: personality.traits,
    color: personality.color,
    emoji: personality.emoji,
    confidence: Math.round(confidence)
  };
}

/**
 * Generate contextual insights based on personality
 */
export function generatePersonalityInsights(
  personality: SpendingPersonality,
  categoryBreakdown: [string, CategoryData][],
  totalSpent: number
): string[] {
  const insights: string[] = [];
  
  // Add personality-specific insights
  switch (personality.archetype) {
    case 'The Foodie Explorer':
      const foodSpending = categoryBreakdown.find(([cat]) => 
        ['Food', 'Food & Dining', 'Dining Out'].includes(cat)
      )?.[1]?.amount || 0;
      insights.push(`You spent $${foodSpending.toFixed(0)} on food this month - that's some serious culinary dedication!`);
      break;
      
    case 'The Minimalist':
      insights.push(`Your thoughtful spending shows you value quality over quantity.`);
      break;
      
    case 'The Experience Collector':
      insights.push(`You're investing in experiences that will last a lifetime.`);
      break;
      
    case 'The Homebody':
      const homeSpending = categoryBreakdown.find(([cat]) => 
        ['Housing', 'Bills & Utilities', 'Personal Care'].includes(cat)
      )?.[1]?.amount || 0;
      insights.push(`You invest thoughtfully in your living space and personal comfort.`);
      break;
      
    case 'The Social Butterfly':
      insights.push(`You're the friend who makes every gathering memorable.`);
      break;
      
    case 'The Future Builder':
      insights.push(`You're building the foundation for an amazing future.`);
      break;
  }
  
  // Add spending milestone insights
  if (totalSpent > 2000) {
    insights.push(`You're managing a substantial budget like a pro!`);
  } else if (totalSpent < 500) {
    insights.push(`Your mindful spending is impressive!`);
  }
  
  return insights;
}

/**
 * Get personality color scheme for UI
 */
export function getPersonalityColors(personality: SpendingPersonality) {
  return {
    primary: personality.color,
    secondary: `${personality.color}20`, // 20% opacity
    background: `${personality.color}10`, // 10% opacity
    text: personality.color
  };
}
