-- Add chat_id to conversation_logs so recent conversation turns can be scoped to the current chat session.
-- This prevents cross-session leakage when building the LLM prompt.

ALTER TABLE public.conversation_logs
ADD COLUMN IF NOT EXISTS chat_id text;

-- Index to speed up chat-scoped lookups
CREATE INDEX IF NOT EXISTS conversation_logs_user_chat_ts_idx
ON public.conversation_logs (user_id, chat_id, timestamp DESC);
