// Centralized category service that uses the database categories table
import { createClient } from '@supabase/supabase-js';

// Types
export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  icon: string;
  color: string;
  rank: number;
  is_active: boolean;
}

export interface SimplifiedCategory {
  top: string;
  sub: string;
}

// Cache for categories to avoid repeated DB calls
let categoriesCache: Category[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Initialize Supabase client (you'll need to adjust this based on your setup)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetch categories from database with caching
 * Returns user-specific categories only (userId required)
 */
export async function getCategories(userId: string): Promise<Category[]> {
  if (!userId) {
    console.warn('getCategories - userId is required');
    return [];
  }

  const now = Date.now();
  
  // Return cached categories if still valid
  if (categoriesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return categoriesCache;
  }

  try {
    const query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .eq('user_id', userId)
      .order('rank', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching categories:', error);
      return [];
    }

    // Cache the results
    categoriesCache = data || [];
    cacheTimestamp = now;

    return categoriesCache;
  } catch (error) {
    console.error('Category service error:', error);
    return [];
  }
}

/**
 * Map Plaid category to our database categories
 * This replaces the old hardcoded mapping logic
 */
export async function mapPlaidToCategory(plaidCategory: string | null | undefined, userId: string): Promise<string> {
  if (!plaidCategory || !userId) {
    return 'Other';
  }

  const categories = await getCategories(userId);
  
  // Create mapping logic based on Plaid category patterns
  const upperCategory = plaidCategory.toUpperCase();
  
  // Food-related mappings
  if (upperCategory.includes('FOOD') || upperCategory.includes('RESTAURANT') || upperCategory.includes('COFFEE')) {
    if (upperCategory.includes('GROCERY') || upperCategory.includes('SUPERMARKET')) {
      return findCategoryByName(categories, 'Groceries') || 'Groceries';
    }
    return findCategoryByName(categories, 'Food') || findCategoryByName(categories, 'Dining Out') || 'Food';
  }
  
  // Grocery specific
  if (upperCategory.includes('GROCERY') || upperCategory.includes('SUPERMARKET')) {
    return findCategoryByName(categories, 'Groceries') || 'Groceries';
  }
  
  // Transportation
  if (upperCategory.includes('TRANSPORT') || upperCategory.includes('GAS') || upperCategory.includes('UBER') || upperCategory.includes('LYFT')) {
    return findCategoryByName(categories, 'Transportation') || 'Transportation';
  }
  
  // Shopping
  if (upperCategory.includes('SHOPPING') || upperCategory.includes('MERCHANDISE') || upperCategory.includes('AMAZON')) {
    return findCategoryByName(categories, 'Shopping') || 'Shopping';
  }
  
  // Entertainment
  if (upperCategory.includes('ENTERTAINMENT') || upperCategory.includes('MOVIE') || upperCategory.includes('GAME')) {
    return findCategoryByName(categories, 'Entertainment') || 'Entertainment';
  }
  
  // Travel
  if (upperCategory.includes('TRAVEL') || upperCategory.includes('FLIGHT') || upperCategory.includes('HOTEL')) {
    return findCategoryByName(categories, 'Travel') || 'Travel';
  }
  
  // Income
  if (upperCategory.includes('INCOME') || upperCategory.includes('WAGE') || upperCategory.includes('SALARY')) {
    return findCategoryByName(categories, 'Income') || 'Income';
  }
  
  // Housing
  if (upperCategory.includes('RENT') || upperCategory.includes('MORTGAGE') || upperCategory.includes('UTILITIES')) {
    return findCategoryByName(categories, 'Housing') || 'Housing';
  }
  
  // Health & Fitness
  if (upperCategory.includes('HEALTH') || upperCategory.includes('MEDICAL') || upperCategory.includes('PHARMACY') || upperCategory.includes('FITNESS')) {
    return findCategoryByName(categories, 'Health & Fitness') || 'Health & Fitness';
  }
  
  // Personal Care
  if (upperCategory.includes('PERSONAL_CARE') || upperCategory.includes('BEAUTY') || upperCategory.includes('HAIR')) {
    return findCategoryByName(categories, 'Personal Care') || 'Personal Care';
  }
  
  // Bills & Utilities
  if (upperCategory.includes('UTILITIES') || upperCategory.includes('PHONE') || upperCategory.includes('INTERNET')) {
    return findCategoryByName(categories, 'Bills & Utilities') || 'Bills & Utilities';
  }
  
  // Subscriptions
  if (upperCategory.includes('SUBSCRIPTION') || upperCategory.includes('STREAMING')) {
    return findCategoryByName(categories, 'Subscriptions') || 'Subscriptions';
  }
  
  // Education
  if (upperCategory.includes('EDUCATION') || upperCategory.includes('STUDENT') || upperCategory.includes('SCHOOL')) {
    return findCategoryByName(categories, 'Education') || 'Education';
  }
  
  // Savings & Investments
  if (upperCategory.includes('INVESTMENT') || upperCategory.includes('SAVINGS') || upperCategory.includes('TRANSFER')) {
    return findCategoryByName(categories, 'Savings & Investments') || 'Savings & Investments';
  }
  
  // Default fallback
  return findCategoryByName(categories, 'Other') || 'Other';
}

/**
 * Helper function to find category by name
 */
function findCategoryByName(categories: Category[], name: string): string | null {
  const category = categories.find(cat => 
    cat.name.toLowerCase() === name.toLowerCase() ||
    cat.slug === name.toLowerCase().replace(/\s+/g, '-')
  );
  return category?.name || null;
}

/**
 * Get category by name for UI components
 */
export async function getCategoryByName(name: string, userId: string): Promise<Category | null> {
  if (!userId) {
    return null;
  }
  const categories = await getCategories(userId);
  return categories.find(cat => 
    cat.name.toLowerCase() === name.toLowerCase() ||
    cat.slug === name.toLowerCase().replace(/\s+/g, '-')
  ) || null;
}

/**
 * Format category name for display (removes underscores, capitalizes)
 */
export function formatCategoryName(category: string): string {
  if (!category) return 'Other';
  
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Get category icon mapping
 */
export function getCategoryIcon(categoryName: string): string {
  const iconMap: { [key: string]: string } = {
    'Groceries': 'basket',
    'Food': 'restaurant',
    'Dining Out': 'restaurant',
    'Housing': 'home',
    'Transportation': 'car',
    'Shopping': 'storefront',
    'Entertainment': 'game-controller',
    'Subscriptions': 'play-circle',
    'Health & Fitness': 'fitness',
    'Bills & Utilities': 'flash',
    'Personal Care': 'cut',
    'Travel': 'airplane',
    'Education': 'school',
    'Savings & Investments': 'trending-up',
    'Income': 'cash',
    'Other': 'apps',
  };
  
  return iconMap[categoryName] || 'apps';
}

/**
 * Clear categories cache (useful when categories are updated)
 */
export function clearCategoriesCache(): void {
  categoriesCache = null;
  cacheTimestamp = 0;
}

/**
 * Fallback categories if database is unavailable
 */
function getDefaultCategories(): Category[] {
  return [
    { id: '1', user_id: null, name: 'Groceries', slug: 'groceries', icon: 'basket', color: '#4CAF50', rank: 1, is_active: true },
    { id: '2', user_id: null, name: 'Food', slug: 'food', icon: 'restaurant', color: '#FF6B6B', rank: 2, is_active: true },
    { id: '3', user_id: null, name: 'Housing', slug: 'housing', icon: 'home', color: '#8E44AD', rank: 3, is_active: true },
    { id: '4', user_id: null, name: 'Transportation', slug: 'transportation', icon: 'car', color: '#45B7D1', rank: 4, is_active: true },
    { id: '5', user_id: null, name: 'Shopping', slug: 'shopping', icon: 'storefront', color: '#4ECDC4', rank: 5, is_active: true },
    { id: '6', user_id: null, name: 'Entertainment', slug: 'entertainment', icon: 'game-controller', color: '#96CEB4', rank: 6, is_active: true },
    { id: '7', user_id: null, name: 'Other', slug: 'other', icon: 'apps', color: '#607D8B', rank: 15, is_active: true },
  ];
}
