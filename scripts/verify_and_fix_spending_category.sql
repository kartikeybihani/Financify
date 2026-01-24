-- Quick verification and fix script for spending category changes
-- Run this in your Supabase SQL editor

-- ============================================================================
-- STEP 1: Verify if migration was applied
-- ============================================================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'get_summary_min_composite'
      AND prosrc LIKE '%spend_by_category_current_month%'
    ) 
    THEN '✅ Migration APPLIED - Function has new fields'
    ELSE '❌ Migration NOT APPLIED - Need to run migration'
  END as migration_status;

-- ============================================================================
-- STEP 2: Test the function to see if it returns new fields
-- ============================================================================
-- Replace 'YOUR_USER_ID' with an actual user_id from your database
-- Uncomment and run this to test:
/*
SELECT 
  jsonb_pretty(
    get_summary_min_composite(
      'YOUR_USER_ID'::uuid,  -- Replace with actual user_id
      5,
      NULL,
      NULL
    )
  ) -> 'spend_by_category_current_month' as current_month_spending;
*/

-- ============================================================================
-- STEP 3: Clear cache for all users (optional - only if needed)
-- ============================================================================
-- WARNING: This will clear ALL summary_min cache entries for ALL users
-- Only run this if you want to force fresh data for everyone
-- Uncomment to run:
/*
DELETE FROM context_cache 
WHERE cache_key LIKE 'summary_min%';

SELECT '✅ Cache cleared for all users' as result;
*/

-- ============================================================================
-- STEP 4: Clear cache for specific user (safer option)
-- ============================================================================
-- Replace 'YOUR_USER_ID' with actual user_id
-- Uncomment to run:
/*
DELETE FROM context_cache 
WHERE user_id = 'YOUR_USER_ID'::uuid
AND cache_key LIKE 'summary_min%';

SELECT '✅ Cache cleared for user' as result;
*/

-- ============================================================================
-- STEP 5: Check current cache entries
-- ============================================================================
SELECT 
  cache_key,
  user_id,
  created_at,
  expires_at,
  CASE 
    WHEN expires_at > NOW() THEN '✅ Valid (not expired)'
    ELSE '⏰ Expired'
  END as cache_status,
  EXTRACT(EPOCH FROM (expires_at - NOW())) / 60 as minutes_until_expiry
FROM context_cache 
WHERE cache_key LIKE 'summary_min%'
ORDER BY created_at DESC
LIMIT 10;
