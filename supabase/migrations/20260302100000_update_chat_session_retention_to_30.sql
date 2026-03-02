-- Keep the most recent 30 chat sessions per user instead of 5.
-- This function is called from the client when a new chat session is created.

CREATE INDEX IF NOT EXISTS chat_sessions_user_updated_at_idx
ON public.chat_sessions (user_id, updated_at DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.save_chat_session(
  p_user_id uuid,
  p_session_title text,
  p_first_message text,
  p_messages jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  INSERT INTO public.chat_sessions (
    user_id,
    session_title,
    first_message,
    messages
  )
  VALUES (
    p_user_id,
    COALESCE(NULLIF(BTRIM(p_session_title), ''), 'Chat'),
    COALESCE(p_first_message, ''),
    COALESCE(p_messages, '[]'::jsonb)
  )
  RETURNING id INTO v_session_id;

  DELETE FROM public.chat_sessions
  WHERE user_id = p_user_id
    AND id <> v_session_id
    AND id NOT IN (
      SELECT id
      FROM (
        SELECT id, updated_at, created_at
        FROM public.chat_sessions
        WHERE user_id = p_user_id
          AND updated_at > created_at
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 30
      ) AS completed_sessions
    );

  RETURN v_session_id;
END;
$$;
