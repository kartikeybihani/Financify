ALTER TABLE public.chat_sessions
ADD COLUMN IF NOT EXISTS last_turn_meta jsonb,
ADD COLUMN IF NOT EXISTS last_finance_turn_meta jsonb;

COMMENT ON COLUMN public.chat_sessions.last_turn_meta IS
'Stores the latest assistant turn metadata used for continuity routing in Finny.';

COMMENT ON COLUMN public.chat_sessions.last_finance_turn_meta IS
'Stores the latest finance-advice turn metadata used as a continuity fallback for Finny.';
