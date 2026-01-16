-- Additional RLS Policies for category_rules, category_groupings, and category_groupings_view
-- Run this AFTER running rls_policies.sql

-- ============================================
-- Enable RLS on category_rules and category_groupings
-- ============================================
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_groupings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Drop existing policies if they exist (to avoid conflicts)
-- ============================================
DROP POLICY IF EXISTS "Users can view their own category rules" ON public.category_rules;
DROP POLICY IF EXISTS "Users can insert their own category rules" ON public.category_rules;
DROP POLICY IF EXISTS "Users can update their own category rules" ON public.category_rules;
DROP POLICY IF EXISTS "Users can delete their own category rules" ON public.category_rules;

DROP POLICY IF EXISTS "Users can view their own category groupings" ON public.category_groupings;
DROP POLICY IF EXISTS "Users can insert their own category groupings" ON public.category_groupings;
DROP POLICY IF EXISTS "Users can update their own category groupings" ON public.category_groupings;
DROP POLICY IF EXISTS "Users can delete their own category groupings" ON public.category_groupings;

-- ============================================
-- Category Rules: Users can only access their own rules
-- ============================================
CREATE POLICY "Users can view their own category rules"
  ON public.category_rules
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own category rules"
  ON public.category_rules
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own category rules"
  ON public.category_rules
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own category rules"
  ON public.category_rules
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- Category Groupings: Users can only access their own groupings
-- ============================================
CREATE POLICY "Users can view their own category groupings"
  ON public.category_groupings
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own category groupings"
  ON public.category_groupings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own category groupings"
  ON public.category_groupings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own category groupings"
  ON public.category_groupings
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- Category Groupings View: Handle RLS on view
-- ============================================
-- First, check if category_groupings_view exists and what type it is
DO $$
BEGIN
  -- Check if it's a regular view
  IF EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'category_groupings_view'
  ) THEN
    -- Enable RLS on the view (PostgreSQL 9.5+)
    ALTER VIEW public.category_groupings_view SET (security_invoker = true);
    
    -- Note: Views inherit RLS from underlying tables, but we can add policies
    -- However, views don't support RLS policies directly in older PostgreSQL versions
    -- The view will automatically respect RLS from category_groupings table
    
    RAISE NOTICE 'category_groupings_view is a view - RLS will be enforced via underlying category_groupings table';
  END IF;
  
  -- Check if it's a materialized view
  IF EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' 
    AND matviewname = 'category_groupings_view'
  ) THEN
    ALTER MATERIALIZED VIEW public.category_groupings_view ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Users can view their own category groupings view"
      ON public.category_groupings_view
      FOR SELECT
      USING (user_id = auth.uid());
    
    RAISE NOTICE 'category_groupings_view is a materialized view - RLS enabled and policy created';
  END IF;
  
  -- If neither exists, that's okay - just log it
  IF NOT EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'category_groupings_view'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' 
    AND matviewname = 'category_groupings_view'
  ) THEN
    RAISE NOTICE 'category_groupings_view does not exist - skipping';
  END IF;
END $$;

-- ============================================
-- Verify RLS is enabled
-- ============================================
SELECT 
  '=== RLS STATUS ON ADDITIONAL TABLES ===' as section,
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('category_rules', 'category_groupings')
ORDER BY tablename;

-- ============================================
-- Verify policies were created
-- ============================================
SELECT 
  '=== POLICIES ON ADDITIONAL TABLES ===' as section,
  tablename,
  policyname,
  cmd as command
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('category_rules', 'category_groupings')
ORDER BY tablename, policyname;

-- ============================================
-- Check if category_groupings_view exists and its type
-- ============================================
SELECT 
  '=== category_groupings_view STATUS ===' as section,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_views 
      WHERE schemaname = 'public' 
      AND viewname = 'category_groupings_view'
    ) THEN 'VIEW (RLS inherited from category_groupings table)'
    WHEN EXISTS (
      SELECT 1 FROM pg_matviews 
      WHERE schemaname = 'public' 
      AND matviewname = 'category_groupings_view'
    ) THEN 'MATERIALIZED VIEW (RLS enabled)'
    ELSE 'DOES NOT EXIST'
  END as view_status;
