-- Add goal_created column to onboarding_progress table
ALTER TABLE public.onboarding_progress
ADD COLUMN IF NOT EXISTS goal_created boolean NOT NULL DEFAULT false;
