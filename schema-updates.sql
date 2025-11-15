-- ============================================================================
-- Schema Updates for Recurring Transaction Categorization
-- ============================================================================
-- Purpose: Add indexes for performance optimization
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================================

-- Add index on recurring_stream_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_stream_id 
ON transactions(recurring_stream_id) 
WHERE recurring_stream_id IS NOT NULL;

-- Add index on if_recurring for filtering
CREATE INDEX IF NOT EXISTS idx_transactions_if_recurring 
ON transactions(if_recurring) 
WHERE if_recurring = 'yes';

-- Add composite index for user + recurring queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_recurring 
ON transactions(user_id, recurring_stream_id) 
WHERE recurring_stream_id IS NOT NULL;

-- Add index on recurring_streams.stream_id for joins (if not exists)
CREATE INDEX IF NOT EXISTS idx_recurring_streams_stream_id 
ON recurring_streams(stream_id);

-- Add index on recurring_streams for active streams
CREATE INDEX IF NOT EXISTS idx_recurring_streams_active 
ON recurring_streams(user_id, is_active) 
WHERE is_active = true;

-- Add index on transactions.new_category for filtering
CREATE INDEX IF NOT EXISTS idx_transactions_new_category 
ON transactions(new_category) 
WHERE new_category IS NOT NULL;