-- Add column to track when user clicks "Skip: Checkout demo" on onboarding-connect screen
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS skipped_to_demo_at timestamp with time zone;

COMMENT ON COLUMN public.profiles.skipped_to_demo_at IS 'When the user clicked the skip/checkout demo button during bank connection onboarding';
