-- ============================================================================
-- Backfill: Set if_recurring = 'yes' for all Subscriptions
-- ============================================================================
-- Purpose: Mark all transactions in "Subscriptions" category as recurring
--          This ensures subscriptions show the recurring chip automatically
-- Safe to run multiple times (idempotent)
-- ============================================================================

-- Update transactions where new_category = 'Subscriptions' to set if_recurring = 'yes'
-- Only update if not already set to 'yes' (idempotent)
UPDATE transactions
SET if_recurring = 'yes'
WHERE new_category = 'Subscriptions'
  AND if_recurring != 'yes';

-- Also update transactions where top_category = 'Subscriptions' 
-- (for transactions that don't have new_category set yet)
-- Only update if not already set to 'yes' and new_category is NULL
UPDATE transactions
SET if_recurring = 'yes'
WHERE top_category = 'Subscriptions'
  AND (new_category IS NULL OR new_category != 'Subscriptions')
  AND if_recurring != 'yes';

-- ============================================================================
-- Verification Query (run after backfill to check results)
-- ============================================================================
-- SELECT 
--   COUNT(*) as total_subscriptions,
--   COUNT(*) FILTER (WHERE if_recurring = 'yes') as marked_recurring,
--   COUNT(*) FILTER (WHERE if_recurring != 'yes') as not_marked
-- FROM transactions
-- WHERE new_category = 'Subscriptions' OR top_category = 'Subscriptions';
-- ============================================================================

