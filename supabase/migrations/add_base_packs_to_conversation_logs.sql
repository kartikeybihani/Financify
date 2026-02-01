-- Add base_packs and classification_details columns to conversation_logs table
-- These store what data Finny had access to and how the message was classified

ALTER TABLE public.conversation_logs
ADD COLUMN IF NOT EXISTS base_packs JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS classification_details JSONB DEFAULT NULL;

-- Add comments explaining the columns
COMMENT ON COLUMN public.conversation_logs.base_packs IS 'Stores the base context packs data that Finny had access to when generating the response. Includes summary data like netWorth, accounts, transactions, etc.';

COMMENT ON COLUMN public.conversation_logs.classification_details IS 'Stores the complete classification result including intent, confidence, decision_risk, data_requirements, emotional_state, and other classification metadata used to route and process the user message.';
