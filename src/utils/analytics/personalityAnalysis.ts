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
    traits: ['Curious about new cuisines', 'Values quality over quantity'],
    color: '#FF9F1C',
    emoji: '🍕',
    keywords: ['Food', 'Food & Dining', 'Dining Out', 'Restaurants']
  },
  'minimalist': {
    archetype: 'The Minimalist',
    badge: 'Zen Spender',
    description: 'You value experiences over things',
    traits: ['Thoughtful about purchases', 'Finds joy in simplicity'],
    color: '#4ECDC4',
    emoji: '🧘',
    keywords: ['low_spending', 'high_savings']
  },
  'experience_collector': {
    archetype: 'The Experience Collector',
    badge: 'Life Enthusiast',
    description: 'You invest in memories and growth',
    traits: ['Values experiences over material things', 'Creates lasting memories'],
    color: '#96CEB4',
    emoji: '🎭',
    keywords: ['Entertainment', 'Travel', 'Education', 'Health & Fitness']
  },
  'homebody': {
    archetype: 'The Homebody',
    badge: 'Nest Builder',
    description: 'You invest in your personal space and comfort',
    traits: ['Values home experiences', 'Creates comfortable spaces'],
    color: '#6B73FF',
    emoji: '🏠',
    keywords: ['Housing', 'Bills & Utilities', 'Personal Care']
  },
  'social_butterfly': {
    archetype: 'The Social Butterfly',
    badge: 'Connection Creator',
    description: 'You\'re the friend who brings people together',
    traits: ['Values relationships', 'Brings joy to others'],
    color: '#FF9500',
    emoji: '🦋',
    keywords: ['Entertainment', 'Food & Dining', 'Shopping']
  },
  'future_builder': {
    archetype: 'The Future Builder',
    badge: 'Visionary Investor',
    description: 'You\'re building tomorrow, today',
    traits: ['Plans for the future', 'Values long-term growth'],
    color: '#32D74B',
    emoji: '🚀',
    keywords: ['Education', 'Savings & Investments', 'Health & Fitness']
  },
  'wanderlust_warrior': {
    archetype: 'The Wanderlust Warrior',
    badge: 'Globe Trotter',
    description: 'You live for the journey, not the destination',
    traits: ['Always planning the next adventure', 'Finds home in new places'],
    color: '#00D4FF',
    emoji: '✈️',
    keywords: ['Travel']
  },
  'mystery_spender': {
    archetype: 'The Mystery Spender',
    badge: 'Enigma',
    description: 'Your spending is as mysterious as your vibe',
    traits: ['Keeps people guessing', 'Lives life on your own terms'],
    color: '#9B59B6',
    emoji: '🔮',
    keywords: ['Other']
  },
  'tech_enthusiast': {
    archetype: 'The Tech Enthusiast',
    badge: 'Digital Native',
    description: 'You\'re always ahead of the curve with the latest tech',
    traits: ['Early adopter of new tech', 'Future is now'],
    color: '#007AFF',
    emoji: '💻',
    keywords: ['Shopping', 'Subscriptions']
  },
  'wellness_warrior': {
    archetype: 'The Wellness Warrior',
    badge: 'Self-Care Champion',
    description: 'You invest in yourself because you\'re worth it',
    traits: ['Prioritizes mental and physical health', 'Self-care isn\'t selfish'],
    color: '#FF6B9D',
    emoji: '💪',
    keywords: ['Health & Fitness', 'Health', 'Personal Care']
  },
  'fashionista': {
    archetype: 'The Fashionista',
    badge: 'Style Icon',
    description: 'You don\'t follow trends, you set them',
    traits: ['Fashion is self-expression', 'Your closet tells your story'],
    color: '#FF1493',
    emoji: '👗',
    keywords: ['Shopping']
  },
  'splurger': {
    archetype: 'The Splurger',
    badge: 'Treat Yourself',
    description: 'Life\'s too short to not enjoy it',
    traits: ['Treats themselves because they deserve it'],
    color: '#FF8A65', // Calmer coral/orange instead of bright red
    emoji: '💸',
    keywords: ['high_spending']
  },
  'saver': {
    archetype: 'The Saver',
    badge: 'Financial Freedom Seeker',
    description: 'You\'re building wealth, one dollar at a time',
    traits: ['Plans for financial independence', 'Smart with money'],
    color: '#34C759',
    emoji: '💰',
    keywords: ['Savings & Investments', 'Savings']
  },
  'streamer': {
    archetype: 'The Streamer',
    badge: 'Content Binger',
    description: 'You\'ve got subscriptions for everything and you\'re not sorry',
    traits: ['Has all the streaming services', 'Content is king'],
    color: '#AF52DE',
    emoji: '📺',
    keywords: ['Subscriptions', 'Entertainment']
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
    health: (breakdown['Health & Fitness']?.amount || 0) + (breakdown['Health']?.amount || 0),
    travel: breakdown['Travel']?.amount || 0,
    other: breakdown['Other']?.amount || 0,
    subscriptions: breakdown['Subscriptions']?.amount || 0,
    personalCare: breakdown['Personal Care']?.amount || 0,
    transportation: breakdown['Transportation']?.amount || 0,
    utilities: breakdown['Bills & Utilities']?.amount || 0
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
      (percentages.housing + percentages.utilities + percentages.personalCare) / 3
      - (percentages.entertainment + percentages.transportation) / 2
    ),
    social_butterfly: (percentages.entertainment + percentages.food + percentages.shopping) / 3,
    future_builder: (percentages.education + percentages.savings + percentages.health) / 3,
    minimalist: totalAmount < 1000 ? 100 : Math.max(0, 100 - (totalAmount / 2000) * 100), // Lower spending = higher minimalist score
    // Wanderlust Warrior: High travel spending (threshold: >15% of total)
    wanderlust_warrior: percentages.travel > 15 ? percentages.travel * 1.5 : percentages.travel,
    // Mystery Spender: High "Other" category (>20% of total)
    mystery_spender: percentages.other > 20 ? percentages.other * 1.3 : percentages.other * 0.5,
    // Tech Enthusiast: High shopping + subscriptions (especially if shopping is electronics-focused)
    tech_enthusiast: (percentages.shopping * 0.6 + percentages.subscriptions * 0.4),
    // Wellness Warrior: Very high health & fitness + personal care (>20% combined)
    wellness_warrior: (percentages.health + percentages.personalCare) > 20 
      ? (percentages.health + percentages.personalCare) * 1.2 
      : (percentages.health + percentages.personalCare) * 0.7,
    // Fashionista: High shopping percentage (>25% of total)
    fashionista: percentages.shopping > 25 ? percentages.shopping * 1.2 : percentages.shopping * 0.6,
    // Splurger: Very high total spending (>$3000) with diverse spending
    splurger: totalAmount > 3000 
      ? Math.min(100, 60 + (totalAmount - 3000) / 100) 
      : Math.max(0, (totalAmount / 3000) * 50),
    // Saver: High savings percentage (>15% of total)
    saver: percentages.savings > 15 
      ? percentages.savings * 1.5 
      : percentages.savings * 0.8,
    // Streamer: High subscriptions + entertainment (>20% combined)
    streamer: (percentages.subscriptions + percentages.entertainment) > 20
      ? (percentages.subscriptions + percentages.entertainment) * 1.1
      : (percentages.subscriptions + percentages.entertainment) * 0.6
  };

  // Find the highest scoring personality
  const topPersonality = Object.entries(scores).reduce((a, b) => scores[a[0] as keyof typeof scores] > scores[b[0] as keyof typeof scores] ? a : b);
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
      
    case 'The Wanderlust Warrior':
      const travelSpending = categoryBreakdown.find(([cat]) => cat === 'Travel')?.[1]?.amount || 0;
      insights.push(`You spent $${travelSpending.toFixed(0)} on travel - the world is your playground!`);
      break;
      
    case 'The Mystery Spender':
      const otherSpending = categoryBreakdown.find(([cat]) => cat === 'Other')?.[1]?.amount || 0;
      insights.push(`Your spending is as intriguing as you are - $${otherSpending.toFixed(0)} in mysterious categories!`);
      break;
      
    case 'The Tech Enthusiast':
      const techSpending = (categoryBreakdown.find(([cat]) => cat === 'Shopping')?.[1]?.amount || 0) + 
                           (categoryBreakdown.find(([cat]) => cat === 'Subscriptions')?.[1]?.amount || 0);
      insights.push(`You're living in the future with $${techSpending.toFixed(0)} in tech and subscriptions!`);
      break;
      
    case 'The Wellness Warrior':
      const wellnessSpending = (categoryBreakdown.find(([cat]) => ['Health & Fitness', 'Health'].includes(cat))?.[1]?.amount || 0) +
                              (categoryBreakdown.find(([cat]) => cat === 'Personal Care')?.[1]?.amount || 0);
      insights.push(`You invested $${wellnessSpending.toFixed(0)} in yourself - self-care goals!`);
      break;
      
    case 'The Fashionista':
      const fashionSpending = categoryBreakdown.find(([cat]) => cat === 'Shopping')?.[1]?.amount || 0;
      insights.push(`You spent $${fashionSpending.toFixed(0)} on style - slaying every day!`);
      break;
      
    case 'The Splurger':
      insights.push(`You spent $${totalSpent.toFixed(0)} this month - living your best life!`);
      break;
      
    case 'The Saver':
      const savingsAmount = categoryBreakdown.find(([cat]) => ['Savings & Investments', 'Savings'].includes(cat))?.[1]?.amount || 0;
      insights.push(`You saved $${savingsAmount.toFixed(0)} - financial freedom is the goal!`);
      break;
      
    case 'The Streamer':
      const streamSpending = (categoryBreakdown.find(([cat]) => cat === 'Subscriptions')?.[1]?.amount || 0) +
                            (categoryBreakdown.find(([cat]) => cat === 'Entertainment')?.[1]?.amount || 0);
      insights.push(`You spent $${streamSpending.toFixed(0)} on content - never a dull moment!`);
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
