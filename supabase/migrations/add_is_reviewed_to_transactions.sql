-- Migration: Add is_reviewed column to transactions table
-- This allows users to review and verify transactions, improving categorization accuracy

-- Step 1: Add is_reviewed column (default false for all existing and new transactions)
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS is_reviewed boolean NOT NULL DEFAULT false;

-- Step 2: Add index for performance (filtering unreviewed transactions)
CREATE INDEX IF NOT EXISTS idx_transactions_user_unreviewed 
ON public.transactions(user_id, is_reviewed, inserted_at DESC) 
WHERE is_reviewed = false;

-- Step 3: Add index for date-based queries (for showing only recent unreviewed transactions)
CREATE INDEX IF NOT EXISTS idx_transactions_user_unreviewed_date 
ON public.transactions(user_id, date DESC, inserted_at DESC) 
WHERE is_reviewed = false;

-- Note: All existing transactions will default to is_reviewed = false
-- New transactions from Plaid sync will also default to is_reviewed = false
