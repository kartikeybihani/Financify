-- Add prompt_used to conversation_logs to store the full prompt sent to the LLM
ALTER TABLE public.conversation_logs
ADD COLUMN IF NOT EXISTS prompt_used text;

COMMENT ON COLUMN public.conversation_logs.prompt_used IS 'Stores the full prompt (messages array as JSON) sent to the LLM for this conversation turn. Used for debugging and analysis.';
