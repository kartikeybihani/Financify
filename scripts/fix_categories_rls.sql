-- Fix Categories RLS Policies
-- Categories should allow viewing user's own categories AND default categories (user_id IS NULL)

-- Check current policies
SELECT 
  '=== CURRENT CATEGORIES POLICIES ===' as section,
  policyname,
  cmd as command,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'categories'
ORDER BY policyname;

-- Drop existing policy if it's too restrictive
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;

-- Create comprehensive policies for categories
-- SELECT: Users can view their own categories AND default categories (user_id IS NULL)
CREATE POLICY "Users can view their own and default categories"
  ON public.categories
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- INSERT: Users can only create their own categories
CREATE POLICY "Users can insert their own categories"
  ON public.categories
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can only update their own categories (not default ones)
CREATE POLICY "Users can update their own categories"
  ON public.categories
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can only delete their own categories (not default ones)
CREATE POLICY "Users can delete their own categories"
  ON public.categories
  FOR DELETE
  USING (user_id = auth.uid());

-- Verify
SELECT 
  '=== UPDATED CATEGORIES POLICIES ===' as section,
  tablename,
  COUNT(*) as policy_count,
  array_agg(policyname ORDER BY policyname) as policy_names
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'categories'
GROUP BY tablename;
