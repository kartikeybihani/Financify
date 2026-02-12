-- Add user_dismissed flag to recurring_streams
-- When true, the stream is hidden from the Recurring section and future Plaid syncs
-- will NOT re-apply recurring status to its transactions
ALTER TABLE public.recurring_streams
ADD COLUMN IF NOT EXISTS user_dismissed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.recurring_streams.user_dismissed IS 'When true, user has explicitly removed this stream from recurring - hide it and do not re-apply recurring to its transactions on sync';

-- Allow users to dismiss (update user_dismissed) their own recurring streams
DROP POLICY IF EXISTS "Users can dismiss their own recurring streams" ON public.recurring_streams;
CREATE POLICY "Users can dismiss their own recurring streams"
  ON public.recurring_streams
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
