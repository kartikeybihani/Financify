-- Fix category colors: map known names to correct colors, hash-based for unknowns.
-- Run as migration or copy/paste into Supabase SQL Editor.

UPDATE public.categories
SET color = CASE TRIM(name)
  WHEN 'Groceries' THEN '#4CAF50'
  WHEN 'Food' THEN '#FF6B6B'
  WHEN 'Dining Out' THEN '#FF6B6B'
  WHEN 'Housing' THEN '#8E44AD'
  WHEN 'Rent' THEN '#8E44AD'
  WHEN 'Transportation' THEN '#45B7D1'
  WHEN 'Shopping' THEN '#4ECDC4'
  WHEN 'Entertainment' THEN '#96CEB4'
  WHEN 'Subscriptions' THEN '#9C27B0'
  WHEN 'Health & Fitness' THEN '#2E7D32'
  WHEN 'Health' THEN '#2E7D32'
  WHEN 'Bills & Utilities' THEN '#FF9800'
  WHEN 'Personal Care' THEN '#E91E63'
  WHEN 'Travel' THEN '#2196F3'
  WHEN 'Education' THEN '#795548'
  WHEN 'Savings & Investments' THEN '#27AE60'
  WHEN 'Savings' THEN '#27AE60'
  WHEN 'Income' THEN '#1B5E20'
  WHEN 'Other' THEN '#607D8B'
  WHEN 'Loans' THEN '#9C27B0'
  WHEN 'Investing' THEN '#27AE60'
  WHEN 'Phone' THEN '#9C27B0'
  WHEN 'Business' THEN '#1565C0'
  WHEN 'Booze' THEN '#E91E63'
  WHEN 'INTERNAL_TRANSFER' THEN '#78909C'
  ELSE '#' || LOWER(SUBSTRING(MD5(TRIM(name) || 'salt'), 1, 6))
END
WHERE is_active = true;
