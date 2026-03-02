CREATE TABLE IF NOT EXISTS public.chat_ai_consents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_key text NOT NULL,
  accepted boolean NOT NULL DEFAULT true,
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'chat_privacy_sheet',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_ai_consents_pkey PRIMARY KEY (id),
  CONSTRAINT chat_ai_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT chat_ai_consents_user_key_unique UNIQUE (user_id, consent_key)
);

CREATE INDEX IF NOT EXISTS idx_chat_ai_consents_user_id
  ON public.chat_ai_consents(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_ai_consents_user_key
  ON public.chat_ai_consents(user_id, consent_key);

ALTER TABLE public.chat_ai_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat ai consents"
  ON public.chat_ai_consents
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat ai consents"
  ON public.chat_ai_consents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat ai consents"
  ON public.chat_ai_consents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_chat_ai_consents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_ai_consents_updated_at
  BEFORE UPDATE ON public.chat_ai_consents
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_ai_consents_updated_at();
