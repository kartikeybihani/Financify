-- Create onboarding_progress table
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  accounts_connected boolean NOT NULL DEFAULT false,
  budget_setup boolean NOT NULL DEFAULT false,
  finny_asked boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT onboarding_progress_pkey PRIMARY KEY (id),
  CONSTRAINT onboarding_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_id 
  ON public.onboarding_progress(user_id);

-- RLS Policies
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own onboarding progress"
  ON public.onboarding_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own onboarding progress"
  ON public.onboarding_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own onboarding progress"
  ON public.onboarding_progress
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_onboarding_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_progress_updated_at();
