-- Add base_analysis column to profiles table
-- This stores the account completeness analysis result from the LLM

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS base_analysis jsonb DEFAULT NULL;

-- Add comment to document the column
COMMENT ON COLUMN public.profiles.base_analysis IS 'Stores the account completeness analysis result from LLM. Contains should_ask_for_more_accounts, message, and reasoning fields.';
