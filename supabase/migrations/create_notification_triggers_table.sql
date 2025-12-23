-- Create notification_triggers table
CREATE TABLE IF NOT EXISTS public.notification_triggers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type = ANY (ARRAY[
    'paycheck'::text,
    'money_received'::text,
    'spending_spike'::text,
    'spending_drought'::text,
    'weekly_summary'::text,
    'goal_milestone'::text,
    'custom'::text
  ])),
  trigger_metadata jsonb DEFAULT '{}'::jsonb,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY[
    'pending'::text,
    'sent'::text,
    'skipped'::text,
    'expired'::text
  ])),
  priority integer NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  cooldown_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notification_triggers_pkey PRIMARY KEY (id),
  CONSTRAINT notification_triggers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_triggers_user_status 
  ON public.notification_triggers(user_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_triggers_pending 
  ON public.notification_triggers(user_id, status) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_triggers_type 
  ON public.notification_triggers(user_id, trigger_type, detected_at DESC);

-- RLS Policy
ALTER TABLE public.notification_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification triggers"
  ON public.notification_triggers
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification triggers"
  ON public.notification_triggers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification triggers"
  ON public.notification_triggers
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_notification_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notification_triggers_updated_at
  BEFORE UPDATE ON public.notification_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_triggers_updated_at();

