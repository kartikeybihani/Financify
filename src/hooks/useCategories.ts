// React hook for managing categories from database
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/src/lib/supabase/supabase";

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

export function useCategories(userId?: string) {
  // Initialize with empty array - will be populated by fetchCategories
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // console.log('useCategories - Fetching categories for userId:', userId);

      // Require userId - all categories are now user-specific
      if (!userId) {
        // Enhanced warning with call stack for debugging
        // This helps identify which component is calling useCategories without userId
        if (__DEV__) {
          console.warn('useCategories - userId required (this is normal during initial render if userId loads asynchronously)');
          // Uncomment the line below to see the full call stack when debugging:
          console.trace('useCategories called without userId from:');
        } else {
          // In production, still log but without trace to avoid performance issues
          console.warn('useCategories - userId required');
        }
        setCategories([]);
        setLoading(false);
        return;
      }

      // Build query - only get user-specific categories
      const query = supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .eq('user_id', userId)
        .order('rank', { ascending: true });

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('useCategories - Query error:', fetchError);
        console.error('useCategories - Error details:', JSON.stringify(fetchError, null, 2));
        throw fetchError;
      }

      // console.log('useCategories - Fetched categories:', data?.length || 0, 'categories');
      // console.log('useCategories - Sample categories:', data?.slice(0, 3));
      
      setCategories(data || []);
    } catch (err) {
      console.error('useCategories - Exception fetching categories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Helper functions
  const getCategoryByName = useCallback((name: string): Category | null => {
    return categories.find(cat => 
      cat.name.toLowerCase() === name.toLowerCase() ||
      cat.slug === name.toLowerCase().replace(/\s+/g, '-')
    ) || null;
  }, [categories]);

  const getCategoryIcon = useCallback((categoryName: string): string => {
    const category = getCategoryByName(categoryName);
    if (category?.icon) {
      return category.icon;
    }

    // Fallback emoji mapping
    const iconMap: { [key: string]: string } = {
      'Groceries': '🛒',
      'Food': '🍽️',
      'Food & Dining': '🍽️',
      'Dining Out': '🍽️',
      'Housing': '🏠',
      'Transportation': '🚗',
      'Shopping': '🛍️',
      'Entertainment': '🎬',
      'Subscriptions': '📱',
      'Health & Fitness': '💪',
      'Health': '💪',
      'Bills & Utilities': '⚡',
      'Personal Care': '💄',
      'Travel': '✈️',
      'Education': '📚',
      'Savings & Investments': '💎',
      'Savings': '💎',
      'Income': '💰',
      'Other': '📦',
    };
    
    return iconMap[categoryName] || '📦';
  }, [getCategoryByName]);

  const getCategoryColor = useCallback((categoryName: string): string => {
    const category = getCategoryByName(categoryName);
    if (category?.color) {
      return category.color;
    }

    // Fallback color mapping
    const colorMap: { [key: string]: string } = {
      'Groceries': '#4CAF50',
      'Food': '#FF6B6B',
      'Dining Out': '#FF6B6B',
      'Housing': '#8E44AD',
      'Transportation': '#45B7D1',
      'Shopping': '#4ECDC4',
      'Entertainment': '#96CEB4',
      'Subscriptions': '#9C27B0',
      'Health & Fitness': '#2E7D32',
      'Bills & Utilities': '#FF9800',
      'Personal Care': '#E91E63',
      'Travel': '#2196F3',
      'Education': '#795548',
      'Savings & Investments': '#27AE60',
      'Income': '#1B5E20',
      'Other': '#607D8B',
    };
    
    return colorMap[categoryName] || '#607D8B';
  }, [getCategoryByName]);

  const formatCategoryName = useCallback((category: string): string => {
    if (!category) return 'Other';
    
    return category
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }, []);

  const refreshCategories = useCallback(() => {
    fetchCategories();
  }, [fetchCategories]);

  // console.log('useCategories - returning:', { categories, loading, error });

  return {
    categories,
    loading,
    error,
    getCategoryByName,
    getCategoryIcon,
    getCategoryColor,
    formatCategoryName,
    refreshCategories,
  };
}

// Prevent Expo Router from treating this as a route by providing a no-op default export
export default function UseCategoriesPlaceholder() { return null; }

/**
 * Fallback categories if database is unavailable
 */
function getDefaultCategories(): Category[] {
  return [
    { id: '1', user_id: null, name: 'Groceries', slug: 'groceries', icon: '🛒', color: '#4CAF50', rank: 1, is_active: true },
    { id: '2', user_id: null, name: 'Food & Dining', slug: 'food-dining', icon: '🍽️', color: '#FF6B6B', rank: 2, is_active: true },
    { id: '3', user_id: null, name: 'Housing', slug: 'housing', icon: '🏠', color: '#8E44AD', rank: 3, is_active: true },
    { id: '4', user_id: null, name: 'Transportation', slug: 'transportation', icon: '🚗', color: '#45B7D1', rank: 4, is_active: true },
    { id: '5', user_id: null, name: 'Shopping', slug: 'shopping', icon: '🛍️', color: '#4ECDC4', rank: 5, is_active: true },
    { id: '6', user_id: null, name: 'Entertainment', slug: 'entertainment', icon: '🎬', color: '#96CEB4', rank: 6, is_active: true },
    { id: '7', user_id: null, name: 'Subscriptions', slug: 'subscriptions', icon: '📱', color: '#9C27B0', rank: 7, is_active: true },
    { id: '8', user_id: null, name: 'Health', slug: 'health', icon: '💪', color: '#2E7D32', rank: 8, is_active: true },
    { id: '9', user_id: null, name: 'Travel', slug: 'travel', icon: '✈️', color: '#2196F3', rank: 9, is_active: true },
    { id: '10', user_id: null, name: 'Personal Care', slug: 'personal-care', icon: '💄', color: '#E91E63', rank: 10, is_active: true },
    { id: '11', user_id: null, name: 'Income', slug: 'income', icon: '💰', color: '#1B5E20', rank: 11, is_active: true },
    { id: '12', user_id: null, name: 'Savings', slug: 'savings', icon: '💎', color: '#27AE60', rank: 12, is_active: true },
    { id: '13', user_id: null, name: 'Other', slug: 'other', icon: '📦', color: '#607D8B', rank: 13, is_active: true },
  ];
}
