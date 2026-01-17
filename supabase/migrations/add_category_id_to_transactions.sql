-- Migration: Add category_id column to transactions table
-- This allows transactions to reference categories by ID instead of name,
-- making category name changes seamless without updating all transactions.

-- Step 1: Add category_id column (nullable initially for backfill)
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS category_id uuid;

-- Step 2: Add foreign key constraint
ALTER TABLE public.transactions
ADD CONSTRAINT transactions_category_id_fkey 
FOREIGN KEY (category_id) REFERENCES public.categories(id)
ON DELETE SET NULL;

-- Step 3: Add index for performance
CREATE INDEX IF NOT EXISTS idx_transactions_category_id 
ON public.transactions(category_id) 
WHERE category_id IS NOT NULL;

-- Step 4: Add unique constraint on (user_id, name) for categories to prevent duplicates
-- This ensures users can't create two categories with the same name
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_id_name_unique 
ON public.categories(user_id, LOWER(TRIM(name)))
WHERE is_active = true;

-- Note: Backfill script will be run separately to populate category_id for existing transactions
