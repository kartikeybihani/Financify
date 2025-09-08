-- Goals Table Creation and RLS Policies
-- Execute these commands in your Supabase SQL editor

-- Create the goals table
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  note text CHECK (char_length(note) <= 350), -- ~50 words limit
  target_amount decimal(12,1) NOT NULL CHECK (target_amount > 0),
  current_amount decimal(12,1) DEFAULT 0.0 CHECK (current_amount >= 0),
  target_date date NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'emergency_fund',
    'vacation',
    'car',
    'house_down_payment',
    'education',
    'retirement',
    'wedding',
    'debt_payoff',
    'investment',
    'other'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_goals_user_id ON public.goals(user_id);
CREATE INDEX idx_goals_status ON public.goals(status);
CREATE INDEX idx_goals_category ON public.goals(category);
CREATE INDEX idx_goals_target_date ON public.goals(target_date);
CREATE INDEX idx_goals_user_status ON public.goals(user_id, status); -- Composite index for common queries

-- Enable RLS
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own goals" ON public.goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own goals" ON public.goals
  FOR INSERT WITH CHECK (
    auth.uid() = user_id 
    AND target_date > CURRENT_DATE -- Ensure target date is in the future
  );

CREATE POLICY "Users can update their own goals" ON public.goals
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (target_date > CURRENT_DATE OR status = 'completed') -- Allow past dates only for completed goals
  );

CREATE POLICY "Users can delete their own goals" ON public.goals
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_goals_updated_at 
    BEFORE UPDATE ON public.goals 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comments
COMMENT ON TABLE public.goals IS 'User financial goals with progress tracking';
COMMENT ON COLUMN public.goals.note IS 'Optional note limited to ~50 words (350 characters)';
COMMENT ON COLUMN public.goals.target_amount IS 'Target amount with 1 decimal place precision';
COMMENT ON COLUMN public.goals.current_amount IS 'Current progress amount with 1 decimal place precision';
COMMENT ON COLUMN public.goals.category IS 'Predefined goal categories with other option for custom';
COMMENT ON COLUMN public.goals.status IS 'Goal status: active, paused, or completed';
